import type { GraphPath } from '../types'

interface PathsLegendProps {
  paths: GraphPath[]
  isDarkMode?: boolean
}

export function PathsLegend({ paths, isDarkMode = true }: PathsLegendProps) {
  // Generate colors matching GraphCanvas
  const hueStep = 360 / paths.length
  const pathColors = paths.map((_, idx) => {
    const hue = idx * hueStep
    return `hsl(${hue}, 70%, 50%)`
  })

  return (
    <div
      style={{
        background: isDarkMode ? '#2a2a2a' : '#f5f5f5',
        border: isDarkMode ? '1px solid #444' : '1px solid #ddd',
        borderRadius: '8px',
        padding: '12px',
        marginTop: '10px',
      }}
    >
      <div
        style={{
          fontSize: '13px',
          fontWeight: 'bold',
          marginBottom: '8px',
          color: isDarkMode ? '#e0e0e0' : '#333',
        }}
      >
        Paths Legend
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {paths.map((path, idx) => (
          <div
            key={path.name}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '12px',
            }}
          >
            <div
              style={{
                width: '30px',
                height: '3px',
                backgroundColor: pathColors[idx],
                borderRadius: '2px',
              }}
            />
            <span style={{ color: isDarkMode ? '#ccc' : '#555' }}>
              {path.name}
            </span>
            <span
              style={{
                color: isDarkMode ? '#888' : '#999',
                fontSize: '11px',
                marginLeft: 'auto',
              }}
            >
              {path.nodeIds.length} nodes
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
