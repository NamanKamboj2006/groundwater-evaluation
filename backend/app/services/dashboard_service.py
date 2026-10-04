from typing import Dict, Any, List
from sqlalchemy import text, select
from sqlalchemy.orm import Session

from app.models.reading import Reading
from app.models.station import Station


def get_dashboard_overview(db: Session) -> Dict[str, Any]:
    """
    Retrieve aggregated dashboard metrics with optimized SQL queries.
    Uses CTE pre-aggregation per station and index-backed min/max to avoid
    expensive disk sorts and full-table joins across 1.86M rows.
    """
    # 1. Total station count
    total_stations = db.execute(text("SELECT COUNT(*) FROM stations;")).scalar() or 0

    # 2. Reading time range from index
    time_range_row = db.execute(
        text("SELECT MIN(timestamp) AS earliest_ts, MAX(timestamp) AS latest_ts FROM readings;")
    ).mappings().one()
    earliest_ts = time_range_row["earliest_ts"]
    latest_ts = time_range_row["latest_ts"]

    # 3. Station and District-wise aggregate breakdown
    districts_query = text(
        """
        WITH station_stats AS (
            SELECT 
                station_id,
                COUNT(*) AS reading_count,
                COUNT(*) FILTER (WHERE data_quality = 'valid') AS valid_readings,
                COUNT(*) FILTER (WHERE data_quality = 'suspect') AS suspect_readings,
                COUNT(*) FILTER (WHERE data_quality = 'invalid') AS invalid_readings
            FROM readings
            GROUP BY station_id
        )
        SELECT 
            COALESCE(NULLIF(TRIM(s.district), ''), 'Unknown') AS district,
            COUNT(s.id) AS station_count,
            COALESCE(SUM(ss.reading_count), 0)::bigint AS reading_count,
            COALESCE(SUM(ss.valid_readings), 0)::bigint AS valid_readings,
            COALESCE(SUM(ss.suspect_readings), 0)::bigint AS suspect_readings,
            COALESCE(SUM(ss.invalid_readings), 0)::bigint AS invalid_readings,
            COUNT(ss.station_id) AS active_stations
        FROM stations s
        LEFT JOIN station_stats ss ON ss.station_id = s.id
        GROUP BY COALESCE(NULLIF(TRIM(s.district), ''), 'Unknown')
        ORDER BY station_count DESC, district ASC;
        """
    )
    district_rows = db.execute(districts_query).mappings().all()

    total_readings = 0
    valid_readings = 0
    suspect_readings = 0
    invalid_readings = 0
    stations_with_readings = 0

    district_stats: List[Dict[str, Any]] = []
    for r in district_rows:
        rc = int(r["reading_count"] or 0)
        vr = int(r["valid_readings"] or 0)
        sr = int(r["suspect_readings"] or 0)
        ir = int(r["invalid_readings"] or 0)
        total_readings += rc
        valid_readings += vr
        suspect_readings += sr
        invalid_readings += ir
        stations_with_readings += int(r["active_stations"] or 0)
        district_stats.append({
            "district": r["district"],
            "station_count": int(r["station_count"] or 0),
            "reading_count": rc,
            "valid_readings": vr,
            "suspect_readings": sr,
            "invalid_readings": ir,
        })

    stations_without_readings = max(0, total_stations - stations_with_readings)

    return {
        "overall": {
            "total_stations": int(total_stations),
            "total_readings": total_readings,
            "valid_readings": valid_readings,
            "suspect_readings": suspect_readings,
            "invalid_readings": invalid_readings,
            "earliest_reading_timestamp": earliest_ts,
            "latest_reading_timestamp": latest_ts,
        },
        "station_freshness": {
            "stations_with_readings": stations_with_readings,
            "stations_without_readings": stations_without_readings,
        },
        "districts": district_stats,
    }


def get_recent_readings(db: Session, limit: int = 10) -> List[Dict[str, Any]]:
    """
    Retrieve the latest groundwater telemetry readings across the network with joined station metadata.
    Leverages the index on readings.timestamp with server-side limit for fast execution (<100ms).
    """
    stmt = (
        select(
            Reading.id.label("reading_id"),
            Reading.timestamp,
            Reading.station_id,
            Station.station_name,
            Station.district,
            Reading.groundwater_level,
            Reading.data_quality,
            Reading.quality_reason,
        )
        .join(Station, Reading.station_id == Station.id)
        .order_by(Reading.timestamp.desc(), Reading.id.desc())
        .limit(limit)
    )
    rows = db.execute(stmt).mappings().all()
    return [
        {
            "reading_id": r["reading_id"],
            "timestamp": r["timestamp"],
            "station_id": r["station_id"],
            "station_name": r["station_name"],
            "district": r["district"],
            "groundwater_level": float(r["groundwater_level"]),
            "data_quality": r["data_quality"],
            "quality_reason": r["quality_reason"],
        }
        for r in rows
    ]

