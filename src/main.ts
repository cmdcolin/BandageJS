import {
  BUBBLE_KIND_NAMES,
  BUBBLE_SPREADS,
  COLOR_SCHEMES,
  Canvas2DRenderer,
  FIT_PADDING,
  LAYOUT_MODES,
  NODE_WIDTHS,
  ROW_HEIGHT_PX,
  axisScaleOf,
  bubbleHalos,
  bubbleSegmentIds,
  bubbleSubgraph,
  bubblesFromGraph,
  buildGeometry,
  classifyBubble,
  computeReferenceRamp,
  contains,
  deletionEdges,
  drawTubeMap,
  drawingBounds,
  engineKey,
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
  padded,
  panSNContig,
  panSNHaplotype,
  pathColorsLegible,
  pathLegend,
  resolveColorScheme,
  screenToLayout,
  tubeMapFrame,
  tubeMapNodeAt,
  tubeMapPicture,
  viewportOf,
  walkHighlight,
  walkRows,
  walkRowsExtent,
  wheelZoomFactor,
  zoomAbout,
} from '../graphgenomeviewer/src/core'
import { cancelLayout, isSuperseded, workerEngine } from './engine'
import { HPRC, cutGbz, parseRegion } from './gbz'
import {
  backboneRegion,
  gfaViewLink,
  graphViewLink,
  nodeLink,
  regionLink,
} from './jbrowse'
import { menuBar } from './menus'
import { esc, legendsHtml, overlayHtml, overlaySvg } from './overlays'

import type { GbzSource } from './gbz'
import type { Region } from './jbrowse'
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
const FORCE_CACHE_SIZE = 4
const BUTTON_ZOOM = 1.5
// the layout modes a released plugin in the JBrowse portal accepts
const JBROWSE_MODES = new Set([
  'auto',
  'samplerows',
  'walkrows',
  'ordered',
  'variants',
  'force',
])

function el<T extends HTMLElement>(id: string) {
  return document.getElementById(id) as T
}

const ui = {
  pane: el<HTMLDivElement>('pane'),
  canvas: el<HTMLCanvasElement>('graph'),
  tube: el<HTMLCanvasElement>('tube'),
  svg: el<HTMLElement>('overlay-svg') as unknown as SVGSVGElement,
  html: el<HTMLDivElement>('overlay-html'),
  legends: el<HTMLDivElement>('legends'),
  info: el<HTMLDivElement>('info'),
  loading: el<HTMLDivElement>('loading'),
  loadingText: el<HTMLSpanElement>('loading-text'),
  loadingTime: el<HTMLSpanElement>('loading-time'),
  cancel: el<HTMLButtonElement>('cancel'),
  toast: el<HTMLDivElement>('toast'),
  toastText: el<HTMLSpanElement>('toast-text'),
  toastClose: el<HTMLButtonElement>('toast-close'),
  back: el<HTMLButtonElement>('back'),
  caption: el<HTMLDivElement>('caption'),
  hint: el<HTMLDivElement>('hint'),
  hintClose: el<HTMLButtonElement>('hint-close'),
  zoomIn: el<HTMLButtonElement>('zoom-in'),
  zoomOut: el<HTMLButtonElement>('zoom-out'),
  zoomFit: el<HTMLButtonElement>('zoom-fit'),
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

function stored<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw === null ? fallback : (JSON.parse(raw) as T)
  } catch {
    return fallback
  }
}

function store(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {}
}

const settings: Settings = {
  ...DEFAULTS,
  ...stored<Partial<Settings>>('bandagejs-settings', {}),
}

function saveSettings() {
  store('bandagejs-settings', settings)
}

// Where the graph on screen came from, so a reference change can re-read it
// and a JBrowse link can name it.
interface Source {
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
  // the reference sample a gbz cut was made on
  sample?: string
}

