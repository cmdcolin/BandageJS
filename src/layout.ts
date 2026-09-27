import {
  engineKey,
  forceLayout,
  layoutModeByValue,
} from '@jbrowse/bandage-core'

import { cancelLayout, isSuperseded, workerEngine } from './engine'
import { done, fail, progress } from './feedback'
import { effectiveMode, settings, state } from './state'
import { fit, rebuild } from './view'

import type { Work } from './feedback'
import type { Graph, LayoutResult } from '@jbrowse/bandage-core'

const FORCE_CACHE_SIZE = 4

// Force layouts by graph and settings, in flight or done, so leaving a slow
// layout for a local one and coming back picks it up rather than restarting.
const forceCache = new WeakMap<
  Graph,
  Map<string, Promise<{ result: LayoutResult; duration: number }>>
>()
let liveLayout = 0
let layoutWork: Work | undefined

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

// Drops the layout under way, terminating a force layout's worker
export function stopLayout() {
  liveLayout++
  cancelLayout()
}
