import {
  LAYOUT_MODES,
  ROW_HEIGHT_PX,
  bubbleHalos,
  bubblesFromGraph,
  classifyBubble,
  computeReferenceRamp,
  deletionEdges,
  genePins,
  nodeInk,
  pathLegend,
  resolveColorScheme,
  tubeMapPicture,
  walkHighlight,
  walkRows,
} from '@jbrowse/bandage-core'

import type { Region } from './jbrowse'
import type {
  ColorScheme,
  GeneModel,
  Graph,
  GraphNode,
  LayoutResult,
  NodeWidth,
} from '@jbrowse/bandage-core'

export const CONTIG_THICKNESS = 6

// The last value of `fn`, recomputed when any of `keys` changes identity.
export function memo<K extends unknown[], T>(fn: (...keys: K) => T) {
  let last: { keys: K; value: T } | undefined
  return (...keys: K) => {
    if (!last || keys.some((k, i) => k !== last!.keys[i])) {
      last = { keys, value: fn(...keys) }
    }
    return last.value
  }
}

// Walk labels are the shortest distinct tier, but two walks can share a name
// outright (fragments of one contig), so a repeat gets its ordinal.
export function walkLabelsOf(walkChoices: { name: string; label: string }[]) {
  const seen = new Map<string, number>()
  return new Map(
    [...walkChoices]
      .sort((a, b) => a.label.localeCompare(b.label))
      .map(w => {
        const n = (seen.get(w.label) ?? 0) + 1
        seen.set(w.label, n)
        return [w.name, n > 1 ? `${w.label} (${n})` : w.label]
      }),
  )
}

export const graphFacts = memo((graph: Graph | undefined) => {
  const deletions = graph ? deletionEdges(graph) : []
  const walkChoices = graph?.paths?.length ? pathLegend(graph.paths) : []
  return {
    nodeById: new Map<string, GraphNode>(graph?.nodes.map(n => [n.id, n])),
    nodeLengths: new Map(graph?.nodes.map(n => [n.id, n.length])),
    allDeletions: deletions,
    bubbles: graph ? bubblesFromGraph(graph) : [],
    walkChoices,
    walkLabels: walkLabelsOf(walkChoices),
    drawable: new Set<string>(
      graph
        ? LAYOUT_MODES.filter(m => m.available(graph)).map(m => m.value)
        : [],
    ),
  }
})

export const inkOf = memo((graph: Graph | undefined, width: NodeWidth) =>
  nodeInk(graph, graphFacts(graph).nodeById, CONTIG_THICKNESS, width),
)

// What a layout draws besides its nodes, recomputed when the layout, its
// positions or a setting it reads changes rather than per frame.
export const drawnExtras = memo(
  (
    graph: Graph | undefined,
    layout: LayoutResult | undefined,
    _positions: number,
    m: string,
    showBubbles: boolean,
    scheme: ColorScheme,
    highlightedPath: string,
    region: Region | undefined,
    showGenes: boolean,
    genes: GeneModel[] | undefined,
  ) => {
    const f = graphFacts(graph)
    const positions = layout?.nodePositions
    const tubeMap = layout?.tubeMap
    const onNodes = m !== 'variants' && m !== 'walkrows' && !tubeMap
    const deletions = m !== 'walkrows' && !tubeMap ? f.allDeletions : []
    const bars = m === 'walkrows' && graph ? walkRows(graph, region) : undefined
    const resolved = resolveColorScheme(scheme, graph)
    return {
      halos:
        showBubbles && onNodes && graph && positions
          ? bubbleHalos(
              graph,
              f.bubbles,
              positions,
              name => f.walkLabels.get(name) ?? name,
            )
          : [],
      genePins:
        showGenes && onNodes && graph && positions && genes
          ? genePins(graph, genes, positions)
          : [],
      glyphs:
        m === 'variants'
          ? f.bubbles.map(bubble => ({ bubble, ...classifyBubble(bubble) }))
          : [],
      bars,
      rowLabels: bars
        ? [bars.reference, ...bars.rows].map((row, i) => ({
            label: row.label,
            y: i * ROW_HEIGHT_PX,
          }))
        : (layout?.rowLabels ?? []),
      deletions,
      deletionIndexes: new Map(deletions.map(d => [d.edgeIndex, d.bypassed])),
      ramp:
        resolved === 'reference-position' && graph && !tubeMap
          ? computeReferenceRamp(graph, region)
          : undefined,
      highlight:
        graph && highlightedPath
          ? walkHighlight(graph, highlightedPath)
          : undefined,
      picture: tubeMap ? tubeMapPicture(tubeMap.layout) : undefined,
    }
  },
)
