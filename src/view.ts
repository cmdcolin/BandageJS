import {
  Canvas2DRenderer,
  FACET_GAP_PX,
  FACET_PAD_PX,
  FACET_TITLE_PX,
  FIT_PADDING,
  axisScaleOf,
  buildGeometry,
  contains,
  drawTubeMap,
  drawingBounds,
  edgeHoverText,
  facetCells,
  facetGrid,
  fitTransform,
  formatBp,
  getDpr,
  layoutGeometryInputs,
  layoutLabels,
  padded,
  pathLegend,
  resolveColorScheme,
  rowSpan,
  tubeMapFrame,
  viewportOf,
  walkKey,
  walkPosition,
  walkRowsExtent,
} from '@jbrowse/bandage-core'

import { inkOf, memo, rampInterval } from './derived'
import { layoutName, nodeHtml, nodeText } from './describe'
import { svgDom } from './elDom'
import { rowLink } from './jbrowse'
import {
  esc,
  legendsHtml,
  overlayHtml,
  overlaySvg,
  walkKeyHtml,
  walkRowsLayer,
} from './overlays'
import {
  referenceAssembly,
  referenceName,
  referenceWindow,
  targetOf,
} from './reference'
import {
  axis,
  current,
  drawPaths,
  drawnMode,
  facts,
  pixelRows,
  settings,
  state,
  stripRows,
  tube,
  walks,
} from './state'
import { ui } from './ui'

import type { Region } from './jbrowse'
import type { Pane } from './overlays'
import type { Facet } from './settings'
import type {
  FacetGrid,
  GenePin,
  LayoutResult,
  LiftedWalk,
  MinigraphBubble,
  PaneTransform,
  WalkLift,
  WalkRow,
  WalkRows,
} from '@jbrowse/bandage-core'

// A walk row's bar: its haplotype, length and the span of its own contig
function rowHtml(row: WalkRow) {
  const span = row.axis && rowSpan(row.axis, row.bp)
  return `<strong>${esc(row.label)}</strong> ${formatBp(row.bp)}${
    span && row.axis
      ? `<br>${esc(row.axis.contig)}:${(span.start + 1).toLocaleString()}-${span.end.toLocaleString()}${row.axis.reversed ? ', walked in reverse' : ''}`
      : ''
  }`
}

// the ramp's interval for walk rows to paint by, where the drawing has one
const walkRampOf = (d: ReturnType<typeof current>) =>
  d.bars ? rampInterval(d.ramp) : undefined

const CONNECTOR_THICKNESS = 2
const HOVER_BRIGHTEN = 1.4
const SELECT_BRIGHTEN = 1.6
const REBUILD_DEBOUNCE_MS = 150

const renderer = new Canvas2DRenderer(ui.canvas)

const EMPTY_BATCH: Parameters<Canvas2DRenderer['uploadGeometry']>[0] = {
  nodeStrokes: [],
  nodeStrokeRuns: new Map(),
  arrows: [],
  arrowRuns: new Map(),
  edgeCurves: [],
  edgeCurveRuns: new Map(),
}

const afterDraw: (() => void)[] = []

// `fn` runs after every frame, for what reads the state but isn't drawn here
export function onDraw(fn: () => void) {
  afterDraw.push(fn)
}

const boundsOf = memo(
  (
    layout: LayoutResult | undefined,
    region: Region | undefined,
    bars: WalkRows | undefined,
  ) =>
    layout
      ? drawingBounds(layout, {
          region,
          extent: bars && layout.extent ? walkRowsExtent(bars) : undefined,
        })
      : undefined,
)

function bounds() {
  return boundsOf(
    state.layout,
    state.stack.length === 0 ? state.region : undefined,
    current().bars,
  )
}

const placementOf = memo((panels: WalkLift[] | undefined, facet: Facet) =>
  panels && facet !== 'none'
    ? facetCells(
        panels.map(p => p.walks[0]!.name),
        facet,
      )
    : undefined,
)

// Which grid cell each facet panel takes; see facetCells
function placement() {
  return placementOf(walks().panels, settings.facet)
}

