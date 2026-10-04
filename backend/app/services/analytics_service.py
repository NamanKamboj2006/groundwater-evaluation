from datetime import datetime
from typing import List, Optional, Dict, Any
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.station import Station
from app.models.reading import Reading


def get_station_trend(
    db: Session,
    station_id: int,
    start_time: Optional[datetime] = None,
    end_time: Optional[datetime] = None,
    data_quality: Optional[str] = None,
    limit: int = 500,
) -> Optional[List[Dict[str, Any]]]:
    """
    Retrieve chronological groundwater level trend data points for a specific station.
    Returns None if the station ID does not exist.
    """
    # 1. Validate station existence
    station_exists = db.execute(
        select(Station.id).where(Station.id == station_id)
    ).scalar_one_or_none()

    if station_exists is None:
        return None

    # 2. Query readings for the station
    stmt = select(
        Reading.timestamp,
        Reading.groundwater_level,
        Reading.data_quality,
    ).where(Reading.station_id == station_id)

    if start_time is not None and isinstance(start_time, datetime):
        stmt = stmt.where(Reading.timestamp >= start_time)

    if end_time is not None and isinstance(end_time, datetime):
        stmt = stmt.where(Reading.timestamp <= end_time)

    if data_quality and isinstance(data_quality, str) and data_quality.strip():
        stmt = stmt.where(Reading.data_quality.ilike(data_quality.strip()))

    # Chronological sort order and capped limit
    effective_limit = min(max(1, limit), 5000) if isinstance(limit, int) else 500
    stmt = stmt.order_by(Reading.timestamp.asc(), Reading.id.asc()).limit(effective_limit)

    rows = db.execute(stmt).all()

    return [
        {
            "timestamp": row.timestamp,
            "groundwater_level": float(row.groundwater_level),
            "data_quality": row.data_quality,
        }
        for row in rows
    ]


def get_groundwater_trend(db: Session) -> Dict[str, Any]:
    """
    Retrieve chronological monthly aggregated groundwater level trend for valid readings.
    Aggregates in PostgreSQL using DATE_TRUNC and AVG. Excludes non-valid observations.
    """
    from sqlalchemy import text
    query = text(
        """
        SELECT
            TO_CHAR(DATE_TRUNC('month', timestamp), 'YYYY-MM') AS month,
            ROUND(AVG(groundwater_level)::numeric, 2) AS average_groundwater_level,
            COUNT(*) AS reading_count
        FROM readings
        WHERE data_quality = 'valid'
          AND groundwater_level IS NOT NULL
        GROUP BY DATE_TRUNC('month', timestamp)
        ORDER BY DATE_TRUNC('month', timestamp) ASC;
        """
    )
    rows = db.execute(query).mappings().all()

    data = [
        {
            "month": str(r["month"]),
            "average_groundwater_level": float(r["average_groundwater_level"]),
            "reading_count": int(r["reading_count"]),
        }
        for r in rows
    ]

    return {
        "data": data,
        "total_months": len(data),
    }


