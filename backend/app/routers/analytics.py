from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.analytics import (
    StationTrendPointResponse,
    GroundwaterTrendResponse,
    GroundwaterTrendAnalysisResponse,
    StationGroundwaterTrendResponse,
    StationGroundwaterTrendAnalysisResponse,
    StationDataQualityResponse,
    StationAnomalyResponse,
    DistrictSummaryItem,
    DistrictComparisonResponse,
    DistrictGroundwaterTrendResponse,
    DistrictGroundwaterTrendAnalysisResponse,
)
from app.services.analytics_service import (
    get_station_trend,
    get_groundwater_trend,
    get_groundwater_trend_analysis,
    get_station_groundwater_trend,
    get_station_groundwater_trend_analysis,
    get_station_data_quality,
    get_station_anomalies,
    get_districts_summary,
    get_district_summary,
    get_district_groundwater_trend,
    get_district_groundwater_trend_analysis,
    get_district_comparison,
)

router = APIRouter(
    prefix="/api/analytics",
    tags=["Analytics"],
)


@router.get(
    "/groundwater-trend",
    response_model=GroundwaterTrendResponse,
    summary="Get monthly groundwater level trend",
    description="Retrieve chronological monthly average groundwater levels aggregated across all valid DWLR observations in PostgreSQL.",
)
def retrieve_groundwater_trend(
    db: Session = Depends(get_db),
) -> GroundwaterTrendResponse:
    """
    Fetch monthly aggregated groundwater level time-series for the entire network.
    """
    return get_groundwater_trend(db=db)


@router.get(
    "/groundwater-trend-analysis",
    response_model=GroundwaterTrendAnalysisResponse,
    summary="Get statistical groundwater trend analysis",
    description="Calculate statistical linear regression slope, direction, strength, and period metrics for monthly valid groundwater level observations.",
)
def retrieve_groundwater_trend_analysis(
    db: Session = Depends(get_db),
) -> GroundwaterTrendAnalysisResponse:
    """
    Fetch statistical trend metrics (linear regression slope, direction, strength, total change).
    """
    analysis = get_groundwater_trend_analysis(db=db)
    if analysis is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Insufficient groundwater trend data available for statistical analysis."
        )
    return analysis


# ─── District Analytics ────────────────────────────────────────────────────────

@router.get(
    "/districts",
    response_model=List[DistrictSummaryItem],
    summary="Get summary analytics for all districts",
    description="Retrieve monitoring stations count, observations breakdown, and valid groundwater level statistics for each district.",
)
def retrieve_districts_summary(
    db: Session = Depends(get_db),
) -> List[DistrictSummaryItem]:
    """
    Fetch summary metrics for all monitoring districts.
    """
    return get_districts_summary(db=db)


@router.get(
    "/district-comparison",
    response_model=DistrictComparisonResponse,
    summary="Get comparative analytics and trend rates across districts",
    description="Compare monitoring density, average groundwater levels, and linear regression trend rates across all districts.",
)
def retrieve_district_comparison(
    db: Session = Depends(get_db),
) -> DistrictComparisonResponse:
    """
    Fetch comparative analytics and trend slope metrics across all districts.
    """
    return get_district_comparison(db=db)


@router.get(
    "/districts/{district}",
    response_model=DistrictSummaryItem,
    summary="Get summary analytics for a specific district",
    description="Retrieve monitoring station counts, observations breakdown, and valid groundwater levels for a specified district.",
)
def retrieve_district_summary(
    district: str,
    db: Session = Depends(get_db),
) -> DistrictSummaryItem:
    """
    Fetch summary metrics for a specific district by name (case-insensitive).
    """
    summary = get_district_summary(db=db, district=district)
    if summary is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"District '{district}' not found."
        )
    return summary


