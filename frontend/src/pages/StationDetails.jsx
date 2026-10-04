import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts'
import {
  fetchStation,
  fetchStationTrend,
  fetchStationTrendAnalysis,
  fetchStationReadings,
  fetchStationDataQuality,
  fetchStationAnomalies,
  fetchStationPrediction,
  getCached,
  hasCached,
} from '../services/api'

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt(n) {
  if (n == null) return '—'
  return Number(n).toLocaleString('en-IN')
}

function fmtDate(ts) {
  if (!ts) return '—'
  return new Date(ts).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
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

// ─── Custom Recharts Tooltips ─────────────────────────────────────────────────
function CustomStationTooltip({ active, payload, label }) {
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

function CustomCoverageTooltip({ active, payload, label }) {
  if (active && payload && payload.length) {
    const dataPoint = payload[0].payload
    const isLow = dataPoint.coverage_status === 'Low coverage'
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
          Valid Observations: <strong style={{ color: isLow ? '#d97706' : '#2563eb' }}>{fmt(dataPoint.valid_readings)}</strong>
        </div>
        <div style={{ marginTop: '3px' }}>
          <span style={{
            fontSize: '10px',
            fontWeight: 700,
            padding: '1px 5px',
            borderRadius: '3px',
            background: isLow ? '#fffbeb' : '#f0fdf4',
            color: isLow ? '#b45309' : '#16a34a',
            border: `1px solid ${isLow ? '#fde68a' : '#bbf7d0'}`,
          }}>
            {isLow ? 'Low observation coverage' : 'Normal coverage'}
          </span>
        </div>
      </div>
    )
  }
  return null
}

// ─── UI Primitives ────────────────────────────────────────────────────────────
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

function ErrorMsg({ text = 'Unable to load data.' }) {
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

function KpiCard({ label, value, sub, accent, iconPath, loading }) {
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
        <Skeleton h="28px" w="55%" style={{ marginBottom: '8px' }} />
      ) : (
        <div style={{ fontSize: '28px', fontWeight: 800, color: '#111827', lineHeight: 1, letterSpacing: '-0.5px', marginBottom: '4px' }}>
          {value}
        </div>
      )}

      <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '2px' }}>{sub}</div>
    </Card>
  )
}

