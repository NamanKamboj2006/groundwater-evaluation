"""
Haryana DWLR Telemetry CSV Ingestion Service.
--------------------------------------------
Processes multi-hundred MB telemetry CSV datasets in chunks (default 50,000 rows).
- Normalizes stations by (station_name, latitude, longitude).
- Creates PostGIS Point geometry (POINT(lon lat) SRID 4326).
- Assigns ingestion quality flags (invalid, suspect, valid) without altering raw measurements.
- Uses safe sub-batching (2,000 rows per SQL statement) to prevent PostgreSQL 65,535 parameter overflow.
- Safely performs bulk PostgreSQL upserts with on_conflict_do_nothing.
"""

import time
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
from typing import Dict, Tuple, Optional
import pandas as pd
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from geoalchemy2.elements import WKTElement

from app.db.session import SessionLocal
from app.models.station import Station
from app.models.reading import Reading


DATASET_NAME = "haryana_telemetry_2021_2025"
TIME_FORMAT = "%d-%m-%Y %H:%M"
# Maximum rows per SQL INSERT statement (2,000 rows * 7 params = 14,000 params, well below PostgreSQL 65,535 limit)
DB_INSERT_BATCH_SIZE = 2_000


def quantize_decimal(val, decimals: int) -> Optional[Decimal]:
    if val is None:
        return None
    s = str(val).strip()
    if not s or s.lower() in ('nan', 'none', 'null', '-', '--'):
        return None
    try:
        d = Decimal(s)
        fmt = '0.' + '0' * decimals
        return d.quantize(Decimal(fmt), rounding=ROUND_HALF_UP)
    except Exception:
        return None


def resolve_csv_path(input_path: str) -> Path:
    candidates = [
        Path(input_path),
        Path("app/data") / Path(input_path).name,
        Path("data") / Path(input_path).name,
        Path("backend/app/data") / Path(input_path).name,
        Path("backend/data") / Path(input_path).name,
        Path(__file__).resolve().parent.parent / "app" / "data" / Path(input_path).name,
        Path(__file__).resolve().parent.parent / "data" / Path(input_path).name,
    ]
    for p in candidates:
        if p.exists() and p.is_file():
            return p
    return Path(input_path)


