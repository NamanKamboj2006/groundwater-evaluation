import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts'

import {
  fetchDashboardOverview,
  fetchRecentReadings,
  fetchMapStations,
  fetchGroundwaterTrend,
  fetchGroundwaterTrendAnalysis,
  getCached,
  hasCached,
} from '../services/api'
import StationMap from '../components/map/StationMap'

window.__PERF_LOGS__ = window.__PERF_LOGS__ || []
function logPerf(metric, durationMs) {
  const entry = { metric, durationMs: Number(durationMs.toFixed(2)), timestamp: Date.now() }
  window.__PERF_LOGS__.push(entry)
  console.log(`[PERF] ${metric}: ${durationMs.toFixed(2)} ms`)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt(n) {
  if (n == null) return '—'
  return Number(n).toLocaleString('en-IN')
}

function fmtDate(ts) {
  if (!ts) return '—'
  return new Date(ts).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function fmtDateTime(ts) {
  if (!ts) return '—'
  return new Date(ts).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function fmtPercent(count, total) {

  if (!total || count == null || total <= 0) return '0.0%'
  const pct = (count / total) * 100
  if (pct === 0) return '0.0%'
  if (pct < 0.1) return '<0.1%'
  return `${pct.toFixed(1)}%`
}

function formatMonthTick(monthStr) {
  if (!monthStr) return ''
  const parts = monthStr.split('-')
  if (parts.length < 2) return monthStr
  const date = new Date(Number(parts[0]), Number(parts[1]) - 1, 1)
  return date.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })
}

function formatMonthTooltip(monthStr) {
  if (!monthStr) return ''
  const parts = monthStr.split('-')
  if (parts.length < 2) return monthStr
  const date = new Date(Number(parts[0]), Number(parts[1]) - 1, 1)
  return date.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
}

function formatPeriodMonth(monthStr) {
  if (!monthStr) return ''
  const parts = monthStr.split('-')
  if (parts.length < 2) return monthStr
  const date = new Date(Number(parts[0]), Number(parts[1]) - 1, 1)
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}


function CustomTrendTooltip({ active, payload, label }) {
  if (active && payload && payload.length) {
    const dataPoint = payload[0].payload
    return (
      <div style={{
        background: '#ffffff',
        border: '1px solid #e5e7eb',
        borderRadius: '6px',
        padding: '8px 12px',
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.06)',
        fontSize: '12px',
        lineHeight: '1.5',
      }}>
        <div style={{ fontWeight: 700, color: '#111827', marginBottom: '4px' }}>
          {formatMonthTooltip(label)}
        </div>
        <div style={{ color: '#6b7280' }}>
          Avg Level: <strong style={{ color: '#2563eb' }}>{Number(dataPoint.average_groundwater_level).toFixed(2)} m</strong>
        </div>
        <div style={{ color: '#6b7280' }}>
          Valid Readings: <span style={{ color: '#374151', fontWeight: 600 }}>{fmt(dataPoint.reading_count)}</span>
        </div>
      </div>
    )
  }
  return null
}

// ─── Shared UI primitives ─────────────────────────────────────────────────────
function Card({ children, style }) {
  return (
    <div style={{
      background: '#fff',
      border: '1px solid #e5e7eb',
      borderRadius: '8px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
      display: 'flex',
      flexDirection: 'column',
      ...style,
    }}>
      {children}
    </div>
  )
}

function CardHeader({ title, meta }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '10px 14px', borderBottom: '1px solid #f3f4f6',
    }}>
      <span style={{ fontSize: '12px', fontWeight: 600, color: '#374151' }}>{title}</span>
      {meta && <span style={{ fontSize: '11px', color: '#9ca3af' }}>{meta}</span>}
    </div>
  )
}

