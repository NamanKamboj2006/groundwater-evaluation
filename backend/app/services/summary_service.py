from typing import Optional, Dict, Any
from sqlalchemy import text
from sqlalchemy.orm import Session


def get_overall_summary(db: Session) -> Dict[str, Any]:
    """
    Retrieve statewide summary metrics using fast SQL aggregate functions.
    Excludes invalid sentinel readings from min/max/average calculations.
    """
    # 1. Station count
    total_stations = db.execute(text("SELECT COUNT(*) FROM stations;")).scalar() or 0

    # 2. Reading metrics and aggregations
    readings_query = text(
        """
        SELECT 
            COUNT(*) AS total_readings,
            COUNT(*) FILTER (WHERE data_quality = 'valid') AS valid_readings,
            COUNT(*) FILTER (WHERE data_quality = 'suspect') AS suspect_readings,
            COUNT(*) FILTER (WHERE data_quality = 'invalid') AS invalid_readings,
            MIN(timestamp) AS earliest_reading_timestamp,
            MAX(timestamp) AS latest_reading_timestamp,
            MIN(groundwater_level) FILTER (WHERE data_quality != 'invalid') AS min_groundwater_level,
            MAX(groundwater_level) FILTER (WHERE data_quality != 'invalid') AS max_groundwater_level,
            AVG(groundwater_level) FILTER (WHERE data_quality != 'invalid') AS avg_groundwater_level
        FROM readings;
        """
    )
    row = db.execute(readings_query).mappings().one()

    return {
        "total_stations": int(total_stations),
        "total_readings": int(row["total_readings"] or 0),
        "valid_readings": int(row["valid_readings"] or 0),
        "suspect_readings": int(row["suspect_readings"] or 0),
        "invalid_readings": int(row["invalid_readings"] or 0),
        "earliest_reading_timestamp": row["earliest_reading_timestamp"],
        "latest_reading_timestamp": row["latest_reading_timestamp"],
        "min_groundwater_level": float(row["min_groundwater_level"]) if row["min_groundwater_level"] is not None else None,
        "max_groundwater_level": float(row["max_groundwater_level"]) if row["max_groundwater_level"] is not None else None,
        "avg_groundwater_level": round(float(row["avg_groundwater_level"]), 3) if row["avg_groundwater_level"] is not None else None,
    }


def get_district_summary(db: Session, district: str) -> Optional[Dict[str, Any]]:
    """
    Retrieve summary analytics for a specific district.
    Excludes invalid sentinel readings from min/max/average calculations.
    Returns None if no matching district is found.
    """
    cleaned_district = district.strip()
    if not cleaned_district:
        return None

    # Check if district exists in stations
    district_match_query = text(
        """
        SELECT DISTINCT district
        FROM stations
        WHERE district ILIKE :dist_pattern
        LIMIT 1;
        """
    )
    matched_district_name = db.execute(district_match_query, {"dist_pattern": f"{cleaned_district}"}).scalar_one_or_none()

    if not matched_district_name:
        # Fallback to substring search if exact case-insensitive match not found
        matched_district_name = db.execute(
            district_match_query, {"dist_pattern": f"%{cleaned_district}%"}
        ).scalar_one_or_none()

    if not matched_district_name:
        return None

    query = text(
        """
        SELECT 
            COUNT(DISTINCT s.id) AS total_stations,
            COUNT(r.id) AS total_readings,
            COUNT(r.id) FILTER (WHERE r.data_quality = 'valid') AS valid_readings,
            COUNT(r.id) FILTER (WHERE r.data_quality = 'suspect') AS suspect_readings,
            COUNT(r.id) FILTER (WHERE r.data_quality = 'invalid') AS invalid_readings,
            MIN(r.groundwater_level) FILTER (WHERE r.data_quality != 'invalid') AS min_groundwater_level,
            MAX(r.groundwater_level) FILTER (WHERE r.data_quality != 'invalid') AS max_groundwater_level,
            AVG(r.groundwater_level) FILTER (WHERE r.data_quality != 'invalid') AS avg_groundwater_level,
            MIN(r.timestamp) AS earliest_reading_timestamp,
            MAX(r.timestamp) AS latest_reading_timestamp
        FROM stations s
        LEFT JOIN readings r ON r.station_id = s.id
        WHERE s.district = :district_name;
        """
    )
    row = db.execute(query, {"district_name": matched_district_name}).mappings().one()

    return {
        "district": matched_district_name,
        "total_stations": int(row["total_stations"] or 0),
        "total_readings": int(row["total_readings"] or 0),
        "valid_readings": int(row["valid_readings"] or 0),
        "suspect_readings": int(row["suspect_readings"] or 0),
        "invalid_readings": int(row["invalid_readings"] or 0),
        "min_groundwater_level": float(row["min_groundwater_level"]) if row["min_groundwater_level"] is not None else None,
        "max_groundwater_level": float(row["max_groundwater_level"]) if row["max_groundwater_level"] is not None else None,
        "avg_groundwater_level": round(float(row["avg_groundwater_level"]), 3) if row["avg_groundwater_level"] is not None else None,
        "earliest_reading_timestamp": row["earliest_reading_timestamp"],
        "latest_reading_timestamp": row["latest_reading_timestamp"],
    }