def ingest_haryana_telemetry_csv(
    csv_file_path: str = "app/data/haryana_2021_2025.csv",
    chunk_size: int = 50_000,
    max_rows: Optional[int] = None,
) -> Dict:
    start_time = time.time()
    resolved_path = resolve_csv_path(csv_file_path)

    if not resolved_path.exists():
        raise FileNotFoundError(f"Source CSV not found at: {resolved_path.resolve()}")

    print("=" * 65)
    print("Haryana Groundwater CSV Ingestion")
    print("=" * 65)
    print(f"CSV File        : {resolved_path.resolve()}")
    print(f"CSV Chunk size  : {chunk_size:,}")
    print(f"DB Batch size   : {DB_INSERT_BATCH_SIZE:,}")
    print(f"Dataset         : {DATASET_NAME}")
    if max_rows:
        print(f"Row limit       : {max_rows:,} (Test run)")
    print("=" * 65 + "\n")

    # In-memory lookup cache: (station_name, lat_decimal, lon_decimal) -> station_db_id
    station_cache: Dict[Tuple[str, Decimal, Decimal], int] = {}
    
    # Global metrics
    total_source_rows = 0
    total_rows_inserted = 0
    total_rows_skipped = 0
    total_stations_created = 0
    total_stations_reused = 0
    count_valid = 0
    count_suspect = 0
    count_invalid = 0

    # 1. Preload existing stations from database into memory cache
    db = SessionLocal()
    try:
        existing_stations = db.execute(select(Station.id, Station.station_name, Station.latitude, Station.longitude)).all()
        for st_id, st_name, lat, lon in existing_stations:
            key = (str(st_name).strip(), Decimal(str(lat)), Decimal(str(lon)))
            station_cache[key] = st_id
        print(f"Preloaded {len(station_cache):,} existing stations from database.\n")
    finally:
        db.close()

    # Required column names in Haryana CSV
    col_slno = "SlNo"
    col_station = "Station"
    col_agency = "Agency"
    col_state = "State"
    col_district = "District"
    col_tehsil = "Tehsil"
    col_lat = "Latitude"
    col_lon = "Longitude"
    col_rl_msl = "RL_MSL"
    col_time = "Data Acquisition Time"
    col_gw = "Groundwater Level Telemetry 6 Hourly (meter)"

    chunk_reader = pd.read_csv(
        resolved_path,
        chunksize=chunk_size,
        dtype=str,
        keep_default_na=False,
        na_values=[],
        low_memory=False,
    )

    chunk_idx = 0
    for chunk in chunk_reader:
        if max_rows and total_source_rows >= max_rows:
            break

        if max_rows and (total_source_rows + len(chunk)) > max_rows:
            chunk = chunk.iloc[:(max_rows - total_source_rows)]

        chunk_idx += 1
        n_rows = len(chunk)
        total_source_rows += n_rows
        chunk_stations_created = 0
        chunk_stations_reused = 0

        # Fast extraction as native Python lists
        raw_stations = chunk[col_station].str.strip().tolist()
        raw_lats = chunk[col_lat].tolist()
        raw_lons = chunk[col_lon].tolist()
        raw_agencies = chunk[col_agency].str.strip().tolist() if col_agency in chunk.columns else [""] * n_rows
        raw_states = chunk[col_state].str.strip().tolist() if col_state in chunk.columns else [""] * n_rows
        raw_districts = chunk[col_district].str.strip().tolist() if col_district in chunk.columns else [""] * n_rows
        raw_tehsils = chunk[col_tehsil].str.strip().tolist() if col_tehsil in chunk.columns else [""] * n_rows
        raw_rl_msls = chunk[col_rl_msl].tolist() if col_rl_msl in chunk.columns else [""] * n_rows
        raw_slnos = chunk[col_slno].str.strip().tolist()
        raw_gws = chunk[col_gw].str.strip().tolist()

        # Vectorized timestamp parsing with exact format
        parsed_timestamps = pd.to_datetime(
            chunk[col_time].str.strip(),
            format=TIME_FORMAT,
            errors="coerce"
        ).tolist()

        # Process each chunk in a dedicated transaction
        db = SessionLocal()
        try:
            # -------------------------------------------------------------
            # STEP A: Identify and sync Stations for this chunk
            # -------------------------------------------------------------
            unique_chunk_stations = {}
            for st_name, lat_str, lon_str, agency_str, state_str, dist_str, tehsil_str, rl_str in zip(
                raw_stations, raw_lats, raw_lons, raw_agencies, raw_states, raw_districts, raw_tehsils, raw_rl_msls
            ):
                if not st_name:
                    continue

                lat_d = quantize_decimal(lat_str, 7)
                lon_d = quantize_decimal(lon_str, 7)
                if lat_d is None or lon_d is None:
                    continue

                st_key = (st_name, lat_d, lon_d)
                if st_key not in station_cache and st_key not in unique_chunk_stations:
                    unique_chunk_stations[st_key] = {
                        "station_name": st_name,
                        "latitude": lat_d,
                        "longitude": lon_d,
                        "agency": agency_str or None,
                        "state": state_str or None,
                        "district": dist_str or None,
                        "tehsil": tehsil_str or None,
                        "rl_msl": quantize_decimal(rl_str, 3),
                        "location": WKTElement(f"POINT({lon_d} {lat_d})", srid=4326),
                    }

            # Insert newly discovered stations
            if unique_chunk_stations:
                for st_key, st_dict in unique_chunk_stations.items():
                    stmt = (
                        pg_insert(Station)
                        .values(**st_dict)
                        .on_conflict_do_nothing(index_elements=["station_name", "latitude", "longitude"])
                        .returning(Station.id)
                    )
                    res = db.execute(stmt)
                    inserted_id = res.scalar_one_or_none()

                    if inserted_id is not None:
                        station_cache[st_key] = inserted_id
                        chunk_stations_created += 1
                    else:
                        # Fetch existing station ID if inserted in parallel or previous run
                        find_stmt = select(Station.id).where(
                            Station.station_name == st_key[0],
                            Station.latitude == st_key[1],
                            Station.longitude == st_key[2],
                        )
                        existing_id = db.execute(find_stmt).scalar_one()
                        station_cache[st_key] = existing_id
                        chunk_stations_reused += 1

                db.flush()

            total_stations_created += chunk_stations_created

            # -------------------------------------------------------------
            # STEP B: Prepare Readings batch
            # -------------------------------------------------------------
            readings_batch = []
            chunk_valid = 0
            chunk_suspect = 0
            chunk_invalid = 0

            for st_name, lat_str, lon_str, slno_str, ts_obj, gw_str in zip(
                raw_stations, raw_lats, raw_lons, raw_slnos, parsed_timestamps, raw_gws
            ):
                lat_d = quantize_decimal(lat_str, 7)
                lon_d = quantize_decimal(lon_str, 7)
                if not st_name or lat_d is None or lon_d is None:
                    continue

                st_key = (st_name, lat_d, lon_d)
                station_id = station_cache.get(st_key)
                if station_id is None:
                    continue

                try:
                    source_slno = int(slno_str)
                except (ValueError, TypeError):
                    continue

                if pd.isna(ts_obj) or ts_obj is None:
                    continue

                gw_d = quantize_decimal(gw_str, 3)
                if gw_d is None:
                    continue

                # Quality assessment
                if gw_d == Decimal("-999.999"):
                    data_quality = "invalid"
                    quality_reason = "source_sentinel"
                    chunk_invalid += 1
                elif gw_d < Decimal("-100"):
                    data_quality = "suspect"
                    quality_reason = "extreme_low_value"
                    chunk_suspect += 1
                elif gw_d > Decimal("100"):
                    data_quality = "suspect"
                    quality_reason = "extreme_high_value"
                    chunk_suspect += 1
                else:
                    data_quality = "valid"
                    quality_reason = None
                    chunk_valid += 1

                readings_batch.append({
                    "station_id": station_id,
                    "source_dataset": DATASET_NAME,
                    "source_slno": source_slno,
                    "timestamp": ts_obj.to_pydatetime() if hasattr(ts_obj, "to_pydatetime") else ts_obj,
                    "groundwater_level": gw_d,
                    "data_quality": data_quality,
                    "quality_reason": quality_reason,
                })

            # -------------------------------------------------------------
            # STEP C: Bulk insert readings in safe sub-batches
            # -------------------------------------------------------------
            chunk_inserted = 0
            if readings_batch:
                for i in range(0, len(readings_batch), DB_INSERT_BATCH_SIZE):
                    sub_batch = readings_batch[i : i + DB_INSERT_BATCH_SIZE]
                    insert_stmt = (
                        pg_insert(Reading)
                        .values(sub_batch)
                        .on_conflict_do_nothing(index_elements=["source_dataset", "source_slno"])
                        .returning(Reading.id)
                    )
                    res = db.execute(insert_stmt)
                    inserted_ids = res.scalars().all()
                    chunk_inserted += len(inserted_ids)

            db.commit()

            chunk_skipped = len(readings_batch) - chunk_inserted
            total_rows_inserted += chunk_inserted
            total_rows_skipped += chunk_skipped
            count_valid += chunk_valid
            count_suspect += chunk_suspect
            count_invalid += chunk_invalid

            print(
                f"Processing chunk {chunk_idx:2d}... | "
                f"Rows: {total_source_rows:>9,} | "
                f"Readings inserted: {chunk_inserted:>6,} (skipped: {chunk_skipped:>5,}) | "
                f"New stations: {chunk_stations_created:>3}"
            )

        except Exception as e:
            db.rollback()
            print(f"\n[ERROR] Ingestion failed at chunk {chunk_idx}: {e}")
            raise
        finally:
            db.close()

    elapsed = time.time() - start_time
    total_stations_reused = len(station_cache) - total_stations_created

    summary = {
        "total_source_rows": total_source_rows,
        "total_rows_inserted": total_rows_inserted,
        "total_rows_skipped": total_rows_skipped,
        "total_stations_created": total_stations_created,
        "total_stations_reused": total_stations_reused,
        "total_stations_in_db": len(station_cache),
        "count_valid": count_valid,
        "count_suspect": count_suspect,
        "count_invalid": count_invalid,
        "elapsed_seconds": elapsed,
    }

    print("\n" + "=" * 65)
    print("INGESTION COMPLETE")
    print("=" * 65)
    print(f"Total source rows                     : {total_source_rows:,}")
    print(f"Rows inserted                         : {total_rows_inserted:,}")
    print(f"Rows skipped because already imported : {total_rows_skipped:,}")
    print(f"Stations created in this run          : {total_stations_created:,}")
    print(f"Stations in database                  : {len(station_cache):,}")
    print(f"Invalid readings                      : {count_invalid:,}")
    print(f"Suspect readings                      : {count_suspect:,}")
    print(f"Valid readings                        : {count_valid:,}")
    print(f"Elapsed time                          : {elapsed:.2f} seconds ({elapsed/60:.2f} minutes)")
    print("=" * 65 + "\n")

    return summary
