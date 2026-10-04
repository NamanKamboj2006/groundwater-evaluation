# Groundwater Resource Evaluation — Frontend Application

## 1. Project Overview

The frontend is a single-page web application built with **React 19** and **Vite 8**. It provides interactive spatial visualization, time-series analysis, observation record exploration, and machine learning insight dashboards for the **Groundwater Resource Evaluation and Monitoring System**.

The interface communicates with the FastAPI backend over REST APIs and utilizes an in-memory session cache to eliminate unnecessary network roundtrips during tab navigation without persisting stale records across browser reloads.

---

## 2. Architecture & Technology Stack

| Component | Library / Tool | Version | Purpose |
|---|---|---|---|
| **Framework** | React | `^19.2.8` | Declarative UI components and state management |
| **Build Tool** | Vite | `^8.3.0` | Fast local HMR development and production bundling |
| **Routing** | React Router | `^7.18.4` | Client-side routing and URL parameter synchronization |
| **Styling** | Tailwind CSS | `^4.3.3` | Modern utility-first CSS styling and layout system |
| **HTTP Client** | Axios | `^1.20.0` | Asynchronous REST communication and request deduplication |
| **GIS Mapping** | Leaflet & React-Leaflet | `^1.9.4` / `^5.0.0` | Interactive OpenStreetMap tile rendering |
| **Marker Clustering** | React-Leaflet-Cluster | `^4.1.3` | High-performance spatial clustering for 988 borehole markers |
| **Charts** | Recharts | `^3.10.1` | Time-series line charts, area charts, and bar visualizations |

---

## 3. Directory Structure

```
frontend/
├── public/                     # Static web assets
├── src/
│   ├── assets/                 # SVGs and application icons
│   ├── components/
│   │   ├── common/             # Shared UI components (PageHeader, ErrorMsg, etc.)
│   │   ├── layout/             # AppLayout, Sidebar navigation, Header with health indicator
│   │   └── map/                # Leaflet StationMap component with marker clusters
│   ├── pages/                  # Main route views
│   │   ├── Dashboard.jsx       # Overview KPIs, statewide trend, map, quality, recent readings
│   │   ├── Stations.jsx        # Monitoring stations directory, search, filter, and map toggle
│   │   ├── StationDetails.jsx  # Single-station metadata, trend, anomalies, prediction, records
│   │   ├── Records.jsx         # 1.86M+ telemetry observation explorer with server-side pagination
│   │   └── Analytics.jsx       # Statewide & district trend analysis and OLS regression metrics
│   ├── services/
│   │   └── api.js              # Axios instance, in-memory session cache, in-flight deduplication
│   ├── App.jsx                 # Route declarations and root layout integration
│   ├── App.css                 # Application-level styles
│   ├── index.css               # Design tokens, Tailwind CSS imports, typography
│   └── main.jsx                # Application entry point
├── package.json                # Project dependencies and script declarations
└── vite.config.js              # Vite bundler configuration
```

---

## 4. Application Pages

### 1. Dashboard (`/dashboard`)
The central executive overview of the groundwater monitoring network:
- **Statewide Summary Cards**: Total stations, total telemetry observations, valid observations, and suspect flags.
- **Groundwater Trend Chart**: Statewide monthly average water levels with annual OLS regression slope ($m/\text{year}$).
- **District Breakdown**: Summary table of stations and reading counts per administrative district.
- **Station Distribution Map**: Leaflet interactive map with station markers and cluster counts.
- **Data Quality Panel**: Visual distribution bars for `valid`, `suspect`, and `invalid` quality tiers.
- **Recent Groundwater Readings**: Live table displaying the 10 most recent telemetry observations from PostgreSQL.

### 2. Monitoring Stations (`/stations`)
The complete physical borehole directory:
- Real-time client-side search across station name, district, agency, and database ID.
- Filter by administrative district and latest observation data quality.
- Sortable table (name, district, coordinates, latest water level, timestamp).
- Synchronized split view between tabular directory and Leaflet GIS map.
- Direct navigation links to individual station detail pages.

### 3. Station Details (`/stations/:id`)
Comprehensive analytics for a single physical monitoring borehole:
- **Station Header**: Coordinates, district, agency, tehsil, and MSL elevation.
- **Time-Series Trend**: Historical monthly average water levels with OLS linear trend slope.
- **Data Quality Breakdown**: Proportion of valid, suspect, and invalid readings recorded at this borehole.
- **ML Anomaly Detection**: Chronological anomaly timeline evaluated by the Isolation Forest model.
- **Groundwater Level Prediction**: Model-generated next-month level estimation with historical test metrics (MAE, RMSE, $R^2$).
- **Telemetry Observation Log**: Latest individual observations for the selected station.

### 4. Reading Records (`/records`)
Dedicated observation log explorer over the entire 1.86M+ database records:
- Server-side multi-parameter filtering by District, Station, Data Quality, and Date Range.
- Server-side sorting by timestamp, groundwater level, or database ID.
- Server-side pagination controls (25, 50, 100 observations per request) with zero client memory overload.
- Color-coded quality flags (`valid`, `suspect`, `invalid`).

### 5. Groundwater Analytics (`/analytics`)
Regional comparative evaluations and statistical regressions:
- **Statewide Trend Analysis**: Multi-year monthly water table regression line and rate of change.
- **District Trend Overlay**: Comparative multi-line time-series graph across districts.
- **District Comparison Matrix**: Tabular matrix comparing station counts, reading volumes, validity percentages, and average depths.
- **Localized District Deep Dives**: Per-district regression slope, trend direction, and seasonal profiles.

---

## 5. In-Memory Session Caching & API Layer

To maximize responsiveness while navigating between application pages, `src/services/api.js` implements a lightweight, zero-dependency session caching architecture:

1. **In-Memory Cache Map**: Fetched API responses are retained in an internal JavaScript `Map` during the active tab session.
2. **Instant Route Navigation**: Returning to a previously visited page (e.g., Dashboard $\to$ Stations $\to$ Dashboard) retrieves the cached data synchronously with zero loading delay and zero network overhead.
3. **In-Flight Request Deduplication**: If multiple components request identical endpoints simultaneously, a shared in-flight Promise is returned, preventing redundant concurrent HTTP requests.
4. **Natural Lifecycle**: Does not use `localStorage` or `sessionStorage`. Data is refreshed upon full page reload (F5 / Ctrl+R).

---

## 6. Local Development & Build Commands

### Prerequisites
- Node.js 18+
- npm 9+

### Commands

```bash
# 1. Install dependencies
npm install

# 2. Start local Vite development server (runs at http://localhost:5173)
npm run dev

# 3. Check code formatting and ESLint rules
npm run lint

# 4. Compile optimized production distribution bundle
npm run build

# 5. Preview production build locally (runs at http://localhost:4173)
npm run preview
```

---

## 7. Environment Variables

Create `.env` in the `frontend/` directory if connecting to a non-default backend:

```env
# URL where the FastAPI backend is running
VITE_API_BASE_URL=http://localhost:8000
```
