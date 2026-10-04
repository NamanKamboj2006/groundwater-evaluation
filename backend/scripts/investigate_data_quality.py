#!/usr/bin/env python3
"""
Haryana Groundwater Telemetry Data Quality Investigation
-------------------------------------------------------------------
In-depth investigation script analyzing:
1. Timestamp formatting and parsing fidelity
2. Groundwater level distribution and sentinel value identification (-999.999)
3. Duplicate Station + Timestamp resolution (identical vs conflicting readings)
4. Station metadata consistency (coordinates, districts, agencies)
5. SlNo identifier behavior and spatial station mapping

Processes large CSV files in chunks (chunksize=50,000) to ensure memory efficiency.
"""

import os
import sys
import argparse
from pathlib import Path
from collections import Counter, defaultdict
from datetime import datetime
import pandas as pd
import numpy as np


def format_bytes(size):
    for unit in ['B', 'KB', 'MB', 'GB']:
        if size < 1024.0:
            return f"{size:.2f} {unit}"
        size /= 1024.0
    return f"{size:.2f} TB"


def resolve_dataset_path(passed_path: str) -> Path:
    candidates = [
        Path(passed_path),
        Path("app/data") / Path(passed_path).name,
        Path("data") / Path(passed_path).name,
        Path("backend/app/data") / Path(passed_path).name,
        Path("backend/data") / Path(passed_path).name,
        Path(__file__).resolve().parent.parent / "app" / "data" / Path(passed_path).name,
        Path(__file__).resolve().parent.parent / "data" / Path(passed_path).name,
    ]
    for p in candidates:
        if p.exists() and p.is_file():
            return p
    return Path(passed_path)


