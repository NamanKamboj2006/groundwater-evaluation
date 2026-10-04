from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field


class StationTrendPointResponse(BaseModel):
    """
    Pydantic schema representing a single chronological groundwater level data point for a station.
    Optimized for time-series charts and trend visualization.
    """
    timestamp: datetime = Field(..., description="Telemetry acquisition timestamp")
    groundwater_level: float = Field(..., description="Groundwater level measurement in meters (JSON number)")
    data_quality: str = Field(..., description="Quality classification flag (valid, suspect, invalid)")

    model_config = ConfigDict(from_attributes=True)


class MonthlyTrendPoint(BaseModel):
    """
    Pydantic schema representing a monthly aggregated groundwater level point.
    """
    month: str = Field(..., description="Year-month in 'YYYY-MM' format (e.g. '2023-06')")
    average_groundwater_level: float = Field(..., description="Average groundwater level in meters (raw sign preserved)")
    reading_count: int = Field(..., description="Number of valid observations in the month")

    model_config = ConfigDict(from_attributes=True)


class GroundwaterTrendResponse(BaseModel):
    """
    Pydantic schema for monthly statewide groundwater level trend response.
    """
    data: List[MonthlyTrendPoint] = Field(..., description="Chronological monthly groundwater trend points")
    total_months: int = Field(..., description="Total number of monthly data points")

    model_config = ConfigDict(from_attributes=True)


class GroundwaterTrendAnalysisResponse(BaseModel):
    """
    Pydantic schema for statistical trend analysis of monthly groundwater levels.
    """
    start_month: str = Field(..., description="First month in analysis period ('YYYY-MM')")
    end_month: str = Field(..., description="Last month in analysis period ('YYYY-MM')")
    number_of_months: int = Field(..., description="Total number of aggregated months analyzed")
    start_average_level: float = Field(..., description="Average groundwater level in the starting month (m)")
    end_average_level: float = Field(..., description="Average groundwater level in the ending month (m)")
    total_change: float = Field(..., description="Net level change from start to end month (m)")
    slope_m_per_year: float = Field(..., description="Linear regression slope in meters per year")
    direction: str = Field(..., description="Numeric trend direction: 'Increasing', 'Decreasing', or 'Stable'")
    strength: str = Field(..., description="Statistical trend strength: 'Weak', 'Moderate', or 'Strong'")

    model_config = ConfigDict(from_attributes=True)


class StationGroundwaterTrendResponse(BaseModel):
    """
    Pydantic schema for monthly station groundwater level trend response.
    """
    station_id: int = Field(..., description="Unique database station ID")
    station_name: str = Field(..., description="Station site name")
    data: List[MonthlyTrendPoint] = Field(..., description="Chronological monthly groundwater trend points")
    total_months: int = Field(..., description="Total number of monthly data points")

    model_config = ConfigDict(from_attributes=True)


class StationGroundwaterTrendAnalysisResponse(BaseModel):
    """
    Pydantic schema for statistical trend analysis of monthly groundwater levels for a specific station.
    """
    station_id: int = Field(..., description="Unique database station ID")
    station_name: str = Field(..., description="Station site name")
    start_month: str = Field(..., description="First month in analysis period ('YYYY-MM')")
    end_month: str = Field(..., description="Last month in analysis period ('YYYY-MM')")
    number_of_months: int = Field(..., description="Total number of aggregated months analyzed")
    start_average_level: float = Field(..., description="Average groundwater level in the starting month (m)")
    end_average_level: float = Field(..., description="Average groundwater level in the ending month (m)")
    total_change: float = Field(..., description="Net level change from start to end month (m)")
    slope_m_per_year: float = Field(..., description="Linear regression slope in meters per year")
    direction: str = Field(..., description="Numeric trend direction: 'Increasing', 'Decreasing', or 'Stable'")
    strength: str = Field(..., description="Statistical trend strength: 'Weak', 'Moderate', or 'Strong'")

    model_config = ConfigDict(from_attributes=True)