def get_groundwater_trend_analysis(db: Session) -> Optional[Dict[str, Any]]:
    """
    Perform statistical ordinary least squares (OLS) linear regression analysis on monthly
    aggregated groundwater trend data.
    Uses database-aggregated monthly time-series points without loading raw individual readings into Python.

    Calculates:
    - OLS Slope (m/month -> m/year)
    - Direction (Increasing / Decreasing / Stable)
    - Strength (Weak / Moderate / Strong based on slope magnitude in m/year)
    - Total net change over the observation period
    """
    trend_result = get_groundwater_trend(db)
    data = trend_result.get("data", [])
    n = len(data)

    if n < 2:
        return None

    start_month = data[0]["month"]
    end_month = data[-1]["month"]
    start_average_level = data[0]["average_groundwater_level"]
    end_average_level = data[-1]["average_groundwater_level"]
    total_change = round(end_average_level - start_average_level, 2)

    # OLS Linear Regression: y = mx + c
    # x = month index (0, 1, 2, ..., n-1)
    # y = monthly average groundwater level (m)
    x_vals = list(range(n))
    y_vals = [d["average_groundwater_level"] for d in data]

    x_mean = sum(x_vals) / n
    y_mean = sum(y_vals) / n

    numerator = sum((x - x_mean) * (y - y_mean) for x, y in zip(x_vals, y_vals))
    denominator = sum((x - x_mean) ** 2 for x in x_vals)

    slope_m_per_month = numerator / denominator if denominator != 0 else 0.0
    slope_m_per_year = round(slope_m_per_month * 12.0, 2)

    # Direction based on numeric measurement slope
    # Near-zero defined as within [-0.05, 0.05] m/year (less than 5 cm change per year)
    if abs(slope_m_per_year) < 0.05:
        direction = "Stable"
    elif slope_m_per_year > 0:
        direction = "Increasing"
    else:
        direction = "Decreasing"

    # Strength classification based on slope magnitude (|slope| in m/yr):
    # - Weak: < 0.25 m/year (< 25 cm/yr)
    # - Moderate: 0.25 to 1.0 m/year
    # - Strong: >= 1.0 m/year
    abs_slope = abs(slope_m_per_year)
    if abs_slope < 0.25:
        strength = "Weak"
    elif abs_slope < 1.0:
        strength = "Moderate"
    else:
        strength = "Strong"

    return {
        "start_month": start_month,
        "end_month": end_month,
        "number_of_months": n,
        "start_average_level": start_average_level,
        "end_average_level": end_average_level,
        "total_change": total_change,
        "slope_m_per_year": slope_m_per_year,
        "direction": direction,
        "strength": strength,
    }


def get_station_groundwater_trend(db: Session, station_id: int) -> Optional[Dict[str, Any]]:
    """
    Retrieve chronological monthly aggregated groundwater level trend for valid readings of a specific station.
    Aggregates in PostgreSQL using DATE_TRUNC, AVG, and COUNT.
    Returns None if the station ID does not exist.
    """
    # 1. Validate station existence
    station = db.execute(
        select(Station.id, Station.station_name).where(Station.id == station_id)
    ).first()

    if not station:
        return None

    # 2. Query monthly aggregated valid readings
    from sqlalchemy import text
    query = text(
        """
        SELECT
            TO_CHAR(DATE_TRUNC('month', timestamp), 'YYYY-MM') AS month,
            ROUND(AVG(groundwater_level)::numeric, 2) AS average_groundwater_level,
            COUNT(*) AS reading_count
        FROM readings
        WHERE station_id = :station_id
          AND data_quality = 'valid'
          AND groundwater_level IS NOT NULL
        GROUP BY DATE_TRUNC('month', timestamp)
        ORDER BY DATE_TRUNC('month', timestamp) ASC;
        """
    )
    rows = db.execute(query, {"station_id": station_id}).mappings().all()

    data = [
        {
            "month": str(r["month"]),
            "average_groundwater_level": float(r["average_groundwater_level"]),
            "reading_count": int(r["reading_count"]),
        }
        for r in rows
    ]

    return {
        "station_id": station[0],
        "station_name": station[1],
        "data": data,
        "total_months": len(data),
    }


