import { parseGaf } from '@jbrowse/bandage-core/gaf/parseGaf'

import { replaceParams } from './address'
import { done, fail, notify, progress } from './feedback'
import { relayout } from './layout'
import { gfaText, readError } from './read'
import { state, tube } from './state'
import { ui } from './ui'
import { rebuild } from './view'

import type { GafRecord } from '@jbrowse/bandage-core/gaf/parseGaf'

// Reads aligned to the graph, from a GAF. They stay on the graph: the tube
// map draws each with its mismatches, and the layouts that draw nodes widen a
// node by the reads over it.

export const READS_FILE = /\.gaf(\.gz)?$/i

// Keeps the reads that touch a node of the graph on screen
function attachReads(records: GafRecord[], from: string) {
  const graph = state.graph
  if (!graph) {
    return
  }
  const names = new Set(graph.nodes.map(n => n.name))
  const reads = records.filter(r => r.path.some(s => names.has(s.name)))
  if (reads.length === 0) {
    notify(
      `None of the ${records.length.toLocaleString()} reads in ${from} touch a node of this graph`,
    )
    return
  }
  // in place: a layout under way keeps its graph, and its result draws them
  graph.reads = reads
  if (tube()) {
    void relayout()
  } else {
    rebuild()
  }
  notify(
    `${reads.length.toLocaleString()} of ${records.length.toLocaleString()} reads in ${from} lie on this graph`,
    false,
  )
}

export async function openReadsFile(file: Blob, name: string) {
  const work = progress(`Reading ${name}`)
  try {
    attachReads(parseGaf(await gfaText(file)), name)
    replaceParams(['reads'], [])
  } catch (e) {
    fail(e)
  } finally {
    done(work)
  }
}

export async function openReadsUrl(url: string) {
  const name = url.split('/').pop() || url
  const work = progress(`Fetching ${name}`)
  try {
    const res = await fetch(url).catch((e: unknown) => {
      throw readError(e, url)
    })
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} fetching ${url}`)
    }
    attachReads(parseGaf(await gfaText(await res.blob())), name)
    if (state.graph?.reads) {
      replaceParams(['reads'], [['reads', url]])
    }
  } catch (e) {
    fail(e)
  } finally {
    done(work)
  }
}

export function pickReads() {
  ui.readsFile.click()
}

ui.readsFile.addEventListener('change', () => {
  const file = ui.readsFile.files?.[0]
  if (file) {
    void openReadsFile(file, file.name)
  }
  ui.readsFile.value = ''
})
