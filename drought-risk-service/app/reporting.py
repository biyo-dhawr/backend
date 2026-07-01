from __future__ import annotations

import json
import os
from typing import Any

import httpx
from fastapi import HTTPException


GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"
DEFAULT_GROQ_MODEL = "llama-3.1-8b-instant"


REPORT_KEYS = {
    "title": "Water source assessment",
    "executiveSummary": "",
    "riskLevel": "Medium",
    "currentCondition": "",
    "mainConcerns": [],
    "supportingEvidence": [],
    "recommendedActions": [],
    "maintenancePriority": "Routine",
    "communityImpact": "",
    "dataLimitations": [],
}


def _json_default(value: Any) -> str:
    return str(value)


def _build_messages(context: dict[str, Any]) -> list[dict[str, str]]:
    context_json = json.dumps(context, default=_json_default, ensure_ascii=True)
    return [
        {
            "role": "system",
            "content": (
                "You are a water infrastructure analyst for drought-prone "
                "communities. Generate practical, evidence-based reports from "
                "the supplied JSON only. Do not invent facts. Return valid JSON "
                "only."
            ),
        },
        {
            "role": "user",
            "content": (
                "Analyze this individual water source and return exactly this "
                "JSON shape: "
                '{"title": string, "executiveSummary": string, '
                '"riskLevel": "Low|Medium|High|Severe", '
                '"currentCondition": string, "mainConcerns": string[], '
                '"supportingEvidence": string[], "recommendedActions": string[], '
                '"maintenancePriority": string, "communityImpact": string, '
                '"dataLimitations": string[]}. '
                "Keep each list to 3-5 items and make recommendations specific "
                f"to the data. Source context: {context_json}"
            ),
        },
    ]


def _parse_json_object(content: str) -> dict[str, Any]:
    try:
        parsed = json.loads(content)
    except json.JSONDecodeError:
        start = content.find("{")
        end = content.rfind("}")
        if start == -1 or end == -1 or end <= start:
            raise HTTPException(
                status_code=502,
                detail="Groq returned a non-JSON report response",
            )
        parsed = json.loads(content[start : end + 1])

    if not isinstance(parsed, dict):
        raise HTTPException(
            status_code=502,
            detail="Groq returned an invalid report payload",
        )

    return parsed


def _normalize_report(report: dict[str, Any]) -> dict[str, Any]:
    normalized = {**REPORT_KEYS, **report}
    valid_risk_levels = {"Low", "Medium", "High", "Severe"}

    if normalized["riskLevel"] not in valid_risk_levels:
        normalized["riskLevel"] = "Medium"

    for key in [
        "mainConcerns",
        "supportingEvidence",
        "recommendedActions",
        "dataLimitations",
    ]:
        value = normalized.get(key)
        if not isinstance(value, list):
            normalized[key] = []
        else:
            normalized[key] = [str(item) for item in value[:6]]

    for key in [
        "title",
        "executiveSummary",
        "currentCondition",
        "maintenancePriority",
        "communityImpact",
    ]:
        normalized[key] = str(normalized.get(key) or REPORT_KEYS[key])

    return normalized


def generate_source_report(context: dict[str, Any]) -> dict[str, Any]:
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=503,
            detail="GROQ_API_KEY is not configured for report generation",
        )

    payload = {
        "model": os.getenv("GROQ_MODEL", DEFAULT_GROQ_MODEL),
        "messages": _build_messages(context),
        "temperature": 0.2,
        "max_completion_tokens": int(os.getenv("SOURCE_REPORT_MAX_TOKENS", "1200")),
        "response_format": {"type": "json_object"},
    }

    try:
        with httpx.Client(
            timeout=float(os.getenv("GROQ_TIMEOUT_SECONDS", "45")),
            headers={
                "User-Agent": "ogaal-drought-risk-service/1.0",
                "Accept": "application/json",
            },
        ) as client:
            response = client.post(
                GROQ_API_URL,
                json=payload,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
            )
            response.raise_for_status()
            raw_response = response.json()
    except httpx.HTTPStatusError as exc:
        detail = exc.response.text
        try:
            error_payload = exc.response.json()
            detail = (
                error_payload.get("error", {}).get("message")
                or error_payload.get("detail")
                or detail
            )
        except ValueError:
            pass

        raise HTTPException(
            status_code=502,
            detail=f"Groq request failed: {detail}",
        ) from exc
    except httpx.TimeoutException as exc:
        raise HTTPException(status_code=504, detail="Groq request timed out") from exc
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Groq request failed: {exc}",
        ) from exc

    content = (
        raw_response.get("choices", [{}])[0]
        .get("message", {})
        .get("content", "")
    )
    return _normalize_report(_parse_json_object(content))
