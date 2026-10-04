import type { Graph, GraphEdge, GraphNode } from '@jbrowse/bandage-core'

export type Side = 'start' | 'end'

export interface NodeLink {
  edgeIndex: number
  nodeId: string
  // the end of the neighbour the link joins
  side: Side
}

export interface WalkThrough {
  name: string
  visits: number
  // the first visit's stretch of the walk's own contig, 0-based half-open
  at: { contig: string; start: number; end: number }
}

const ownStrand = (id: string) => (id.endsWith('-') ? '-' : '+')

// The ends of its two nodes a link joins: a node read on the strand its id
// carries is left from its end and entered at its start
export function linkSides(e: GraphEdge): { from: Side; to: Side } {
  const own = (id: string, strand: string | undefined) =>
    (strand ?? ownStrand(id)) === ownStrand(id)
  return {
    from: own(e.from, e.fromStrand) ? 'end' : 'start',
    to: own(e.to, e.toStrand) ? 'start' : 'end',
  }
}

// A node's links by the end of it they join
export function nodeLinks(graph: Graph, id: string) {
  const links: Record<Side, NodeLink[]> = { start: [], end: [] }
  graph.edges.forEach((e, edgeIndex) => {
    const sides = linkSides(e)
    if (e.from === id) {
      links[sides.from].push({ edgeIndex, nodeId: e.to, side: sides.to })
    }
    if (e.to === id && e.from !== id) {
      links[sides.to].push({ edgeIndex, nodeId: e.from, side: sides.from })
    }
  })
  return links
}

// The walks through a node, and where each first passes it on its own contig
export function walksThrough(
  graph: Graph,
  node: GraphNode,
  lengthOf: (id: string) => number,
): WalkThrough[] {
  const out: WalkThrough[] = []
  for (const path of graph.paths ?? []) {
    const first = path.nodeIds.indexOf(node.id)
    if (first < 0) {
      continue
    }
    let offset = path.start ?? 0
    for (let i = 0; i < first; i++) {
      offset += lengthOf(path.nodeIds[i]!)
    }
    out.push({
      name: path.name,
      visits: path.nodeIds.filter(id => id === node.id).length,
      at: {
        contig: path.contig ?? path.name.replace(/:\d+-\d+$/, ''),
        start: offset,
        end: offset + node.length,
      },
    })
  }
  return out
}