const state = {
  source: undefined as Source | undefined,
  // the source's region while it applies, which the anchored layouts, the
  // ramp and the fit read
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

const renderer = new Canvas2DRenderer(ui.canvas)

const EMPTY_BATCH: Parameters<Canvas2DRenderer['uploadGeometry']>[0] = {
  nodeStrokes: [],
  nodeStrokeRuns: new Map(),
  arrows: [],
  arrowRuns: new Map(),
  edgeCurves: [],
  edgeCurveRuns: new Map(),
}

// ---- derived --------------------------------------------------------------------

// The last value of `fn`, recomputed when any of `keys` changes identity.
function memo<K extends unknown[], T>(fn: (...keys: K) => T) {
  let last: { keys: K; value: T } | undefined
  return (...keys: K) => {
    if (!last || keys.some((k, i) => k !== last!.keys[i])) {
      last = { keys, value: fn(...keys) }
    }
    return last.value
  }
}

const graphFacts = memo((graph: Graph | undefined) => {
  const deletions = graph ? deletionEdges(graph) : []
  const walkChoices = graph?.paths?.length ? pathLegend(graph.paths) : []
  return {
    nodeById: new Map<string, GraphNode>(graph?.nodes.map(n => [n.id, n])),
    nodeLengths: new Map(graph?.nodes.map(n => [n.id, n.length])),
    allDeletions: deletions,
    bubbles: graph ? bubblesFromGraph(graph) : [],
    walkChoices,
    walkLabels: new Map(walkChoices.map(c => [c.name, c.label])),
  }
})

const facts = () => graphFacts(state.graph)

const inkOf = memo((graph: Graph | undefined, width: NodeWidth) =>
  nodeInk(graph, graphFacts(graph).nodeById, CONTIG_THICKNESS, width),
)

const mode = () => layoutModeByValue(settings.mode).value
const pixelRows = () => state.layout?.pixelRows ?? false
const axis = () => axisScaleOf(state.scale, pixelRows())
const tube = () => state.layout?.tubeMap

// What the layout on screen draws besides its nodes, recomputed when the
// layout, its positions or a setting it reads changes rather than per frame.
const drawn = memo(
  (
    graph: Graph | undefined,
    layout: LayoutResult | undefined,
    _positions: number,
    m: string,
    showBubbles: boolean,
    scheme: ColorScheme,
    highlightedPath: string,
    region: Region | undefined,
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

const current = () =>
  drawn(
    state.graph,
    state.layout,
    state.positionsVersion,
    mode(),
    settings.showBubbles,
    settings.colorScheme,
    state.highlightedPath,
    state.region,
  )

const drawPaths = () =>
  (settings.drawPaths || !!tube()) &&
  pathColorsLegible(state.graph?.paths?.length ?? 0)

function hiddenEdges() {
  return new Set(
    settings.showDeletionEdges ? [] : current().deletions.map(d => d.edgeIndex),
  )
}

// ---- feedback ---------------------------------------------------------------------

let loadingSince = 0
let loadingTimer: ReturnType<typeof setInterval> | undefined

function progress(text: string) {
  if (ui.loading.hidden) {
    loadingSince = performance.now()
    clearInterval(loadingTimer)
    loadingTimer = setInterval(() => {
      ui.loadingTime.textContent = `${((performance.now() - loadingSince) / 1000).toFixed(0)} s`
    }, 500)
  }
  ui.loadingText.textContent = text
  ui.loadingTime.textContent = ''
  ui.loading.hidden = false
  ui.pane.classList.add('busy')
}

function done() {
  clearInterval(loadingTimer)
  ui.loading.hidden = true
  ui.pane.classList.remove('busy')
}

function notify(text: string, isError = true) {
  ui.toastText.textContent = text
  ui.toast.classList.toggle('error', isError)
  ui.toast.hidden = false
}

function fail(e: unknown) {
  console.error(e)
  done()
  notify(e instanceof Error ? e.message : String(e))
}

ui.toastClose.addEventListener('click', () => {
  ui.toast.hidden = true
})

// ---- loading ------------------------------------------------------------------------

let liveOpen = 0
let openAbort: AbortController | undefined

function beginOpen() {
  openAbort?.abort()
  openAbort = new AbortController()
  const open = ++liveOpen
  ui.toast.hidden = true
  return { live: () => open === liveOpen, signal: openAbort.signal }
}

function openGFA(text: string, source: Omit<Source, 'text'>) {
  try {
    progress('Parsing GFA')
    const graph = loadGraph(text, source.name, {
      referencePath: state.referencePath || undefined,
      maxNodes: MAX_NODES,
    })
    // the path a walk-anchored cut is first drawn along is the one its region
    // is on
    const regionPath =
      source.regionPath ??
      (source.region && graph.anchoredBy === 'paths'
        ? graph.referencePath
        : undefined)
    state.source = { ...source, regionPath, text }
    state.region =
      source.region && (!regionPath || graph.referencePath === regionPath)
        ? source.region
        : undefined
    state.graph = graph
    state.layout = undefined
    state.stack = []
    state.highlightedPath = ''
    clearInteraction()
    document.title = `${source.name} · BandageJS`
    ui.empty.hidden = true
    showCaption()
    void relayout()
    return true
  } catch (e) {
    fail(e)
    return false
  }
}

function readError(e: unknown, url: string) {
  return e instanceof TypeError
    ? new Error(
        `Couldn't read ${url}: the url may be wrong, or its server may not allow cross-origin requests.`,
      )
    : e
}

async function openUrl(
  url: string,
  extra: {
    description?: string
    region?: Region
    query?: Record<string, string>
  } = {},
) {
  const { live, signal } = beginOpen()
  progress(`Fetching ${url.split('/').pop() || url}`)
  try {
    const res = await fetch(url, { signal }).catch((e: unknown) => {
      throw readError(e, url)
    })
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} fetching ${url}`)
    }
    const text = await res.text()
    const absolute = new URL(url, location.href)
    if (
      live() &&
      openGFA(text, {
        name: url.split('/').pop() || url,
        description: extra.description,
        region: extra.region,
        url: absolute.protocol.startsWith('http') ? absolute.href : undefined,
      })
    ) {
      setQuery(extra.query ?? { gfa: url })
    }
  } catch (e) {
    if (live() && !signal.aborted) {
      fail(e)
    }
  }
}

async function openGbz(src: GbzSource, description?: string) {
  const { live, signal } = beginOpen()
  try {
    parseRegion(src.region)
    const { text, region, sample } = await cutGbz(
      src,
      text => {
        if (live()) {
          progress(text)
        }
      },
      signal,
    )
    if (!live()) {
      return
    }
    if (
      openGFA(text, {
        name: `${sample} ${src.region}`,
        description,
        region,
        gbz: src,
        sample,
      })
    ) {
      setQuery(gbzQuery(src))
    }
  } catch (e) {
    if (live() && !signal.aborted) {
      fail(readError(e, src.db))
    }
  }
}

async function openFile(file: File) {
  const { live } = beginOpen()
  progress(`Reading ${file.name}`)
  try {
    const text = await file.text()
    state.referencePath = ''
    if (live() && openGFA(text, { name: file.name })) {
      setQuery({})
    }
  } catch (e) {
    if (live()) {
      fail(e)
    }
  }
}

// a shared link opens its graph in the layout it was shared in
function setQuery(params: Record<string, string>) {
  const query = new URLSearchParams(
    Object.keys(params).length ? { ...params, layout: settings.mode } : {},
  ).toString()
  history.replaceState(null, '', query ? `?${query}` : location.pathname)
}

function gbzQuery(src: GbzSource): Record<string, string> {
  const preset = src.db === HPRC.db && src.index === HPRC.index
  return {
    gbz: preset ? 'hprc' : src.db,
    ...(!preset && src.index ? { index: src.index } : {}),
    loc: src.region,
    ...(src.referenceSample ? { ref: src.referenceSample } : {}),
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
    referenceSample: params.get('ref') ?? undefined,
    haplotypes: haps ? haps.split(',') : undefined,
  }
}

function loadGbz(src: GbzSource, description?: string) {
  state.referencePath = ''
  void openGbz(src, description)
}

function loadUrl(url: string, extra?: Parameters<typeof openUrl>[1]) {
  state.referencePath = ''
  void openUrl(url, extra)
}

// ---- layout ---------------------------------------------------------------------------

// Force layouts by graph and settings, in flight or done, so leaving a slow
// layout for a local one and coming back picks it up rather than restarting.
const forceCache = new WeakMap<
  Graph,
  Map<string, Promise<{ result: LayoutResult; duration: number }>>
>()
let liveLayout = 0

function forceOf(graph: Graph) {
  const engine = {
    quality: settings.quality,
    linearLayout: false,
    bubbleSpread: settings.bubbleSpread,
  }
  const key = engineKey(graph, engine)
  let cache = forceCache.get(graph)
  if (!cache) {
    cache = new Map()
    forceCache.set(graph, cache)
  }
  let layout = cache.get(key)
  if (!layout) {
    if (cache.size >= FORCE_CACHE_SIZE) {
      cache.delete(cache.keys().next().value!)
    }
    const started = performance.now()
    layout = forceLayout(graph, engine, workerEngine).then(r => ({
      ...r,
      duration: r.duration || performance.now() - started,
    }))
    const entries = cache
    layout.catch(() => entries.delete(key))
    cache.set(key, layout)
  }
  return layout
}

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
      progress('Computing force-directed layout')
      ;({ result, duration } = await forceOf(graph))
    }
    if (request === liveLayout && state.graph === graph) {
      state.layout = result
      state.layoutMs = duration
      state.owner = 'fit'
      state.positionsVersion++
      done()
      fit()
      rebuild()
    }
  } catch (e) {
    if (!isSuperseded(e) && request === liveLayout) {
      fail(new Error(`Layout failed: ${e instanceof Error ? e.message : e}`))
    }
  }
}

function cancel() {
  const drawing = !!state.layout
  openAbort?.abort()
  liveOpen++
  liveLayout++
  cancelLayout()
  done()
  if (state.graph && !drawing) {
    notify('Layout cancelled. Pick a faster one from the Layout menu.', false)
  }
}

ui.cancel.addEventListener('click', cancel)

function bounds() {
  const { bars } = current()
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

// ---- drawing ------------------------------------------------------------------------------

const viewport = () => viewportOf(state, axis(), state.width, state.height)

function rebuild() {
  const { graph, layout } = state
  renderer.resize(state.width, state.height)
  if (!graph || !layout || layout.tubeMap) {
    renderer.uploadGeometry(EMPTY_BATCH)
    state.built = undefined
    draw()
    return
  }
  const d = current()
  const start = performance.now()
  const viewportBounds = padded(viewport(), 1)
  const batch = buildGeometry({
    nodePositions: layout.nodePositions,
    graph,
    nodeById: facts().nodeById,
    colorScheme: resolveColorScheme(settings.colorScheme, graph),
    contigThickness: CONTIG_THICKNESS,
    connectorThickness: CONNECTOR_THICKNESS,
    drawPaths: drawPaths(),
    nodeWidth: settings.nodeWidth,
    highlight: d.highlight,
    axis: axis(),
    viewportBounds,
    referenceRamp: d.ramp,
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
    !tube() &&
    (!built ||
      built.scale !== state.scale ||
      !contains(built.bounds, viewport()))
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

function tubeFrame() {
  const drawing = tube()
  const { scaleX, scaleY } = axis()
  return drawing
    ? tubeMapFrame(drawing, {
        scaleX,
        translateX: state.translateX,
        scaleY,
        translateY: state.translateY,
        usableHeight: state.height - FIT_PADDING * 2,
      })
    : undefined
}

function drawTube() {
  const { picture } = current()
  const frame = tubeFrame()
  ui.tube.hidden = !picture
  if (!picture || !frame) {
    return
  }
  const dpr = getDpr()
  ui.tube.width = Math.round(state.width * dpr)
  ui.tube.height = Math.round(state.height * dpr)
  ui.tube.style.width = `${state.width}px`
  ui.tube.style.height = `${state.height}px`
  const ctx = ui.tube.getContext('2d')!
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, state.width, state.height)
  drawTubeMap(ctx, picture, {
    ...frame,
    width: state.width,
    highlightNode: state.hoveredNode ?? state.selectedNode,
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
  drawTube()
  drawOverlays()
  drawInfo()
  drawStats()
}

let overlayBubbles = {
  halos: [] as MinigraphBubble[],
  glyphs: [] as MinigraphBubble[],
}

function drawOverlays() {
  const { graph, layout } = state
  const f = facts()
  const d = current()
  const { scaleX, scaleY } = axis()
  const labels = layoutLabels({
    paneWidth: state.width,
    canvasHeight: state.height,
    axisScale: axis(),
    translateX: state.translateX,
    translateY: state.translateY,
    contigThickness: CONTIG_THICKNESS,
    legendSize: state.legendSize,
    drawnRowLabels: d.rowLabels,
    bubbleHalos: d.halos,
    bubbleGlyphs: d.glyphs,
    genePins: [],
    poppedFrom: state.stack.length
      ? { label: `Back to ${state.stack.at(-1)!.graph.name}` }
      : undefined,
    nodePositions: layout?.nodePositions,
    labelsNodeSizes: !layout?.tubeMap,
    nodeLengths: f.nodeLengths,
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
    halos: d.halos,
    glyphs: d.glyphs,
    labels,
    rowLabels: d.rowLabels,
    walkBars: d.bars,
    regionEnd: state.region?.end,
    highlight: d.highlight,
  }
  ui.svg.setAttribute('width', String(state.width))
  ui.svg.setAttribute('height', String(state.height))
  ui.svg.innerHTML = layout ? overlaySvg(pane) : ''
  ui.html.innerHTML = layout ? overlayHtml(pane) : ''
  overlayBubbles = {
    halos: d.halos.map(h => h.bubble),
    glyphs: d.glyphs.map(g => g.bubble),
  }

  const ramp = d.ramp
  ui.legends.innerHTML = layout
    ? legendsHtml({
        ramp: ramp
          ? {
              start: ramp.start,
              end: ramp.start + ramp.span,
              refName: state.region?.refName,
            }
          : undefined,
        paths: drawPaths() && graph?.paths ? pathLegend(graph.paths) : [],
        walkBars: d.bars,
        highlight: d.highlight,
        highlightLabel: d.highlight
          ? f.walkLabels.get(d.highlight.name)
          : undefined,
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

function nodeHtml(node: GraphNode) {
  let html = `<strong>${esc(node.name)}</strong> — ${node.length.toLocaleString()} bp, depth ${node.depth.toFixed(1)}`
  if (node.stable) {
    html += `<br>${esc(node.stable.refName)}:${node.stable.start.toLocaleString()} (rank ${node.stable.rank})`
  }
  return html
}

// The hover, else the selected node with where to open it.
function drawInfo() {
  const f = facts()
  const hovered = state.hoveredNode
    ? f.nodeById.get(state.hoveredNode)
    : undefined
  const edge =
    state.hoveredEdge !== null
      ? state.graph?.edges[state.hoveredEdge]
      : undefined
  const selected = state.selectedNode
    ? f.nodeById.get(state.selectedNode)
    : undefined
  let html = ''
  let interactive = false
  if (hovered && hovered !== selected) {
    html = nodeHtml(hovered)
  } else if (edge && !selected) {
    const deletion = current().deletions.find(
      x => x.edgeIndex === state.hoveredEdge,
    )
    const name = (id: string) => esc(f.nodeById.get(id)?.name ?? id)
    html = deletion
      ? `<strong>Deletion</strong> ${deletion.bp.toLocaleString()} bp<br>${esc(deletion.refName)}:${deletion.start.toLocaleString()}-${deletion.end.toLocaleString()}`
      : `Edge: ${name(edge.from)}${edge.fromStrand ?? ''} → ${name(edge.to)}${edge.toStrand ?? ''}`
  } else if (selected) {
    const link = nodeLink(selected)
    html = `${nodeHtml(selected)}<div class="info-actions">${
      link
        ? `<a href="${esc(link)}" target="_blank" rel="noopener">Show in JBrowse ↗</a>`
        : ''
    }<button type="button" data-close aria-label="Deselect">✕</button></div>`
    interactive = true
  }
  ui.info.innerHTML = html
  ui.info.hidden = html === ''
  ui.info.classList.toggle('interactive', interactive)
}

ui.info.addEventListener('click', e => {
  if ((e.target as Element).closest('[data-close]')) {
    state.selectedNode = null
    scheduleDraw()
  }
})

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

function showCaption() {
  const graph = state.graph
  const src = state.source
  ui.caption.hidden = !graph
  if (graph) {
    ui.caption.innerHTML = `<strong>${esc(graph.name)}</strong>${
      src?.description && graph.name === src.name
        ? `<span>${esc(src.description)}</span>`
        : ''
    }`
  }
}

// ---- bubbles ------------------------------------------------------------------------------

function popBubble(bubble: MinigraphBubble) {
  const graph = state.graph
  if (!graph) {
    return
  }
  const sub = bubbleSubgraph(graph, bubbleSegmentIds(bubble))
  if (sub.nodes.length === 0) {
    notify('None of the segments of this bubble are in the graph')
    return
  }
  state.stack.push({ graph, mode: settings.mode })
  state.graph = {
    ...sub,
    name: `${BUBBLE_KIND_NAMES[classifyBubble(bubble).kind]} at ${bubble.refName}:${bubble.start.toLocaleString()}`,
  }
  state.layout = undefined
  if (settings.mode === 'variants') {
    settings.mode = 'force'
  }
  clearInteraction()
  showCaption()
  void relayout()
}

function unpopBubble() {
  const from = state.stack.pop()
  if (from) {
    state.graph = from.graph
    state.layout = undefined
    settings.mode = from.mode
    clearInteraction()
    showCaption()
    void relayout()
  }
}

// ---- pointer ------------------------------------------------------------------------------

function clearInteraction() {
  state.hoveredNode = null
  state.hoveredEdge = null
  state.selectedNode = null
}

function local(e: { clientX: number; clientY: number }) {
  const rect = ui.canvas.getBoundingClientRect()
  return { x: e.clientX - rect.left, y: e.clientY - rect.top }
}

function nodeAtScreen(sx: number, sy: number) {
  const layout = state.layout
  const drawing = layout?.tubeMap
  if (drawing) {
    const frame = tubeFrame()
    return frame ? tubeMapNodeAt(drawing, frame, sx, sy) : null
  }
  if (!layout) {
    return null
  }
  const { x, y } = screenToLayout(sx, sy, state, axis())
  return findHoveredNode(
    layout.nodePositions,
    x,
    y,
    axis(),
    state.positionsVersion,
    inkOf(state.graph, settings.nodeWidth),
  )
}

function edgeAtScreen(sx: number, sy: number) {
  const { graph, layout } = state
  if (!graph || !layout || layout.tubeMap) {
    return null
  }
  const { x, y } = screenToLayout(sx, sy, state, axis())
  return findHoveredEdge(
    layout.nodePositions,
    graph,
    x,
    y,
    axis(),
    drawPaths(),
    state.positionsVersion,
    current().deletionIndexes,
    hiddenEdges(),
  )
}

function zoomAt(factor: number, cx: number, cy: number) {
  state.owner = 'user'
  Object.assign(state, zoomAbout(state, factor, cx, cy, pixelRows()))
  state.hoveredNode = null
  state.hoveredEdge = null
  viewportMoved()
}

function panBy(dx: number, dy: number) {
  state.owner = 'user'
  state.translateX += dx
  state.translateY += dy
  viewportMoved()
}

// One gesture per pointer set: a mouse drag on a node moves it, any other
// single-pointer drag pans, two touches pinch-zoom about their midpoint.
const pointers = new Map<number, { x: number; y: number }>()
let gesture:
  | { kind: 'pan' | 'node' | 'pinch'; nodeId?: string; moved: boolean }
  | undefined
let pinch: { dist: number; mid: { x: number; y: number } } | undefined

function pinchState() {
  const [a, b] = [...pointers.values()]
  return a && b
    ? {
        dist: Math.hypot(a.x - b.x, a.y - b.y),
        mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      }
    : undefined
}

ui.canvas.addEventListener('pointerdown', e => {
  if (e.button !== 0) {
    return
  }
  ui.canvas.setPointerCapture(e.pointerId)
  const p = local(e)
  pointers.set(e.pointerId, p)
  if (pointers.size === 1) {
    const nodeId =
      e.pointerType === 'mouse' && !tube()
        ? (nodeAtScreen(p.x, p.y) ?? undefined)
        : undefined
    gesture = { kind: nodeId ? 'node' : 'pan', nodeId, moved: false }
  } else if (pointers.size === 2) {
    gesture = { kind: 'pinch', moved: true }
    pinch = pinchState()
  }
  ui.canvas.classList.add('dragging')
})

ui.canvas.addEventListener('pointermove', e => {
  const p = local(e)
  const last = pointers.get(e.pointerId)
  if (!last || !gesture) {
    if (e.pointerType === 'mouse') {
      hoverAt(p.x, p.y)
    }
    return
  }
  pointers.set(e.pointerId, p)
  const dx = p.x - last.x
  const dy = p.y - last.y
  if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
    gesture.moved = true
  }
  if (gesture.kind === 'pinch') {
    const now = pinchState()
    if (now && pinch && pinch.dist > 0) {
      zoomAt(now.dist / pinch.dist, now.mid.x, now.mid.y)
      panBy(now.mid.x - pinch.mid.x, now.mid.y - pinch.mid.y)
    }
    pinch = now
  } else if (gesture.kind === 'node' && gesture.nodeId) {
    const segments = state.layout?.nodePositions[gesture.nodeId]
    const { scaleX, scaleY } = axis()
    for (const seg of segments ?? []) {
      seg.x += dx / scaleX
      seg.y += dy / scaleY
    }
    state.positionsVersion++
    requestAnimationFrame(rebuild)
  } else {
    panBy(dx, dy)
  }
})

function endPointer(e: PointerEvent) {
  const had = pointers.delete(e.pointerId)
  if (!had) {
    return
  }
  if (pointers.size === 1 && gesture?.kind === 'pinch') {
    gesture = { kind: 'pan', moved: true }
    pinch = undefined
    return
  }
  if (pointers.size === 0) {
    const tapped = gesture && !gesture.moved
    gesture = undefined
    pinch = undefined
    ui.canvas.classList.remove('dragging')
    if (tapped && e.type === 'pointerup') {
      const p = local(e)
      state.selectedNode = nodeAtScreen(p.x, p.y)
      scheduleDraw()
    }
  }
}

ui.canvas.addEventListener('pointerup', endPointer)
ui.canvas.addEventListener('pointercancel', endPointer)

let hoverFrame = 0

function hoverAt(x: number, y: number) {
  cancelAnimationFrame(hoverFrame)
  hoverFrame = requestAnimationFrame(() => {
    const node = nodeAtScreen(x, y)
    const edge = node ? null : edgeAtScreen(x, y)
    if (node !== state.hoveredNode || edge !== state.hoveredEdge) {
      state.hoveredNode = node
      state.hoveredEdge = edge
      scheduleDraw()
    }
  })
}

ui.canvas.addEventListener('pointerleave', e => {
  if (e.pointerType === 'mouse') {
    cancelAnimationFrame(hoverFrame)
    state.hoveredNode = null
    state.hoveredEdge = null
    scheduleDraw()
  }
})

ui.canvas.addEventListener(
  'wheel',
  e => {
    e.preventDefault()
    const p = local(e)
    zoomAt(wheelZoomFactor(e), p.x, p.y)
  },
  { passive: false },
)

function fitView() {
  state.owner = 'fit'
  fit()
  rebuild()
}

function zoomCentre(factor: number) {
  zoomAt(factor, state.width / 2, state.height / 2)
}

ui.zoomIn.addEventListener('click', () => zoomCentre(BUTTON_ZOOM))
ui.zoomOut.addEventListener('click', () => zoomCentre(1 / BUTTON_ZOOM))
ui.zoomFit.addEventListener('click', fitView)

document.addEventListener('keydown', e => {
  const t = e.target as HTMLElement
  if (
    e.ctrlKey ||
    e.metaKey ||
    e.altKey ||
    t.closest('input, dialog, .menu, [role="menubar"]')
  ) {
    return
  }
  if (e.key === '+' || e.key === '=') {
    zoomCentre(BUTTON_ZOOM)
  } else if (e.key === '-') {
    zoomCentre(1 / BUTTON_ZOOM)
  } else if (e.key === '0') {
    fitView()
  }
})

function bubbleTarget(target: EventTarget | null) {
  const hit = (target as Element | null)?.closest('[data-halo],[data-glyph]')
  const halo = hit?.getAttribute('data-halo')
  const glyph = hit?.getAttribute('data-glyph')
  return halo != null
    ? overlayBubbles.halos[Number(halo)]
    : glyph != null
      ? overlayBubbles.glyphs[Number(glyph)]
      : undefined
}

ui.svg.addEventListener('click', e => {
  const bubble = bubbleTarget(e.target)
  if (bubble) {
    popBubble(bubble)
  }
})
ui.svg.addEventListener('keydown', e => {
  const bubble =
    e.key === 'Enter' || e.key === ' ' ? bubbleTarget(e.target) : undefined
  if (bubble) {
    e.preventDefault()
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

if (stored('bandagejs-hint-dismissed', false)) {
  ui.hint.hidden = true
}
ui.hintClose.addEventListener('click', () => {
  ui.hint.hidden = true
  store('bandagejs-hint-dismissed', true)
})

// ---- JBrowse --------------------------------------------------------------------------------

// The graph's window on GRCh38, which every JBrowse link opens on.
function jbrowseRegion() {
  const src = state.source
  const region = src?.region
  if (region) {
    return !src.sample || src.sample === 'GRCh38' ? region : undefined
  }
  return state.graph ? backboneRegion(state.graph.nodes) : undefined
}

// The haplotypes the lanes show: the lifted walk's, else the cut's, else the
// graph's own walks.
function jbrowseSamples() {
  const lifted = state.highlightedPath && panSNHaplotype(state.highlightedPath)
  if (lifted) {
    return [lifted]
  }
  if (state.source?.gbz?.haplotypes?.length) {
    return state.source.gbz.haplotypes
  }
  const haplotypes = new Set<string>()
  for (const p of state.graph?.paths ?? []) {
    const h = panSNHaplotype(p.name)
    if (h && !h.startsWith('GRCh38#') && !h.startsWith('CHM13#')) {
      haplotypes.add(h)
    }
  }
  return [...haplotypes].slice(0, 16)
}

function jbrowseMode() {
  return JBROWSE_MODES.has(settings.mode) ? settings.mode : 'force'
}

function openTab(url: string) {
  window.open(url, '_blank', 'noopener')
}

function jbrowseItems(): MenuItem[] {
  const region = jbrowseRegion()
  const src = state.source
  const onHprc = src?.gbz?.db === HPRC.db
  const selected = state.selectedNode
    ? facts().nodeById.get(state.selectedNode)
    : undefined
  const nodeUrl = selected ? nodeLink(selected) : undefined
  const noRegion = 'Needs a graph on GRCh38'
  return [
    {
      label: 'Open this region in JBrowse',
      detail: region
        ? `${region.refName}:${(region.start + 1).toLocaleString()}-${region.end.toLocaleString()} with genes, the HPRC graph and haplotype lanes`
        : noRegion,
      disabled: !region,
      onClick: () => {
        openTab(regionLink(region!, jbrowseSamples()))
      },
    },
    {
      label: "Open this graph in JBrowse's graph view",
      detail: !region
        ? noRegion
        : onHprc || src?.url
          ? 'Hover a node there to highlight its span in the linear view'
          : 'Open the graph from a url to hand it to JBrowse',
      disabled: !region || !(onHprc || src?.url),
      onClick: () => {
        openTab(
          onHprc
            ? graphViewLink(region!, src.gbz?.haplotypes ?? [], jbrowseMode())
            : gfaViewLink(src!.url!, region, jbrowseMode()),
        )
      },
    },
    {
      label: 'Show the selected node in JBrowse',
      detail: !selected
        ? 'Click a node first'
        : nodeUrl
          ? selected.stable?.rank
            ? `On ${panSNHaplotype(selected.stable.refName)}, the haplotype that contributed it`
            : `At its span on ${panSNContig(selected.stable?.refName ?? '')}`
          : 'The portal has no assembly for this node',
      disabled: !nodeUrl,
      onClick: () => {
        openTab(nodeUrl!)
      },
    },
  ]
}

// ---- menus --------------------------------------------------------------------------------

function apply(effect: 'layout' | 'geometry') {
  saveSettings()
  if (effect === 'layout') {
    void relayout()
  } else {
    rebuild()
  }
}

function radio<T extends string | number>(
  items: readonly { value: T; label: string }[],
  current: T,
  set: (value: T) => void,
  effect: 'layout' | 'geometry',
  disabled: (value: T) => string | undefined = () => undefined,
): MenuItem[] {
  return items.map(i => {
    const why = disabled(i.value)
    return {
      label: i.label,
      radio: true,
      checked: i.value === current,
      disabled: why !== undefined,
      detail: why,
      onClick: () => {
        set(i.value)
        apply(effect)
      },
    }
  })
}

function toggle(
  label: string,
  key: 'showBubbles' | 'showDeletionEdges' | 'drawPaths',
  disabled?: string,
): MenuItem {
  return {
    label,
    checked: settings[key],
    disabled: disabled !== undefined,
    detail: disabled,
    onClick: () => {
      settings[key] = !settings[key]
      apply('geometry')
    },
  }
}

// the "Needs …" sentence of a layout's description, for a greyed-out item
function needs(description: string) {
  return (
    /Needs [^.]*\./.exec(description)?.[0] ?? 'Not available for this graph'
  )
}

type Example = {
  name: string
  description: string
  layout?: LayoutModeValue
} & (
  | { file: string; region?: string }
  | { gbz: 'hprc'; region: string; haplotypes?: string[] }
)

let examples: Example[] = []

function openExample(x: Example) {
  if (x.layout) {
    settings.mode = x.layout
  }
  if ('file' in x) {
    const url = `examples/${x.file}`
    loadUrl(url, {
      description: x.description,
      region: x.region ? parseRegion(x.region) : undefined,
    })
  } else {
    loadGbz(
      { ...HPRC, region: x.region, haplotypes: x.haplotypes },
      x.description,
    )
  }
}

function checkRegion() {
  let message = ''
  try {
    parseRegion(ui.gbzRegion.value)
  } catch (e) {
    message = e instanceof Error ? e.message : String(e)
  }
  ui.gbzRegion.setCustomValidity(message)
}

function showGbzDialog() {
  const src =
    state.source?.gbz ?? gbzFromQuery(new URLSearchParams(location.search))
  ui.gbzDb.value = src?.db ?? HPRC.db
  ui.gbzIndex.value = src ? (src.index ?? '') : (HPRC.index ?? '')
  ui.gbzRegion.value = src?.region ?? 'chr6:160,614,798-160,647,758'
  ui.gbzHaplotypes.value =
    src?.haplotypes?.join(',') ??
    'HG00097,HG00128,HG01123,HG00099,HG01960,HG02055,HG00133,HG01109'
  checkRegion()
  ui.gbzDialog.showModal()
}

ui.gbzRegion.addEventListener('input', checkRegion)

const QUALITIES = [0, 1, 2, 3, 4].map(q => ({
  value: q,
  label: `Quality ${q}`,
}))

// Walk labels are the shortest distinct tier, but two walks can share a name
// outright (fragments of one contig), so a repeat gets its ordinal.
function walkItems(): MenuItem[] {
  const seen = new Map<string, number>()
  return [...facts().walkChoices]
    .sort((a, b) => a.label.localeCompare(b.label))
    .map(w => {
      const n = (seen.get(w.label) ?? 0) + 1
      seen.set(w.label, n)
      return {
        label: n > 1 ? `${w.label} (${n})` : w.label,
        radio: true,
        checked: state.highlightedPath === w.name,
        onClick: () => {
          state.highlightedPath = w.name
          rebuild()
        },
      }
    })
}

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
      {
        label: 'Open pangenome database…',
        detail: 'Cut a region of a gbz-base .gbz.db, such as HPRC’s',
        onClick: showGbzDialog,
      },
    ],
  },
  {
    label: 'Examples',
    items: () => {
      const item = (x: Example): MenuItem => ({
        label: x.name.replace(/^HPRC live: /, ''),
        detail: x.description,
        onClick: () => {
          openExample(x)
        },
      })
      return [
        { header: 'Live from the HPRC database, a few seconds each' },
        ...examples.filter(x => 'gbz' in x).map(item),
        { header: 'Bundled GFA files' },
        ...examples.filter(x => 'file' in x).map(item),
      ]
    },
  },
  {
    label: 'Layout',
    items: () => {
      const graph = state.graph
      const engine = !!graph && modeUsesLayoutEngine(settings.mode, graph)
      const engineOnly = () =>
        engine ? undefined : 'Only the force-directed layout reads this'
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
          v => {
            const m = LAYOUT_MODES.find(x => x.value === v)!
            return graph && !m.available(graph)
              ? needs(m.description)
              : undefined
          },
        ),
        { header: 'Force-directed quality' },
        ...radio(
          QUALITIES,
          settings.quality,
          v => (settings.quality = v),
          'layout',
          engineOnly,
        ),
        { header: 'Bubble spread' },
        ...radio(
          BUBBLE_SPREADS,
          settings.bubbleSpread,
          v => (settings.bubbleSpread = v),
          'layout',
          engineOnly,
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
    items: () => {
      const paths = state.graph?.paths?.length ?? 0
      return [
        toggle('Bubbles', 'showBubbles'),
        toggle('Deletion edges', 'showDeletionEdges'),
        toggle(
          'Path colours',
          'drawPaths',
          paths === 0
            ? 'This graph has no paths'
            : !pathColorsLegible(paths)
              ? 'Too many paths to tell their colours apart'
              : undefined,
        ),
        { divider: true },
        { label: 'Zoom in (+)', onClick: () => zoomCentre(BUTTON_ZOOM) },
        { label: 'Zoom out (−)', onClick: () => zoomCentre(1 / BUTTON_ZOOM) },
        { label: 'Fit to window (0)', onClick: fitView },
      ]
    },
  },
  {
    label: 'Walks',
    items: () => {
      const graph = state.graph
      const walks = walkItems()
      const anchors =
        graph?.anchoredBy === 'paths' ? (graph.anchorPaths ?? []) : []
      if (walks.length === 0) {
        return [{ header: 'This graph has no walks' }]
      }
      return [
        ...(walks.length > 10 ? [{ search: 'Filter walks' } as MenuItem] : []),
        { header: 'Lift a walk' },
        {
          label: 'None',
          radio: true,
          checked: state.highlightedPath === '',
          onClick: () => {
            state.highlightedPath = ''
            rebuild()
          },
        },
        ...walks,
        ...(anchors.length > 1
          ? [
              { header: 'Draw x along' } as MenuItem,
              ...anchors.map((a): MenuItem => ({
                label: a.name,
                radio: true,
                checked: graph?.referencePath === a.name,
                onClick: () => {
                  state.referencePath = a.name
                  const { text, ...src } = state.source!
                  openGFA(text, src)
                },
              })),
            ]
          : []),
      ]
    },
  },
  { label: 'JBrowse', items: jbrowseItems },
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
  const example = examples.find(
    x => 'file' in x && `examples/${x.file}` === gfa,
  )
  void openUrl(gfa, {
    description: example?.description,
    region:
      example && 'file' in example && example.region
        ? parseRegion(example.region)
        : undefined,
  })
} else if (examples[0]) {
  openExample(examples[0])
}
