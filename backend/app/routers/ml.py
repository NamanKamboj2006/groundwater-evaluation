"""
Machine Learning API Endpoints for Groundwater Anomaly Detection.

Provides access to:
- Model metadata, training parameters, and evaluation summaries.
- Overall anomaly statistics and district breakdown.
- Paginated, filterable anomaly records across all monitoring stations.
- Station-specific chronological anomaly evaluations.
"""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.station import Station
from app.schemas.ml import (
    ModelInfoResponse,
    AnomalySummaryResponse,
    MLAnomaliesListResponse,
    StationMLAnomalyResponse,
)
from app.services.ml_anomaly_service import (
    get_model_info_service,
    get_anomaly_summary_service,
    get_anomalies_list_service,
    get_station_ml_anomalies_service,
)

router = APIRouter(prefix="/api/ml", tags=["Machine Learning"])


@router.get(
    "/model-info",
    response_model=ModelInfoResponse,
    summary="Get ML Anomaly Model Information",
    description="Returns metadata, hyperparameters, training window, and proxy evaluation summary for the trained anomaly detection model.",
)
def get_model_info():
    """
    Retrieve machine learning model metadata and training parameters.
    """
    return get_model_info_service()


@router.get(
    "/anomalies/summary",
    response_model=AnomalySummaryResponse,
    summary="Get ML Anomaly Dataset Summary",
    description="Returns high-level summary of detected groundwater anomalies, percentage distribution, baseline overlap, and district breakdown.",
)
def get_anomaly_summary(db: Session = Depends(get_db)):
    """
    Retrieve high-level summary of groundwater anomalies detected across the state.
    """
    return get_anomaly_summary_service(db)


@router.get(
    "/anomalies",
    response_model=MLAnomaliesListResponse,
    summary="List Station-Month ML Anomalies",
    description="Returns paginated and filterable list of scored station-month records with anomaly indicators and interpretable context.",
)
def get_anomalies(
    district: Optional[str] = Query(None, description="Filter by district name (case-insensitive)"),
    min_score: float = Query(0.0, ge=0.0, le=1.0, description="Minimum calibrated anomaly score filter"),
    is_anomaly_only: bool = Query(True, description="Filter only records flagged as potential anomalies"),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(50, ge=1, le=500, description="Records per page"),
    db: Session = Depends(get_db),
):
    """
    Query station-month anomaly records with optional district and score filtering.
    """
    return get_anomalies_list_service(
        db=db,
        district=district,
        min_score=min_score,
        is_anomaly_only=is_anomaly_only,
        page=page,
        page_size=page_size,
    )


@router.get(
    "/stations/{station_id}/anomalies",
    response_model=StationMLAnomalyResponse,
    summary="Get Station-Specific ML Anomaly Timeline",
    description="Returns full chronological anomaly evaluation and score timeline for an individual monitoring station.",
)
def get_station_anomalies(
    station_id: int,
    db: Session = Depends(get_db),
):
    """
    Retrieve chronological machine learning anomaly evaluation records for a single station.
    """
    station_exists = db.query(Station).filter(Station.id == station_id).first()
    if not station_exists:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Station with ID {station_id} not found.",
        )

    result = get_station_ml_anomalies_service(db=db, station_id=station_id)
    if not result:
        # Station exists in DB but had 0 valid observations to evaluate
        return StationMLAnomalyResponse(
            station_id=station_id,
            station_name=station_exists.station_name,
            district=station_exists.district,
            total_months_evaluated=0,
            anomaly_months_count=0,
            highest_anomaly_score=0.0,
            records=[],
        )

    return result


# ==========================================
# GROUNDWATER LEVEL PREDICTION ENDPOINTS
# ==========================================

from app.schemas.ml import (
    PredictionModelInfoResponse,
    StationPredictionResponse,
)
from app.services.ml_prediction_service import (
    get_prediction_model_info_service,
    get_station_prediction_service,
)


@router.get(
    "/prediction/model-info",
    response_model=PredictionModelInfoResponse,
    summary="Get Groundwater Prediction Model Information",
    description="Returns training parameters, features, and comparative evaluation metrics (MAE, RMSE, R²) against the Naive Persistence baseline for the HistGradientBoostingRegressor model.",
)
def get_prediction_model_info():
    """
    Retrieve prediction model metadata, features, and comparative performance.
    """
    return get_prediction_model_info_service()


@router.get(
    "/prediction/stations/{station_id}",
    response_model=StationPredictionResponse,
    summary="Get Next-Month Groundwater Prediction for Station",
    description="Forecasts next-month groundwater level for a single station using historical telemetry observations and HistGradientBoostingRegressor.",
)
def get_station_prediction(
    station_id: int,
    db: Session = Depends(get_db),
):
    """
    Generate next-month groundwater prediction for the specified monitoring station.
    """
    prediction = get_station_prediction_service(db=db, station_id=station_id)
    if prediction is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Station with ID {station_id} not found.",
        )
    return prediction
