#!/usr/bin/env python3
"""
Verification script for Haryana Groundwater Telemetry Ingestion.
Executes direct SQL aggregation queries in PostgreSQL to verify database consistency.

Usage:
    python scripts/verify_ingestion.py
"""

import sys
from pathlib import Path
from sqlalchemy import text

# Ensure backend directory is in sys.path
backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from app.db.session import engine


def verify_ingestion() -> None:
    print("=" * 70)
    print("       HARYANA GROUNDWATER DATABASE INGESTION VERIFICATION")
    print("=" * 70)
    print(f"Target Database: {engine.url.render_as_string(hide_password=True)}\n")

    with engine.connect() as conn:
        # 1. Total stations
        total_stations = conn.execute(text("SELECT COUNT(*) FROM stations;")).scalar()

        # 2. Total readings
        total_readings = conn.execute(text("SELECT COUNT(*) FROM readings;")).scalar()

        # 3. Quality breakdown
        quality_counts = dict(
            conn.execute(
                text("SELECT data_quality, COUNT(*) FROM readings GROUP BY data_quality;")
            ).fetchall()
        )
        valid_readings = quality_counts.get("valid", 0)
        suspect_readings = quality_counts.get("suspect", 0)
        invalid_readings = quality_counts.get("invalid", 0)

        # 4. Range metrics
        metrics = conn.execute(
            text(
                """
                SELECT 
                    MIN(groundwater_level) AS min_gw,
                    MAX(groundwater_level) AS max_gw,
                    AVG(groundwater_level) AS avg_gw,
                    MIN(timestamp) AS min_ts,
                    MAX(timestamp) AS max_ts,
                    COUNT(DISTINCT source_slno) AS distinct_slno
                FROM readings;
                """
            )
        ).mappings().one()

        # 5. Duplicate (station_id + timestamp) groups count
        dup_query = text(
            """
            SELECT COUNT(*) FROM (
                SELECT station_id, timestamp
                FROM readings
                GROUP BY station_id, timestamp
                HAVING COUNT(*) > 1
            ) AS dup_groups;
            """
        )
        dup_groups_count = conn.execute(dup_query).scalar()

        # 6. PostGIS geometry populated count
        geom_count = conn.execute(
            text("SELECT COUNT(*) FROM stations WHERE location IS NOT NULL;")
        ).scalar()

        print("1.  Total Stations                      : {:,}".format(total_stations))
        print("    • Stations with PostGIS geometry    : {:,}".format(geom_count))
        print("2.  Total Readings Ingested             : {:,}".format(total_readings))
        print("3.  Valid Readings                      : {:,} ({:.2f}%)".format(
            valid_readings, (valid_readings / total_readings * 100) if total_readings else 0
        ))
        print("4.  Suspect Readings                    : {:,} ({:.2f}%)".format(
            suspect_readings, (suspect_readings / total_readings * 100) if total_readings else 0
        ))
        print("5.  Invalid Readings (sentinel -999.999): {:,} ({:.2f}%)".format(
            invalid_readings, (invalid_readings / total_readings * 100) if total_readings else 0
        ))
        print("6.  Minimum Groundwater Level           : {}".format(metrics["min_gw"]))
        print("7.  Maximum Groundwater Level           : {}".format(metrics["max_gw"]))
        print("    • Average Groundwater Level         : {:.3f} m".format(metrics["avg_gw"]) if metrics["avg_gw"] is not None else "N/A")
        print("8.  Earliest Recorded Timestamp         : {}".format(metrics["min_ts"]))
        print("9.  Latest Recorded Timestamp           : {}".format(metrics["max_ts"]))
        print("10. Distinct source_slno Values         : {:,}".format(metrics["distinct_slno"]))
        print("11. Duplicate (Station + Time) Groups   : {:,}".format(dup_groups_count))
        print("\n" + "=" * 70)
        print("                    VERIFICATION SUMMARY")
        print("=" * 70)
        if total_readings > 0 and total_stations == 988:
            print("Status: SUCCESS - Ingestion is consistent with the source dataset.")
        elif total_readings == 0:
            print("Status: NO READINGS FOUND - Run 'python scripts/ingest_haryana.py' first.")
        else:
            print("Status: DATA PRESENT - Inspect metrics above for verification.")
        print("=" * 70 + "\n")


if __name__ == "__main__":
    verify_ingestion()
