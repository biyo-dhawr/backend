from __future__ import annotations

from typing import Any
import math


RISK_LEVELS = ("Low", "Medium", "High", "Severe")
FAILURE_WATER_LEVEL = 10.0
DEPLETION_RATES_BY_TYPE = {
    "borehole": 1.2,
    "dam": 2.0,
    "dug well": 1.8,
    "shallow well": 2.5,
    "berkad": 2.2,
    "well": 1.8,
}


def clamp(value: float, minimum: float = 0.0, maximum: float = 1.0) -> float:
    return max(minimum, min(maximum, value))


def risk_level(score: float) -> str:
    if score >= 0.81:
        return "Severe"
    if score >= 0.61:
        return "High"
    if score >= 0.31:
        return "Medium"
    return "Low"


def current_level_bias(level: str | None) -> float:
    weights = {
        "low": 0.05,
        "medium": 0.18,
        "high": 0.35,
        "severe": 0.5,
    }
    return weights.get((level or "").lower(), 0.05)


def normalize_status(status: str | None) -> str:
    return (status or "").strip().lower()


def source_depletion_rate(source_type: str | None) -> float:
    source_type_key = (source_type or "").strip().lower()
    return DEPLETION_RATES_BY_TYPE.get(source_type_key, 1.8)


def source_operational_status(priority_score: float, status: str | None) -> str:
    normalized = normalize_status(status)
    if normalized in {"broken", "critical", "non-functional", "non functional"}:
        return "Failed"
    if priority_score >= 75:
        return "Critical"
    if priority_score >= 55:
        return "At Risk"
    if priority_score >= 30:
        return "Watch"
    return "Healthy"


def source_risk_level(priority_score: float, status: str | None) -> str:
    normalized = normalize_status(status)
    if normalized in {"broken", "critical", "non-functional", "non functional"}:
        return "Severe"
    if priority_score >= 75:
        return "Severe"
    if priority_score >= 55:
        return "High"
    if priority_score >= 30:
        return "Medium"
    return "Low"


def drought_multiplier(level: str | None) -> float:
    return {
        "low": 1.0,
        "medium": 1.1,
        "high": 1.25,
        "severe": 1.4,
    }.get((level or "").strip().lower(), 1.0)


def calculate_water_source_intelligence(features: dict[str, Any]) -> dict[str, Any]:
    source_id = int(features["waterSourceId"])
    source_type = features.get("type")
    status = features.get("status")
    normalized_status = normalize_status(status)
    water_level = features.get("waterLevel")
    recent_reports_7_days = max(int(features.get("recentReportCount7Days") or 0), 0)
    recent_reports_30_days = max(int(features.get("recentReportCount30Days") or 0), 0)
    high_severity_reports = max(int(features.get("highSeverityReportCount30Days") or 0), 0)
    verified_reports = max(int(features.get("verifiedReportCount30Days") or 0), 0)
    days_since_maintenance = features.get("daysSinceMaintenance")
    village_risk = features.get("villageDroughtRiskLevel")

    reasons: list[str] = []
    recommendations: list[str] = []
    status_pressure = 0.0

    if normalized_status in {"broken", "critical", "non-functional", "non functional"}:
        status_pressure = 1.0
        reasons.append("Water source is already marked as failed or critical.")
        recommendations.append("Dispatch repair or verification team immediately.")
    elif normalized_status in {"needed maintenance", "needs maintenance", "maintenance"}:
        status_pressure = 0.45
        reasons.append("Water source is marked as needing maintenance.")
        recommendations.append("Schedule maintenance inspection within 7 days.")
    elif normalized_status in {"working", "operational"}:
        status_pressure = 0.05
    elif normalized_status:
        status_pressure = 0.2
        reasons.append("Water source status is not clearly healthy.")

    if water_level is None:
        water_pressure = 0.35
        estimated_failure_days = None
        reasons.append("Water level is missing, so failure countdown is less certain.")
        recommendations.append("Verify current water level manually.")
    else:
        level = clamp(float(water_level), 0.0, 100.0)
        water_pressure = clamp((55.0 - level) / 55.0)

        base_depletion_rate = source_depletion_rate(source_type)
        report_multiplier = 1.0 + min(recent_reports_7_days, 5) * 0.06 + min(high_severity_reports, 4) * 0.1
        status_multiplier = 1.35 if status_pressure >= 0.45 else 1.0
        adjusted_depletion_rate = base_depletion_rate * report_multiplier * status_multiplier * drought_multiplier(village_risk)

        if normalized_status in {"broken", "critical", "non-functional", "non functional"}:
            estimated_failure_days = 0
        elif level <= FAILURE_WATER_LEVEL:
            estimated_failure_days = 0
            reasons.append("Water level is already at or below the failure threshold.")
            recommendations.append("Prepare emergency water support for affected users.")
        else:
            estimated_failure_days = int(math.ceil((level - FAILURE_WATER_LEVEL) / adjusted_depletion_rate))

        if level < 20:
            reasons.append("Water level is critically low.")
            recommendations.append("Inspect within 24 hours and prepare backup access.")
        elif level < 35:
            reasons.append("Water level is below the watch threshold.")
            recommendations.append("Monitor water level and community reports closely.")

    report_pressure = clamp(
        (recent_reports_30_days / 8.0) * 0.35
        + (recent_reports_7_days / 4.0) * 0.25
        + (high_severity_reports / 3.0) * 0.35
        + (verified_reports / 4.0) * 0.2
    )
    if high_severity_reports:
        reasons.append("Recent high-severity reports are linked to this water source.")
        recommendations.append("Review recent reports before closing maintenance work.")
    elif recent_reports_7_days >= 2:
        reasons.append("Recent reports indicate possible service deterioration.")

    maintenance_pressure = 0.0
    if days_since_maintenance is None:
        maintenance_pressure = 0.15
    else:
        days_since_maintenance = max(int(days_since_maintenance), 0)
        maintenance_pressure = clamp(days_since_maintenance / 365.0)
        if days_since_maintenance >= 180:
            reasons.append("Water source has not been maintained recently.")
            recommendations.append("Schedule preventive maintenance.")

    village_pressure = current_level_bias(village_risk)
    priority_score = clamp(
        water_pressure * 0.35
        + status_pressure * 0.25
        + report_pressure * 0.2
        + maintenance_pressure * 0.1
        + village_pressure * 0.1
    ) * 100.0

    if not recommendations:
        recommendations.append("Continue routine monitoring.")
    if not reasons:
        reasons.append("Current source indicators are stable.")

    operational_status = source_operational_status(priority_score, status)

    if estimated_failure_days is not None and estimated_failure_days <= 7 and operational_status != "Failed":
        recommendations.insert(0, "Prioritize this source for field inspection this week.")

    return {
        "waterSourceId": source_id,
        "operationalStatus": operational_status,
        "riskLevel": source_risk_level(priority_score, status),
        "estimatedFailureInDays": estimated_failure_days,
        "priorityScore": round(priority_score, 2),
        "failureThresholdWaterLevel": FAILURE_WATER_LEVEL,
        "reasons": reasons,
        "recommendations": recommendations,
        "topReason": reasons[0],
    }


