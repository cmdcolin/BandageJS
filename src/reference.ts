import { panSNContig, panSNHaplotype, panSNSample } from '@jbrowse/bandage-core'

import { memo } from './derived'
import {
  assemblyForPrefixes,
  assemblyNamed,
  geneTracks,
  hubLabel,
} from './hubConfig'
import { hubUrls, loadHub } from './hubs'
import { stored, store } from './settings'
import { state } from './state'

import type { Hub, HubAssembly, HubTrack } from './hubConfig'
import type { Region, Target } from './jbrowse'
import type { Graph } from '@jbrowse/bandage-core'

// A graph names the sample its backbone lies on (`GRCh38#0#chr6`), not the
// assembly, and a bare contig (`chr6`) exists in every human assembly at once.
// The page binds the backbone to an assembly only where the user declared one,
// or where its PanSN prefix is an assembly's name or alias in one of the hubs,
// and otherwise asks.

export interface Contig {
  // as the graph names it, `GRCh38#0#chr6`
  refName: string
  // with the PanSN prefix stripped, `chr6`
  name: string
  start: number
  end: number
}

export interface Backbone {
  contigs: Contig[]
  // the PanSN prefixes every contig shares, sample then haplotype: `GRCh38`,
  // `GRCh38#0`; none for bare contig names
  prefixes: string[]
}

function sharedPrefixes(refNames: string[]) {
  return [panSNSample, panSNHaplotype].flatMap(prefixOf => {
    const prefixes = new Set(
      refNames.map(n => (n.includes('#') ? prefixOf(n) : undefined)),
    )
    const [only] = prefixes
    return prefixes.size === 1 && only ? [only] : []
  })
}

// the rank-0 nodes' contigs and their spans
export const backboneOf = memo((graph: Graph | undefined) => {
  const spans = new Map<string, Contig>()
  for (const n of graph?.nodes ?? []) {
    const s = n.stable
    if (s?.rank === 0) {
      const span = spans.get(s.refName)
      if (span) {
        span.start = Math.min(span.start, s.start)
        span.end = Math.max(span.end, s.start + n.length)
      } else {
        spans.set(s.refName, {
          refName: s.refName,
          name: panSNContig(s.refName),
          start: s.start,
          end: s.start + n.length,
        })
      }
    }
  }
  const contigs = [...spans.values()]
  return contigs.length
    ? ({
        contigs,
        prefixes: sharedPrefixes(contigs.map(c => c.refName)),
      } satisfies Backbone)
    : undefined
})

// what a declaration is keyed by: the sample, else the bare contigs
export function backboneKey(b: Backbone) {
  return b.prefixes[0] ?? b.contigs.map(c => c.name).join(',')
}

export function backboneLabel(b: Backbone) {
  return b.contigs.map(c => c.refName).join(', ')
}

// The user's word for which assembly a backbone is on, and the assembly's name
// for any contig the graph names otherwise
export interface Declaration {
  assembly: string
  hub?: string
  contigs?: Record<string, string>
  // an example's, which its link needn't repeat
  implied?: boolean
}

// `chr:NC_000913.3,plasmid:NC_000914.1`, as a link and the dialog spell them
export function contigsText(contigs: Record<string, string> | undefined) {
  return Object.entries(contigs ?? {})
    .map(([graph, assembly]) => `${graph}:${assembly}`)
    .join(',')
}

export function contigsFrom(text: string) {
  const pairs = text
    .split(/[\s,]+/)
    .filter(p => p.indexOf(':') > 0)
    .map(p => [p.slice(0, p.indexOf(':')), p.slice(p.indexOf(':') + 1)])
  return pairs.length ? Object.fromEntries(pairs) : undefined
}

export type Binding =
  | { status: 'none' }
  | { status: 'pending' }
  | { status: 'unknown'; reason: string }
  | { status: 'bound'; hub: Hub; assembly: HubAssembly; declared: boolean }

let linked: string[] = []

// hubs a link names, ahead of the saved and default ones
export function linkHubs(urls: string[]) {
  linked = urls
}

export const linkedHubs = () => linked

export const allHubUrls = () => hubUrls(linked)

export function declarationOf(b: Backbone | undefined) {
  return b ? state.source?.declared?.[backboneKey(b)] : undefined
}

