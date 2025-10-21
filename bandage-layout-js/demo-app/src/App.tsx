import { useState, useEffect, useRef } from 'react'
import { GraphCanvas } from './components/GraphCanvas'
import { LengthDistribution } from './components/LengthDistribution'
import { LayoutControls } from './components/LayoutControls'
import { StatsPanel } from './components/StatsPanel'
import { exampleGraphs } from './data/exampleGraphs'
import { BandageLayoutWorker } from './utils/BandageLayoutWorker'
import type { LayoutOptions, LayoutResult, ColorScheme } from './types'
import './App.css'

function App() {
  const [selectedGraphKey, setSelectedGraphKey] = useState('simple')
  const [layoutOptions, setLayoutOptions] = useState<LayoutOptions>({
    quality: 2,
    linearLayout: false,
    componentSeparation: 15.0,
    aspectRatio: 1.5,
    nodeLengthPerMegabase: 2000.0,
    minimumNodeLength: 3.0,
    nodeSegmentLength: 5.0,
    edgeLength: 2.0,
  })
  const [layoutResult, setLayoutResult] = useState<LayoutResult | null>(null)
  const [layoutDuration, setLayoutDuration] = useState<number | null>(null)
  const [isComputing, setIsComputing] = useState(false)
  const [worker, setWorker] = useState<BandageLayoutWorker | null>(null)
  const [isWorkerReady, setIsWorkerReady] = useState(false)
  const [workerError, setWorkerError] = useState<string | null>(null)
  const [fileMenuOpen, setFileMenuOpen] = useState(false)
  const [viewMenuOpen, setViewMenuOpen] = useState(false)
  const [statsDialogOpen, setStatsDialogOpen] = useState(false)
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('darkMode')
    return saved !== null ? JSON.parse(saved) : true
  })
  const [colorScheme, setColorScheme] = useState<ColorScheme>('random')

  // Initialize worker
  useEffect(() => {
    const initWorker = async () => {
      try {
        console.log('Loading WASM layout engine...')
        const layoutWorker = new BandageLayoutWorker()
        await layoutWorker.ready()
        console.log('✓ WASM layout engine ready')
        setWorker(layoutWorker)
        setIsWorkerReady(true)
      } catch (error) {
        console.error('Failed to initialize WASM worker:', error)
        setWorkerError((error as Error).message)
      }
    }

    initWorker()

    return () => {
      if (worker) {
        worker.terminate()
      }
    }
  }, [])

  // Compute layout when graph or options change
  const computeLayout = async () => {
    if (!worker || !isWorkerReady) {
      console.warn('Worker not ready')
      return
    }

    setIsComputing(true)
    try {
      const graph = exampleGraphs[selectedGraphKey]
      if (!graph) return

      const { result, duration } = await worker.computeLayout(
        graph,
        layoutOptions,
      )
      setLayoutResult(result)
      setLayoutDuration(duration)
    } catch (error) {
      console.error('Layout computation failed:', error)
    } finally {
      setIsComputing(false)
    }
  }

  // Use a ref to track the current request ID
  const requestIdRef = useRef(0)

  // Auto-compute on graph change (but not on layout options change)
  useEffect(() => {
    if (!isWorkerReady || !worker) return

    // Increment request ID for this new computation
    const currentRequestId = ++requestIdRef.current

    const runLayout = async () => {
      setIsComputing(true)
      try {
        const graph = exampleGraphs[selectedGraphKey]
        if (!graph) return

        const { result, duration } = await worker.computeLayout(
          graph,
          layoutOptions,
        )

        // Only update state if this is still the latest request
        if (currentRequestId === requestIdRef.current) {
          setLayoutResult(result)
          setLayoutDuration(duration)
          setIsComputing(false)
        }
      } catch (error) {
        if (currentRequestId === requestIdRef.current) {
          console.error('Layout computation failed:', error)
          setIsComputing(false)
        }
      }
    }

    runLayout()
  }, [selectedGraphKey, isWorkerReady, worker])

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!fileMenuOpen && !viewMenuOpen) return

    const handleClickOutside = (e: MouseEvent) => {
      if (!(e.target as Element).closest('.menu-item')) {
        setFileMenuOpen(false)
        setViewMenuOpen(false)
      }
    }

    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [fileMenuOpen, viewMenuOpen])

  // Close dialog with Escape key
  useEffect(() => {
    if (!statsDialogOpen) return

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setStatsDialogOpen(false)
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [statsDialogOpen])

  // Save dark mode preference to localStorage
  useEffect(() => {
    localStorage.setItem('darkMode', JSON.stringify(isDarkMode))
  }, [isDarkMode])

  const currentGraph = exampleGraphs[selectedGraphKey]

  // Show loading screen while initializing
  if (!isWorkerReady && !workerError) {
    return (
      <div className="app">
        <div className="init-loading">
          <div className="spinner"></div>
          <h2>Loading WASM Layout Engine...</h2>
          <p>Initializing WebAssembly module with OGDF + FMMM algorithm</p>
        </div>
      </div>
    )
  }

  // Show error screen if initialization failed
  if (workerError) {
    return (
      <div className="app">
        <div className="init-error">
          <h2>Failed to Load Layout Engine</h2>
          <p>Error: {workerError}</p>
          <p>
            Make sure WASM files are present in <code>public/js/</code>:
          </p>
          <ul>
            <li>bandage-layout.wasm</li>
            <li>bandage-layout.js</li>
            <li>bandage-layout.worker.js</li>
            <li>bandage-layout-wrapper.js</li>
            <li>bandage-layout-worker-interface.js</li>
          </ul>
          <button onClick={() => window.location.reload()}>Retry</button>
        </div>
      </div>
    )
  }

  if (!currentGraph) {
    return <div className="app">Graph not found</div>
  }

  return (
    <div className={`app ${isDarkMode ? 'dark-mode' : ''}`}>
      <header className="app-header">
        <div className="header-top">
          <h1>BandageJS</h1>
          <div className="menu-bar">
            <div className="menu-item">
              <button
                className="menu-button"
                onClick={() => setFileMenuOpen(!fileMenuOpen)}
              >
                Examples
              </button>
              {fileMenuOpen && (
                <div className="dropdown-menu">
                  {Object.entries(exampleGraphs).map(([key, graph]) => (
                    <button
                      key={key}
                      className={`dropdown-item ${selectedGraphKey === key ? 'active' : ''}`}
                      onClick={() => {
                        setSelectedGraphKey(key)
                        setFileMenuOpen(false)
                      }}
                    >
                      <div className="dropdown-item-title">{graph.name}</div>
                      <div className="dropdown-item-desc">
                        {graph.description}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="menu-item">
              <button
                className="menu-button"
                onClick={() => setViewMenuOpen(!viewMenuOpen)}
              >
                View
              </button>
              {viewMenuOpen && (
                <div className="dropdown-menu">
                  <button
                    className="dropdown-item"
                    onClick={() => {
                      setStatsDialogOpen(true)
                      setViewMenuOpen(false)
                    }}
                  >
                    Statistics
                  </button>
                  <label className="dropdown-checkbox-item">
                    <input
                      type="checkbox"
                      checked={isDarkMode}
                      onChange={e => setIsDarkMode(e.target.checked)}
                    />
                    <span>Dark Mode</span>
                  </label>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="app-main">
        <div className="left-panel">
          <LayoutControls
            options={layoutOptions}
            onChange={setLayoutOptions}
            onCompute={computeLayout}
            isComputing={isComputing}
            colorScheme={colorScheme}
            onColorSchemeChange={setColorScheme}
          />
        </div>

        <div className="right-panel">
          <div className="visualization-section">
            <h3>Graph Layout</h3>
            {isComputing ? (
              <div className="loading">
                <div className="spinner"></div>
                <p>Computing layout...</p>
              </div>
            ) : layoutResult ? (
              <GraphCanvas
                layoutResult={layoutResult}
                graph={currentGraph}
                width={1200}
                height={800}
                isDarkMode={isDarkMode}
                colorScheme={colorScheme}
              />
            ) : (
              <div className="placeholder">
                <p>Click "Redraw" to visualize the graph</p>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Statistics Dialog */}
      {statsDialogOpen && (
        <div
          className="dialog-overlay"
          onClick={() => setStatsDialogOpen(false)}
        >
          <div className="dialog-content" onClick={e => e.stopPropagation()}>
            <div className="dialog-header">
              <h2>Graph Statistics</h2>
              <button
                className="dialog-close"
                onClick={() => setStatsDialogOpen(false)}
              >
                ×
              </button>
            </div>
            <div className="dialog-body">
              <StatsPanel
                graph={currentGraph}
                layoutDuration={layoutDuration}
              />
              <div className="stats-section">
                <h3>Length Distribution</h3>
                <LengthDistribution
                  graph={currentGraph}
                  width={700}
                  height={200}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
