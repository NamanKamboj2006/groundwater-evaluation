export default function PageHeader({ title, description, actions }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '14px' }}>
      <div>
        <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#111827', margin: 0, lineHeight: '1.3' }}>
          {title}
        </h2>
        {description && (
          <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px', marginBottom: 0 }}>
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: '16px', flexShrink: 0 }}>
          {actions}
        </div>
      )}
    </div>
  )
}