class StationDataQualityResponse(BaseModel):
    """
    Pydantic schema for station data quality breakdown and percentages.
    """
    station_id: int = Field(..., description="Unique database station ID")
    total_readings: int = Field(..., description="Total recorded observations count")
    valid_readings: int = Field(..., description="Valid quality observations count")
    suspect_readings: int = Field(..., description="Suspect quality observations count")
    invalid_readings: int = Field(..., description="Invalid quality observations count")
    valid_percentage: float = Field(..., description="Percentage of valid observations")
    suspect_percentage: float = Field(..., description="Percentage of suspect observations")
    invalid_percentage: float = Field(..., description="Percentage of invalid observations")

    model_config = ConfigDict(from_attributes=True)


class OutlierItem(BaseModel):
    month: str = Field(..., description="Year-month of potential outlier ('YYYY-MM')")
    average_groundwater_level: float = Field(..., description="Monthly average groundwater level (m)")
    reason: str = Field(..., description="Statistical outlier description")

    model_config = ConfigDict(from_attributes=True)


class OutlierScreeningResult(BaseModel):
    method: str = Field("IQR", description="Statistical screening method")
    sample_size: int = Field(..., description="Number of months analyzed")
    lower_bound: Optional[float] = Field(None, description="Lower statistical threshold (Q1 - 1.5*IQR)")
    upper_bound: Optional[float] = Field(None, description="Upper statistical threshold (Q3 + 1.5*IQR)")
    outlier_count: int = Field(..., description="Number of detected outliers")
    outliers: List[OutlierItem] = Field(default_factory=list, description="List of detected statistical outliers")

    model_config = ConfigDict(from_attributes=True)


class SuddenChangeItem(BaseModel):
    from_month: str = Field(..., description="Starting month of interval ('YYYY-MM')")
    to_month: str = Field(..., description="Ending month of interval ('YYYY-MM')")
    change: float = Field(..., description="Net month-to-month level change (m)")
    absolute_change: float = Field(..., description="Absolute change magnitude (m)")
    reason: str = Field(..., description="Statistical screening description")

    model_config = ConfigDict(from_attributes=True)


class SuddenChangeScreeningResult(BaseModel):
    method: str = Field("IQR", description="Statistical screening method")
    threshold: Optional[float] = Field(None, description="Sudden change screening threshold (m)")
    sudden_change_count: int = Field(..., description="Count of detected unusual changes")
    changes: List[SuddenChangeItem] = Field(default_factory=list, description="List of detected sudden changes")

    model_config = ConfigDict(from_attributes=True)


class MonthlyCoverageItem(BaseModel):
    month: str = Field(..., description="Year-month ('YYYY-MM')")
    valid_readings: int = Field(..., description="Count of valid observations")
    coverage_status: str = Field(..., description="'Normal' or 'Low coverage'")

    model_config = ConfigDict(from_attributes=True)


class CoverageScreeningResult(BaseModel):
    median_monthly_readings: Optional[float] = Field(None, description="Median monthly valid observation count")
    low_coverage_threshold: Optional[float] = Field(None, description="Threshold for low coverage flag (50% median)")
    low_coverage_count: int = Field(..., description="Number of months with low coverage")
    monthly_coverage: List[MonthlyCoverageItem] = Field(default_factory=list, description="Monthly coverage breakdown")

    model_config = ConfigDict(from_attributes=True)


class AnomalyScreeningSummary(BaseModel):
    potential_outliers: int = Field(..., description="Count of potential statistical outlier months")
    potential_sudden_changes: int = Field(..., description="Count of potential sudden monthly shifts")
    low_coverage_months: int = Field(..., description="Count of low observation coverage months")
    overall_screening_status: str = Field(..., description="'No Major Flags' or 'Review Recommended'")

    model_config = ConfigDict(from_attributes=True)


class StationAnomalyResponse(BaseModel):
    """
    Pydantic schema for statistical anomaly and screening analysis of a station.
    """
    station_id: int = Field(..., description="Unique database station ID")
    station_name: str = Field(..., description="Station site name")
    summary: AnomalyScreeningSummary = Field(..., description="Overview screening status and flag counts")
    outlier_screening: OutlierScreeningResult = Field(..., description="IQR-based statistical outlier screening")
    sudden_change_screening: SuddenChangeScreeningResult = Field(..., description="IQR-based sudden change screening")
    coverage_screening: CoverageScreeningResult = Field(..., description="Observation coverage and data gap screening")

    model_config = ConfigDict(from_attributes=True)


