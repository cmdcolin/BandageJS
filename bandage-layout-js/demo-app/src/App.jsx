import { useState, useEffect } from 'react';
import { GraphCanvas } from './components/GraphCanvas';
import { LengthDistribution } from './components/LengthDistribution';
import { GraphSelector } from './components/GraphSelector';
import { LayoutControls } from './components/LayoutControls';
import { StatsPanel } from './components/StatsPanel';
import { exampleGraphs } from './data/exampleGraphs';
import { BandageLayoutWorker } from './utils/BandageLayoutWorker';
import './App.css';

function App() {
  const [selectedGraphKey, setSelectedGraphKey] = useState('simple');
  const [layoutOptions, setLayoutOptions] = useState({
    quality: 2,
    linearLayout: false,
    componentSeparation: 15.0,
    aspectRatio: 1.5,
    nodeLengthPerMegabase: 2000.0,
    minimumNodeLength: 3.0,
    nodeSegmentLength: 5.0,
    edgeLength: 2.0
  });
  const [layoutResult, setLayoutResult] = useState(null);
  const [layoutDuration, setLayoutDuration] = useState(null);
  const [isComputing, setIsComputing] = useState(false);
  const [worker, setWorker] = useState(null);
  const [isWorkerReady, setIsWorkerReady] = useState(false);
  const [workerError, setWorkerError] = useState(null);

  // Initialize worker
  useEffect(() => {
    const initWorker = async () => {
      try {
        console.log('Loading WASM layout engine...');
        const layoutWorker = new BandageLayoutWorker();
        await layoutWorker.ready();
        console.log('✓ WASM layout engine ready');
        setWorker(layoutWorker);
        setIsWorkerReady(true);
      } catch (error) {
        console.error('Failed to initialize WASM worker:', error);
        setWorkerError(error.message);
      }
    };

    initWorker();

    return () => {
      if (worker) {
        worker.terminate();
      }
    };
  }, []);

  // Compute layout when graph or options change
  const computeLayout = async () => {
    if (!worker || !isWorkerReady) {
      console.warn('Worker not ready');
      return;
    }

    setIsComputing(true);
    try {
      const graph = exampleGraphs[selectedGraphKey];
      const { result, duration } = await worker.computeLayout(graph, layoutOptions);
      setLayoutResult(result);
      setLayoutDuration(duration);
    } catch (error) {
      console.error('Layout computation failed:', error);
    } finally {
      setIsComputing(false);
    }
  };

  // Auto-compute on graph change
  useEffect(() => {
    if (isWorkerReady) {
      computeLayout();
    }
  }, [selectedGraphKey, isWorkerReady]);

  const currentGraph = exampleGraphs[selectedGraphKey];

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
    );
  }

  // Show error screen if initialization failed
  if (workerError) {
    return (
      <div className="app">
        <div className="init-error">
          <h2>Failed to Load Layout Engine</h2>
          <p>Error: {workerError}</p>
          <p>Make sure WASM files are present in <code>public/js/</code>:</p>
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
    );
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>Bandage Layout Demo</h1>
        <p className="subtitle">
          Interactive assembly graph visualization with varied sequence lengths
        </p>
      </header>

      <main className="app-main">
        <div className="left-panel">
          <GraphSelector
            selectedGraph={selectedGraphKey}
            onSelectGraph={setSelectedGraphKey}
          />

          <LayoutControls
            options={layoutOptions}
            onChange={setLayoutOptions}
            onCompute={computeLayout}
            isComputing={isComputing}
          />

          <StatsPanel
            graph={currentGraph}
            layoutDuration={layoutDuration}
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
                width={800}
                height={600}
              />
            ) : (
              <div className="placeholder">
                <p>Click "Compute Layout" to visualize the graph</p>
              </div>
            )}
          </div>

          <div className="visualization-section">
            <h3>Length Distribution</h3>
            <LengthDistribution
              graph={currentGraph}
              width={800}
              height={200}
            />
          </div>
        </div>
      </main>

      <footer className="app-footer">
        <p>✓ Layout engine ready - OGDF + FMMM algorithm</p>
      </footer>
    </div>
  );
}

export default App;
