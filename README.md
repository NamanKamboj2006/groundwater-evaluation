# Groundwater Resource Evaluation and Monitoring System

## 1. Project Overview

The **Groundwater Resource Evaluation and Monitoring System** is an engineering software platform designed for the systematic ingestion, storage, spatial indexing, quality screening, time-series trend evaluation, statistical anomaly detection, and monthly level prediction of regional groundwater telemetry data.

Digital Water Level Recorders (DWLR) equipped with hydrostatic pressure sensors and automated telemetry units record high-frequency water table observations from monitoring boreholes across regional aquifer networks. While physical DWLR instruments capture telemetry measurements in the field, this software platform provides the data infrastructure required to ingest multi-million row observation streams, normalize monitoring station metadata, perform spatial and temporal queries in PostgreSQL/PostGIS, screen observational quality, visualize geographical distributions, and conduct predictive and anomaly analysis.

> **Note on System Boundary**: This software platform processes, analyzes, and visualizes transmitted telemetry records. It does not directly manage or control physical DWLR hardware instruments or borehole sensor telemetry transmitters.

---

## 2. Problem Statement

Automated groundwater monitoring networks produce high-frequency observational records that present distinct data engineering and analytical challenges:

1. **High Volume Telemetry**: Continuous recording schedules (e.g., six-hourly observations across hundreds of monitoring stations) generate millions of data points across multi-year observation windows, overwhelming standard spreadsheets and naive client-side web applications.
2. **Observational Quality Anomalies**: Raw telemetry streams contain sensor faults, battery discharge artifacts, transmission corruptions, and source sentinel values (e.g., `-999.999`) that distort downstream statistical aggregations if not systematically classified.
3. **Spatial and Temporal Dispersal**: Groundwater monitoring requires both localized geospatial awareness (borehole location, elevation, district boundaries) and multi-year temporal aggregation (monthly averages, seasonal fluctuations, multi-year rate of change).
4. **Independent Station vs. Regional Dynamics**: District-level policy evaluation requires aggregated regional summaries, while individual borehole assessment demands granular historical observations, localized trend regressions, and site-specific anomaly investigations.
5. **Need for Predictive and Quality Screening Models**: Reliable time-series modeling requires leak-free feature engineering and objective benchmarking to distinguish normal seasonal behavior from abrupt statistical anomalies.

---

## 3. Objectives

The system implements the following technical objectives:

1. **Ingest Groundwater Telemetry**: Stream and batch-process multi-million row regional DWLR telemetry datasets.
2. **Relational & Geospatial Storage**: Store normalized physical station metadata and chronological observations in PostgreSQL with PostGIS geometry.
3. **Normalize Physical Station Identity**: Resolve monitoring boreholes uniquely using composite geographical identity (`station_name`, `latitude`, `longitude`).
4. **Preserve Source Identifiers**: Retain original dataset sequence identifiers (`source_slno`) and dataset tags to maintain data provenance and traceability.
5. **Automate Data Quality Classification**: Classify incoming readings into `valid`, `suspect`, and `invalid` quality tiers during ingestion.
6. **Provide Station and District Analytics**: Calculate summary metrics, reporting frequency, and district-level distribution profiles.
7. **GIS-Based Station Visualization**: Render interactive spatial maps with clustering, coordinate pinpointing, and status markers.
8. **Granular Record Exploration**: Provide server-side filtered and paginated exploration of individual telemetry observations.
9. **Groundwater Trend Analysis**: Calculate ordinary least-squares (OLS) linear regressions on monthly aggregations at statewide, district, and borehole levels.
10. **Statistical & ML Anomaly Screening**: Implement unsupervised multivariate Isolation Forest modeling alongside a multi-rule statistical benchmark baseline.
11. **Next-Month Groundwater Level Prediction**: Implement gradient boosted time-series regression with causal lag and rolling features.
12. **Deployment-Ready Architecture**: Maintain a fully decoupled frontend and backend architecture with in-memory session caching and robust CORS configuration.

---

## 4. System Architecture

The application follows a decoupled client-server architecture with dedicated data and machine learning service layers:

```mermaid
graph TD
    subgraph Client ["Frontend Tier (React + Vite)"]
        UI[User Interface & Dashboard]
        Router[React Router]
        Axios[Axios API Client]
        Cache[In-Memory Session Cache]
        Leaflet[Leaflet GIS Maps]
        Recharts[Recharts Time-Series]
        UI --> Router
        Router --> Leaflet
        Router --> Recharts
        UI --> Axios
        Axios <--> Cache
    end

    subgraph Server ["Application Tier (FastAPI)"]
        API[REST API Routers]
        StationSvc[Station Service]
        ReadingSvc[Reading Service]
        AnalyticsSvc[Analytics Service]
        SummarySvc[Summary Service]
        DashboardSvc[Dashboard Service]
        AnomalySvc[ML Anomaly Service]
        PredictionSvc[ML Prediction Service]

        API --> StationSvc
        API --> ReadingSvc
        API --> AnalyticsSvc
        API --> SummarySvc
        API --> DashboardSvc
        API --> AnomalySvc
        API --> PredictionSvc
    end

    subgraph Database ["Database Tier (PostgreSQL + PostGIS)"]
        PG[(PostgreSQL 14+ / PostGIS)]
        StationsTable[stations Table]
        ReadingsTable[readings Table]
        PG --- StationsTable
        PG --- ReadingsTable
    end

    subgraph MLArtifacts ["ML Artifacts Tier"]
        IFModel[Isolation Forest Model]
        GBRModel[HistGradientBoosting Model]
        Scaler[StandardScaler & Metadata]
    end

    Axios -->|JSON over HTTP / REST| API
    StationSvc -->|SQLAlchemy 2.0 / psycopg| PG
    ReadingSvc -->|SQLAlchemy 2.0 / psycopg| PG
    AnalyticsSvc -->|SQL Aggregations| PG
    SummarySvc -->|SQL Aggregations| PG
    DashboardSvc -->|SQL Aggregations| PG
    AnomalySvc --> PG
    AnomalySvc --> IFModel
    AnomalySvc --> Scaler
    PredictionSvc --> PG
    PredictionSvc --> GBRModel
```

### Layer Responsibilities

- **Frontend (React + Vite)**: Handles client-side view rendering, route management, filter state persistence, spatial map rendering (Leaflet), time-series charts (Recharts), and in-memory session caching (`cachedGet`) to eliminate redundant API requests during tab navigation.
- **Backend (FastAPI + SQLAlchemy)**: Provides high-throughput asynchronous REST endpoints, enforces request validation via Pydantic v2 schemas, executes database-level SQL aggregations, and serves inference pipelines for anomaly screening and level prediction.
- **Database (PostgreSQL + PostGIS)**: Persists physical station metadata, spatial point geometries (`SRID 4326`), and millions of chronological telemetry records with B-Tree and GIST spatial indices.
- **Machine Learning Services**: Encapsulates feature engineering pipelines, trained model artifacts (`.joblib`), unsupervised anomaly scoring, and autoregressive lag feature transformations for next-month level estimation.

---

## 5. Technology Stack

| Layer | Technology | Purpose |
|---|---|---|
| **Frontend Framework** | React 19 | Declarative user interface components and state management |
| **Build Tool** | Vite 8 | Fast local development server and optimized production bundler |
| **Routing** | React Router 7 | Client-side page navigation and URL parameter management |
| **Styling** | Tailwind CSS 4 | Utility-first responsive design system |
| **HTTP Client** | Axios 1.20 | Asynchronous HTTP requests with in-flight deduplication |
| **Geospatial Mapping** | Leaflet 1.9 & React-Leaflet 5 | Interactive GIS map tile rendering |
| **Map Clustering** | React-Leaflet-Cluster 4 | Marker clustering for high-density borehole visualization |
| **Data Visualization** | Recharts 3 | Responsive SVG time-series and comparative distribution charts |
| **Backend Framework** | FastAPI | High-performance Python web API with automatic OpenAPI docs |
| **ASGI Server** | Uvicorn | Production-ready ASGI server implementation |
| **ORM & Database Driver**| SQLAlchemy 2.0 & Psycopg 3 | Database abstraction, relationship modeling, and SQL execution |
| **Data Validation** | Pydantic v2 & Pydantic-Settings | Request/response schema validation and environment management |
| **Spatial Database** | PostgreSQL 14+ with PostGIS 3+ | Relational data persistence and indexed spatial geometry storage |
| **Data Engineering** | Pandas 2.2 & NumPy 2.2 | Chunked CSV ingestion and vector feature engineering |
| **Machine Learning** | Scikit-Learn 1.6 | Isolation Forest and HistGradientBoostingRegressor models |
| **Model Serialization** | Joblib 1.4 | Serialization and loading of trained estimators and scalers |

