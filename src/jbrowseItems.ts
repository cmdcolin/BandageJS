import { panSNContig, panSNHaplotype } from '@jbrowse/bandage-core'

import { HPRC } from './gbz'
import {
  gfaViewLink,
  graphViewLink,
  jbrowseMode,
  nodeLink,
  regionLink,
} from './jbrowse'
import { noWindowReason, referenceWindow } from './reference'
import { effectiveMode, facts, state } from './state'

import type { MenuItem } from './menus'

// The haplotypes the lanes show: the lifted walk's, else the cut's, else the
// graph's own walks.
function jbrowseSamples() {
  const lifted = state.highlightedPath && panSNHaplotype(state.highlightedPath)
  if (lifted) {
    return [lifted]
  }
  if (state.source?.gbz?.haplotypes?.length) {
    return state.source.gbz.haplotypes
  }
  const haplotypes = new Set<string>()
  for (const p of state.graph?.paths ?? []) {
    const h = panSNHaplotype(p.name)
    if (h && !h.startsWith('GRCh38#') && !h.startsWith('CHM13#')) {
      haplotypes.add(h)
    }
  }
  return [...haplotypes].slice(0, 16)
}

function openTab(url: string) {
  window.open(url, '_blank', 'noopener')
}

export function jbrowseItems(): MenuItem[] {
  const window = referenceWindow()
  const region = window?.regions.length === 1 ? window.regions[0] : undefined
  const assembly = window?.assembly.name
  const src = state.source
  const onHprc = src?.gbz?.db === HPRC.db
  const mode = jbrowseMode(effectiveMode())
  const selected = state.selectedNode
    ? facts().nodeById.get(state.selectedNode)
    : undefined
  const nodeUrl = selected ? nodeLink(selected, assembly) : undefined
  const noRegion = !window
    ? noWindowReason()
    : 'Needs a graph on one contig of the reference'
  return [
    {
      label: 'Open this region in JBrowse',
      detail: region
        ? `${region.refName}:${(region.start + 1).toLocaleString()}-${region.end.toLocaleString()} with genes, the HPRC graph and haplotype lanes`
        : noRegion,
      disabled: !region,
      onClick: () => {
        openTab(regionLink(assembly!, region!, jbrowseSamples()))
      },
    },
    {
      label: "Open this graph in JBrowse's graph view",
      detail: !region
        ? noRegion
        : onHprc || src?.url
          ? 'Hover a node there to highlight its span in the linear view'
          : 'Open the graph from a url to hand it to JBrowse',
      disabled: !region || !(onHprc || src?.url),
      onClick: () => {
        openTab(
          onHprc
            ? graphViewLink(assembly!, region!, src.gbz?.haplotypes ?? [], mode)
            : gfaViewLink(src!.url!, assembly!, region!, mode),
        )
      },
    },
    {
      label: 'Show the selected node in JBrowse',
      detail: !selected
        ? 'Click a node first'
        : !window
          ? noWindowReason()
          : nodeUrl
            ? selected.stable?.rank
              ? `On ${panSNHaplotype(selected.stable.refName)}, the haplotype that contributed it`
              : `At its span on ${panSNContig(selected.stable?.refName ?? '')}`
            : 'The portal has no assembly for this node',
      disabled: !nodeUrl,
      onClick: () => {
        openTab(nodeUrl!)
      },
    },
  ]
}
