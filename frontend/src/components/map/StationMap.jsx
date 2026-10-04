import { useEffect, useRef, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet'
import MarkerClusterGroup from 'react-leaflet-cluster'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtLevel(n) {
  if (n == null) return '—'
  return `${Number(n).toFixed(2)} m`
}

function fmtDate(ts) {
  if (!ts) return '—'
  return new Date(ts).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

// ─── Custom Cluster Icon Generator ────────────────────────────────────────────
function createClusterCustomIcon(cluster) {
  const count = cluster.getChildCount()
  let size = 30
  let fontSize = '11px'
  let bg = '#2563eb'

  if (count >= 100) {
    size = 38
    fontSize = '12px'
    bg = '#1d4ed8'
  } else if (count >= 20) {
    size = 34
    fontSize = '11.5px'
    bg = '#2563eb'
  }

  return L.divIcon({
    html: `<div style="
      width: ${size}px;
      height: ${size}px;
      background-color: ${bg};
      color: #ffffff;
      border: 2px solid #ffffff;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: ${fontSize};
      font-weight: 700;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      box-shadow: 0 2px 5px rgba(0, 0, 0, 0.18);
      line-height: 1;
      user-select: none;
    ">${count}</div>`,
    className: 'custom-cluster-badge',
    iconSize: L.point(size, size, true),
  })
}

// ─── Auto-fit Bounds Controller (Fits Haryana tightly on station data load) ────
function MapBoundsController({ bounds }) {
  const map = useMap()
  const hasFittedRef = useRef(false)

  useEffect(() => {
    if (bounds && bounds.isValid() && !hasFittedRef.current) {
      map.fitBounds(bounds, {
        padding: [10, 10],
        maxZoom: 10,
        animate: false,
      })
      hasFittedRef.current = true
    }
  }, [map, bounds])

  return null
}

// ─── Main StationMap Component ────────────────────────────────────────────────
export default function StationMap({ stations, loading, error }) {
  // Filter valid coordinates and memoize
  const validStations = useMemo(() => {
    return (stations ?? []).filter(
      s => s.latitude != null && s.longitude != null &&
        !isNaN(s.latitude) && !isNaN(s.longitude)
    )
  }, [stations])

  // Compute LatLngBounds directly from actual station coordinates
  const bounds = useMemo(() => {
    if (validStations.length === 0) return null
    const coords = validStations.map(s => [s.latitude, s.longitude])
    return L.latLngBounds(coords)
  }, [validStations])

  // Central Haryana fallback coordinates
  const defaultCenter = [29.132, 76.041]

  if (loading) {
    return (
      <div style={{
        height: '255px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        background: '#f9fafb',
        borderRadius: '6px',
        border: '1px solid #e5e7eb',
      }}>
        <div style={{
          width: '28px',
          height: '28px',
          border: '2.5px solid #e5e7eb',
          borderTopColor: '#2563eb',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }} />
        <span style={{ fontSize: '12px', color: '#6b7280', fontWeight: 500 }}>
          Loading station locations...
        </span>
        <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{
        height: '255px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        background: '#fef2f2',
        border: '1px solid #fecaca',
        borderRadius: '6px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#b91c1c', fontSize: '12px' }}>
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9.303 3.376c-.866 1.5-3.07 1.5-3.898 0L5.697 5.876c-.866-1.5.217-3.376 1.948-3.376h12.71c1.73 0 2.813 1.876 1.948 3.376zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          Unable to load station locations.
        </div>
      </div>
    )
  }

  if (validStations.length === 0) {
    return (
      <div style={{
        height: '255px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '6px',
        background: '#fafafa',
        border: '1px dashed #e5e7eb',
        borderRadius: '6px',
      }}>
        <svg style={{ color: '#d1d5db' }} width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" />
        </svg>
        <p style={{ fontSize: '12px', color: '#6b7280', fontWeight: 500, margin: 0 }}>
          No station locations available.
        </p>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div style={{ height: '255px', borderRadius: '6px', overflow: 'hidden', border: '1px solid #e5e7eb', position: 'relative' }}>
        <MapContainer
          center={defaultCenter}
          zoom={8}
          minZoom={6}
          maxZoom={16}
          zoomSnap={0.25}
          zoomDelta={0.5}
          preferCanvas={true}
          style={{ height: '100%', width: '100%' }}
          scrollWheelZoom={false}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {bounds && <MapBoundsController bounds={bounds} />}

          <MarkerClusterGroup
            chunkedLoading={true}
            maxClusterRadius={60}
            removeOutsideVisibleBounds={true}
            animate={false}
            animateAddingMarkers={false}
            spiderfyOnMaxZoom={true}
            showCoverageOnHover={false}
            zoomToBoundsOnClick={true}
            iconCreateFunction={createClusterCustomIcon}
          >
            {validStations.map(st => (
              <CircleMarker
                key={st.station_id}
                center={[st.latitude, st.longitude]}
                radius={5}
                pathOptions={{
                  color: '#ffffff',
                  weight: 1.5,
                  fillColor: '#2563eb',
                  fillOpacity: 0.9,
                }}
              >
                <Popup className="station-custom-popup">
                  <div style={{ fontSize: '12px', lineHeight: '1.5', minWidth: '180px', padding: '2px 0' }}>
                    <div style={{ fontWeight: 700, color: '#111827', fontSize: '13px', marginBottom: '4px' }}>
                      {st.station_name}
                    </div>
                    <div style={{ color: '#6b7280', marginBottom: '2px' }}>
                      District: <span style={{ color: '#1f2937', fontWeight: 500 }}>{st.district || 'Unknown'}</span>
                    </div>
                    <div style={{ color: '#6b7280', marginBottom: '2px' }}>
                      Coordinates: <span style={{ color: '#374151', fontFamily: 'monospace', fontSize: '11px' }}>
                        {st.latitude.toFixed(4)}° N, {st.longitude.toFixed(4)}° E
                      </span>
                    </div>
                    {st.latest_groundwater_level != null && (
                      <div style={{ color: '#6b7280', marginBottom: '2px' }}>
                        GW Level: <span style={{ color: '#1f2937', fontWeight: 600 }}>{fmtLevel(st.latest_groundwater_level)}</span>
                      </div>
                    )}
                    {st.latest_reading_timestamp && (
                      <div style={{ color: '#9ca3af', fontSize: '11px', marginBottom: '8px' }}>
                        Recorded: {fmtDate(st.latest_reading_timestamp)}
                      </div>
                    )}
                    <div style={{ marginTop: '8px', paddingTop: '6px', borderTop: '1px solid #f3f4f6' }}>
                      <Link
                        to={`/stations/${st.station_id}`}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          fontSize: '11px',
                          fontWeight: 600,
                          color: '#2563eb',
                          textDecoration: 'none',
                        }}
                      >
                        View Station →
                      </Link>
                    </div>
                  </div>
                </Popup>
              </CircleMarker>
            ))}
          </MarkerClusterGroup>
        </MapContainer>
      </div>

      {/* ─── Compact Legend ─────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '6px 10px',
        background: '#f9fafb',
        borderRadius: '5px',
        border: '1px solid #f3f4f6',
        fontSize: '11px',
        color: '#6b7280',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span style={{
              width: '9px',
              height: '9px',
              borderRadius: '50%',
              background: '#2563eb',
              border: '1.5px solid #ffffff',
              boxShadow: '0 0 0 1px #93c5fd',
              display: 'inline-block',
            }} />
            <span>Monitoring station</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span style={{
              width: '16px',
              height: '16px',
              borderRadius: '50%',
              background: '#2563eb',
              color: '#ffffff',
              fontSize: '9px',
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              lineHeight: 1,
            }}>
              #
            </span>
            <span>Clustered stations</span>
          </div>
        </div>
        <span style={{ color: '#9ca3af', fontSize: '10px' }}>
          Click cluster to zoom
        </span>
      </div>
    </div>
  )
}
