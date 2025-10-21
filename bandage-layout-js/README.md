# Bandage Layout JS

WebAssembly port of Bandage graph layout engine for JavaScript/TypeScript.

## Overview

This is a high-performance WebAssembly compilation of the Bandage graph layout algorithm using OGDF (Open Graph Drawing Framework) and Emscripten. It provides near-native C++ performance for laying out De Bruijn assembly graphs in web applications.

## Features

- **Fast**: Compiled to WebAssembly for ~90-95% native C++ performance
- **Web Worker Support**: Non-blocking graph layout in background threads
- **OGDF FMMM Algorithm**: Uses the proven Fast Multipole Multilevel Method for force-directed layout
- **Minimal Dependencies**: Self-contained WASM module

## Architecture

```
├── src/           # C++ source files (Qt-free port)
├── include/       # C++ headers
├── build/         # Emscripten build output
├── js/            # JavaScript/TypeScript wrapper and Web Worker
├── examples/      # Usage examples
└── tests/         # Test files
```

## Dependencies Analysis

### Removed Qt Dependencies
- `QPointF` → `Point {double x, y}`
- `QString` → `std::string`
- `QList/QVector` → `std::vector`
- `QFile/QJson` → Custom JSON parser/writer
- `QFuture/QtConcurrent` → Removed (handled by Web Worker)

### Compiled with WASM
- OGDF library (force-directed layout algorithms)
- Minimal graph data structures
- Layout computation core

### Parameters (configurable from JS)
- `graphLayoutQuality`: 0-4 (controls iteration count)
- `useLinearLayout`: boolean
- `componentSeparation`: double
- `aspectRatio`: double
- `nodeLengthPerMegabase`: double
- `minimumNodeLength`: double
- `nodeSegmentLength`: double
- `edgeLength`: double

## Building

```bash
cd bandage-layout-js
./build.sh
```

Requires:
- Emscripten SDK (emsdk)
- CMake 3.10+
- OGDF library (included as submodule)

## Usage

### In Browser (Main Thread)

```javascript
import { BandageLayout } from './js/bandage-layout.js';

const layout = new BandageLayout();
await layout.init();

const result = layout.computeLayout(graphData, {
  quality: 2,
  linearLayout: false,
  componentSeparation: 15.0
});

console.log(result.nodePositions);
```

### With Web Worker (Recommended)

```javascript
import { BandageLayoutWorker } from './js/bandage-layout-worker.js';

const worker = new BandageLayoutWorker();

worker.onProgress((progress) => {
  console.log(`Layout: ${progress}%`);
});

const result = await worker.computeLayout(graphData, options);
console.log(result.nodePositions);
```

## Graph Data Format

Input graph structure:
```javascript
{
  nodes: [
    { id: "1+", name: "NODE_1", length: 5000, depth: 12.5 },
    { id: "1-", name: "NODE_1", length: 5000, depth: 12.5 },
    // ...
  ],
  edges: [
    { from: "1+", to: "2+", overlap: 0, type: "normal" },
    // ...
  ]
}
```

Output layout:
```javascript
{
  nodePositions: {
    "1+": [{ x: 0.0, y: 0.0 }, { x: 10.5, y: 0.2 }], // segment points
    "2+": [{ x: 12.0, y: 0.5 }, { x: 22.3, y: 1.1 }],
    // ...
  }
}
```

## Performance

Expected performance for typical assembly graphs:
- Small graphs (<1000 nodes): <100ms
- Medium graphs (1000-5000 nodes): 100ms-1s
- Large graphs (5000-10000 nodes): 1-5s
- Very large graphs (>10000 nodes): 5-30s

Performance is ~90-95% of native C++ Bandage.

## License

GPLv3 (same as Bandage)
