import { replaceParams } from './address'
import { saveSettings, settings, state } from './state'
import { rebuild } from './view'

import type { Facet } from './settings'
import type { Graph, WalkEncoding, WalkLayer } from '@jbrowse/bandage-core'

// Walks a link names, lifted once the graph it names has opened
let asked: string[] = []

export function askWalks(params: URLSearchParams) {
  asked = params.getAll('walk')
}

// The walks to lift in a graph just opened: those a link asked for, or those
// `kept` from the graph it replaces, colours and all, where it has them
export function takeAskedWalks(graph: Graph, kept?: WalkLayer[]) {
  const names = new Set(graph.paths?.map(p => p.name))
  const layers = (kept ?? asked.map(walk => ({ walk }))).filter(l =>
    names.has(l.walk),
  )
  asked = []
  return layers
}

// The lifted walks as a link states them; the facet travels with the settings
export function walkParams(): [string, string][] {
  return state.walkLayers.map((l): [string, string] => ['walk', l.walk])
}

function changed() {
  replaceParams(['walk'], walkParams())
  rebuild()
}

// Lift the walks named, in that order, keeping the colour any already had
export function liftWalks(names: string[]) {
  const had = new Map(state.walkLayers.map(l => [l.walk, l]))
  state.walkLayers = names.map(walk => had.get(walk) ?? { walk })
  changed()
}

export function toggleWalk(name: string) {
  const names = state.walkLayers.map(l => l.walk)
  liftWalks(
    names.includes(name) ? names.filter(n => n !== name) : [...names, name],
  )
}

export function liftAlone(name: string) {
  liftWalks([name])
}

export function setWalkColor(name: string, color: Partial<WalkEncoding>) {
  state.walkLayers = state.walkLayers.map(l =>
    l.walk === name ? { ...l, color: { ...l.color, ...color } } : l,
  )
  changed()
}

export function setFacet(facet: Facet) {
  settings.facet = facet
  settings.facetColumns = 0
  saveSettings()
  changed()
}
