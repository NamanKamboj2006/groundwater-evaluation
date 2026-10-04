# Groundwater Resource Evaluation and Monitoring System — Backend Service

A high-performance geospatial telemetry REST API service built with **FastAPI**, **SQLAlchemy 2.0**, and **PostgreSQL/PostGIS** for ingesting, managing, analyzing, and serving groundwater level datasets.

This service powers the **Groundwater Resource Evaluation and Monitoring System**, providing sub-second analytical queries, spatial queries, statistical anomaly screening, and next-month level predictions across 1.86M+ telemetry records.

---

## 📌 Service Overview

Automated Digital Water Level Recorders (DWLR) installed across regional monitoring boreholes capture high-frequency water table observations. This backend service provides the foundational data and computation layer to:
- Ingest multi-million row observational CSV archives into structured relational storage.
- Store borehole coordinates as indexed PostGIS spatial point geometries (`SRID 4326`).
- Classify telemetry quality (`valid`, `suspect`, `invalid`).
- Execute database-level SQL aggregations for time-series trend lines and regional distributions.
- Serve machine learning inference pipelines for unsupervised anomaly detection (Isolation Forest) and next-month level prediction (HistGradientBoosting).

---

## 🏛 System Architecture

```text
┌────────────────────────────────────────────────────────┐
│               Frontend Tier (React 19 / Vite 8)        │
│   ├── Geospatial Leaflet Map (Station Markers & Status)│
│   ├── Time-Series Charts (Recharts OLS Regressions)    │
│   └── In-Memory Session Cache (Zero-Overhead Nav)      │
└──────────────────────────┬─────────────────────────────┘
                           │ JSON over HTTP (REST API)
                           ▼
┌────────────────────────────────────────────────────────┐
│              Application API Tier (FastAPI)            │
│   ├── Routing Layer (Endpoints & Parameter Validation) │
│   ├── Service Layer (SQL Aggregations & Query Logic)   │
│   ├── ML Layer (Isolation Forest & Gradient Boosting)  │
│   └── Data Contracts (Pydantic v2 Serialization)       │
└──────────────────────────┬─────────────────────────────┘
                           │ SQLAlchemy 2.0 / psycopg 3
                           ▼
┌────────────────────────────────────────────────────────┐
│             Database Tier (PostgreSQL + PostGIS)       │
│   ├── stations Table (Physical Metadata & POINT Geoms) │
│   ├── readings Table (1.86M Telemetry Time-Series)     │
│   └── GIST / B-Tree Indexes (Spatial & Temporal Fast)  │
└────────────────────────────────────────────────────────┘
```

---

## 💻 Technology Stack

| Layer | Technologies |
|---|---|
| **Backend Framework** | Python 3.10+, FastAPI, Uvicorn (ASGI) |
| **Data & ORM Layer** | SQLAlchemy 2.0, GeoAlchemy2, Psycopg 3 |
| **Database & GIS Engine** | PostgreSQL 14+, PostGIS 3.0+ |
| **Validation & Schemas** | Pydantic v2, Pydantic-Settings |
| **Data Processing** | Pandas 2.2, NumPy 2.2 |
| **Machine Learning** | Scikit-Learn 1.6, Joblib 1.4 |

---

## 📊 Dataset Attribution

- **Dataset Resource**: *"Ground Water Level (Telemetry - Six Hourly), Irrigation and Water Resources Department, Haryana"* (`haryana_2021_2025.csv`).
- **Authority**: National Water Data Portal (NWDP) / National Water Informatics Centre (NWIC), Ministry of Jal Shakti, Government of India, in coordination with the Ground Water Cell, Haryana.
- **Scale**: **1,864,977 raw telemetry records** across 14 districts in Haryana representing **988 physical station locations**.
- **Storage**: The raw CSV file is utilized strictly during offline ingestion. PostgreSQL/PostGIS is the sole operational source of truth at runtime.

---

## 🗄 Relational Schema

### 1. `stations` Table
- `id` (BIGINT, Primary Key, Auto-increment)
- `station_name` (VARCHAR, Indexed)
- `agency`, `state`, `district` (Indexed), `tehsil` (VARCHAR)
- `latitude`, `longitude` (NUMERIC(10, 7))
- `rl_msl` (NUMERIC(10, 3)) — Reduced level relative to mean sea level
- `location` (`GEOMETRY(Point, 4326)`, Spatial GIST Index)
- *Constraint*: `UNIQUE (station_name, latitude, longitude)`

