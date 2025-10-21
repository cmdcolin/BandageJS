import { useEffect, useRef, useState, useCallback } from 'react';

export function GraphCanvas({ layoutResult, graph, width = 800, height = 600 }) {
  const canvasRef = useRef(null);
  const [transform, setTransform] = useState({ scale: 1, translateX: 0, translateY: 0 });
  const [hoveredNode, setHoveredNode] = useState(null);
  const [hoveredEdge, setHoveredEdge] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const boundsRef = useRef(null);

  // Calculate bounds once when layout changes
  useEffect(() => {
    if (!layoutResult) return;

    const { nodePositions } = layoutResult;
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

    const graphWidth = maxX - minX;
    const graphHeight = maxY - minY;
    const padding = 40;
    const fitScale = Math.min(
      (width - 2 * padding) / graphWidth,
      (height - 2 * padding) / graphHeight
    );
    const offsetX = (width - graphWidth * fitScale) / 2 - minX * fitScale;
    const offsetY = (height - graphHeight * fitScale) / 2 - minY * fitScale;

    boundsRef.current = { minX, maxX, minY, maxY, fitScale, offsetX, offsetY };
    setTransform({ scale: fitScale, translateX: offsetX, translateY: offsetY });
  }, [layoutResult, width, height]);

  // Drawing function
  const draw = useCallback(() => {
    if (!layoutResult || !canvasRef.current || !boundsRef.current) return;

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
    const { scale, translateX, translateY } = transform;

    // Helper to transform coordinates
    const transformPoint = (x, y) => ({
      x: x * scale + translateX,
      y: y * scale + translateY
    });

    // Draw edges
    graph.edges.forEach((edge, edgeIdx) => {
      const fromSegments = nodePositions[edge.from];
      const toSegments = nodePositions[edge.to];

      if (!fromSegments || !toSegments) return;

      const fromEnd = fromSegments[fromSegments.length - 1];
      const toStart = toSegments[0];

      if (!fromEnd || !toStart) return;

      const p1 = transformPoint(fromEnd.x, fromEnd.y);
      const p2 = transformPoint(toStart.x, toStart.y);

      const isHovered = hoveredEdge === edgeIdx;
      ctx.strokeStyle = isHovered ? '#888' : '#444';
      ctx.lineWidth = isHovered ? 2 : 1;
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

      const isHovered = hoveredNode === nodeId;
      const isSelected = selectedNode === nodeId;

      ctx.strokeStyle = `rgb(${color.join(',')})`;
      ctx.lineWidth = isSelected ? 5 : isHovered ? 4 : 3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // Add glow effect for hovered/selected
      if (isHovered || isSelected) {
        ctx.shadowColor = `rgba(${color.join(',')}, 0.8)`;
        ctx.shadowBlur = 10;
      }

      ctx.beginPath();
      segments.forEach((segment, i) => {
        const p = transformPoint(segment.x, segment.y);
        if (i === 0) {
          ctx.moveTo(p.x, p.y);
        } else {
          ctx.lineTo(p.x, p.y);
        }
      });
      ctx.stroke();

      // Reset shadow
      ctx.shadowBlur = 0;

      // Draw node label if it's a positive strand and long enough
      if (isPositive && segments.length > 5) {
        const midIdx = Math.floor(segments.length / 2);
        const midPoint = transformPoint(segments[midIdx].x, segments[midIdx].y);

        ctx.fillStyle = '#fff';
        ctx.font = '10px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(node.name, midPoint.x, midPoint.y - 5);
      }
    });

  }, [layoutResult, graph, width, height, transform, hoveredNode, hoveredEdge, selectedNode]);

  // Redraw when transform or hover state changes
  useEffect(() => {
    draw();
  }, [draw]);

  // Add wheel event listener with passive: false to prevent page scroll
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const wheelHandler = (e) => {
      e.preventDefault();
      e.stopPropagation();

      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const delta = -e.deltaY * 0.001;
      const scaleFactor = Math.exp(delta);

      setTransform(prev => {
        const newScale = Math.max(0.1, Math.min(10, prev.scale * scaleFactor));
        const actualFactor = newScale / prev.scale;

        return {
          scale: newScale,
          translateX: mouseX - (mouseX - prev.translateX) * actualFactor,
          translateY: mouseY - (mouseY - prev.translateY) * actualFactor
        };
      });
    };

    canvas.addEventListener('wheel', wheelHandler, { passive: false });
    return () => canvas.removeEventListener('wheel', wheelHandler);
  }, []);

  // Hit detection helper - distance from point to line segment
  const distanceToSegment = (px, py, x1, y1, x2, y2) => {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;

    if (lenSq === 0) return Math.hypot(px - x1, py - y1);

    let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));

    const closestX = x1 + t * dx;
    const closestY = y1 + t * dy;

    return Math.hypot(px - closestX, py - closestY);
  };

  // Handle pan start
  const handleMouseDown = useCallback((e) => {
    if (e.button === 0) { // Left click
      setIsDragging(true);
      setDragStart({ x: e.clientX, y: e.clientY });
    }
  }, []);

  // Handle pan
  const handleMouseMove = useCallback((e) => {
    if (!layoutResult || !canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    if (isDragging) {
      // Pan
      const dx = e.clientX - dragStart.x;
      const dy = e.clientY - dragStart.y;

      setTransform(prev => ({
        ...prev,
        translateX: prev.translateX + dx,
        translateY: prev.translateY + dy
      }));

      setDragStart({ x: e.clientX, y: e.clientY });
    } else {
      // Hit detection for hover
      const { nodePositions } = layoutResult;
      const { scale, translateX, translateY } = transform;

      // Inverse transform to get graph coordinates
      const graphX = (mouseX - translateX) / scale;
      const graphY = (mouseY - translateY) / scale;

      // Check nodes
      let foundNode = null;
      const nodeThreshold = 5 / scale; // Adjust with zoom

      for (const [nodeId, segments] of Object.entries(nodePositions)) {
        for (let i = 0; i < segments.length - 1; i++) {
          const dist = distanceToSegment(
            graphX, graphY,
            segments[i].x, segments[i].y,
            segments[i + 1].x, segments[i + 1].y
          );

          if (dist < nodeThreshold) {
            foundNode = nodeId;
            break;
          }
        }
        if (foundNode) break;
      }

      setHoveredNode(foundNode);

      // Check edges
      let foundEdge = null;
      const edgeThreshold = 3 / scale;

      for (let edgeIdx = 0; edgeIdx < graph.edges.length; edgeIdx++) {
        const edge = graph.edges[edgeIdx];
        const fromSegments = nodePositions[edge.from];
        const toSegments = nodePositions[edge.to];

        if (!fromSegments || !toSegments) continue;

        const fromEnd = fromSegments[fromSegments.length - 1];
        const toStart = toSegments[0];

        if (!fromEnd || !toStart) continue;

        const dist = distanceToSegment(
          graphX, graphY,
          fromEnd.x, fromEnd.y,
          toStart.x, toStart.y
        );

        if (dist < edgeThreshold) {
          foundEdge = edgeIdx;
          break;
        }
      }

      setHoveredEdge(foundEdge);

      // Update cursor
      canvasRef.current.style.cursor = foundNode || foundEdge ? 'pointer' : 'default';
    }
  }, [layoutResult, isDragging, dragStart, transform, graph]);

  // Handle pan end
  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Handle click
  const handleClick = useCallback((e) => {
    if (hoveredNode) {
      setSelectedNode(prev => prev === hoveredNode ? null : hoveredNode);

      // Log node info
      const node = graph.nodes.find(n => n.id === hoveredNode);
      if (node) {
        console.log('Selected node:', {
          id: node.id,
          name: node.name,
          length: node.length,
          depth: node.depth
        });
      }
    }
  }, [hoveredNode, graph]);

  // Handle zoom slider
  const handleZoomChange = useCallback((e) => {
    const newScale = parseFloat(e.target.value);

    setTransform(prev => {
      const scaleFactor = newScale / prev.scale;
      const centerX = width / 2;
      const centerY = height / 2;

      return {
        scale: newScale,
        translateX: centerX - (centerX - prev.translateX) * scaleFactor,
        translateY: centerY - (centerY - prev.translateY) * scaleFactor
      };
    });
  }, [width, height]);

  // Handle horizontal scroll
  const handleHorizontalScroll = useCallback((e) => {
    const value = parseFloat(e.target.value);
    setTransform(prev => ({
      ...prev,
      translateX: value
    }));
  }, []);

  // Handle vertical scroll
  const handleVerticalScroll = useCallback((e) => {
    const value = parseFloat(e.target.value);
    setTransform(prev => ({
      ...prev,
      translateY: value
    }));
  }, []);

  // Calculate scroll ranges
  const getScrollRanges = () => {
    if (!boundsRef.current) return { minX: 0, maxX: 0, minY: 0, maxY: 0 };

    const { minX, maxX, minY, maxY } = boundsRef.current;
    const { scale } = transform;

    const graphWidth = (maxX - minX) * scale;
    const graphHeight = (maxY - minY) * scale;

    return {
      minX: width - graphWidth - 100,
      maxX: 100,
      minY: height - graphHeight - 100,
      maxY: 100
    };
  };

  const scrollRanges = getScrollRanges();

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onClick={handleClick}
        style={{
          border: '1px solid #333',
          borderRadius: '8px',
          backgroundColor: '#1a1a1a',
          cursor: 'default',
          display: 'block'
        }}
      />

      {/* Zoom slider */}
      <div style={{
        position: 'absolute',
        bottom: '10px',
        left: '10px',
        background: 'rgba(0, 0, 0, 0.7)',
        padding: '8px 12px',
        borderRadius: '4px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px'
      }}>
        <span style={{ color: '#fff', fontSize: '12px', minWidth: '40px' }}>Zoom:</span>
        <input
          type="range"
          min="0.1"
          max="10"
          step="0.1"
          value={transform.scale}
          onChange={handleZoomChange}
          style={{ width: '150px' }}
        />
        <span style={{ color: '#fff', fontSize: '12px', minWidth: '50px' }}>
          {(transform.scale * 100).toFixed(0)}%
        </span>
      </div>

      {/* Horizontal scrollbar */}
      <div style={{
        position: 'absolute',
        bottom: '0',
        left: '0',
        right: '20px',
        height: '20px',
        background: 'rgba(0, 0, 0, 0.3)',
        borderRadius: '0 0 0 8px'
      }}>
        <input
          type="range"
          min={scrollRanges.minX}
          max={scrollRanges.maxX}
          step="1"
          value={transform.translateX}
          onChange={handleHorizontalScroll}
          style={{
            width: '100%',
            height: '100%',
            margin: 0,
            cursor: 'pointer'
          }}
        />
      </div>

      {/* Vertical scrollbar */}
      <div style={{
        position: 'absolute',
        top: '0',
        right: '0',
        bottom: '20px',
        width: '20px',
        background: 'rgba(0, 0, 0, 0.3)',
        borderRadius: '0 8px 0 0'
      }}>
        <input
          type="range"
          min={scrollRanges.minY}
          max={scrollRanges.maxY}
          step="1"
          value={transform.translateY}
          onChange={handleVerticalScroll}
          orient="vertical"
          style={{
            width: '100%',
            height: '100%',
            margin: 0,
            cursor: 'pointer',
            writingMode: 'bt-lr',
            WebkitAppearance: 'slider-vertical'
          }}
        />
      </div>
    </div>
  );
}
