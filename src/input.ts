import {
  findHoveredEdge,
  findHoveredNode,
  screenToLayout,
  tubeMapNodeAt,
  wheelZoomFactor,
  zoomAbout,
} from '@jbrowse/bandage-core'

import { popBubble, unpopBubble } from './bubbles'
import { inkOf } from './derived'
import { showHelp } from './dialogs'
import { focusFind } from './find'
import { droppedHandle } from './recent'
import { store, stored } from './settings'
import { openFile } from './sources'
import {
  axis,
  current,
  drawPaths,
  hiddenEdges,
  pixelRows,
  settings,
  state,
  tube,
} from './state'
import { ui } from './ui'
import {
  bubbleAt,
  fitView,
  onSurface,
  scheduleDraw,
  scheduleRebuild,
  tubeFrame,
  viewBox,
  viewportMoved,
} from './view'
import { liftAlone } from './walks'

const BUTTON_ZOOM = 1.5

// against the canvas the pointer is on: the pane's, or a facet panel's, which
// draws the same transform
function local(
  e: { clientX: number; clientY: number },
  surface: Element = ui.canvas,
) {
  const rect = surface.getBoundingClientRect()
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

function zoomCentre(factor: number) {
  const { width, height } = viewBox()
  zoomAt(factor, width / 2, height / 2)
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

function bindSurface(canvas: HTMLCanvasElement) {
  canvas.addEventListener('pointerdown', e => {
    if (e.button !== 0) {
      return
    }
    canvas.setPointerCapture(e.pointerId)
    const p = local(e, canvas)
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
    canvas.classList.add('dragging')
  })

  canvas.addEventListener('pointermove', e => {
    const p = local(e, canvas)
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
      scheduleRebuild()
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
      canvas.classList.remove('dragging')
      if (tapped && e.type === 'pointerup') {
        const p = local(e, canvas)
        state.selectedNode = nodeAtScreen(p.x, p.y)
        scheduleDraw()
      }
    }
  }

  canvas.addEventListener('pointerup', endPointer)
  canvas.addEventListener('pointercancel', endPointer)
  canvas.addEventListener('pointerleave', e => {
    if (e.pointerType === 'mouse') {
      cancelAnimationFrame(hoverFrame)
      state.hoveredNode = null
      state.hoveredEdge = null
      scheduleDraw()
    }
  })
}

onSurface(bindSurface)

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

// on the pane, so the wheel zooms over the bubble chips too, and about the
// point under the pointer in whichever facet panel it is over
ui.pane.addEventListener(
  'wheel',
  e => {
    e.preventDefault()
    const p = local(
      e,
      (e.target as Element).closest('.facet')?.querySelector('canvas') ??
        ui.canvas,
    )
    zoomAt(wheelZoomFactor(e), p.x, p.y)
  },
  { passive: false },
)

ui.facets.addEventListener('click', e => {
  const name = (e.target as Element)
    .closest('[data-walk]')
    ?.getAttribute('data-walk')
  if (name) {
    liftAlone(name)
  }
})

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
  if (e.key === 'Escape') {
    if (
      state.selectedNode !== null &&
      !document.querySelector('dialog[open], .menu:not([hidden])')
    ) {
      state.selectedNode = null
      scheduleDraw()
    }
  } else if (e.key === '?') {
    showHelp()
  } else if (e.key === '/') {
    e.preventDefault()
    focusFind()
  } else if (e.key === '+' || e.key === '=') {
    zoomCentre(BUTTON_ZOOM)
  } else if (e.key === '-') {
    zoomCentre(1 / BUTTON_ZOOM)
  } else if (e.key === '0') {
    fitView()
  }
})

ui.svg.addEventListener('click', e => {
  const bubble = bubbleAt(e.target)
  if (bubble) {
    popBubble(bubble)
  }
})
ui.svg.addEventListener('keydown', e => {
  const bubble =
    e.key === 'Enter' || e.key === ' ' ? bubbleAt(e.target) : undefined
  if (bubble) {
    e.preventDefault()
    popBubble(bubble)
  }
})

ui.back.addEventListener('click', unpopBubble)

// a dismissed hint keeps only where help is
ui.hint.classList.toggle(
  'dismissed',
  stored<unknown>('bandagejs-hint-dismissed', false) === true,
)
ui.hintClose.addEventListener('click', () => {
  ui.hint.classList.add('dismissed')
  store('bandagejs-hint-dismissed', true)
})

window.addEventListener('dragover', e => {
  if (e.dataTransfer?.types.includes('Files')) {
    e.preventDefault()
    document.body.classList.add('dropping')
  }
})
window.addEventListener('dragleave', e => {
  if (!e.relatedTarget) {
    document.body.classList.remove('dropping')
  }
})
window.addEventListener('drop', e => {
  e.preventDefault()
  document.body.classList.remove('dropping')
  const handle = droppedHandle(e)
  const file = e.dataTransfer?.files[0]
  if (file) {
    void Promise.resolve(handle)
      .catch(() => undefined)
      .then(h => openFile(file, file.name, h))
  }
})