async function resolve(b: Backbone, d: Declaration | undefined) {
  if (!d && !b.prefixes.length) {
    return {
      status: 'unknown',
      reason: `The reference ${b.contigs[0]!.name} names no sample, so its assembly is unknown`,
    } satisfies Binding
  }
  const failed: string[] = []
  for (const url of d?.hub ? [d.hub, ...allHubUrls()] : allHubUrls()) {
    try {
      const hub = await loadHub(url)
      const assembly = d
        ? assemblyNamed(hub, d.assembly)
        : assemblyForPrefixes(hub, b.prefixes)
      if (assembly) {
        return {
          status: 'bound',
          hub,
          assembly,
          declared: !!d,
        } satisfies Binding
      }
    } catch (e) {
      console.error(e)
      failed.push(hubLabel(url))
    }
  }
  return {
    status: 'unknown',
    reason: `${d ? `No hub has an assembly named ${d.assembly}` : `No hub has an assembly for ${b.prefixes[0]}`}${failed.length ? ` (couldn't read ${failed.join(', ')})` : ''}`,
  } satisfies Binding
}

const NONE = {
  binding: { status: 'none' } as Binding,
  ready: Promise.resolve({ status: 'none' } as Binding),
}
let current: { key: string; binding: Binding; ready: Promise<Binding> } = {
  key: '',
  ...NONE,
}
const listeners = new Set<() => void>()

export function onBindingChange(fn: () => void) {
  listeners.add(fn)
}

// The drawn backbone's binding, resolved once per backbone, declaration and
// hub list, with a promise of it for whoever waits on hubs to load
export function referenceBinding() {
  const backbone = backboneOf(state.graph)
  if (!backbone) {
    return NONE
  }
  const d = declarationOf(backbone)
  const key = JSON.stringify([
    backbone.contigs.map(c => c.refName),
    d,
    allHubUrls(),
  ])
  if (current.key !== key) {
    const entry = {
      key,
      binding: { status: 'pending' } as Binding,
      ready: resolve(backbone, d),
    }
    current = entry
    void entry.ready.then(b => {
      entry.binding = b
      if (current === entry) {
        for (const fn of listeners) {
          fn()
        }
      }
    })
  }
  return current
}

export const binding = () => referenceBinding().binding

export interface ReferenceWindow {
  hub: Hub
  assembly: HubAssembly
  backbone: Backbone
  declared: boolean
  // the cut's window where it applies, else each contig's span, named as the
  // graph names the contig
  regions: Region[]
  // the assembly's name for a contig the graph names otherwise
  contigs: Record<string, string>
}

export function referenceWindow(): ReferenceWindow | undefined {
  const b = binding()
  const backbone = backboneOf(state.graph)
  return b.status === 'bound' && backbone
    ? {
        hub: b.hub,
        assembly: b.assembly,
        declared: b.declared,
        backbone,
        regions: state.region
          ? [state.region]
          : backbone.contigs.map(c => ({
              refName: c.name,
              start: c.start,
              end: c.end,
            })),
        contigs: declarationOf(backbone)?.contigs ?? {},
      }
    : undefined
}

export function bindingReason(b: Binding) {
  return b.status === 'none'
    ? 'Needs a graph with reference coordinates'
    : b.status === 'pending'
      ? 'Finding the reference assembly…'
      : b.status === 'unknown'
        ? b.reason
        : undefined
}

export function assemblyLabel(w: { hub: Hub; assembly: HubAssembly }) {
  return `${w.assembly.displayName ?? w.assembly.name}, from ${hubLabel(w.hub.url)}`
}

const TRACKS_KEY = 'bandagejs-gene-tracks'

// the gene track the user chose for an assembly, '' for none
function chosenTracks() {
  const saved = stored<unknown>(TRACKS_KEY, {})
  return typeof saved === 'object' && saved !== null
    ? (saved as Record<string, unknown>)
    : {}
}

const trackKey = (w: { hub: Hub; assembly: HubAssembly }) =>
  `${w.hub.url} ${w.assembly.name}`

export function chooseGeneTrack(
  w: { hub: Hub; assembly: HubAssembly },
  trackId: string | undefined,
) {
  const all = chosenTracks()
  if (trackId === undefined) {
    delete all[trackKey(w)]
  } else {
    all[trackKey(w)] = trackId
  }
  store(TRACKS_KEY, all)
}

export function geneTrackOf(w: {
  hub: Hub
  assembly: HubAssembly
}): HubTrack | undefined {
  const tracks = geneTracks(w.hub, w.assembly)
  const chosen = chosenTracks()[trackKey(w)]
  return typeof chosen === 'string'
    ? tracks.find(t => t.trackId === chosen)
    : tracks[0]
}

// the genes a file names on the backbone, by the graph's name for a contig or
// the assembly's
export function genesOn<T extends { refName: string }>(
  genes: T[],
  backbone: Backbone,
) {
  const names = new Set(backbone.contigs.flatMap(c => [c.refName, c.name]))
  return genes.filter(g => names.has(g.refName))
}

export function targetOf(w: ReferenceWindow): Target {
  return { hub: w.hub, assembly: w.assembly, geneTrack: geneTrackOf(w) }
}
