import axios from 'axios'

// ─── Axios instance ───────────────────────────────────────────────────────────
const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'

const apiClient = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
})

// ─── In-Memory Session Cache (Lives only in JS heap during active tab) ────────
// Does NOT use localStorage / sessionStorage. Cleared naturally on full page reload.
const sessionCache = new Map()
const inFlightRequests = new Map()

export function createCacheKey(url, params = {}) {
  if (!params || Object.keys(params).length === 0) {
    return url
  }
  const keys = Object.keys(params).sort()
  const query = keys
    .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== '')
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`)
    .join('&')
  return query ? `${url}?${query}` : url
}

export function getCached(url, params = {}) {
  const cacheKey = createCacheKey(url, params)
  return sessionCache.get(cacheKey) ?? null
}

export function hasCached(url, params = {}) {
  const cacheKey = createCacheKey(url, params)
  return sessionCache.has(cacheKey)
}

export function clearSessionCache() {
  sessionCache.clear()
  inFlightRequests.clear()
}

export async function cachedGet(url, config = {}) {
  const cacheKey = createCacheKey(url, config.params)

  // 1. Return from in-memory cache if already fetched during this session
  if (sessionCache.has(cacheKey)) {
    return sessionCache.get(cacheKey)
  }

  // 2. Return in-flight promise if duplicate request is already pending
  if (inFlightRequests.has(cacheKey)) {
    return inFlightRequests.get(cacheKey)
  }

  // 3. Make fresh network request
  const requestPromise = (async () => {
    try {
      const { data } = await apiClient.get(url, config)
      sessionCache.set(cacheKey, data)
      return data
    } finally {
      inFlightRequests.delete(cacheKey)
    }
  })()

  inFlightRequests.set(cacheKey, requestPromise)
  return requestPromise
}

// ─── Dashboard overview ────────────────────────────────────────────────────────
// GET /api/dashboard/overview
// Returns: { overall, station_freshness, districts[] }
export async function fetchDashboardOverview() {
  return cachedGet('/api/dashboard/overview')
}

// ─── Recent Groundwater Readings ───────────────────────────────────────────────
// GET /api/dashboard/recent-readings
// params: { limit }
// Returns: Array of { reading_id, timestamp, station_id, station_name, district, groundwater_level, data_quality, quality_reason }
export async function fetchRecentReadings(limit = 10) {
  return cachedGet('/api/dashboard/recent-readings', { params: { limit } })
}
export const getRecentReadings = fetchRecentReadings


// ─── Overall summary ───────────────────────────────────────────────────────────
// GET /api/summary
// Returns: { total_stations, total_readings, valid_readings, suspect_readings,
//            invalid_readings, min/max/avg_groundwater_level, timestamps }
export async function fetchOverallSummary() {
  return cachedGet('/api/summary')
}

// ─── Map station markers ───────────────────────────────────────────────────────
// GET /api/map/stations
// Returns: Array of { station_id, station_name, district, state,
//                     latitude, longitude, latest_groundwater_level,
//                     latest_reading_timestamp, latest_data_quality }
export async function fetchMapStations() {
  return cachedGet('/api/map/stations')
}

// ─── Groundwater Trend ────────────────────────────────────────────────────────
// GET /api/analytics/groundwater-trend
// Returns: { data: [{ month, average_groundwater_level, reading_count }], total_months }
export async function fetchGroundwaterTrend() {
  return cachedGet('/api/analytics/groundwater-trend')
}

// ─── Groundwater Trend Analysis ───────────────────────────────────────────────
// GET /api/analytics/groundwater-trend-analysis
// Returns: { start_month, end_month, number_of_months, start_average_level,
//            end_average_level, total_change, slope_m_per_year, direction, strength }
export async function fetchGroundwaterTrendAnalysis() {
  return cachedGet('/api/analytics/groundwater-trend-analysis')
}


// ─── Stations ─────────────────────────────────────────────────────────────────
// GET /api/stations
export async function fetchStations(params = {}) {
  return cachedGet('/api/stations', { params })
}
export const getStations = fetchStations

// GET /api/stations/:id
export async function fetchStation(stationId) {
  return cachedGet(`/api/stations/${stationId}`)
}
export const getStation = fetchStation

// GET /api/stations/:id/readings
export async function fetchStationReadings(stationId, params = {}) {
  return cachedGet(`/api/stations/${stationId}/readings`, { params })
}

// GET /api/analytics/stations/:id/trend
export async function fetchStationTrend(stationId) {
  return cachedGet(`/api/analytics/stations/${stationId}/trend`)
}

// GET /api/analytics/stations/:id/trend-analysis
export async function fetchStationTrendAnalysis(stationId) {
  return cachedGet(`/api/analytics/stations/${stationId}/trend-analysis`)
}

// GET /api/analytics/stations/:id/data-quality
export async function fetchStationDataQuality(stationId) {
  return cachedGet(`/api/analytics/stations/${stationId}/data-quality`)
}

// GET /api/analytics/stations/:id/anomalies
export async function fetchStationAnomalies(stationId) {
  return cachedGet(`/api/analytics/stations/${stationId}/anomalies`)
}

// ─── Readings ─────────────────────────────────────────────────────────────────
// GET /api/readings
// params: { station_id, district, start_time, end_time, data_quality, sort_by, order, skip, limit }
export async function fetchReadings(params = {}) {
  return cachedGet('/api/readings', { params })
}
export const getReadings = fetchReadings

// GET /api/readings/:id
export async function fetchReading(readingId) {
  return cachedGet(`/api/readings/${readingId}`)
}
export const getReading = fetchReading


// ─── District Analytics ───────────────────────────────────────────────────────
// GET /api/analytics/districts
export async function fetchDistricts() {
  return cachedGet('/api/analytics/districts')
}
export const getDistricts = fetchDistricts

// GET /api/analytics/district-comparison
export async function fetchDistrictComparison() {
  return cachedGet('/api/analytics/district-comparison')
}
export const getDistrictComparison = fetchDistrictComparison

// GET /api/analytics/districts/:district
export async function fetchDistrictSummary(district) {
  return cachedGet(`/api/analytics/districts/${encodeURIComponent(district)}`)
}
export const getDistrictSummary = fetchDistrictSummary

// GET /api/analytics/districts/:district/trend
export async function fetchDistrictTrend(district) {
  return cachedGet(`/api/analytics/districts/${encodeURIComponent(district)}/trend`)
}
export const getDistrictTrend = fetchDistrictTrend

// GET /api/analytics/districts/:district/trend-analysis
export async function fetchDistrictTrendAnalysis(district) {
  return cachedGet(`/api/analytics/districts/${encodeURIComponent(district)}/trend-analysis`)
}
export const getDistrictTrendAnalysis = fetchDistrictTrendAnalysis


// ─── Machine Learning Prediction ──────────────────────────────────────────────
// GET /api/ml/prediction/model-info
export async function fetchPredictionModelInfo() {
  return cachedGet('/api/ml/prediction/model-info')
}
export const getPredictionModelInfo = fetchPredictionModelInfo

// GET /api/ml/prediction/stations/:id
export async function fetchStationPrediction(stationId) {
  return cachedGet(`/api/ml/prediction/stations/${stationId}`)
}
export const getStationPrediction = fetchStationPrediction


// ─── Health check ─────────────────────────────────────────────────────────────
// GET /health
// Returns: { status: 'ok', service: 'groundwater-backend' }
export async function fetchHealth() {
  const { data } = await apiClient.get('/health', { timeout: 4000 })
  return data
}

export default apiClient


