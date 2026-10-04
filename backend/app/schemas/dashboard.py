from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field


class DashboardOverallStats(BaseModel):
    """
    Statewide telemetry summary metrics for dashboard cards.
    """
    total_stations: int = Field(..., description="Total physical monitoring stations")
    total_readings: int = Field(..., description="Total telemetry readings recorded")
    valid_readings: int = Field(..., description="Total valid readings")
    suspect_readings: int = Field(..., description="Total suspect readings (e.g. extreme values)")
    invalid_readings: int = Field(..., description="Total invalid readings (e.g. sentinel -999.999)")
    earliest_reading_timestamp: Optional[datetime] = Field(None, description="Earliest recorded telemetry timestamp")
    latest_reading_timestamp: Optional[datetime] = Field(None, description="Most recent recorded telemetry timestamp")

    model_config = ConfigDict(from_attributes=True)


class DashboardStationFreshness(BaseModel):
    """
    Monitoring station activity and reporting status.
    """
    stations_with_readings: int = Field(..., description="Number of stations with at least one telemetry reading")
    stations_without_readings: int = Field(..., description="Number of stations with zero recorded readings")

    model_config = ConfigDict(from_attributes=True)


class DashboardDistrictStat(BaseModel):
    """
    District-level station and reading distribution metrics.
    """
    district: str = Field(..., description="District name")
    station_count: int = Field(..., description="Number of monitoring stations in the district")
    reading_count: int = Field(..., description="Total telemetry readings in the district")
    valid_readings: int = Field(..., description="Number of valid readings")
    suspect_readings: int = Field(..., description="Number of suspect readings")
    invalid_readings: int = Field(..., description="Number of invalid readings")

    model_config = ConfigDict(from_attributes=True)


class DashboardOverviewResponse(BaseModel):
    """
    Unified payload providing all essential data for the main React dashboard overview.
    """
    overall: DashboardOverallStats
    station_freshness: DashboardStationFreshness
    districts: List[DashboardDistrictStat]

    model_config = ConfigDict(from_attributes=True)


class RecentReadingResponse(BaseModel):
    """
    Recent groundwater telemetry observation with station metadata for dashboard display.
    """
    reading_id: int = Field(..., description="Unique database reading ID")
    timestamp: datetime = Field(..., description="Data acquisition timestamp")
    station_id: int = Field(..., description="Foreign key to physical monitoring station")
    station_name: Optional[str] = Field(None, description="Associated physical monitoring station name")
    district: Optional[str] = Field(None, description="Associated station district name")
    groundwater_level: float = Field(..., description="Groundwater level measurement (meters)")
    data_quality: str = Field(..., description="Quality classification flag (valid, suspect, invalid)")
    quality_reason: Optional[str] = Field(None, description="Detailed explanation if quality is suspect or invalid")

    model_config = ConfigDict(from_attributes=True)