@router.get(
    "/districts/{district}/trend",
    response_model=DistrictGroundwaterTrendResponse,
    summary="Get monthly groundwater level trend for a district",
    description="Retrieve chronological monthly average groundwater levels aggregated across valid DWLR observations for a specific district.",
)
def retrieve_district_groundwater_trend(
    district: str,
    db: Session = Depends(get_db),
) -> DistrictGroundwaterTrendResponse:
    """
    Fetch monthly aggregated groundwater level time-series for a specific district.
    """
    trend_data = get_district_groundwater_trend(db=db, district=district)
    if trend_data is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"District '{district}' not found."
        )
    return trend_data


@router.get(
    "/districts/{district}/trend-analysis",
    response_model=DistrictGroundwaterTrendAnalysisResponse,
    summary="Get statistical groundwater trend analysis for a district",
    description="Calculate statistical linear regression slope, direction, strength, and period metrics for monthly valid observations of a specific district.",
)
def retrieve_district_groundwater_trend_analysis(
    district: str,
    db: Session = Depends(get_db),
) -> DistrictGroundwaterTrendAnalysisResponse:
    """
    Fetch statistical trend metrics (linear regression slope, direction, strength, total change) for a district.
    """
    analysis = get_district_groundwater_trend_analysis(db=db, district=district)
    if analysis is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"District '{district}' not found."
        )
    return analysis


# ─── Station Analytics ─────────────────────────────────────────────────────────

@router.get(
    "/stations/{station_id}/trend",
    response_model=StationGroundwaterTrendResponse,
    summary="Get monthly groundwater level trend for a station",
    description="Retrieve chronological monthly average groundwater levels aggregated across valid DWLR observations for a specific station.",
)
def retrieve_station_groundwater_trend(
    station_id: int,
    db: Session = Depends(get_db),
) -> StationGroundwaterTrendResponse:
    """
    Fetch monthly aggregated groundwater level time-series for a specific station.
    """
    trend_data = get_station_groundwater_trend(db=db, station_id=station_id)
    if trend_data is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Station with ID {station_id} not found."
        )
    return trend_data


@router.get(
    "/stations/{station_id}/trend-analysis",
    response_model=StationGroundwaterTrendAnalysisResponse,
    summary="Get statistical groundwater trend analysis for a station",
    description="Calculate statistical linear regression slope, direction, strength, and period metrics for monthly valid groundwater level observations of a specific station.",
)
def retrieve_station_groundwater_trend_analysis(
    station_id: int,
    db: Session = Depends(get_db),
) -> StationGroundwaterTrendAnalysisResponse:
    """
    Fetch statistical trend metrics (linear regression slope, direction, strength, total change) for a station.
    """
    analysis = get_station_groundwater_trend_analysis(db=db, station_id=station_id)
    if analysis is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Station with ID {station_id} not found."
        )
    return analysis


@router.get(
    "/stations/{station_id}/data-quality",
    response_model=StationDataQualityResponse,
    summary="Get data quality breakdown for a station",
    description="Retrieve total, valid, suspect, and invalid observation counts and percentages for a specific station.",
)
def retrieve_station_data_quality(
    station_id: int,
    db: Session = Depends(get_db),
) -> StationDataQualityResponse:
    """
    Fetch station-specific data quality metrics.
    """
    dq = get_station_data_quality(db=db, station_id=station_id)
    if dq is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Station with ID {station_id} not found."
        )
    return dq


@router.get(
    "/stations/{station_id}/anomalies",
    response_model=StationAnomalyResponse,
    summary="Get statistical anomaly and screening analysis for a station",
    description="Perform statistical screening on monthly valid groundwater levels (IQR outliers, sudden shifts, and coverage gaps).",
)
def retrieve_station_anomalies(
    station_id: int,
    db: Session = Depends(get_db),
) -> StationAnomalyResponse:
    """
    Fetch statistical screening flags for potential outliers, sudden changes, and observation gaps.
    """
    anomalies = get_station_anomalies(db=db, station_id=station_id)
    if anomalies is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Station with ID {station_id} not found."
        )
    return anomalies



