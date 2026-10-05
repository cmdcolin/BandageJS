import { memo } from './derived'

import type { Graph } from '@jbrowse/bandage-core'
import type { GafRecord } from '@jbrowse/bandage-core/gaf/parseGaf'

// Reads aligned to the graph, counted per node. Reads attach to the graph in
// place, so each memo is keyed on them as well as the graph.

// each node's reads, by node name, a read once however many times it visits
export const readsByNode = memo(
  (_graph: Graph | undefined, reads: GafRecord[] | undefined) => {
    const byNode = new Map<string, GafRecord[]>()
    for (const read of reads ?? []) {
      for (const name of new Set(read.path.map(s => s.name))) {
        let mine = byNode.get(name)
        if (!mine) {
          mine = []
          byNode.set(name, mine)
        }
        mine.push(read)
      }
    }
    return byNode
  },
)

// The graph with each node's depth its read count, so Width by depth shows
// the reads' coverage
export const withReadDepth = memo((graph: Graph, reads: GafRecord[]) => {
  const byNode = readsByNode(graph, reads)
  return {
    ...graph,
    nodes: graph.nodes.map(n => ({
      ...n,
      depth: byNode.get(n.name)?.length ?? 0,
    })),
  }
})
