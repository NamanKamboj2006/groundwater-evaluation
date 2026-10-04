import { useEffect, useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import PageHeader from '../components/common/PageHeader'
import { fetchStations, fetchMapStations, getCached, hasCached } from '../services/api'

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

function ErrorMsg({ text = 'Unable to load stations directory.', onRetry }) {
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

// ─── Main Stations Component ──────────────────────────────────────────────────
export default function Stations() {
  const [stations, setStations] = useState(() => {
    const cachedSt = getCached('/api/stations', { limit: 2000 })
    const cachedMap = getCached('/api/map/stations')
    if (Array.isArray(cachedSt) && cachedSt.length > 0) {
      const mapDataById = new Map()
      if (Array.isArray(cachedMap)) {
        for (const m of cachedMap) {
          mapDataById.set(m.station_id, m)
        }
      }
      return cachedSt.map((st) => {
        const telemetry = mapDataById.get(st.id)
        return {
          id: st.id,
          station_name: st.station_name,
          agency: st.agency,
          state: st.state || 'Haryana',
          district: st.district || 'Unknown',
          tehsil: st.tehsil && st.tehsil !== '-' ? st.tehsil : null,
          latitude: st.latitude,
          longitude: st.longitude,
          rl_msl: st.rl_msl,
          latest_groundwater_level: telemetry?.latest_groundwater_level ?? null,
          latest_reading_timestamp: telemetry?.latest_reading_timestamp ?? null,
          latest_data_quality: telemetry?.latest_data_quality ?? null,
        }
      })
    }
    return []
  })
  const [loading, setLoading] = useState(() => !hasCached('/api/stations', { limit: 2000 }))
  const [error, setError] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  // Filters & Search State
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedDistrict, setSelectedDistrict] = useState('ALL')
  const [selectedQuality, setSelectedQuality] = useState('ALL')

  // Pagination & Sorting State
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [sortField, setSortField] = useState('id')
  const [sortAsc, setSortAsc] = useState(true)

  // ─── Load Stations Data ─────────────────────────────────────────────────────
  useEffect(() => {
    let isMounted = true

    async function loadStations() {
      if (!hasCached('/api/stations', { limit: 2000 })) {
        setLoading(true)
      }
      setError(false)

      try {
        const [stationsRes, mapRes] = await Promise.all([
          fetchStations({ limit: 2000 }).catch(() => null),
          fetchMapStations().catch(() => null),
        ])

        if (!isMounted) return

        if (Array.isArray(stationsRes) && stationsRes.length > 0) {
          // Index map data for fast telemetry enrichment
          const mapDataById = new Map()
          if (Array.isArray(mapRes)) {
            for (const m of mapRes) {
              mapDataById.set(m.station_id, m)
            }
          }

          // Merge station directory with latest telemetry observation
          const merged = stationsRes.map((st) => {
            const telemetry = mapDataById.get(st.id)
            return {
              id: st.id,
              station_name: st.station_name,
              agency: st.agency,
              state: st.state || 'Haryana',
              district: st.district || 'Unknown',
              tehsil: st.tehsil && st.tehsil !== '-' ? st.tehsil : null,
              latitude: st.latitude,
              longitude: st.longitude,
              rl_msl: st.rl_msl,
              latest_groundwater_level: telemetry?.latest_groundwater_level ?? null,
              latest_reading_timestamp: telemetry?.latest_reading_timestamp ?? null,
              latest_data_quality: telemetry?.latest_data_quality ?? null,
            }
          })

          setStations(merged)
        } else {
          setError(true)
        }
      } catch {
        if (isMounted) setError(true)
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    loadStations()

    return () => {
      isMounted = false
    }
  }, [reloadKey])

  // ─── Extract Distinct Districts List ────────────────────────────────────────
  const districtsList = useMemo(() => {
    const set = new Set()
    for (const s of stations) {
      if (s.district && s.district.trim()) {
        set.add(s.district.trim())
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [stations])

  // ─── Filter & Search Logic ──────────────────────────────────────────────────
  const filteredStations = useMemo(() => {
    let result = stations

    // Filter by district
    if (selectedDistrict !== 'ALL') {
      result = result.filter(
        (s) => s.district.toUpperCase() === selectedDistrict.toUpperCase()
      )
    }

    // Filter by data quality
    if (selectedQuality !== 'ALL') {
      result = result.filter(
        (s) => s.latest_data_quality === selectedQuality
      )
    }

    // Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      result = result.filter((s) => {
        return (
          s.station_name.toLowerCase().includes(q) ||
          s.district.toLowerCase().includes(q) ||
          (s.tehsil && s.tehsil.toLowerCase().includes(q)) ||
          (s.agency && s.agency.toLowerCase().includes(q)) ||
          String(s.id).includes(q)
        )
      })
    }

    // Sorting
    return [...result].sort((a, b) => {
      let valA = a[sortField]
      let valB = b[sortField]

      if (valA == null) return sortAsc ? 1 : -1
      if (valB == null) return sortAsc ? -1 : 1

      if (typeof valA === 'string') {
        const cmp = valA.localeCompare(valB)
        return sortAsc ? cmp : -cmp
      }

      return sortAsc ? valA - valB : valB - valA
    })
  }, [stations, selectedDistrict, selectedQuality, searchQuery, sortField, sortAsc])

  // ─── Paginated Slice ────────────────────────────────────────────────────────
  const totalItems = filteredStations.length
  const totalPages = Math.ceil(totalItems / pageSize) || 1
  const activePage = Math.min(currentPage, totalPages)
  const paginatedStations = useMemo(() => {
    const startIdx = (activePage - 1) * pageSize
    return filteredStations.slice(startIdx, startIdx + pageSize)
  }, [filteredStations, activePage, pageSize])

  // ─── Summary Metrics ────────────────────────────────────────────────────────
  const totalStationsCount = stations.length
  const districtsCount = districtsList.length
  const stationsWithReadingsCount = useMemo(() => {
    return stations.filter((s) => s.latest_reading_timestamp != null).length
  }, [stations])
  const validLatestCount = useMemo(() => {
    return stations.filter((s) => s.latest_data_quality === 'valid').length
  }, [stations])

  const kpis = [
    {
      label: 'Total Stations',
      value: loading ? '—' : fmt(totalStationsCount),
      sub: `${totalStationsCount} stations represented in current dataset`,
      accent: '#2563eb',
      iconPath: 'M15 10.5a3 3 0 11-6 0 3 3 0 016 0zM19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z',
    },
    {
      label: 'Districts Represented',
      value: loading ? '—' : fmt(districtsCount),
      sub: 'Across Haryana state',
      accent: '#0891b2',
      iconPath: 'M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z',
    },
    {
      label: 'Telemetry Active',
      value: loading ? '—' : fmt(stationsWithReadingsCount),
      sub: totalStationsCount > 0 ? `${fmtPercent(stationsWithReadingsCount, totalStationsCount)} with telemetry records` : 'Active monitoring',
      accent: '#16a34a',
      iconPath: 'M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    },
    {
      label: 'Valid Quality Latest',
      value: loading ? '—' : fmt(validLatestCount),
      sub: totalStationsCount > 0 ? `${fmtPercent(validLatestCount, totalStationsCount)} verified valid readings` : 'Quality verified',
      accent: '#6366f1',
      iconPath: 'M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    },
  ]

  const handleSort = (field) => {
    if (sortField === field) {
      setSortAsc(!sortAsc)
    } else {
      setSortField(field)
      setSortAsc(true)
    }
  }

  const hasActiveFilters = searchQuery.trim() !== '' || selectedDistrict !== 'ALL' || selectedQuality !== 'ALL'

  const clearFilters = () => {
    setSearchQuery('')
    setSelectedDistrict('ALL')
    setSelectedQuality('ALL')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <PageHeader
        title="Monitoring Stations"
        description="Browse, filter, and inspect physical groundwater telemetry monitoring stations across Haryana."
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
            {loading ? 'Loading…' : `${fmt(stations.length)} Stations Represented`}
          </div>
        }
      />

      {/* ── Top Summary Cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
        {kpis.map((card) => (
          <KpiCard
            key={card.label}
            {...card}
            loading={loading}
            error={error}
          />
        ))}
      </div>

      {error && (
        <ErrorMsg
          text="Unable to load station directory. Please verify that the backend is active at localhost:8000."
          onRetry={() => setReloadKey((k) => k + 1)}
        />
      )}

      {/* ── Search & Filter Controls ── */}
      <Card style={{ padding: '12px 16px' }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
        }}>
          {/* Search Box */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: '260px', maxWidth: '420px' }}>
            <div style={{
              position: 'relative',
              width: '100%',
              display: 'flex',
              alignItems: 'center',
            }}>
              <svg
                width="14"
                height="14"
                fill="none"
                viewBox="0 0 24 24"
                stroke="#9ca3af"
                strokeWidth={2}
                style={{ position: 'absolute', left: '10px', pointerEvents: 'none' }}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
              <input
                id="station-search"
                type="text"
                placeholder="Search by name, district, agency, or ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  height: '32px',
                  padding: '0 28px 0 32px',
                  background: '#f9fafb',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '12px',
                  color: '#111827',
                  outline: 'none',
                }}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear search query"
                  style={{
                    position: 'absolute',
                    right: '8px',
                    background: 'transparent',
                    border: 'none',
                    color: '#9ca3af',
                    cursor: 'pointer',
                    fontSize: '14px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Filter Dropdowns */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            {/* District Filter */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <label htmlFor="filter-district" style={{ fontSize: '11px', fontWeight: 600, color: '#4b5563', whiteSpace: 'nowrap' }}>
                District:
              </label>
              <select
                id="filter-district"
                value={selectedDistrict}
                onChange={(e) => setSelectedDistrict(e.target.value)}
                style={{
                  height: '32px',
                  padding: '0 10px',
                  background: '#ffffff',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 500,
                  color: '#111827',
                  cursor: 'pointer',
                  outline: 'none',
                }}
              >
                <option value="ALL">All Districts ({districtsList.length})</option>
                {districtsList.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>

            {/* Quality Filter */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <label htmlFor="filter-quality" style={{ fontSize: '11px', fontWeight: 600, color: '#4b5563', whiteSpace: 'nowrap' }}>
                Latest Quality:
              </label>
              <select
                id="filter-quality"
                value={selectedQuality}
                onChange={(e) => setSelectedQuality(e.target.value)}
                style={{
                  height: '32px',
                  padding: '0 10px',
                  background: '#ffffff',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 500,
                  color: '#111827',
                  cursor: 'pointer',
                  outline: 'none',
                }}
              >
                <option value="ALL">All Statuses</option>
                <option value="valid">Valid Only</option>
                <option value="suspect">Suspect Only</option>
                <option value="invalid">Invalid Only</option>
              </select>
            </div>

            {/* Page Size */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <label htmlFor="filter-pagesize" style={{ fontSize: '11px', fontWeight: 600, color: '#4b5563', whiteSpace: 'nowrap' }}>
                Show:
              </label>
              <select
                id="filter-pagesize"
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                style={{
                  height: '32px',
                  padding: '0 8px',
                  background: '#ffffff',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 500,
                  color: '#111827',
                  cursor: 'pointer',
                  outline: 'none',
                }}
              >
                <option value={10}>10 / page</option>
                <option value={25}>25 / page</option>
                <option value={50}>50 / page</option>
                <option value={100}>100 / page</option>
              </select>
            </div>

            {/* Clear Filters Button */}
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                style={{
                  height: '32px',
                  padding: '0 10px',
                  background: '#f3f4f6',
                  border: '1px solid #e5e7eb',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontWeight: 600,
                  color: '#4b5563',
                  cursor: 'pointer',
                }}
              >
                Reset Filters
              </button>
            )}
          </div>
        </div>
      </Card>

      {/* ── Station Inventory Table ── */}
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
              Station Directory
            </span>
            <span style={{
              fontSize: '11px',
              color: '#6b7280',
              background: '#f3f4f6',
              padding: '2px 8px',
              borderRadius: '10px',
              fontVariantNumeric: 'tabular-nums',
            }}>
              {loading ? '…' : `${fmt(filteredStations.length)} matched`}
            </span>
          </div>

          <div style={{ fontSize: '11px', color: '#9ca3af' }}>
            Showing {filteredStations.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}–
            {Math.min(currentPage * pageSize, filteredStations.length)} of {fmt(filteredStations.length)}
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                <th
                  onClick={() => handleSort('id')}
                  style={{
                    padding: '8px 14px',
                    fontSize: '10px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: sortField === 'id' ? '#2563eb' : '#6b7280',
                    cursor: 'pointer',
                    userSelect: 'none',
                    whiteSpace: 'nowrap',
                    width: '80px',
                  }}
                >
                  ID {sortField === 'id' ? (sortAsc ? '▲' : '▼') : ''}
                </th>
                <th
                  onClick={() => handleSort('station_name')}
                  style={{
                    padding: '8px 14px',
                    fontSize: '10px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: sortField === 'station_name' ? '#2563eb' : '#6b7280',
                    cursor: 'pointer',
                    userSelect: 'none',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Station Name {sortField === 'station_name' ? (sortAsc ? '▲' : '▼') : ''}
                </th>
                <th
                  onClick={() => handleSort('district')}
                  style={{
                    padding: '8px 14px',
                    fontSize: '10px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: sortField === 'district' ? '#2563eb' : '#6b7280',
                    cursor: 'pointer',
                    userSelect: 'none',
                    whiteSpace: 'nowrap',
                    width: '140px',
                  }}
                >
                  District {sortField === 'district' ? (sortAsc ? '▲' : '▼') : ''}
                </th>
                <th
                  style={{
                    padding: '8px 14px',
                    fontSize: '10px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: '#6b7280',
                    whiteSpace: 'nowrap',
                    width: '150px',
                  }}
                >
                  Coordinates
                </th>
                <th
                  onClick={() => handleSort('latest_groundwater_level')}
                  style={{
                    padding: '8px 14px',
                    fontSize: '10px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: sortField === 'latest_groundwater_level' ? '#2563eb' : '#6b7280',
                    cursor: 'pointer',
                    userSelect: 'none',
                    textAlign: 'right',
                    whiteSpace: 'nowrap',
                    width: '140px',
                  }}
                >
                  Latest Level {sortField === 'latest_groundwater_level' ? (sortAsc ? '▲' : '▼') : ''}
                </th>
                <th
                  onClick={() => handleSort('latest_reading_timestamp')}
                  style={{
                    padding: '8px 14px',
                    fontSize: '10px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: sortField === 'latest_reading_timestamp' ? '#2563eb' : '#6b7280',
                    cursor: 'pointer',
                    userSelect: 'none',
                    whiteSpace: 'nowrap',
                    width: '160px',
                  }}
                >
                  Latest Reading {sortField === 'latest_reading_timestamp' ? (sortAsc ? '▲' : '▼') : ''}
                </th>
                <th
                  style={{
                    padding: '8px 14px',
                    fontSize: '10px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: '#6b7280',
                    textAlign: 'right',
                    whiteSpace: 'nowrap',
                    width: '110px',
                  }}
                >
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '12px 14px' }}><Skeleton h="16px" w="40px" /></td>
                    <td style={{ padding: '12px 14px' }}><Skeleton h="16px" w="180px" /></td>
                    <td style={{ padding: '12px 14px' }}><Skeleton h="16px" w="80px" /></td>
                    <td style={{ padding: '12px 14px' }}><Skeleton h="16px" w="120px" /></td>
                    <td style={{ padding: '12px 14px', textAlign: 'right' }}><Skeleton h="16px" w="70px" style={{ marginLeft: 'auto' }} /></td>
                    <td style={{ padding: '12px 14px' }}><Skeleton h="16px" w="110px" /></td>
                    <td style={{ padding: '12px 14px', textAlign: 'right' }}><Skeleton h="24px" w="80px" style={{ marginLeft: 'auto' }} /></td>
                  </tr>
                ))
              ) : paginatedStations.length === 0 ? (
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
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                      </svg>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: '#374151' }}>
                        No stations match your current filters.
                      </div>
                      <div style={{ fontSize: '11px', color: '#9ca3af' }}>
                        Try adjusting your search query or district filter.
                      </div>
                      {hasActiveFilters && (
                        <button
                          onClick={clearFilters}
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
                paginatedStations.map((st, idx) => (
                  <tr
                    key={st.id}
                    style={{
                      background: idx % 2 === 0 ? '#ffffff' : '#fafafa',
                      borderBottom: '1px solid #f3f4f6',
                      transition: 'background 0.15s ease',
                    }}
                  >
                    {/* Station ID */}
                    <td style={{ padding: '10px 14px', fontSize: '11px', fontFamily: 'monospace', color: '#6b7280', fontWeight: 600 }}>
                      #{st.id}
                    </td>

                    {/* Station Name */}
                    <td style={{ padding: '10px 14px' }}>
                      <Link
                        to={`/stations/${st.id}`}
                        style={{
                          fontSize: '12px',
                          fontWeight: 700,
                          color: '#1d4ed8',
                          textDecoration: 'none',
                          lineHeight: 1.4,
                          display: 'block',
                        }}
                      >
                        {st.station_name}
                      </Link>
                      <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span>{st.agency || 'Irrigation & Water Resources Dept'}</span>
                        {st.tehsil && (
                          <>
                            <span>•</span>
                            <span>Tehsil: {st.tehsil}</span>
                          </>
                        )}
                      </div>
                    </td>

                    {/* District & State */}
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: '#111827' }}>
                        {st.district}
                      </span>
                      <div style={{ fontSize: '10px', color: '#9ca3af' }}>{st.state}</div>
                    </td>

                    {/* Coordinates */}
                    <td style={{ padding: '10px 14px', fontSize: '11px', fontFamily: 'monospace', color: '#4b5563' }}>
                      <div>{st.latitude.toFixed(4)}° N</div>
                      <div style={{ color: '#9ca3af' }}>{st.longitude.toFixed(4)}° E</div>
                    </td>

                    {/* Latest Groundwater Level */}
                    <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                      {st.latest_groundwater_level != null ? (
                        <div>
                          <div style={{ fontSize: '12px', fontWeight: 700, color: '#111827', fontVariantNumeric: 'tabular-nums' }}>
                            {Number(st.latest_groundwater_level).toFixed(2)} m
                          </div>
                          {st.latest_data_quality && (
                            <span style={{
                              display: 'inline-block',
                              fontSize: '9px',
                              fontWeight: 700,
                              textTransform: 'uppercase',
                              padding: '1px 4px',
                              borderRadius: '3px',
                              marginTop: '2px',
                              background: st.latest_data_quality === 'valid' ? '#dcfce7' : st.latest_data_quality === 'suspect' ? '#fef3c7' : '#fee2e2',
                              color: st.latest_data_quality === 'valid' ? '#15803d' : st.latest_data_quality === 'suspect' ? '#854d0e' : '#b91c1c',
                              border: `1px solid ${st.latest_data_quality === 'valid' ? '#bbf7d0' : st.latest_data_quality === 'suspect' ? '#fde68a' : '#fecaca'}`,
                            }}>
                              {st.latest_data_quality}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span style={{ fontSize: '11px', color: '#9ca3af' }}>—</span>
                      )}
                    </td>

                    {/* Latest Observation */}
                    <td style={{ padding: '10px 14px', fontSize: '11px', color: '#4b5563', whiteSpace: 'nowrap' }}>
                      {st.latest_reading_timestamp ? fmtDateTime(st.latest_reading_timestamp) : '—'}
                    </td>

                    {/* Action Button */}
                    <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                      <Link
                        to={`/stations/${st.id}`}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '4px 10px',
                          background: '#eff6ff',
                          color: '#1d4ed8',
                          border: '1px solid #bfdbfe',
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: 600,
                          textDecoration: 'none',
                          transition: 'all 0.15s ease',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        View Details →
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* ── Pagination Controls ── */}
        {!loading && totalPages > 1 && (
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
              Page <strong style={{ color: '#111827' }}>{activePage}</strong> of <strong style={{ color: '#111827' }}>{totalPages}</strong> ({fmt(totalItems)} total stations)
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <button
                onClick={() => setCurrentPage((p) => Math.max(Math.min(p, totalPages) - 1, 1))}
                disabled={activePage === 1}
                style={{
                  padding: '4px 10px',
                  background: activePage === 1 ? '#f3f4f6' : '#ffffff',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  fontSize: '11px',
                  fontWeight: 600,
                  color: activePage === 1 ? '#9ca3af' : '#374151',
                  cursor: activePage === 1 ? 'not-allowed' : 'pointer',
                }}
              >
                ← Previous
              </button>

              {/* Page Number Buttons */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter((p) => p === 1 || p === totalPages || Math.abs(p - activePage) <= 2)
                  .map((p, idx, arr) => {
                    const prevP = arr[idx - 1]
                    const showEllipsis = prevP && p - prevP > 1

                    return (
                      <span key={p} style={{ display: 'flex', alignItems: 'center' }}>
                        {showEllipsis && <span style={{ padding: '0 4px', fontSize: '11px', color: '#9ca3af' }}>…</span>}
                        <button
                          onClick={() => setCurrentPage(p)}
                          style={{
                            minWidth: '28px',
                            height: '26px',
                            padding: '0 6px',
                            background: activePage === p ? '#2563eb' : '#ffffff',
                            color: activePage === p ? '#ffffff' : '#374151',
                            border: `1px solid ${activePage === p ? '#2563eb' : '#d1d5db'}`,
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          {p}
                        </button>
                      </span>
                    )
                  })}
              </div>

              <button
                onClick={() => setCurrentPage((p) => Math.min(Math.min(p, totalPages) + 1, totalPages))}
                disabled={activePage === totalPages}
                style={{
                  padding: '4px 10px',
                  background: activePage === totalPages ? '#f3f4f6' : '#ffffff',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  fontSize: '11px',
                  fontWeight: 600,
                  color: activePage === totalPages ? '#9ca3af' : '#374151',
                  cursor: activePage === totalPages ? 'not-allowed' : 'pointer',
                }}
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}