---

## 6. Dataset

The operational dataset utilized in this project is sourced from official public hydrology monitoring records:

- **Source Authority**: National Water Data Portal (NWDP) / National Water Informatics Centre (NWIC), Ministry of Jal Shakti, Government of India, in coordination with the Ground Water Cell, Irrigation & Water Resources Department, Government of Haryana.
- **Dataset Resource**: *"Ground Water Level (Telemetry - Six Hourly), Irrigation and Water Resources Department, Haryana"*.
- **Local Storage File**: `backend/app/data/haryana_2021_2025.csv` (excluded from Git version control due to file size).

### Verified Dataset Facts

- **Source File Size**: Approximately 329 MB.
- **Total Ingested Observations**: **1,864,977** telemetry records.
- **Temporal Coverage**: 31 calendar months (**June 2023** to **December 2025**).
- **Physical Station Locations**: **988 physical station locations are represented in the downloaded 2021–2025 dataset resource**.
- **Districts Covered**: 14 administrative districts across Haryana.
- **Sampling Frequency**: Six-hourly automated telemetry transmissions.

> **Storage Notice**: Raw CSV files are used solely during the initial data ingestion phase. Once loaded, **PostgreSQL/PostGIS is the sole operational source of truth**. No runtime API endpoint loads or parses the CSV file.

---

## 7. Database Design

The relational database schema is structured around two normalized core entities:

```mermaid
erDiagram
    STATIONS ||--o{ READINGS : "records"
    STATIONS {
        bigint id PK
        string station_name "Indexed"
        string agency
        string state
        string district "Indexed"
        string tehsil
        numeric latitude
        numeric longitude
        numeric rl_msl
        geometry location "POINT, SRID 4326 (Spatial GIST)"
    }
    READINGS {
        bigint id PK
        bigint station_id FK "Indexed"
        string source_dataset
        bigint source_slno "Indexed"
        datetime timestamp "Indexed"
        numeric groundwater_level
        string data_quality "Indexed"
        text quality_reason
    }
```

### Entity Specifications

1. **`stations` Table**:
   - `id`: Auto-incrementing primary key.
   - `station_name`: Official borehole site identifier (e.g., *"Govt.primary school Chandpura"*).
   - `agency`, `state`, `district`, `tehsil`: Administrative hierarchy metadata.
   - `latitude`, `longitude`: Decimal coordinates.
   - `rl_msl`: Reduced level relative to mean sea level (meters).
   - `location`: PostGIS `POINT` geometry (`SRID 4326`) with spatial GIST index.
   - **Identity Constraint**: `UNIQUE (station_name, latitude, longitude)` prevents duplicate borehole entity creation across overlapping data files.

2. **`readings` Table**:
   - `id`: Auto-incrementing primary key.
   - `station_id`: Foreign key referencing `stations.id` (`ON DELETE CASCADE`).
   - `source_dataset`: Source archive identifier tag (`haryana_telemetry_2021_2025`).
   - `source_slno`: Original row sequence number from the source data portal.
   - `timestamp`: UTC data acquisition timestamp.
   - `groundwater_level`: Measured water table level (meters below ground level/datum).
   - `data_quality`: Categorical flag (`valid`, `suspect`, `invalid`).
   - `quality_reason`: Text description for flagged records.
   - **Idempotency Constraint**: `UNIQUE (source_dataset, source_slno)` guarantees that re-running ingestion will not produce duplicate observation rows.

---

## 8. Data Ingestion Pipeline

