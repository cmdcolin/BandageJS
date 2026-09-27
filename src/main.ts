import {
  BUBBLE_KIND_NAMES,
  BUBBLE_SPREADS,
  COLOR_SCHEMES,
  Canvas2DRenderer,
  LAYOUT_MODES,
  NODE_WIDTHS,
  ROW_HEIGHT_PX,
  bubbleHalos,
  bubbleSegmentIds,
  bubbleSubgraph,
  bubblesFromGraph,
  buildGeometry,
  classifyBubble,
  clampZoom,
  computeReferenceRamp,
  deletionEdges,
  drawingBounds,
  findHoveredEdge,
  findHoveredNode,
  fitTransform,
  forceLayout,
  getDpr,
  layoutLabels,
  layoutModeByValue,
  loadGraph,
  modeUsesLayoutEngine,
  nodeInk,
  pathColorsLegible,
  pathLegend,
  resolveColorScheme,
  walkHighlight,
  walkRows,
  walkRowsExtent,
  wheelZoomFactor,
} from '../graphgenomeviewer/src/core'
import { isSuperseded, workerEngine } from './engine'
import { HPRC, cutGbz } from './gbz'
import { menuBar } from './menus'
import { esc, legendsHtml, overlayHtml, overlaySvg } from './overlays'

import type { GbzSource } from './gbz'
import type { MenuItem } from './menus'

import type {
  Bounds,
  BubbleSpread,
  ColorScheme,
  Graph,
  GraphNode,
  LayoutModeValue,
  LayoutResult,
  MinigraphBubble,
  NodeWidth,
} from '../graphgenomeviewer/src/core'

const MAX_NODES =
  Number(new URLSearchParams(location.search).get('maxNodes')) || 20_000
const CONTIG_THICKNESS = 6
const CONNECTOR_THICKNESS = 2
const HOVER_BRIGHTEN = 1.4
const SELECT_BRIGHTEN = 1.6
const REBUILD_DEBOUNCE_MS = 150

function el<T extends HTMLElement>(id: string) {
  return document.getElementById(id) as T
}

const ui = {
  pane: el<HTMLDivElement>('pane'),
  canvas: el<HTMLCanvasElement>('graph'),
  svg: el<HTMLElement>('overlay-svg') as unknown as SVGSVGElement,
  html: el<HTMLDivElement>('overlay-html'),
  legends: el<HTMLDivElement>('legends'),
  tooltip: el<HTMLDivElement>('tooltip'),
  status: el<HTMLDivElement>('status'),
  back: el<HTMLButtonElement>('back'),
  empty: el<HTMLDivElement>('empty'),
  stats: el<HTMLSpanElement>('stats'),
  menus: el<HTMLElement>('menus'),
  file: el<HTMLInputElement>('file'),
  urlDialog: el<HTMLDialogElement>('url-dialog'),
  url: el<HTMLInputElement>('url'),
  gbzDialog: el<HTMLDialogElement>('gbz-dialog'),
  gbzDb: el<HTMLInputElement>('gbz-db'),
  gbzIndex: el<HTMLInputElement>('gbz-index'),
  gbzRegion: el<HTMLInputElement>('gbz-region'),
  gbzHaplotypes: el<HTMLInputElement>('gbz-haplotypes'),
}

interface Settings {
  mode: LayoutModeValue
  colorScheme: ColorScheme
  nodeWidth: NodeWidth
  quality: number
  bubbleSpread: BubbleSpread
  showBubbles: boolean
  showDeletionEdges: boolean
  drawPaths: boolean
}

const DEFAULTS: Settings = {
  mode: 'force',
  colorScheme: 'auto',
  nodeWidth: 'depth',
  quality: 2,
  bubbleSpread: 'auto',
  showBubbles: true,
  showDeletionEdges: false,
  drawPaths: false,
}

function loadSettings(): Settings {
  try {
    return {
      ...DEFAULTS,
      ...JSON.parse(localStorage.getItem('bandagejs-settings') ?? '{}'),
    }
  } catch {
    return { ...DEFAULTS }
  }
}

const settings = loadSettings()

function saveSettings() {
  try {
    localStorage.setItem('bandagejs-settings', JSON.stringify(settings))
  } catch {}
}

