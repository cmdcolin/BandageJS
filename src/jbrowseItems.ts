import { panSNHaplotype } from '@jbrowse/bandage-core'

import {
  cutTrack,
  gfaViewLink,
  graphViewLink,
  hasGraphView,
  jbrowseMode,
  laneSamples,
  regionLink,
} from './jbrowse'
import { referenceWindow, targetOf } from './reference'
import { effectiveMode, state } from './state'

import type { Target } from './jbrowse'
import type { MenuItem } from './menus'

// The haplotypes the lanes show, those the hub has: the lifted walks', else
// the cut's, else the graph's own walks.
function jbrowseSamples(t: Target) {
  const lifted = state.walkLayers.flatMap(l => panSNHaplotype(l.walk) ?? [])
  if (lifted.length > 0) {
    return laneSamples(t, lifted)
  }
  if (state.source?.gbz?.haplotypes?.length) {
    return laneSamples(t, state.source.gbz.haplotypes)
  }
  const haplotypes = new Set(
    (state.graph?.paths ?? []).map(p => panSNHaplotype(p.name) ?? ''),
  )
  return laneSamples(
    t,
    [...haplotypes].filter(h => h !== ''),
  ).slice(0, 16)
}

function openTab(url: string) {
  window.open(url, '_blank', 'noopener')
}

// The links JBrowse can open for the graph on screen, those it can
export function jbrowseItems(): MenuItem[] {
  const ref = referenceWindow()
  const t = ref && targetOf(ref)
  const one = ref?.regions.length === 1 ? ref.regions[0] : undefined
  if (!t || !one) {
    return []
  }
  const region = { ...one, refName: ref.contigs[one.refName] ?? one.refName }
  const src = state.source
  const lanes = src?.gbz ? cutTrack(t, src.gbz.db) : undefined
  const mode = jbrowseMode(effectiveMode())
  return [
    {
      label: 'Open this region in JBrowse',
      onClick: () => {
        openTab(regionLink(t, region, jbrowseSamples(t)))
      },
    },
    ...(hasGraphView(t.hub) && (lanes || src?.url)
      ? [
          {
            label: "Open this graph in JBrowse's graph view",
            onClick: () => {
              openTab(
                lanes
                  ? graphViewLink(
                      t,
                      lanes,
                      region,
                      src!.gbz?.haplotypes ?? [],
                      mode,
                    )
                  : gfaViewLink(t, src!.url!, region, mode),
              )
            },
          },
        ]
      : []),
  ]
}
