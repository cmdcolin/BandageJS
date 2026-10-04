import {
  axisScaleOf,
  layoutModeByValue,
  pathColorsLegible,
} from '@jbrowse/bandage-core'

import {
  drawnExtras,
  graphFacts,
  rowGenesOf,
  rowsOf,
  walkView,
} from './derived'
import { loadSettings, saveSettings as save } from './settings'

import type { GbzSource } from './gbz'
import type { Region } from './jbrowse'
import type { Declaration } from './reference'
import type {
  Bounds,
  GeneModel,
  Graph,
  LayoutModeValue,
  LayoutResult,
  WalkLayer,
  WalkRows,
} from '@jbrowse/bandage-core'

export const settings = loadSettings()

export function saveSettings() {
  save(settings)
}

// Where the graph on screen came from, so a reference change can re-read it
// and a JBrowse link can name it.
export interface Source {
  text: string
  name: string
  description?: string
  // the reference window a cut was made for
  region?: Region
  // the path that window is on, for a graph anchored on its walks: another
  // reference path draws x on other coordinates, where the window means
  // nothing
  regionPath?: string
  // an http(s) url JBrowse can fetch the same GFA from
  url?: string
  gbz?: GbzSource
  // whether the gbz cut followed every snarl a walk leaves the window by, so
  // each haplotype came back as one walk
  wholeWalks?: boolean
  // the reference sample a gbz cut was made on
  sample?: string
  // the assembly the user said each backbone is on, by backboneKey
  declared?: Record<string, Declaration>
}

export const state = {
  source: undefined as Source | undefined,
  // the source's region while it applies, which the anchored layouts, the
  // ramp and the fit read
  region: undefined as Region | undefined,
  graph: undefined as Graph | undefined,
  stack: [] as { graph: Graph; mode: LayoutModeValue }[],
  // the layout a popped bubble draws in place of the chosen one, which it
  // can't take
  modeOverride: undefined as LayoutModeValue | undefined,
  layout: undefined as LayoutResult | undefined,
  // the mode that drew `layout`, which is force-directed when the chosen one
  // can't draw the graph
  layoutMode: 'force' as LayoutModeValue,
  referencePath: '',
  // the walks lifted out of the drawing, each with the colour it was given
  walkLayers: [] as WalkLayer[],
  // the genes pinned to the backbone, RefSeq's or a file's, once they arrive
  genes: undefined as GeneModel[] | undefined,
  // the track or file `genes` came from
  genesFrom: undefined as string | undefined,
  // each walk row's genes, on its own contig, by walk name
  walkGenes: undefined as Map<string, GeneModel[]> | undefined,
  // walk rows with no gene track, and rows past those read
  walkGeneNote: undefined as { untracked: number; unread: number } | undefined,
  scale: 1,
  translateX: 0,
  translateY: 0,
  owner: 'fit' as 'fit' | 'user',
  width: 0,
  height: 0,
  legendSize: { width: 0, height: 0 },
  hoveredNode: null as string | null,
  // whether the hovered node is lit from a point on the walk strip
  stripHover: false,
  hoveredEdge: null as number | null,
  selectedNode: null as string | null,
  // the walk row picked by a click on its bar, by walk name
  selectedRow: null as string | null,
  positionsVersion: 0,
  built: undefined as { scale: number; bounds: Bounds } | undefined,
  layoutMs: undefined as number | undefined,
  geometryMs: undefined as number | undefined,
}

export function effectiveMode() {
  return state.modeOverride ?? settings.mode
}

export const facts = () => graphFacts(state.graph)

// A saved layout the graph can't take draws force-directed; the setting stays
// for the next graph that can.
export function drawnMode() {
  const m = layoutModeByValue(effectiveMode())
  return state.graph && !facts().drawable.has(m.value)
    ? layoutModeByValue('force')
    : m
}

export const pixelRows = () => state.layout?.pixelRows ?? false
export const axis = () => axisScaleOf(state.scale, pixelRows())
export const tube = () => state.layout?.tubeMap

export const current = () =>
  drawnExtras(
    state.graph,
    state.layout,
    state.positionsVersion,
    state.layoutMode,
    settings.showBubbles,
    settings.colorScheme,
    state.region,
    settings.showGenes,
    state.genes,
    state.walkGenes,
  )

// The lifted walks, and a lift of each alone while they are side by side
export const walks = () =>
  walkView(
    state.graph,
    state.walkLayers,
    state.region,
    !!tube(),
    settings.facet,
  )

export const drawPaths = () =>
  (settings.drawPaths || !!tube()) &&
  pathColorsLegible(state.graph?.paths?.length ?? 0)

// Walk rows under the drawing: asked for, under a layout that draws nodes and
// not while a tube map or walk rows are still on screen, for a graph with
// walks, and not while a bubble is popped
export const stripRows = () =>
  settings.walkStrip &&
  drawnMode().drawsNodes &&
  !tube() &&
  !current().bars &&
  state.stack.length === 0 &&
  (state.graph?.paths?.length ?? 0) > 1
    ? rowsOf(state.graph, state.region)
    : undefined

// The rows the strip draws once the chosen layout is on screen and any popped
// bubble is closed, which its genes are read for ahead of either
export function stripRowsWanted() {
  const root = state.stack[0]
  const graph = root?.graph ?? state.graph
  const mode = root ? layoutModeByValue(root.mode) : drawnMode()
  return settings.walkStrip &&
    mode.drawsNodes &&
    (graph?.paths?.length ?? 0) > 1
    ? rowsOf(graph, state.region)
    : undefined
}

export const stripGenes = (bars: WalkRows) =>
  settings.showGenes
    ? rowGenesOf(bars, state.genes, state.walkGenes)
    : undefined

// Walk rows measure whole walks, which a gbz cut only follows when asked
export function cutsWholeWalks() {
  const m = layoutModeByValue(settings.mode)
  return m.wholeWalks || (settings.walkStrip && m.drawsNodes)
}

export function hiddenEdges() {
  return new Set(
    settings.showDeletionEdges ? [] : current().deletions.map(d => d.edgeIndex),
  )
}

export function clearInteraction() {
  state.hoveredNode = null
  state.stripHover = false
  state.hoveredEdge = null
  state.selectedNode = null
}
