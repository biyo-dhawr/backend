from __future__ import annotations

from typing import Any


RISK_LEVELS = ("Low", "Medium", "High", "Severe")


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
