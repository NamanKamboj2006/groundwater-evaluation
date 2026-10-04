from datetime import datetime
from decimal import Decimal
from typing import Optional
from sqlalchemy import BigInteger, DateTime, ForeignKey, Numeric, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Reading(Base):
    """
    Groundwater telemetry reading model.
    Preserves raw readings and anomalies while referencing the parent station.
    """
    __tablename__ = "readings"
    __table_args__ = (
        UniqueConstraint("source_dataset", "source_slno", name="uq_reading_dataset_slno"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    station_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("stations.id", ondelete="CASCADE"), nullable=False, index=True)
    source_dataset: Mapped[str] = mapped_column(String(100), nullable=False, default="haryana_telemetry_2021_2025")
    source_slno: Mapped[int] = mapped_column(BigInteger, nullable=False)
    timestamp: Mapped[datetime] = mapped_column(DateTime, nullable=False, index=True)
    groundwater_level: Mapped[Decimal] = mapped_column(Numeric(10, 3), nullable=False)
    data_quality: Mapped[str] = mapped_column(String(30), nullable=False, default="valid")
    quality_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Relationships
    station: Mapped["Station"] = relationship(
        "Station",
        back_populates="readings",
    )

    def __repr__(self) -> str:
        return f"<Reading(id={self.id}, station_id={self.station_id}, time='{self.timestamp}', level={self.groundwater_level}, quality='{self.data_quality}')>"