### 2. `readings` Table
- `id` (BIGINT, Primary Key, Auto-increment)
- `station_id` (BIGINT, Foreign Key $\to$ `stations.id`, Indexed)
- `source_dataset` (VARCHAR, Default `haryana_telemetry_2021_2025`)
- `source_slno` (BIGINT) — Original sequence number from data portal
- `timestamp` (TIMESTAMP WITHOUT TIME ZONE, Indexed)
- `groundwater_level` (NUMERIC(10, 3)) — Water table depth (meters)
- `data_quality` (VARCHAR(30), Indexed: `valid`, `suspect`, `invalid`)
- `quality_reason` (TEXT)
- *Constraint*: `UNIQUE (source_dataset, source_slno)`

---

## 📡 REST API Reference

Interactive OpenAPI documentation is automatically available:
- **Swagger UI**: `http://localhost:8000/docs`
- **ReDoc UI**: `http://localhost:8000/redoc`

### Endpoint Inventory

| Category | Method | Endpoint | Description |
|---|---|---|---|
| **Health** | `GET` | `/health` | Service status and health check |
| **Health** | `GET` | `/db-health` | PostgreSQL live connectivity verification |
| **Dashboard** | `GET` | `/api/dashboard/overview` | Unified overview metrics, freshness, and district stats |
| **Dashboard** | `GET` | `/api/dashboard/recent-readings` | Latest telemetry observations with joined station metadata |
| **Summary** | `GET` | `/api/summary` | Statewide summary metrics and level bounds |
| **Summary** | `GET` | `/api/summary/district/{district}` | Summary metrics for a specific district |
| **Stations** | `GET` | `/api/stations` | Query stations with optional district filters and pagination |
| **Stations** | `GET` | `/api/stations/{station_id}` | Retrieve individual station metadata by ID |
| **Stations** | `GET` | `/api/stations/{station_id}/readings` | Chronological readings for a specific station |
| **Readings** | `GET` | `/api/readings` | Paginated telemetry observations with multi-field filters |
| **Readings** | `GET` | `/api/readings/{reading_id}` | Retrieve single reading by database ID |
| **Map** | `GET` | `/api/map/stations` | Station coordinates with latest water level for GIS mapping |
| **Analytics** | `GET` | `/api/analytics/groundwater-trend` | Monthly average statewide time-series points |
| **Analytics** | `GET` | `/api/analytics/groundwater-trend-analysis` | Statewide OLS linear regression results |
| **Analytics** | `GET` | `/api/analytics/districts` | District-wise station and reading summary |
| **Analytics** | `GET` | `/api/analytics/district-comparison` | Comparative metrics matrix across all districts |
| **Analytics** | `GET` | `/api/analytics/districts/{district}` | Deep analytical summary for a single district |
| **Analytics** | `GET` | `/api/analytics/districts/{district}/trend` | Monthly time-series for a single district |
| **Analytics** | `GET` | `/api/analytics/districts/{district}/trend-analysis` | OLS linear regression for a single district |
| **Analytics** | `GET` | `/api/analytics/stations/{station_id}/trend` | Monthly time-series points for a station |
| **Analytics** | `GET` | `/api/analytics/stations/{station_id}/trend-analysis` | OLS linear regression for a station |
| **Analytics** | `GET` | `/api/analytics/stations/{station_id}/data-quality` | Quality tier distribution for a station |
| **Analytics** | `GET` | `/api/analytics/stations/{station_id}/anomalies` | Rule-based telemetry outliers for a station |
| **ML** | `GET` | `/api/ml/model-info` | Anomaly model parameters and baseline overlap |
| **ML** | `GET` | `/api/ml/anomalies/summary` | Statewide anomaly screening results |
| **ML** | `GET` | `/api/ml/anomalies` | Filterable, paginated anomaly records with review context |
| **ML** | `GET` | `/api/ml/stations/{station_id}/anomalies` | Station chronological anomaly timeline |
| **ML** | `GET` | `/api/ml/prediction/model-info` | Level prediction model architecture and test metrics |
| **ML** | `GET` | `/api/ml/prediction/stations/{station_id}` | Next-month level prediction and change estimate |

---

## 🛠 Local Setup

```bash
cd backend
python -m venv .venv

# Windows (PowerShell)
.venv\Scripts\activate
# Linux/macOS
source .venv/bin/activate

pip install -r requirements.txt

# Configure environment variables
# Copy .env.example to .env and configure DATABASE_URL

# Initialize schema and spatial extensions
python -m app.db.init_db

# Run ingestion (requires dataset CSV)
python scripts/ingest_haryana.py

# Start the API server
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```
