from typing import List, Optional
from decimal import Decimal
from sqlalchemy import BigInteger, String, Numeric, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from geoalchemy2 import Geometry

from app.db.base import Base


class Station(Base):
    """
    Physical groundwater monitoring station model.
    A physical station is uniquely identified by (station_name, latitude, longitude).
    """
    __tablename__ = "stations"
    __table_args__ = (
        UniqueConstraint("station_name", "latitude", "longitude", name="uq_station_name_lat_lon"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    station_name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    agency: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    state: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    district: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, index=True)
    tehsil: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    latitude: Mapped[Decimal] = mapped_column(Numeric(10, 7), nullable=False)
    longitude: Mapped[Decimal] = mapped_column(Numeric(10, 7), nullable=False)
    rl_msl: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 3), nullable=True)
    location = mapped_column(Geometry(geometry_type="POINT", srid=4326, spatial_index=True), nullable=True)

    # Relationships
    readings: Mapped[List["Reading"]] = relationship(
        "Reading",
        back_populates="station",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return f"<Station(id={self.id}, name='{self.station_name}', district='{self.district}', lat={self.latitude}, lon={self.longitude})>"