function Skeleton({ h = '16px', w = '60%', style }) {
  return (
    <div style={{
      height: h, width: w,
      background: 'linear-gradient(90deg, #f3f4f6 25%, #e9eaec 50%, #f3f4f6 75%)',
      backgroundSize: '200% 100%',
      animation: 'shimmer 1.4s infinite',
      borderRadius: '4px',
      ...style,
    }} />
  )
}

function ErrorMsg({ text = 'Unable to load groundwater data.' }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '8px',
      padding: '10px 14px',
      background: '#fef2f2', border: '1px solid #fecaca',
      borderRadius: '6px', fontSize: '12px', color: '#b91c1c',
    }}>
      <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9.303 3.376c-.866 1.5-3.07 1.5-3.898 0L5.697 5.876c-.866-1.5.217-3.376 1.948-3.376h12.71c1.73 0 2.813 1.876 1.948 3.376zM12 15.75h.007v.008H12v-.008z" />
      </svg>
      {text}
    </div>
  )
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, accent, iconPath, loading, error }) {
  return (
    <Card style={{ padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
        <span style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#6b7280' }}>
          {label}
        </span>
        <div style={{
          width: '28px', height: '28px', borderRadius: '6px',
          background: accent + '18',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke={accent} strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d={iconPath} />
          </svg>
        </div>
      </div>

      {loading ? (
        <Skeleton h="30px" w="55%" style={{ marginBottom: '8px' }} />
      ) : error ? (
        <div style={{ fontSize: '22px', fontWeight: 700, color: '#dc2626', marginBottom: '4px' }}>Err</div>
      ) : (
        <div style={{ fontSize: '30px', fontWeight: 800, color: '#111827', lineHeight: 1, letterSpacing: '-1px', marginBottom: '4px' }}>
          {value}
        </div>
      )}

      <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '2px' }}>{sub}</div>
    </Card>
  )
}

// ─── District Summary Table ───────────────────────────────────────────────────
function DistrictTable({ districts, loading, error }) {
  if (loading) {
    return (
      <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} h="24px" w="100%" />)}
      </div>
    )
  }

  if (error) {
    return <div style={{ padding: '12px 14px' }}><ErrorMsg /></div>
  }

  if (!districts || districts.length === 0) {
    return (
      <div style={{ padding: '24px 14px', textAlign: 'center', fontSize: '12px', color: '#9ca3af' }}>
        No district data available
      </div>
    )
  }

  return (
    <div style={{ overflowY: 'auto', maxHeight: '280px' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead style={{ position: 'sticky', top: 0, background: '#f9fafb', zIndex: 1 }}>
          <tr>
            {['District', 'Stations', 'Readings'].map(h => (
              <th key={h} style={{
                padding: '6px 14px',
                fontSize: '10px', fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: '0.06em', color: '#9ca3af',
                textAlign: h === 'District' ? 'left' : 'right',
                borderBottom: '1px solid #f3f4f6',
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {districts.map((d, i) => (
            <tr key={d.district}
              style={{ background: i % 2 === 0 ? '#fff' : '#fafafa' }}
            >
              <td style={{ padding: '7px 14px', fontSize: '12px', color: '#374151', fontWeight: 500 }}>
                {d.district}
              </td>
              <td style={{ padding: '7px 14px', fontSize: '12px', color: '#374151', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                {fmt(d.station_count)}
              </td>
              <td style={{ padding: '7px 14px', fontSize: '12px', color: '#374151', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                {fmt(d.reading_count)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Data Quality Panel ───────────────────────────────────────────────────────
function DataQualityPanel({ overall, loading, error }) {
  const total = overall
    ? (overall.valid_readings ?? 0) + (overall.suspect_readings ?? 0) + (overall.invalid_readings ?? 0)
    : 0

  const bars = [
    { label: 'Valid',   color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0', key: 'valid_readings' },
    { label: 'Suspect', color: '#b45309', bg: '#fffbeb', border: '#fde68a', key: 'suspect_readings' },
    { label: 'Invalid', color: '#b91c1c', bg: '#fef2f2', border: '#fecaca', key: 'invalid_readings' },
  ]

  return (
    <div style={{
      padding: '14px 16px',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      flex: 1,
      boxSizing: 'border-box',
    }}>
      <div>
        {error && <div style={{ marginBottom: '10px' }}><ErrorMsg /></div>}
        {bars.map(b => {
          const count = overall?.[b.key] ?? null
          const pct = total > 0 && count != null ? (count / total) * 100 : 0
          const pctLabel = fmtPercent(count, total)
          return (
            <div key={b.label} style={{ marginBottom: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <span style={{ fontSize: '12px', color: '#374151', fontWeight: 500 }}>{b.label}</span>
                {loading ? (
                  <Skeleton h="18px" w="48px" />
                ) : (
                  <span style={{
                    padding: '1px 7px', borderRadius: '3px',
                    background: b.bg, border: `1px solid ${b.border}`,
                    fontSize: '11px', fontWeight: 700, color: b.color,
                    fontVariantNumeric: 'tabular-nums', minWidth: '48px', textAlign: 'center',
                  }}>
                    {count != null ? fmt(count) : '—'}
                  </span>
                )}
              </div>
              <div style={{ height: '6px', background: '#f3f4f6', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  width: loading ? '0%' : `${pct.toFixed(1)}%`,
                  background: b.color,
                  borderRadius: '4px',
                  transition: 'width 0.6s ease',
                }} />
              </div>
              {!loading && count != null && total > 0 && (
                <div style={{ fontSize: '10px', color: '#6b7280', marginTop: '3px', textAlign: 'right', fontWeight: 500 }}>
                  {pctLabel}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {overall && (
        <div style={{
          marginTop: '10px',
          paddingTop: '10px',
          borderTop: '1px solid #f3f4f6',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '11px',
          color: '#6b7280',
        }}>
          {overall.earliest_reading_timestamp && (
            <span>From: <strong style={{ color: '#374151', fontWeight: 600 }}>{fmtDate(overall.earliest_reading_timestamp)}</strong></span>
          )}
          {overall.latest_reading_timestamp && (
            <span>Latest: <strong style={{ color: '#374151', fontWeight: 600 }}>{fmtDate(overall.latest_reading_timestamp)}</strong></span>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Recent Readings Table ───────────────────────────────────────────────────
function RecentReadingsTable({ readings, loading, error, onRetry }) {
  if (loading) {
    return (
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
              {['Timestamp', 'Station', 'District', 'GW Level (m)', 'Quality', 'Status'].map(h => (
                <th key={h} style={{
                  padding: '8px 14px', fontSize: '10px', fontWeight: 700,
                  textTransform: 'uppercase', letterSpacing: '0.06em',
                  color: '#6b7280', whiteSpace: 'nowrap',
                  textAlign: h === 'GW Level (m)' ? 'right' : 'left',
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(i => (
              <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                <td style={{ padding: '10px 14px' }}><Skeleton h="14px" w="120px" /></td>
                <td style={{ padding: '10px 14px' }}><Skeleton h="14px" w="180px" /></td>
                <td style={{ padding: '10px 14px' }}><Skeleton h="14px" w="90px" /></td>
                <td style={{ padding: '10px 14px', textAlign: 'right' }}><Skeleton h="14px" w="65px" style={{ marginLeft: 'auto' }} /></td>
                <td style={{ padding: '10px 14px' }}><Skeleton h="16px" w="50px" /></td>
                <td style={{ padding: '10px 14px' }}><Skeleton h="14px" w="80px" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ padding: '16px 14px' }}>
        <ErrorMsg text="Unable to load recent groundwater telemetry readings." onRetry={onRetry} />
      </div>
    )
  }

  if (!readings || readings.length === 0) {
    return (
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
              {['Timestamp', 'Station', 'District', 'GW Level (m)', 'Quality', 'Status'].map(h => (
                <th key={h} style={{
                  padding: '8px 14px', fontSize: '10px', fontWeight: 700,
                  textTransform: 'uppercase', letterSpacing: '0.06em',
                  color: '#6b7280', whiteSpace: 'nowrap',
                  textAlign: h === 'GW Level (m)' ? 'right' : 'left',
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={6} style={{ padding: '28px 14px', textAlign: 'center' }}>
                <div style={{ fontSize: '12px', color: '#6b7280', fontWeight: 500 }}>
                  No recent readings available
                </div>
                <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '3px' }}>
                  No telemetry observations currently found in the system
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
        <thead>
          <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
            {['Timestamp', 'Station', 'District', 'GW Level (m)', 'Quality', 'Status'].map(h => (
              <th key={h} style={{
                padding: '8px 14px', fontSize: '10px', fontWeight: 700,
                textTransform: 'uppercase', letterSpacing: '0.06em',
                color: '#6b7280', whiteSpace: 'nowrap',
                textAlign: h === 'GW Level (m)' ? 'right' : 'left',
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {readings.map((r, idx) => {
            const isSentinel = Number(r.groundwater_level) <= -900
            const qualityBg = r.data_quality === 'valid' ? '#dcfce7' : r.data_quality === 'suspect' ? '#fef3c7' : '#fee2e2'
            const qualityColor = r.data_quality === 'valid' ? '#15803d' : r.data_quality === 'suspect' ? '#854d0e' : '#b91c1c'
            const qualityBorder = r.data_quality === 'valid' ? '#bbf7d0' : r.data_quality === 'suspect' ? '#fde68a' : '#fecaca'

            return (
              <tr
                key={r.reading_id || r.id || idx}
                style={{
                  background: idx % 2 === 0 ? '#ffffff' : '#fafafa',
                  borderBottom: '1px solid #f3f4f6',
                  transition: 'background 0.15s ease',
                }}
              >
                {/* Timestamp */}
                <td style={{ padding: '9px 14px', fontSize: '11px', color: '#111827', whiteSpace: 'nowrap', fontWeight: 600 }}>
                  {fmtDateTime(r.timestamp)}
                </td>

                {/* Station */}
                <td style={{ padding: '9px 14px' }}>
                  <Link
                    to={`/stations/${r.station_id}`}
                    style={{
                      fontSize: '12px',
                      fontWeight: 700,
                      color: '#1d4ed8',
                      textDecoration: 'none',
                      lineHeight: 1.3,
                      display: 'block',
                    }}
                  >
                    {r.station_name || `Station #${r.station_id}`}
                  </Link>
                  <div style={{ fontSize: '10px', color: '#9ca3af', fontFamily: 'monospace', marginTop: '1px' }}>
                    Station ID #{r.station_id}
                  </div>
                </td>

                {/* District */}
                <td style={{ padding: '9px 14px', fontSize: '12px', fontWeight: 600, color: '#374151', whiteSpace: 'nowrap' }}>
                  {r.district || '—'}
                </td>

                {/* GW Level */}
                <td style={{ padding: '9px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <span style={{
                    fontSize: '12px',
                    fontWeight: 700,
                    fontFamily: 'monospace',
                    color: isSentinel ? '#dc2626' : '#111827',
                  }}>
                    {Number(r.groundwater_level).toFixed(2)} m
                  </span>
                </td>

                {/* Quality */}
                <td style={{ padding: '9px 14px', whiteSpace: 'nowrap' }}>
                  <span
                    title={r.quality_reason || undefined}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      padding: '1px 6px',
                      borderRadius: '3px',
                      fontSize: '10px',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      background: qualityBg,
                      color: qualityColor,
                      border: `1px solid ${qualityBorder}`,
                    }}
                  >
                    {r.data_quality}
                  </span>
                </td>

                {/* Status */}
                <td style={{ padding: '9px 14px', fontSize: '11px', color: '#6b7280', whiteSpace: 'nowrap' }}>
                  <span
                    title={r.quality_reason || undefined}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                      fontWeight: 500,
                    }}
                  >
                    <span style={{
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      background: r.data_quality === 'valid' ? '#16a34a' : r.data_quality === 'suspect' ? '#d97706' : '#dc2626',
                    }} />
                    {r.data_quality === 'valid'
                      ? 'Recorded'
                      : r.data_quality === 'suspect'
                        ? (r.quality_reason || 'Flagged')
                        : (r.quality_reason || 'Invalid')}
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ─── CSS for shimmer animation (injected once) ────────────────────────────────
const shimmerStyle = `

@keyframes shimmer {
  0%   { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
`

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function Dashboard() {
  const [overview, setOverview] = useState(() => getCached('/api/dashboard/overview'))
  const [overviewLoading, setOverviewLoading] = useState(() => !hasCached('/api/dashboard/overview'))
  const [overviewError, setOverviewError] = useState(false)

  const [stations, setStations] = useState(() => getCached('/api/map/stations') ?? [])
  const [stationsLoading, setStationsLoading] = useState(() => !hasCached('/api/map/stations'))
  const [stationsError, setStationsError] = useState(false)

  const [trend, setTrend] = useState(() => getCached('/api/analytics/groundwater-trend')?.data ?? [])
  const [trendLoading, setTrendLoading] = useState(() => !hasCached('/api/analytics/groundwater-trend'))
  const [trendError, setTrendError] = useState(false)

  const [trendAnalysis, setTrendAnalysis] = useState(() => getCached('/api/analytics/groundwater-trend-analysis'))
  const [trendAnalysisLoading, setTrendAnalysisLoading] = useState(() => !hasCached('/api/analytics/groundwater-trend-analysis'))
  const [trendAnalysisError, setTrendAnalysisError] = useState(false)

  const [recentReadings, setRecentReadings] = useState(() => getCached('/api/dashboard/recent-readings', { limit: 10 }) ?? [])
  const [recentReadingsLoading, setRecentReadingsLoading] = useState(() => !hasCached('/api/dashboard/recent-readings', { limit: 10 }))
  const [recentReadingsError, setRecentReadingsError] = useState(false)

  const [refreshKey, setRefreshKey] = useState(0)
  const handleRetry = () => setRefreshKey(k => k + 1)

  useEffect(() => {
    let cancelled = false
    const tDashboardStart = performance.now()

    async function loadDashboardData() {
      if (!hasCached('/api/dashboard/overview')) setOverviewLoading(true)
      if (!hasCached('/api/map/stations')) setStationsLoading(true)
      if (!hasCached('/api/analytics/groundwater-trend')) setTrendLoading(true)
      if (!hasCached('/api/analytics/groundwater-trend-analysis')) setTrendAnalysisLoading(true)
      if (!hasCached('/api/dashboard/recent-readings', { limit: 10 })) setRecentReadingsLoading(true)
      setOverviewError(false)
      setStationsError(false)
      setTrendError(false)
      setTrendAnalysisError(false)
      setRecentReadingsError(false)

      try {
        const [overviewRes, stationsRes, trendRes, analysisRes, recentRes] = await Promise.all([
          (async () => {
            const t0 = performance.now()
            const res = await fetchDashboardOverview()
            logPerf('GET /api/dashboard/overview', performance.now() - t0)
            return res
          })(),
          (async () => {
            const t0 = performance.now()
            const res = await fetchMapStations()
            logPerf('GET /api/map/stations', performance.now() - t0)
            return res
          })(),
          (async () => {
            const t0 = performance.now()
            try {
              const res = await fetchGroundwaterTrend()
              logPerf('GET /api/analytics/groundwater-trend', performance.now() - t0)
              return res
            } catch {
              return null
            }
          })(),
          (async () => {
            const t0 = performance.now()
            try {
              const res = await fetchGroundwaterTrendAnalysis()
              logPerf('GET /api/analytics/groundwater-trend-analysis', performance.now() - t0)
              return res
            } catch {
              return null
            }
          })(),
          (async () => {
            const t0 = performance.now()
            try {
              const res = await fetchRecentReadings(10)
              logPerf('GET /api/dashboard/recent-readings', performance.now() - t0)
              return res
            } catch {
              return null
            }
          })(),
        ])

        if (!cancelled) {
          setOverview(overviewRes)
          setStations(stationsRes)
          if (trendRes?.data) {
            setTrend(trendRes.data)
          } else {
            setTrendError(true)
          }
          if (analysisRes) {
            setTrendAnalysis(analysisRes)
          } else {
            setTrendAnalysisError(true)
          }
          if (recentRes && Array.isArray(recentRes)) {
            setRecentReadings(recentRes)
          } else {
            setRecentReadingsError(true)
          }
          logPerf('Total Initial Data Load (Promise.all concurrent)', performance.now() - tDashboardStart)
        }
      } catch {
        if (!cancelled) {
          setOverviewError(true)
          setStationsError(true)
          setTrendError(true)
          setTrendAnalysisError(true)
          setRecentReadingsError(true)
        }
      } finally {
        if (!cancelled) {
          setOverviewLoading(false)
          setStationsLoading(false)
          setTrendLoading(false)
          setTrendAnalysisLoading(false)
          setRecentReadingsLoading(false)
        }
      }
    }

    loadDashboardData()

    return () => { cancelled = true }
  }, [refreshKey])



  const overall = overview?.overall
  const districts = overview?.districts ?? []
  const freshness = overview?.station_freshness

  const kpi = [
    {
      label: 'Total Stations',
      value: overall ? fmt(overall.total_stations) : '—',
      sub: freshness ? `${fmt(freshness.stations_with_readings)} with readings` : 'Active monitoring boreholes',
      accent: '#2563eb',
      iconPath: 'M15 10.5a3 3 0 11-6 0 3 3 0 016 0zM19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z',
    },
    {
      label: 'Total Readings',
      value: overall ? fmt(overall.total_readings) : '—',
      sub: overall?.latest_reading_timestamp ? `Latest: ${fmtDate(overall.latest_reading_timestamp)}` : 'Recorded observations',
      accent: '#0891b2',
      iconPath: 'M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 011.875 1.875v13.5A1.875 1.875 0 0118.375 21.75H5.625A1.875 1.875 0 013.75 19.875V6.375A1.875 1.875 0 015.625 4.5z',
    },
    {
      label: 'Valid Readings',
      value: overall ? fmt(overall.valid_readings) : '—',
      sub: overall && overall.total_readings > 0
        ? `${fmtPercent(overall.valid_readings, overall.total_readings)} of total`
        : 'Quality verified',
      accent: '#16a34a',
      iconPath: 'M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    },
    {
      label: 'Suspect Readings',
      value: overall ? fmt(overall.suspect_readings) : '—',
      sub: overall && overall.total_readings > 0
        ? `${fmtPercent(overall.suspect_readings, overall.total_readings)} of total`
        : 'Flagged for review',
      accent: '#d97706',
      iconPath: 'M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z',
    },
  ]

  return (
    <>
      {/* Shimmer keyframes */}
      <style>{shimmerStyle}</style>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

        {/* ── Subtitle bar ────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <p style={{ fontSize: '12px', color: '#6b7280', margin: 0 }}>
            Groundwater monitoring network overview
          </p>
          <span style={{ fontSize: '11px', color: '#9ca3af', fontFamily: 'monospace' }}>
            Haryana Telemetry Network
          </span>
        </div>

        {/* ── ROW 1: Four KPI cards ────────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
          {kpi.map(card => (
            <KpiCard
              key={card.label}
              {...card}
              loading={overviewLoading}
              error={overviewError}
            />
          ))}
        </div>

        {/* Top-level error banner if overview failed */}
        {overviewError && (
          <ErrorMsg text="Unable to load dashboard data. Is the backend running at localhost:8000?" />
        )}

        {/* ── ROW 2: Trend (3fr) + District (2fr) ─────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: '10px' }}>

          {/* Groundwater Trend */}
          <Card>
            <CardHeader
              title="Groundwater Trend"
              meta={trendLoading ? 'Loading…' : trendError ? 'Error' : trend && trend.length ? `${trend.length} Months · Monthly Avg` : 'Time-series'}
            />
            <div style={{ padding: '12px 14px' }}>
              {trendLoading ? (
                <div style={{ height: '172px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px', background: '#f9fafb', borderRadius: '5px' }}>
                  <Skeleton h="14px" w="140px" />
                  <Skeleton h="10px" w="90px" />
                </div>
              ) : trendError ? (
                <div style={{ height: '172px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <ErrorMsg text="Unable to load groundwater trend data." />
                </div>
              ) : !trend || trend.length === 0 ? (
                <div style={{ height: '172px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: '12px', background: '#fafafa', border: '1px dashed #e5e7eb', borderRadius: '5px' }}>
                  No groundwater trend data available
                </div>
              ) : (
                <div style={{ height: '172px', width: '100%' }}>
                  <ResponsiveContainer width="100%" height={172}>
                    <LineChart
                      data={trend}
                      margin={{ top: 8, right: 12, left: -14, bottom: 4 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                      <XAxis
                        dataKey="month"
                        tickFormatter={formatMonthTick}
                        tick={{ fontSize: 10, fill: '#64748b' }}
                        tickLine={false}
                        axisLine={{ stroke: '#e2e8f0' }}
                        minTickGap={24}
                      />
                      <YAxis
                        tick={{ fontSize: 10, fill: '#64748b' }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v) => `${Number(v).toFixed(0)}m`}
                        domain={['auto', 'auto']}
                      />
                      <Tooltip content={<CustomTrendTooltip />} />
                      <Line
                        type="monotone"
                        dataKey="average_groundwater_level"
                        stroke="#2563eb"
                        strokeWidth={2}
                        dot={{ r: 2.5, fill: '#2563eb', stroke: '#ffffff', strokeWidth: 1 }}
                        activeDot={{ r: 5, fill: '#1d4ed8', stroke: '#ffffff', strokeWidth: 2 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* ── Trend Analysis Metrics ── */}
              <div style={{
                marginTop: '10px',
                paddingTop: '10px',
                borderTop: '1px solid #f3f4f6',
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: '8px',
              }}>
                {/* Trend Direction */}
                <div style={{ background: '#f9fafb', borderRadius: '6px', padding: '6px 10px', border: '1px solid #f3f4f6' }}>
                  <div style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#6b7280' }}>
                    Trend Analysis
                  </div>
                  {trendAnalysisLoading ? (
                    <Skeleton h="16px" w="65px" style={{ marginTop: '3px' }} />
                  ) : trendAnalysisError || !trendAnalysis ? (
                    <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '2px' }}>—</div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '2px' }}>
                      <span style={{
                        fontSize: '12px',
                        fontWeight: 700,
                        color: trendAnalysis.direction === 'Decreasing' ? '#dc2626' : trendAnalysis.direction === 'Increasing' ? '#16a34a' : '#4b5563',
                      }}>
                        {trendAnalysis.direction}
                      </span>
                      <span style={{
                        fontSize: '9px',
                        fontWeight: 600,
                        padding: '1px 4px',
                        borderRadius: '3px',
                        background: '#f1f5f9',
                        color: '#64748b',
                      }}>
                        {trendAnalysis.strength}
                      </span>
                    </div>
                  )}
                </div>

                {/* Annual Rate (Slope) */}
                <div style={{ background: '#f9fafb', borderRadius: '6px', padding: '6px 10px', border: '1px solid #f3f4f6' }}>
                  <div style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#6b7280' }}>
                    Annual Slope
                  </div>
                  {trendAnalysisLoading ? (
                    <Skeleton h="16px" w="60px" style={{ marginTop: '3px' }} />
                  ) : trendAnalysisError || !trendAnalysis ? (
                    <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '2px' }}>—</div>
                  ) : (
                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#111827', marginTop: '2px' }}>
                      {trendAnalysis.slope_m_per_year > 0 ? '+' : ''}{Number(trendAnalysis.slope_m_per_year).toFixed(2)} m/yr
                    </div>
                  )}
                </div>

                {/* Total Change */}
                <div style={{ background: '#f9fafb', borderRadius: '6px', padding: '6px 10px', border: '1px solid #f3f4f6' }}>
                  <div style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#6b7280' }}>
                    Total Change
                  </div>
                  {trendAnalysisLoading ? (
                    <Skeleton h="16px" w="50px" style={{ marginTop: '3px' }} />
                  ) : trendAnalysisError || !trendAnalysis ? (
                    <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '2px' }}>—</div>
                  ) : (
                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#111827', marginTop: '2px' }}>
                      {trendAnalysis.total_change > 0 ? '+' : ''}{Number(trendAnalysis.total_change).toFixed(2)} m
                    </div>
                  )}
                </div>

                {/* Period */}
                <div style={{ background: '#f9fafb', borderRadius: '6px', padding: '6px 10px', border: '1px solid #f3f4f6' }}>
                  <div style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#6b7280' }}>
                    Period
                  </div>
                  {trendAnalysisLoading ? (
                    <Skeleton h="16px" w="85px" style={{ marginTop: '3px' }} />
                  ) : trendAnalysisError || !trendAnalysis ? (
                    <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '2px' }}>—</div>
                  ) : (
                    <div style={{ fontSize: '11px', fontWeight: 600, color: '#374151', marginTop: '3px', whiteSpace: 'nowrap' }}>
                      {formatPeriodMonth(trendAnalysis.start_month)} – {formatPeriodMonth(trendAnalysis.end_month)}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </Card>

          {/* District Summary */}
          <Card>
            <CardHeader
              title="District Summary"
              meta={overviewLoading ? 'Loading…' : overviewError ? 'Error' : `${districts.length} districts`}
            />
            <DistrictTable districts={districts} loading={overviewLoading} error={overviewError} />
          </Card>
        </div>


        {/* ── ROW 3: Station Map (3fr) + Data Quality (2fr) ───────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: '10px' }}>

          {/* Station Distribution Map */}
          <Card>
            <CardHeader
              title="Station Distribution"
              meta={stationsLoading ? 'Loading…' : stationsError ? 'Error' : `${stations.length} stations · Haryana Telemetry`}
            />
            <div style={{ padding: '12px 14px' }}>
              <StationMap stations={stations} loading={stationsLoading} error={stationsError} />
            </div>
          </Card>

          {/* Data Quality */}
          <Card>
            <CardHeader title="Data Quality" meta="Distribution" />
            <DataQualityPanel overall={overall} loading={overviewLoading} error={overviewError} />
          </Card>
        </div>

        {/* ── ROW 4: Recent Groundwater Readings ─────────────────────────── */}
        <Card style={{ overflow: 'hidden' }}>
          <CardHeader
            title="Recent Groundwater Readings"
            meta={
              recentReadingsLoading
                ? 'Loading…'
                : recentReadingsError
                  ? 'Error'
                  : `${recentReadings.length} Records · Latest Telemetry`
            }
          />
          <RecentReadingsTable
            readings={recentReadings}
            loading={recentReadingsLoading}
            error={recentReadingsError}
            onRetry={handleRetry}
          />

        </Card>


      </div>
    </>
  )
}
