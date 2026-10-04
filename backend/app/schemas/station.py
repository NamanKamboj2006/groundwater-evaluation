from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field


class StationResponse(BaseModel):
    """
    Pydantic schema representing a physical groundwater monitoring station.
    Coordinates and RL_MSL are serialized as JSON numbers (float).
    """
    id: int = Field(..., description="Unique database station ID")
    station_name: str = Field(..., description="Station site name")
    agency: Optional[str] = Field(None, description="Monitoring agency")
    state: Optional[str] = Field(None, description="State name")
    district: Optional[str] = Field(None, description="District name")
    tehsil: Optional[str] = Field(None, description="Tehsil / Sub-district name")
    latitude: float = Field(..., description="Latitude coordinate (WGS84)")
    longitude: float = Field(..., description="Longitude coordinate (WGS84)")
    rl_msl: Optional[float] = Field(None, description="Reduced Level above MSL (meters)")

    # Optional aggregated telemetry statistics
    total_readings: Optional[int] = Field(None, description="Total recorded observations count")
    valid_readings: Optional[int] = Field(None, description="Valid quality observations count")
    suspect_readings: Optional[int] = Field(None, description="Suspect quality observations count")
    invalid_readings: Optional[int] = Field(None, description="Invalid quality observations count")
    earliest_reading_timestamp: Optional[datetime] = Field(None, description="First recorded telemetry timestamp")
    latest_reading_timestamp: Optional[datetime] = Field(None, description="Most recent recorded telemetry timestamp")

    model_config = ConfigDict(from_attributes=True)

