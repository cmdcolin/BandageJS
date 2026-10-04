import {
  BUBBLE_KIND_NAMES,
  bubbleSegmentIds,
  bubbleSubgraph,
  classifyBubble,
} from '@jbrowse/bandage-core'

import { notify } from './feedback'
import { relayout } from './layout'
import { recut } from './sources'
import { clearInteraction, effectiveMode, settings, state } from './state'
import { showCaption } from './view'

import type { MinigraphBubble } from '@jbrowse/bandage-core'

// The selected node stays selected in the graph that replaces this one
function keepingSelection(clear: () => void) {
  const id = state.selectedNode
  clear()
  state.selectedNode = id
}

// Draws a bubble's segments on their own, with Back to the graph it came from.
export function popBubble(bubble: MinigraphBubble) {
  const graph = state.graph
  if (!graph) {
    return
  }
  const sub = bubbleSubgraph(graph, bubbleSegmentIds(bubble))
  if (sub.nodes.length === 0) {
    notify('None of the segments of this bubble are in the graph')
    return
  }
  state.stack.push({ graph, mode: effectiveMode() })
  state.graph = {
    ...sub,
    name: `${BUBBLE_KIND_NAMES[classifyBubble(bubble).kind]} at ${bubble.refName}:${bubble.start.toLocaleString()}`,
  }
  state.layout = undefined
  keepingSelection(clearInteraction)
  showCaption()
  void relayout()
}

export function unpopBubble() {
  const from = state.stack.pop()
  if (from) {
    state.graph = from.graph
    state.layout = undefined
    state.modeOverride = from.mode === settings.mode ? undefined : from.mode
    keepingSelection(clearInteraction)
    showCaption()
    if (!recut()) {
      void relayout()
    }
  }
}
