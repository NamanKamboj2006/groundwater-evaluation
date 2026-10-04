from typing import List, Optional, Dict, Any
from sqlalchemy import text
from sqlalchemy.orm import Session


def get_map_stations(
    db: Session,
    district: Optional[str] = None,
    state: Optional[str] = None,
    data_quality: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """
    Retrieve all monitoring station markers with their latest available telemetry reading.
    Uses PostgreSQL DISTINCT ON for fast execution.
    """
    conditions = []
    params = {}

    if district and isinstance(district, str) and district.strip():
        conditions.append("s.district ILIKE :district")
        params["district"] = f"%{district.strip()}%"

    if state and isinstance(state, str) and state.strip():
        conditions.append("s.state ILIKE :state")
        params["state"] = f"%{state.strip()}%"

    if data_quality and isinstance(data_quality, str) and data_quality.strip():
        conditions.append("lr.data_quality ILIKE :data_quality")
        params["data_quality"] = data_quality.strip()

    where_clause = ""
    if conditions:
        where_clause = "WHERE " + " AND ".join(conditions)

    # Efficient LATERAL join to probe latest reading per station using index
    query = text(
        f"""
        SELECT
            s.id AS station_id,
            s.station_name,
            s.district,
            s.state,
            s.latitude,
            s.longitude,
            lr.groundwater_level AS latest_groundwater_level,
            lr.timestamp AS latest_reading_timestamp,
            lr.data_quality AS latest_data_quality
        FROM stations s
        LEFT JOIN LATERAL (
            SELECT groundwater_level, timestamp, data_quality
            FROM readings r
            WHERE r.station_id = s.id
            ORDER BY r.timestamp DESC, r.id DESC
            LIMIT 1
        ) lr ON true
        {where_clause}
        ORDER BY s.id ASC;
        """
    )

    rows = db.execute(query, params).mappings().all()

    results = []
    for r in rows:
        results.append({
            "station_id": int(r["station_id"]),
            "station_name": r["station_name"],
            "district": r["district"],
            "state": r["state"],
            "latitude": float(r["latitude"]),
            "longitude": float(r["longitude"]),
            "latest_groundwater_level": float(r["latest_groundwater_level"]) if r["latest_groundwater_level"] is not None else None,
            "latest_reading_timestamp": r["latest_reading_timestamp"],
            "latest_data_quality": r["latest_data_quality"],
        })

    return results