// ─── Main StationDetails Component ────────────────────────────────────────────
export default function StationDetails() {
  const { id } = useParams()

  const [station, setStation] = useState(() => getCached(`/api/stations/${id}`))
  const [stationLoading, setStationLoading] = useState(() => !hasCached(`/api/stations/${id}`))
  const [stationNotFound, setStationNotFound] = useState(false)
  const [stationError, setStationError] = useState(false)

  const [trend, setTrend] = useState(() => getCached(`/api/analytics/stations/${id}/trend`)?.data ?? [])
  const [trendLoading, setTrendLoading] = useState(() => !hasCached(`/api/analytics/stations/${id}/trend`))
  const [trendError, setTrendError] = useState(false)

  const [trendAnalysis, setTrendAnalysis] = useState(() => getCached(`/api/analytics/stations/${id}/trend-analysis`))
  const [trendAnalysisLoading, setTrendAnalysisLoading] = useState(() => !hasCached(`/api/analytics/stations/${id}/trend-analysis`))
  const [trendAnalysisError, setTrendAnalysisError] = useState(false)

  const [dataQuality, setDataQuality] = useState(() => getCached(`/api/analytics/stations/${id}/data-quality`))
  const [dataQualityLoading, setDataQualityLoading] = useState(() => !hasCached(`/api/analytics/stations/${id}/data-quality`))

  const [anomalies, setAnomalies] = useState(() => getCached(`/api/analytics/stations/${id}/anomalies`))
  const [anomaliesLoading, setAnomaliesLoading] = useState(() => !hasCached(`/api/analytics/stations/${id}/anomalies`))
  const [anomaliesError, setAnomaliesError] = useState(false)

  const [readings, setReadings] = useState(() => getCached(`/api/stations/${id}/readings`, { limit: 10 }) ?? [])
  const [readingsLoading, setReadingsLoading] = useState(() => !hasCached(`/api/stations/${id}/readings`, { limit: 10 }))
  const [readingsError, setReadingsError] = useState(false)

  const [prediction, setPrediction] = useState(() => getCached(`/api/ml/prediction/stations/${id}`))
  const [predictionLoading, setPredictionLoading] = useState(() => !hasCached(`/api/ml/prediction/stations/${id}`))
  const [predictionError, setPredictionError] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function loadStationData() {
      if (!id) return

      if (!hasCached(`/api/stations/${id}`)) setStationLoading(true)
      if (!hasCached(`/api/analytics/stations/${id}/trend`)) setTrendLoading(true)
      if (!hasCached(`/api/analytics/stations/${id}/trend-analysis`)) setTrendAnalysisLoading(true)
      if (!hasCached(`/api/analytics/stations/${id}/data-quality`)) setDataQualityLoading(true)
      if (!hasCached(`/api/analytics/stations/${id}/anomalies`)) setAnomaliesLoading(true)
      if (!hasCached(`/api/stations/${id}/readings`, { limit: 10 })) setReadingsLoading(true)
      if (!hasCached(`/api/ml/prediction/stations/${id}`)) setPredictionLoading(true)

      setStationNotFound(false)
      setStationError(false)
      setTrendError(false)
      setTrendAnalysisError(false)
      setAnomaliesError(false)
      setReadingsError(false)
      setPredictionError(false)

      try {
        const [stRes, trRes, anRes, dqRes, anmRes, rdRes, predRes] = await Promise.all([
          (async () => {
            try {
              return await fetchStation(id)
            } catch (err) {
              if (err?.response?.status === 404) {
                setStationNotFound(true)
              }
              throw err
            }
          })(),
          (async () => {
            try {
              return await fetchStationTrend(id)
            } catch {
              return null
            }
          })(),
          (async () => {
            try {
              return await fetchStationTrendAnalysis(id)
            } catch {
              return null
            }
          })(),
          (async () => {
            try {
              return await fetchStationDataQuality(id)
            } catch {
              return null
            }
          })(),
          (async () => {
            try {
              return await fetchStationAnomalies(id)
            } catch {
              return null
            }
          })(),
          (async () => {
            try {
              return await fetchStationReadings(id, { limit: 10 })
            } catch {
              return []
            }
          })(),
          (async () => {
            try {
              return await fetchStationPrediction(id)
            } catch {
              return null
            }
          })(),
        ])

        if (!cancelled) {
          setStation(stRes)
          if (trRes?.data) {
            setTrend(trRes.data)
          } else {
            setTrendError(true)
          }
          if (anRes) {
            setTrendAnalysis(anRes)
          } else {
            setTrendAnalysisError(true)
          }
          if (dqRes) {
            setDataQuality(dqRes)
          }
          if (anmRes) {
            setAnomalies(anmRes)
          } else {
            setAnomaliesError(true)
          }
          setReadings(Array.isArray(rdRes) ? rdRes : [])
          if (predRes) {
            setPrediction(predRes)
          } else {
            setPredictionError(true)
          }
        }
      } catch (err) {
        if (!cancelled) {
          if (err?.response?.status !== 404) {
            setStationError(true)
          }
        }
      } finally {
        if (!cancelled) {
          setStationLoading(false)
          setTrendLoading(false)
          setTrendAnalysisLoading(false)
          setDataQualityLoading(false)
          setAnomaliesLoading(false)
          setReadingsLoading(false)
          setPredictionLoading(false)
        }
      }
    }

    loadStationData()

    return () => { cancelled = true }
  }, [id])

  if (stationNotFound) {
    return (
      <div style={{ padding: '40px 20px', textAlign: 'center' }}>
        <div style={{
          maxWidth: '480px',
          margin: '0 auto',
          background: '#fff',
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          padding: '32px 24px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        }}>
          <div style={{
            width: '44px',
            height: '44px',
            borderRadius: '50%',
            background: '#fef2f2',
            color: '#dc2626',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 14px',
          }}>
            <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9.303 3.376c-.866 1.5-3.07 1.5-3.898 0L5.697 5.876c-.866-1.5.217-3.376 1.948-3.376h12.71c1.73 0 2.813 1.876 1.948 3.376zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          </div>
          <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#111827', margin: '0 0 6px' }}>
            Station Not Found
          </h2>
          <p style={{ fontSize: '13px', color: '#6b7280', margin: '0 0 20px' }}>
            The requested monitoring station #{id} does not exist in the database.
          </p>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
            <Link
              to="/stations"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '7px 16px',
                background: '#2563eb',
                color: '#fff',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              ← Back to Stations
            </Link>
            <Link
              to="/dashboard"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '7px 16px',
                background: '#f3f4f6',
                color: '#374151',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              Dashboard
            </Link>
          </div>
        </div>
      </div>
    )
  }

  const totalReadings = dataQuality?.total_readings ?? station?.total_readings ?? 0
  const validReadings = dataQuality?.valid_readings ?? station?.valid_readings ?? 0
  const suspectReadings = dataQuality?.suspect_readings ?? station?.suspect_readings ?? 0
  const invalidReadings = dataQuality?.invalid_readings ?? station?.invalid_readings ?? 0

  const kpis = [
    {
      label: 'Total Readings',
      value: station ? fmt(totalReadings) : '—',
      sub: station?.latest_reading_timestamp ? `Latest: ${fmtDate(station.latest_reading_timestamp)}` : 'Recorded observations',
      accent: '#2563eb',
      iconPath: 'M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 011.875 1.875v13.5A1.875 1.875 0 0118.375 21.75H5.625A1.875 1.875 0 013.75 19.875V6.375A1.875 1.875 0 015.625 4.5z',
    },
    {
      label: 'Valid Readings',
      value: station ? fmt(validReadings) : '—',
      sub: totalReadings > 0 ? `${fmtPercent(validReadings, totalReadings)} of total` : 'Quality verified',
      accent: '#16a34a',
      iconPath: 'M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    },
    {
      label: 'Suspect Readings',
      value: station ? fmt(suspectReadings) : '—',
      sub: totalReadings > 0 ? `${fmtPercent(suspectReadings, totalReadings)} of total` : 'Flagged for review',
      accent: '#d97706',
      iconPath: 'M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z',
    },
    {
      label: 'Invalid Readings',
      value: station ? fmt(invalidReadings) : '—',
      sub: totalReadings > 0 ? `${fmtPercent(invalidReadings, totalReadings)} of total` : 'Excluded records',
      accent: '#dc2626',
      iconPath: 'M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636',
    },
  ]

  const infoFields = [
    { label: 'District', value: station?.district || '—' },
    { label: 'State', value: station?.state || '—' },
    { label: 'Tehsil', value: station?.tehsil && station.tehsil !== '-' ? station.tehsil : '—' },
    { label: 'Agency', value: station?.agency || '—' },
    {
      label: 'Latitude',
      value: station?.latitude != null ? `${station.latitude.toFixed(6)}° N` : '—',
      mono: true,
    },
    {
      label: 'Longitude',
      value: station?.longitude != null ? `${station.longitude.toFixed(6)}° E` : '—',
      mono: true,
    },
    {
      label: 'RL MSL (Elevation)',
      value: station?.rl_msl != null ? `${station.rl_msl.toFixed(2)} m` : '—',
      mono: true,
    },
    {
      label: 'Observation Range',
      value: station?.earliest_reading_timestamp && station?.latest_reading_timestamp
        ? `${fmtDate(station.earliest_reading_timestamp)} – ${fmtDate(station.latest_reading_timestamp)}`
        : '—',
    },
  ]

  const screeningSummary = anomalies?.summary
  const outlierScreening = anomalies?.outlier_screening
  const suddenChangeScreening = anomalies?.sudden_change_screening
  const coverageScreening = anomalies?.coverage_screening

  const outliersList = outlierScreening?.outliers ?? []
  const suddenChangesList = suddenChangeScreening?.changes ?? []
  const coverageData = coverageScreening?.monthly_coverage ?? []

  const dqBars = [
    { label: 'Valid', color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0', count: validReadings },
    { label: 'Suspect', color: '#b45309', bg: '#fffbeb', border: '#fde68a', count: suspectReadings },
    { label: 'Invalid', color: '#b91c1c', bg: '#fef2f2', border: '#fecaca', count: invalidReadings },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      
      {/* ── Header Bar ────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px',
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <Link
              to="/stations"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '11px',
                fontWeight: 600,
                color: '#6b7280',
                textDecoration: 'none',
                padding: '3px 8px',
                background: '#ffffff',
                border: '1px solid #e5e7eb',
                borderRadius: '4px',
              }}
            >
              ← Back to Stations
            </Link>
            <span style={{ fontSize: '11px', color: '#9ca3af' }}>/</span>
            <span style={{ fontSize: '11px', color: '#2563eb', fontWeight: 600 }}>
              Station #{id}
            </span>
          </div>

          {stationLoading ? (
            <Skeleton h="24px" w="260px" style={{ marginTop: '6px' }} />
          ) : (
            <h1 style={{ fontSize: '20px', fontWeight: 800, color: '#111827', margin: '4px 0 2px' }}>
              {station?.station_name || `Station #${id}`}
            </h1>
          )}

          <div style={{ fontSize: '12px', color: '#6b7280', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>{station?.district ? `${station.district}, Haryana` : 'Haryana Telemetry Network'}</span>
            {station?.agency && (
              <>
                <span style={{ color: '#d1d5db' }}>•</span>
                <span>{station.agency}</span>
              </>
            )}
          </div>
        </div>

        {station && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: '6px',
            padding: '6px 12px',
            fontSize: '11px',
            color: '#374151',
          }}>
            <span style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: '#16a34a',
              display: 'inline-block',
            }} />
            <span style={{ fontFamily: 'monospace' }}>
              {station.latitude.toFixed(4)}°N, {station.longitude.toFixed(4)}°E
            </span>
          </div>
        )}
      </div>

      {stationError && (
        <ErrorMsg text="Unable to load station metadata. Is the backend running?" />
      )}

      {/* ── ROW 1: Four KPI Cards ─────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
        {kpis.map(card => (
          <KpiCard
            key={card.label}
            {...card}
            loading={stationLoading}
          />
        ))}
      </div>

      {/* ── ROW 2: Trend Chart (3fr) + Station Information (2fr) ──────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: '10px' }}>

        {/* Station Groundwater Trend */}
        <Card>
          <CardHeader
            title="Groundwater Trend"
            meta={trendLoading ? 'Loading…' : trendError ? 'Error' : trend && trend.length ? `${trend.length} Months · Valid Observations` : 'Time-series'}
          />
          <div style={{ padding: '12px 14px' }}>
            {trendLoading ? (
              <div style={{ height: '180px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px', background: '#f9fafb', borderRadius: '5px' }}>
                <Skeleton h="14px" w="140px" />
                <Skeleton h="10px" w="90px" />
              </div>
            ) : trendError ? (
              <div style={{ height: '180px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <ErrorMsg text="Unable to load groundwater trend for this station." />
              </div>
            ) : !trend || trend.length === 0 ? (
              <div style={{ height: '180px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: '12px', background: '#fafafa', border: '1px dashed #e5e7eb', borderRadius: '5px', gap: '4px' }}>
                <span style={{ fontWeight: 500, color: '#6b7280' }}>No valid groundwater readings are available for trend analysis.</span>
                <span style={{ fontSize: '11px' }}>This station has no verified valid telemetry readings.</span>
              </div>
            ) : (
              <div style={{ height: '180px', width: '100%' }}>
                <ResponsiveContainer width="100%" height={180}>
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
                      minTickGap={20}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: '#64748b' }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v) => `${Number(v).toFixed(0)}m`}
                      domain={['auto', 'auto']}
                    />
                    <Tooltip content={<CustomStationTooltip />} />
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

            {/* ── Trend Analysis Metrics Strip ── */}
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
                ) : trendAnalysisError || !trendAnalysis || !trendAnalysis.start_month ? (
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

        {/* Station Information Card */}
        <Card>
          <CardHeader title="Station Profile" meta={`ID #${id}`} />
          <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {stationLoading ? (
              [1, 2, 3, 4, 5, 6].map(i => <Skeleton key={i} h="22px" w="100%" />)
            ) : (
              infoFields.map(f => (
                <div
                  key={f.label}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '4px 0',
                    borderBottom: '1px solid #f9fafb',
                    fontSize: '12px',
                  }}
                >
                  <span style={{ color: '#6b7280', fontWeight: 500 }}>{f.label}</span>
                  <span style={{
                    color: '#111827',
                    fontWeight: 600,
                    fontFamily: f.mono ? 'monospace' : 'inherit',
                    fontSize: f.mono ? '11.5px' : '12px',
                    textAlign: 'right',
                  }}>
                    {f.value}
                  </span>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      {/* ── ROW: GROUNDWATER PREDICTION CARD ──────────────────────────── */}
      <Card>
        <CardHeader
          title="Groundwater Prediction"
          meta={
            predictionLoading
              ? 'Loading ML forecast…'
              : predictionError || !prediction
              ? 'Prediction unavailable'
              : prediction.status === 'limited_history'
              ? 'Limited Historical Data'
              : prediction.prediction_target_month
              ? `Forecast Target: ${formatPeriodMonth(prediction.prediction_target_month)}`
              : 'Next-Month Forecast'
          }
        />
        <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {predictionLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <Skeleton h="42px" w="100%" />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
                {[1, 2, 3, 4].map(i => (
                  <Skeleton key={i} h="64px" w="100%" />
                ))}
              </div>
              <Skeleton h="36px" w="100%" />
            </div>
          ) : predictionError || !prediction ? (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '12px 14px',
              background: '#f9fafb',
              border: '1px solid #e5e7eb',
              borderRadius: '6px',
              fontSize: '12px',
              color: '#6b7280',
            }}>
              <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="#9ca3af" strokeWidth={2} style={{ flexShrink: 0 }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>Prediction unavailable</span>
            </div>
          ) : prediction.status === 'insufficient_data' || prediction.status === 'no_data' || prediction.predicted_groundwater_level == null ? (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '12px 14px',
              background: '#f9fafb',
              border: '1px solid #e5e7eb',
              borderRadius: '6px',
              fontSize: '12px',
              color: '#6b7280',
            }}>
              <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="#9ca3af" strokeWidth={2} style={{ flexShrink: 0 }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{prediction.notice || 'Insufficient historical observations to generate a monthly prediction.'}</span>
            </div>
          ) : (
            <>
              {/* Limited History State Banner */}
              {prediction.status === 'limited_history' && (
                <div style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '8px',
                  padding: '9px 12px',
                  background: '#fffbeb',
                  border: '1px solid #fde68a',
                  borderRadius: '6px',
                  fontSize: '12px',
                  color: '#92400e',
                }}>
                  <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="#b45309" strokeWidth={2} style={{ flexShrink: 0, marginTop: '1px' }}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                  </svg>
                  <div>
                    <span style={{ fontWeight: 700 }}>Limited historical data: </span>
                    <span>This station has limited historical observations. The prediction should be interpreted cautiously.</span>
                  </div>
                </div>
              )}

              {/* Mini visual comparison: Latest Level -> Predicted Level */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '6px',
                padding: '10px 14px',
                flexWrap: 'wrap',
                gap: '10px',
              }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                  <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Latest Level:</span>
                  <span style={{ fontSize: '15px', fontWeight: 700, color: '#1e293b', fontVariantNumeric: 'tabular-nums' }}>
                    {Number(prediction.latest_observed_level).toFixed(2)} m
                  </span>
                  <span style={{ fontSize: '11px', color: '#64748b' }}>
                    ({formatPeriodMonth(prediction.latest_observed_month)})
                  </span>
                </div>

                <div style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: '#ffffff',
                  padding: '3px 8px',
                  borderRadius: '4px',
                  border: '1px solid #e2e8f0',
                  fontSize: '11px',
                  fontWeight: 600,
                  color: '#475569',
                }}>
                  <span>Predicted Change:</span>
                  <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: '#0f172a' }}>
                    {prediction.predicted_monthly_change > 0 ? '+' : ''}{Number(prediction.predicted_monthly_change).toFixed(2)} m
                  </span>
                  <span style={{ color: '#94a3b8' }}>→</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                  <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Predicted Level:</span>
                  <span style={{ fontSize: '15px', fontWeight: 800, color: '#2563eb', fontVariantNumeric: 'tabular-nums' }}>
                    {Number(prediction.predicted_groundwater_level).toFixed(2)} m
                  </span>
                  <span style={{ fontSize: '11px', color: '#2563eb', fontWeight: 600 }}>
                    ({formatPeriodMonth(prediction.prediction_target_month)})
                  </span>
                </div>
              </div>

              {/* 4-Item Numerical Metrics Grid */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: '10px',
              }}>
                {/* 1. Latest Level */}
                <div style={{ background: '#f9fafb', border: '1px solid #f3f4f6', borderRadius: '6px', padding: '10px 12px' }}>
                  <div style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#6b7280' }}>
                    Latest Level
                  </div>
                  <div style={{ fontSize: '18px', fontWeight: 800, color: '#111827', marginTop: '2px', fontVariantNumeric: 'tabular-nums' }}>
                    {Number(prediction.latest_observed_level).toFixed(2)} m
                  </div>
                  <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>
                    {formatPeriodMonth(prediction.latest_observed_month)}
                  </div>
                </div>

                {/* 2. Predicted Level */}
                <div style={{ background: '#f9fafb', border: '1px solid #f3f4f6', borderRadius: '6px', padding: '10px 12px' }}>
                  <div style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#6b7280' }}>
                    Predicted Level
                  </div>
                  <div style={{ fontSize: '18px', fontWeight: 800, color: '#2563eb', marginTop: '2px', fontVariantNumeric: 'tabular-nums' }}>
                    {Number(prediction.predicted_groundwater_level).toFixed(2)} m
                  </div>
                  <div style={{ fontSize: '11px', color: '#2563eb', fontWeight: 500, marginTop: '2px' }}>
                    {formatPeriodMonth(prediction.prediction_target_month)}
                  </div>
                </div>

                {/* 3. Predicted Change */}
                <div style={{ background: '#f9fafb', border: '1px solid #f3f4f6', borderRadius: '6px', padding: '10px 12px' }}>
                  <div style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#6b7280' }}>
                    Predicted Change
                  </div>
                  <div style={{ fontSize: '18px', fontWeight: 800, color: '#111827', marginTop: '2px', fontVariantNumeric: 'tabular-nums' }}>
                    {prediction.predicted_monthly_change > 0 ? '+' : ''}{Number(prediction.predicted_monthly_change).toFixed(2)} m
                  </div>
                  <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>
                    Expected monthly shift
                  </div>
                </div>

                {/* 4. Model */}
                <div style={{ background: '#f9fafb', border: '1px solid #f3f4f6', borderRadius: '6px', padding: '10px 12px' }}>
                  <div style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#6b7280' }}>
                    Model
                  </div>
                  <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#111827', marginTop: '4px', wordBreak: 'break-word' }}>
                    {prediction.model_name || 'HistGradientBoostingRegressor'}
                  </div>
                  <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>
                    Time-series ML Regressor
                  </div>
                </div>
              </div>

              {/* Evaluation Metrics Strip */}
              <div style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '6px',
                padding: '10px 14px',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                gap: '12px',
              }}>
                <div>
                  <div style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#64748b' }}>
                    Test MAE
                  </div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a', marginTop: '2px', fontVariantNumeric: 'tabular-nums' }}>
                    {prediction.model_test_mae != null ? `${Number(prediction.model_test_mae).toFixed(2)} m` : '—'}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#64748b' }}>
                    Test RMSE
                  </div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a', marginTop: '2px', fontVariantNumeric: 'tabular-nums' }}>
                    {prediction.model_test_rmse != null ? `${Number(prediction.model_test_rmse).toFixed(2)} m` : '—'}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#64748b' }}>
                    Test R²
                  </div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a', marginTop: '2px', fontVariantNumeric: 'tabular-nums' }}>
                    {prediction.model_test_r2 != null ? Number(prediction.model_test_r2).toFixed(3) : '—'}
                  </div>
                </div>
              </div>

              {/* Academic Notice */}
              <div style={{ fontSize: '11px', color: '#6b7280', fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{ flexShrink: 0 }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>{prediction.notice || 'Prediction is an estimate, not a guarantee.'}</span>
              </div>
            </>
          )}
        </div>
      </Card>

      {/* ── ROW 3: DATA QUALITY & ANOMALY SCREENING ───────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ fontSize: '14px', fontWeight: 700, color: '#111827', margin: '0 0 2px' }}>
              Data Quality & Anomaly Screening
            </h2>
            <p style={{ fontSize: '11px', color: '#6b7280', margin: 0 }}>
              Statistical screening indicators for extreme values, sudden shifts, and observation gaps (requires domain interpretation).
            </p>
          </div>
          {screeningSummary && (
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              padding: '3px 10px',
              borderRadius: '5px',
              fontSize: '11px',
              fontWeight: 700,
              background: screeningSummary.overall_screening_status === 'Review Recommended' ? '#fff1f2' : '#f0fdf4',
              color: screeningSummary.overall_screening_status === 'Review Recommended' ? '#be123c' : '#15803d',
              border: `1px solid ${screeningSummary.overall_screening_status === 'Review Recommended' ? '#fecdd3' : '#bbf7d0'}`,
            }}>
              <span style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: screeningSummary.overall_screening_status === 'Review Recommended' ? '#e11d48' : '#16a34a',
              }} />
              {screeningSummary.overall_screening_status}
            </span>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          {/* Data Quality & Screening Overview */}
          <Card>
            <CardHeader title="Quality Distribution & Screening Flags" meta="Overview" />
            <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              
              {/* Quality Breakdown Bars */}
              <div>
                <div style={{ fontSize: '11px', fontWeight: 600, color: '#4b5563', marginBottom: '8px' }}>
                  Data Quality Status
                </div>
                {dqBars.map(b => {
                  const pct = totalReadings > 0 ? (b.count / totalReadings) * 100 : 0
                  const pctLabel = fmtPercent(b.count, totalReadings)
                  return (
                    <div key={b.label} style={{ marginBottom: '8px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
                        <span style={{ fontSize: '11px', color: '#374151', fontWeight: 500 }}>{b.label}</span>
                        {dataQualityLoading ? (
                          <Skeleton h="14px" w="40px" />
                        ) : (
                          <span style={{ fontSize: '11px', fontWeight: 700, color: b.color, fontVariantNumeric: 'tabular-nums' }}>
                            {fmt(b.count)} <span style={{ color: '#9ca3af', fontWeight: 500 }}>({pctLabel})</span>
                          </span>
                        )}
                      </div>
                      <div style={{ height: '5px', background: '#f3f4f6', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{
                          height: '100%',
                          width: dataQualityLoading ? '0%' : `${pct.toFixed(1)}%`,
                          background: b.color,
                          borderRadius: '3px',
                          transition: 'width 0.6s ease',
                        }} />
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Statistical Screening Flags Summary */}
              <div style={{ paddingTop: '10px', borderTop: '1px solid #f3f4f6' }}>
                <div style={{ fontSize: '11px', fontWeight: 600, color: '#4b5563', marginBottom: '8px' }}>
                  Statistical Screening Indicators
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
                  <div style={{ background: '#f9fafb', border: '1px solid #f3f4f6', borderRadius: '5px', padding: '6px 8px' }}>
                    <div style={{ fontSize: '9.5px', color: '#6b7280', fontWeight: 600, textTransform: 'uppercase' }}>
                      Outliers (IQR)
                    </div>
                    {anomaliesLoading ? (
                      <Skeleton h="16px" w="30px" style={{ marginTop: '3px' }} />
                    ) : (
                      <div style={{ fontSize: '15px', fontWeight: 800, color: (screeningSummary?.potential_outliers ?? 0) > 0 ? '#dc2626' : '#111827', marginTop: '2px' }}>
                        {screeningSummary?.potential_outliers ?? 0}
                      </div>
                    )}
                  </div>

                  <div style={{ background: '#f9fafb', border: '1px solid #f3f4f6', borderRadius: '5px', padding: '6px 8px' }}>
                    <div style={{ fontSize: '9.5px', color: '#6b7280', fontWeight: 600, textTransform: 'uppercase' }}>
                      Sudden Shifts
                    </div>
                    {anomaliesLoading ? (
                      <Skeleton h="16px" w="30px" style={{ marginTop: '3px' }} />
                    ) : (
                      <div style={{ fontSize: '15px', fontWeight: 800, color: (screeningSummary?.potential_sudden_changes ?? 0) > 0 ? '#d97706' : '#111827', marginTop: '2px' }}>
                        {screeningSummary?.potential_sudden_changes ?? 0}
                      </div>
                    )}
                  </div>

                  <div style={{ background: '#f9fafb', border: '1px solid #f3f4f6', borderRadius: '5px', padding: '6px 8px' }}>
                    <div style={{ fontSize: '9.5px', color: '#6b7280', fontWeight: 600, textTransform: 'uppercase' }}>
                      Low Coverage
                    </div>
                    {anomaliesLoading ? (
                      <Skeleton h="16px" w="30px" style={{ marginTop: '3px' }} />
                    ) : (
                      <div style={{ fontSize: '15px', fontWeight: 800, color: (screeningSummary?.low_coverage_months ?? 0) > 0 ? '#d97706' : '#111827', marginTop: '2px' }}>
                        {screeningSummary?.low_coverage_months ?? 0}
                      </div>
                    )}
                  </div>
                </div>
              </div>

            </div>
          </Card>

          {/* Monthly Observation Coverage Chart */}
          <Card>
            <CardHeader
              title="Monthly Observation Coverage"
              meta={coverageScreening?.median_monthly_readings != null ? `Median: ${coverageScreening.median_monthly_readings} obs/mo` : 'Valid counts'}
            />
            <div style={{ padding: '12px 14px' }}>
              {anomaliesLoading ? (
                <div style={{ height: '175px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px', background: '#f9fafb', borderRadius: '5px' }}>
                  <Skeleton h="14px" w="130px" />
                  <Skeleton h="10px" w="80px" />
                </div>
              ) : anomaliesError || coverageData.length === 0 ? (
                <div style={{ height: '175px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: '12px', background: '#fafafa', border: '1px dashed #e5e7eb', borderRadius: '5px' }}>
                  No observation coverage records
                </div>
              ) : (
                <div style={{ height: '175px', width: '100%' }}>
                  <ResponsiveContainer width="100%" height={175}>
                    <BarChart
                      data={coverageData}
                      margin={{ top: 8, right: 10, left: -18, bottom: 4 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                      <XAxis
                        dataKey="month"
                        tickFormatter={formatMonthTick}
                        tick={{ fontSize: 10, fill: '#64748b' }}
                        tickLine={false}
                        axisLine={{ stroke: '#e2e8f0' }}
                        minTickGap={16}
                      />
                      <YAxis
                        tick={{ fontSize: 10, fill: '#64748b' }}
                        tickLine={false}
                        axisLine={false}
                        allowDecimals={false}
                      />
                      <Tooltip content={<CustomCoverageTooltip />} />
                      <Bar dataKey="valid_readings" radius={[3, 3, 0, 0]}>
                        {coverageData.map((entry, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={entry.coverage_status === 'Low coverage' ? '#f59e0b' : '#3b82f6'}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* Potential Anomalies & Outliers Table */}
        <Card style={{ overflow: 'hidden' }}>
          <CardHeader
            title="Potential Statistical Screening Flags"
            meta={
              (outliersList.length + suddenChangesList.length) > 0
                ? `${outliersList.length + suddenChangesList.length} Flagged Events`
                : 'Zero Anomalies'
            }
          />
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                  {['Event Period', 'Observed Value / Shift', 'Flag Category', 'Statistical Screening Note'].map(h => (
                    <th key={h} style={{
                      padding: '8px 14px', fontSize: '10px', fontWeight: 700,
                      textTransform: 'uppercase', letterSpacing: '0.06em',
                      color: '#6b7280', whiteSpace: 'nowrap',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {anomaliesLoading ? (
                  [1, 2].map(i => (
                    <tr key={i}>
                      <td colSpan={4} style={{ padding: '8px 14px' }}>
                        <Skeleton h="20px" w="100%" />
                      </td>
                    </tr>
                  ))
                ) : (outlierScreening?.sample_size ?? 0) < 4 ? (
                  <tr>
                    <td colSpan={4} style={{ padding: '24px 14px', textAlign: 'center', color: '#9ca3af', fontSize: '12px' }}>
                      Insufficient monthly history for statistical anomaly screening (minimum 4 months required).
                    </td>
                  </tr>
                ) : (outliersList.length === 0 && suddenChangesList.length === 0) ? (
                  <tr>
                    <td colSpan={4} style={{ padding: '24px 14px', textAlign: 'center', color: '#16a34a', fontSize: '12px', fontWeight: 500 }}>
                      ✓ No statistical anomalies detected by the current screening methods.
                    </td>
                  </tr>
                ) : (
                  <>
                    {outliersList.map((o, idx) => (
                      <tr key={`outlier-${idx}`} style={{ background: '#ffffff', borderBottom: '1px solid #f3f4f6' }}>
                        <td style={{ padding: '8px 14px', fontSize: '12px', fontWeight: 600, color: '#111827' }}>
                          {formatPeriodMonth(o.month)}
                        </td>
                        <td style={{ padding: '8px 14px', fontSize: '12px', fontWeight: 700, color: '#dc2626', fontVariantNumeric: 'tabular-nums' }}>
                          {Number(o.average_groundwater_level).toFixed(2)} m
                        </td>
                        <td style={{ padding: '8px 14px', fontSize: '11px' }}>
                          <span style={{ padding: '1px 6px', borderRadius: '3px', fontWeight: 600, background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca' }}>
                            Statistical Outlier
                          </span>
                        </td>
                        <td style={{ padding: '8px 14px', fontSize: '11px', color: '#6b7280' }}>
                          {o.reason} {outlierScreening?.lower_bound != null && `(Bounds: ${outlierScreening.lower_bound}m to ${outlierScreening.upper_bound}m)`}
                        </td>
                      </tr>
                    ))}

                    {suddenChangesList.map((c, idx) => (
                      <tr key={`change-${idx}`} style={{ background: '#ffffff', borderBottom: '1px solid #f3f4f6' }}>
                        <td style={{ padding: '8px 14px', fontSize: '12px', fontWeight: 600, color: '#111827' }}>
                          {formatPeriodMonth(c.from_month)} → {formatPeriodMonth(c.to_month)}
                        </td>
                        <td style={{ padding: '8px 14px', fontSize: '12px', fontWeight: 700, color: '#d97706', fontVariantNumeric: 'tabular-nums' }}>
                          {c.change > 0 ? '+' : ''}{Number(c.change).toFixed(2)} m
                        </td>
                        <td style={{ padding: '8px 14px', fontSize: '11px' }}>
                          <span style={{ padding: '1px 6px', borderRadius: '3px', fontWeight: 600, background: '#fffbeb', color: '#b45309', border: '1px solid #fde68a' }}>
                            Sudden Change
                          </span>
                        </td>
                        <td style={{ padding: '8px 14px', fontSize: '11px', color: '#6b7280' }}>
                          {c.reason} {suddenChangeScreening?.threshold != null && `(IQR Threshold: ${suddenChangeScreening.threshold}m)`}
                        </td>
                      </tr>
                    ))}
                  </>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* ── ROW 4: Recent Telemetry Readings Table ────────────────────────── */}
      <Card style={{ overflow: 'hidden' }}>
        <CardHeader
          title="Recent Groundwater Readings"
          meta={readingsLoading ? 'Loading…' : `${readings.length} latest records`}
        />
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                {['Timestamp', 'GW Level (m)', 'Data Quality', 'Source Ref'].map(h => (
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
              {readingsLoading ? (
                [1, 2, 3, 4, 5].map(i => (
                  <tr key={i}>
                    <td colSpan={4} style={{ padding: '8px 14px' }}>
                      <Skeleton h="20px" w="100%" />
                    </td>
                  </tr>
                ))
              ) : readingsError ? (
                <tr>
                  <td colSpan={4} style={{ padding: '16px 14px' }}>
                    <ErrorMsg text="Unable to load recent readings." />
                  </td>
                </tr>
              ) : readings.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ padding: '28px 14px', textAlign: 'center' }}>
                    <div style={{ fontSize: '12px', color: '#6b7280', fontWeight: 500 }}>
                      No telemetry readings available for Station #{id}
                    </div>
                  </td>
                </tr>
              ) : (
                readings.map((r, i) => (
                  <tr
                    key={r.id || i}
                    style={{
                      background: i % 2 === 0 ? '#ffffff' : '#fafafa',
                      borderBottom: '1px solid #f3f4f6',
                    }}
                  >
                    <td style={{ padding: '8px 14px', fontSize: '12px', color: '#374151', fontVariantNumeric: 'tabular-nums' }}>
                      {fmtDateTime(r.timestamp)}
                    </td>
                    <td style={{
                      padding: '8px 14px',
                      fontSize: '12px',
                      fontWeight: 700,
                      color: '#111827',
                      textAlign: 'right',
                      fontVariantNumeric: 'tabular-nums',
                    }}>
                      {r.groundwater_level != null ? `${Number(r.groundwater_level).toFixed(2)} m` : '—'}
                    </td>
                    <td style={{ padding: '8px 14px', fontSize: '11px' }}>
                      <span style={{
                        padding: '1px 6px',
                        borderRadius: '3px',
                        fontWeight: 600,
                        textTransform: 'capitalize',
                        background: r.data_quality === 'valid' ? '#f0fdf4' : r.data_quality === 'suspect' ? '#fffbeb' : '#fef2f2',
                        color: r.data_quality === 'valid' ? '#16a34a' : r.data_quality === 'suspect' ? '#b45309' : '#b91c1c',
                        border: `1px solid ${r.data_quality === 'valid' ? '#bbf7d0' : r.data_quality === 'suspect' ? '#fde68a' : '#fecaca'}`,
                      }}>
                        {r.data_quality}
                      </span>
                    </td>
                    <td style={{ padding: '8px 14px', fontSize: '11px', color: '#9ca3af', fontFamily: 'monospace' }}>
                      {r.source_slno ? `#${r.source_slno}` : '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

    </div>
  )
}