The ingestion pipeline (`backend/scripts/ingest_haryana.py` and `backend/app/services/ingestion.py`) is engineered for memory safety, data integrity, and idempotency:

1. **Chunked Memory-Safe Processing**: The 329 MB CSV file is read in fixed chunks of 50,000 rows using Pandas stream iterators, ensuring the host memory footprint remains below 150 MB regardless of dataset size.
2. **Station Identity Normalization**: Physical monitoring stations are extracted from each chunk and upserted into the `stations` table using `(station_name, latitude, longitude)` conflict resolution.
3. **Batch Reading Insertions**: Observations are mapped to resolved database `station_id` primary keys and bulk-inserted in sub-batches of 2,000 records.
4. **Idempotency Guarantee**: Ingestion utilizes PostgreSQL `ON CONFLICT (source_dataset, source_slno) DO NOTHING`, allowing safe pipeline execution on partially ingested databases without record duplication.

---

## 9. Data Quality Classification

During ingestion, each raw telemetry observation is screened against automated quality rules:

- **Invalid Sentinel**: Value equals `-999.999` (telemetry hardware communication failure or offline sensor).
- **Suspect Range**: Value $< -100.0\,\text{m}$ or $> 100.0\,\text{m}$ (extreme physical excursion requiring review).
- **Valid Observation**: Value falls within acceptable operational bounds.

> **Important Hydrological Disclaimer**: These thresholds are project-level ingestion screening heuristics and are not presented as official hydrological quality standards. Suspect values are flagged for investigation and are not automatically declared hardware failures.

### Verified Dataset Quality Distribution

| Classification | Observation Count | Percentage | Description |
|---|---:|---:|---|
| **Valid** | 1,837,910 | 98.55% | Clean observational telemetry utilized for analytical and ML pipelines |
| **Suspect** | 27,064 | 1.45% | Flagged extreme values preserved for review but excluded from OLS trend calculations |
| **Invalid** | 3 | < 0.01% | Corrupted `-999.999` sensor error sentinels |
| **Total** | **1,864,977** | **100.00%** | Full verified PostgreSQL database inventory |

---

## 10. Application Modules

The user interface is organized into five specialized modules:

```
┌──────────────┐     ┌──────────────┐     ┌────────────────┐     ┌──────────────┐     ┌──────────────┐
│  Dashboard   │ ──> │   Stations   │ ──> │ Station Detail │     │   Records    │     │  Analytics   │
│ Network KPI  │     │ Directory &  │     │ Single-Station │     │ Observation  │     │ Regional &   │
│ Statewide Map│     │ Search/List  │     │ ML & Trends    │     │ Explorer     │     │ Trend Models │
└──────────────┘     └──────────────┘     └────────────────┘     └──────────────┘     └──────────────┘
```

### 1. Dashboard (`/dashboard`)
Provides an operational executive summary:
- Statewide network summary KPI cards (Total Stations, Total Records, Valid/Suspect Counts).
- Statewide monthly groundwater trend chart and linear regression direction/slope.
- District breakdown table with station counts and reading volumes.
- Interactive Leaflet distribution map with marker clustering.
- Real-time recent groundwater observations table (latest 10 telemetry records from PostgreSQL).
- Real-time backend online/offline connectivity heartbeat.

### 2. Stations Directory (`/stations`)
Focuses on physical monitoring locations:
- Full directory of physical monitoring boreholes.
- Real-time search across station name, district, agency, and station ID.
- District and latest data-quality filtering.
- Table view and interactive full-screen map view with synchronized selection.
- Deep-links to station detail pages.

### 3. Station Details (`/stations/:id`)
Comprehensive analytics for an individual monitoring station:
- Station metadata summary (district, agency, coordinates, MSL elevation).
- Historical groundwater time-series trend chart with OLS regression slope.
- Station data-quality distribution and validity breakdown.
- Unsupervised machine learning anomaly evaluation timeline.
- Next-month predictive level estimation with historical test metrics.
- Historical telemetry observation table.