def get_station_groundwater_trend_analysis(db: Session, station_id: int) -> Optional[Dict[str, Any]]:
    """
    Perform statistical ordinary least squares (OLS) linear regression analysis on monthly
    aggregated groundwater trend data for a specific station.
    Uses database-aggregated monthly time-series points without loading raw individual readings.

    Calculates:
    - OLS Slope (m/month -> m/year)
    - Direction (Increasing / Decreasing / Stable)
    - Strength (Weak / Moderate / Strong based on slope magnitude in m/year)
    - Total net change over the observation period
    """
    trend_result = get_station_groundwater_trend(db, station_id)
    if trend_result is None:
        return None

    data = trend_result.get("data", [])
    n = len(data)
    station_name = trend_result.get("station_name", "")

    if n < 2:
        return {
            "station_id": station_id,
            "station_name": station_name,
            "start_month": data[0]["month"] if n == 1 else "",
            "end_month": data[0]["month"] if n == 1 else "",
            "number_of_months": n,
            "start_average_level": data[0]["average_groundwater_level"] if n == 1 else 0.0,
            "end_average_level": data[0]["average_groundwater_level"] if n == 1 else 0.0,
            "total_change": 0.0,
            "slope_m_per_year": 0.0,
            "direction": "Stable",
            "strength": "Weak",
        }

    start_month = data[0]["month"]
    end_month = data[-1]["month"]
    start_average_level = data[0]["average_groundwater_level"]
    end_average_level = data[-1]["average_groundwater_level"]
    total_change = round(end_average_level - start_average_level, 2)

    # OLS Linear Regression: y = mx + c
    x_vals = list(range(n))
    y_vals = [d["average_groundwater_level"] for d in data]

    x_mean = sum(x_vals) / n
    y_mean = sum(y_vals) / n

    numerator = sum((x - x_mean) * (y - y_mean) for x, y in zip(x_vals, y_vals))
    denominator = sum((x - x_mean) ** 2 for x in x_vals)

    slope_m_per_month = numerator / denominator if denominator != 0 else 0.0
    slope_m_per_year = round(slope_m_per_month * 12.0, 2)

    # Direction based on numeric measurement slope
    # Near-zero defined as within [-0.05, 0.05] m/year (less than 5 cm change per year)
    if abs(slope_m_per_year) < 0.05:
        direction = "Stable"
    elif slope_m_per_year > 0:
        direction = "Increasing"
    else:
        direction = "Decreasing"

    # Strength classification based on slope magnitude (|slope| in m/yr):
    # - Weak: < 0.25 m/year (< 25 cm/yr)
    # - Moderate: 0.25 to 1.0 m/year
    # - Strong: >= 1.0 m/year
    abs_slope = abs(slope_m_per_year)
    if abs_slope < 0.25:
        strength = "Weak"
    elif abs_slope < 1.0:
        strength = "Moderate"
    else:
        strength = "Strong"

    return {
        "station_id": station_id,
        "station_name": station_name,
        "start_month": start_month,
        "end_month": end_month,
        "number_of_months": n,
        "start_average_level": start_average_level,
        "end_average_level": end_average_level,
        "total_change": total_change,
        "slope_m_per_year": slope_m_per_year,
        "direction": direction,
        "strength": strength,
    }


def get_station_data_quality(db: Session, station_id: int) -> Optional[Dict[str, Any]]:
    """
    Retrieve data quality breakdown and percentages for a specific station.
    Returns None if the station does not exist.
    """
    from sqlalchemy import text
    station = db.execute(
        select(Station.id).where(Station.id == station_id)
    ).scalar_one_or_none()

    if station is None:
        return None

    query = text(
        """
        SELECT 
            COUNT(*) AS total_readings,
            COUNT(*) FILTER (WHERE data_quality = 'valid') AS valid_readings,
            COUNT(*) FILTER (WHERE data_quality = 'suspect') AS suspect_readings,
            COUNT(*) FILTER (WHERE data_quality = 'invalid') AS invalid_readings
        FROM readings
        WHERE station_id = :station_id;
        """
    )
    row = db.execute(query, {"station_id": station_id}).mappings().first()
    total = int(row["total_readings"]) if row and row["total_readings"] is not None else 0
    valid = int(row["valid_readings"]) if row and row["valid_readings"] is not None else 0
    suspect = int(row["suspect_readings"]) if row and row["suspect_readings"] is not None else 0
    invalid = int(row["invalid_readings"]) if row and row["invalid_readings"] is not None else 0

    valid_pct = round((valid / total) * 100, 2) if total > 0 else 0.0
    suspect_pct = round((suspect / total) * 100, 2) if total > 0 else 0.0
    invalid_pct = round((invalid / total) * 100, 2) if total > 0 else 0.0

    return {
        "station_id": station_id,
        "total_readings": total,
        "valid_readings": valid,
        "suspect_readings": suspect,
        "invalid_readings": invalid,
        "valid_percentage": valid_pct,
        "suspect_percentage": suspect_pct,
        "invalid_percentage": invalid_pct,
    }


