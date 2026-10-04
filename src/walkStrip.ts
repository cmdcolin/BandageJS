import {
  RAMP_GRADIENT_CSS,
  WALK_STRIP_CEILING_PX,
  segmentAt,
  stripGeneGaps,
  stripMarks,
  stripRowAt,
  walkMarksTree,
  walkRowReadout,
  walkRowsKey,
  walkRowsTree,
  walkStripFrame,
  walkStripLabelsTree,
} from '@jbrowse/bandage-core'

import { memo, rampInterval } from './derived'
import { svgDom } from './elDom'
import { walkRowsKeyHtml } from './overlays'
import { axis, current, facts, state, stripGenes, stripRows } from './state'
import { ui } from './ui'
import { onDraw, scheduleDraw } from './view'
import { toggleWalk } from './walks'

import type {
  GeneGaps,
  Graph,
  GraphNode,
  RowGene,
  StripFrame,
  WalkLayer,
  WalkRows,
} from '@jbrowse/bandage-core'

// Walk rows under a layout that draws nodes, each haplotype's walk on its own
// bp, linked to the drawing: the hovered node ticks every bar where its walk
// passes it, and a point on a bar lights its node, ringed, in the drawing.
// The bars take the drawing's reference-position hues. Every row is shown;
// rows too thin to letter say who they are on hover.

type Ramp = ReturnType<typeof current>['ramp']

const frameOf = memo((bars: WalkRows, width: number, maxHeight: number) =>
  walkStripFrame(bars, { width, maxHeight }),
)

const barsOf = memo(
  (
    bars: WalkRows,
    frame: StripFrame,
    ramp: Ramp,
    rowGenes: Map<string, RowGene[]> | undefined,
  ) =>
    svgDom(
      walkRowsTree(bars, frame, {
        ramp: rampInterval(ramp),
        rowGenes,
        idPrefix: 'strip',
      }),
    ),
)

const marksOf = memo(
  (
    bars: WalkRows,
    frame: StripFrame,
    graph: Graph | undefined,
    node: GraphNode | undefined,
  ) =>
    svgDom(
      walkMarksTree(
        bars,
        frame,
        graph && node
          ? stripMarks(graph, [bars.reference, ...bars.rows], node)
          : [],
      ),
    ),
)

const labelsOf = memo(
  (bars: WalkRows, frame: StripFrame, layers: WalkLayer[]) =>
    frame.labelled
      ? svgDom(
          walkStripLabelsTree(bars, frame, new Set(layers.map(l => l.walk))),
        )
      : undefined,
)

const keyOf = memo(
  (bars: WalkRows, ramp: Ramp, genes: GeneGaps | undefined) =>
    walkRowsKeyHtml(
      walkRowsKey(bars, {
        ramp: rampInterval(ramp),
        rampCss: RAMP_GRADIENT_CSS,
        genes,
      }),
    ) +
    '<span>▮ ticks: where each walk passes the node under the pointer · click a bar to highlight its walk</span>',
)

function frame(bars: WalkRows) {
  return frameOf(
    bars,
    state.width,
    Math.min(WALK_STRIP_CEILING_PX, Math.round(window.innerHeight * 0.4)),
  )
}

// Where the drawing has the node a strip point lights, in pane pixels
function locatorAt() {
  const id = state.stripHover ? state.hoveredNode : null
  const segments = id === null ? undefined : state.layout?.nodePositions[id]
  const p = segments?.[Math.floor(segments.length / 2)]
  if (!p || ui.pane.classList.contains('faceted')) {
    return undefined
  }
  const { scaleX, scaleY } = axis()
  return {
    x: p.x * scaleX + state.translateX,
    y: p.y * scaleY + state.translateY,
  }
}

const ring = (at: { x: number; y: number }) =>
  ['white', '#111']
    .map(
      (stroke, i) =>
        `<circle cx="${at.x}" cy="${at.y}" r="11" fill="none" stroke="${stroke}" stroke-width="${i === 0 ? 4 : 1.75}"/>`,
    )
    .join('')

let shown: {
  bars?: Node
  marks?: Node
  labels?: Node
  key?: string
  locator?: string
} = {}

function drawStrip() {
  const bars = stripRows()
  ui.strip.hidden = !bars
  const at = bars && locatorAt()
  const locator = at ? ring(at) : ''
  if (shown.locator !== locator) {
    ui.stripLocator.innerHTML = locator
  }
  if (!bars) {
    shown = { locator }
    return
  }
  const f = frame(bars)
  const ramp = current().ramp
  const id = state.hoveredNode ?? state.selectedNode
  const rowGenes = stripGenes(bars)
  const next = {
    bars: barsOf(bars, f, ramp, rowGenes),
    marks: marksOf(
      bars,
      f,
      state.graph,
      id === null ? undefined : facts().nodeById.get(id),
    ),
    labels: labelsOf(bars, f, state.walkLayers),
    key: keyOf(bars, ramp, stripGeneGaps(f, rowGenes, state.walkGeneNote)),
    locator,
  }
  ui.stripSvg.setAttribute('width', String(f.width))
  ui.stripSvg.setAttribute('height', String(f.height))
  if (shown.bars !== next.bars) {
    ui.stripBars.replaceChildren(next.bars)
  }
  if (shown.marks !== next.marks) {
    ui.stripMarks.replaceChildren(next.marks)
  }
  if (shown.labels !== next.labels) {
    ui.stripLabels.replaceChildren(...(next.labels ? [next.labels] : []))
  }
  if (shown.key !== next.key) {
    ui.stripKey.innerHTML = next.key
  }
  shown = next
}

onDraw(drawStrip)

// The row and bar offset under a strip pointer event
function hit(e: MouseEvent) {
  const bars = stripRows()
  if (!bars) {
    return undefined
  }
  const box = ui.stripSvg.getBoundingClientRect()
  const x = e.clientX - box.left
  const y = e.clientY - box.top
  const f = frame(bars)
  const at = stripRowAt(bars, f, x, y)
  return at && { ...at, bars, frame: f, x, y }
}

function showTip(text: string | undefined, x = 0, y = 0) {
  ui.stripTip.hidden = text === undefined
  if (text !== undefined) {
    ui.stripTip.textContent = text
    ui.stripTip.style.left = `${x + 12}px`
    ui.stripTip.style.top = `${y - 18}px`
  }
}

ui.stripSvg.addEventListener('pointermove', e => {
  const at = hit(e)
  const node =
    at && state.graph
      ? segmentAt(state.graph, at.row, at.offset, at.frame.scaleX)
      : undefined
  if ((node ?? null) !== state.hoveredNode || !!node !== state.stripHover) {
    state.hoveredNode = node ?? null
    state.hoveredEdge = null
    state.stripHover = !!node
    scheduleDraw()
  }
  showTip(
    at && !at.frame.labelled
      ? `${at.row.label} · ${walkRowReadout(
          at.row,
          at.index === 0 ? undefined : at.bars.reference,
        )}`
      : undefined,
    at?.x,
    at?.y,
  )
})

ui.stripSvg.addEventListener('pointerleave', () => {
  if (state.stripHover) {
    state.hoveredNode = null
    state.stripHover = false
    scheduleDraw()
  }
  showTip(undefined)
})

// A click selects the row, with its link into JBrowse, and lifts its walk or
// drops it; the reference row stays in the drawing
ui.stripSvg.addEventListener('click', e => {
  const at = hit(e)
  if (!at) {
    return
  }
  state.selectedNode = null
  state.selectedRow = at.row.name
  if (at.index > 0) {
    toggleWalk(at.row.name)
  } else {
    scheduleDraw()
  }
})
