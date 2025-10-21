# Quick Start Guide

Get started with Bandage Layout JS in 5 minutes.

## Installation & Build

```bash
# 1. Install Emscripten (if not already installed)
git clone https://github.com/emscripten-core/emsdk.git
cd emsdk
./emsdk install latest
./emsdk activate latest
source ./emsdk_env.sh

# 2. Build Bandage Layout JS
cd /path/to/BandageNG/bandage-layout-js
./build.sh

# This will take 6-17 minutes on first build
# (OGDF compilation is the slowest part)
```

## Quick Test

### Browser (Recommended for first test)

```bash
# Start local server
python3 -m http.server 8080

# Open in browser:
# http://localhost:8080/examples/basic-usage.html

# Click "Compute Layout (Web Worker)" button
```

### Node.js

```bash
node examples/node-example.js
```

## Basic Usage

### Main Thread (Simple)

```javascript
import { BandageLayout } from './js/bandage-layout-wrapper.js';

// Create and initialize
const layout = new BandageLayout();
await layout.init();

// Define your graph
const graph = {
    nodes: [
        { id: "1+", name: "NODE_1", length: 50000, depth: 12.5 },
        { id: "1-", name: "NODE_1", length: 50000, depth: 12.5 },
        // ... more nodes
    ],
    edges: [
        { from: "1+", to: "2+", overlap: 0 },
        // ... more edges
    ]
};

// Compute layout
const result = layout.computeLayout(graph, {
    quality: 2,           // 0-4
    linearLayout: false
});

// Use positions
console.log(result.nodePositions);
```

### Web Worker (Recommended for large graphs)

```javascript
import { BandageLayoutWorker } from './js/bandage-layout-worker-interface.js';

const worker = new BandageLayoutWorker();
await worker.ready();

const { result, duration } = await worker.computeLayout(graph, options,
    (progress) => {
        console.log(`Progress: ${progress.progress}%`);
    }
);

console.log(`Layout completed in ${duration}ms`);
console.log(result.nodePositions);
```

## Common Options

```javascript
const options = {
    quality: 2,                    // 0-4 (default: 1)
    linearLayout: false,           // true/false (default: false)
    componentSeparation: 15.0,     // Space between components
    aspectRatio: 1.333333,         // Desired aspect ratio
    nodeLengthPerMegabase: 1000.0, // Node length scaling
    minimumNodeLength: 1.0,        // Min node length
    nodeSegmentLength: 1.0,        // Segment length
    edgeLength: 1.0                // Edge length
};
```

## Quality Levels

- **0**: Fastest (3 iterations) - for previews
- **1**: Fast (15 iterations) - good for interactive use
- **2**: Balanced (30 iterations) - recommended default
- **3**: High quality (60 iterations) - for final output
- **4**: Maximum (120 iterations) - for publication

## Performance Tips

1. **Use Web Worker** for graphs with >500 nodes
2. **Start with quality 0-1** for initial layout, then recompute with higher quality
3. **Enable linearLayout** if your graph is primarily linear
4. **Adjust componentSeparation** if components overlap

## Troubleshooting

### "Module not found"
Make sure you're serving files over HTTP (not file://)

### Layout too slow
- Reduce quality (0-1 for preview)
- Use Web Worker
- Check graph size (>10000 nodes may take 30+ seconds)

### Nodes overlapping
- Increase componentSeparation
- Increase quality
- Adjust aspectRatio

### Memory errors
- Split large graphs into smaller components
- Increase WASM memory limit (see BUILDING.md)

## Next Steps

- Read [README.md](README.md) for detailed documentation
- See [examples/](examples/) for more examples
- Check [BUILDING.md](BUILDING.md) for build customization

## Need Help?

- Check existing issues: [GitHub Issues](https://github.com/rrwick/Bandage/issues)
- For Bandage-specific questions, see original Bandage documentation
- For OGDF algorithm details, see [OGDF docs](https://ogdf.net/)
