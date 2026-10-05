import { panSNContig } from '@jbrowse/bandage-core'
import {
  backboneNodes,
  overlapsWindow,
} from '@jbrowse/bandage-core/anchoredNodes'

import { notify } from './feedback'
import { frameNodes } from './find'
import { backboneOf } from './reference'
import {
  formatRegion,
  namesContig,
  parseLocation,
  shifted,
  within,
} from './region'
import { openGbz } from './sources'
import { state } from './state'
import { ui } from './ui'
import { onDraw, scheduleDraw } from './view'

import type { Region } from './jbrowse'

// The location box: a region or gene typed there is framed in the drawing,
// or cut afresh from the database when it lies outside the window on screen.
// ‹ and › step half a window along the reference.

const STEP = 0.5

// The region the box stands for: the window a cut or example was made for,
// else the span of the backbone's first contig
function shownRegion(): Region | undefined {
  if (state.region) {
    return state.region
  }
  const c = backboneOf(state.graph)?.contigs[0]
  return c ? { refName: c.refName, start: c.start, end: c.end } : undefined
}

function geneRegion(name: string): Region | undefined {
  const wanted = name.toLowerCase()
  const gene = state.genes?.find(g => g.name.toLowerCase() === wanted)
  return gene
    ? { refName: gene.refName, start: gene.start, end: gene.end }
    : undefined
}

function coverage() {
  return (backboneOf(state.graph)?.contigs ?? [])
    .map(c => formatRegion({ refName: c.refName, start: c.start, end: c.end }))
    .join(', ')
}

function frameRegion(region: Region) {
  const graph = state.graph
  if (!graph) {
    return
  }
  const nodes = backboneNodes(graph).filter(
    n =>
      namesContig(region.refName, n.stable.refName) &&
      overlapsWindow(n, region),
  )
  if (nodes.length === 0) {
    notify(
      `Nothing in the graph at ${formatRegion(region)}; it covers ${coverage()}`,
      false,
    )
    return
  }
  if (!frameNodes(nodes.map(n => n.id))) {
    notify(`${formatRegion(region)} isn't drawn in this layout`, false)
    return
  }
  state.selectedNode = nodes.length === 1 ? nodes[0]!.id : null
  state.selectedRow = null
  scheduleDraw()
}

function recut(region: Region) {
  const source = state.source!
  void openGbz(
    {
      ...source.gbz!,
      region: formatRegion({ ...region, refName: panSNContig(region.refName) }),
    },
    undefined,
    true,
    undefined,
    {
      declared: source.declared,
      referencePath: state.referencePath,
      walks: state.walkLayers,
    },
  )
}

export function locate(text: string) {
  const typed = text.trim()
  const region = parseLocation(typed) ?? geneRegion(typed)
  if (!region) {
    notify(
      `${typed} is not a region like chr6:160,614,798-160,647,758, nor a gene shown`,
    )
    return
  }
  const window = state.region
  if (
    state.source?.gbz &&
    state.stack.length === 0 &&
    !(window && within(region, window))
  ) {
    recut(region)
  } else {
    frameRegion(region)
  }
}

export function focusLocate() {
  if (!ui.locateForm.hidden) {
    ui.locate.focus()
    ui.locate.select()
  }
}

function step(fraction: number) {
  const from = parseLocation(ui.locate.value) ?? shownRegion()
  if (from) {
    ui.locate.value = formatRegion(shifted(from, fraction))
    locate(ui.locate.value)
  }
}

ui.locateForm.addEventListener('submit', e => {
  e.preventDefault()
  if (ui.locate.value.trim() !== '') {
    locate(ui.locate.value)
  }
})
ui.locateBack.addEventListener('click', () => {
  step(-STEP)
})
ui.locateForward.addEventListener('click', () => {
  step(STEP)
})
ui.locate.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    e.preventDefault()
    ui.locate.blur()
  }
})

let shownGraph: typeof state.graph

onDraw(() => {
  const region = state.graph ? shownRegion() : undefined
  ui.locateForm.hidden = !region
  if (state.graph !== shownGraph) {
    shownGraph = state.graph
    ui.locate.value = state.region ? formatRegion(state.region) : ''
    ui.locate.placeholder = region ? formatRegion(region) : ''
  }
})