class DistrictSummaryItem(BaseModel):
    """
    Pydantic schema representing summary statistics for a district.
    """
    district: str = Field(..., description="District name")
    station_count: int = Field(..., description="Total monitoring stations in district")
    total_readings: int = Field(..., description="Total recorded observations count")
    valid_readings: int = Field(..., description="Valid observations count")
    suspect_readings: int = Field(..., description="Suspect observations count")
    invalid_readings: int = Field(..., description="Invalid observations count")
    average_groundwater_level: Optional[float] = Field(None, description="Average valid groundwater level in meters")
    min_groundwater_level: Optional[float] = Field(None, description="Minimum valid groundwater level in meters")
    max_groundwater_level: Optional[float] = Field(None, description="Maximum valid groundwater level in meters")
    earliest_reading_timestamp: Optional[datetime] = Field(None, description="First recorded telemetry timestamp")
    latest_reading_timestamp: Optional[datetime] = Field(None, description="Most recent recorded telemetry timestamp")

    model_config = ConfigDict(from_attributes=True)


class DistrictComparisonItem(BaseModel):
    """
    Pydantic schema representing comparative analytics and trend slope for a district.
    """
    district: str = Field(..., description="District name")
    station_count: int = Field(..., description="Total monitoring stations in district")
    total_readings: int = Field(..., description="Total recorded observations count")
    valid_readings: int = Field(..., description="Valid observations count")
    average_groundwater_level: Optional[float] = Field(None, description="Average valid groundwater level in meters")
    number_of_months: int = Field(..., description="Total aggregated months observed")
    start_month: Optional[str] = Field(None, description="Start month of observation period")
    end_month: Optional[str] = Field(None, description="End month of observation period")
    slope_m_per_year: Optional[float] = Field(None, description="Annual linear regression rate in m/year")
    direction: Optional[str] = Field(None, description="Numeric measurement trend direction ('Increasing', 'Decreasing', 'Stable')")
    strength: Optional[str] = Field(None, description="Statistical trend strength ('Weak', 'Moderate', 'Strong')")
    total_change: Optional[float] = Field(None, description="Net level change over observed period (m)")

    model_config = ConfigDict(from_attributes=True)


class DistrictComparisonResponse(BaseModel):
    """
    Pydantic schema for statewide district comparison response.
    """
    total_districts: int = Field(..., description="Total number of districts compared")
    data: List[DistrictComparisonItem] = Field(..., description="List of comparative district analytics")

    model_config = ConfigDict(from_attributes=True)


class DistrictGroundwaterTrendResponse(BaseModel):
    """
    Pydantic schema for monthly district groundwater level trend response.
    """
    district: str = Field(..., description="District name")
    station_count: int = Field(..., description="Number of stations in district")
    data: List[MonthlyTrendPoint] = Field(..., description="Chronological monthly groundwater trend points")
    total_months: int = Field(..., description="Total number of monthly data points")

    model_config = ConfigDict(from_attributes=True)


class DistrictGroundwaterTrendAnalysisResponse(BaseModel):
    """
    Pydantic schema for statistical trend analysis of monthly groundwater levels for a district.
    """
    district: str = Field(..., description="District name")
    station_count: int = Field(..., description="Number of stations in district")
    start_month: str = Field(..., description="First month in analysis period ('YYYY-MM')")
    end_month: str = Field(..., description="Last month in analysis period ('YYYY-MM')")
    number_of_months: int = Field(..., description="Total number of aggregated months analyzed")
    start_average_level: float = Field(..., description="Average groundwater level in starting month (m)")
    end_average_level: float = Field(..., description="Average groundwater level in ending month (m)")
    total_change: float = Field(..., description="Net level change from start to end month (m)")
    slope_m_per_year: float = Field(..., description="Linear regression slope in meters per year")
    direction: str = Field(..., description="Numeric trend direction: 'Increasing', 'Decreasing', or 'Stable'")
    strength: str = Field(..., description="Statistical trend strength: 'Weak', 'Moderate', or 'Strong'")

    model_config = ConfigDict(from_attributes=True)




