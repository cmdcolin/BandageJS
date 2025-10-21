/**
 * Node.js Example - Varied Length Assembly Graph
 * Demonstrates layout of graphs with realistic sequence length variation
 */

import { BandageLayout } from '../js/bandage-layout-wrapper.js';

// Realistic bacterial assembly graph with varied contig lengths
const bacterialAssembly = {
    nodes: [
        // Very long contigs (main chromosome)
        { id: "1+", name: "CONTIG_1", length: 456789, depth: 42.5 },
        { id: "1-", name: "CONTIG_1", length: 456789, depth: 42.5 },

        // Medium contigs
        { id: "2+", name: "CONTIG_2", length: 123456, depth: 41.8 },
        { id: "2-", name: "CONTIG_2", length: 123456, depth: 41.8 },
        { id: "3+", name: "CONTIG_3", length: 234567, depth: 43.2 },
        { id: "3-", name: "CONTIG_3", length: 234567, depth: 43.2 },

        // Short contig (potential misassembly or repetitive region)
        { id: "4+", name: "CONTIG_4", length: 8765, depth: 85.6 },
        { id: "4-", name: "CONTIG_4", length: 8765, depth: 85.6 },

        // Medium-long contig
        { id: "5+", name: "CONTIG_5", length: 345678, depth: 44.1 },
        { id: "5-", name: "CONTIG_5", length: 345678, depth: 44.1 },

        // Very short contig (rRNA or repeat)
        { id: "6+", name: "CONTIG_6", length: 1543, depth: 120.3 },
        { id: "6-", name: "CONTIG_6", length: 1543, depth: 120.3 }
    ],
    edges: [
        { from: "1+", to: "2+", overlap: 127 },
        { from: "2-", to: "1-", overlap: 127 },
        { from: "2+", to: "3+", overlap: 98 },
        { from: "3-", to: "2-", overlap: 98 },
        { from: "3+", to: "4+", overlap: 45 },
        { from: "4-", to: "3-", overlap: 45 },
        { from: "4+", to: "5+", overlap: 76 },
        { from: "5-", to: "4-", overlap: 76 },
        { from: "5+", to: "6+", overlap: 0 },
        { from: "6-", to: "5-", overlap: 0 },
        { from: "6+", to: "1+", overlap: 0 }  // Circular chromosome
    ]
};

// Plasmid with very different scale
const plasmidGraph = {
    nodes: [
        { id: "P1+", name: "PLASMID_1", length: 5678, depth: 95.2 },
        { id: "P1-", name: "PLASMID_1", length: 5678, depth: 95.2 },
        { id: "P2+", name: "PLASMID_2", length: 12345, depth: 98.7 },
        { id: "P2-", name: "PLASMID_2", length: 12345, depth: 98.7 },
        { id: "P3+", name: "PLASMID_3", length: 890, depth: 102.4 },  // Very short
        { id: "P3-", name: "PLASMID_3", length: 890, depth: 102.4 },
        { id: "P4+", name: "PLASMID_4", length: 23456, depth: 96.1 },  // Longest in plasmid
        { id: "P4-", name: "PLASMID_4", length: 23456, depth: 96.1 }
    ],
    edges: [
        { from: "P1+", to: "P2+", overlap: 0 },
        { from: "P2-", to: "P1-", overlap: 0 },
        { from: "P2+", to: "P3+", overlap: 0 },
        { from: "P3-", to: "P2-", overlap: 0 },
        { from: "P3+", to: "P4+", overlap: 0 },
        { from: "P4-", to: "P3-", overlap: 0 },
        { from: "P4+", to: "P1+", overlap: 0 },  // Circular plasmid
        { from: "P1-", to: "P4-", overlap: 0 }
    ]
};

