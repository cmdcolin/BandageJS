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
  // the strand the first visit reads the segment on, where the file says
  strand?: '+' | '-'
}

// A node's id is its segment's name and the strand it is drawn on
export const ownStrand = (id: string) => (id.endsWith('-') ? '-' : '+')

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

// A node's links by the end of it they join; a link back to the node itself
// joins both ends it names, and a link the file states twice counts once
export function nodeLinks(graph: Graph, id: string) {
  const links: Record<Side, NodeLink[]> = { start: [], end: [] }
  const seen = new Set<string>()
  const add = (mine: Side, link: NodeLink) => {
    const key = `${mine} ${link.nodeId} ${link.side}`
    if (!seen.has(key)) {
      seen.add(key)
      links[mine].push(link)
    }
  }
  graph.edges.forEach((e, edgeIndex) => {
    const sides = linkSides(e)
    if (e.from === id) {
      add(sides.from, { edgeIndex, nodeId: e.to, side: sides.to })
    }
    if (e.to === id) {
      add(sides.to, { edgeIndex, nodeId: e.from, side: sides.from })
    }
  })
  return links
}

// a P line's name states the stretch it covers, `K12#1#chr:1004500-1004961`
const RANGE_SUFFIX = /:\d+-\d+$/

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
    const named = path.name.replace(RANGE_SUFFIX, '')
    const visit = graph.pathVisits
      ?.get(node.name)
      ?.find(v => v.start === offset && v.path === named)
    out.push({
      name: path.name,
      visits: path.nodeIds.filter(id => id === node.id).length,
      at: {
        contig: path.contig ?? named,
        start: offset,
        end: offset + node.length,
      },
      strand: visit?.strand,
    })
  }
  return out
}
