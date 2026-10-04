from datetime import datetime
from typing import List, Optional, Dict, Any
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.reading import Reading
from app.models.station import Station


def get_readings(
    db: Session,
    station_id: Optional[int] = None,
    district: Optional[str] = None,
    start_time: Optional[datetime] = None,
    end_time: Optional[datetime] = None,
    data_quality: Optional[str] = None,
    sort_by: str = "timestamp",
    order: str = "desc",
    skip: int = 0,
    limit: int = 100,
) -> List[Dict[str, Any]]:
    """
    Retrieve groundwater telemetry readings with optional filters, joined station metadata, and pagination.
    """
    stmt = select(
        Reading.id,
        Reading.station_id,
        Reading.source_dataset,
        Reading.source_slno,
        Reading.timestamp,
        Reading.groundwater_level,
        Reading.data_quality,
        Reading.quality_reason,
        Station.station_name,
        Station.district,
    ).join(Station, Reading.station_id == Station.id)

    if station_id is not None and isinstance(station_id, int):
        stmt = stmt.where(Reading.station_id == station_id)

    if district and isinstance(district, str) and district.strip() and district.strip().upper() != "ALL":
        stmt = stmt.where(Station.district.ilike(f"%{district.strip()}%"))

    if start_time is not None and isinstance(start_time, datetime):
        stmt = stmt.where(Reading.timestamp >= start_time)

    if end_time is not None and isinstance(end_time, datetime):
        stmt = stmt.where(Reading.timestamp <= end_time)

    if data_quality and isinstance(data_quality, str) and data_quality.strip() and data_quality.strip().lower() != "all":
        stmt = stmt.where(Reading.data_quality.ilike(data_quality.strip()))

    # Sorting
    sort_col = Reading.timestamp
    if sort_by == "groundwater_level":
        sort_col = Reading.groundwater_level
    elif sort_by == "id":
        sort_col = Reading.id

    if order == "asc":
        stmt = stmt.order_by(sort_col.asc(), Reading.id.asc())
    else:
        stmt = stmt.order_by(sort_col.desc(), Reading.id.desc())

    if isinstance(skip, int) and skip > 0:
        stmt = stmt.offset(skip)

    if isinstance(limit, int) and limit > 0:
        stmt = stmt.limit(limit)

    rows = db.execute(stmt).mappings().all()
    return [
        {
            "id": r["id"],
            "station_id": r["station_id"],
            "source_dataset": r["source_dataset"],
            "source_slno": r["source_slno"],
            "timestamp": r["timestamp"],
            "groundwater_level": float(r["groundwater_level"]),
            "data_quality": r["data_quality"],
            "quality_reason": r["quality_reason"],
            "station_name": r["station_name"],
            "district": r["district"],
        }
        for r in rows
    ]


def get_reading_by_id(db: Session, reading_id: int) -> Optional[Dict[str, Any]]:
    """
    Retrieve a single telemetry reading by its database primary key ID, joined with station metadata.
    """
    stmt = select(
        Reading.id,
        Reading.station_id,
        Reading.source_dataset,
        Reading.source_slno,
        Reading.timestamp,
        Reading.groundwater_level,
        Reading.data_quality,
        Reading.quality_reason,
        Station.station_name,
        Station.district,
    ).join(Station, Reading.station_id == Station.id).where(Reading.id == reading_id)

    r = db.execute(stmt).mappings().first()
    if not r:
        return None

    return {
        "id": r["id"],
        "station_id": r["station_id"],
        "source_dataset": r["source_dataset"],
        "source_slno": r["source_slno"],
        "timestamp": r["timestamp"],
        "groundwater_level": float(r["groundwater_level"]),
        "data_quality": r["data_quality"],
        "quality_reason": r["quality_reason"],
        "station_name": r["station_name"],
        "district": r["district"],
    }


def get_readings_by_station(
    db: Session,
    station_id: int,
    start_time: Optional[datetime] = None,
    end_time: Optional[datetime] = None,
    data_quality: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
) -> List[Dict[str, Any]]:
    """
    Retrieve all telemetry readings belonging to a specific station ID.
    """
    return get_readings(
        db=db,
        station_id=station_id,
        start_time=start_time,
        end_time=end_time,
        data_quality=data_quality,
        skip=skip,
        limit=limit,
    )