### 4. Reading Records (`/records`)
Dedicated observation log explorer:
- Granular DWLR observation explorer over all 1.86M+ records.
- Server-side multi-parameter filters (District, Station ID, Data Quality, Date Range, Sort Field, Sort Order).
- Server-side paginated observation log table (25, 50, 100 records per page).
- Direct station cross-reference navigation.

### 5. Analytics (`/analytics`)
Statewide and regional comparative evaluations:
- Statewide multi-year groundwater trend with annual regression slope.
- District-by-district multi-year trend line overlays.
- District comparison metric matrix (station density, validity percentages, average depths).
- Individual district inspection tabs with localized regression slopes.

---

## 11. REST API Documentation

All backend endpoints are built using FastAPI and organized into modular APIRouters:

### Health & Connectivity
- `GET /health` — Service health and uptime status.
- `GET /db-health` — Live PostgreSQL/PostGIS database connection test.

### Dashboard
- `GET /api/dashboard/overview` — Unified payload containing network KPIs, station freshness, and district breakdown.
- `GET /api/dashboard/recent-readings?limit=10` — Server-side limited latest telemetry observations with joined station metadata.

### Summary
- `GET /api/summary` — Statewide total stations, readings, quality breakdown, and level min/max/avg.
- `GET /api/summary/district/{district}` — Summary metrics aggregated for a specific district.

### Monitoring Stations
- `GET /api/stations` — Query stations with optional district/state filters and pagination.
- `GET /api/stations/{station_id}` — Retrieve full metadata for a single station.
- `GET /api/stations/{station_id}/readings` — Retrieve chronological readings for a single station.

### Telemetry Readings
- `GET /api/readings` — Paginated telemetry observations with station, district, date range, quality, and sorting filters.
- `GET /api/readings/{reading_id}` — Retrieve a single telemetry observation record by ID.

### GIS Mapping
- `GET /api/map/stations` — Optimized station markers with coordinates and latest telemetry observation snapshot.

### Analytics
- `GET /api/analytics/groundwater-trend` — Monthly averaged statewide time-series points.
- `GET /api/analytics/groundwater-trend-analysis` — Statewide OLS linear regression results.
- `GET /api/analytics/districts` — Summary station and reading metrics for all districts.
- `GET /api/analytics/district-comparison` — Comparative matrix of district metrics.
- `GET /api/analytics/districts/{district}` — Deep analytics for a single district.
- `GET /api/analytics/districts/{district}/trend` — Monthly time-series for a single district.
- `GET /api/analytics/districts/{district}/trend-analysis` — OLS regression analysis for a single district.
- `GET /api/analytics/stations/{station_id}/trend` — Station monthly aggregated time-series.
- `GET /api/analytics/stations/{station_id}/trend-analysis` — Station OLS linear regression analysis.
- `GET /api/analytics/stations/{station_id}/data-quality` — Quality distribution metrics for a single station.
- `GET /api/analytics/stations/{station_id}/anomalies` — Rule-based telemetry outliers for a station.

### Machine Learning
- `GET /api/ml/model-info` — Hyperparameters, training period, and proxy overlap metrics for the anomaly detection model.
- `GET /api/ml/anomalies/summary` — Statewide anomaly detection results, district counts, and baseline overlap.
- `GET /api/ml/anomalies` — Paginated, filterable anomaly records with human-readable review context.
- `GET /api/ml/stations/{station_id}/anomalies` — Station chronological anomaly timeline and scores.
- `GET /api/ml/prediction/model-info` — Prediction model architecture, features, and comparative metrics vs. baseline.
- `GET /api/ml/prediction/stations/{station_id}` — Next-month level prediction, predicted monthly change, and test metrics for a station.

---

## 12. Groundwater Trend Analysis Methodology

To evaluate long-term water table trajectory from high-frequency records, the system aggregates raw valid observations into monthly means and applies Ordinary Least-Squares (OLS) linear regression:

$$y = m \cdot x + c$$

Where:
- $y$: Monthly average groundwater level (meters).
- $x$: Chronological month index ($0, 1, 2, \dots, N-1$).
- $m$: Monthly slope ($\Delta\,\text{meters} / \text{month}$).
- $c$: Baseline intercept.

The annual rate of change is calculated as:

$$\text{Annual Rate of Change} = m \times 12 \quad (\text{meters per year})$$

