import { panSNContig, panSNHaplotype, rowSpan } from '@jbrowse/bandage-core'

import { assemblyNamed, geneTrackOf, tracksOn } from './hubConfig'

import type { Hub, HubAssembly, HubTrack } from './hubConfig'
import type { GraphNode, WalkRow } from '@jbrowse/bandage-core'

// Links into hosted JBrowse Web, the site config's, on the config of the hub
// the reference is bound to, with whichever of its tracks the link has use for

const PLUGIN = 'GraphGenomeView'
// a node shorter than this opens with context around it, as the plugin's
// paddedLocation does
const MIN_NODE_WINDOW = 1000

// the layout modes a released plugin in the JBrowse portal accepts
export const JBROWSE_MODES = new Set([
  'auto',
  'samplerows',
  'walkrows',
  'ordered',
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

export interface Target {
  // the JBrowse Web to open
  host: string
  hub: Hub
  assembly: HubAssembly
  geneTrack?: HubTrack
}

// `#` rather than `?`, which keeps a long spec out of the request line
function specUrl(t: Target, spec: object) {
  return `${t.host}#config=${encodeURIComponent(t.hub.url)}&session=spec-${encodeURIComponent(JSON.stringify(spec))}`
}

// 0-based half-open to JBrowse's 1-based closed
function loc(r: Region) {
  return `${r.refName}:${r.start + 1}-${r.end}`
}

function lanesOf(samples: string[]) {
  return samples.flatMap(s => (s.includes('#') ? [s] : [`${s}#1`, `${s}#2`]))
}

// the hub's gbz-base haplotype lanes on the assembly: a SyntenyTrack in older
// hubs, else the GraphTrack that carries both the lanes and the graph
function lanesTrack(t: Target) {
  return [
    ...tracksOn(t.hub, t.assembly, 'SyntenyTrack'),
    ...tracksOn(t.hub, t.assembly, 'GraphTrack'),
  ].find(x => x.gbz)
}

// the hub's graph track on the assembly, by id alone, so it opens in whatever
// display the hub gives it
function graphTrack(t: Target) {
  return tracksOn(t.hub, t.assembly, 'GraphTrack').find(x => !x.gbz)
}

export function hasGraphView(hub: Hub) {
  return hub.plugins.includes(PLUGIN)
}

// A haplotype whose walks the hub's lanes can show: one it has as an assembly
export function laneSamples(t: Target, samples: string[]) {
  return lanesTrack(t)
    ? samples.filter(s => lanesOf([s]).some(h => assemblyNamed(t.hub, h)))
    : []
}

// The region as a linear view: genes, the hub's graph track, and one lane per
// haplotype asked for, where the hub has them.
export function regionLink(t: Target, region: Region, samples: string[]) {
  const lanes = lanesTrack(t)
  const graph = graphTrack(t)
  return specUrl(t, {
    views: [
      {
        type: 'LinearGenomeView',
        assembly: t.assembly.name,
        loc: loc(region),
        tracks: [
          ...(t.geneTrack ? [t.geneTrack.trackId] : []),
          ...(lanes && samples.length
            ? [
                {
                  trackId: lanes.trackId,
                  type: 'MultiWaySyntenyDisplay',
                  laneFilter: { only: lanesOf(samples) },
                },
              ]
            : []),
          ...(graph ? [graph.trackId] : []),
        ],
      },
    ],
  })
}

// The hub's lanes track reading the gbz-base database a cut came from
export function cutTrack(t: Target, db: string) {
  const lanes = lanesTrack(t)
  return lanes?.gbz === db && hasGraphView(t.hub) ? lanes : undefined
}

// The same gbz-base cut in the plugin's GraphGenomeView, paired with a linear
// view so hovering a node highlights its span there.
export function graphViewLink(
  t: Target,
  lanes: HubTrack,
  region: Region,
  samples: string[],
  layoutMode: string,
) {
  return specUrl(t, {
    views: [
      {
        type: 'LinearGenomeView',
        id: 'lgv',
        assembly: t.assembly.name,
        loc: loc(region),
        tracks: t.geneTrack ? [t.geneTrack.trackId] : [],
      },
      {
        type: 'GraphGenomeView',
        connectedViewId: 'lgv',
        loadedTrackId: lanes.trackId,
        loadedRegion: { ...region, assemblyName: t.assembly.name },
        ...(samples.length ? { subgraphHaplotypes: samples } : {}),
        layoutMode,
      },
    ],
  })
}

// A GFA at a url JBrowse can fetch, in GraphGenomeView
export function gfaViewLink(
  t: Target,
  url: string,
  region: Region,
  layoutMode: string,
) {
  return specUrl(t, {
    views: [
      {
        type: 'GraphGenomeView',
        gfaLocation: { uri: url },
        loadedRegion: { ...region, assemblyName: t.assembly.name },
        layoutMode,
      },
    ],
  })
}

// the gene track a link opens on `assembly`: the reference's, else the one the
// hub's overlay chose for that haplotype or the first it offers
function genesOf(t: Target, assembly: HubAssembly) {
  return assembly === t.assembly
    ? t.geneTrack
    : geneTrackOf({ hub: t.hub, assembly })
}

// Where a node sits: on the reference assembly, or on the haplotype that
// contributed it where the hub has that haplotype as an assembly
export function nodeLink(
  node: GraphNode,
  t: Target,
  contigs: Record<string, string> = {},
) {
  const stable = node.stable
  if (!stable) {
    return undefined
  }
  const contig = panSNContig(stable.refName)
  const pad = Math.max(0, (MIN_NODE_WINDOW - node.length) / 2)
  const span = {
    refName: (stable.rank === 0 && contigs[contig]) || contig,
    start: Math.max(0, Math.floor(stable.start - pad)),
    end: Math.ceil(stable.start + node.length + pad),
  }
  const haplotype = panSNHaplotype(stable.refName)
  const assembly =
    stable.rank === 0
      ? t.assembly
      : haplotype
        ? assemblyNamed(t.hub, haplotype)
        : undefined
  if (!assembly) {
    return undefined
  }
  const genes = genesOf(t, assembly)
  const graph = assembly === t.assembly ? graphTrack(t) : undefined
  return specUrl(t, {
    views: [
      {
        type: 'LinearGenomeView',
        assembly: assembly.name,
        loc: loc(span),
        tracks: [
          ...(genes ? [genes.trackId] : []),
          ...(graph ? [graph.trackId] : []),
        ],
      },
    ],
  })
}

// A walk row's bar as a linear view: the span of its own contig the bar covers,
// on the assembly the hub has for its haplotype, else its sample, with that
// assembly's genes. The reference row opens on the bound assembly.
export function rowLink(
  row: WalkRow,
  isReference: boolean,
  t: Target,
  contigs: Record<string, string> = {},
) {
  if (!row.axis) {
    return undefined
  }
  const assembly = isReference
    ? t.assembly
    : (row.haplotype !== undefined &&
        assemblyNamed(t.hub, `${row.sample}#${row.haplotype}`)) ||
      assemblyNamed(t.hub, row.sample)
  if (!assembly) {
    return undefined
  }
  const genes = genesOf(t, assembly)
  const span = {
    refName: (isReference && contigs[row.axis.contig]) || row.axis.contig,
    ...rowSpan(row.axis, row.bp),
  }
  return specUrl(t, {
    views: [
      {
        type: 'LinearGenomeView',
        assembly: assembly.name,
        loc: loc(span),
        tracks: genes ? [genes.trackId] : [],
      },
    ],
  })
}
