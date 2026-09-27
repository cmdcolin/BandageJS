import { axisScaleOf, layoutExtent } from '@jbrowse/bandage-core'

import { notify } from './feedback'
import { esc } from './overlays'
import { findNodes, frameScale } from './search'
import { pixelRows, state, tube } from './state'
import { ui } from './ui'
import { fitted, onDraw, scheduleDraw, tubeFrame, viewportMoved } from './view'

import type { Bounds, Graph, PaneTransform } from '@jbrowse/bandage-core'

const SUGGESTIONS = 20
const SUGGEST_DEBOUNCE_MS = 120

// Where node `id` lands on screen under `t`: its box in the tube map, else
// the bounds of its segments
function screenBox(id: string, t: PaneTransform): Bounds | undefined {
  const drawing = tube()
  if (drawing) {
    const { nodes, nodeMap } = drawing.layout
    const node = nodes[nodeMap.get(id) ?? -1]
    const frame = tubeFrame(t)
    return node && node.order >= 0 && frame
      ? {
          minX: frame.x(node.x),
          maxX: frame.x(node.x + node.pixelWidth),
          minY: frame.y(node.y),
          maxY: frame.y(node.y + node.contentHeight),
        }
      : undefined
  }
  const segments = state.layout?.nodePositions[id]
  if (!segments?.length) {
    return undefined
  }
  const b = layoutExtent({ [id]: segments })
  const { scaleX, scaleY } = axisScaleOf(t.scale, pixelRows())
  return {
    minX: b.minX * scaleX + t.translateX,
    maxX: b.maxX * scaleX + t.translateX,
    minY: b.minY * scaleY + t.translateY,
    maxY: b.maxY * scaleY + t.translateY,
  }
}

// Centres node `id` with room around it, as the zoom buttons would: the view
// is the user's from then on
function frameNode(id: string) {
  const at = (scale: number) =>
    screenBox(id, { scale, translateX: 0, translateY: 0 })
  const unit = at(1)
  if (!unit) {
    return false
  }
  const scale = frameScale(
    { w: unit.maxX - unit.minX, h: unit.maxY - unit.minY },
    state.width,
    state.height,
    pixelRows(),
    fitted()?.scale,
  )
  const box = at(scale)!
  state.owner = 'user'
  state.scale = scale
  state.translateX = state.width / 2 - (box.minX + box.maxX) / 2
  state.translateY = state.height / 2 - (box.minY + box.maxY) / 2
  viewportMoved()
  return true
}

function find(query: string) {
  const node = state.graph && findNodes(state.graph.nodes, query, 1)[0]
  if (!node) {
    notify(`No node named ${query.trim()}`, false)
    return
  }
  state.selectedNode = node.id
  state.hoveredNode = null
  state.hoveredEdge = null
  if (!frameNode(node.id)) {
    notify(`${node.name} isn't drawn in this layout`, false)
  }
  scheduleDraw()
}

let suggestTimer: ReturnType<typeof setTimeout> | undefined

function suggest() {
  const matches = state.graph
    ? findNodes(state.graph.nodes, ui.find.value, SUGGESTIONS)
    : []
  ui.findList.innerHTML = matches
    .map(n => `<option value="${esc(n.name)}"></option>`)
    .join('')
}

export function focusFind() {
  if (!ui.findForm.hidden) {
    ui.find.focus()
    ui.find.select()
  }
}

ui.findForm.addEventListener('submit', e => {
  e.preventDefault()
  clearTimeout(suggestTimer)
  if (ui.find.value.trim() !== '') {
    find(ui.find.value)
  }
})

ui.find.addEventListener('input', e => {
  clearTimeout(suggestTimer)
  if ((e as InputEvent).inputType === 'insertReplacementText') {
    find(ui.find.value)
  } else {
    suggestTimer = setTimeout(suggest, SUGGEST_DEBOUNCE_MS)
  }
})

ui.find.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    e.preventDefault()
    ui.find.value = ''
    ui.findList.replaceChildren()
    ui.find.blur()
  }
})

let shownGraph: Graph | undefined

onDraw(() => {
  ui.findForm.hidden = !state.graph
  if (state.graph !== shownGraph) {
    shownGraph = state.graph
    ui.findList.replaceChildren()
  }
})
