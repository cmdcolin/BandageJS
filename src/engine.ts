import type {
  EngineRequest,
  LayoutEngine,
  LayoutResult,
} from '../graphgenomeviewer/src/core'

type Reply =
  | { result: LayoutResult; duration: number; error?: undefined }
  | { error: string }

// One layout at a time. FMMM cannot be interrupted, so a request that
// supersedes a running one terminates its worker rather than waiting it out;
// the engine is ~430 kB and only fetched on the first force layout. A worker
// that failed is dropped too: an aborted Emscripten module stays aborted.
let worker: Worker | undefined
let reject: ((e: Error) => void) | undefined

function drop() {
  worker?.terminate()
  worker = undefined
}

export function cancelLayout() {
  if (reject) {
    drop()
    reject(new Error('superseded'))
    reject = undefined
  }
}

export const workerEngine: LayoutEngine = (request: EngineRequest) => {
  cancelLayout()
  worker ??= new Worker(new URL('layoutWorker.js', import.meta.url), {
    type: 'module',
  })
  const w = worker
  return new Promise((resolve, fail) => {
    reject = fail
    w.onmessage = (e: MessageEvent<Reply>) => {
      reject = undefined
      if (e.data.error === undefined) {
        resolve(e.data)
      } else {
        drop()
        fail(new Error(e.data.error))
      }
    }
    w.onerror = e => {
      reject = undefined
      drop()
      fail(new Error(e.message || 'layout worker failed'))
    }
    w.postMessage(request)
  })
}

export function isSuperseded(e: unknown) {
  return e instanceof Error && e.message === 'superseded'
}
