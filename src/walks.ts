import { FACETS, count } from './settings'
import { saveSettings, settings, state } from './state'
import { rebuild } from './view'

import type { Facet } from './settings'
import type { Graph, WalkEncoding, WalkLayer } from '@jbrowse/bandage-core'

const WALK_PARAMS = ['walk', 'facet', 'columns']

// Walks a link names, lifted once the graph it names has opened
let asked: string[] = []

export function askWalks(params: URLSearchParams) {
  asked = params.getAll('walk')
  const facet = FACETS.find(f => f.value === params.get('facet'))
  if (facet) {
    settings.facet = facet.value
  }
  const columns = params.get('columns')
  if (columns !== null) {
    settings.facetColumns = count(Number(columns), settings.facetColumns)
  }
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

// The lifted walks and how they are faceted, as a link states them
export function walkParams(): [string, string][] {
  return [
    ...state.walkLayers.map((l): [string, string] => ['walk', l.walk]),
    ...(settings.facet !== 'none' && state.walkLayers.length > 1
      ? [['facet', settings.facet] as [string, string]]
      : []),
    ...(settings.facetColumns
      ? [['columns', String(settings.facetColumns)] as [string, string]]
      : []),
  ]
}

function changed() {
  const query = new URLSearchParams(location.search)
  if (query.size) {
    for (const k of WALK_PARAMS) {
      query.delete(k)
    }
    for (const [k, v] of walkParams()) {
      query.append(k, v)
    }
    history.replaceState(null, '', `?${query}`)
  }
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
  saveSettings()
  changed()
}

export function setFacetColumns(columns: number) {
  settings.facetColumns = columns
  saveSettings()
  changed()
}