def get_station_anomalies(db: Session, station_id: int) -> Optional[Dict[str, Any]]:
    """
    Perform statistical anomaly and data-quality screening on monthly valid groundwater observations for a station.
    Uses IQR method for outlier and sudden change screening, plus median-relative monthly coverage evaluation.
    Screening only — not an automated diagnosis.
    """
    import numpy as np

    trend_result = get_station_groundwater_trend(db, station_id)
    if trend_result is None:
        return None

    data = trend_result.get("data", [])
    station_name = trend_result.get("station_name", "")
    n = len(data)

    # 1. Outlier Screening (IQR Method)
    outliers = []
    lower_bound = None
    upper_bound = None
    if n >= 4:
        y_vals = np.array([d["average_groundwater_level"] for d in data])
        q1, q3 = np.percentile(y_vals, [25, 75])
        iqr = float(q3 - q1)
        lower_bound = round(float(q1 - 1.5 * iqr), 2)
        upper_bound = round(float(q3 + 1.5 * iqr), 2)

        for d in data:
            lvl = d["average_groundwater_level"]
            if lvl < lower_bound or lvl > upper_bound:
                outliers.append({
                    "month": d["month"],
                    "average_groundwater_level": lvl,
                    "reason": "Potential statistical outlier (exceeds IQR bounds)",
                })

    outlier_screening = {
        "method": "IQR",
        "sample_size": n,
        "lower_bound": lower_bound,
        "upper_bound": upper_bound,
        "outlier_count": len(outliers),
        "outliers": outliers,
    }

    # 2. Sudden Change Screening (IQR on absolute month-to-month changes)
    changes = []
    sudden_changes = []
    threshold = None
    if n >= 2:
        for i in range(1, n):
            prev = data[i - 1]
            curr = data[i]
            diff = round(curr["average_groundwater_level"] - prev["average_groundwater_level"], 2)
            abs_diff = abs(diff)
            changes.append({
                "from_month": prev["month"],
                "to_month": curr["month"],
                "change": diff,
                "absolute_change": round(abs_diff, 2),
            })

    if len(changes) >= 4:
        diff_vals = np.array([c["absolute_change"] for c in changes])
        cq1, cq3 = np.percentile(diff_vals, [25, 75])
        ciqr = float(cq3 - cq1)
        threshold = round(float(cq1 + 1.5 * ciqr), 2)

        for c in changes:
            if c["absolute_change"] > threshold:
                sudden_changes.append({
                    "from_month": c["from_month"],
                    "to_month": c["to_month"],
                    "change": c["change"],
                    "absolute_change": c["absolute_change"],
                    "reason": f"Potential sudden change (|Δ| > {threshold} m)",
                })

    sudden_change_screening = {
        "method": "IQR",
        "threshold": threshold,
        "sudden_change_count": len(sudden_changes),
        "changes": sudden_changes,
    }

    # 3. Monthly Coverage Screening (median monthly valid readings)
    monthly_coverage = []
    med_count = None
    low_cov_threshold = None
    low_cov_count = 0

    if n > 0:
        counts = [d["reading_count"] for d in data]
        if n >= 3:
            med_count = round(float(np.median(counts)), 1)
            low_cov_threshold = round(med_count * 0.5, 1)

        for d in data:
            cnt = d["reading_count"]
            is_low = low_cov_threshold is not None and cnt < low_cov_threshold
            if is_low:
                low_cov_count += 1
            monthly_coverage.append({
                "month": d["month"],
                "valid_readings": cnt,
                "coverage_status": "Low coverage" if is_low else "Normal",
            })

    coverage_screening = {
        "median_monthly_readings": med_count,
        "low_coverage_threshold": low_cov_threshold,
        "low_coverage_count": low_cov_count,
        "monthly_coverage": monthly_coverage,
    }

    # 4. Overall Screening Summary
    total_flags = len(outliers) + len(sudden_changes) + low_cov_count
    overall_status = "Review Recommended" if total_flags > 0 else "No Major Flags"

    summary = {
        "potential_outliers": len(outliers),
        "potential_sudden_changes": len(sudden_changes),
        "low_coverage_months": low_cov_count,
        "overall_screening_status": overall_status,
    }

    return {
        "station_id": station_id,
        "station_name": station_name,
        "summary": summary,
        "outlier_screening": outlier_screening,
        "sudden_change_screening": sudden_change_screening,
        "coverage_screening": coverage_screening,
    }