def main():
    parser = argparse.ArgumentParser(description="Investigate Haryana DWLR Groundwater Telemetry Data Quality.")
    parser.add_argument(
        "--file",
        type=str,
        default="backend/app/data/haryana_2021_2025.csv",
        help="Path to groundwater telemetry CSV"
    )
    parser.add_argument(
        "--chunksize",
        type=int,
        default=50_000,
        help="Chunk size for pandas reading (default: 50,000)"
    )
    args = parser.parse_args()

    csv_path = resolve_dataset_path(args.file)
    if not csv_path.exists():
        print(f"\n[ERROR] Dataset CSV not found at: {csv_path.resolve()}")
        sys.exit(1)

    file_size = csv_path.stat().st_size
    print("=" * 80)
    print("      HARYANA GROUNDWATER DATA QUALITY DEEP DIVE")
    print("=" * 80)
    print(f"File Path   : {csv_path.resolve()}")
    print(f"File Size   : {format_bytes(file_size)} ({file_size:,} bytes)")
    print(f"Chunk Size  : {args.chunksize:,} rows per chunk")
    print("=" * 80 + "\n")

    # Target column names in the official dataset
    col_time = "Data Acquisition Time"
    col_gw = "Groundwater Level Telemetry 6 Hourly (meter)"
    col_station = "Station"
    col_slno = "SlNo"
    col_lat = "Latitude"
    col_lon = "Longitude"
    col_agency = "Agency"
    col_state = "State"
    col_district = "District"
    col_tehsil = "Tehsil"
    col_rl_msl = "RL_MSL"

    test_formats = [
        "%d-%m-%Y %H:%M",
        "%d-%m-%Y %H:%M:%S",
        "%Y-%m-%d %H:%M",
        "%Y-%m-%d %H:%M:%S",
        "%d/%m/%Y %H:%M",
        "%d/%m/%Y %H:%M:%S",
    ]

    # Tracking Structures
    raw_timestamp_examples = []
    
    # 1. Format parser counters: fmt -> {'valid': 0, 'invalid': 0, 'min': None, 'max': None}
    format_stats = {
        fmt: {"valid": 0, "invalid": 0, "min": None, "max": None} for fmt in test_formats
    }

    # 2. Groundwater stats
    total_gw_rows = 0
    gw_missing_count = 0
    gw_non_numeric_count = 0
    gw_min = float('inf')
    gw_max = float('-inf')
    gw_sum = 0.0
    gw_valid_numeric_count = 0
    
    gw_exact_999 = 0
    gw_below_100 = 0
    gw_below_50 = 0
    gw_below_0 = 0
    gw_above_100 = 0
    gw_above_500 = 0
    gw_value_counter = Counter()

    # Approximate median via histogram / bucket tracking for large scale
    gw_all_sampled_values = []

    # 3. Duplicate (Station + Timestamp) tracking
    # Key: (station, timestamp) -> [count, set_of_gw_values]
    station_time_map = {}
    conflict_examples = []  # Stores full row details of conflicting groups

    # 4. Station metadata consistency
    # Key: station -> {field_name: set_of_distinct_values}
    meta_fields = [col_agency, col_state, col_district, col_tehsil, col_lat, col_lon, col_rl_msl]
    station_metadata = defaultdict(lambda: {f: set() for f in meta_fields})

    # 5. SlNo & Station identification
    slno_to_stations = defaultdict(set)
    station_to_slnos = defaultdict(set)
    station_to_locations = defaultdict(set)  # station -> set of (lat, lon)
    total_rows = 0
    seen_slnos = set()
    slno_duplicates = 0

    print("Beginning chunk processing...")
    chunk_idx = 0

    # Read as string to avoid automatic conversions or loss of precision
    reader = pd.read_csv(
        csv_path,
        chunksize=args.chunksize,
        dtype=str,
        keep_default_na=False,
        na_values=[],
        low_memory=False
    )

    for chunk in reader:
        chunk_idx += 1
        n_rows = len(chunk)
        total_rows += n_rows

        # Collect raw timestamp examples from the first chunk
        if len(raw_timestamp_examples) < 30 and col_time in chunk.columns:
            needed = 30 - len(raw_timestamp_examples)
            raw_timestamp_examples.extend(chunk[col_time].iloc[:needed].tolist())

        # -------------------------------------------------------------
        # 1. TIMESTAMP FORMAT TESTING
        # -------------------------------------------------------------
        if col_time in chunk.columns:
            ts_series = chunk[col_time].astype(str)
            for fmt in test_formats:
                # Fast vectorized parsing per format
                parsed = pd.to_datetime(ts_series, format=fmt, errors='coerce')
                valid_mask = parsed.notna()
                v_count = int(valid_mask.sum())
                inv_count = n_rows - v_count
                
                format_stats[fmt]["valid"] += v_count
                format_stats[fmt]["invalid"] += inv_count

                if v_count > 0:
                    c_min = parsed[valid_mask].min()
                    c_max = parsed[valid_mask].max()
                    curr_min = format_stats[fmt]["min"]
                    curr_max = format_stats[fmt]["max"]
                    if curr_min is None or c_min < curr_min:
                        format_stats[fmt]["min"] = c_min
                    if curr_max is None or c_max > curr_max:
                        format_stats[fmt]["max"] = c_max

        # -------------------------------------------------------------
        # 2. GROUNDWATER LEVEL VALUES INVESTIGATION
        # -------------------------------------------------------------
        if col_gw in chunk.columns:
            gw_raw = chunk[col_gw].astype(str).str.strip()
            total_gw_rows += n_rows

            # Missing check
            is_empty = (gw_raw == '') | (gw_raw == '-') | (gw_raw == '--') | (gw_raw.str.lower() == 'nan') | (gw_raw.str.lower() == 'null')
            gw_missing_count += int(is_empty.sum())

            # Convert valid numeric
            non_empty = gw_raw[~is_empty]
            numeric_vals = pd.to_numeric(non_empty, errors='coerce')
            
            invalid_num_mask = numeric_vals.isna()
            gw_non_numeric_count += int(invalid_num_mask.sum())

            valid_nums = numeric_vals[~invalid_num_mask]
            v_len = len(valid_nums)
            gw_valid_numeric_count += v_len

            if v_len > 0:
                gw_sum += float(valid_nums.sum())
                gw_min = min(gw_min, float(valid_nums.min()))
                gw_max = max(gw_max, float(valid_nums.max()))

                # Threshold counts
                gw_exact_999 += int((valid_nums == -999.999).sum())
                gw_below_100 += int((valid_nums < -100).sum())
                gw_below_50 += int((valid_nums < -50).sum())
                gw_below_0 += int((valid_nums < 0).sum())
                gw_above_100 += int((valid_nums > 100).sum())
                gw_above_500 += int((valid_nums > 500).sum())

                # Value counts
                gw_value_counter.update(valid_nums.round(3).tolist())

                # Sample for median calculation (sample 1 in every 50 to fit easily in memory)
                gw_all_sampled_values.extend(valid_nums.iloc[::25].tolist())

        # -------------------------------------------------------------
        # 3. DUPLICATE STATION + TIMESTAMP & CONFLICTS
        # -------------------------------------------------------------
        # Extract rows for mapping
        st_series = chunk[col_station].astype(str).str.strip()
        time_series = chunk[col_time].astype(str).str.strip()
        gw_series = chunk[col_gw].astype(str).str.strip()
        slno_series = chunk[col_slno].astype(str).str.strip() if col_slno in chunk.columns else pd.Series([""]*n_rows)
        lat_series = chunk[col_lat].astype(str).str.strip() if col_lat in chunk.columns else pd.Series([""]*n_rows)
        lon_series = chunk[col_lon].astype(str).str.strip() if col_lon in chunk.columns else pd.Series([""]*n_rows)

        for st, tm, gw_val, slno_val, lat_val, lon_val in zip(st_series, time_series, gw_series, slno_series, lat_series, lon_series):
            key = (st, tm)
            if key not in station_time_map:
                # [count, first_gw_val, is_conflicting]
                station_time_map[key] = [1, gw_val, False]
            else:
                entry = station_time_map[key]
                entry[0] += 1
                if entry[1] != gw_val:
                    entry[2] = True
                    if len(conflict_examples) < 20:
                        conflict_examples.append({
                            "Station": st,
                            "Data Acquisition Time": tm,
                            "Groundwater Level Telemetry 6 Hourly (meter)": gw_val,
                            "Latitude": lat_val,
                            "Longitude": lon_val,
                            "SlNo": slno_val,
                            "Prior Value in Group": entry[1]
                        })

        # -------------------------------------------------------------
        # 4. STATION METADATA CONSISTENCY
        # -------------------------------------------------------------
        for st in st_series.unique():
            st_chunk = chunk[st_series == st]
            for f in meta_fields:
                if f in st_chunk.columns:
                    # Clean values
                    vals = set(st_chunk[f].dropna().astype(str).str.strip())
                    vals.discard('')
                    vals.discard('-')
                    vals.discard('--')
                    if vals:
                        station_metadata[st][f].update(vals)

        # -------------------------------------------------------------
        # 5. SLNO / STATION IDENTIFIERS
        # -------------------------------------------------------------
        if col_slno in chunk.columns:
            for slno_val, st, lat_val, lon_val in zip(slno_series, st_series, lat_series, lon_series):
                if slno_val:
                    if slno_val in seen_slnos:
                        slno_duplicates += 1
                    else:
                        seen_slnos.add(slno_val)

                    slno_to_stations[slno_val].add(st)
                    station_to_slnos[st].add(slno_val)
                    if lat_val and lon_val:
                        station_to_locations[st].add((lat_val, lon_val))

        if chunk_idx % 5 == 0 or total_rows >= 1_800_000:
            print(f"  --> Processed {chunk_idx:3d} chunks | {total_rows:,} rows scanned...")

    print(f"\nFinished scanning all {total_rows:,} rows!\n")

    # =============================================================
    # 1. TIMESTAMP FORMAT REPORT
    # =============================================================
    print("=" * 80)
    print("1. TIMESTAMP FORMAT INVESTIGATION")
    print("=" * 80)
    print("Raw examples (repr from CSV):")
    for i, ex in enumerate(raw_timestamp_examples[:30], 1):
        print(f"  [{i:02d}] {repr(ex)}")

    print("\nFormat Parsing Test Results:")
    print("-" * 80)
    print(f"{'Format Pattern':<22} | {'Tested':<10} | {'Success':<10} | {'Failed':<10} | {'Success %':<10}")
    print("-" * 80)
    best_fmt = None
    best_fmt_success = -1
    for fmt in test_formats:
        v = format_stats[fmt]["valid"]
        inv = format_stats[fmt]["invalid"]
        pct = (v / total_rows * 100.0) if total_rows > 0 else 0
        print(f"{fmt:<22} | {total_rows:>10,} | {v:>10,} | {inv:>10,} | {pct:>9.2f}%")
        if v > best_fmt_success:
            best_fmt_success = v
            best_fmt = fmt
    print("-" * 80)
    print(f"Top matching format: {best_fmt}")
    if best_fmt:
        print(f"  • Min Parsed Timestamp : {format_stats[best_fmt]['min']}")
        print(f"  • Max Parsed Timestamp : {format_stats[best_fmt]['max']}")

    # =============================================================
    # 2. GROUNDWATER LEVEL VALUES REPORT
    # =============================================================
    print("\n" + "=" * 80)
    print("2. GROUNDWATER LEVEL VALUES INVESTIGATION")
    print("=" * 80)
    gw_mean = (gw_sum / gw_valid_numeric_count) if gw_valid_numeric_count > 0 else 0.0
    gw_median = float(np.median(gw_all_sampled_values)) if gw_all_sampled_values else 0.0

    print(f"• Total rows examined         : {total_gw_rows:,}")
    print(f"• Missing values (empty/dash) : {gw_missing_count:,}")
    print(f"• Non-numeric invalid values  : {gw_non_numeric_count:,}")
    print(f"• Valid numeric readings      : {gw_valid_numeric_count:,}")
    print(f"• Minimum value               : {gw_min:.3f}")
    print(f"• Maximum value               : {gw_max:.3f}")
    print(f"• Mean value (all rows)       : {gw_mean:.3f}")
    print(f"• Median value (sampled)      : {gw_median:.3f}")
    print("\nSpecific Range and Anomaly Counts:")
    print(f"  • Values exactly == -999.999 : {gw_exact_999:>10,}  ({gw_exact_999/total_gw_rows*100:.2f}%)")
    print(f"  • Values < -100              : {gw_below_100:>10,}  ({gw_below_100/total_gw_rows*100:.2f}%)")
    print(f"  • Values < -50               : {gw_below_50:>10,}  ({gw_below_50/total_gw_rows*100:.2f}%)")
    print(f"  • Values < 0                 : {gw_below_0:>10,}  ({gw_below_0/total_gw_rows*100:.2f}%)")
    print(f"  • Values > 100               : {gw_above_100:>10,}  ({gw_above_100/total_gw_rows*100:.2f}%)")
    print(f"  • Values > 500               : {gw_above_500:>10,}  ({gw_above_500/total_gw_rows*100:.2f}%)")

    print("\nTop 20 Most Frequent Groundwater Values:")
    print(f"{'Rank':<5} | {'Groundwater Value (m)':<25} | {'Frequency':<15} | {'% of Dataset':<10}")
    print("-" * 65)
    for rank, (val, freq) in enumerate(gw_value_counter.most_common(20), 1):
        print(f"{rank:<5} | {val:<25.3f} | {freq:>15,} | {freq/total_gw_rows*100:>9.2f}%")
    print("-" * 65)

    # =============================================================
    # 3. DUPLICATE STATION + TIMESTAMP REPORT
    # =============================================================
    print("\n" + "=" * 80)
    print("3. DUPLICATE STATION + TIMESTAMP INVESTIGATION")
    print("=" * 80)

    total_duplicate_groups = 0
    total_duplicate_extra_rows = 0
    max_group_size = 1
    identical_duplicate_groups = 0
    conflicting_duplicate_groups = 0

    for (st, tm), (count, first_val, is_conflict) in station_time_map.items():
        if count > 1:
            total_duplicate_groups += 1
            total_duplicate_extra_rows += (count - 1)
            if count > max_group_size:
                max_group_size = count
            if is_conflict:
                conflicting_duplicate_groups += 1
            else:
                identical_duplicate_groups += 1

    print(f"• Total distinct (Station, Time) keys : {len(station_time_map):,}")
    print(f"• Duplicate groups (count > 1)        : {total_duplicate_groups:,}")
    print(f"• Total excess duplicate rows         : {total_duplicate_extra_rows:,}")
    print(f"• Largest duplicate group size        : {max_group_size}")
    print(f"• Groups with IDENTICAL readings      : {identical_duplicate_groups:,} ({identical_duplicate_groups/max(1,total_duplicate_groups)*100:.2f}%)")
    print(f"• Groups with CONFLICTING readings    : {conflicting_duplicate_groups:,} ({conflicting_duplicate_groups/max(1,total_duplicate_groups)*100:.2f}%)")

    if conflict_examples:
        print("\nExamples of Conflicting Duplicate Readings (up to 20):")
        print("-" * 100)
        print(f"{'Station':<30} | {'Timestamp':<17} | {'GW Level':<10} | {'Prior Val':<10} | {'Lat, Lon':<20} | {'SlNo':<8}")
        print("-" * 100)
        for ex in conflict_examples[:20]:
            coords = f"{ex['Latitude'][:8]}, {ex['Longitude'][:8]}"
            print(f"{ex['Station'][:30]:<30} | {ex['Data Acquisition Time']:<17} | {ex['Groundwater Level Telemetry 6 Hourly (meter)']:<10} | {ex['Prior Value in Group']:<10} | {coords:<20} | {ex['SlNo']:<8}")
        print("-" * 100)
    else:
        print("\nNo conflicting readings found across duplicate timestamp groups!")

    # =============================================================
    # 4. STATION METADATA CONSISTENCY REPORT
    # =============================================================
    print("\n" + "=" * 80)
    print("4. STATION METADATA CONSISTENCY INVESTIGATION")
    print("=" * 80)

    inconsistent_counts = {f: 0 for f in meta_fields}
    inconsistent_coord_stations = []

    for st, fields in station_metadata.items():
        for f in meta_fields:
            if len(fields[f]) > 1:
                inconsistent_counts[f] += 1
        
        if len(fields[col_lat]) > 1 or len(fields[col_lon]) > 1:
            inconsistent_coord_stations.append(st)

    print("Stations with Multiple Distinct Metadata Values:")
    print("-" * 50)
    for f in meta_fields:
        print(f"• {f:<15} : {inconsistent_counts[f]:>4} stations with > 1 value (out of {len(station_metadata):,})")

    if inconsistent_coord_stations:
        print(f"\nExamples of Stations with Inconsistent Coordinates (up to 20):")
        print("-" * 100)
        print(f"{'Station Name':<35} | {'Latitudes':<20} | {'Longitudes':<20} | {'District':<15}")
        print("-" * 100)
        for st in inconsistent_coord_stations[:20]:
            lats = ", ".join(list(station_metadata[st][col_lat])[:3])
            lons = ", ".join(list(station_metadata[st][col_lon])[:3])
            dists = ", ".join(list(station_metadata[st][col_district])[:2])
            print(f"{st[:35]:<35} | {lats[:20]:<20} | {lons[:20]:<20} | {dists[:15]:<15}")
        print("-" * 100)
    else:
        print("\nAll stations have perfectly consistent coordinates across all records!")

    # =============================================================
    # 5. SLNO / STATION IDENTIFIER INVESTIGATION REPORT
    # =============================================================
    print("\n" + "=" * 80)
    print("5. SLNO / STATION IDENTIFIER INVESTIGATION")
    print("=" * 80)

    print(f"• Total distinct SlNo values          : {len(seen_slnos):,}")
    print(f"• Total distinct Station names        : {len(station_metadata):,}")
    print(f"• SlNo unique per row?                : {'NO (Duplicate SlNo found)' if slno_duplicates > 0 else 'YES'}")
    
    stations_with_multiple_slnos = {st: slnos for st, slnos in station_to_slnos.items() if len(slnos) > 1}
    slnos_with_multiple_stations = {slno: st_set for slno, st_set in slno_to_stations.items() if len(st_set) > 1}
    stations_with_multiple_locations = {st: locs for st, locs in station_to_locations.items() if len(locs) > 1}

    print(f"• Stations mapping to > 1 SlNo        : {len(stations_with_multiple_slnos):,}")
    print(f"• SlNo values mapping to > 1 Station  : {len(slnos_with_multiple_stations):,}")
    print(f"• Stations at > 1 physical (Lat, Lon) : {len(stations_with_multiple_locations):,}")

    if stations_with_multiple_slnos:
        print("\nExamples of Station Names associated with Multiple SlNo values:")
        for st, slnos in list(stations_with_multiple_slnos.items())[:10]:
            print(f"  • Station '{st}': SlNo count = {len(slnos)} (e.g. {list(slnos)[:5]})")

    if slnos_with_multiple_stations:
        print("\nExamples of SlNo values associated with Multiple Station Names:")
        for slno, st_set in list(slnos_with_multiple_stations.items())[:10]:
            print(f"  • SlNo '{slno}': Stations = {list(st_set)}")

    # =============================================================
    # FINAL DATA QUALITY SUMMARY
    # =============================================================
    print("\n" + "=" * 80)
    print("================ FINAL DATA QUALITY SUMMARY ================")
    print("=" * 80)
    
    st_is_safe = (len(stations_with_multiple_locations) == 0 and inconsistent_counts[col_lat] == 0)
    slno_is_safe = (slno_duplicates == 0 and len(slnos_with_multiple_stations) == 0)

    print(f"1. Correct timestamp format candidate           : {best_fmt}")
    print(f"2. Rows parsed successfully with that format    : {format_stats[best_fmt]['valid']:,} ({format_stats[best_fmt]['valid']/total_rows*100:.2f}%)")
    print(f"3. Number of -999.999 values                    : {gw_exact_999:,} ({gw_exact_999/total_rows*100:.2f}%)")
    print(f"4. Number of duplicate Station + Time groups    : {total_duplicate_groups:,}")
    print(f"5. Number of conflicting duplicate groups       : {conflicting_duplicate_groups:,}")
    print(f"6. Stations with inconsistent coordinates       : {len(inconsistent_coord_stations):,}")
    print(f"7. Number of distinct Station names             : {len(station_metadata):,}")
    print(f"8. Number of distinct SlNo values               : {len(seen_slnos):,}")
    print(f"9. Station safe as unique station identifier?   : {'YES' if st_is_safe else 'NO (requires composite key or normalization)'}")
    print(f"10. SlNo safe as unique station identifier?     : {'YES' if slno_is_safe else 'NO (SlNo is not a primary key / 1-to-1 site code)'}")
    print("=" * 80 + "\n")


if __name__ == "__main__":
    main()
