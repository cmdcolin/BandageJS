import { useEffect, useRef } from 'react';

export function GraphCanvas({ layoutResult, graph, width = 800, height = 600 }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!layoutResult || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    // Set canvas resolution
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    ctx.scale(dpr, dpr);

    // Clear canvas
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, width, height);

    const { nodePositions } = layoutResult;

    // Calculate bounds for centering
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;

    Object.values(nodePositions).forEach(segments => {
      segments.forEach(({ x, y }) => {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      });
    });

    // Calculate scale and offset
    const graphWidth = maxX - minX;
    const graphHeight = maxY - minY;
    const padding = 40;
    const scale = Math.min(
      (width - 2 * padding) / graphWidth,
      (height - 2 * padding) / graphHeight
    );
    const offsetX = (width - graphWidth * scale) / 2 - minX * scale;
    const offsetY = (height - graphHeight * scale) / 2 - minY * scale;

    // Helper to transform coordinates
    const transform = (x, y) => ({
      x: x * scale + offsetX,
      y: y * scale + offsetY
    });

    // Draw edges
    graph.edges.forEach(edge => {
      const fromSegments = nodePositions[edge.from];
      const toSegments = nodePositions[edge.to];

      if (!fromSegments || !toSegments) return;

      const fromEnd = fromSegments[fromSegments.length - 1];
      const toStart = toSegments[0];

      if (!fromEnd || !toStart) return;

      const p1 = transform(fromEnd.x, fromEnd.y);
      const p2 = transform(toStart.x, toStart.y);

      ctx.strokeStyle = '#444';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    });

    // Draw nodes
    Object.entries(nodePositions).forEach(([nodeId, segments]) => {
      const node = graph.nodes.find(n => n.id === nodeId);
      if (!node) return;

      // Color based on strand
      const isPositive = nodeId.endsWith('+');
      const baseColor = isPositive ? [52, 152, 219] : [231, 76, 60]; // Blue for +, red for -

      // Adjust color based on depth
      const depthFactor = Math.min(node.depth / 50, 2);
      const color = baseColor.map(c => Math.min(255, Math.floor(c * depthFactor)));

      ctx.strokeStyle = `rgb(${color.join(',')})`;
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      ctx.beginPath();
      segments.forEach((segment, i) => {
        const p = transform(segment.x, segment.y);
        if (i === 0) {
          ctx.moveTo(p.x, p.y);
        } else {
          ctx.lineTo(p.x, p.y);
        }
      });
      ctx.stroke();

      // Draw node label if it's a positive strand and long enough
      if (isPositive && segments.length > 5) {
        const midIdx = Math.floor(segments.length / 2);
        const midPoint = transform(segments[midIdx].x, segments[midIdx].y);

        ctx.fillStyle = '#fff';
        ctx.font = '10px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(node.name, midPoint.x, midPoint.y - 5);
      }
    });

  }, [layoutResult, graph, width, height]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        border: '1px solid #333',
        borderRadius: '8px',
        backgroundColor: '#1a1a1a'
      }}
    />
  );
}
