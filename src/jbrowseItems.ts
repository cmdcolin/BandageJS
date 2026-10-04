import { panSNHaplotype } from '@jbrowse/bandage-core'

import { hubLabel } from './hubConfig'
import {
  cutTrack,
  gfaViewLink,
  graphViewLink,
  hasGraphView,
  jbrowseMode,
  laneSamples,
  nodeLink,
  regionLink,
} from './jbrowse'
import { binding, bindingReason, referenceWindow, targetOf } from './reference'
import { effectiveMode, facts, state } from './state'

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

export function jbrowseItems(): MenuItem[] {
  const ref = referenceWindow()
  const t = ref && targetOf(ref)
  const reason = bindingReason(binding())
  const one = ref?.regions.length === 1 ? ref.regions[0] : undefined
  const region = one && {
    ...one,
    refName: ref!.contigs[one.refName] ?? one.refName,
  }
  const src = state.source
  const lanes = t && src?.gbz ? cutTrack(t, src.gbz.db) : undefined
  const mode = jbrowseMode(effectiveMode())
  const selected = state.selectedNode
    ? facts().nodeById.get(state.selectedNode)
    : undefined
  const haplotype = selected?.stable && panSNHaplotype(selected.stable.refName)
  const nodeUrl = selected && t ? nodeLink(selected, t, ref.contigs) : undefined
  const noRegion = reason ?? 'Needs a graph on one contig of the reference'
  const viewer = t && hasGraphView(t.hub)
  return [
    {
      label: 'Open this region in JBrowse',
      detail: region && t ? undefined : noRegion,
      disabled: !region,
      onClick: () => {
        openTab(regionLink(t!, region!, jbrowseSamples(t!)))
      },
    },
    {
      label: "Open this graph in JBrowse's graph view",
      detail: !region
        ? noRegion
        : !viewer
          ? `${hubLabel(t!.hub.url)} doesn't load the graph viewer plugin`
          : lanes || src?.url
            ? undefined
            : 'Open the graph from a url to hand it to JBrowse',
      disabled: !region || !viewer || !(lanes || src?.url),
      onClick: () => {
        openTab(
          lanes
            ? graphViewLink(
                t!,
                lanes,
                region!,
                src!.gbz?.haplotypes ?? [],
                mode,
              )
            : gfaViewLink(t!, src!.url!, region!, mode),
        )
      },
    },
    {
      label: 'Show the selected node in JBrowse',
      detail: nodeUrl
        ? undefined
        : !selected
          ? 'Click a node first'
          : (reason ??
            `${hubLabel(t!.hub.url)} has no assembly for ${haplotype ?? 'this node'}`),
      disabled: !nodeUrl,
      onClick: () => {
        openTab(nodeUrl!)
      },
    },
  ]
}
