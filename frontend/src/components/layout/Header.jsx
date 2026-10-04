import { useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { fetchHealth } from '../../services/api'

const ROUTE_TITLES = {
  '/dashboard': 'Dashboard',
  '/stations': 'Monitoring Stations',
  '/records': 'Reading Records',
  '/analytics': 'Groundwater Analytics',
}

export default function Header({ onMenuClick }) {
  const location = useLocation()
  const [backendStatus, setBackendStatus] = useState('checking')

  useEffect(() => {
    let active = true

    async function checkHealth() {
      try {
        const res = await fetchHealth()
        if (active) {
          if (res?.status === 'ok') {
            setBackendStatus('online')
          } else {
            setBackendStatus('offline')
          }
        }
      } catch {
        if (active) {
          setBackendStatus('offline')
        }
      }
    }

    checkHealth()

    return () => { active = false }
  }, [])

  let title = ROUTE_TITLES[location.pathname]
  if (!title && location.pathname.startsWith('/stations/')) title = 'Station Details'
  if (!title) title = 'Dashboard'

  return (
    <header style={{
      height: '68px',
      background: '#fff',
      borderBottom: '1px solid #e5e7eb',
      display: 'flex',
      alignItems: 'center',
      padding: '0 24px',
      gap: '20px',
      flexShrink: 0,
      position: 'sticky',
      top: 0,
      zIndex: 30,
    }}>
      {/* Mobile menu button */}
      <button
        type="button"
        onClick={onMenuClick}
        className="lg:hidden"
        style={{ padding: '6px', background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', flexShrink: 0 }}
        aria-label="Open menu"
      >
        <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
        </svg>
      </button>

      {/* Page title — desktop */}
      <span
        style={{ fontSize: '20px', fontWeight: 700, color: '#111827', flexShrink: 0, lineHeight: 1 }}
        className="hidden lg:block"
      >
        {title}
      </span>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Right controls: Real Backend Status Indicator */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
        {backendStatus === 'online' ? (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            padding: '6px 12px',
            borderRadius: '6px',
            border: '1px solid #bbf7d0',
            background: '#f0fdf4',
            fontSize: '12px', fontWeight: 600, color: '#15803d',
            whiteSpace: 'nowrap',
          }}>
            <span style={{
              width: '7px', height: '7px',
              borderRadius: '50%',
              background: '#22c55e',
              display: 'block', flexShrink: 0,
            }} />
            Backend Online
          </span>
        ) : backendStatus === 'offline' ? (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            padding: '6px 12px',
            borderRadius: '6px',
            border: '1px solid #fecaca',
            background: '#fef2f2',
            fontSize: '12px', fontWeight: 600, color: '#b91c1c',
            whiteSpace: 'nowrap',
          }}>
            <span style={{
              width: '7px', height: '7px',
              borderRadius: '50%',
              background: '#ef4444',
              display: 'block', flexShrink: 0,
            }} />
            Backend Offline
          </span>
        ) : (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            padding: '6px 12px',
            borderRadius: '6px',
            border: '1px solid #e5e7eb',
            background: '#f9fafb',
            fontSize: '12px', fontWeight: 500, color: '#6b7280',
            whiteSpace: 'nowrap',
          }}>
            <span style={{
              width: '7px', height: '7px',
              borderRadius: '50%',
              background: '#9ca3af',
              display: 'block', flexShrink: 0,
            }} />
            Checking...
          </span>
        )}
      </div>
    </header>
  )
}
