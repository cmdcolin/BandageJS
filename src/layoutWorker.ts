import { loadBandage } from '@jbrowse/bandage-core'

import type { EngineRequest } from '@jbrowse/bandage-core'

// The Bandage FMMM engine off the main thread: the same wasm module and the
// same request the plugin's GraphComputeLayout RPC runs.
self.onmessage = async (e: MessageEvent<EngineRequest>) => {
  try {
    const engine = await loadBandage()
    const start = performance.now()
    const result = engine.computeLayout(e.data.graph, e.data.options)
    self.postMessage({ result, duration: performance.now() - start })
  } catch (error) {
    self.postMessage({ error: String(error) })
  }
}
