import { useEffect, useState, useRef } from 'react'
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
import PageHeader from '../components/common/PageHeader'
import {
  fetchGroundwaterTrend,
  fetchGroundwaterTrendAnalysis,
  fetchDistricts,
  fetchDistrictSummary,
  fetchDistrictTrend,
  fetchDistrictTrendAnalysis,
  fetchDistrictComparison,
  getCached,
  hasCached,
} from '../services/api'

// ─── Formatting Helpers ────────────────────────────────────────────────────────
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

// ─── Custom Tooltips ──────────────────────────────────────────────────────────
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

function CustomComparisonTooltip({ active, payload }) {
  if (active && payload && payload.length) {
    const item = payload[0].payload
    return (
      <div style={{
        background: '#ffffff',
        border: '1px solid #e5e7eb',
        borderRadius: '6px',
        padding: '10px 14px',
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.06)',
        fontSize: '12px',
        lineHeight: '1.5',
        minWidth: '180px',
      }}>
        <div style={{ fontWeight: 700, color: '#111827', marginBottom: '6px', fontSize: '13px' }}>
          {item.district}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#6b7280', marginBottom: '2px' }}>
          <span>Avg Level:</span>
          <strong style={{ color: '#2563eb' }}>
            {item.average_groundwater_level != null ? `${Number(item.average_groundwater_level).toFixed(2)} m` : '—'}
          </strong>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#6b7280', marginBottom: '2px' }}>
          <span>Stations:</span>
          <span style={{ color: '#374151', fontWeight: 600 }}>{fmt(item.station_count)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#6b7280', marginBottom: '2px' }}>
          <span>Valid Readings:</span>
          <span style={{ color: '#374151', fontWeight: 600 }}>{fmt(item.valid_readings)}</span>
        </div>
        {item.slope_m_per_year != null && (
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#6b7280', marginTop: '4px', paddingTop: '4px', borderTop: '1px solid #f3f4f6' }}>
            <span>Annual Trend:</span>
            <span style={{
              fontWeight: 700,
              color: item.direction === 'Decreasing' ? '#dc2626' : item.direction === 'Increasing' ? '#16a34a' : '#4b5563',
            }}>
              {item.slope_m_per_year > 0 ? '+' : ''}{Number(item.slope_m_per_year).toFixed(2)} m/yr
            </span>
          </div>
        )}
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

function CardHeader({ title, meta, action }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '10px 14px', borderBottom: '1px solid #f3f4f6',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontSize: '12px', fontWeight: 600, color: '#374151' }}>{title}</span>
        {meta && <span style={{ fontSize: '11px', color: '#9ca3af' }}>{meta}</span>}
      </div>
      {action && <div>{action}</div>}
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

function ErrorMsg({ text = 'Unable to load groundwater data.', onRetry }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '10px 14px',
      background: '#fef2f2', border: '1px solid #fecaca',
      borderRadius: '6px', fontSize: '12px', color: '#b91c1c',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9.303 3.376c-.866 1.5-3.07 1.5-3.898 0L5.697 5.876c-.866-1.5.217-3.376 1.948-3.376h12.71c1.73 0 2.813 1.876 1.948 3.376zM12 15.75h.007v.008H12v-.008z" />
        </svg>
        <span>{text}</span>
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          style={{
            background: '#ffffff',
            border: '1px solid #f87171',
            borderRadius: '4px',
            padding: '2px 8px',
            fontSize: '11px',
            fontWeight: 600,
            color: '#b91c1c',
            cursor: 'pointer',
          }}
        >
          Retry
        </button>
      )}
    </div>
  )
}

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
        <Skeleton h="26px" w="55%" style={{ marginBottom: '6px' }} />
      ) : error ? (
        <div style={{ fontSize: '20px', fontWeight: 700, color: '#dc2626', marginBottom: '4px' }}>—</div>
      ) : (
        <div style={{ fontSize: '24px', fontWeight: 800, color: '#111827', lineHeight: 1.1, letterSpacing: '-0.5px', marginBottom: '4px' }}>
          {value}
        </div>
      )}

      <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '2px' }}>{sub}</div>
    </Card>
  )
}

