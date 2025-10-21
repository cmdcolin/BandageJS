// Mock layout worker for development before WASM is built
// Generates fake layout positions for testing the UI

export class MockBandageLayoutWorker {
  constructor() {
    this._ready = Promise.resolve();
  }

  async ready() {
    return this._ready;
  }

  async computeLayout(graph, options) {
    const startTime = performance.now();

    // Simulate computation delay based on graph size
    const nodeCount = graph.nodes.length;
    const delay = Math.min(100 + nodeCount * 2, 1000);
    await new Promise(resolve => setTimeout(resolve, delay));

    // Generate mock positions in a circular layout
    const nodePositions = {};
    const uniqueNodes = graph.nodes.filter(n => n.id.endsWith('+'));
    const angleStep = (2 * Math.PI) / uniqueNodes.length;

    uniqueNodes.forEach((node, index) => {
      const angle = index * angleStep;
      const radius = 100;

      // Create segments based on node length
      const segmentCount = Math.max(3, Math.floor(node.length / 10000));
      const segments = [];

      for (let i = 0; i < segmentCount; i++) {
        const t = i / (segmentCount - 1);
        const x = Math.cos(angle) * radius + t * 20 - 10;
        const y = Math.sin(angle) * radius + t * 20 - 10;
        segments.push({ x, y });
      }

      nodePositions[node.id] = segments;

      // Create reverse complement positions
      const rcId = node.id.replace('+', '-');
      nodePositions[rcId] = segments.map(s => ({
        x: s.x + 5,
        y: s.y + 5
      }));
    });

    const duration = performance.now() - startTime;

    return {
      result: {
        nodePositions,
        componentCount: 1
      },
      duration
    };
  }

  terminate() {
    // Mock terminate
  }
}