def score_village(features: dict[str, Any]) -> dict[str, Any]:
    total_sources = max(int(features.get("totalSources") or 0), 0)
    working_sources = max(int(features.get("workingSources") or 0), 0)
    broken_sources = max(int(features.get("brokenSources") or 0), 0)
    maintenance_sources = max(int(features.get("maintenanceSources") or 0), 0)
    low_water_source_count = max(int(features.get("lowWaterSourceCount") or 0), 0)
    recent_reports = max(int(features.get("recentReportCount30Days") or 0), 0)
    recent_reports_7_days = max(int(features.get("recentReportCount7Days") or 0), 0)
    high_severity_reports = max(int(features.get("highSeverityReportCount30Days") or 0), 0)
    verified_reports = max(int(features.get("verifiedReportCount30Days") or 0), 0)
    avg_water_level = features.get("avgWaterLevel")
    min_water_level = features.get("minWaterLevel")

    if total_sources:
        broken_ratio = broken_sources / total_sources
        maintenance_ratio = maintenance_sources / total_sources
        low_water_ratio = low_water_source_count / total_sources
        working_ratio = working_sources / total_sources
    else:
        broken_ratio = 0.0
        maintenance_ratio = 0.0
        low_water_ratio = 0.0
        working_ratio = 0.0

    avg_water_pressure = 0.35
    if avg_water_level is not None:
        avg_water_pressure = clamp((55.0 - float(avg_water_level)) / 55.0)

    min_water_pressure = 0.0
    if min_water_level is not None:
        min_water_pressure = clamp((30.0 - float(min_water_level)) / 30.0)

    infrastructure_pressure = clamp(
        broken_ratio * 0.75 + maintenance_ratio * 0.35 + low_water_ratio * 0.45
    )
    report_pressure = clamp(
        (recent_reports / 12.0) * 0.45
        + (recent_reports_7_days / 5.0) * 0.25
        + (high_severity_reports / 4.0) * 0.4
        + (verified_reports / 6.0) * 0.2
    )
    water_pressure = clamp(avg_water_pressure * 0.75 + min_water_pressure * 0.25)
    baseline_pressure = current_level_bias(features.get("currentRiskLevel"))
    resilience_credit = working_ratio * 0.12

    score = clamp(
        water_pressure * 0.38
        + infrastructure_pressure * 0.28
        + report_pressure * 0.24
        + baseline_pressure * 0.10
        - resilience_credit
    )

    reasons: list[str] = []
    if avg_water_level is not None and float(avg_water_level) < 45:
        reasons.append("Average water level is below the drought watch threshold.")
    if min_water_level is not None and float(min_water_level) < 20:
        reasons.append("At least one water source is critically low.")
    if broken_ratio >= 0.25:
        reasons.append("A significant share of water sources are broken.")
    if maintenance_ratio >= 0.25:
        reasons.append("Many water sources need maintenance.")
    if high_severity_reports:
        reasons.append("Recent high-severity community reports indicate worsening access.")
    if recent_reports_7_days >= 3:
        reasons.append("Reports increased during the last 7 days.")
    if not reasons:
        reasons.append("Current water-source and report signals are stable.")

    data_points = total_sources + recent_reports
    confidence = clamp(0.45 + min(data_points, 20) / 40.0)
    if total_sources == 0:
        confidence = min(confidence, 0.55)

    return {
        "villageId": int(features["villageId"]),
        "droughtRisk": round(score, 4),
        "predictedLevel": risk_level(score),
        "confidenceScore": round(confidence, 4),
        "reasons": reasons,
    }