// ─── Trend Analysis Strip ─────────────────────────────────────────────────────
function TrendAnalysisStrip({ analysis, loading, error }) {
  return (
    <div style={{
      marginTop: '10px',
      paddingTop: '10px',
      borderTop: '1px solid #f3f4f6',
      display: 'grid',
      gridTemplateColumns: 'repeat(4, 1fr)',
      gap: '8px',
    }}>
      {/* Direction & Strength */}
      <div style={{ background: '#f9fafb', borderRadius: '6px', padding: '6px 10px', border: '1px solid #f3f4f6' }}>
        <div style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#6b7280' }}>
          Trend Direction
        </div>
        {loading ? (
          <Skeleton h="16px" w="65px" style={{ marginTop: '3px' }} />
        ) : error || !analysis ? (
          <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '2px' }}>—</div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '2px' }}>
            <span style={{
              fontSize: '12px',
              fontWeight: 700,
              color: analysis.direction === 'Decreasing' ? '#dc2626' : analysis.direction === 'Increasing' ? '#16a34a' : '#4b5563',
            }}>
              {analysis.direction}
            </span>
            <span style={{
              fontSize: '9px',
              fontWeight: 600,
              padding: '1px 4px',
              borderRadius: '3px',
              background: '#f1f5f9',
              color: '#64748b',
            }}>
              {analysis.strength}
            </span>
          </div>
        )}
      </div>

      {/* Annual Rate */}
      <div style={{ background: '#f9fafb', borderRadius: '6px', padding: '6px 10px', border: '1px solid #f3f4f6' }}>
        <div style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#6b7280' }}>
          Annual Slope
        </div>
        {loading ? (
          <Skeleton h="16px" w="60px" style={{ marginTop: '3px' }} />
        ) : error || !analysis ? (
          <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '2px' }}>—</div>
        ) : (
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#111827', marginTop: '2px' }}>
            {analysis.slope_m_per_year > 0 ? '+' : ''}{Number(analysis.slope_m_per_year).toFixed(2)} m/yr
          </div>
        )}
      </div>

      {/* Total Change */}
      <div style={{ background: '#f9fafb', borderRadius: '6px', padding: '6px 10px', border: '1px solid #f3f4f6' }}>
        <div style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#6b7280' }}>
          Total Change
        </div>
        {loading ? (
          <Skeleton h="16px" w="50px" style={{ marginTop: '3px' }} />
        ) : error || !analysis ? (
          <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '2px' }}>—</div>
        ) : (
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#111827', marginTop: '2px' }}>
            {analysis.total_change > 0 ? '+' : ''}{Number(analysis.total_change).toFixed(2)} m
          </div>
        )}
      </div>

      {/* Period */}
      <div style={{ background: '#f9fafb', borderRadius: '6px', padding: '6px 10px', border: '1px solid #f3f4f6' }}>
        <div style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#6b7280' }}>
          Period
        </div>
        {loading ? (
          <Skeleton h="16px" w="85px" style={{ marginTop: '3px' }} />
        ) : error || !analysis || !analysis.start_month ? (
          <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '2px' }}>—</div>
        ) : (
          <div style={{ fontSize: '11px', fontWeight: 600, color: '#374151', marginTop: '3px', whiteSpace: 'nowrap' }}>
            {formatPeriodMonth(analysis.start_month)} – {formatPeriodMonth(analysis.end_month)} ({analysis.number_of_months} mo)
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main Analytics Page Component ────────────────────────────────────────────
export default function Analytics() {
  // Statewide State
  const [statewideTrend, setStatewideTrend] = useState(() => getCached('/api/analytics/groundwater-trend')?.data ?? [])
  const [statewideTrendLoading, setStatewideTrendLoading] = useState(() => !hasCached('/api/analytics/groundwater-trend'))
  const [statewideTrendError, setStatewideTrendError] = useState(false)

  const [statewideAnalysis, setStatewideAnalysis] = useState(() => getCached('/api/analytics/groundwater-trend-analysis'))
  const [statewideAnalysisLoading, setStatewideAnalysisLoading] = useState(() => !hasCached('/api/analytics/groundwater-trend-analysis'))
  const [statewideAnalysisError, setStatewideAnalysisError] = useState(false)

  // District List & Comparison State
  const [districtsList, setDistrictsList] = useState(() => getCached('/api/analytics/districts') ?? [])
  const [districtsListLoading, setDistrictsListLoading] = useState(() => !hasCached('/api/analytics/districts'))
  const [districtsListError, setDistrictsListError] = useState(false)

  const [selectedDistrict, setSelectedDistrict] = useState('')

  const [comparisonData, setComparisonData] = useState(() => {
    const cached = getCached('/api/analytics/district-comparison')
    return Array.isArray(cached) ? cached : (cached?.data ?? [])
  })
  const [comparisonLoading, setComparisonLoading] = useState(() => !hasCached('/api/analytics/district-comparison'))
  const [comparisonError, setComparisonError] = useState(false)

  // Selected District Details State
  const [districtSummary, setDistrictSummary] = useState(null)
  const [districtSummaryLoading, setDistrictSummaryLoading] = useState(false)
  const [districtSummaryError, setDistrictSummaryError] = useState(false)

  const [districtTrend, setDistrictTrend] = useState([])
  const [districtTrendLoading, setDistrictTrendLoading] = useState(false)
  const [districtTrendError, setDistrictTrendError] = useState(false)

  const [districtAnalysis, setDistrictAnalysis] = useState(null)
  const [districtAnalysisLoading, setDistrictAnalysisLoading] = useState(false)
  const [districtAnalysisError, setDistrictAnalysisError] = useState(false)

  // Reload trigger keys
  const [reloadKey, setReloadKey] = useState(0)
  const [districtReloadKey, setDistrictReloadKey] = useState(0)

  // Client-side cache for district data
  const districtCache = useRef({})

  // ─── 1. Load Initial Statewide & District List Data ────────────────────────
  useEffect(() => {
    let isMounted = true

    async function loadInitial() {
      if (!hasCached('/api/analytics/groundwater-trend')) setStatewideTrendLoading(true)
      if (!hasCached('/api/analytics/groundwater-trend-analysis')) setStatewideAnalysisLoading(true)
      if (!hasCached('/api/analytics/districts')) setDistrictsListLoading(true)
      if (!hasCached('/api/analytics/district-comparison')) setComparisonLoading(true)

      setStatewideTrendError(false)
      setStatewideAnalysisError(false)
      setDistrictsListError(false)
      setComparisonError(false)

      try {
        const [swTrendRes, swAnalysisRes, distListRes, compRes] = await Promise.all([
          fetchGroundwaterTrend().catch(() => null),
          fetchGroundwaterTrendAnalysis().catch(() => null),
          fetchDistricts().catch(() => null),
          fetchDistrictComparison().catch(() => null),
        ])

        if (!isMounted) return

        // Statewide Trend
        if (swTrendRes?.data) {
          setStatewideTrend(swTrendRes.data)
        } else {
          setStatewideTrendError(true)
        }

        // Statewide Analysis
        if (swAnalysisRes) {
          setStatewideAnalysis(swAnalysisRes)
        } else {
          setStatewideAnalysisError(true)
        }

        // Districts List
        if (Array.isArray(distListRes) && distListRes.length > 0) {
          setDistrictsList(distListRes)
          // Default to first district if none selected
          setSelectedDistrict((prev) => prev || distListRes[0].district)
        } else {
          setDistrictsListError(true)
        }

        // Comparison Data
        if (compRes?.data) {
          setComparisonData(compRes.data)
        } else {
          setComparisonError(true)
        }
      } finally {
        if (isMounted) {
          setStatewideTrendLoading(false)
          setStatewideAnalysisLoading(false)
          setDistrictsListLoading(false)
          setComparisonLoading(false)
        }
      }
    }

    loadInitial()

    return () => {
      isMounted = false
    }
  }, [reloadKey])

  // ─── 2. Fetch Selected District Data ───────────────────────────────────────
  useEffect(() => {
    if (!selectedDistrict) return

    let isMounted = true

    // Check cache
    if (districtCache.current[selectedDistrict]) {
      const cached = districtCache.current[selectedDistrict]
      setDistrictSummary(cached.summary)
      setDistrictTrend(cached.trend)
      setDistrictAnalysis(cached.analysis)
      setDistrictSummaryError(false)
      setDistrictTrendError(false)
      setDistrictAnalysisError(false)
      return
    }

    async function loadDistrict() {
      setDistrictSummaryLoading(true)
      setDistrictTrendLoading(true)
      setDistrictAnalysisLoading(true)

      setDistrictSummaryError(false)
      setDistrictTrendError(false)
      setDistrictAnalysisError(false)

      try {
        const [summaryRes, trendRes, analysisRes] = await Promise.all([
          fetchDistrictSummary(selectedDistrict).catch(() => null),
          fetchDistrictTrend(selectedDistrict).catch(() => null),
          fetchDistrictTrendAnalysis(selectedDistrict).catch(() => null),
        ])

        if (!isMounted) return

        if (summaryRes) {
          setDistrictSummary(summaryRes)
        } else {
          setDistrictSummaryError(true)
        }

        if (trendRes?.data) {
          setDistrictTrend(trendRes.data)
        } else {
          setDistrictTrendError(true)
        }

        if (analysisRes) {
          setDistrictAnalysis(analysisRes)
        } else {
          setDistrictAnalysisError(true)
        }

        // Save in cache
        if (summaryRes || trendRes || analysisRes) {
          districtCache.current[selectedDistrict] = {
            summary: summaryRes,
            trend: trendRes?.data || [],
            analysis: analysisRes,
          }
        }
      } finally {
        if (isMounted) {
          setDistrictSummaryLoading(false)
          setDistrictTrendLoading(false)
          setDistrictAnalysisLoading(false)
        }
      }
    }

    loadDistrict()

    return () => {
      isMounted = false
    }
  }, [selectedDistrict, districtReloadKey])

  // Data Quality Metrics for Selected District
  const totalReadings = districtSummary?.total_readings ?? 0
  const validReadings = districtSummary?.valid_readings ?? 0
  const suspectReadings = districtSummary?.suspect_readings ?? 0
  const invalidReadings = districtSummary?.invalid_readings ?? 0

  const dqBars = [
    { label: 'Valid', color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0', count: validReadings },
    { label: 'Suspect', color: '#b45309', bg: '#fffbeb', border: '#fde68a', count: suspectReadings },
    { label: 'Invalid', color: '#b91c1c', bg: '#fef2f2', border: '#fecaca', count: invalidReadings },
  ]

  // District Overview KPI Cards
  const districtKpis = [
    {
      label: 'Total Stations',
      value: districtSummary ? fmt(districtSummary.station_count) : '—',
      sub: selectedDistrict ? `${selectedDistrict} monitoring boreholes` : 'Monitoring stations',
      accent: '#2563eb',
      iconPath: 'M15 10.5a3 3 0 11-6 0 3 3 0 016 0zM19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z',
    },
    {
      label: 'Total Readings',
      value: districtSummary ? fmt(districtSummary.total_readings) : '—',
      sub: districtSummary?.latest_reading_timestamp ? `Latest: ${fmtDate(districtSummary.latest_reading_timestamp)}` : 'Recorded observations',
      accent: '#0891b2',
      iconPath: 'M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 011.875 1.875v13.5A1.875 1.875 0 0118.375 21.75H5.625A1.875 1.875 0 013.75 19.875V6.375A1.875 1.875 0 015.625 4.5z',
    },
    {
      label: 'Average Level',
      value: districtSummary?.average_groundwater_level != null ? `${Number(districtSummary.average_groundwater_level).toFixed(2)} m` : '—',
      sub: 'Mean valid water level',
      accent: '#6366f1',
      iconPath: 'M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941',
    },
    {
      label: 'Min / Max Range',
      value: districtSummary?.min_groundwater_level != null && districtSummary?.max_groundwater_level != null
        ? `${Number(districtSummary.min_groundwater_level).toFixed(1)} / ${Number(districtSummary.max_groundwater_level).toFixed(1)} m`
        : '—',
      sub: 'Recorded range (Min / Max)',
      accent: '#8b5cf6',
      iconPath: 'M3 7.5L7.5 3m0 0L12 7.5M7.5 3v13.5m13.5 0L16.5 21m0 0L12 16.5m4.5 4.5V7.5',
    },
    {
      label: 'Valid Quality',
      value: districtSummary ? fmtPercent(validReadings, totalReadings) : '—',
      sub: `${fmt(validReadings)} verified observations`,
      accent: '#16a34a',
      iconPath: 'M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      <PageHeader
        title="Groundwater Analytics"
        description="Comprehensive statewide and district-level groundwater trend analysis, statistical linear regressions, and comparative evaluations."
      />

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* SECTION 1: STATEWIDE ANALYSIS                                          */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #e5e7eb', paddingBottom: '6px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '14px', fontWeight: 700, color: '#111827' }}>
              Statewide Analysis
            </span>
            <span style={{ fontSize: '11px', color: '#6b7280', background: '#f3f4f6', padding: '1px 6px', borderRadius: '4px' }}>
              Haryana Telemetry Network
            </span>
          </div>
          <span style={{ fontSize: '11px', color: '#9ca3af' }}>
            Aggregated across all valid monitoring stations
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: '10px' }}>
          {/* Statewide Trend Chart */}
          <Card>
            <CardHeader
              title="Statewide Groundwater Trend"
              meta={statewideTrendLoading ? 'Loading…' : statewideTrendError ? 'Error' : `${statewideTrend.length} Months · Monthly Average`}
            />
            <div style={{ padding: '12px 14px' }}>
              {statewideTrendLoading ? (
                <div style={{ height: '172px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px', background: '#f9fafb', borderRadius: '5px' }}>
                  <Skeleton h="14px" w="140px" />
                  <Skeleton h="10px" w="90px" />
                </div>
              ) : statewideTrendError ? (
                <div style={{ height: '172px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <ErrorMsg text="Unable to load statewide groundwater trend data." onRetry={() => setReloadKey((k) => k + 1)} />
                </div>
              ) : !statewideTrend || statewideTrend.length === 0 ? (
                <div style={{ height: '172px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: '12px', background: '#fafafa', border: '1px dashed #e5e7eb', borderRadius: '5px' }}>
                  No statewide groundwater trend data available
                </div>
              ) : (
                <div style={{ height: '172px', width: '100%' }}>
                  <ResponsiveContainer width="100%" height={172}>
                    <LineChart
                      data={statewideTrend}
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

              {/* Trend Analysis Strip */}
              <TrendAnalysisStrip
                analysis={statewideAnalysis}
                loading={statewideAnalysisLoading}
                error={statewideAnalysisError}
              />
            </div>
          </Card>

          {/* Statewide Summary & Note */}
          <Card>
            <CardHeader title="Statewide Summary" meta="Telemetry Network" />
            <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '100%', boxSizing: 'border-box' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: '#f9fafb', borderRadius: '5px', border: '1px solid #f3f4f6' }}>
                  <span style={{ fontSize: '11px', color: '#6b7280', fontWeight: 600 }}>Active Districts</span>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: '#111827' }}>
                    {districtsListLoading ? <Skeleton h="16px" w="30px" /> : fmt(districtsList.length)}
                  </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: '#f9fafb', borderRadius: '5px', border: '1px solid #f3f4f6' }}>
                  <span style={{ fontSize: '11px', color: '#6b7280', fontWeight: 600 }}>Statistical Analysis Baseline</span>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#374151' }}>
                    {statewideAnalysis?.number_of_months ? `${statewideAnalysis.number_of_months} Months Observed` : '—'}
                  </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: '#f9fafb', borderRadius: '5px', border: '1px solid #f3f4f6' }}>
                  <span style={{ fontSize: '11px', color: '#6b7280', fontWeight: 600 }}>Linear Regression Methodology</span>
                  <span style={{ fontSize: '11px', fontWeight: 600, color: '#2563eb' }}>
                    Ordinary Least Squares (OLS)
                  </span>
                </div>
              </div>

              <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid #f3f4f6', fontSize: '11px', color: '#9ca3af', lineHeight: 1.4 }}>
                Statistical trend evaluations compute ordinary least squares slopes across monthly validated DWLR observations. Trend classifications represent mathematical slope directions.
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* SECTION 2: DISTRICT ANALYSIS                                           */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '6px' }}>
        
        {/* District Selector & Controls Bar */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          padding: '12px 16px',
          background: '#ffffff',
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: '#2563eb',
                display: 'inline-block',
              }} />
              <h2 style={{ fontSize: '15px', fontWeight: 700, color: '#111827', margin: 0 }}>
                District Analysis
              </h2>
            </div>

            <div style={{ height: '16px', width: '1px', background: '#e5e7eb' }} />

            {/* Selector Control */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <label htmlFor="district-select" style={{ fontSize: '12px', fontWeight: 600, color: '#4b5563', whiteSpace: 'nowrap' }}>
                Select District:
              </label>
              {districtsListLoading ? (
                <Skeleton h="32px" w="180px" />
              ) : (
                <select
                  id="district-select"
                  value={selectedDistrict}
                  onChange={(e) => setSelectedDistrict(e.target.value)}
                  style={{
                    height: '32px',
                    padding: '0 12px',
                    background: '#ffffff',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: '#111827',
                    cursor: 'pointer',
                    outline: 'none',
                    minWidth: '180px',
                  }}
                >
                  {districtsList.map((d) => (
                    <option key={d.district} value={d.district}>
                      {d.district} ({d.station_count} stations)
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* District Status Badge */}
          {districtSummary && !districtSummaryLoading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '11px', color: '#6b7280' }}>
              {districtSummary.earliest_reading_timestamp && districtSummary.latest_reading_timestamp && (
                <span>
                  Observation Span: <strong style={{ color: '#374151' }}>{fmtDate(districtSummary.earliest_reading_timestamp)} – {fmtDate(districtSummary.latest_reading_timestamp)}</strong>
                </span>
              )}
              <span style={{
                padding: '2px 8px',
                borderRadius: '4px',
                background: '#eff6ff',
                color: '#1d4ed8',
                fontWeight: 600,
                border: '1px solid #bfdbfe',
              }}>
                {districtSummary.station_count} Stations Active
              </span>
            </div>
          )}
        </div>

        {districtsListError && (
          <ErrorMsg
            text="Unable to load districts list. Please check backend connection."
          />
        )}

        {districtSummaryError && (
          <ErrorMsg
            text={`Unable to load analysis for district '${selectedDistrict}'.`}
            onRetry={() => {
              if (districtCache.current[selectedDistrict]) {
                delete districtCache.current[selectedDistrict]
              }
              setDistrictReloadKey((k) => k + 1)
            }}
          />
        )}

        {/* ── District Overview Cards ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '10px' }}>
          {districtKpis.map((card) => (
            <KpiCard
              key={card.label}
              {...card}
              loading={districtSummaryLoading || districtsListLoading}
              error={districtSummaryError}
            />
          ))}
        </div>

        {/* ── District Trend & Data Quality Row ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: '10px' }}>
          
          {/* District Groundwater Trend Chart */}
          <Card>
            <CardHeader
              title={`${selectedDistrict || 'District'} Monthly Groundwater Trend`}
              meta={districtTrendLoading ? 'Loading…' : districtTrendError ? 'Error' : districtTrend && districtTrend.length ? `${districtTrend.length} Months · Monthly Average` : 'Time-series'}
            />
            <div style={{ padding: '12px 14px' }}>
              {districtTrendLoading ? (
                <div style={{ height: '180px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px', background: '#f9fafb', borderRadius: '5px' }}>
                  <Skeleton h="14px" w="140px" />
                  <Skeleton h="10px" w="90px" />
                </div>
              ) : districtTrendError ? (
                <div style={{ height: '180px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <ErrorMsg
                    text={`Unable to load groundwater trend for ${selectedDistrict}.`}
                    onRetry={() => {
                      if (districtCache.current[selectedDistrict]) {
                        delete districtCache.current[selectedDistrict]
                      }
                      setDistrictReloadKey((k) => k + 1)
                    }}
                  />
                </div>
              ) : !districtTrend || districtTrend.length === 0 ? (
                <div style={{ height: '180px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: '12px', background: '#fafafa', border: '1px dashed #e5e7eb', borderRadius: '5px', gap: '4px' }}>
                  <span style={{ fontWeight: 500, color: '#6b7280' }}>No valid groundwater readings available for {selectedDistrict}.</span>
                  <span style={{ fontSize: '11px' }}>Check back once telemetry observations are ingested.</span>
                </div>
              ) : (
                <div style={{ height: '180px', width: '100%' }}>
                  <ResponsiveContainer width="100%" height={180}>
                    <LineChart
                      data={districtTrend}
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
                      <Tooltip content={<CustomTrendTooltip />} />
                      <Line
                        type="monotone"
                        dataKey="average_groundwater_level"
                        stroke="#0284c7"
                        strokeWidth={2}
                        dot={{ r: 2.5, fill: '#0284c7', stroke: '#ffffff', strokeWidth: 1 }}
                        activeDot={{ r: 5, fill: '#0369a1', stroke: '#ffffff', strokeWidth: 2 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* District Statistical Trend Analysis Strip */}
              <TrendAnalysisStrip
                analysis={districtAnalysis}
                loading={districtAnalysisLoading}
                error={districtAnalysisError}
              />
              <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '6px', textAlign: 'right' }}>
                * Trend classification is based on the statistical analysis returned by the backend.
              </div>
            </div>
          </Card>

          {/* District Data Quality Breakdown */}
          <Card>
            <CardHeader
              title={`${selectedDistrict || 'District'} Data Quality`}
              meta={districtSummaryLoading ? 'Loading…' : `${fmt(totalReadings)} observations`}
            />
            <div style={{
              padding: '14px 16px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              height: '100%',
              boxSizing: 'border-box',
            }}>
              <div>
                {dqBars.map((b) => {
                  const count = b.count ?? null
                  const pct = totalReadings > 0 && count != null ? (count / totalReadings) * 100 : 0
                  const pctLabel = fmtPercent(count, totalReadings)
                  return (
                    <div key={b.label} style={{ marginBottom: '12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                        <span style={{ fontSize: '12px', color: '#374151', fontWeight: 500 }}>{b.label}</span>
                        {districtSummaryLoading ? (
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
                          width: districtSummaryLoading ? '0%' : `${pct.toFixed(1)}%`,
                          background: b.color,
                          borderRadius: '4px',
                          transition: 'width 0.6s ease',
                        }} />
                      </div>
                      {!districtSummaryLoading && count != null && totalReadings > 0 && (
                        <div style={{ fontSize: '10px', color: '#6b7280', marginTop: '3px', textAlign: 'right', fontWeight: 500 }}>
                          {pctLabel}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {districtSummary && !districtSummaryLoading && (
                <div style={{
                  marginTop: '10px',
                  paddingTop: '10px',
                  borderTop: '1px solid #f3f4f6',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                  fontSize: '11px',
                  color: '#6b7280',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>First Observation:</span>
                    <strong style={{ color: '#374151', fontWeight: 600 }}>{fmtDate(districtSummary.earliest_reading_timestamp)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Latest Observation:</span>
                    <strong style={{ color: '#374151', fontWeight: 600 }}>{fmtDate(districtSummary.latest_reading_timestamp)}</strong>
                  </div>
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* ═════════════════════════════════════════════════════════════════════ */}
        {/* SECTION 3: DISTRICT COMPARISON                                        */}
        {/* ═════════════════════════════════════════════════════════════════════ */}
        <Card style={{ marginTop: '8px' }}>
          <CardHeader
            title="Statewide District Comparison"
            meta={comparisonLoading ? 'Loading…' : `${comparisonData.length} Districts Analyzed`}
          />
          <div style={{ padding: '16px' }}>
            {comparisonLoading ? (
              <div style={{ height: '240px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                <Skeleton h="16px" w="180px" />
                <Skeleton h="12px" w="120px" />
              </div>
            ) : comparisonError ? (
              <ErrorMsg text="Unable to load district comparison metrics." onRetry={() => setReloadKey((k) => k + 1)} />
            ) : comparisonData.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', color: '#9ca3af', fontSize: '12px' }}>
                No district comparison data available.
              </div>
            ) : (
              <>
                {/* Horizontal / Vertical Bar Chart for District Average Levels */}
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: '#4b5563', marginBottom: '8px' }}>
                    Average Groundwater Level by District (meters)
                  </div>
                  <div style={{ height: '220px', width: '100%' }}>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart
                        data={comparisonData}
                        margin={{ top: 10, right: 10, left: -14, bottom: 26 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                        <XAxis
                          dataKey="district"
                          tick={{ fontSize: 10, fill: '#64748b' }}
                          interval={0}
                          angle={-25}
                          textAnchor="end"
                          axisLine={{ stroke: '#e2e8f0' }}
                          tickLine={false}
                        />
                        <YAxis
                          tick={{ fontSize: 10, fill: '#64748b' }}
                          tickLine={false}
                          axisLine={false}
                          tickFormatter={(v) => `${Number(v).toFixed(0)}m`}
                          domain={['auto', 'auto']}
                        />
                        <Tooltip content={<CustomComparisonTooltip />} />
                        <Bar
                          dataKey="average_groundwater_level"
                          fill="#3b82f6"
                          radius={[4, 4, 0, 0]}
                        >
                          {comparisonData.map((entry) => (
                            <Cell
                              key={`cell-${entry.district}`}
                              fill={entry.district.toUpperCase() === selectedDistrict.toUpperCase() ? '#2563eb' : '#93c5fd'}
                              style={{ cursor: 'pointer' }}
                              onClick={() => setSelectedDistrict(entry.district)}
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Detailed Comparison Table */}
                <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: '6px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                        {['District', 'Stations', 'Total Readings', 'Valid Readings', 'Avg Level', 'Annual Slope', 'Trend Direction', 'Obs. Period'].map((h) => (
                          <th
                            key={h}
                            style={{
                              padding: '8px 12px',
                              fontSize: '10px',
                              fontWeight: 700,
                              textTransform: 'uppercase',
                              letterSpacing: '0.06em',
                              color: '#6b7280',
                              textAlign: ['Stations', 'Total Readings', 'Valid Readings', 'Avg Level', 'Annual Slope'].includes(h) ? 'right' : 'left',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {comparisonData.map((item, idx) => {
                        const isSelected = item.district.toUpperCase() === selectedDistrict.toUpperCase()
                        return (
                          <tr
                            key={item.district}
                            onClick={() => setSelectedDistrict(item.district)}
                            style={{
                              background: isSelected ? '#eff6ff' : idx % 2 === 0 ? '#ffffff' : '#fafafa',
                              cursor: 'pointer',
                              borderBottom: '1px solid #f3f4f6',
                              transition: 'background 0.15s ease',
                            }}
                          >
                            <td style={{ padding: '8px 12px', fontSize: '12px', fontWeight: isSelected ? 700 : 500, color: isSelected ? '#1d4ed8' : '#111827' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                {isSelected && (
                                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#2563eb' }} />
                                )}
                                {item.district}
                              </div>
                            </td>
                            <td style={{ padding: '8px 12px', fontSize: '12px', color: '#374151', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                              {fmt(item.station_count)}
                            </td>
                            <td style={{ padding: '8px 12px', fontSize: '12px', color: '#374151', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                              {fmt(item.total_readings)}
                            </td>
                            <td style={{ padding: '8px 12px', fontSize: '12px', color: '#374151', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                              {fmt(item.valid_readings)}
                            </td>
                            <td style={{ padding: '8px 12px', fontSize: '12px', fontWeight: 600, color: '#111827', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                              {item.average_groundwater_level != null ? `${Number(item.average_groundwater_level).toFixed(2)} m` : '—'}
                            </td>
                            <td style={{ padding: '8px 12px', fontSize: '12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: item.slope_m_per_year > 0 ? '#16a34a' : item.slope_m_per_year < 0 ? '#dc2626' : '#6b7280' }}>
                              {item.slope_m_per_year != null ? `${item.slope_m_per_year > 0 ? '+' : ''}${Number(item.slope_m_per_year).toFixed(2)} m/yr` : '—'}
                            </td>
                            <td style={{ padding: '8px 12px', fontSize: '11px', whiteSpace: 'nowrap' }}>
                              {item.direction ? (
                                <span style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  padding: '1px 6px',
                                  borderRadius: '3px',
                                  background: item.direction === 'Increasing' ? '#f0fdf4' : item.direction === 'Decreasing' ? '#fef2f2' : '#f9fafb',
                                  color: item.direction === 'Increasing' ? '#16a34a' : item.direction === 'Decreasing' ? '#dc2626' : '#6b7280',
                                  fontWeight: 600,
                                  border: `1px solid ${item.direction === 'Increasing' ? '#bbf7d0' : item.direction === 'Decreasing' ? '#fecaca' : '#e5e7eb'}`,
                                }}>
                                  {item.direction} ({item.strength})
                                </span>
                              ) : '—'}
                            </td>
                            <td style={{ padding: '8px 12px', fontSize: '11px', color: '#6b7280', whiteSpace: 'nowrap' }}>
                              {item.start_month && item.end_month ? `${formatPeriodMonth(item.start_month)} – ${formatPeriodMonth(item.end_month)}` : '—'}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </Card>

      </div>
    </div>
  )
}