def get_districts_summary(db: Session) -> List[Dict[str, Any]]:
    """
    Retrieve summary statistics for all districts from PostgreSQL.
    Aggregates monitoring station counts, observations breakdown, and valid groundwater level stats.
    """
    from sqlalchemy import text
    query = text(
        """
        SELECT
            s.district,
            COUNT(DISTINCT s.id) AS station_count,
            COUNT(r.id) AS total_readings,
            COUNT(r.id) FILTER (WHERE r.data_quality = 'valid') AS valid_readings,
            COUNT(r.id) FILTER (WHERE r.data_quality = 'suspect') AS suspect_readings,
            COUNT(r.id) FILTER (WHERE r.data_quality = 'invalid') AS invalid_readings,
            ROUND(AVG(r.groundwater_level) FILTER (WHERE r.data_quality = 'valid')::numeric, 2) AS average_groundwater_level,
            ROUND(MIN(r.groundwater_level) FILTER (WHERE r.data_quality = 'valid')::numeric, 2) AS min_groundwater_level,
            ROUND(MAX(r.groundwater_level) FILTER (WHERE r.data_quality = 'valid')::numeric, 2) AS max_groundwater_level,
            MIN(r.timestamp) AS earliest_reading_timestamp,
            MAX(r.timestamp) AS latest_reading_timestamp
        FROM stations s
        LEFT JOIN readings r ON s.id = r.station_id
        WHERE s.district IS NOT NULL
        GROUP BY s.district
        ORDER BY s.district ASC;
        """
    )
    rows = db.execute(query).mappings().all()

    return [
        {
            "district": r["district"],
            "station_count": int(r["station_count"]),
            "total_readings": int(r["total_readings"]),
            "valid_readings": int(r["valid_readings"]),
            "suspect_readings": int(r["suspect_readings"]),
            "invalid_readings": int(r["invalid_readings"]),
            "average_groundwater_level": float(r["average_groundwater_level"]) if r["average_groundwater_level"] is not None else None,
            "min_groundwater_level": float(r["min_groundwater_level"]) if r["min_groundwater_level"] is not None else None,
            "max_groundwater_level": float(r["max_groundwater_level"]) if r["max_groundwater_level"] is not None else None,
            "earliest_reading_timestamp": r["earliest_reading_timestamp"],
            "latest_reading_timestamp": r["latest_reading_timestamp"],
        }
        for r in rows
    ]


def get_district_summary(db: Session, district: str) -> Optional[Dict[str, Any]]:
    """
    Retrieve summary statistics for a specific district (case-insensitive).
    Returns None if no matching district exists.
    """
    from sqlalchemy import text
    query = text(
        """
        SELECT
            s.district,
            COUNT(DISTINCT s.id) AS station_count,
            COUNT(r.id) AS total_readings,
            COUNT(r.id) FILTER (WHERE r.data_quality = 'valid') AS valid_readings,
            COUNT(r.id) FILTER (WHERE r.data_quality = 'suspect') AS suspect_readings,
            COUNT(r.id) FILTER (WHERE r.data_quality = 'invalid') AS invalid_readings,
            ROUND(AVG(r.groundwater_level) FILTER (WHERE r.data_quality = 'valid')::numeric, 2) AS average_groundwater_level,
            ROUND(MIN(r.groundwater_level) FILTER (WHERE r.data_quality = 'valid')::numeric, 2) AS min_groundwater_level,
            ROUND(MAX(r.groundwater_level) FILTER (WHERE r.data_quality = 'valid')::numeric, 2) AS max_groundwater_level,
            MIN(r.timestamp) AS earliest_reading_timestamp,
            MAX(r.timestamp) AS latest_reading_timestamp
        FROM stations s
        LEFT JOIN readings r ON s.id = r.station_id
        WHERE s.district ILIKE :district
        GROUP BY s.district;
        """
    )
    row = db.execute(query, {"district": district.strip()}).mappings().first()
    if not row:
        return None

    return {
        "district": row["district"],
        "station_count": int(row["station_count"]),
        "total_readings": int(row["total_readings"]),
        "valid_readings": int(row["valid_readings"]),
        "suspect_readings": int(row["suspect_readings"]),
        "invalid_readings": int(row["invalid_readings"]),
        "average_groundwater_level": float(row["average_groundwater_level"]) if row["average_groundwater_level"] is not None else None,
        "min_groundwater_level": float(row["min_groundwater_level"]) if row["min_groundwater_level"] is not None else None,
        "max_groundwater_level": float(row["max_groundwater_level"]) if row["max_groundwater_level"] is not None else None,
        "earliest_reading_timestamp": row["earliest_reading_timestamp"],
        "latest_reading_timestamp": row["latest_reading_timestamp"],
    }


