import {
  LABEL_CHAR_PX,
  RAMP_GRADIENT_CSS,
  el,
  segmentAt,
  stripMarks,
  stripRowAt,
  walkMarksTree,
  walkRowReadout,
  walkRowsKey,
  walkRowsTree,
  walkStripFrame,
} from '@jbrowse/bandage-core'

import { memo } from './derived'
import { svgDom } from './elDom'
import { walkRowsKeyHtml } from './overlays'
import { axis, current, facts, state, stripRows } from './state'
import { ui } from './ui'
import { onDraw, scheduleDraw } from './view'
import { toggleWalk } from './walks'

import type { StripFrame, WalkRows } from '@jbrowse/bandage-core'

// Walk rows under a layout that draws nodes, each haplotype's walk on its own
// bp, linked to the drawing: the hovered node ticks every bar where its walk
// passes it, and a point on a bar lights its node, ringed, in the drawing.
// The bars take the drawing's reference-position hues. Every row is shown;
// rows too thin to letter say who they are on hover.

const STRIP_CEILING_PX = 260
const LABEL_FONT_PX = 11

type Ramp = ReturnType<typeof current>['ramp']

const frameOf = memo((bars: WalkRows, width: number, maxHeight: number) => {
  const longest = Math.max(
    ...[bars.reference, ...bars.rows].map(r => r.label.length),
  )
  return walkStripFrame(bars, {
    width,
    maxHeight,
    labelPx: longest * LABEL_CHAR_PX + 16,
  })
})

const barsOf = memo((bars: WalkRows, frame: StripFrame, ramp: Ramp) =>
  svgDom(
    walkRowsTree(bars, frame, {
      ramp: ramp && { start: ramp.start, end: ramp.start + ramp.span },
      idPrefix: 'strip',
    }),
  ),
)

function frame(bars: WalkRows) {
  return frameOf(
    bars,
    state.width,
    Math.min(STRIP_CEILING_PX, Math.round(window.innerHeight * 0.4)),
  )
}

function labelsTree(bars: WalkRows, f: StripFrame) {
  const lifted = new Set(state.walkLayers.map(l => l.walk))
  return el(
    'g',
    {},
    ...[bars.reference, ...bars.rows].map((row, i) =>
      el(
        'text',
        {
          x: 6,
          y: i * f.rowPx + f.translateY + 4,
          'font-size': LABEL_FONT_PX,
          'font-weight': lifted.has(row.name) ? 600 : 400,
          fill: '#333',
        },
        row.label,
      ),
    ),
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

let shown: { bars?: Node; key?: string; locator?: string } = {}

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
  ui.stripSvg.setAttribute('width', String(f.width))
  ui.stripSvg.setAttribute('height', String(f.height))
  const drawn = barsOf(bars, f, current().ramp)
  if (shown.bars !== drawn) {
    ui.stripBars.replaceChildren(drawn)
  }
  const id = state.hoveredNode ?? state.selectedNode
  const node = id === null ? undefined : facts().nodeById.get(id)
  const marks =
    node && state.graph
      ? stripMarks(state.graph, [bars.reference, ...bars.rows], node)
      : []
  ui.stripMarks.replaceChildren(svgDom(walkMarksTree(bars, f, marks)))
  ui.stripLabels.replaceChildren(
    ...(f.labelled ? [svgDom(labelsTree(bars, f))] : []),
  )
  const ramp = current().ramp
  const key =
    walkRowsKeyHtml(
      walkRowsKey(bars, {
        ramp: ramp && { start: ramp.start, end: ramp.start + ramp.span },
        rampCss: RAMP_GRADIENT_CSS,
      }),
    ) +
    '<span class="strip-hint">▮ ticks: where each walk passes the node under the pointer · click a bar to lift its walk</span>'
  if (shown.key !== key) {
    ui.stripKey.innerHTML = key
  }
  shown = { bars: drawn, key, locator }
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
  state.hoveredNode = node ?? null
  state.hoveredEdge = null
  state.stripHover = !!node
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
  scheduleDraw()
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
