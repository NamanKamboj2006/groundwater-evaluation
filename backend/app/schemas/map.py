from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field


class StationMapMarkerResponse(BaseModel):
    """
    Pydantic schema representing station map marker with latest telemetry reading.
    Optimized for Leaflet and geospatial dashboard mapping.
    """
    station_id: int = Field(..., description="Unique database station ID")
    station_name: str = Field(..., description="Name of the monitoring station")
    district: Optional[str] = Field(None, description="District name")
    state: Optional[str] = Field(None, description="State name")
    latitude: float = Field(..., description="Latitude coordinate (WGS84)")
    longitude: float = Field(..., description="Longitude coordinate (WGS84)")
    latest_groundwater_level: Optional[float] = Field(None, description="Most recent groundwater level measurement (meters)")
    latest_reading_timestamp: Optional[datetime] = Field(None, description="Timestamp of the most recent telemetry reading")
    latest_data_quality: Optional[str] = Field(None, description="Quality flag of the latest reading (valid, suspect, invalid)")

    model_config = ConfigDict(from_attributes=True)
