import {
  Canvas2DRenderer,
  FIT_PADDING,
  axisScaleOf,
  buildGeometry,
  contains,
  drawTubeMap,
  drawingBounds,
  fitTransform,
  getDpr,
  layoutLabels,
  padded,
  pathLegend,
  resolveColorScheme,
  tubeMapFrame,
  viewportOf,
  walkRowsExtent,
} from '@jbrowse/bandage-core'

import { CONTIG_THICKNESS } from './derived'
import { nodeHtml, nodeText } from './describe'
import { nodeLink } from './jbrowse'
import { esc, legendsHtml, overlayHtml, overlaySvg } from './overlays'
import { referenceWindow, targetOf } from './reference'
import {
  axis,
  current,
  drawPaths,
  facts,
  hiddenEdges,
  pixelRows,
  settings,
  state,
  tube,
} from './state'
import { ui } from './ui'

import type { MinigraphBubble, PaneTransform } from '@jbrowse/bandage-core'

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

function bounds() {
  const { bars } = current()
  return state.layout
    ? drawingBounds(state.layout, {
        region: state.stack.length === 0 ? state.region : undefined,
        extent: bars && state.layout.extent ? walkRowsExtent(bars) : undefined,
      })
    : undefined
}

export function fitted() {
  const b = bounds()
  return b ? fitTransform(b, state.width, state.height, pixelRows()) : undefined
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

const viewport = () => viewportOf(state, axis(), state.width, state.height)

export function rebuild() {
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
  afterDraw.forEach(fn => fn())
}

let overlayBubbles = {
  halos: [] as MinigraphBubble[],
  glyphs: [] as MinigraphBubble[],
}

// The bubble whose chip or glyph `target` is in, if any
export function bubbleAt(target: EventTarget | null) {
  const hit = (target as Element | null)?.closest('[data-halo],[data-glyph]')
  const halo = hit?.getAttribute('data-halo')
  const glyph = hit?.getAttribute('data-glyph')
  return halo != null
    ? overlayBubbles.halos[Number(halo)]
    : glyph != null
      ? overlayBubbles.glyphs[Number(glyph)]
      : undefined
}

function drawOverlays() {
  const { graph, layout } = state
  const f = facts()
  const d = current()
  const { scaleX, scaleY } = axis()
  const back = state.stack.at(-1)
  const backLabel = back && `◀ Back to ${back.graph.name}`
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
    genePins: d.genePins,
    poppedFrom: backLabel ? { label: backLabel } : undefined,
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
    genePins: d.genePins,
    glyphs: d.glyphs,
    labels,
    rowLabels: d.rowLabels,
    walkBars: d.bars,
    regionEnd: state.region?.end,
    highlight: d.highlight,
  }
  ui.svg.setAttribute('width', String(state.width))
  ui.svg.setAttribute('height', String(state.height))
  setHtml(ui.svg, layout ? overlaySvg(pane) : '')
  setHtml(ui.html, layout ? overlayHtml(pane) : '')
  overlayBubbles = {
    halos: d.halos.map(h => h.bubble),
    glyphs: d.glyphs.map(g => g.bubble),
  }

  const ramp = d.ramp
  const legends = layout
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

// The hover, else the selected node with where to open it. Only the selection
// goes to the live region, so a screen reader doesn't read out every hover.
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
    const ref = referenceWindow()
    const link = ref && nodeLink(selected, targetOf(ref), ref.contigs)
    html = `${nodeHtml(selected)}<div class="info-actions">${
      link
        ? `<a href="${esc(link)}" target="_blank" rel="noopener">Show in JBrowse ↗</a>`
        : ''
    }<button type="button" data-close aria-label="Deselect">✕</button></div>`
    interactive = true
  }
  setHtml(ui.info, html)
  ui.info.hidden = html === ''
  ui.info.classList.toggle('interactive', interactive)
  const said = selected ? `Selected ${nodeText(selected)}` : ''
  if (ui.announce.textContent !== said) {
    ui.announce.textContent = said
  }
}

ui.info.addEventListener('click', e => {
  if ((e.target as Element).closest('[data-close]')) {
    state.selectedNode = null
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
