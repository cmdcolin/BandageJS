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
import { esc, legendsHtml, overlayHtml, overlaySvg } from './overlays'

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
  file: el<HTMLInputElement>('file'),
  url: el<HTMLInputElement>('url'),
  urlForm: el<HTMLFormElement>('url-form'),
  example: el<HTMLSelectElement>('example'),
  layout: el<HTMLSelectElement>('layout'),
  color: el<HTMLSelectElement>('color'),
  nodeWidth: el<HTMLSelectElement>('node-width'),
  quality: el<HTMLSelectElement>('quality'),
  spread: el<HTMLSelectElement>('spread'),
  walk: el<HTMLSelectElement>('walk'),
  reference: el<HTMLSelectElement>('reference'),
  bubbles: el<HTMLInputElement>('bubbles'),
  deletions: el<HTMLInputElement>('deletions'),
  paths: el<HTMLInputElement>('paths'),
  fit: el<HTMLButtonElement>('fit'),
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
  source: undefined as { text: string; name: string } | undefined,
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
    ? walkRows(state.graph)
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
    ? computeReferenceRamp(state.graph, undefined)
    : undefined
}

function status(text: string, isError = false) {
  ui.status.textContent = text
  ui.status.hidden = text === ''
  ui.status.classList.toggle('error', isError)
}

// ---- loading ----------------------------------------------------------------

function openGFA(text: string, name: string) {
  try {
    status('Parsing GFA')
    const graph = loadGraph(text, name, {
      referencePath: state.referencePath || undefined,
      maxNodes: MAX_NODES,
    })
    state.source = { text, name }
    state.graph = graph
    state.stack = []
    state.highlightedPath = ''
    clearInteraction()
    document.title = `${name} · BandageJS`
    ui.empty.hidden = true
    syncControls()
    void relayout()
  } catch (e) {
    status(String(e instanceof Error ? e.message : e), true)
  }
}

