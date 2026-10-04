from typing import List, Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.map import StationMapMarkerResponse
from app.services.map_service import get_map_stations

router = APIRouter(
    prefix="/api/map",
    tags=["Map & Geospatial"],
)


@router.get(
    "/stations",
    response_model=List[StationMapMarkerResponse],
    summary="Get station map markers with latest groundwater level",
    description="Retrieve geospatial markers for all monitoring stations with their most recent telemetry reading, coordinates, and quality flag for interactive mapping in Leaflet.",
)
def list_map_stations(
    district: Optional[str] = Query(None, description="Optional filter by district name (case-insensitive)"),
    state: Optional[str] = Query(None, description="Optional filter by state name"),
    data_quality: Optional[str] = Query(None, description="Optional filter by latest reading quality ('valid', 'suspect', 'invalid')"),
    db: Session = Depends(get_db),
) -> List[StationMapMarkerResponse]:
    """
    Fetch all station map markers with latest groundwater level for GIS / Leaflet rendering.
    """
    return get_map_stations(db=db, district=district, state=state, data_quality=data_quality)
