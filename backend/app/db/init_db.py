"""
Database Initialization Module.
Creates the PostGIS extension and all database tables defined in SQLAlchemy models.

Can be run standalone via:
    python -m app.db.init_db
"""

import sys
from sqlalchemy import text
from app.db.base import Base
from app.db.session import engine
# Explicitly import all models so Base.metadata is fully populated
from app.models.station import Station
from app.models.reading import Reading


def init_db() -> None:
    print("=" * 60)
    print("Initializing Groundwater Database...")
    print(f"Target Database URL: {engine.url.render_as_string(hide_password=True)}")
    print("=" * 60)

    try:
        # Step 1: Ensure PostGIS extension is enabled
        print("1. Enabling PostGIS extension if not exists...")
        with engine.connect() as connection:
            connection.execute(text("CREATE EXTENSION IF NOT EXISTS postgis;"))
            connection.commit()
            print("   --> PostGIS extension ready.")

        # Step 2: Create all database tables
        print("2. Creating SQLAlchemy model tables (stations, readings)...")
        Base.metadata.create_all(bind=engine)
        print("   --> Tables 'stations' and 'readings' created successfully.")

        print("\nDatabase initialization completed successfully!")
        print("=" * 60)

    except Exception as e:
        print(f"\n[ERROR] Database initialization failed: {e}", file=sys.stderr)
        raise


if __name__ == "__main__":
    init_db()