def get_district_groundwater_trend(db: Session, district: str) -> Optional[Dict[str, Any]]:
    """
    Retrieve chronological monthly aggregated groundwater level trend for valid readings of a specific district.
    Aggregates in PostgreSQL using DATE_TRUNC, AVG, and COUNT.
    Returns None if district does not exist.
    """
    from sqlalchemy import text
    # 1. Validate district existence
    dist_info = db.execute(
        text("SELECT district, COUNT(id) AS station_count FROM stations WHERE district ILIKE :district GROUP BY district"),
        {"district": district.strip()}
    ).mappings().first()

    if not dist_info:
        return None

    # 2. Query monthly aggregated valid readings
    query = text(
        """
        SELECT
            TO_CHAR(DATE_TRUNC('month', r.timestamp), 'YYYY-MM') AS month,
            ROUND(AVG(r.groundwater_level)::numeric, 2) AS average_groundwater_level,
            COUNT(r.id) AS reading_count
        FROM stations s
        JOIN readings r ON s.id = r.station_id
        WHERE s.district ILIKE :district
          AND r.data_quality = 'valid'
          AND r.groundwater_level IS NOT NULL
        GROUP BY DATE_TRUNC('month', r.timestamp)
        ORDER BY DATE_TRUNC('month', r.timestamp) ASC;
        """
    )
    rows = db.execute(query, {"district": district.strip()}).mappings().all()

    data = [
        {
            "month": str(r["month"]),
            "average_groundwater_level": float(r["average_groundwater_level"]),
            "reading_count": int(r["reading_count"]),
        }
        for r in rows
    ]

    return {
        "district": dist_info["district"],
        "station_count": int(dist_info["station_count"]),
        "data": data,
        "total_months": len(data),
    }


def get_district_groundwater_trend_analysis(db: Session, district: str) -> Optional[Dict[str, Any]]:
    """
    Perform statistical ordinary least squares (OLS) linear regression analysis on monthly
    aggregated groundwater trend data for a specific district.
    Uses database-aggregated monthly time-series points without loading raw individual readings.

    Calculates:
    - OLS Slope (m/month -> m/year)
    - Direction (Increasing / Decreasing / Stable)
    - Strength (Weak / Moderate / Strong based on slope magnitude in m/year)
    - Total net change over the observation period
    """
    trend_result = get_district_groundwater_trend(db, district)
    if trend_result is None:
        return None

    data = trend_result.get("data", [])
    n = len(data)
    district_name = trend_result.get("district", district)
    station_count = trend_result.get("station_count", 0)

    if n < 2:
        return {
            "district": district_name,
            "station_count": station_count,
            "start_month": data[0]["month"] if n == 1 else "",
            "end_month": data[0]["month"] if n == 1 else "",
            "number_of_months": n,
            "start_average_level": data[0]["average_groundwater_level"] if n == 1 else 0.0,
            "end_average_level": data[0]["average_groundwater_level"] if n == 1 else 0.0,
            "total_change": 0.0,
            "slope_m_per_year": 0.0,
            "direction": "Stable",
            "strength": "Weak",
        }

    start_month = data[0]["month"]
    end_month = data[-1]["month"]
    start_average_level = data[0]["average_groundwater_level"]
    end_average_level = data[-1]["average_groundwater_level"]
    total_change = round(end_average_level - start_average_level, 2)

    # OLS Linear Regression: y = mx + c
    x_vals = list(range(n))
    y_vals = [d["average_groundwater_level"] for d in data]

    x_mean = sum(x_vals) / n
    y_mean = sum(y_vals) / n

    numerator = sum((x - x_mean) * (y - y_mean) for x, y in zip(x_vals, y_vals))
    denominator = sum((x - x_mean) ** 2 for x in x_vals)

    slope_m_per_month = numerator / denominator if denominator != 0 else 0.0
    slope_m_per_year = round(slope_m_per_month * 12.0, 2)

    # Direction based on numeric measurement slope
    # Near-zero defined as within [-0.05, 0.05] m/year (less than 5 cm change per year)
    if abs(slope_m_per_year) < 0.05:
        direction = "Stable"
    elif slope_m_per_year > 0:
        direction = "Increasing"
    else:
        direction = "Decreasing"

    # Strength classification based on slope magnitude (|slope| in m/yr):
    # - Weak: < 0.25 m/year (< 25 cm/yr)
    # - Moderate: 0.25 to 1.0 m/year
    # - Strong: >= 1.0 m/year
    abs_slope = abs(slope_m_per_year)
    if abs_slope < 0.25:
        strength = "Weak"
    elif abs_slope < 1.0:
        strength = "Moderate"
    else:
        strength = "Strong"

    return {
        "district": district_name,
        "station_count": station_count,
        "start_month": start_month,
        "end_month": end_month,
        "number_of_months": n,
        "start_average_level": start_average_level,
        "end_average_level": end_average_level,
        "total_change": total_change,
        "slope_m_per_year": slope_m_per_year,
        "direction": direction,
        "strength": strength,
    }