const state = {
  source: undefined as
    { text: string; name: string; region?: Region } | undefined,
  // the reference window a cut was made for, which the anchored layouts,
  // the ramp and the fit read
  region: undefined as Region | undefined,
  graph: undefined as Graph | undefined,
  stack: [] as { graph: Graph; mode: LayoutModeValue }[],
  layout: undefined as LayoutResult | undefined,
  referencePath: '',
  highlightedPath: '',
  scale: 1,
  translateX: 0,
  translateY: 0,
  owner: 'fit' as 'fit' | 'user',
  width: 0,
  height: 0,
  legendSize: { width: 0, height: 0 },
  hoveredNode: null as string | null,
  hoveredEdge: null as number | null,
  selectedNode: null as string | null,
  positionsVersion: 0,
  built: undefined as { scale: number; bounds: Bounds } | undefined,
  layoutMs: undefined as number | undefined,
  geometryMs: undefined as number | undefined,
}

type Region = { refName: string; start: number; end: number }

const renderer = new Canvas2DRenderer(ui.canvas)

// Facts about the graph on screen, recomputed only when it changes.
let derived = deriveGraph(undefined)

function deriveGraph(graph: Graph | undefined) {
  const nodeById = new Map<string, GraphNode>(graph?.nodes.map(n => [n.id, n]))
  const deletions = graph ? deletionEdges(graph) : []
  return {
    graph,
    nodeById,
    nodeLengths: new Map(graph?.nodes.map(n => [n.id, n.length])),
    deletions,
    deletionIndexes: new Map(deletions.map(d => [d.edgeIndex, d.bypassed])),
    bubbles: graph ? bubblesFromGraph(graph) : [],
    walkChoices: graph?.paths?.length ? pathLegend(graph.paths) : [],
  }
}

function graphDerived() {
  if (derived.graph !== state.graph) {
    derived = deriveGraph(state.graph)
  }
  return derived
}

const mode = () => layoutModeByValue(settings.mode).value
const pixelRows = () => state.layout?.pixelRows ?? false
const axis = () => ({
  scaleX: state.scale,
  scaleY: pixelRows() ? 1 : state.scale,
  pixelRows: pixelRows(),
})
const drawPaths = () =>
  settings.drawPaths && pathColorsLegible(state.graph?.paths?.length ?? 0)

function walkBars() {
  return mode() === 'walkrows' && state.graph
    ? walkRows(state.graph, state.region)
    : undefined
}

function highlight() {
  return state.graph && state.highlightedPath
    ? walkHighlight(state.graph, state.highlightedPath)
    : undefined
}

function hiddenEdges() {
  return new Set(
    settings.showDeletionEdges
      ? []
      : graphDerived().deletions.map(d => d.edgeIndex),
  )
}

function referenceRamp() {
  const scheme = resolveColorScheme(settings.colorScheme, state.graph)
  return scheme === 'reference-position' && state.graph
    ? computeReferenceRamp(state.graph, state.region)
    : undefined
}

function status(text: string, isError = false) {
  ui.status.textContent = text
  ui.status.hidden = text === ''
  ui.status.classList.toggle('error', isError)
}

// ---- loading ----------------------------------------------------------------

let liveOpen = 0

function openGFA(text: string, name: string, region?: Region) {
  try {
    status('Parsing GFA')
    const graph = loadGraph(text, name, {
      referencePath: state.referencePath || undefined,
      maxNodes: MAX_NODES,
    })
    state.source = { text, name, region }
    state.region = region
    state.graph = graph
    state.stack = []
    state.highlightedPath = ''
    clearInteraction()
    document.title = `${name} · BandageJS`
    ui.empty.hidden = true
    void relayout()
  } catch (e) {
    fail(e)
  }
}

function fail(e: unknown) {
  console.error(e)
  status(e instanceof Error ? e.message : String(e), true)
}

