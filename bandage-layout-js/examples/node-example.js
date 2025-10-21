/**
 * Node.js Example for Bandage Layout
 * Shows how to use the library in a Node.js environment
 *
 * Note: Requires Node.js with WebAssembly support (v12+)
 */

import { BandageLayout } from '../js/bandage-layout-wrapper.js';

// Sample graph data
const sampleGraph = {
    nodes: [
        { id: "1+", name: "NODE_1", length: 50000, depth: 12.5 },
        { id: "1-", name: "NODE_1", length: 50000, depth: 12.5 },
        { id: "2+", name: "NODE_2", length: 75000, depth: 10.2 },
        { id: "2-", name: "NODE_2", length: 75000, depth: 10.2 },
        { id: "3+", name: "NODE_3", length: 30000, depth: 15.8 },
        { id: "3-", name: "NODE_3", length: 30000, depth: 15.8 }
    ],
    edges: [
        { from: "1+", to: "2+", overlap: 0 },
        { from: "2-", to: "1-", overlap: 0 },
        { from: "2+", to: "3+", overlap: 0 },
        { from: "3-", to: "2-", overlap: 0 }
    ]
};

const layoutOptions = {
    quality: 2,              // 0-4 (higher = better quality but slower)
    linearLayout: false,     // true = linear layout, false = force-directed
    componentSeparation: 20.0,
    aspectRatio: 1.5,
    nodeLengthPerMegabase: 2000.0,
    minimumNodeLength: 5.0,
    nodeSegmentLength: 5.0,
    edgeLength: 3.0
};

async function main() {
    console.log('Initializing Bandage Layout...');

    const layout = new BandageLayout();
    await layout.init();

    console.log('Computing layout...');
    const startTime = performance.now();

    const result = layout.computeLayout(sampleGraph, layoutOptions);

    const endTime = performance.now();
    const duration = endTime - startTime;

    console.log(`Layout computed in ${duration.toFixed(2)}ms`);
    console.log('\nNode positions:');

    for (const [nodeId, segments] of Object.entries(result.nodePositions)) {
        console.log(`\n${nodeId}:`);
        segments.forEach((point, i) => {
            console.log(`  Segment ${i}: (${point.x.toFixed(2)}, ${point.y.toFixed(2)})`);
        });
    }

    // Export to JSON
    console.log('\nFull result:');
    console.log(JSON.stringify(result, null, 2));
}

main().catch(error => {
    console.error('Error:', error);
    process.exit(1);
});
