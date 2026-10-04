from typing import List, Optional, Dict, Any
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.models.station import Station


def get_stations(
    db: Session,
    district: Optional[str] = None,
    state: Optional[str] = None,
    skip: int = 0,
    limit: Optional[int] = None,
) -> List[Station]:
    """
    Retrieve all physical groundwater monitoring stations from PostgreSQL.
    Optionally filter by district or state, with pagination support.
    """
    stmt = select(Station)

    if district and isinstance(district, str) and district.strip():
        stmt = stmt.where(Station.district.ilike(f"%{district.strip()}%"))
    if state and isinstance(state, str) and state.strip():
        stmt = stmt.where(Station.state.ilike(f"%{state.strip()}%"))

    # Ensure skip is non-negative int
    if isinstance(skip, int) and skip > 0:
        stmt = stmt.offset(skip)

    # Ensure limit is positive int
    if isinstance(limit, int) and limit > 0:
        stmt = stmt.limit(limit)

    stmt = stmt.order_by(Station.id.asc())

    return list(db.execute(stmt).scalars().all())


def get_station_by_id(db: Session, station_id: int) -> Optional[Dict[str, Any]]:
    """
    Retrieve a single station by its primary key ID, enriched with its telemetry statistics.
    """
    stmt = select(Station).where(Station.id == station_id)
    station = db.execute(stmt).scalar_one_or_none()
    if not station:
        return None

    # Retrieve telemetry stats via fast index scan on readings.station_id
    stats_query = text("""
        SELECT 
            COUNT(*) AS total_readings,
            COUNT(*) FILTER (WHERE data_quality = 'valid') AS valid_readings,
            COUNT(*) FILTER (WHERE data_quality = 'suspect') AS suspect_readings,
            COUNT(*) FILTER (WHERE data_quality = 'invalid') AS invalid_readings,
            MIN(timestamp) AS earliest_reading_timestamp,
            MAX(timestamp) AS latest_reading_timestamp
        FROM readings
        WHERE station_id = :station_id
    """)
    stats_row = db.execute(stats_query, {"station_id": station_id}).mappings().first()

    return {
        "id": station.id,
        "station_name": station.station_name,
        "agency": station.agency,
        "state": station.state,
        "district": station.district,
        "tehsil": station.tehsil,
        "latitude": float(station.latitude),
        "longitude": float(station.longitude),
        "rl_msl": float(station.rl_msl) if station.rl_msl is not None else None,
        "total_readings": int(stats_row["total_readings"]) if stats_row and stats_row["total_readings"] is not None else 0,
        "valid_readings": int(stats_row["valid_readings"]) if stats_row and stats_row["valid_readings"] is not None else 0,
        "suspect_readings": int(stats_row["suspect_readings"]) if stats_row and stats_row["suspect_readings"] is not None else 0,
        "invalid_readings": int(stats_row["invalid_readings"]) if stats_row and stats_row["invalid_readings"] is not None else 0,
        "earliest_reading_timestamp": stats_row["earliest_reading_timestamp"] if stats_row else None,
        "latest_reading_timestamp": stats_row["latest_reading_timestamp"] if stats_row else None,
    }

