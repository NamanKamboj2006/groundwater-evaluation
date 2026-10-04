#!/usr/bin/env python3
"""
Haryana Groundwater Telemetry Dataset Inspector
-----------------------------------------------------------
Memory-efficient chunked inspection script for large DWLR CSV datasets.
Processes data in chunks to handle multi-hundred MB files without memory exhaustion.
"""

import os
import sys
import argparse
import hashlib
from pathlib import Path
from collections import Counter, defaultdict
import pandas as pd
import numpy as np


def find_column(candidates, all_columns, default=None):
    """Find the best matching column name from a list of candidate substrings."""
    lower_map = {col.lower().strip(): col for col in all_columns}
    
    # 1. Exact match attempts
    for cand in candidates:
        if cand.lower() in lower_map:
            return lower_map[cand.lower()]
            
    # 2. Substring match attempts
    for cand in candidates:
        for col_lower, original_col in lower_map.items():
            if cand.lower() in col_lower:
                return original_col
                
    return default


def format_bytes(size):
    """Format bytes to human readable format."""
    for unit in ['B', 'KB', 'MB', 'GB']:
        if size < 1024.0:
            return f"{size:.2f} {unit}"
        size /= 1024.0
    return f"{size:.2f} TB"


def inspect_dataset(csv_path: Path, chunk_size: int = 50_000):
    if not csv_path.exists():
        print(f"\n[ERROR] Dataset file not found at: {csv_path.resolve()}")
        print(f"Please ensure the CSV file is placed at: backend/data/{csv_path.name}")
        sys.exit(1)

    file_size = csv_path.stat().st_size
    print("=" * 80)
    print("  HARYANA GROUNDWATER DWLR TELEMETRY DATASET INSPECTION")
    print("=" * 80)
    print(f"Target File : {csv_path.resolve()}")
    print(f"File Size   : {format_bytes(file_size)} ({file_size:,} bytes)")
    print(f"Chunk Size  : {chunk_size:,} rows per iteration")
    print("-" * 80)
    print("Reading header and identifying schema...")

    # Read header only first
    sample_df = pd.read_csv(csv_path, nrows=5)
    all_columns = list(sample_df.columns)
    total_cols = len(all_columns)

    # Missing value representations
    na_vals = ['-', '--', 'NA', 'N/A', 'nan', 'NAN', 'NaN', 'null', 'NULL', 'None', '', ' ']

    # Identify candidate columns
    station_col = find_column(['station_code', 'station_id', 'station_name', 'station', 'site_id', 'site_code', 'site_name', 'site', 'telemetry_id', 'id'], all_columns)
    timestamp_col = find_column(['timestamp', 'data_acquisition_time', 'acquisition_time', 'datetime', 'date_time', 'date', 'recorded_at', 'reading_time', 'time'], all_columns)
    gw_level_col = find_column(['water_level', 'groundwater_level', 'ground_water_level', 'water_level_mbgl', 'water_level(mbgl)', 'waterlevel', 'gw_level', 'mbgl', 'wls', 'value', 'level', 'depth'], all_columns)
    lat_col = find_column(['latitude', 'lat', 'y_coord', 'y'], all_columns)
    lon_col = find_column(['longitude', 'long', 'lon', 'x_coord', 'x'], all_columns)

    print(f"\n[Column Discovery Results]")
    print(f"• Total Columns Discovered: {total_cols}")
    print(f"• Station Identifier Column : {station_col or 'NOT FOUND (will use first column)'}")
    print(f"• Timestamp Column          : {timestamp_col or 'NOT FOUND'}")
    print(f"• Groundwater Level Column  : {gw_level_col or 'NOT FOUND'}")
    print(f"• Latitude Column           : {lat_col or 'NOT FOUND'}")
    print(f"• Longitude Column          : {lon_col or 'NOT FOUND'}")

    if not station_col:
        station_col = all_columns[0]

    # Metrics state initialization
    total_rows = 0
    missing_counts = {col: 0 for col in all_columns}
    station_counter = Counter()
    
    # Station timestamp samples for interval check (stores up to 500 timestamps per top station)
    station_ts_samples = defaultdict(list)
    
    # Timestamp metrics
    min_timestamp = None
    max_timestamp = None
    invalid_timestamps_count = 0
    valid_timestamps_count = 0
    
    # GW Level metrics
    gw_min = float('inf')
    gw_max = float('-inf')
    gw_sum = 0.0
    gw_valid_count = 0
    gw_invalid_non_numeric = 0
    
    # Geo metrics
    min_lat, max_lat = float('inf'), float('-inf')
    min_lon, max_lon = float('inf'), float('-inf')
    geo_lat_missing = 0
    geo_lon_missing = 0
    geo_lat_valid = 0
    geo_lon_valid = 0
    
    # Duplicate tracking via 64-bit integer hashes (memory efficient)
    seen_row_hashes = set()
    total_duplicate_rows = 0
    
    seen_station_time = set()
    total_duplicate_station_time = 0

    print("\nProcessing dataset in chunks...")
    chunk_iter = pd.read_csv(
        csv_path,
        chunksize=chunk_size,
        na_values=na_vals,
        keep_default_na=True,
        dtype=str,  # Read raw as string to accurately capture non-numeric / malformed data
        low_memory=False
    )

    chunk_idx = 0
    for chunk in chunk_iter:
        chunk_idx += 1
        num_chunk_rows = len(chunk)
        total_rows += num_chunk_rows
        
        # 1. Column-wise missing values count (treat empty/whitespace as missing)
        for col in all_columns:
            series = chunk[col]
            is_na = series.isna() | series.astype(str).str.strip().eq('') | series.astype(str).str.strip().isin(na_vals)
            missing_counts[col] += int(is_na.sum())

        # 2. Duplicate rows check (MD5 64-bit hash representation per row)
        row_tuples = [tuple(x) for x in chunk.values]
        for r in row_tuples:
            h = hash(r)
            if h in seen_row_hashes:
                total_duplicate_rows += 1
            else:
                seen_row_hashes.add(h)

        # 3. Station metrics & Station-Time duplicates
        if station_col in chunk.columns:
            stations = chunk[station_col].fillna("UNKNOWN").str.strip()
            station_counter.update(stations[stations != "UNKNOWN"])
            
            if timestamp_col and timestamp_col in chunk.columns:
                timestamps = chunk[timestamp_col].fillna("").str.strip()
                for st, ts in zip(stations, timestamps):
                    if st and ts and st != "UNKNOWN":
                        pair_hash = hash((st, ts))
                        if pair_hash in seen_station_time:
                            total_duplicate_station_time += 1
                        else:
                            seen_station_time.add(pair_hash)
                        
                        # Sample timestamps for interval analysis (cap to avoid memory buildup)
                        if len(station_ts_samples[st]) < 400:
                            station_ts_samples[st].append(ts)

        # 4. Timestamp analysis
        if timestamp_col and timestamp_col in chunk.columns:
            raw_ts = chunk[timestamp_col]
            # Strip and filter missing
            non_empty_ts = raw_ts.dropna().astype(str).str.strip()
            non_empty_ts = non_empty_ts[~non_empty_ts.isin(na_vals) & (non_empty_ts != '')]
            
            if not non_empty_ts.empty:
                parsed = pd.to_datetime(non_empty_ts, dayfirst=True, format='mixed', errors='coerce')
                valid_mask = parsed.notna()
                valid_ts = parsed[valid_mask]
                
                num_valid = int(valid_mask.sum())
                num_invalid = int((~valid_mask).sum())
                
                valid_timestamps_count += num_valid
                invalid_timestamps_count += num_invalid
                
                if not valid_ts.empty:
                    c_min = valid_ts.min()
                    c_max = valid_ts.max()
                    if min_timestamp is None or c_min < min_timestamp:
                        min_timestamp = c_min
                    if max_timestamp is None or c_max > max_timestamp:
                        max_timestamp = c_max

        # 5. Groundwater level analysis
        if gw_level_col and gw_level_col in chunk.columns:
            raw_gw = chunk[gw_level_col]
            non_empty_gw = raw_gw.dropna().astype(str).str.strip()
            non_empty_gw = non_empty_gw[~non_empty_gw.isin(na_vals) & (non_empty_gw != '')]
            
            if not non_empty_gw.empty:
                converted = pd.to_numeric(non_empty_gw, errors='coerce')
                valid_num_mask = converted.notna()
                valid_nums = converted[valid_num_mask]
                
                num_valid = int(valid_num_mask.sum())
                num_invalid = int((~valid_num_mask).sum())
                
                gw_valid_count += num_valid
                gw_invalid_non_numeric += num_invalid
                
                if not valid_nums.empty:
                    c_min = float(valid_nums.min())
                    c_max = float(valid_nums.max())
                    if c_min < gw_min:
                        gw_min = c_min
                    if c_max > gw_max:
                        gw_max = c_max
                    gw_sum += float(valid_nums.sum())

        # 6. Geographic coordinates analysis
        if lat_col and lat_col in chunk.columns:
            raw_lat = chunk[lat_col]
            num_lat = pd.to_numeric(raw_lat, errors='coerce')
            valid_lat = num_lat[num_lat.notna()]
            geo_lat_missing += int(raw_lat.isna().sum() + (raw_lat.astype(str).str.strip().isin(na_vals)).sum())
            if not valid_lat.empty:
                geo_lat_valid += len(valid_lat)
                min_lat = min(min_lat, float(valid_lat.min()))
                max_lat = max(max_lat, float(valid_lat.max()))

        if lon_col and lon_col in chunk.columns:
            raw_lon = chunk[lon_col]
            num_lon = pd.to_numeric(raw_lon, errors='coerce')
            valid_lon = num_lon[num_lon.notna()]
            geo_lon_missing += int(raw_lon.isna().sum() + (raw_lon.astype(str).str.strip().isin(na_vals)).sum())
            if not valid_lon.empty:
                geo_lon_valid += len(valid_lon)
                min_lon = min(min_lon, float(valid_lon.min()))
                max_lon = max(max_lon, float(valid_lon.max()))

        print(f"  Processed chunk {chunk_idx:3d} ({total_rows:,} rows scanned)...", end='\r')

    print(f"\nChunk processing complete! Total rows scanned: {total_rows:,}\n")

    # -------------------------------------------------------------
    # PRINT INSPECTION REPORT
    # -------------------------------------------------------------
    print("=" * 80)
    print("                    DATASET INSPECTION REPORT")
    print("=" * 80)

    # 1. General Overview
    print("\n1. GENERAL DATASET SUMMARY")
    print("-" * 50)
    print(f"• Total Rows                  : {total_rows:,}")
    print(f"• Total Columns               : {total_cols}")
    print(f"• Unique Monitoring Stations  : {len(station_counter):,}")

    # 2. Exact Column Names & Missing Stats
    print("\n2. COLUMN LIST & MISSING DATA METRICS")
    print("-" * 80)
    print(f"{'#':<3} | {'Column Name':<35} | {'Missing Count':<15} | {'Missing %':<10}")
    print("-" * 80)
    for idx, col in enumerate(all_columns, 1):
        m_count = missing_counts[col]
        m_pct = (m_count / total_rows * 100.0) if total_rows > 0 else 0.0
        print(f"{idx:<3} | {col:<35} | {m_count:>15,} | {m_pct:>9.2f}%")
    print("-" * 80)

    # 3. Top 20 Stations by Reading Count
    print("\n3. TOP 20 STATIONS BY READING COUNT")
    print("-" * 65)
    print(f"{'Rank':<5} | {'Station Identifier / Name':<38} | {'Readings':<15}")
    print("-" * 65)
    for rank, (st_name, count) in enumerate(station_counter.most_common(20), 1):
        print(f"{rank:<5} | {str(st_name)[:38]:<38} | {count:>15,}")
    print("-" * 65)

    # 4. Timestamp Analysis
    print("\n4. ACQUISITION TIMESTAMP ANALYSIS")
    print("-" * 50)
    if timestamp_col:
        print(f"• Timestamp Column Name       : {timestamp_col}")
        print(f"• Minimum Timestamp (Start)   : {min_timestamp}")
        print(f"• Maximum Timestamp (End)     : {max_timestamp}")
        print(f"• Valid Parsed Timestamps     : {valid_timestamps_count:,}")
        print(f"• Invalid / Unparseable Values: {invalid_timestamps_count:,}")
        print(f"• Missing Timestamps          : {missing_counts.get(timestamp_col, 0):,}")
    else:
        print("• Timestamp column could not be automatically identified.")

    # 5. Groundwater Level Metric Analysis
    print("\n5. GROUNDWATER LEVEL METRIC ANALYSIS")
    print("-" * 50)
    if gw_level_col:
        gw_avg = (gw_sum / gw_valid_count) if gw_valid_count > 0 else 0.0
        print(f"• Groundwater Column Name     : {gw_level_col}")
        print(f"• Minimum Recorded Level      : {gw_min:.3f}" if gw_min != float('inf') else "• Minimum Recorded Level      : N/A")
        print(f"• Maximum Recorded Level      : {gw_max:.3f}" if gw_max != float('-inf') else "• Maximum Recorded Level      : N/A")
        print(f"• Average Recorded Level      : {gw_avg:.3f}" if gw_valid_count > 0 else "• Average Recorded Level      : N/A")
        print(f"• Valid Numeric Readings      : {gw_valid_count:,}")
        print(f"• Non-Numeric / Invalid Values: {gw_invalid_non_numeric:,}")
        print(f"• Missing Groundwater Values  : {missing_counts.get(gw_level_col, 0):,}")
    else:
        print("• Groundwater level column could not be automatically identified.")

    # 6. Duplicates Analysis
    print("\n6. DUPLICATE RECORDS ANALYSIS")
    print("-" * 50)
    print(f"• Completely Duplicate Rows          : {total_duplicate_rows:,}")
    print(f"• Duplicate (Station + Time) Pairs   : {total_duplicate_station_time:,}")

    # 7. Geographic Coordinates Analysis
    print("\n7. GEOGRAPHIC DATA INTEGRITY")
    print("-" * 50)
    if lat_col:
        print(f"• Latitude Column Name        : {lat_col}")
        print(f"• Valid Latitude Range        : [{min_lat:.5f}, {max_lat:.5f}]" if geo_lat_valid > 0 else "• Valid Latitude Range        : N/A")
        print(f"• Missing Latitudes           : {missing_counts.get(lat_col, 0):,}")
    if lon_col:
        print(f"• Longitude Column Name       : {lon_col}")
        print(f"• Valid Longitude Range       : [{min_lon:.5f}, {max_lon:.5f}]" if geo_lon_valid > 0 else "• Valid Longitude Range       : N/A")
        print(f"• Missing Longitudes          : {missing_counts.get(lon_col, 0):,}")

    # 8. Telemetry Frequency / Sampling Interval Analysis
    print("\n8. SAMPLING FREQUENCY ANALYSIS (TELEMETRY INTERVALS)")
    print("-" * 80)
    
    top_stations = [st for st, _ in station_counter.most_common(5)]
    analyzed_count = 0
    
    for st in top_stations:
        raw_list = station_ts_samples.get(st, [])
        if len(raw_list) < 5:
            continue
        
        parsed_series = pd.to_datetime(pd.Series(raw_list), dayfirst=True, format='mixed', errors='coerce').dropna().sort_values().drop_duplicates()
        if len(parsed_series) < 5:
            continue
            
        diffs_hours = (parsed_series.diff().dt.total_seconds() / 3600.0).dropna()
        if diffs_hours.empty:
            continue
            
        median_diff = diffs_hours.median()
        mean_diff = diffs_hours.mean()
        
        # Check percentage close to 6 hours (+/- 0.5 hour)
        six_hour_readings = ((diffs_hours >= 5.5) & (diffs_hours <= 6.5)).sum()
        six_hour_pct = (six_hour_readings / len(diffs_hours) * 100.0) if len(diffs_hours) > 0 else 0
        
        analyzed_count += 1
        print(f"• Station: '{st}' ({len(parsed_series)} sample timestamps evaluated)")
        print(f"    - Median interval : {median_diff:.2f} hours")
        print(f"    - Mean interval   : {mean_diff:.2f} hours")
        print(f"    - 6-hourly match  : {six_hour_pct:.1f}% of successive intervals are ~6 hours")
        
    if analyzed_count == 0:
        print("• Insufficient timestamp sequence data to establish sampling interval pattern.")
    else:
        print("\nSummary: Evaluated intervals on top stations above.")
        
    print("\n" + "=" * 80)
    print("                      END OF INSPECTION REPORT")
    print("=" * 80 + "\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Inspect Haryana DWLR Groundwater Telemetry CSV Dataset.")
    parser.add_argument(
        "--file",
        type=str,
        default="backend/data/haryana_2021_2025.csv",
        help="Path to the groundwater CSV file (default: backend/data/haryana_2021_2025.csv)"
    )
    parser.add_argument(
        "--chunksize",
        type=int,
        default=50_000,
        help="Chunk size for reading CSV (default: 50,000)"
    )

    args = parser.parse_args()
    
    # Check multiple sensible locations automatically
    candidate_paths = [
        Path(args.file),
        Path("data") / Path(args.file).name,
        Path("app/data") / Path(args.file).name,
        Path("backend/data") / Path(args.file).name,
        Path("backend/app/data") / Path(args.file).name,
        Path(__file__).resolve().parent.parent / "data" / Path(args.file).name,
        Path(__file__).resolve().parent.parent / "app" / "data" / Path(args.file).name,
    ]

    target_path = None
    for p in candidate_paths:
        if p.exists() and p.is_file():
            target_path = p
            break

    if target_path is None:
        expected_loc = Path(__file__).resolve().parent.parent / "data" / "haryana_2021_2025.csv"
        print(f"\n[ERROR] Dataset CSV file not found.")
        print(f"Please copy your 'haryana_2021_2025.csv' file into:")
        print(f"  --> {expected_loc.resolve()}\n")
        sys.exit(1)

    inspect_dataset(target_path, chunk_size=args.chunksize)
