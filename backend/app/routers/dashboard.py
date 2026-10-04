from typing import List
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.dashboard import DashboardOverviewResponse, RecentReadingResponse
from app.services.dashboard_service import get_dashboard_overview, get_recent_readings

router = APIRouter(
    prefix="/api/dashboard",
    tags=["Dashboard"],
)


@router.get(
    "/overview",
    response_model=DashboardOverviewResponse,
    summary="Get main dashboard overview analytics",
    description="Retrieve aggregated statewide telemetry metrics, station activity/freshness, and district-wise breakdown for the main React dashboard.",
)
def retrieve_dashboard_overview(
    db: Session = Depends(get_db),
) -> DashboardOverviewResponse:
    """
    Fetch unified dashboard overview metrics in a single optimized payload.
    """
    return get_dashboard_overview(db=db)


@router.get(
    "/recent-readings",
    response_model=List[RecentReadingResponse],
    summary="Get recent groundwater telemetry readings",
    description="Retrieve the latest groundwater readings across all stations with joined station metadata for the dashboard view.",
)
def retrieve_recent_readings(
    limit: int = Query(10, ge=1, le=50, description="Number of recent readings to fetch (default: 10)"),
    db: Session = Depends(get_db),
) -> List[RecentReadingResponse]:
    """
    Fetch the most recent telemetry readings with station metadata using server-side limit and timestamp ordering.
    """
    return get_recent_readings(db=db, limit=limit)

