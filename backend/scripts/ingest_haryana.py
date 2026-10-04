#!/usr/bin/env python3
"""
CLI entrypoint to run Haryana DWLR Groundwater CSV Ingestion.
Usage:
    python scripts/ingest_haryana.py
    python scripts/ingest_haryana.py --file app/data/haryana_2021_2025.csv --chunksize 50000
    python scripts/ingest_haryana.py --max-rows 5000  # For quick verification test
"""

import sys
import argparse
from pathlib import Path

# Ensure backend directory is in sys.path
backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from app.services.ingestion import ingest_haryana_telemetry_csv


def main():
    parser = argparse.ArgumentParser(description="Ingest Haryana DWLR Groundwater Telemetry CSV into PostgreSQL.")
    parser.add_argument(
        "--file",
        type=str,
        default="app/data/haryana_2021_2025.csv",
        help="Path to groundwater telemetry CSV"
    )
    parser.add_argument(
        "--chunksize",
        type=int,
        default=50_000,
        help="Chunk size for ingestion (default: 50,000)"
    )
    parser.add_argument(
        "--max-rows",
        type=int,
        default=None,
        help="Optional limit on total rows to ingest (useful for quick testing)"
    )
    args = parser.parse_args()

    try:
        ingest_haryana_telemetry_csv(
            csv_file_path=args.file,
            chunk_size=args.chunksize,
            max_rows=args.max_rows,
        )
    except Exception as e:
        print(f"\n[FATAL] Ingestion halted due to error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
