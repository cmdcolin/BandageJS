import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { GraphCanvas } from './components/GraphCanvas'
import { LengthDistribution } from './components/LengthDistribution'
import { LayoutControls } from './components/LayoutControls'
import { StatsPanel } from './components/StatsPanel'
import { exampleGraphs } from './data/exampleGraphs'
import { BandageLayoutWorker } from './utils/BandageLayoutWorker'
import { parseGFA } from './utils/gfaParser'
import { convertGFAToGraph } from './utils/gfaConverter'
import type { LayoutOptions, LayoutResult, ColorScheme, Graph } from './types'
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
  const [urlDialogOpen, setUrlDialogOpen] = useState(false)
  const [urlInput, setUrlInput] = useState('')
  const [loadingFile, setLoadingFile] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [importedGraphs, setImportedGraphs] = useState<Record<string, Graph>>({})
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('darkMode')
    return saved !== null ? JSON.parse(saved) : true
  })
  const [colorScheme, setColorScheme] = useState<ColorScheme>('random')

  // Get all available graphs (examples + imported) - memoized to prevent re-renders
  const allGraphs = useMemo(
    () => ({ ...exampleGraphs, ...importedGraphs }),
    [importedGraphs],
  )

  // Handle loading GFA from text
  const loadGFAFromText = (text: string, filename: string) => {
    try {
      setLoadingFile(true)
      setLoadError(null)

      const gfaGraph = parseGFA(text)
      const graph = convertGFAToGraph(gfaGraph, filename)

      // Generate unique key for imported graph
      const key = `imported_${Date.now()}`
      setImportedGraphs(prev => ({ ...prev, [key]: graph }))
      setSelectedGraphKey(key)
      setFileMenuOpen(false)
    } catch (error) {
      console.error('Failed to parse GFA:', error)
      setLoadError(
        error instanceof Error ? error.message : 'Failed to parse GFA file',
      )
    } finally {
      setLoadingFile(false)
    }
  }

  // Handle loading from URL
  const handleLoadFromURL = async () => {
    if (!urlInput.trim()) return

    try {
      setLoadingFile(true)
      setLoadError(null)

      const response = await fetch(urlInput)
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const text = await response.text()
      const filename = urlInput.split('/').pop() || 'URL Graph'
      loadGFAFromText(text, filename)
      setUrlDialogOpen(false)
      setUrlInput('')
    } catch (error) {
      console.error('Failed to load from URL:', error)
      setLoadError(
        error instanceof Error ? error.message : 'Failed to load from URL',
      )
    } finally {
      setLoadingFile(false)
    }
  }

  // Handle loading from local file
  const handleLoadFromFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = e => {
      const text = e.target?.result as string
      if (text) {
        loadGFAFromText(text, file.name)
      }
    }
    reader.onerror = () => {
      setLoadError('Failed to read file')
    }
    reader.readAsText(file)

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

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
  const computeLayout = useCallback(async () => {
    if (!worker || !isWorkerReady) {
      console.warn('Worker not ready')
      return
    }

    setIsComputing(true)
    try {
      const graph = allGraphs[selectedGraphKey]
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
  }, [worker, isWorkerReady, allGraphs, selectedGraphKey, layoutOptions])

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
        const graph = allGraphs[selectedGraphKey]
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Close URL dialog with Escape key
  useEffect(() => {
    if (!urlDialogOpen) return

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setUrlDialogOpen(false)
        setLoadError(null)
        setUrlInput('')
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [urlDialogOpen])

  // Save dark mode preference to localStorage
  useEffect(() => {
    localStorage.setItem('darkMode', JSON.stringify(isDarkMode))
  }, [isDarkMode])

  const currentGraph = allGraphs[selectedGraphKey]

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
                File
              </button>
              {fileMenuOpen && (
                <div className="dropdown-menu">
                  <button
                    className="dropdown-item"
                    onClick={() => {
                      setUrlDialogOpen(true)
                      setFileMenuOpen(false)
                    }}
                  >
                    <div className="dropdown-item-title">Open URL</div>
                    <div className="dropdown-item-desc">
                      Load GFA from a URL
                    </div>
                  </button>
                  <button
                    className="dropdown-item"
                    onClick={() => {
                      fileInputRef.current?.click()
                      setFileMenuOpen(false)
                    }}
                  >
                    <div className="dropdown-item-title">Open Local File</div>
                    <div className="dropdown-item-desc">
                      Load GFA from your computer
                    </div>
                  </button>
                  <div className="dropdown-header">EXAMPLES</div>
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
                  {Object.keys(importedGraphs).length > 0 && (
                    <>
                      <div className="dropdown-header">IMPORTED</div>
                      {Object.entries(importedGraphs).map(([key, graph]) => (
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
                    </>
                  )}
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

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".gfa,.gfa1,.gfa2"
        style={{ display: 'none' }}
        onChange={handleLoadFromFile}
      />

      {/* URL Dialog */}
      {urlDialogOpen && (
        <div
          className="dialog-overlay"
          onClick={() => {
            setUrlDialogOpen(false)
            setLoadError(null)
            setUrlInput('')
          }}
        >
          <div className="dialog-content" onClick={e => e.stopPropagation()}>
            <div className="dialog-header">
              <h2>Open GFA from URL</h2>
              <button
                className="dialog-close"
                onClick={() => {
                  setUrlDialogOpen(false)
                  setLoadError(null)
                  setUrlInput('')
                }}
              >
                ×
              </button>
            </div>
            <div className="dialog-body">
              <div style={{ marginBottom: '15px' }}>
                <label
                  htmlFor="url-input"
                  style={{
                    display: 'block',
                    marginBottom: '8px',
                    fontWeight: 500,
                  }}
                >
                  GFA File URL:
                </label>
                <input
                  id="url-input"
                  type="text"
                  value={urlInput}
                  onChange={e => setUrlInput(e.target.value)}
                  placeholder="https://example.com/graph.gfa"
                  disabled={loadingFile}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !loadingFile) {
                      handleLoadFromURL()
                    }
                  }}
                  style={{
                    width: '100%',
                    padding: '8px',
                    fontSize: '14px',
                    border: isDarkMode ? '1px solid #444' : '1px solid #ddd',
                    borderRadius: '4px',
                    background: isDarkMode ? '#1a1a1a' : 'white',
                    color: isDarkMode ? '#e0e0e0' : '#333',
                  }}
                />
              </div>
              {loadError && (
                <div
                  style={{
                    padding: '10px',
                    marginBottom: '15px',
                    background: '#fee',
                    border: '1px solid #fcc',
                    borderRadius: '4px',
                    color: '#c33',
                    fontSize: '13px',
                  }}
                >
                  {loadError}
                </div>
              )}
              <div
                style={{
                  display: 'flex',
                  gap: '10px',
                  justifyContent: 'flex-end',
                }}
              >
                <button
                  onClick={() => {
                    setUrlDialogOpen(false)
                    setLoadError(null)
                    setUrlInput('')
                  }}
                  disabled={loadingFile}
                  style={{
                    padding: '8px 16px',
                    fontSize: '14px',
                    border: isDarkMode ? '1px solid #444' : '1px solid #ddd',
                    borderRadius: '4px',
                    background: isDarkMode ? '#2a2a2a' : '#f5f5f5',
                    color: isDarkMode ? '#e0e0e0' : '#333',
                    cursor: loadingFile ? 'not-allowed' : 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleLoadFromURL}
                  disabled={loadingFile || !urlInput.trim()}
                  style={{
                    padding: '8px 16px',
                    fontSize: '14px',
                    border: 'none',
                    borderRadius: '4px',
                    background:
                      loadingFile || !urlInput.trim() ? '#ccc' : '#0066cc',
                    color: 'white',
                    cursor:
                      loadingFile || !urlInput.trim()
                        ? 'not-allowed'
                        : 'pointer',
                  }}
                >
                  {loadingFile ? 'Loading...' : 'Load'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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
