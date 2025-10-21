import { useState } from 'react'
import type { LayoutOptions, ColorScheme } from '../types'

interface LayoutControlsProps {
  options: LayoutOptions
  onChange: (options: LayoutOptions) => void
  onCompute: () => void
  isComputing: boolean
  colorScheme: ColorScheme
  onColorSchemeChange: (scheme: ColorScheme) => void
  zoom: number
  onZoomChange: (zoom: number) => void
  lineThickness: number
  onLineThicknessChange: (thickness: number) => void
}

export function LayoutControls({
  options,
  onChange,
  onCompute,
  isComputing,
  colorScheme,
  onColorSchemeChange,
  zoom,
  onZoomChange,
  lineThickness,
  onLineThicknessChange,
}: LayoutControlsProps) {
  const [advancedExpanded, setAdvancedExpanded] = useState(false)

  return (
    <div className="layout-controls">
      <div className="control-group">
        <label>
          <strong>Color Scheme:</strong>
        </label>
        <select
          value={colorScheme}
          onChange={e => onColorSchemeChange(e.target.value as ColorScheme)}
          disabled={isComputing}
          className="color-scheme-select"
        >
          <option value="uniform">Uniform Color</option>
          <option value="random">Rainbow</option>
          <option value="depth">Color by Depth</option>
          <option value="gc-content">Color by Length (GC proxy)</option>
        </select>
      </div>

      <div className="control-group">
        <label>
          <strong>Zoom:</strong>
          <span className="control-value">{(zoom * 100).toFixed(0)}%</span>
        </label>
        <input
          type="range"
          min="0.1"
          max="10"
          step="0.1"
          value={zoom}
          onChange={e => onZoomChange(parseFloat(e.target.value))}
          disabled={isComputing}
        />
        <div className="control-hint">Zoom in/out on the graph</div>
      </div>

      <div className="control-group">
        <label>
          <strong>Line Thickness:</strong>
          <span className="control-value">{lineThickness.toFixed(1)}px</span>
        </label>
        <input
          type="range"
          min="1"
          max="10"
          step="0.5"
          value={lineThickness}
          onChange={e => onLineThicknessChange(parseFloat(e.target.value))}
          disabled={isComputing}
        />
        <div className="control-hint">Thickness of contig lines</div>
      </div>

      <div className="control-group">
        <label>
          <input
            type="checkbox"
            checked={options.linearLayout}
            onChange={e =>
              onChange({ ...options, linearLayout: e.target.checked })
            }
            disabled={isComputing}
          />{' '}
          Linear Layout
        </label>
        <div className="control-hint">
          Use linear positioning instead of force-directed
        </div>
      </div>

      <div className="advanced-settings">
        <button
          className="advanced-toggle"
          onClick={() => setAdvancedExpanded(!advancedExpanded)}
        >
          <span className={`arrow ${advancedExpanded ? 'expanded' : ''}`}>▶</span>
          Advanced Settings
        </button>

        {advancedExpanded && (
          <div className="advanced-content">
            <div className="control-group">
              <label>
                <strong>Quality Level:</strong>
                <span className="control-value">{options.quality}</span>
              </label>
              <input
                type="range"
                min="0"
                max="4"
                value={options.quality}
                onChange={e =>
                  onChange({ ...options, quality: parseInt(e.target.value) })
                }
                disabled={isComputing}
              />
              <div className="control-hint">
                Higher = better layout, slower computation
              </div>
            </div>

            <div className="control-group">
              <label>
                <strong>Component Separation:</strong>
                <span className="control-value">
                  {options.componentSeparation.toFixed(1)}
                </span>
              </label>
              <input
                type="range"
                min="5"
                max="50"
                step="5"
                value={options.componentSeparation}
                onChange={e =>
                  onChange({
                    ...options,
                    componentSeparation: parseFloat(e.target.value),
                  })
                }
                disabled={isComputing}
              />
            </div>

            <div className="control-group">
              <label>
                <strong>Node Length Per Megabase:</strong>
                <span className="control-value">
                  {options.nodeLengthPerMegabase.toFixed(0)}
                </span>
              </label>
              <input
                type="range"
                min="500"
                max="5000"
                step="500"
                value={options.nodeLengthPerMegabase}
                onChange={e =>
                  onChange({
                    ...options,
                    nodeLengthPerMegabase: parseFloat(e.target.value),
                  })
                }
                disabled={isComputing}
              />
              <div className="control-hint">
                Controls visual scale based on sequence length
              </div>
            </div>
          </div>
        )}
      </div>

      <button
        className="compute-button"
        onClick={onCompute}
        disabled={isComputing}
      >
        {isComputing ? 'Redrawing...' : 'Redraw'}
      </button>
    </div>
  )
}
