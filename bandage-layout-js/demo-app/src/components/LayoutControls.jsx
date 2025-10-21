export function LayoutControls({ options, onChange, onCompute, isComputing }) {
  return (
    <div className="layout-controls">
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
          onChange={(e) => onChange({ ...options, quality: parseInt(e.target.value) })}
          disabled={isComputing}
        />
        <div className="control-hint">
          Higher = better layout, slower computation
        </div>
      </div>

      <div className="control-group">
        <label>
          <input
            type="checkbox"
            checked={options.linearLayout}
            onChange={(e) => onChange({ ...options, linearLayout: e.target.checked })}
            disabled={isComputing}
          />
          {' '}Linear Layout
        </label>
        <div className="control-hint">
          Use linear positioning instead of force-directed
        </div>
      </div>

      <div className="control-group">
        <label>
          <strong>Component Separation:</strong>
          <span className="control-value">{options.componentSeparation.toFixed(1)}</span>
        </label>
        <input
          type="range"
          min="5"
          max="50"
          step="5"
          value={options.componentSeparation}
          onChange={(e) => onChange({ ...options, componentSeparation: parseFloat(e.target.value) })}
          disabled={isComputing}
        />
      </div>

      <div className="control-group">
        <label>
          <strong>Node Length Per Megabase:</strong>
          <span className="control-value">{options.nodeLengthPerMegabase.toFixed(0)}</span>
        </label>
        <input
          type="range"
          min="500"
          max="5000"
          step="500"
          value={options.nodeLengthPerMegabase}
          onChange={(e) => onChange({ ...options, nodeLengthPerMegabase: parseFloat(e.target.value) })}
          disabled={isComputing}
        />
        <div className="control-hint">
          Controls visual scale based on sequence length
        </div>
      </div>

      <button
        className="compute-button"
        onClick={onCompute}
        disabled={isComputing}
      >
        {isComputing ? 'Redrawing...' : 'Redraw'}
      </button>
    </div>
  );
}