const gridOf = memo(
  (
    place: ReturnType<typeof placement>,
    b: ReturnType<typeof bounds>,
    rows: boolean,
    width: number,
    height: number,
    columns: number,
  ) =>
    place && b && b.w > 0
      ? facetGrid({
          count: place.count,
          bounds: b,
          pixelRows: rows,
          width,
          room: height,
          columns: place.columns ?? (columns || undefined),
        })
      : undefined,
)

// How the facet panels tile the pane while lifted walks are side by side
export function grid() {
  return gridOf(
    placement(),
    bounds(),
    pixelRows(),
    state.width,
    state.height,
    settings.facetColumns,
  )
}

// What the transform maps the drawing into: one facet panel while faceted,
// since every panel shares it, else the pane
export function viewBox() {
  const g = grid()
  return g
    ? { width: g.width, height: g.height }
    : { width: state.width, height: state.height }
}

// .row-label's left offset and padding, and a gap before the drawing
const ROW_LABEL_CHROME_PX = 6 + 8 + 6

// Room on the left for the widest row label, which stays put as the drawing
// pans, so a fitted drawing starts clear of them
const labelGutterOf = memo((labels: { label: string }[]) => {
  if (labels.length === 0) {
    return FIT_PADDING
  }
  const ctx = document.createElement('canvas').getContext('2d')!
  ctx.font = `11px ${getComputedStyle(ui.html).fontFamily}`
  const widest = Math.max(...labels.map(l => ctx.measureText(l.label).width))
  return Math.max(FIT_PADDING, Math.ceil(widest) + ROW_LABEL_CHROME_PX)
})

export function fitted() {
  const b = bounds()
  const g = grid()
  return !b
    ? undefined
    : g
      ? fitTransform(b, g.width, g.height, pixelRows(), {
          padLeft: FACET_PAD_PX,
          padTop: FACET_PAD_PX,
          padRight: FACET_PAD_PX,
          padBottom: FACET_PAD_PX,
        })
      : fitTransform(b, state.width, state.height, pixelRows(), {
          padLeft: labelGutterOf(current().rowLabels),
        })
}

export function fit() {
  const t = fitted()
  if (t) {
    state.scale = t.scale
    state.translateX = t.translateX
    state.translateY = t.translateY
  }
}

export function fitView() {
  state.owner = 'fit'
  fit()
  rebuild()
}

const viewport = () => {
  const { width, height } = viewBox()
  return viewportOf(state, axis(), width, height)
}

interface FacetPanel {
  lift: WalkLift
  renderer: Canvas2DRenderer
}

let facets: FacetPanel[] = []
let shown: { panels?: WalkLift[]; grid?: FacetGrid } = {}
const surfaceHooks: ((canvas: HTMLCanvasElement) => void)[] = []

// `fn` runs on each canvas drawing the pane's transform: the pane's own, and
// every facet panel's as it is made
export function onSurface(fn: (canvas: HTMLCanvasElement) => void) {
  surfaceHooks.push(fn)
  fn(ui.canvas)
}

// Puts up the panels the lifted walks call for, each titled by its walk's key.
// Says whether the pane went from one drawing to panels or back, which fits
// the drawing again, or only the panels changed.
function syncFacets() {
  const { panels } = walks()
  const g = grid()
  if (panels === shown.panels && g === shown.grid) {
    return undefined
  }
  const flipped = (shown.grid !== undefined) !== (g !== undefined)
  const change = flipped ? 'flipped' : 'changed'
  shown = { panels, grid: g }
  facets.forEach(f => {
    f.renderer.dispose()
  })
  facets = []
  ui.facets.hidden = !g
  ui.pane.classList.toggle('faceted', !!g)
  if (!panels || !g) {
    ui.facets.replaceChildren()
    return change
  }
  const labels = facts().walkLabels
  const reference = walkReference(panels[0])
  const cells = placement()!.cells
  ui.facets.style.gap = `${FACET_GAP_PX}px`
  ui.facets.style.gridTemplateColumns = `repeat(${g.columns}, ${g.width}px)`
  ui.facets.innerHTML = panels
    .map((lift, i) => {
      const walk = lift.walks[0]!
      const label = labels.get(walk.name) ?? walk.name
      const row = Math.floor(cells[i]! / g.columns) + 1
      const column = (cells[i]! % g.columns) + 1
      return `<div class="facet" style="grid-row:${row};grid-column:${column}"><button type="button" class="facet-title" style="height:${FACET_TITLE_PX}px" data-walk="${esc(walk.name)}">${walkKeyHtml(
        walk,
        label,
        reference,
        `click to highlight ${label} alone`,
      )}</button><canvas></canvas></div>`
    })
    .join('')
  facets = [...ui.facets.querySelectorAll('canvas')].map((canvas, i) => {
    surfaceHooks.forEach(fn => {
      fn(canvas)
    })
    return { lift: panels[i]!, renderer: new Canvas2DRenderer(canvas) }
  })
  return change
}

