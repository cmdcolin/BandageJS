// Type definitions for the Bandage Layout application

export interface GraphNode {
  id: string;
  name: string;
  length: number;
  depth: number;
}

export interface GraphEdge {
  from: string;
  to: string;
  overlap: number;
}

export interface Graph {
  name: string;
  description: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface LayoutOptions {
  quality: number;
  linearLayout: boolean;
  componentSeparation: number;
  aspectRatio: number;
  nodeLengthPerMegabase: number;
  minimumNodeLength: number;
  nodeSegmentLength: number;
  edgeLength: number;
}

export interface NodeSegment {
  x: number;
  y: number;
}

export interface LayoutResult {
  nodePositions: Record<string, NodeSegment[]>;
}

export interface LayoutComputation {
  result: LayoutResult;
  duration: number;
}

export interface GraphStats {
  nodeCount: number;
  edgeCount: number;
  totalLength: number;
  minLength: number;
  maxLength: number;
  avgLength: number;
  medianLength: number;
  lengthRatio: string;
  avgDepth: number;
  minDepth: number;
  maxDepth: number;
  uniqueNodes: GraphNode[];
}

export interface Transform {
  scale: number;
  translateX: number;
  translateY: number;
}

export interface ContextMenu {
  visible: boolean;
  x: number;
  y: number;
  nodeId: string | null;
}

export interface DetailsDialog {
  visible: boolean;
  nodeId: string | null;
}
