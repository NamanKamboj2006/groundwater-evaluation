from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.summary import OverallSummaryResponse, DistrictSummaryResponse
from app.services.summary_service import get_overall_summary, get_district_summary

router = APIRouter(
    prefix="/api/summary",
    tags=["Summary & Analytics"],
)


@router.get(
    "",
    response_model=OverallSummaryResponse,
    summary="Get overall groundwater summary statistics",
    description="Retrieve statewide summary metrics including total stations, readings count, quality breakdown, and valid groundwater levels (excluding -999.999 sentinels).",
)
def retrieve_overall_summary(
    db: Session = Depends(get_db),
) -> OverallSummaryResponse:
    """
    Fetch global summary analytics across all Haryana telemetry stations.
    """
    return get_overall_summary(db=db)


@router.get(
    "/district/{district}",
    response_model=DistrictSummaryResponse,
    summary="Get district groundwater summary statistics",
    description="Retrieve groundwater summary metrics aggregated for a specific district.",
)
def retrieve_district_summary(
    district: str,
    db: Session = Depends(get_db),
) -> DistrictSummaryResponse:
    """
    Fetch summary metrics for a specific district or return HTTP 404 if not found.
    """
    summary = get_district_summary(db=db, district=district)
    if not summary:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"District '{district}' not found in monitoring records."
        )
    return summary