async function openUrl(url: string) {
  status(`Fetching ${url}`)
  try {
    const res = await fetch(url)
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} fetching ${url}`)
    }
    openGFA(await res.text(), url.split('/').pop() || url)
  } catch (e) {
    status(String(e instanceof Error ? e.message : e), true)
  }
}

function setQuery(gfa: string | undefined) {
  const params = new URLSearchParams(location.search)
  if (gfa) {
    params.set('gfa', gfa)
  } else {
    params.delete('gfa')
  }
  const query = params.toString()
  history.replaceState(null, '', query ? `?${query}` : location.pathname)
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
    let result = layoutModeByValue(settings.mode).run(graph)
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
  syncControls()
  void relayout()
}

function unpopBubble() {
  const from = state.stack.pop()
  if (from) {
    state.graph = from.graph
    settings.mode = from.mode
    clearInteraction()
    syncControls()
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

// ---- controls -------------------------------------------------------------------

function options(
  select: HTMLSelectElement,
  items: readonly { value: string; label: string; description?: string }[],
) {
  select.innerHTML = items
    .map(
      i =>
        `<option value="${esc(i.value)}"${i.description ? ` title="${esc(i.description)}"` : ''}>${esc(i.label)}</option>`,
    )
    .join('')
}

options(ui.layout, LAYOUT_MODES)
options(ui.color, COLOR_SCHEMES)
options(ui.nodeWidth, NODE_WIDTHS)
options(ui.spread, BUBBLE_SPREADS)
options(
  ui.quality,
  [0, 1, 2, 3, 4].map(q => ({ value: String(q), label: `Quality ${q}` })),
)

function syncControls() {
  const graph = state.graph
  for (const option of ui.layout.options) {
    const m = LAYOUT_MODES.find(x => x.value === option.value)
    option.disabled = !!graph && !!m && !m.available(graph)
  }
  ui.layout.value = settings.mode
  ui.color.value = settings.colorScheme
  ui.nodeWidth.value = settings.nodeWidth
  ui.quality.value = String(settings.quality)
  ui.spread.value = settings.bubbleSpread
  ui.bubbles.checked = settings.showBubbles
  ui.deletions.checked = settings.showDeletionEdges
  ui.paths.checked = settings.drawPaths
  const engine = !!graph && modeUsesLayoutEngine(settings.mode, graph)
  ui.quality.disabled = !engine
  ui.spread.disabled = !engine
  ui.paths.disabled = !pathColorsLegible(graph?.paths?.length ?? 0)

  const walks = graphDerived().walkChoices
  ui.walk.innerHTML =
    `<option value="">No walk lifted</option>` +
    walks
      .map(w => `<option value="${esc(w.name)}">${esc(w.label)}</option>`)
      .join('')
  ui.walk.value = state.highlightedPath
  ui.walk.disabled = walks.length === 0

  const anchors = graph?.anchoredBy === 'paths' ? (graph.anchorPaths ?? []) : []
  ui.reference.innerHTML = anchors
    .map(p => `<option value="${esc(p.name)}">${esc(p.name)}</option>`)
    .join('')
  ui.reference.value = graph?.referencePath ?? ''
  ui.reference.disabled = anchors.length < 2
  ui.reference.parentElement!.hidden = anchors.length === 0
}

function onChange<T extends HTMLElement>(
  input: T,
  apply: (input: T) => 'layout' | 'geometry',
) {
  input.addEventListener('change', () => {
    const effect = apply(input)
    saveSettings()
    syncControls()
    if (effect === 'layout') {
      void relayout()
    } else {
      rebuild()
    }
  })
}

onChange(ui.layout, s => {
  settings.mode = s.value as LayoutModeValue
  return 'layout'
})
onChange(ui.quality, s => {
  settings.quality = Number(s.value)
  return 'layout'
})
onChange(ui.spread, s => {
  settings.bubbleSpread = s.value as BubbleSpread
  return 'layout'
})
onChange(ui.color, s => {
  settings.colorScheme = s.value as ColorScheme
  return 'geometry'
})
onChange(ui.nodeWidth, s => {
  settings.nodeWidth = s.value as NodeWidth
  return 'geometry'
})
onChange(ui.bubbles, c => {
  settings.showBubbles = c.checked
  return 'geometry'
})
onChange(ui.deletions, c => {
  settings.showDeletionEdges = c.checked
  return 'geometry'
})
onChange(ui.paths, c => {
  settings.drawPaths = c.checked
  return 'geometry'
})
onChange(ui.walk, s => {
  state.highlightedPath = s.value
  return 'geometry'
})

ui.reference.addEventListener('change', () => {
  state.referencePath = ui.reference.value
  if (state.source) {
    openGFA(state.source.text, state.source.name)
  }
})

ui.fit.addEventListener('click', () => {
  state.owner = 'fit'
  fit()
  rebuild()
})

ui.file.addEventListener('change', async () => {
  const file = ui.file.files?.[0]
  if (file) {
    setQuery(undefined)
    state.referencePath = ''
    openGFA(await file.text(), file.name)
  }
})

ui.urlForm.addEventListener('submit', e => {
  e.preventDefault()
  const url = ui.url.value.trim()
  if (url) {
    setQuery(url)
    state.referencePath = ''
    void openUrl(url)
  }
})

interface Example {
  file: string
  name: string
  description: string
  layout?: LayoutModeValue
}

async function loadExamples() {
  const examples = (await (
    await fetch('examples/index.json')
  ).json()) as Example[]
  ui.example.innerHTML =
    `<option value="">Examples…</option>` +
    examples
      .map(
        x =>
          `<option value="${esc(x.file)}" title="${esc(x.description)}">${esc(x.name)}</option>`,
      )
      .join('')
  ui.example.addEventListener('change', () => {
    const x = examples.find(x => x.file === ui.example.value)
    if (x) {
      if (x.layout) {
        settings.mode = x.layout
      }
      const url = `examples/${x.file}`
      setQuery(url)
      state.referencePath = ''
      void openUrl(url)
    }
  })
  return examples
}

window.addEventListener('dragover', e => {
  e.preventDefault()
  document.body.classList.add('dropping')
})
window.addEventListener('dragleave', () => {
  document.body.classList.remove('dropping')
})
window.addEventListener('drop', async e => {
  e.preventDefault()
  document.body.classList.remove('dropping')
  const file = e.dataTransfer?.files[0]
  if (file) {
    setQuery(undefined)
    state.referencePath = ''
    openGFA(await file.text(), file.name)
  }
})

syncControls()
const examples = await loadExamples().catch(() => [] as Example[])
const initial = new URLSearchParams(location.search).get('gfa')
if (initial) {
  ui.url.value = initial.startsWith('examples/') ? '' : initial
  ui.example.value = initial.replace(/^examples\//, '')
  void openUrl(initial)
} else if (examples[0]) {
  ui.example.value = examples[0].file
  if (examples[0].layout) {
    settings.mode = examples[0].layout
  }
  void openUrl(`examples/${examples[0].file}`)
}
