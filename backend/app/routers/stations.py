from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.station import StationResponse
from app.schemas.reading import ReadingResponse
from app.services.station_service import get_stations, get_station_by_id
from app.services.reading_service import get_readings_by_station

router = APIRouter(
    prefix="/api/stations",
    tags=["Stations"],
)


@router.get(
    "",
    response_model=List[StationResponse],
    summary="Get all groundwater monitoring stations",
    description="Fetch physical groundwater monitoring stations from PostgreSQL with optional filtering and pagination.",
)
def list_stations(
    district: Optional[str] = Query(None, description="Optional filter by district name (case-insensitive)"),
    state: Optional[str] = Query(None, description="Optional filter by state name"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: Optional[int] = Query(None, ge=1, le=2000, description="Maximum number of records to return"),
    db: Session = Depends(get_db),
) -> List[StationResponse]:
    """
    Retrieve stations matching the query parameters.
    """
    return get_stations(db=db, district=district, state=state, skip=skip, limit=limit)


@router.get(
    "/{station_id}",
    response_model=StationResponse,
    summary="Get station by ID",
    description="Retrieve full details for a single monitoring station by its primary key ID.",
)
def retrieve_station(
    station_id: int,
    db: Session = Depends(get_db),
) -> StationResponse:
    """
    Retrieve a specific station by its unique database ID.
    """
    station = get_station_by_id(db=db, station_id=station_id)
    if not station:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Station with ID {station_id} not found."
        )
    return station


@router.get(
    "/{station_id}/readings",
    response_model=List[ReadingResponse],
    summary="Get telemetry readings for a specific station",
    description="Retrieve chronological telemetry readings belonging to a specific station with time window and quality filters.",
)
def retrieve_station_readings(
    station_id: int,
    start_time: Optional[datetime] = Query(None, description="Filter readings on or after timestamp (ISO 8601, e.g. 2024-01-01T00:00:00)"),
    end_time: Optional[datetime] = Query(None, description="Filter readings on or before timestamp (ISO 8601)"),
    data_quality: Optional[str] = Query(None, description="Filter by quality classification ('valid', 'suspect', 'invalid')"),
    skip: int = Query(0, ge=0, description="Number of records to skip for pagination"),
    limit: int = Query(100, ge=1, le=2000, description="Maximum number of records to return (default: 100, max: 2,000)"),
    db: Session = Depends(get_db),
) -> List[ReadingResponse]:
    """
    Fetch readings belonging to a station or return HTTP 404 if the station does not exist.
    """
    station = get_station_by_id(db=db, station_id=station_id)
    if not station:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Station with ID {station_id} not found."
        )
    return get_readings_by_station(
        db=db,
        station_id=station_id,
        start_time=start_time,
        end_time=end_time,
        data_quality=data_quality,
        skip=skip,
        limit=limit,
    )
