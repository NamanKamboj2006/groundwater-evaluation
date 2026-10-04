import { NavLink } from 'react-router-dom'

const NAV_ITEMS = [
  {
    name: 'Dashboard',
    path: '/dashboard',
    icon: (
      <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
      </svg>
    ),
  },
  {
    name: 'Stations',
    path: '/stations',
    icon: (
      <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
      </svg>
    ),
  },
  {
    name: 'Records',
    path: '/records',
    icon: (
      <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 011.875 1.875v13.5A1.875 1.875 0 0118.375 21.75H5.625A1.875 1.875 0 013.75 19.875V6.375A1.875 1.875 0 015.625 4.5z" />
      </svg>
    ),
  },
  {
    name: 'Analytics',
    path: '/analytics',
    icon: (
      <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
      </svg>
    ),
  },
]

export default function Sidebar({ isOpen, onClose }) {
  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 z-40 lg:hidden"
          style={{ background: 'rgba(15,23,42,0.25)' }}
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        style={{
          width: '256px',
          minWidth: '256px',
          background: '#fff',
          borderRight: '1px solid #e5e7eb',
          display: 'flex',
          flexDirection: 'column',
          height: '100vh',
          position: 'sticky',
          top: 0,
          flexShrink: 0,
          transform: isOpen ? 'none' : undefined,
          zIndex: 50,
        }}
        className={`lg:translate-x-0 ${isOpen ? 'translate-x-0' : '-translate-x-full'} fixed lg:static top-0 bottom-0 left-0 transition-transform duration-150`}
      >
        {/* Logo */}
        <div style={{
          height: '68px',
          padding: '0 20px',
          borderBottom: '1px solid #f3f4f6',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          flexShrink: 0,
        }}>
          <div style={{
            width: '36px', height: '36px',
            background: '#2563eb',
            borderRadius: '9px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <svg width="19" height="19" viewBox="0 0 24 24" fill="white">
              <path d="M12 2C12 2 4.5 11 4.5 15.5a7.5 7.5 0 0015 0C19.5 11 12 2 12 2z" />
            </svg>
          </div>
          <div>
            <div style={{ fontSize: '15px', fontWeight: 700, color: '#111827', lineHeight: '1.2' }}>Groundwater</div>
            <div style={{ fontSize: '11px', color: '#6b7280', lineHeight: '1.3', marginTop: '1px' }}>Resource Evaluation</div>
          </div>
          <button
            onClick={onClose}
            className="lg:hidden ml-auto"
            style={{ padding: '4px', background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}
            aria-label="Close sidebar"
          >
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '8px 10px', overflowY: 'auto' }}>
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={onClose}
              style={({ isActive }) => ({
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '12px 14px',
                borderRadius: '7px',
                marginBottom: '3px',
                fontSize: '15px',
                fontWeight: isActive ? 600 : 400,
                color: isActive ? '#1d4ed8' : '#4b5563',
                background: isActive ? '#eff6ff' : 'transparent',
                textDecoration: 'none',
                transition: 'all 0.1s',
                borderLeft: isActive ? '3px solid #2563eb' : '3px solid transparent',
              })}
            >
              {item.icon}
              <span>{item.name}</span>
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div style={{
          padding: '14px 20px',
          borderTop: '1px solid #f3f4f6',
          fontSize: '11px',
          color: '#9ca3af',
          textAlign: 'center',
        }}>
          University Academic Project
        </div>
      </aside>
    </>
  )
}
