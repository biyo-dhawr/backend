import os
from typing import Annotated, Optional

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

from .scoring import score_village


SERVICE_TOKEN = os.getenv("RISK_SERVICE_TOKEN")

app = FastAPI(title="Drought Risk Service", version="1.0.0")


class VillageFeatures(BaseModel):
    villageId: int
    villageName: Optional[str] = None
    totalSources: int = Field(default=0, ge=0)
    workingSources: int = Field(default=0, ge=0)
    brokenSources: int = Field(default=0, ge=0)
    maintenanceSources: int = Field(default=0, ge=0)
    avgWaterLevel: Optional[float] = None
    minWaterLevel: Optional[float] = None
    lowWaterSourceCount: int = Field(default=0, ge=0)
    recentReportCount7Days: int = Field(default=0, ge=0)
    recentReportCount30Days: int = Field(default=0, ge=0)
    highSeverityReportCount30Days: int = Field(default=0, ge=0)
    verifiedReportCount30Days: int = Field(default=0, ge=0)
    currentRiskLevel: Optional[str] = None


class BatchPredictionRequest(BaseModel):
    villages: list[VillageFeatures]


class PredictionResult(BaseModel):
    villageId: int
    droughtRisk: float
    predictedLevel: str
    confidenceScore: float
    reasons: list[str]


def require_token(x_internal_token: Optional[str]) -> None:
    if SERVICE_TOKEN and x_internal_token != SERVICE_TOKEN:
        raise HTTPException(status_code=401, detail="Invalid service token")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/predict/drought/batch", response_model=list[PredictionResult])
def predict_drought_batch(
    payload: BatchPredictionRequest,
    x_internal_token: Annotated[Optional[str], Header()] = None,
) -> list[dict]:
    require_token(x_internal_token)
    return [score_village(village.model_dump()) for village in payload.villages]
