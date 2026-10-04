import {
  LAYOUT_MODES,
  ROW_HEIGHT_PX,
  bubbleHalos,
  bubblesFromGraph,
  computeReferenceRamp,
  deletionDrawing,
  deletionEdges,
  facetLifts,
  genePins,
  genesOnRow,
  nodeInk,
  pathLegend,
  resolveColorScheme,
  tubeMapPicture,
  walkLift,
  walkRows,
  placeRowGenes,
} from '@jbrowse/bandage-core'

import type { Region } from './jbrowse'
import type { Facet } from './settings'
import type {
  ColorScheme,
  GeneModel,
  Graph,
  GraphNode,
  LayoutResult,
  NodeWidth,
  WalkLayer,
  WalkRows,
} from '@jbrowse/bandage-core'

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

// whether depth says anything here: a file with no depth reads 1 everywhere
export const depthVaries = memo(
  (graph: Graph) => new Set(graph.nodes.map(n => n.depth)).size > 1,
)

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

export const inkOf = memo(
  (graph: Graph | undefined, width: NodeWidth, thickness: number) =>
    nodeInk(graph, graphFacts(graph).nodeById, thickness, width),
)

// the rows the walk rows layout draws for the graph and window
export const rowsOf = memo(
  (graph: Graph | undefined, region: Region | undefined) =>
    graph ? walkRows(graph, region) : undefined,
)

// Each row's genes along its bar, as walk rows or the strip draws them: the
// reference row's from the backbone's genes, the others' from their own
export const rowGenesOf = memo(
  (
    bars: WalkRows | undefined,
    genes: GeneModel[] | undefined,
    walkGenes: Map<string, GeneModel[]> | undefined,
  ) =>
    bars
      ? placeRowGenes(
          [bars.reference, ...bars.rows],
          new Map([
            ...(walkGenes ?? []),
            ...(genes
              ? [
                  [
                    bars.reference.name,
                    genesOnRow(bars.reference, genes),
                  ] as const,
                ]
              : []),
          ]),
        )
      : undefined,
)

// The stretch of reference the ramp colours, as the walk rows and keys take it
export const rampInterval = (
  ramp: { start: number; span: number } | undefined,
) => ramp && { start: ramp.start, end: ramp.start + ramp.span }

// What a layout draws besides its nodes, recomputed when the layout, its
// positions or a setting it reads changes rather than per frame.
export const drawnExtras = memo(
  (
    graph: Graph | undefined,
    layout: LayoutResult | undefined,
    _positions: number,
    m: string,
    showBubbles: boolean,
    showDeletionEdges: boolean,
    scheme: ColorScheme,
    region: Region | undefined,
    showGenes: boolean,
    genes: GeneModel[] | undefined,
    walkGenes: Map<string, GeneModel[]> | undefined,
  ) => {
    const f = graphFacts(graph)
    const positions = layout?.nodePositions
    const tubeMap = layout?.tubeMap
    const onNodes = m !== 'walkrows' && !tubeMap
    const deletions =
      graph &&
      deletionDrawing(
        graph,
        m !== 'walkrows' && !tubeMap ? f.allDeletions : [],
        showDeletionEdges,
      )
    const bars = m === 'walkrows' ? rowsOf(graph, region) : undefined
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
      bars,
      rowGenes:
        showGenes && bars ? rowGenesOf(bars, genes, walkGenes) : undefined,
      rowLabels: bars
        ? [bars.reference, ...bars.rows].map((row, i) => ({
            label: row.label,
            y: i * ROW_HEIGHT_PX,
          }))
        : (layout?.rowLabels ?? []),
      deletions: deletions?.shown ?? [],
      deletionIndexes: deletions?.bypassed,
      hiddenEdges: deletions?.hidden,
      ramp:
        resolved === 'reference-position' && graph && !tubeMap
          ? computeReferenceRamp(graph, region)
          : undefined,
      picture: tubeMap ? tubeMapPicture(tubeMap.layout) : undefined,
    }
  },
)

// The walks lifted out of the drawing, each in its lane, and while they are
// side by side a lift of each alone, a panel apiece. The reference ramp is a
// neighbour walk per node, so only a lane coloured by reference position reads
// it. A tube map draws every walk as a tube of its own.
export const walkView = memo(
  (
    graph: Graph | undefined,
    layers: WalkLayer[],
    region: Region | undefined,
    tubeMap: boolean,
    facet: Facet,
  ) => {
    if (!graph || layers.length === 0 || tubeMap) {
      return { lift: undefined, panels: undefined }
    }
    const ramp = layers.some(l => l.color?.field === 'reference')
      ? computeReferenceRamp(graph, region)
      : undefined
    const lift = walkLift(graph, layers, ramp)
    return {
      lift,
      panels:
        facet !== 'none' && lift && lift.walks.length > 1
          ? facetLifts(graph, lift, layers, ramp)
          : undefined,
    }
  },
)