function analyzeGraph(graph, name) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Graph: ${name}`);
    console.log(`${'='.repeat(60)}`);

    // Calculate length statistics (only positive strand)
    const lengths = graph.nodes
        .filter(n => n.id.endsWith('+'))
        .map(n => n.length)
        .sort((a, b) => a - b);

    const totalLength = lengths.reduce((sum, l) => sum + l, 0);
    const minLength = lengths[0];
    const maxLength = lengths[lengths.length - 1];
    const avgLength = totalLength / lengths.length;
    const medianLength = lengths[Math.floor(lengths.length / 2)];

    console.log(`\nSequence Statistics:`);
    console.log(`  Contigs: ${lengths.length}`);
    console.log(`  Total Length: ${totalLength.toLocaleString()} bp`);
    console.log(`  Length Range: ${minLength.toLocaleString()} - ${maxLength.toLocaleString()} bp`);
    console.log(`  Length Ratio (max/min): ${(maxLength / minLength).toFixed(1)}:1`);
    console.log(`  Average Length: ${Math.round(avgLength).toLocaleString()} bp`);
    console.log(`  Median Length: ${medianLength.toLocaleString()} bp`);

    // Show individual contig info
    console.log(`\nContig Details:`);
    graph.nodes
        .filter(n => n.id.endsWith('+'))
        .sort((a, b) => b.length - a.length)
        .forEach(node => {
            const lengthKb = (node.length / 1000).toFixed(2);
            const depthStr = node.depth.toFixed(1);
            console.log(`  ${node.name.padEnd(12)} ${lengthKb.padStart(8)} kb    depth: ${depthStr.padStart(6)}x`);
        });
}

async function computeLayout(graph, graphName, options) {
    console.log(`\nComputing layout with quality ${options.quality}...`);

    const startTime = performance.now();
    const layout = new BandageLayout();
    await layout.init();

    const result = layout.computeLayout(graph, options);
    const endTime = performance.now();
    const duration = endTime - startTime;

    console.log(`Layout computed in ${duration.toFixed(2)}ms`);

    // Analyze the layout results
    console.log(`\nLayout Results:`);
    console.log(`  Total nodes positioned: ${Object.keys(result.nodePositions).length}`);

    // Calculate total segments (shows how node length affects representation)
    let totalSegments = 0;
    for (const [nodeId, segments] of Object.entries(result.nodePositions)) {
        if (nodeId.endsWith('+')) {
            const node = graph.nodes.find(n => n.id === nodeId);
            totalSegments += segments.length;
            console.log(`  ${node.name.padEnd(12)}: ${segments.length.toString().padStart(3)} segments`);
        }
    }
    console.log(`  Total segments: ${totalSegments}`);

    // Show a sample of positions
    console.log(`\nSample Node Positions:`);
    const sampleNodes = Object.keys(result.nodePositions)
        .filter(id => id.endsWith('+'))
        .slice(0, 3);

    for (const nodeId of sampleNodes) {
        const node = graph.nodes.find(n => n.id === nodeId);
        const segments = result.nodePositions[nodeId];
        console.log(`\n  ${node.name} (${node.length.toLocaleString()} bp, ${segments.length} segments):`);

        // Show first and last position
        if (segments.length > 0) {
            const first = segments[0];
            const last = segments[segments.length - 1];
            console.log(`    Start: (${first.x.toFixed(2)}, ${first.y.toFixed(2)})`);
            console.log(`    End:   (${last.x.toFixed(2)}, ${last.y.toFixed(2)})`);

            // Calculate total drawn length
            let drawnLength = 0;
            for (let i = 1; i < segments.length; i++) {
                const dx = segments[i].x - segments[i-1].x;
                const dy = segments[i].y - segments[i-1].y;
                drawnLength += Math.sqrt(dx * dx + dy * dy);
            }
            console.log(`    Drawn length: ${drawnLength.toFixed(2)} units`);
        }
    }

    return result;
}

async function main() {
    console.log('\n' + '='.repeat(60));
    console.log('Bandage Layout - Varied Sequence Lengths Demo');
    console.log('='.repeat(60));

    // Layout options optimized for varied lengths
    const layoutOptions = {
        quality: 2,
        linearLayout: false,
        componentSeparation: 20.0,
        aspectRatio: 1.5,
        nodeLengthPerMegabase: 2000.0,  // Controls how length affects visual size
        minimumNodeLength: 3.0,           // Minimum display length for tiny contigs
        nodeSegmentLength: 5.0,           // Length of each segment
        edgeLength: 2.0
    };

    try {
        // Process bacterial assembly
        analyzeGraph(bacterialAssembly, 'Bacterial Chromosome Assembly');
        await computeLayout(bacterialAssembly, 'Bacterial Assembly', layoutOptions);

        // Process plasmid with different scale
        analyzeGraph(plasmidGraph, 'Plasmid Assembly');
        const plasmidOptions = {
            ...layoutOptions,
            nodeLengthPerMegabase: 5000.0,  // Larger scale for smaller sequences
            minimumNodeLength: 2.0
        };
        await computeLayout(plasmidGraph, 'Plasmid', plasmidOptions);

        console.log(`\n${'='.repeat(60)}`);
        console.log('Key Observations:');
        console.log('='.repeat(60));
        console.log('1. Longer contigs are drawn with more segments');
        console.log('2. Very short contigs get minimum length (minimumNodeLength)');
        console.log('3. nodeLengthPerMegabase controls length-to-visual-size scaling');
        console.log('4. Segment count affects layout smoothness vs performance');
        console.log('5. High-depth contigs (repeats) shown with high coverage values');
        console.log(`${'='.repeat(60)}\n`);

    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

main();
