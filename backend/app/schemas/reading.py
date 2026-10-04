from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field


class ReadingResponse(BaseModel):
    """
    Pydantic response schema representing a groundwater telemetry reading.
    """
    id: int = Field(..., description="Unique database reading ID")
    station_id: int = Field(..., description="Foreign key to physical monitoring station")
    source_dataset: str = Field(..., description="Identifier of the origin dataset")
    source_slno: int = Field(..., description="Original source transaction / sequence number")
    timestamp: datetime = Field(..., description="Data acquisition timestamp")
    groundwater_level: float = Field(..., description="Groundwater level measurement (meters)")
    data_quality: str = Field(..., description="Quality classification flag (valid, suspect, invalid)")
    quality_reason: Optional[str] = Field(None, description="Detailed explanation if quality is suspect or invalid")
    station_name: Optional[str] = Field(None, description="Associated physical monitoring station name")
    district: Optional[str] = Field(None, description="Associated station district name")

    model_config = ConfigDict(from_attributes=True)