### Trend Classification Rules

- **Direction**:
  - $\text{Annual Rate} > +0.25\,\text{m/year} \implies \textbf{Increasing}$
  - $\text{Annual Rate} < -0.25\,\text{m/year} \implies \textbf{Decreasing}$
  - Otherwise $\implies \textbf{Stable}$
- **Strength**: Determined by the regression coefficient of determination ($R^2$):
  - $R^2 \ge 0.60 \implies \textbf{Strong}$
  - $R^2 \ge 0.30 \implies \textbf{Moderate}$
  - Otherwise $\implies \textbf{Weak}$

> **Important Interpretation Rule**: "Increasing" or "Decreasing" reflects the numerical trajectory of the stored groundwater level value according to the dataset coordinate convention. It should not be labeled as inherently beneficial or adverse without localized hydrogeological context.

---

## 13. Machine Learning — Anomaly Detection

### 13.1 Feature Engineering

Raw telemetry is aggregated directly in PostgreSQL into **19,270 valid station-month records**. For each station-month $t$, seven strictly causal features are computed:

1. `mean_gw_level`: Monthly average valid level ($m$).
2. `std_gw_level`: Monthly intra-month standard deviation ($m$).
3. `monthly_range`: Difference between monthly maximum and minimum ($m$).
4. `valid_ratio`: Proportion of valid observations ($\frac{\text{valid}}{\text{total}}$).
5. `month_to_month_change`: Level shift from previous month ($\text{mean}_t - \text{mean}_{t-1}$).
6. `deviation_from_history`: Shift relative to expanding station history prior to $t$ (`shift(1).expanding().mean()`).
7. `history_zscore`: Z-score relative to station variance strictly prior to $t$.

### 13.2 Statistical Baseline Benchmark

A rule-based benchmark is fitted strictly on the historical training partition (`<= 2024-12`):
- **IQR Shift Threshold**: Month-to-month shift beyond $Q_1 - 1.5\times\text{IQR}$ ($-1.28\,\text{m}$) or $Q_3 + 1.5\times\text{IQR}$ ($+1.33\,\text{m}$).
- **Historical Outlier Threshold**: $|\text{history\_zscore}| \ge 3.0\,\sigma$.
- **Telemetry Quality Degradation**: $\text{valid\_ratio} < 0.80$.

### 13.3 Isolation Forest Model

- **Estimator**: `sklearn.ensemble.IsolationForest` with `StandardScaler` normalization.
- **Hyperparameters**: `n_estimators = 150`, `contamination = 0.03`, `random_state = 42`.
- **Training Partition**: June 2023 – December 2024 (10,853 station-months).
- **Evaluation Partition**: January 2025 – December 2025 (8,417 station-months).

### 13.4 Evaluation & Proxy Overlap Metric

Because groundwater telemetry lacks verified ground-truth labels, the unsupervised model is evaluated using proxy agreement with the statistical baseline:

$$\text{Baseline Overlap \%} = \frac{\text{ML Anomalies Flagged by Statistical Baseline}}{\text{Total ML Anomalies}} \times 100$$

- **Total Station-Months Evaluated**: 19,270
- **Total ML Anomalies Detected**: 647 (3.36%)
- **Statistical Baseline Anomalies**: 3,640 (18.89%)
- **Anomalies Flagged by Both**: **485**
- **Official Proxy Overlap**: $\frac{485}{647} \times 100 =$ **74.96%**

> **Disclaimer**: 74.96% represents proxy agreement/overlap with the statistical baseline, **not classification accuracy**. Anomaly scores are relative ranking metrics indicating *"potential statistical anomalies requiring review"*.

---

## 14. Machine Learning — Groundwater Level Prediction

### 14.1 Objective & Model Architecture

- **Task**: Predict the next calendar month's mean groundwater level ($m$) for an individual monitoring station.
- **Estimator**: `sklearn.ensemble.HistGradientBoostingRegressor` (native handling of missing lag values, robust gradient boosting).
- **Splitting Strategy**: Chronological time-series split (Train: `2023-07` to `2024-12` [9,872 samples]; Test: `2025-01` to `2025-12` [8,411 samples]).