// Where the hovered node sits on a walk, for the walk's key
function hoveredOn(walk: LiftedWalk) {
  const node = state.hoveredNode
    ? facts().nodeById.get(state.hoveredNode)
    : undefined
  return node
    ? (walkPosition(walk, node.id, node.length) ?? 'not on this walk')
    : undefined
}

// The panels' titles are built once per set of panels, so the hover's line
// under each is written in place
function drawFacetTitles() {
  const { panels } = shown
  if (!panels || facets.length === 0) {
    return
  }
  const reference = walkReference(panels[0])
  ui.facets.querySelectorAll('.facet-title .walk-at').forEach((line, i) => {
    const walk = panels[i]!.walks[0]!
    line.textContent = hoveredOn(walk) ?? walkKey(walk, reference).scale ?? ''
  })
}

// The window a lane coloured by reference position spans, by name
export function walkReference(lift: WalkLift | undefined) {
  const domain = lift?.referenceDomain
  return domain && { ...domain, name: referenceName() }
}

export function rebuild() {
  const { graph, layout } = state
  renderer.resize(state.width, state.height)
  const change = syncFacets()
  if (change === 'flipped') {
    state.owner = 'fit'
  }
  if (change && state.owner === 'fit') {
    fit()
  }
  if (!graph || !layout || layout.tubeMap) {
    renderer.uploadGeometry(EMPTY_BATCH)
    state.built = undefined
    draw()
    return
  }
  const d = current()
  const start = performance.now()
  const viewportBounds = padded(viewport(), 1)
  const build = (highlight: WalkLift | undefined, paths: boolean) =>
    buildGeometry({
      // walk rows draw every row, the reference's too, as an overlay
      ...layoutGeometryInputs(layout, d.drawing, { drawsRows: !!d.bars }),
      graph,
      nodeById: facts().nodeById,
      colorScheme: resolveColorScheme(settings.colorScheme, graph),
      contigThickness: settings.nodeThickness,
      connectorThickness: CONNECTOR_THICKNESS,
      drawPaths: paths,
      nodeWidth: settings.nodeWidth,
      highlight,
      axis: axis(),
      viewportBounds,
      referenceRamp: d.ramp,
      version: state.positionsVersion,
    })
  const g = grid()
  renderer.uploadGeometry(g ? EMPTY_BATCH : build(walks().lift, drawPaths()))
  for (const f of facets) {
    f.renderer.resize(g!.width, g!.height)
    f.renderer.uploadGeometry(build(f.lift, false))
  }
  state.geometryMs = performance.now() - start
  state.built = { scale: state.scale, bounds: viewportBounds }
  draw()
}

let rebuildTimer: ReturnType<typeof setTimeout> | undefined

