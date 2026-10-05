import { axisScaleOf, screenToLayout } from '@jbrowse/bandage-core'

import { formatView, parseView, replaceParams } from './address'
import { notify } from './feedback'
import { selectNode } from './find'
import { axis, pixelRows, selectedNode, state } from './state'
import { onDraw, viewBox, viewportMoved } from './view'

import type { View } from './address'

// The selected node and the view in the address, as `node` and `view`, so a
// link lands on what its sender saw. The view is the layout point at the
// pane's centre and the zoom, which hold across window sizes.

const VIEW_DEBOUNCE_MS = 400

let asked: { node?: string; view?: View } | undefined

export function askView(params: URLSearchParams) {
  asked = {
    node: params.get('node') ?? undefined,
    view: parseView(params.get('view')),
  }
}

function currentView(): View {
  const { width, height } = viewBox()
  const p = screenToLayout(width / 2, height / 2, state, axis())
  return { x: p.x, y: p.y, scale: state.scale }
}

function applyView(v: View) {
  const { width, height } = viewBox()
  const { scaleX, scaleY } = axisScaleOf(v.scale, pixelRows())
  state.owner = 'user'
  state.scale = v.scale
  state.translateX = width / 2 - v.x * scaleX
  state.translateY = height / 2 - v.y * scaleY
  viewportMoved()
}

// Selects and shows what the link asked, once the graph it opened has a
// layout; a view it states wins over framing the node
export function takeAskedView() {
  const a = asked
  asked = undefined
  if (!a || !state.graph || !state.layout) {
    return
  }
  const node = a.node
    ? state.graph.nodes.find(n => n.name === a.node || n.id === a.node)
    : undefined
  if (a.node && !node) {
    notify(`No node named ${a.node}`, false)
  }
  if (a.view) {
    applyView(a.view)
    if (node) {
      state.selectedNode = node.id
    }
  } else if (node) {
    selectNode(node.id)
  }
}

let writtenNode = ''
let writtenView = ''
let viewTimer: ReturnType<typeof setTimeout> | undefined

function writeView(view: string) {
  viewTimer = undefined
  writtenView = view
  replaceParams(['view'], view ? [['view', view]] : [])
}

onDraw(() => {
  if (!state.graph || !state.layout) {
    return
  }
  const node = selectedNode()?.name ?? ''
  if (node !== writtenNode) {
    writtenNode = node
    replaceParams(['node'], node ? [['node', node]] : [])
  }
  const view = state.owner === 'user' ? formatView(currentView()) : ''
  if (view !== writtenView) {
    clearTimeout(viewTimer)
    viewTimer = setTimeout(() => {
      writeView(view)
    }, VIEW_DEBOUNCE_MS)
  }
})

// The address with every pending write in it, as a link to what is on screen
export async function copyLink() {
  if (viewTimer) {
    clearTimeout(viewTimer)
    writeView(state.owner === 'user' ? formatView(currentView()) : '')
  }
  try {
    await navigator.clipboard.writeText(location.href)
    notify('Link copied', false)
  } catch (e) {
    notify(`Could not copy the link: ${String(e)}`)
  }
}