### 14.2 19 Causal Features

All features are constructed strictly using information available prior to the target month:
1. `lag_1_month`: Level at $t-1$.
2. `lag_2_month`: Level at $t-2$.
3. `lag_3_month`: Level at $t-3$.
4. `lag_6_month`: Level at $t-6$.
5. `lag_12_month`: Level at $t-12$.
6. `rolling_mean_3`: 3-month rolling mean on $t-1$.
7. `rolling_mean_6`: 6-month rolling mean on $t-1$.
8. `rolling_std_3`: 3-month rolling standard deviation on $t-1$.
9. `rolling_std_6`: 6-month rolling standard deviation on $t-1$.
10. `change_from_previous_month`: Level change between $t-1$ and $t-2$.
11. `change_from_3_months_ago`: Level change between $t-1$ and $t-3$.
12. `historical_mean`: Expanding station mean prior to $t$.
13. `historical_std`: Expanding station standard deviation prior to $t$.
14. `month_num`: Calendar month integer ($1..12$).
15. `sin_month`: Cyclical sine seasonal encoding.
16. `cos_month`: Cyclical cosine seasonal encoding.
17. `rl_msl`: Elevation relative to mean sea level.
18. `latitude`: Spatial coordinate.
19. `longitude`: Spatial coordinate.

### 14.3 Comparative Evaluation (2025 Unseen Test Period)

| Metric | Naive Persistence ($\hat{y}_t = y_{t-1}$) | ML (HistGradientBoosting) |
|---|---:|---:|
| **Mean Absolute Error (MAE)** | **1.1425 m** | 1.5688 m |
| **Root Mean Squared Error (RMSE)** | 5.1525 m | **4.9799 m** |
| **Coefficient of Determination ($R^2$)** | 0.9626 | **0.9651** |

### Evaluation Interpretation

- The **ML model achieves a lower RMSE** ($4.9799\,\text{m}$ vs. $5.1525\,\text{m}$, a **3.35% reduction in error variance**), penalizing large estimation blunders during rapid seasonal shifts.
- The **ML model achieves a slightly higher $R^2$** ($0.9651$ vs. $0.9626$).
- The **Naive persistence baseline achieves a lower MAE** ($1.1425\,\text{m}$ vs. $1.5688\,\text{m}$) because deep groundwater levels often remain static across consecutive quiet observation months.
- The ML model should **not** be claimed as universally superior to the persistence baseline across every metric.

> **Terminology Notice**: $R^2 = 0.9651$ measures statistical variance explained, **not "96.51% prediction accuracy"**. Model outputs represent time-series estimates and must not be described as exact certainty intervals.

---

## 15. Performance & Scalability Architecture

To ensure sub-second response times across 1.86M+ database records without high memory consumption:

### Backend Optimizations
- **Chunked Data Processing**: Ingestion operates in memory-bounded batches.
- **Relational B-Tree & PostGIS GIST Indices**: Indexed columns on `readings(timestamp, id, station_id, data_quality)` and `stations(location)`.
- **Database-Level SQL Aggregation**: CTEs and aggregate queries compute statewide distributions in PostgreSQL rather than transferring raw records to Python memory.
- **Strict Server-Side Pagination**: Queries enforce `LIMIT` and `OFFSET` bounds on all high-volume tables.

### Frontend Optimizations
- **In-Memory Session Cache**: Custom `cachedGet` utility in `api.js` stores fetched data in the active JavaScript heap, eliminating duplicate network roundtrips during tab navigation without persisting stale records to `localStorage`.
- **In-Flight Request Deduplication**: Identical concurrent API requests share a single pending Promise.
- **Leaflet Marker Clustering**: Groups nearby stations into clusters, preventing DOM node bloat across 988 markers.

---

## 16. Security & Configuration Management

- **Environment Separation**: All database credentials, ports, and allowed origins are loaded via environment variables (`.env`).
- **Git Hygiene**: `.env` files, virtual environments (`.venv`), temporary files, and raw CSV files are excluded via `.gitignore`.
- **Restricted CORS Policy**: FastAPI CORS middleware allows explicit local development origins (`http://localhost:5173`, `http://localhost:4173`) and configurable production origins.
- **No Hardcoded Secrets**: Source-controlled files contain no embedded database passwords or private keys.