def get_district_comparison(db: Session) -> Dict[str, Any]:
    """
    Retrieve statewide comparative analytics across all districts in a single aggregated operation.
    Computes station counts, observation totals, average groundwater levels, and linear regression trend slopes.
    """
    from sqlalchemy import text
    from collections import defaultdict

    # 1. District summary query
    summary_list = get_districts_summary(db)
    summary_map = {d["district"]: d for d in summary_list}

    # 2. District monthly trend query for all districts
    monthly_query = text(
        """
        SELECT
            s.district,
            TO_CHAR(DATE_TRUNC('month', r.timestamp), 'YYYY-MM') AS month,
            ROUND(AVG(r.groundwater_level)::numeric, 2) AS average_groundwater_level,
            COUNT(r.id) AS reading_count
        FROM stations s
        JOIN readings r ON s.id = r.station_id
        WHERE s.district IS NOT NULL
          AND r.data_quality = 'valid'
          AND r.groundwater_level IS NOT NULL
        GROUP BY s.district, DATE_TRUNC('month', r.timestamp)
        ORDER BY s.district ASC, DATE_TRUNC('month', r.timestamp) ASC;
        """
    )
    rows = db.execute(monthly_query).mappings().all()

    dist_points = defaultdict(list)
    for r in rows:
        dist_points[r["district"]].append({
            "month": str(r["month"]),
            "average_groundwater_level": float(r["average_groundwater_level"]),
        })

    comparison_data = []
    for d_item in summary_list:
        dist_name = d_item["district"]
        points = dist_points.get(dist_name, [])
        n = len(points)

        slope_yr = None
        direction = None
        strength = None
        total_change = None
        start_m = None
        end_m = None

        if n >= 2:
            start_m = points[0]["month"]
            end_m = points[-1]["month"]
            total_change = round(points[-1]["average_groundwater_level"] - points[0]["average_groundwater_level"], 2)

            x = list(range(n))
            y = [p["average_groundwater_level"] for p in points]
            x_mean = sum(x) / n
            y_mean = sum(y) / n
            num = sum((xi - x_mean) * (yi - y_mean) for xi, yi in zip(x, y))
            den = sum((xi - x_mean) ** 2 for xi in x)
            slope_m = num / den if den != 0 else 0.0
            slope_yr = round(slope_m * 12.0, 2)

            if abs(slope_yr) < 0.05:
                direction = "Stable"
            elif slope_yr > 0:
                direction = "Increasing"
            else:
                direction = "Decreasing"

            abs_slope = abs(slope_yr)
            if abs_slope < 0.25:
                strength = "Weak"
            elif abs_slope < 1.0:
                strength = "Moderate"
            else:
                strength = "Strong"
        elif n == 1:
            start_m = points[0]["month"]
            end_m = points[0]["month"]
            total_change = 0.0
            slope_yr = 0.0
            direction = "Stable"
            strength = "Weak"

        comparison_data.append({
            "district": dist_name,
            "station_count": d_item["station_count"],
            "total_readings": d_item["total_readings"],
            "valid_readings": d_item["valid_readings"],
            "average_groundwater_level": d_item["average_groundwater_level"],
            "number_of_months": n,
            "start_month": start_m,
            "end_month": end_m,
            "slope_m_per_year": slope_yr,
            "direction": direction,
            "strength": strength,
            "total_change": total_change,
        })

    return {
        "total_districts": len(comparison_data),
        "data": comparison_data,
    }