export function viewportMoved() {
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

function perFrame(fn: () => void) {
  let frame = 0
  return () => {
    frame ||= requestAnimationFrame(() => {
      frame = 0
      fn()
    })
  }
}

export const scheduleDraw = perFrame(draw)
export const scheduleRebuild = perFrame(rebuild)

// Markup is rebuilt per frame but rarely changes; reparsing it anyway would
// drop the focus on a bubble chip and a click landing on the info box's link.
const shownHtml = new WeakMap<Element, string>()

function setHtml(el: Element, html: string) {
  if (shownHtml.get(el) === html) {
    return false
  }
  shownHtml.set(el, html)
  el.innerHTML = html
  return true
}

export function tubeFrame(t: PaneTransform = state) {
  const drawing = tube()
  const { scaleX, scaleY } = axisScaleOf(t.scale, pixelRows())
  return drawing
    ? tubeMapFrame(drawing, {
        scaleX,
        translateX: t.translateX,
        scaleY,
        translateY: t.translateY,
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
  const width = Math.round(state.width * dpr)
  const height = Math.round(state.height * dpr)
  if (ui.tube.width !== width || ui.tube.height !== height) {
    ui.tube.width = width
    ui.tube.height = height
    ui.tube.style.width = `${state.width}px`
    ui.tube.style.height = `${state.height}px`
  }
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
  for (const r of [renderer, ...facets.map(f => f.renderer)]) {
    r.setNodeHighlights(highlights)
    r.setEdgeHighlight(state.hoveredEdge, HOVER_BRIGHTEN)
    r.updateTransform({
      scaleX: scaleX * dpr,
      scaleY: scaleY * dpr,
      translateX: state.translateX * dpr,
      translateY: state.translateY * dpr,
      dpr,
    })
    r.render([1, 1, 1, 1])
  }
  drawTube()
  drawOverlays()
  drawFacetTitles()
  drawInfo()
  drawStats()
  afterDraw.forEach(fn => fn())
}

// The selected node, and a node its details name under the pointer, which the
// overlay rings
function ringsOf(
  layout: LayoutResult | undefined,
  halfWidthPx: (id: string) => number,
) {
  const fromDetails =
    !state.pointer && !state.stripHover ? state.hoveredNode : null
  return [
    ...(state.selectedNode ? [{ id: state.selectedNode, strong: true }] : []),
    ...(fromDetails && fromDetails !== state.selectedNode
      ? [{ id: fromDetails, strong: false }]
      : []),
  ].flatMap(({ id, strong }) => {
    const segments = layout?.nodePositions[id]
    return segments?.length
      ? [
          {
            d: `M${segments.map(s => `${s.x} ${s.y}`).join('L')}`,
            halfWidthPx: halfWidthPx(id),
            strong,
          },
        ]
      : []
  })
}

let overlayBubbles: MinigraphBubble[] = []

// The bubble whose chip `target` is in, if any
export function bubbleAt(target: EventTarget | null) {
  const halo = (target as Element | null)
    ?.closest('[data-halo]')
    ?.getAttribute('data-halo')
  return halo != null ? overlayBubbles[Number(halo)] : undefined
}

// Walk rows run to thousands of SVG elements, too many to build every frame.
// A pan or zoom moves the rows last built instead, which reach half a pane
// past its top and bottom, and builds them again once the view rests, or
// sooner where it has strayed too far.
const ROWS_MARGIN = 0.5
const MAX_ROWS_STRETCH = 1.5

interface RowsTransform {
  scaleX: number
  scaleY: number
  translateX: number
  translateY: number
}

// the rows' inputs and the transform they were built under, which brings the
// margin above the pane into view
let rowsBuilt: { inputs: unknown[]; t: RowsTransform } | undefined
let rowsTimer: ReturnType<typeof setTimeout> | undefined

const stretched = (k: number) =>
  k > MAX_ROWS_STRETCH || k < 1 / MAX_ROWS_STRETCH

function drawWalkRows(p: Pane | undefined) {
  if (!p) {
    clearTimeout(rowsTimer)
    rowsBuilt = undefined
    ui.walkRows.replaceChildren()
    ui.walkRows.removeAttribute('transform')
    return
  }
  const margin = p.height * ROWS_MARGIN
  const want: RowsTransform = {
    scaleX: p.scaleX,
    scaleY: p.scaleY,
    translateX: p.translateX,
    translateY: p.translateY + margin,
  }
  const inputs = [
    p.walkBars,
    p.walkRamp?.start,
    p.walkRamp?.end,
    p.rowGenes,
    p.width,
    p.height,
  ]
  const built = rowsBuilt
  if (
    !built ||
    inputs.some((v, i) => v !== built.inputs[i]) ||
    stretched(want.scaleX / built.t.scaleX) ||
    stretched(want.scaleY / built.t.scaleY) ||
    Math.abs(want.translateY - built.t.translateY) > margin
  ) {
    const rows = walkRowsLayer({ ...p, ...want, height: p.height + 2 * margin })
    ui.walkRows.replaceChildren(...(rows ? [svgDom(rows)] : []))
    rowsBuilt = { inputs, t: want }
  }
  const { t } = rowsBuilt!
  const kx = want.scaleX / t.scaleX
  const ky = want.scaleY / t.scaleY
  const transform = `translate(${p.translateX - t.translateX * kx} ${p.translateY - t.translateY * ky}) scale(${kx} ${ky})`
  if (ui.walkRows.getAttribute('transform') !== transform) {
    ui.walkRows.setAttribute('transform', transform)
    clearTimeout(rowsTimer)
    const resting =
      kx === 1 &&
      ky === 1 &&
      want.translateX === t.translateX &&
      want.translateY === t.translateY
    if (!resting) {
      rowsTimer = setTimeout(() => {
        rowsBuilt = undefined
        scheduleDraw()
      }, REBUILD_DEBOUNCE_MS)
    }
  }
}

function drawOverlays() {
  const { graph } = state
  // faceted, each panel's title is its walk's key and nothing else is drawn
  const layout = facets.length > 0 ? undefined : state.layout
  const f = facts()
  const d = current()
  const { lift } = walks()
  const { scaleX, scaleY } = axis()
  const back = state.stack.at(-1)
  const backLabel = back && `◀ Back to ${back.graph.name}`
  const ink = inkOf(state.graph, settings.nodeWidth, settings.nodeThickness)
  const labels = layoutLabels({
    paneWidth: state.width,
    canvasHeight: state.height,
    axisScale: axis(),
    translateX: state.translateX,
    translateY: state.translateY,
    contigThickness: settings.nodeThickness,
    legendSize: state.legendSize,
    drawnRowLabels: d.rowLabels,
    bubbleHalos: d.halos,
    genePins: d.genePins,
    poppedFrom: backLabel ? { label: backLabel } : undefined,
    nodePositions: layout?.nodePositions,
    labelsNodeSizes: !layout?.tubeMap && !lift,
    nodeLengths: f.nodeLengths,
    deletions: d.deletions,
    deletionRoutes: layout?.deletionRoutes,
    stranded: layout?.stranded,
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
    contigThickness: settings.nodeThickness,
    halos: d.halos,
    genePins: d.genePins,
    halfWidthPx: ink.halfWidthPx,
    rings: d.bars ? [] : ringsOf(layout, ink.halfWidthPx),
    labels,
    rowLabels: d.rowLabels,
    walkBars: d.bars,
    rowGenes: d.rowGenes,
    walkRamp: walkRampOf(d),
    regionEnd: state.region?.end,
    highlight: lift,
  }
  ui.svg.setAttribute('width', String(state.width))
  ui.svg.setAttribute('height', String(state.height))
  setHtml(ui.marks, layout ? overlaySvg(pane) : '')
  drawWalkRows(layout && pane.walkBars ? pane : undefined)
  setHtml(ui.html, layout ? overlayHtml(pane) : '')
  overlayBubbles = d.halos.map(h => h.bubble)

  const ramp = rampInterval(d.ramp)
  const legends = layout
    ? legendsHtml({
        // a lifted walk's key states its own scale, and the rest is grey
        ramp:
          ramp && !lift
            ? { ...ramp, refName: referenceName() ?? referenceAssembly() }
            : undefined,
        exons: exonKey(d.genePins),
        paths: drawPaths() && graph?.paths ? pathLegend(graph.paths) : [],
        walkBars: d.bars,
        rowGenes: d.rowGenes?.size ? state.walkGeneNote : undefined,
        walkRamp: walkRampOf(d),
        walks: (lift?.walks ?? []).map(walk => ({
          walk,
          label: f.walkLabels.get(walk.name) ?? walk.name,
          at: hoveredOn(walk),
        })),
        reference: walkReference(lift),
      })
    : ''
  if (setHtml(ui.legends, legends)) {
    state.legendSize = {
      width: ui.legends.offsetWidth,
      height: ui.legends.offsetHeight,
    }
    scheduleDraw()
  }
  ui.back.hidden = !backLabel
  ui.back.textContent = backLabel ?? ''
}

// Genes with no exons inside them draw each as one mark, a whole gene
function exonKey(pins: GenePin[]) {
  const marked = pins.filter(pin => pin.exons)
  const whole = marked.every(({ gene: g }) =>
    g.exons.every(e => e.start <= g.start && e.end >= g.end),
  )
  return marked.length && state.genesFrom
    ? {
        kind: whole ? ('Gene' as const) : ('Exon' as const),
        from: state.genesFrom,
      }
    : undefined
}

const shownGenes = () => (settings.showGenes ? state.genes : undefined)

const INFO_OFFSET_PX = 14

// The hover's box beside the pointer over the drawing, turned back from the
// pane's edges; elsewhere in the corner
export function placeInfo() {
  const at = ui.info.classList.contains('interactive')
    ? undefined
    : state.pointer
  const s = ui.info.style
  if (!at) {
    s.left = s.top = s.right = s.bottom = ''
    return
  }
  const w = ui.info.offsetWidth
  const h = ui.info.offsetHeight
  // the open details bound the pane at their left, or on a phone their top
  const beside = !ui.details.hidden && ui.details.offsetLeft > state.width / 2
  const below = !ui.details.hidden && !beside
  const right = beside ? ui.details.offsetLeft : state.width
  const bottom = below ? ui.details.offsetTop : state.height
  const x =
    at.x + INFO_OFFSET_PX + w > right
      ? at.x - INFO_OFFSET_PX - w
      : at.x + INFO_OFFSET_PX
  const y =
    at.y + INFO_OFFSET_PX + h > bottom
      ? at.y - INFO_OFFSET_PX - h
      : at.y + INFO_OFFSET_PX
  s.left = `${Math.max(0, x)}px`
  s.top = `${Math.max(0, y)}px`
  s.right = s.bottom = 'auto'
}

// The hover, else the selected walk row with where to open it; the selected
// node's details are a panel of their own. Only the selection goes to the
// live region, so a screen reader doesn't read out every hover.
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
  const bars = current().bars ?? stripRows()
  const selectedRow = bars
    ? [bars.reference, ...bars.rows].find(r => r.name === state.selectedRow)
    : undefined
  let html = ''
  let interactive = false
  if (hovered && (state.pointer || state.stripHover)) {
    html = nodeHtml(hovered, shownGenes())
  } else if (edge) {
    const text = edgeHoverText(
      edge,
      current().deletions.find(x => x.edgeIndex === state.hoveredEdge),
      id => f.nodeById.get(id)?.name ?? id,
    )
    html = text.deletion
      ? `<strong>Deletion</strong> ${esc(text.deletion.bp)}<br>${esc(text.deletion.where)}`
      : `Edge: ${esc(text.ends)}`
  } else if (selectedRow) {
    const ref = referenceWindow()
    const isReference = selectedRow === bars?.reference
    const link =
      ref && rowLink(selectedRow, isReference, targetOf(ref), ref.contigs)
    html = `${rowHtml(selectedRow)}<div class="info-actions">${
      link
        ? `<a href="${esc(link)}" target="_blank" rel="noopener">Show in JBrowse ↗</a>`
        : ''
    }<button type="button" data-close aria-label="Deselect">✕</button></div>`
    interactive = true
  }
  setHtml(ui.info, html)
  ui.info.hidden = html === ''
  ui.info.classList.toggle('interactive', interactive)
  placeInfo()
  const said = selected
    ? `Selected ${nodeText(selected)}`
    : selectedRow
      ? `Selected ${selectedRow.label}`
      : ''
  if (ui.announce.textContent !== said) {
    ui.announce.textContent = said
  }
}

ui.info.addEventListener('click', e => {
  if ((e.target as Element).closest('[data-close]')) {
    state.selectedNode = null
    state.selectedRow = null
    scheduleDraw()
  }
})

function drawStats() {
  const g = state.graph
  const counts = g
    ? [
        `${g.nodes.length.toLocaleString()} nodes`,
        `${g.edges.length.toLocaleString()} edges`,
        ...(g.paths?.length
          ? [`${g.paths.length.toLocaleString()} paths`]
          : []),
        layoutName(drawnMode().label),
      ]
    : []
  const timings = [
    ...(state.layoutMs !== undefined
      ? [`layout ${state.layoutMs.toFixed(0)} ms`]
      : []),
    ...(state.geometryMs !== undefined
      ? [`geometry ${state.geometryMs.toFixed(0)} ms`]
      : []),
  ]
  ui.stats.textContent = counts.join(' · ')
  ui.stats.title = timings.join(' · ')
}

export function showCaption() {
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

new ResizeObserver(() => {
  state.width = ui.pane.clientWidth
  state.height = ui.pane.clientHeight
  if (state.owner === 'fit') {
    fit()
  }
  rebuild()
}).observe(ui.pane)
