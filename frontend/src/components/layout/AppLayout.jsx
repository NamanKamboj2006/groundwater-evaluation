import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import Header from './Header'

export default function AppLayout() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)

  return (
    <div style={{
      display: 'flex',
      height: '100vh',
      overflow: 'hidden',
      background: '#f0f2f5',
      fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
    }}>
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
        <Header onMenuClick={() => setIsSidebarOpen(true)} />
        <main style={{ flex: 1, overflowY: 'auto', padding: '18px 22px' }}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}
