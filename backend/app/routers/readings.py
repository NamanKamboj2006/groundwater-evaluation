from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.reading import ReadingResponse
from app.services.reading_service import get_readings, get_reading_by_id

router = APIRouter(
    prefix="/api/readings",
    tags=["Readings"],
)


@router.get(
    "",
    response_model=List[ReadingResponse],
    summary="Get groundwater telemetry readings",
    description="Retrieve paginated groundwater telemetry readings with optional filters for station, time window, and quality status.",
)
def list_readings(
    station_id: Optional[int] = Query(None, description="Filter by specific station database ID"),
    district: Optional[str] = Query(None, description="Filter by district name (case-insensitive)"),
    start_time: Optional[datetime] = Query(None, description="Filter readings on or after timestamp (ISO 8601, e.g. 2024-01-01T00:00:00)"),
    end_time: Optional[datetime] = Query(None, description="Filter readings on or before timestamp (ISO 8601)"),
    data_quality: Optional[str] = Query(None, description="Filter by quality classification ('valid', 'suspect', 'invalid')"),
    sort_by: str = Query("timestamp", description="Column to sort by ('timestamp', 'groundwater_level', 'id')"),
    order: str = Query("desc", description="Sort direction ('asc' or 'desc')"),
    skip: int = Query(0, ge=0, description="Number of records to skip for pagination"),
    limit: int = Query(50, ge=1, le=2000, description="Maximum number of records to return (default: 50, max: 2,000)"),
    db: Session = Depends(get_db),
) -> List[ReadingResponse]:
    """
    Fetch paginated groundwater readings based on specified criteria.
    """
    return get_readings(
        db=db,
        station_id=station_id,
        district=district,
        start_time=start_time,
        end_time=end_time,
        data_quality=data_quality,
        sort_by=sort_by,
        order=order,
        skip=skip,
        limit=limit,
    )


@router.get(
    "/{reading_id}",
    response_model=ReadingResponse,
    summary="Get single reading by ID",
    description="Retrieve full details for an individual telemetry reading by its database primary key ID.",
)
def retrieve_reading(
    reading_id: int,
    db: Session = Depends(get_db),
) -> ReadingResponse:
    """
    Fetch a single reading by ID or return HTTP 404 if not found.
    """
    reading = get_reading_by_id(db=db, reading_id=reading_id)
    if not reading:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Reading with ID {reading_id} not found."
        )
    return reading
