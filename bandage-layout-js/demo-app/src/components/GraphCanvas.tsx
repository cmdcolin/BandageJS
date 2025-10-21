import { useEffect, useRef, useState, useCallback } from 'react';
import type { LayoutResult, Graph, Transform, ContextMenu, DetailsDialog, GraphNode } from '../types';

interface GraphCanvasProps {
  layoutResult: LayoutResult;
  graph: Graph;
  width?: number;
  height?: number;
  isDarkMode?: boolean;
}

export function GraphCanvas({ layoutResult, graph, width = 800, height = 600, isDarkMode = true }: GraphCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [transform, setTransform] = useState<Transform>({ scale: 1, translateX: 0, translateY: 0 });
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [hoveredEdge, setHoveredEdge] = useState<number | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [contextMenu, setContextMenu] = useState<ContextMenu>({ visible: false, x: 0, y: 0, nodeId: null });
  const [detailsDialog, setDetailsDialog] = useState<DetailsDialog>({ visible: false, nodeId: null });
  const boundsRef = useRef<{
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    fitScale: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);

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
    if (!ctx) return;

    // Set canvas resolution (force redraw by resetting dimensions)
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    ctx.scale(dpr, dpr);

    // Clear canvas with theme-appropriate background
    ctx.fillStyle = isDarkMode ? '#1a1a1a' : '#ffffff';
    ctx.fillRect(0, 0, width, height);

    const { nodePositions } = layoutResult;
    const { scale, translateX, translateY } = transform;

    // Helper to transform coordinates
    const transformPoint = (x: number, y: number) => ({
      x: x * scale + translateX,
      y: y * scale + translateY
    });

    // Draw edges (only for positive strand nodes)
    graph.edges.forEach((edge, edgeIdx) => {
      // Skip edges that connect to negative strand nodes
      if (!edge.from.endsWith('+') || !edge.to.endsWith('+')) return;

      const fromSegments = nodePositions[edge.from];
      const toSegments = nodePositions[edge.to];

      if (!fromSegments || !toSegments) return;

      const fromEnd = fromSegments[fromSegments.length - 1];
      const toStart = toSegments[0];

      if (!fromEnd || !toStart) return;

      const p1 = transformPoint(fromEnd.x, fromEnd.y);
      const p2 = transformPoint(toStart.x, toStart.y);

      const isHovered = hoveredEdge === edgeIdx;
      const edgeColor = isDarkMode
        ? (isHovered ? '#888' : '#444')
        : (isHovered ? '#666' : '#aaa');
      ctx.strokeStyle = edgeColor;
      ctx.lineWidth = isHovered ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    });

    // Draw nodes (only positive strand)
    Object.entries(nodePositions).forEach(([nodeId, segments]) => {
      // Skip negative strand nodes
      if (!nodeId.endsWith('+')) return;

      const node = graph.nodes.find(n => n.id === nodeId);
      if (!node) return;

      // Color for positive strand only
      const color = isDarkMode
        ? [52, 152, 219]    // Dark mode color
        : [30, 110, 255];   // Light mode color

      const isHovered = hoveredNode === nodeId;
      const isSelected = selectedNode === nodeId;

      ctx.strokeStyle = `rgb(${color.join(',')})`;
      ctx.lineWidth = isSelected ? 5 : isHovered ? 4 : 3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

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

      // Draw node label if long enough
      if (segments.length > 5) {
        const midIdx = Math.floor(segments.length / 2);
        const midPoint = transformPoint(segments[midIdx]!.x, segments[midIdx]!.y);

        ctx.fillStyle = isDarkMode ? '#fff' : '#000';
        ctx.font = '10px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(node.name, midPoint.x, midPoint.y - 5);
      }
    });

  }, [layoutResult, graph, width, height, transform, hoveredNode, hoveredEdge, selectedNode, isDarkMode]);

  // Redraw when any state changes
  useEffect(() => {
    draw();
  }, [draw]);

  // Add wheel event listener with passive: false to prevent page scroll
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const wheelHandler = (e: WheelEvent) => {
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
  const distanceToSegment = (px: number, py: number, x1: number, y1: number, x2: number, y2: number): number => {
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
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button === 0) { // Left click
      // If clicking on a node, show context menu
      if (hoveredNode && canvasRef.current) {
        e.stopPropagation();
        const rect = canvasRef.current.getBoundingClientRect();
        setContextMenu({
          visible: true,
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
          nodeId: hoveredNode
        });
        setSelectedNode(hoveredNode);
      } else {
        // Otherwise enable dragging
        setIsDragging(true);
        setDragStart({ x: e.clientX, y: e.clientY });
        setContextMenu({ visible: false, x: 0, y: 0, nodeId: null });
      }
    }
  }, [hoveredNode]);

  // Handle pan
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
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

      // Check nodes (only positive strand)
      let foundNode: string | null = null;
      const nodeThreshold = 5 / scale; // Adjust with zoom

      for (const [nodeId, segments] of Object.entries(nodePositions)) {
        // Skip negative strand nodes
        if (!nodeId.endsWith('+')) continue;

        for (let i = 0; i < segments.length - 1; i++) {
          const dist = distanceToSegment(
            graphX, graphY,
            segments[i]!.x, segments[i]!.y,
            segments[i + 1]!.x, segments[i + 1]!.y
          );

          if (dist < nodeThreshold) {
            foundNode = nodeId;
            break;
          }
        }
        if (foundNode) break;
      }

      setHoveredNode(foundNode);

      // Check edges (only for positive strand nodes)
      let foundEdge: number | null = null;
      const edgeThreshold = 3 / scale;

      for (let edgeIdx = 0; edgeIdx < graph.edges.length; edgeIdx++) {
        const edge = graph.edges[edgeIdx]!;

        // Skip edges that connect to negative strand nodes
        if (!edge.from.endsWith('+') || !edge.to.endsWith('+')) continue;

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

  // Close context menu when clicking outside
  useEffect(() => {
    if (!contextMenu.visible) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (!(e.target as Element).closest('.context-menu')) {
        setContextMenu({ visible: false, x: 0, y: 0, nodeId: null });
      }
    };

    // Delay attaching the handler to avoid immediate closure
    const timer = setTimeout(() => {
      document.addEventListener('click', handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('click', handleClickOutside);
    };
  }, [contextMenu.visible]);

  // Close details dialog with Escape key
  useEffect(() => {
    if (!detailsDialog.visible) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDetailsDialog({ visible: false, nodeId: null });
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [detailsDialog.visible]);

  // Handle zoom slider
  const handleZoomChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
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

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{
          border: isDarkMode ? '1px solid #333' : '1px solid #ddd',
          borderRadius: '8px',
          backgroundColor: isDarkMode ? '#1a1a1a' : '#ffffff',
          cursor: 'default',
          display: 'block'
        }}
      />

      {/* Legend */}
      <div style={{
        position: 'absolute',
        top: '10px',
        left: '10px',
        background: isDarkMode ? 'rgba(0, 0, 0, 0.7)' : 'rgba(255, 255, 255, 0.9)',
        padding: '10px 12px',
        borderRadius: '4px',
        fontSize: '12px',
        color: isDarkMode ? '#fff' : '#333',
        border: isDarkMode ? 'none' : '1px solid #ddd'
      }}>
        <div style={{ marginBottom: '5px', fontWeight: 'bold' }}>Showing:</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{
            width: '20px',
            height: '3px',
            background: isDarkMode ? 'rgb(52, 152, 219)' : 'rgb(30, 110, 255)',
            borderRadius: '2px'
          }}></div>
          <span>Positive Strand (+)</span>
        </div>
      </div>

      {/* Zoom slider */}
      <div style={{
        position: 'absolute',
        bottom: '10px',
        left: '10px',
        background: isDarkMode ? 'rgba(0, 0, 0, 0.7)' : 'rgba(255, 255, 255, 0.9)',
        padding: '8px 12px',
        borderRadius: '4px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        border: isDarkMode ? 'none' : '1px solid #ddd'
      }}>
        <span style={{ color: isDarkMode ? '#fff' : '#333', fontSize: '12px', minWidth: '40px' }}>Zoom:</span>
        <input
          type="range"
          min="0.1"
          max="10"
          step="0.1"
          value={transform.scale}
          onChange={handleZoomChange}
          style={{ width: '150px' }}
        />
        <span style={{ color: isDarkMode ? '#fff' : '#333', fontSize: '12px', minWidth: '50px' }}>
          {(transform.scale * 100).toFixed(0)}%
        </span>
      </div>

      {/* Context menu */}
      {contextMenu.visible && (
        <div
          className="context-menu"
          style={{
            position: 'absolute',
            left: `${contextMenu.x}px`,
            top: `${contextMenu.y}px`,
            background: isDarkMode ? '#2a2a2a' : 'white',
            border: isDarkMode ? '1px solid #555' : '1px solid #ccc',
            borderRadius: '4px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
            zIndex: 1000,
            minWidth: '150px'
          }}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              setDetailsDialog({ visible: true, nodeId: contextMenu.nodeId });
              setContextMenu({ visible: false, x: 0, y: 0, nodeId: null });
            }}
            style={{
              width: '100%',
              padding: '8px 12px',
              background: 'transparent',
              border: 'none',
              textAlign: 'left',
              cursor: 'pointer',
              fontSize: '13px',
              color: isDarkMode ? '#e0e0e0' : '#333'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = isDarkMode ? '#3a3a3a' : '#f0f0f0';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
            }}
          >
            View Details
          </button>
        </div>
      )}

      {/* Details dialog */}
      {detailsDialog.visible && (() => {
        const node = graph.nodes.find(n => n.id === detailsDialog.nodeId);
        if (!node) return null;

        return (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0, 0, 0, 0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 2000
            }}
            onClick={() => setDetailsDialog({ visible: false, nodeId: null })}
          >
            <div
              style={{
                background: isDarkMode ? '#2a2a2a' : 'white',
                borderRadius: '8px',
                padding: '20px',
                maxWidth: '500px',
                width: '90%',
                color: isDarkMode ? '#e0e0e0' : '#333'
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '15px',
                borderBottom: isDarkMode ? '1px solid #444' : '1px solid #ddd',
                paddingBottom: '10px'
              }}>
                <h3 style={{ margin: 0, fontSize: '18px' }}>Node Details</h3>
                <button
                  onClick={() => setDetailsDialog({ visible: false, nodeId: null })}
                  style={{
                    background: 'none',
                    border: 'none',
                    fontSize: '24px',
                    cursor: 'pointer',
                    color: isDarkMode ? '#aaa' : '#666',
                    padding: 0,
                    width: '30px',
                    height: '30px'
                  }}
                >
                  ×
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div>
                  <strong>ID:</strong> {node.id}
                </div>
                <div>
                  <strong>Name:</strong> {node.name}
                </div>
                <div>
                  <strong>Length:</strong> {node.length.toLocaleString()} bp
                </div>
                <div>
                  <strong>Depth:</strong> {node.depth.toFixed(2)}×
                </div>
                <div>
                  <strong>Strand:</strong> {node.id.endsWith('+') ? 'Positive (+)' : 'Negative (-)'}
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