---

## 17. Local Setup & Execution Guide

### Prerequisites
- **Python 3.10+**
- **Node.js 18+** & **npm**
- **PostgreSQL 14+** with **PostGIS extension**
- **Git**

---

### Backend Setup

```bash
# 1. Navigate to backend directory
cd backend

# 2. Create and activate virtual environment
python -m venv .venv

# Windows (PowerShell)
.venv\Scripts\activate
# Linux/macOS
source .venv/bin/activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Configure environment variables
# Copy .env.example to .env and configure your PostgreSQL connection
# Example: DATABASE_URL=postgresql+psycopg://postgres:password@localhost:5432/groundwater_db
# Example: CORS_ORIGINS=http://localhost:5173,http://localhost:4173

# 5. Initialize database tables and PostGIS extension
python -m app.db.init_db

# 6. Ingest telemetry dataset (requires backend/app/data/haryana_2021_2025.csv)
python scripts/ingest_haryana.py

# 7. Start the FastAPI development server
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

---

### Frontend Setup

```bash
# 1. Open a new terminal and navigate to frontend directory
cd frontend

# 2. Install dependencies
npm install

# 3. Start the Vite development server
npm run dev

# 4. Access the application in your browser
# URL: http://localhost:5173
```

---

### Production Build & Verification

```bash
# Verify frontend code standards
cd frontend
npm run lint

# Compile optimized frontend production bundle
npm run build

# Preview production build locally
npm run preview

# Run comprehensive backend API verification suite
cd ../backend
python scripts/verify_all_endpoints.py
```

---

## 18. Environment Variables

### Backend (`backend/.env`)

```env
# PostgreSQL connection string (psycopg 3 driver)
DATABASE_URL=postgresql+psycopg://USER:PASSWORD@HOST:PORT/DATABASE_NAME

# Allowed CORS origins (comma-separated)
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173

# Application environment
ENVIRONMENT=development
```

### Frontend (`frontend/.env`)

```env
# Base URL for backend REST API
VITE_API_BASE_URL=http://localhost:8000
```

---

## 19. Deployment Readiness

The software is structured for independent cloud hosting:
- **Separation of Concerns**: Frontend compiles to static assets (HTML/CSS/JS); backend operates as a containerizable ASGI Python application.
- **Dynamic Configuration**: All host URLs and database connections are loaded from environment parameters at runtime.
- **Stateless Server**: Backend maintains no session state; authentication and storage rely on PostgreSQL.
- **Current Status**: The codebase is **deployment-ready** for standard cloud environments (e.g., Vercel for frontend, Render/Railway/AWS for backend and PostGIS). It is currently verified in local development.

---

## 20. Technical Limitations

1. **Unlabeled Anomaly Ground Truth**: Without field verification logs, anomaly performance is evaluated through agreement with statistical baselines rather than clinical precision/recall.
2. **Monthly Aggregation Trade-Off**: Aggregating observations into monthly means mitigates high-frequency noise but smooths intra-day and intra-week hydrological cycles.
3. **Variable Borehole History**: Stations with fewer than 12 months of historical observations have reduced lag feature support for predictions.
4. **Ingestion Screening Heuristics**: Quality classification thresholds (`-999.999`, $\pm 100\,\text{m}$) are software engineering heuristics, not official hydrogeological standards.
5. **Single-Step Forecasting**: The ML model is configured for next-month level estimation; recursive multi-month predictions accumulate uncertainty over longer horizons.
6. **External Hydrological Variables**: Meteorological precipitation, surface irrigation withdrawals, and aquifer geological lithology data are not included in the current telemetry schema.

---

## 21. Academic Disclaimer

This system is an academic software engineering project for groundwater telemetry data processing, spatial visualization, statistical screening, and predictive modeling experimentation. Statistical flags and machine learning outputs are decision-support estimates and must not be interpreted as definitive hydrological diagnoses, official aquifer assessments, or direct hardware control instructions.
