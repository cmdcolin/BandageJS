import { panSNContig, panSNHaplotype } from '@jbrowse/bandage-core'

import type { GraphNode } from '@jbrowse/bandage-core'

// Links into hosted JBrowse Web on the HPRC release 2 portal config, which
// loads this viewer's plugin: hg38, all 464 HPRC haplotypes as assemblies, the
// rGFA graph track and the gbz-base haplotype lanes. `main` because `latest`
// (4.3.0) predates what the config needs.

const HOST = 'https://jbrowse.org/code/jb2/main/'
const CONFIG = 'https://jbrowse.org/pangenome/hprc-grch38/config.json'
const GENES = 'hg38_ncbiRefSeq_ucsc'
// by id alone, so it opens in whatever display the portal gives it: the
// config is moving this track to the plugin's GraphTrack
const GRAPH_TRACK = 'hprc_minigraph_segments'
const LANES_TRACK = 'hprc_v2_1_gbz_lanes'
// a node shorter than this opens with context around it, as the plugin's
// paddedLocation does
const MIN_NODE_WINDOW = 1000

// the layout modes a released plugin in the JBrowse portal accepts
export const JBROWSE_MODES = new Set([
  'auto',
  'samplerows',
  'walkrows',
  'ordered',
  'variants',
  'force',
])

// `mode` if the portal's plugin can draw it, else force-directed
export function jbrowseMode(mode: string) {
  return JBROWSE_MODES.has(mode) ? mode : 'force'
}

export interface Region {
  refName: string
  start: number
  end: number
}

// `#` rather than `?`, which keeps a long spec out of the request line
function specUrl(spec: object) {
  return `${HOST}#config=${encodeURIComponent(CONFIG)}&session=spec-${encodeURIComponent(JSON.stringify(spec))}`
}

// 0-based half-open to JBrowse's 1-based closed
function loc(r: Region) {
  return `${r.refName}:${r.start + 1}-${r.end}`
}

function lanes(samples: string[]) {
  return samples.flatMap(s => (s.includes('#') ? [s] : [`${s}#1`, `${s}#2`]))
}

// The region as a linear view: genes, the graph drawn on hg38, and one lane
// per haplotype asked for.
export function regionLink(region: Region, samples: string[]) {
  return specUrl({
    views: [
      {
        type: 'LinearGenomeView',
        assembly: 'hg38',
        loc: loc(region),
        tracks: [
          GENES,
          ...(samples.length
            ? [
                {
                  trackId: LANES_TRACK,
                  type: 'MultiWaySyntenyDisplay',
                  laneFilter: { only: lanes(samples) },
                },
              ]
            : []),
          GRAPH_TRACK,
        ],
      },
    ],
  })
}

// The same gbz-base cut in the plugin's GraphGenomeView, paired with a linear
// view so hovering a node highlights its span there.
export function graphViewLink(
  region: Region,
  samples: string[],
  layoutMode: string,
) {
  return specUrl({
    views: [
      {
        type: 'LinearGenomeView',
        id: 'lgv',
        assembly: 'hg38',
        loc: loc(region),
        tracks: [GENES],
      },
      {
        type: 'GraphGenomeView',
        connectedViewId: 'lgv',
        loadedTrackId: LANES_TRACK,
        loadedRegion: { ...region, assemblyName: 'hg38' },
        ...(samples.length ? { subgraphHaplotypes: samples } : {}),
        layoutMode,
      },
    ],
  })
}

// A GFA at a url JBrowse can fetch, in GraphGenomeView beside hg38.
export function gfaViewLink(
  url: string,
  region: Region | undefined,
  layoutMode: string,
) {
  return specUrl({
    views: [
      {
        type: 'GraphGenomeView',
        gfaLocation: { uri: url },
        ...(region
          ? { loadedRegion: { ...region, assemblyName: 'hg38' } }
          : {}),
        layoutMode,
      },
    ],
  })
}

// Where a node sits, on the reference or on the haplotype that contributed
// it. Undefined for a sample the portal has no assembly for (CHM13).
export function nodeLink(node: GraphNode) {
  const stable = node.stable
  if (!stable) {
    return undefined
  }
  const pad = Math.max(0, (MIN_NODE_WINDOW - node.length) / 2)
  const span = {
    refName: panSNContig(stable.refName),
    start: Math.max(0, Math.floor(stable.start - pad)),
    end: Math.ceil(stable.start + node.length + pad),
  }
  const haplotype = panSNHaplotype(stable.refName)
  if (!haplotype || haplotype.startsWith('GRCh38#')) {
    return specUrl({
      views: [
        {
          type: 'LinearGenomeView',
          assembly: 'hg38',
          loc: loc(span),
          tracks: [GENES, GRAPH_TRACK],
        },
      ],
    })
  }
  if (haplotype.startsWith('CHM13#')) {
    return undefined
  }
  return specUrl({
    views: [
      {
        type: 'LinearGenomeView',
        assembly: haplotype,
        loc: loc(span),
        tracks: [`${haplotype.replace('#', '.')}_cat_genes`],
      },
    ],
  })
}

// A graph's span on GRCh38, from its rank-0 segments, for a graph that states
// its coordinates but was not cut from a named region.
export function backboneRegion(nodes: GraphNode[]): Region | undefined {
  let refName: string | undefined
  let start = Infinity
  let end = -Infinity
  for (const n of nodes) {
    const s = n.stable
    if (s?.rank === 0) {
      const hap = panSNHaplotype(s.refName)
      if (hap && !hap.startsWith('GRCh38#')) {
        return undefined
      }
      const contig = panSNContig(s.refName)
      if (refName !== undefined && contig !== refName) {
        return undefined
      }
      refName = contig
      start = Math.min(start, s.start)
      end = Math.max(end, s.start + n.length)
    }
  }
  return refName && end > start ? { refName, start, end } : undefined
}
