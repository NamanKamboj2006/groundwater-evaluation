from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field


class OverallSummaryResponse(BaseModel):
    """
    Schema for state-wide groundwater summary statistics.
    """
    total_stations: int = Field(..., description="Total number of physical monitoring stations")
    total_readings: int = Field(..., description="Total telemetry readings recorded")
    valid_readings: int = Field(..., description="Number of valid readings")
    suspect_readings: int = Field(..., description="Number of suspect readings (extreme values)")
    invalid_readings: int = Field(..., description="Number of invalid readings (sentinel values)")
    earliest_reading_timestamp: Optional[datetime] = Field(None, description="Timestamp of the earliest telemetry reading")
    latest_reading_timestamp: Optional[datetime] = Field(None, description="Timestamp of the most recent telemetry reading")
    min_groundwater_level: Optional[float] = Field(None, description="Minimum groundwater level (excluding invalid sentinels)")
    max_groundwater_level: Optional[float] = Field(None, description="Maximum groundwater level (excluding invalid sentinels)")
    avg_groundwater_level: Optional[float] = Field(None, description="Average groundwater level (excluding invalid sentinels)")

    model_config = ConfigDict(from_attributes=True)


class DistrictSummaryResponse(BaseModel):
    """
    Schema for district-level groundwater summary statistics.
    """
    district: str = Field(..., description="District name")
    total_stations: int = Field(..., description="Number of monitoring stations in the district")
    total_readings: int = Field(..., description="Total telemetry readings recorded in the district")
    valid_readings: int = Field(..., description="Number of valid readings")
    suspect_readings: int = Field(..., description="Number of suspect readings")
    invalid_readings: int = Field(..., description="Number of invalid readings")
    min_groundwater_level: Optional[float] = Field(None, description="Minimum groundwater level in the district (excluding invalid sentinels)")
    max_groundwater_level: Optional[float] = Field(None, description="Maximum groundwater level in the district (excluding invalid sentinels)")
    avg_groundwater_level: Optional[float] = Field(None, description="Average groundwater level in the district (excluding invalid sentinels)")
    earliest_reading_timestamp: Optional[datetime] = Field(None, description="Earliest recorded timestamp in the district")
    latest_reading_timestamp: Optional[datetime] = Field(None, description="Latest recorded timestamp in the district")

    model_config = ConfigDict(from_attributes=True)
