import { useEffect, useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import PageHeader from '../components/common/PageHeader'
import {
  fetchReadings,
  fetchOverallSummary,
  fetchDistricts,
  fetchStations,
  getCached,
  hasCached,
} from '../services/api'

// ─── Formatting Helpers ────────────────────────────────────────────────────────
function fmt(n) {
  if (n == null) return '—'
  return Number(n).toLocaleString('en-IN')
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

function ErrorMsg({ text = 'Unable to load telemetry records.', onRetry }) {
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

// ─── Main Records Component ───────────────────────────────────────────────────
export default function Records() {
  // Overall Summary Metrics State
  const [overallSummary, setOverallSummary] = useState(() => getCached('/api/summary'))
  const [overallLoading, setOverallLoading] = useState(() => !hasCached('/api/summary'))

  // Filter Options State
  const [districtsList, setDistrictsList] = useState(() => getCached('/api/analytics/districts') ?? [])
  const [stationsList, setStationsList] = useState(() => getCached('/api/stations', { limit: 2000 }) ?? [])

  // Form Filter State (Unapplied Inputs)
  const [selectedStationId, setSelectedStationId] = useState('')
  const [selectedDistrict, setSelectedDistrict] = useState('ALL')
  const [selectedQuality, setSelectedQuality] = useState('ALL')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [sortBy, setSortBy] = useState('timestamp')
  const [sortOrder, setSortOrder] = useState('desc')
  const [pageSize, setPageSize] = useState(25)

  // Active Applied Filters State
  const [appliedFilters, setAppliedFilters] = useState({
    station_id: '',
    district: 'ALL',
    data_quality: 'ALL',
    start_time: '',
    end_time: '',
    sort_by: 'timestamp',
    order: 'desc',
    limit: 25,
  })

  // Table & Pagination State
  const [readings, setReadings] = useState([])
  const [currentPage, setCurrentPage] = useState(1)
  const [readingsLoading, setReadingsLoading] = useState(true)
  const [readingsError, setReadingsError] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  // ─── 1. Load Initial Options & Summary ──────────────────────────────────────
  useEffect(() => {
    let isMounted = true

    async function loadMeta() {
      if (!hasCached('/api/summary')) {
        setOverallLoading(true)
      }
      try {
        const [sumRes, distRes, stRes] = await Promise.all([
          fetchOverallSummary().catch(() => null),
          fetchDistricts().catch(() => null),
          fetchStations({ limit: 2000 }).catch(() => null),
        ])

        if (!isMounted) return

        if (sumRes) setOverallSummary(sumRes)
        if (Array.isArray(distRes)) setDistrictsList(distRes)
        if (Array.isArray(stRes)) setStationsList(stRes)
      } finally {
        if (isMounted) setOverallLoading(false)
      }
    }

    loadMeta()

    return () => {
      isMounted = false
    }
  }, [])

  // ─── 2. Fetch Server-Side Paginated Readings ────────────────────────────────
  useEffect(() => {
    let isMounted = true

    async function loadPage() {
      setReadingsLoading(true)
      setReadingsError(false)

      const skip = (currentPage - 1) * appliedFilters.limit
      const params = {
        skip,
        limit: appliedFilters.limit,
        sort_by: appliedFilters.sort_by,
        order: appliedFilters.order,
      }

      if (appliedFilters.station_id) params.station_id = Number(appliedFilters.station_id)
      if (appliedFilters.district && appliedFilters.district !== 'ALL') params.district = appliedFilters.district
      if (appliedFilters.data_quality && appliedFilters.data_quality !== 'ALL') params.data_quality = appliedFilters.data_quality
      if (appliedFilters.start_time) params.start_time = `${appliedFilters.start_time}T00:00:00`
      if (appliedFilters.end_time) params.end_time = `${appliedFilters.end_time}T23:59:59`

      try {
        const data = await fetchReadings(params)
        if (!isMounted) return
        setReadings(Array.isArray(data) ? data : [])
      } catch {
        if (!isMounted) return
        setReadingsError(true)
        setReadings([])
      } finally {
        if (isMounted) setReadingsLoading(false)
      }
    }

    loadPage()

    return () => {
      isMounted = false
    }
  }, [currentPage, appliedFilters, reloadKey])

  // ─── Filter Form Actions ───────────────────────────────────────────────────
  const handleApplyFilters = (e) => {
    if (e) e.preventDefault()
    setCurrentPage(1)
    setAppliedFilters({
      station_id: selectedStationId,
      district: selectedDistrict,
      data_quality: selectedQuality,
      start_time: startDate,
      end_time: endDate,
      sort_by: sortBy,
      order: sortOrder,
      limit: pageSize,
    })
  }

  const handleResetFilters = () => {
    setSelectedStationId('')
    setSelectedDistrict('ALL')
    setSelectedQuality('ALL')
    setStartDate('')
    setEndDate('')
    setSortBy('timestamp')
    setSortOrder('desc')
    setPageSize(25)
    setCurrentPage(1)
    setAppliedFilters({
      station_id: '',
      district: 'ALL',
      data_quality: 'ALL',
      start_time: '',
      end_time: '',
      sort_by: 'timestamp',
      order: 'desc',
      limit: 25,
    })
  }

  const hasActiveFilters = Boolean(
    appliedFilters.station_id ||
    appliedFilters.district !== 'ALL' ||
    appliedFilters.data_quality !== 'ALL' ||
    appliedFilters.start_time ||
    appliedFilters.end_time ||
    appliedFilters.sort_by !== 'timestamp' ||
    appliedFilters.order !== 'desc'
  )

  // ─── Filter Stations for Dropdown based on Selected District ────────────────
  const selectableStations = useMemo(() => {
    if (selectedDistrict === 'ALL') return stationsList
    return stationsList.filter(
      (s) => s.district && s.district.toUpperCase() === selectedDistrict.toUpperCase()
    )
  }, [stationsList, selectedDistrict])

  // ─── Top KPI Metric Cards ───────────────────────────────────────────────────
  const totalReadingsCount = overallSummary?.total_readings ?? 0
  const validReadingsCount = overallSummary?.valid_readings ?? 0
  const suspectReadingsCount = overallSummary?.suspect_readings ?? 0
  const invalidReadingsCount = overallSummary?.invalid_readings ?? 0

  const kpis = [
    {
      label: 'Total Telemetry Records',
      value: overallLoading ? '—' : fmt(totalReadingsCount),
      sub: '1.86M+ PostgreSQL observations',
      accent: '#2563eb',
      iconPath: 'M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 011.875 1.875v13.5A1.875 1.875 0 0118.375 21.75H5.625A1.875 1.875 0 013.75 19.875V6.375A1.875 1.875 0 015.625 4.5z',
    },
    {
      label: 'Valid Readings',
      value: overallLoading ? '—' : fmt(validReadingsCount),
      sub: totalReadingsCount > 0 ? `${fmtPercent(validReadingsCount, totalReadingsCount)} quality verified` : 'Verified records',
      accent: '#16a34a',
      iconPath: 'M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    },
    {
      label: 'Suspect Readings',
      value: overallLoading ? '—' : fmt(suspectReadingsCount),
      sub: totalReadingsCount > 0 ? `${fmtPercent(suspectReadingsCount, totalReadingsCount)} flagged for review` : 'Review flagged',
      accent: '#d97706',
      iconPath: 'M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z',
    },
    {
      label: 'Invalid Readings',
      value: overallLoading ? '—' : fmt(invalidReadingsCount),
      sub: totalReadingsCount > 0 ? `${fmtPercent(invalidReadingsCount, totalReadingsCount)} excluded records` : 'Excluded records',
      accent: '#dc2626',
      iconPath: 'M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636',
    },
  ]

  const hasNextPage = readings.length === appliedFilters.limit
  const displayStart = (currentPage - 1) * appliedFilters.limit + (readings.length > 0 ? 1 : 0)
  const displayEnd = (currentPage - 1) * appliedFilters.limit + readings.length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <PageHeader
        title="Reading Records"
        description="Search, filter, and inspect granular DWLR telemetry observation records across Haryana."
        actions={
          <div style={{
            padding: '5px 12px',
            background: '#ffffff',
            border: '1px solid #e5e7eb',
            borderRadius: '6px',
            fontSize: '11px',
            color: '#374151',
            fontFamily: 'monospace',
            fontWeight: 600,
          }}>
            {overallLoading ? 'Loading…' : `${fmt(totalReadingsCount)} Total Telemetry Records`}
          </div>
        }
      />


      {/* ── Top Metric Cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
        {kpis.map((card) => (
          <KpiCard
            key={card.label}
            {...card}
            loading={overallLoading}
          />
        ))}
      </div>

      {readingsError && (
        <ErrorMsg
          text="Unable to fetch telemetry observations from the PostgreSQL database."
          onRetry={() => setReloadKey((k) => k + 1)}
        />
      )}

      {/* ── Filter & Search Control Panel ── */}
      <Card style={{ padding: '14px 16px' }}>
        <form onSubmit={handleApplyFilters} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #f3f4f6', paddingBottom: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="#2563eb" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 00-.659-1.591L3.659 7.409A2.25 2.25 0 013 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0112 3z" />
              </svg>
              <span style={{ fontSize: '13px', fontWeight: 700, color: '#111827' }}>
                Filter Telemetry Records
              </span>
            </div>

            <span style={{ fontSize: '11px', color: '#9ca3af' }}>
              Server-side filtered in PostgreSQL
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
            {/* District Filter */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label htmlFor="filter-district" style={{ fontSize: '11px', fontWeight: 600, color: '#4b5563' }}>
                District
              </label>
              <select
                id="filter-district"
                value={selectedDistrict}
                onChange={(e) => {
                  setSelectedDistrict(e.target.value)
                  setSelectedStationId('')
                }}
                style={{
                  height: '32px',
                  padding: '0 8px',
                  background: '#ffffff',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '12px',
                  color: '#111827',
                  outline: 'none',
                }}
              >
                <option value="ALL">All Districts ({districtsList.length})</option>
                {districtsList.map((d) => (
                  <option key={d.district} value={d.district}>
                    {d.district} ({d.station_count} stations)
                  </option>
                ))}
              </select>
            </div>

            {/* Station Selector */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label htmlFor="filter-station" style={{ fontSize: '11px', fontWeight: 600, color: '#4b5563' }}>
                Station
              </label>
              <select
                id="filter-station"
                value={selectedStationId}
                onChange={(e) => setSelectedStationId(e.target.value)}
                style={{
                  height: '32px',
                  padding: '0 8px',
                  background: '#ffffff',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '12px',
                  color: '#111827',
                  outline: 'none',
                }}
              >
                <option value="">All Stations ({selectableStations.length})</option>
                {selectableStations.map((st) => (
                  <option key={st.id} value={st.id}>
                    #{st.id} - {st.station_name}
                  </option>
                ))}
              </select>
            </div>

            {/* Data Quality */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label htmlFor="filter-quality" style={{ fontSize: '11px', fontWeight: 600, color: '#4b5563' }}>
                Data Quality
              </label>
              <select
                id="filter-quality"
                value={selectedQuality}
                onChange={(e) => setSelectedQuality(e.target.value)}
                style={{
                  height: '32px',
                  padding: '0 8px',
                  background: '#ffffff',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '12px',
                  color: '#111827',
                  outline: 'none',
                }}
              >
                <option value="ALL">All Classifications</option>
                <option value="valid">Valid Observations</option>
                <option value="suspect">Suspect Observations</option>
                <option value="invalid">Invalid Observations</option>
              </select>
            </div>

            {/* Sort & Order */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label htmlFor="filter-sort" style={{ fontSize: '11px', fontWeight: 600, color: '#4b5563' }}>
                Sort By
              </label>
              <div style={{ display: 'flex', gap: '4px' }}>
                <select
                  id="filter-sort"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  style={{
                    flex: 1,
                    height: '32px',
                    padding: '0 8px',
                    background: '#ffffff',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '12px',
                    color: '#111827',
                    outline: 'none',
                  }}
                >
                  <option value="timestamp">Timestamp</option>
                  <option value="groundwater_level">GW Level</option>
                  <option value="id">Reading ID</option>
                </select>

                <select
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value)}
                  aria-label="Sort direction"
                  style={{
                    width: '74px',
                    height: '32px',
                    padding: '0 6px',
                    background: '#ffffff',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '12px',
                    color: '#111827',
                    outline: 'none',
                  }}
                >
                  <option value="desc">Desc</option>
                  <option value="asc">Asc</option>
                </select>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
            {/* Date Range Inputs */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <label htmlFor="filter-startdate" style={{ fontSize: '11px', fontWeight: 600, color: '#4b5563' }}>
                  From:
                </label>
                <input
                  id="filter-startdate"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  style={{
                    height: '30px',
                    padding: '0 8px',
                    background: '#ffffff',
                    border: '1px solid #d1d5db',
                    borderRadius: '5px',
                    fontSize: '11px',
                    color: '#111827',
                  }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <label htmlFor="filter-enddate" style={{ fontSize: '11px', fontWeight: 600, color: '#4b5563' }}>
                  To:
                </label>
                <input
                  id="filter-enddate"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  style={{
                    height: '30px',
                    padding: '0 8px',
                    background: '#ffffff',
                    border: '1px solid #d1d5db',
                    borderRadius: '5px',
                    fontSize: '11px',
                    color: '#111827',
                  }}
                />
              </div>

              {/* Page Size Selector */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginLeft: '6px' }}>
                <label htmlFor="filter-pagesize" style={{ fontSize: '11px', fontWeight: 600, color: '#4b5563' }}>
                  Page Size:
                </label>
                <select
                  id="filter-pagesize"
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                  style={{
                    height: '30px',
                    padding: '0 6px',
                    background: '#ffffff',
                    border: '1px solid #d1d5db',
                    borderRadius: '5px',
                    fontSize: '11px',
                    color: '#111827',
                  }}
                >
                  <option value={25}>25 / page</option>
                  <option value={50}>50 / page</option>
                  <option value={100}>100 / page</option>
                </select>
              </div>
            </div>

            {/* Submit & Reset Buttons */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={handleResetFilters}
                  style={{
                    height: '32px',
                    padding: '0 12px',
                    background: '#f3f4f6',
                    border: '1px solid #e5e7eb',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontWeight: 600,
                    color: '#4b5563',
                    cursor: 'pointer',
                  }}
                >
                  Clear Filters
                </button>
              )}

              <button
                type="submit"
                style={{
                  height: '32px',
                  padding: '0 16px',
                  background: '#2563eb',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontWeight: 600,
                  color: '#ffffff',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: '0 1px 2px rgba(37,99,235,0.2)',
                }}
              >
                Apply Filters
              </button>
            </div>
          </div>
        </form>
      </Card>

      {/* ── Telemetry Observations Table ── */}
      <Card style={{ overflow: 'hidden' }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 16px',
          borderBottom: '1px solid #f3f4f6',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '13px', fontWeight: 700, color: '#111827' }}>
              Telemetry Observations Log
            </span>
            <span style={{
              fontSize: '11px',
              color: '#2563eb',
              background: '#eff6ff',
              padding: '2px 8px',
              borderRadius: '10px',
              fontWeight: 600,
              fontVariantNumeric: 'tabular-nums',
            }}>
              Page {currentPage}
            </span>
          </div>

          <div style={{ fontSize: '11px', color: '#9ca3af' }}>
            Showing {readingsLoading ? '…' : `${displayStart}–${displayEnd}`} observations
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                {['Timestamp', 'Station', 'District', 'GW Level (m)', 'Data Quality', 'Source Record', 'Action'].map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: '8px 14px',
                      fontSize: '10px',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      color: '#6b7280',
                      textAlign: h === 'GW Level (m)' || h === 'Action' ? 'right' : 'left',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {readingsLoading ? (
                [1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '12px 14px' }}><Skeleton h="16px" w="120px" /></td>
                    <td style={{ padding: '12px 14px' }}><Skeleton h="16px" w="180px" /></td>
                    <td style={{ padding: '12px 14px' }}><Skeleton h="16px" w="80px" /></td>
                    <td style={{ padding: '12px 14px', textAlign: 'right' }}><Skeleton h="16px" w="60px" style={{ marginLeft: 'auto' }} /></td>
                    <td style={{ padding: '12px 14px' }}><Skeleton h="18px" w="60px" /></td>
                    <td style={{ padding: '12px 14px' }}><Skeleton h="16px" w="70px" /></td>
                    <td style={{ padding: '12px 14px', textAlign: 'right' }}><Skeleton h="24px" w="60px" style={{ marginLeft: 'auto' }} /></td>
                  </tr>
                ))
              ) : readings.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: '40px 14px', textAlign: 'center' }}>
                    <div style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                    }}>
                      <svg width="32" height="32" fill="none" viewBox="0 0 24 24" stroke="#9ca3af" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 011.875 1.875v13.5A1.875 1.875 0 0118.375 21.75H5.625A1.875 1.875 0 013.75 19.875V6.375A1.875 1.875 0 015.625 4.5z" />
                      </svg>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: '#374151' }}>
                        No telemetry records match the selected filters.
                      </div>
                      <div style={{ fontSize: '11px', color: '#9ca3af' }}>
                        Try broadening your date range, district, or station filters.
                      </div>
                      {hasActiveFilters && (
                        <button
                          onClick={handleResetFilters}
                          style={{
                            marginTop: '6px',
                            padding: '4px 12px',
                            background: '#2563eb',
                            color: '#ffffff',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: 600,
                            border: 'none',
                            cursor: 'pointer',
                          }}
                        >
                          Clear All Filters
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                readings.map((r, idx) => (
                  <tr
                    key={r.id}
                    style={{
                      background: idx % 2 === 0 ? '#ffffff' : '#fafafa',
                      borderBottom: '1px solid #f3f4f6',
                      transition: 'background 0.15s ease',
                    }}
                  >
                    {/* Timestamp */}
                    <td style={{ padding: '10px 14px', fontSize: '11px', color: '#111827', whiteSpace: 'nowrap' }}>
                      <div style={{ fontWeight: 600 }}>{fmtDateTime(r.timestamp)}</div>
                    </td>

                    {/* Station */}
                    <td style={{ padding: '10px 14px' }}>
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
                      <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '2px', fontFamily: 'monospace' }}>
                        Station ID #{r.station_id}
                      </div>
                    </td>

                    {/* District */}
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: '#374151' }}>
                        {r.district || '—'}
                      </span>
                    </td>

                    {/* Groundwater Level */}
                    <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                      <span style={{
                        fontSize: '13px',
                        fontWeight: 700,
                        fontFamily: 'monospace',
                        color: Number(r.groundwater_level) <= -900 ? '#dc2626' : '#111827',
                      }}>
                        {Number(r.groundwater_level).toFixed(2)} m
                      </span>
                    </td>

                    {/* Quality Badge */}
                    <td style={{ padding: '10px 14px' }}>
                      <span
                        title={r.quality_reason || undefined}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '1px 6px',
                          borderRadius: '3px',
                          fontSize: '10px',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          background: r.data_quality === 'valid' ? '#dcfce7' : r.data_quality === 'suspect' ? '#fef3c7' : '#fee2e2',
                          color: r.data_quality === 'valid' ? '#15803d' : r.data_quality === 'suspect' ? '#854d0e' : '#b91c1c',
                          border: `1px solid ${r.data_quality === 'valid' ? '#bbf7d0' : r.data_quality === 'suspect' ? '#fde68a' : '#fecaca'}`,
                        }}
                      >
                        {r.data_quality}
                      </span>
                    </td>

                    {/* Source ID */}
                    <td style={{ padding: '10px 14px', fontSize: '10px', fontFamily: 'monospace', color: '#6b7280' }}>
                      #{r.id} <span style={{ color: '#9ca3af' }}>(SlNo {r.source_slno})</span>
                    </td>

                    {/* Action */}
                    <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                      <Link
                        to={`/stations/${r.station_id}`}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '3px 8px',
                          background: '#eff6ff',
                          color: '#1d4ed8',
                          border: '1px solid #bfdbfe',
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: 600,
                          textDecoration: 'none',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        Station →
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* ── Server-Side Pagination Controls ── */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          borderTop: '1px solid #f3f4f6',
          background: '#ffffff',
          flexWrap: 'wrap',
          gap: '10px',
        }}>
          <div style={{ fontSize: '11px', color: '#6b7280' }}>
            Current Page: <strong style={{ color: '#111827' }}>{currentPage}</strong> ({appliedFilters.limit} records per request)
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
              disabled={currentPage === 1 || readingsLoading}
              style={{
                padding: '4px 12px',
                background: currentPage === 1 || readingsLoading ? '#f3f4f6' : '#ffffff',
                border: '1px solid #d1d5db',
                borderRadius: '4px',
                fontSize: '11px',
                fontWeight: 600,
                color: currentPage === 1 || readingsLoading ? '#9ca3af' : '#374151',
                cursor: currentPage === 1 || readingsLoading ? 'not-allowed' : 'pointer',
              }}
            >
              ← Previous Page
            </button>

            <span style={{
              padding: '4px 10px',
              background: '#2563eb',
              color: '#ffffff',
              borderRadius: '4px',
              fontSize: '11px',
              fontWeight: 700,
            }}>
              {currentPage}
            </span>

            <button
              onClick={() => setCurrentPage((p) => p + 1)}
              disabled={!hasNextPage || readingsLoading}
              style={{
                padding: '4px 12px',
                background: !hasNextPage || readingsLoading ? '#f3f4f6' : '#ffffff',
                border: '1px solid #d1d5db',
                borderRadius: '4px',
                fontSize: '11px',
                fontWeight: 600,
                color: !hasNextPage || readingsLoading ? '#9ca3af' : '#374151',
                cursor: !hasNextPage || readingsLoading ? 'not-allowed' : 'pointer',
              }}
            >
              Next Page →
            </button>
          </div>
        </div>
      </Card>
    </div>
  )
}