async function openUrl(url: string) {
  const open = ++liveOpen
  status(`Fetching ${url}`)
  try {
    const res = await fetch(url)
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} fetching ${url}`)
    }
    const text = await res.text()
    if (open === liveOpen) {
      openGFA(text, url.split('/').pop() || url)
    }
  } catch (e) {
    fail(e)
  }
}

async function openGbz(src: GbzSource) {
  const open = ++liveOpen
  try {
    const { text, region } = await cutGbz(src, status)
    if (open === liveOpen) {
      openGFA(text, src.region, { ...region })
    }
  } catch (e) {
    if (open === liveOpen) {
      fail(e)
    }
  }
}

async function openFile(file: File) {
  ++liveOpen
  setQuery({})
  state.referencePath = ''
  openGFA(await file.text(), file.name)
}

// a shared link opens its graph in the layout it was shared in
function setQuery(params: Record<string, string>) {
  const query = new URLSearchParams(
    Object.keys(params).length ? { ...params, layout: settings.mode } : {},
  ).toString()
  history.replaceState(null, '', query ? `?${query}` : location.pathname)
}

function gbzQuery(src: GbzSource) {
  return {
    gbz: src.db === HPRC.db ? 'hprc' : src.db,
    ...(src.index && src.db !== HPRC.db ? { index: src.index } : {}),
    loc: src.region,
    ...(src.haplotypes?.length ? { haps: src.haplotypes.join(',') } : {}),
  }
}

function gbzFromQuery(params: URLSearchParams): GbzSource | undefined {
  const db = params.get('gbz')
  const loc = params.get('loc')
  if (!db || !loc) {
    return undefined
  }
  const haps = params.get('haps')
  return {
    ...(db === 'hprc' ? HPRC : { db, index: params.get('index') ?? undefined }),
    region: loc,
    haplotypes: haps ? haps.split(',') : undefined,
  }
}

function loadGbz(src: GbzSource) {
  setQuery(gbzQuery(src))
  state.referencePath = ''
  void openGbz(src)
}

function loadUrl(url: string) {
  setQuery({ gfa: url })
  state.referencePath = ''
  void openUrl(url)
}

// ---- layout -------------------------------------------------------------------

const forceCache = new WeakMap<Graph, Map<string, LayoutResult>>()
let liveLayout = 0

async function relayout() {
  const graph = state.graph
  if (!graph) {
    return
  }
  const request = ++liveLayout
  const start = performance.now()
  try {
    let result = layoutModeByValue(settings.mode).run(graph, state.region)
    let duration = performance.now() - start
    if (!result) {
      const key = `${settings.quality}|${settings.bubbleSpread}`
      const cache = forceCache.get(graph) ?? new Map<string, LayoutResult>()
      forceCache.set(graph, cache)
      result = cache.get(key)
      if (!result) {
        status('Computing force-directed layout')
        const computed = await forceLayout(
          graph,
          {
            quality: settings.quality,
            linearLayout: false,
            bubbleSpread: settings.bubbleSpread,
          },
          workerEngine,
        )
        cache.set(key, computed.result)
        result = computed.result
        duration = computed.duration
      }
    }
    if (request === liveLayout && state.graph === graph) {
      state.layout = result
      state.layoutMs = duration
      state.owner = 'fit'
      state.positionsVersion++
      status('')
      fit()
      rebuild()
    }
  } catch (e) {
    if (!isSuperseded(e) && request === liveLayout) {
      console.error(e)
      status(`Layout failed: ${e instanceof Error ? e.message : e}`, true)
    }
  }
}

function bounds() {
  const bars = walkBars()
  return state.layout
    ? drawingBounds(state.layout, {
        region: state.stack.length === 0 ? state.region : undefined,
        extent: bars && state.layout.extent ? walkRowsExtent(bars) : undefined,
      })
    : undefined
}

function fit() {
  const b = bounds()
  const t = b
    ? fitTransform(b, state.width, state.height, pixelRows())
    : undefined
  if (t) {
    state.scale = t.scale
    state.translateX = t.translateX
    state.translateY = t.translateY
  }
}

// ---- drawing ------------------------------------------------------------------

function viewport(): Bounds {
  const { scaleX, scaleY } = axis()
  return {
    minX: -state.translateX / scaleX,
    minY: -state.translateY / scaleY,
    maxX: (state.width - state.translateX) / scaleX,
    maxY: (state.height - state.translateY) / scaleY,
  }
}

// the pane plus a pane each side, so an ordinary pan never runs out of drawing
function padded(v: Bounds): Bounds {
  const w = v.maxX - v.minX
  const h = v.maxY - v.minY
  return {
    minX: v.minX - w,
    minY: v.minY - h,
    maxX: v.maxX + w,
    maxY: v.maxY + h,
  }
}

function contains(outer: Bounds, inner: Bounds) {
  return (
    inner.minX >= outer.minX &&
    inner.maxX <= outer.maxX &&
    inner.minY >= outer.minY &&
    inner.maxY <= outer.maxY
  )
}

function rebuild() {
  const { graph, layout } = state
  renderer.resize(state.width, state.height)
  if (!graph || !layout) {
    state.built = undefined
    draw()
    return
  }
  const d = graphDerived()
  const start = performance.now()
  const viewportBounds = padded(viewport())
  const batch = buildGeometry({
    nodePositions: layout.nodePositions,
    graph,
    nodeById: d.nodeById,
    colorScheme: resolveColorScheme(settings.colorScheme, graph),
    contigThickness: CONTIG_THICKNESS,
    connectorThickness: CONNECTOR_THICKNESS,
    drawPaths: drawPaths(),
    nodeWidth: settings.nodeWidth,
    highlight: highlight(),
    axis: axis(),
    viewportBounds,
    referenceRamp: referenceRamp(),
    deletions: d.deletionIndexes,
    hiddenEdges: hiddenEdges(),
    version: state.positionsVersion,
  })
  renderer.uploadGeometry(batch)
  state.geometryMs = performance.now() - start
  state.built = { scale: state.scale, bounds: viewportBounds }
  draw()
}

let rebuildTimer: ReturnType<typeof setTimeout> | undefined

function viewportMoved() {
  const built = state.built
  if (
    !built ||
    built.scale !== state.scale ||
    !contains(built.bounds, viewport())
  ) {
    clearTimeout(rebuildTimer)
    rebuildTimer = setTimeout(rebuild, REBUILD_DEBOUNCE_MS)
  }
  scheduleDraw()
}

let drawFrame = 0

function scheduleDraw() {
  drawFrame ||= requestAnimationFrame(() => {
    drawFrame = 0
    draw()
  })
}

function draw() {
  const dpr = getDpr()
  const { scaleX, scaleY } = axis()
  const highlights = new Map<string, number>()
  if (state.selectedNode !== null) {
    highlights.set(state.selectedNode, SELECT_BRIGHTEN)
  }
  if (state.hoveredNode !== null && state.hoveredNode !== state.selectedNode) {
    highlights.set(state.hoveredNode, HOVER_BRIGHTEN)
  }
  renderer.setNodeHighlights(highlights)
  renderer.setEdgeHighlight(state.hoveredEdge, HOVER_BRIGHTEN)
  renderer.updateTransform({
    scaleX: scaleX * dpr,
    scaleY: scaleY * dpr,
    translateX: state.translateX * dpr,
    translateY: state.translateY * dpr,
    dpr,
  })
  renderer.render([1, 1, 1, 1])
  drawOverlays()
  drawTooltip()
  drawStats()
}

function drawOverlays() {
  const { graph, layout } = state
  const d = graphDerived()
  const m = mode()
  const positions = layout?.nodePositions
  const onNodes = m !== 'variants' && m !== 'walkrows'
  const walkLabels = new Map(d.walkChoices.map(c => [c.name, c.label]))
  const halos =
    settings.showBubbles && onNodes && graph && positions
      ? bubbleHalos(
          graph,
          d.bubbles,
          positions,
          name => walkLabels.get(name) ?? name,
        )
      : []
  const glyphs =
    m === 'variants'
      ? d.bubbles.map(bubble => ({ bubble, ...classifyBubble(bubble) }))
      : []
  const bars = walkBars()
  const rowLabels = bars
    ? [bars.reference, ...bars.rows].map((row, i) => ({
        label: row.label,
        y: i * ROW_HEIGHT_PX,
      }))
    : (layout?.rowLabels ?? [])
  const { scaleX, scaleY } = axis()
  const labels = layoutLabels({
    paneWidth: state.width,
    canvasHeight: state.height,
    axisScale: axis(),
    translateX: state.translateX,
    translateY: state.translateY,
    contigThickness: CONTIG_THICKNESS,
    legendSize: state.legendSize,
    drawnRowLabels: rowLabels,
    bubbleHalos: halos,
    bubbleGlyphs: glyphs,
    genePins: [],
    poppedFrom: state.stack.length
      ? { label: `Back to ${state.stack.at(-1)!.graph.name}` }
      : undefined,
    nodePositions: positions,
    nodeLengths: d.nodeLengths,
    showDeletionEdges: settings.showDeletionEdges,
    deletions: d.deletions,
    alleleDeletions: layout?.alleleDeletions ?? [],
    positionsVersion: state.positionsVersion,
  })
  const pane = {
    width: state.width,
    height: state.height,
    scaleX,
    scaleY,
    translateX: state.translateX,
    translateY: state.translateY,
    contigThickness: CONTIG_THICKNESS,
    halos,
    glyphs,
    labels,
    rowLabels,
    walkBars: bars,
    highlight: highlight(),
  }
  ui.svg.setAttribute('width', String(state.width))
  ui.svg.setAttribute('height', String(state.height))
  ui.svg.innerHTML = layout ? overlaySvg(pane) : ''
  ui.html.innerHTML = layout ? overlayHtml(pane) : ''
  overlayBubbles = {
    halos: halos.map(h => h.bubble),
    glyphs: glyphs.map(g => g.bubble),
  }

  const ramp = referenceRamp()
  const h = highlight()
  ui.legends.innerHTML = layout
    ? legendsHtml({
        ramp: ramp
          ? { start: ramp.start, end: ramp.start + ramp.span }
          : undefined,
        paths:
          settings.drawPaths &&
          graph?.paths &&
          pathColorsLegible(graph.paths.length)
            ? pathLegend(graph.paths)
            : [],
        walkBars: bars,
        highlight: h,
        highlightLabel: h ? walkLabels.get(h.name) : undefined,
      })
    : ''
  const size = {
    width: ui.legends.offsetWidth,
    height: ui.legends.offsetHeight,
  }
  if (
    size.width !== state.legendSize.width ||
    size.height !== state.legendSize.height
  ) {
    state.legendSize = size
    scheduleDraw()
  }
  ui.back.hidden = state.stack.length === 0
  if (state.stack.length) {
    ui.back.textContent = `◀ Back to ${state.stack.at(-1)!.graph.name}`
  }
}

let overlayBubbles = {
  halos: [] as MinigraphBubble[],
  glyphs: [] as MinigraphBubble[],
}

function drawTooltip() {
  const d = graphDerived()
  const node = state.hoveredNode ? d.nodeById.get(state.hoveredNode) : undefined
  const edge =
    state.hoveredEdge !== null
      ? state.graph?.edges[state.hoveredEdge]
      : undefined
  let html = ''
  if (node) {
    html = `<strong>${esc(node.name)}</strong> — length: ${node.length.toLocaleString()}, depth: ${node.depth.toFixed(1)}`
    if (node.stable) {
      html += `<br>${esc(node.stable.refName)}:${node.stable.start.toLocaleString()} (rank ${node.stable.rank})`
    }
  } else if (edge) {
    const deletion = d.deletions.find(x => x.edgeIndex === state.hoveredEdge)
    const name = (id: string) => esc(d.nodeById.get(id)?.name ?? id)
    html = deletion
      ? `<strong>Deletion</strong> ${deletion.bp.toLocaleString()} bp<br>${esc(deletion.refName)}:${deletion.start.toLocaleString()}-${deletion.end.toLocaleString()}`
      : `Edge: ${name(edge.from)}${edge.fromStrand ?? ''} → ${name(edge.to)}${edge.toStrand ?? ''}`
  }
  ui.tooltip.innerHTML = html
  ui.tooltip.hidden = html === ''
}

function drawStats() {
  const g = state.graph
  if (!g) {
    ui.stats.textContent = ''
    return
  }
  const parts = [
    `${g.nodes.length.toLocaleString()} nodes`,
    `${g.edges.length.toLocaleString()} edges`,
  ]
  if (g.paths?.length) {
    parts.push(`${g.paths.length.toLocaleString()} paths`)
  }
  if (state.layoutMs !== undefined) {
    parts.push(`layout ${state.layoutMs.toFixed(0)} ms`)
  }
  if (state.geometryMs !== undefined) {
    parts.push(`geometry ${state.geometryMs.toFixed(0)} ms`)
  }
  ui.stats.textContent = parts.join(' · ')
}

// ---- bubbles --------------------------------------------------------------------

function popBubble(bubble: MinigraphBubble) {
  const graph = state.graph
  if (!graph) {
    return
  }
  const sub = bubbleSubgraph(graph, bubbleSegmentIds(bubble))
  if (sub.nodes.length === 0) {
    status('None of the segments of this bubble are in the graph', true)
    return
  }
  state.stack.push({ graph, mode: settings.mode })
  state.graph = {
    ...sub,
    name: `${BUBBLE_KIND_NAMES[classifyBubble(bubble).kind]} at ${bubble.refName}:${bubble.start.toLocaleString()}`,
  }
  if (settings.mode === 'variants') {
    settings.mode = 'force'
  }
  clearInteraction()
  void relayout()
}

function unpopBubble() {
  const from = state.stack.pop()
  if (from) {
    state.graph = from.graph
    settings.mode = from.mode
    clearInteraction()
    void relayout()
  }
}

// ---- pointer --------------------------------------------------------------------

function clearInteraction() {
  state.hoveredNode = null
  state.hoveredEdge = null
  state.selectedNode = null
}

function toGraph(e: MouseEvent) {
  const rect = ui.canvas.getBoundingClientRect()
  const { scaleX, scaleY } = axis()
  return {
    x: (e.clientX - rect.left - state.translateX) / scaleX,
    y: (e.clientY - rect.top - state.translateY) / scaleY,
  }
}

function nodeAt(x: number, y: number) {
  const positions = state.layout?.nodePositions
  const d = graphDerived()
  return positions
    ? findHoveredNode(
        positions,
        x,
        y,
        axis(),
        state.positionsVersion,
        nodeInk(state.graph, d.nodeById, CONTIG_THICKNESS, settings.nodeWidth),
      )
    : null
}

let drag:
  | {
      kind: 'pan' | 'node'
      nodeId?: string
      x: number
      y: number
      moved: boolean
    }
  | undefined

ui.canvas.addEventListener('mousedown', e => {
  if (e.button !== 0) {
    return
  }
  const { x, y } = toGraph(e)
  const nodeId = nodeAt(x, y) ?? undefined
  drag = {
    kind: nodeId ? 'node' : 'pan',
    nodeId,
    x: e.clientX,
    y: e.clientY,
    moved: false,
  }
  ui.canvas.classList.add('dragging')
})

window.addEventListener('mousemove', e => {
  if (!drag) {
    return
  }
  const dx = e.clientX - drag.x
  const dy = e.clientY - drag.y
  drag.x = e.clientX
  drag.y = e.clientY
  if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
    drag.moved = true
  }
  const { scaleX, scaleY } = axis()
  const positions = drag.nodeId
    ? state.layout?.nodePositions[drag.nodeId]
    : undefined
  if (positions) {
    for (const seg of positions) {
      seg.x += dx / scaleX
      seg.y += dy / scaleY
    }
    state.positionsVersion++
    requestAnimationFrame(rebuild)
  } else if (drag.kind === 'pan') {
    state.owner = 'user'
    state.translateX += dx
    state.translateY += dy
    viewportMoved()
  }
})

window.addEventListener('mouseup', () => {
  drag = undefined
  ui.canvas.classList.remove('dragging')
})

let hoverFrame = 0

ui.canvas.addEventListener('mousemove', e => {
  if (drag) {
    return
  }
  cancelAnimationFrame(hoverFrame)
  hoverFrame = requestAnimationFrame(() => {
    const { graph, layout } = state
    if (!graph || !layout) {
      return
    }
    const { x, y } = toGraph(e)
    const node = nodeAt(x, y)
    const edge = node
      ? null
      : findHoveredEdge(
          layout.nodePositions,
          graph,
          x,
          y,
          axis(),
          drawPaths(),
          state.positionsVersion,
          graphDerived().deletionIndexes,
          hiddenEdges(),
        )
    if (node !== state.hoveredNode || edge !== state.hoveredEdge) {
      state.hoveredNode = node
      state.hoveredEdge = edge
      scheduleDraw()
    }
  })
})

ui.canvas.addEventListener('mouseleave', () => {
  cancelAnimationFrame(hoverFrame)
  state.hoveredNode = null
  state.hoveredEdge = null
  scheduleDraw()
})

ui.canvas.addEventListener('click', e => {
  if (drag?.moved) {
    return
  }
  const { x, y } = toGraph(e)
  state.selectedNode = nodeAt(x, y)
  scheduleDraw()
})

ui.canvas.addEventListener(
  'wheel',
  e => {
    e.preventDefault()
    const rect = ui.canvas.getBoundingClientRect()
    zoomAt(wheelZoomFactor(e), e.clientX - rect.left, e.clientY - rect.top)
  },
  { passive: false },
)

function zoomAt(factor: number, cx: number, cy: number) {
  state.owner = 'user'
  const next = clampZoom(state.scale * factor)
  const ratio = next / state.scale
  state.scale = next
  state.translateX = cx - (cx - state.translateX) * ratio
  // a row layout's y is screen px, unchanged by zoom
  if (!pixelRows()) {
    state.translateY = cy - (cy - state.translateY) * ratio
  }
  state.hoveredNode = null
  state.hoveredEdge = null
  viewportMoved()
}

// the overlay's clickable chips and glyphs open the bubble they name
ui.svg.addEventListener('click', e => {
  const target = (e.target as Element).closest('[data-halo],[data-glyph]')
  const halo = target?.getAttribute('data-halo')
  const glyph = target?.getAttribute('data-glyph')
  const bubble =
    halo != null
      ? overlayBubbles.halos[Number(halo)]
      : glyph != null
        ? overlayBubbles.glyphs[Number(glyph)]
        : undefined
  if (bubble) {
    popBubble(bubble)
  }
})

ui.back.addEventListener('click', unpopBubble)

new ResizeObserver(() => {
  state.width = ui.pane.clientWidth
  state.height = ui.pane.clientHeight
  if (state.owner === 'fit') {
    fit()
  }
  rebuild()
}).observe(ui.pane)

// ---- menus ----------------------------------------------------------------------

function apply(effect: 'layout' | 'geometry') {
  saveSettings()
  if (effect === 'layout') {
    void relayout()
  } else {
    rebuild()
  }
}

function radio<T extends string | number>(
  items: readonly { value: T; label: string; description?: string }[],
  current: T,
  set: (value: T) => void,
  effect: 'layout' | 'geometry',
  disabled: (value: T) => boolean = () => false,
): MenuItem[] {
  return items.map(i => ({
    label: i.label,
    title: i.description,
    radio: true,
    checked: i.value === current,
    disabled: disabled(i.value),
    onClick: () => {
      set(i.value)
      apply(effect)
    },
  }))
}

function toggle(
  label: string,
  key: 'showBubbles' | 'showDeletionEdges' | 'drawPaths',
  disabled = false,
): MenuItem {
  return {
    label,
    checked: settings[key],
    disabled,
    onClick: () => {
      settings[key] = !settings[key]
      apply('geometry')
    },
  }
}

type Example = {
  name: string
  description: string
  layout?: LayoutModeValue
} & ({ file: string } | { gbz: 'hprc'; region: string; haplotypes?: string[] })

let examples: Example[] = []

function openExample(x: Example) {
  if (x.layout) {
    settings.mode = x.layout
  }
  if ('file' in x) {
    loadUrl(`examples/${x.file}`)
  } else {
    loadGbz({ ...HPRC, region: x.region, haplotypes: x.haplotypes })
  }
}

function showGbzDialog() {
  const src = gbzFromQuery(new URLSearchParams(location.search))
  ui.gbzDb.value = src?.db ?? HPRC.db
  ui.gbzIndex.value = src?.index ?? HPRC.index ?? ''
  ui.gbzRegion.value ||= src?.region ?? 'chr6:160,614,798-160,647,758'
  ui.gbzHaplotypes.value ||=
    src?.haplotypes?.join(',') ??
    'HG00097,HG00128,HG01123,HG00099,HG01960,HG02055,HG00133,HG01109'
  ui.gbzDialog.showModal()
}

const QUALITIES = [0, 1, 2, 3, 4].map(q => ({
  value: q,
  label: `Quality ${q}`,
}))

menuBar(ui.menus, [
  {
    label: 'File',
    items: () => [
      { label: 'Open GFA file…', onClick: () => ui.file.click() },
      {
        label: 'Open GFA url…',
        onClick: () => {
          ui.urlDialog.showModal()
        },
      },
      { label: 'Open pangenome database…', onClick: showGbzDialog },
    ],
  },
  {
    label: 'Examples',
    items: () =>
      examples.map(x => ({
        label: x.name,
        title: x.description,
        onClick: () => {
          openExample(x)
        },
      })),
  },
  {
    label: 'Layout',
    items: () => {
      const graph = state.graph
      const engine = !!graph && modeUsesLayoutEngine(settings.mode, graph)
      return [
        ...radio(
          LAYOUT_MODES,
          settings.mode,
          v => {
            settings.mode = v
            const params = new URLSearchParams(location.search)
            if (params.has('layout')) {
              params.set('layout', v)
              history.replaceState(null, '', `?${params}`)
            }
          },
          'layout',
          v =>
            !!graph && !LAYOUT_MODES.find(m => m.value === v)!.available(graph),
        ),
        { header: 'Force-directed quality' },
        ...radio(
          QUALITIES,
          settings.quality,
          v => (settings.quality = v),
          'layout',
          () => !engine,
        ),
        { header: 'Bubble spread' },
        ...radio(
          BUBBLE_SPREADS,
          settings.bubbleSpread,
          v => (settings.bubbleSpread = v),
          'layout',
          () => !engine,
        ),
      ]
    },
  },
  {
    label: 'Colour',
    items: () => [
      ...radio(
        COLOR_SCHEMES,
        settings.colorScheme,
        v => (settings.colorScheme = v),
        'geometry',
      ),
      { header: 'Node width' },
      ...radio(
        NODE_WIDTHS,
        settings.nodeWidth,
        v => (settings.nodeWidth = v),
        'geometry',
      ),
    ],
  },
  {
    label: 'View',
    items: () => [
      toggle('Bubbles', 'showBubbles'),
      toggle('Deletion edges', 'showDeletionEdges'),
      toggle(
        'Path colours',
        'drawPaths',
        !pathColorsLegible(state.graph?.paths?.length ?? 0),
      ),
      { divider: true },
      {
        label: 'Fit to window',
        onClick: () => {
          state.owner = 'fit'
          fit()
          rebuild()
        },
      },
    ],
  },
  {
    label: 'Walks',
    items: () => {
      const graph = state.graph
      const walks = graphDerived().walkChoices
      const anchors =
        graph?.anchoredBy === 'paths' ? (graph.anchorPaths ?? []) : []
      const lift = (name: string, label: string): MenuItem => ({
        label,
        radio: true,
        checked: state.highlightedPath === name,
        onClick: () => {
          state.highlightedPath = name
          rebuild()
        },
      })
      return [
        { header: walks.length ? 'Lift a walk' : 'This graph has no walks' },
        ...(walks.length ? [lift('', 'None')] : []),
        ...walks.map(w => lift(w.name, w.label)),
        ...(anchors.length > 1
          ? [
              { header: 'Reference path' } as MenuItem,
              ...anchors.map((a): MenuItem => ({
                label: a.name,
                radio: true,
                checked: graph?.referencePath === a.name,
                onClick: () => {
                  state.referencePath = a.name
                  const src = state.source
                  if (src) {
                    openGFA(src.text, src.name, src.region)
                  }
                },
              })),
            ]
          : []),
      ]
    },
  },
])

ui.file.addEventListener('change', () => {
  const file = ui.file.files?.[0]
  if (file) {
    void openFile(file)
  }
  ui.file.value = ''
})

ui.urlDialog.addEventListener('close', () => {
  const url = ui.url.value.trim()
  if (ui.urlDialog.returnValue === 'open' && url) {
    loadUrl(url)
  }
})

ui.gbzDialog.addEventListener('close', () => {
  if (ui.gbzDialog.returnValue === 'open') {
    const haps = ui.gbzHaplotypes.value.split(/[\s,]+/).filter(h => h !== '')
    loadGbz({
      db: ui.gbzDb.value.trim(),
      index: ui.gbzIndex.value.trim() || undefined,
      region: ui.gbzRegion.value.trim(),
      haplotypes: haps.length ? haps : undefined,
    })
  }
})

window.addEventListener('dragover', e => {
  e.preventDefault()
  document.body.classList.add('dropping')
})
window.addEventListener('dragleave', () => {
  document.body.classList.remove('dropping')
})
window.addEventListener('drop', e => {
  e.preventDefault()
  document.body.classList.remove('dropping')
  const file = e.dataTransfer?.files[0]
  if (file) {
    void openFile(file)
  }
})

examples = await fetch('examples/index.json')
  .then(res => res.json() as Promise<Example[]>)
  .catch(() => [])
const params = new URLSearchParams(location.search)
const layout = LAYOUT_MODES.find(m => m.value === params.get('layout'))
if (layout) {
  settings.mode = layout.value
}
const gfa = params.get('gfa')
const gbz = gbzFromQuery(params)
if (gbz) {
  void openGbz(gbz)
} else if (gfa) {
  void openUrl(gfa)
} else if (examples[0]) {
  openExample(examples[0])
}
