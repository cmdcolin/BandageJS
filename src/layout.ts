import {
  createForceLayoutCache,
  engineSettingsOf,
  layoutModeByValue,
} from '@jbrowse/bandage-core'

import { cancelLayout, isSuperseded, workerEngine } from './engine'
import { done, fail, progress } from './feedback'
import { takeAskedView } from './linkView'
import { effectiveMode, settings, state } from './state'
import { fit, rebuild } from './view'

import type { Work } from './feedback'
import type { Graph } from '@jbrowse/bandage-core'

let forceCache = createForceLayoutCache()
let liveLayout = 0
let layoutWork: Work | undefined

function forceOf(graph: Graph) {
  return forceCache.layout(
    graph,
    engineSettingsOf({
      engine: settings.engine,
      quality: settings.quality,
      bubbleSpread: settings.bubbleSpread,
      spacing: settings.spacing,
      componentSeparation: settings.componentSeparation,
      showDeletionEdges: settings.showDeletionEdges,
    }),
    workerEngine,
  )
}

export async function relayout() {
  const graph = state.graph
  if (!graph) {
    return
  }
  const request = ++liveLayout
  done(layoutWork)
  const start = performance.now()
  try {
    const m = layoutModeByValue(effectiveMode())
    let result = m.run(graph, state.region)
    let duration = performance.now() - start
    const layoutMode = result ? m.value : 'force'
    if (!result) {
      layoutWork = progress('Computing force-directed layout')
      ;({ result, duration } = await forceOf(graph))
    }
    if (request === liveLayout && state.graph === graph) {
      state.layout = result
      state.layoutMode = layoutMode
      state.layoutMs = duration
      state.owner = 'fit'
      state.positionsVersion++
      fit()
      takeAskedView()
      rebuild()
    }
  } catch (e) {
    if (!isSuperseded(e) && request === liveLayout) {
      rebuild()
      fail(new Error(`Layout failed: ${e instanceof Error ? e.message : e}`))
    }
  } finally {
    if (request === liveLayout) {
      done(layoutWork)
    }
  }
}

export function rerunLayout() {
  forceCache = createForceLayoutCache()
  void relayout()
}

// Drops the layout under way, terminating a force layout's worker
export function stopLayout() {
  liveLayout++
  cancelLayout()
}
