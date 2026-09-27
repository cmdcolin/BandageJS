import {
  backboneAssembly,
  graphBackbone,
  refNameBinding,
} from '@jbrowse/bandage-core'

import { memo } from './derived'
import { assemblyNamed, geneTracks, hubLabel, withOverlay } from './hubConfig'
import {
  loadAliases,
  loadHub,
  orderedHubs,
  siteConfig,
  siteReady,
} from './hubs'
import { mergeOverlays } from './siteConfig'
import { state } from './state'

import type { Hub, HubAssembly, HubTrack } from './hubConfig'
import type { OrderedHub } from './hubs'
import type { Region, Target } from './jbrowse'
import type { Backbone, Graph } from '@jbrowse/bandage-core'

// A graph names the sample its backbone lies on (`GRCh38#0#chr6`), not the
// assembly, and a bare contig (`chr6`) exists in every human assembly at once.
// The page binds the backbone to an assembly where someone said which it is,
// or where its PanSN prefix is an assembly's name or alias in a hub. Else it
// narrows the choice down and asks.

// the rank-0 nodes' contigs and their spans
export const backboneOf = memo((graph: Graph | undefined) =>
  graph ? graphBackbone(graph) : undefined,
)

// what a declaration is keyed by: the sample, else the bare contigs
export function backboneKey(b: Backbone) {
  return b.prefixes[0] ?? b.contigs.map(c => c.contig).join(',')
}

export function backboneLabel(b: Backbone) {
  return b.contigs.map(c => c.refName).join(', ')
}

export const isBare = (b: Backbone) =>
  b.contigs.every(c => c.refName === c.contig)

// Which assembly one graph's backbone is on, as a link or the user said, and
// the assembly's name for any contig the graph names otherwise
export interface Declaration {
  assembly: string
  hub?: string
  contigs?: Record<string, string>
}

// `chr:NC_000913.3,plasmid:NC_000914.1`, as a link spells them
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

export interface Choice {
  hub: Hub
  assembly: HubAssembly
}

// How a binding came about: a declaration for this graph, the hubs' and the
// site's names, or a choice the user made for every graph of the sample
export type How = 'declared' | 'named' | 'remembered'

export type Binding =
  | { status: 'none' }
  | { status: 'pending' }
  | { status: 'unknown'; reason: string; candidates: Choice[] }
  | ({ status: 'bound'; how: How } & Choice)

let linked: string[] = []

// hubs a link names, ahead of the user's and the site's
export function linkHubs(urls: string[]) {
  linked = urls
}

export const linkedHubs = () => linked

export function declarationOf(b: Backbone | undefined) {
  return b ? state.source?.declared?.[backboneKey(b)] : undefined
}

const normal = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

// How many alias files the page reads to narrow down bare contig names
const ALIAS_FILES = 12

// The assemblies the backbone may be on where nothing names one: for bare
// contigs, those whose sequence names include every contig; for a sample,
// those whose names or description mention it
async function candidatesFor(b: Backbone, hubs: Hub[]) {
  const all = hubs.flatMap(hub =>
    hub.assemblies.map(assembly => ({ hub, assembly })),
  )
  if (!isBare(b)) {
    const sample = normal(b.prefixes[0] ?? '')
    return sample.length < 2
      ? []
      : all.filter(({ assembly: a }) =>
          normal(
            [a.name, ...a.aliases, a.displayName ?? ''].join(' '),
          ).includes(sample),
        )
  }
  const withNames = all
    .filter(c => c.assembly.refNameAliases)
    .slice(0, ALIAS_FILES)
  const named = await Promise.all(
    withNames.map(async c => {
      const rows = await loadAliases(c.assembly.refNameAliases!).catch(() => [])
      const names = new Set([
        ...rows.flat(),
        ...Object.keys(c.assembly.contigs ?? {}),
      ])
      return b.contigs.every(k => names.has(k.contig)) ? [c] : []
    }),
  )
  return named.flat()
}

async function resolve(
  b: Backbone,
  d: Declaration | undefined,
  entries: OrderedHub[],
): Promise<Binding> {
  const failed: string[] = []
  const loaded: { entry: OrderedHub; hub: Hub }[] = []
  const load = async (entry: OrderedHub) => {
    try {
      const hub = await loadHub(entry.url)
      loaded.push({ entry, hub })
      return hub
    } catch (e) {
      console.error(e)
      failed.push(hubLabel(entry.url))
      return undefined
    }
  }
  const both = (entry: OrderedHub, hub: Hub) =>
    withOverlay(hub, mergeOverlays(entry.site, entry.user))
  if (d) {
    const first = d.hub ? entries.filter(e => e.url === d.hub) : []
    const rest = d.hub
      ? [
          ...(first.length ? [] : [{ url: d.hub, site: {}, user: {} }]),
          ...entries,
        ]
      : entries
    for (const entry of [...first, ...rest]) {
      const raw = await load(entry)
      const hub = raw && both(entry, raw)
      const assembly = hub && assemblyNamed(hub, d.assembly)
      if (hub && assembly) {
        return { status: 'bound', how: 'declared', hub, assembly }
      }
    }
  } else if (b.prefixes.length) {
    for (const entry of entries) {
      const raw = await load(entry)
      const assembly =
        raw && backboneAssembly(b, withOverlay(raw, entry.site).assemblies)
      if (raw && assembly) {
        const hub = both(entry, raw)
        return {
          status: 'bound',
          how: 'named',
          hub,
          assembly: assemblyNamed(hub, assembly.name)!,
        }
      }
    }
    for (const { entry, hub: raw } of loaded) {
      const hub = both(entry, raw)
      const assembly = backboneAssembly(b, hub.assemblies)
      if (assembly) {
        return { status: 'bound', how: 'remembered', hub, assembly }
      }
    }
  } else {
    await Promise.all(entries.map(load))
  }
  const couldnt = failed.length ? ` (couldn't read ${failed.join(', ')})` : ''
  const order = new Map(entries.map((e, i) => [e.url, i]))
  const hubs = loaded
    .sort((x, y) => order.get(x.entry.url)! - order.get(y.entry.url)!)
    .map(({ entry, hub }) => both(entry, hub))
  return {
    status: 'unknown',
    reason: d
      ? `No hub has an assembly named ${d.assembly}${couldnt}`
      : isBare(b)
        ? `The reference ${b.contigs[0]!.contig} names no sample${couldnt}`
        : b.prefixes.length
          ? `No hub has an assembly for ${b.prefixes[0]}${couldnt}`
          : `The reference ${backboneLabel(b)} names more than one sample`,
    candidates:
      d || (!b.prefixes.length && !isBare(b))
        ? []
        : await candidatesFor(b, hubs),
  }
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
  const entries = orderedHubs(linked)
  const key = JSON.stringify([
    backbone.contigs.map(c => c.refName),
    d,
    entries,
    siteConfig().hubs,
  ])
  if (current.key !== key) {
    const entry = {
      key,
      binding: { status: 'pending' } as Binding,
      ready: siteReady.then(() => resolve(backbone, d, orderedHubs(linked))),
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

export interface ReferenceWindow extends Choice {
  how: How
  backbone: Backbone
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
        how: b.how,
        backbone,
        regions: state.region
          ? [state.region]
          : backbone.contigs.map(c => ({
              refName: c.contig,
              start: c.start,
              end: c.end,
            })),
        contigs: {
          ...b.assembly.contigs,
          ...declarationOf(backbone)?.contigs,
        },
      }
    : undefined
}

// why the page has no assembly for the reference, if it hasn't
export function bindingReason(b: Binding) {
  return b.status === 'none'
    ? 'Needs a graph with reference coordinates'
    : b.status === 'pending'
      ? 'Finding the reference assembly…'
      : b.status === 'unknown'
        ? b.reason
        : undefined
}

export function assemblyLabel(c: Choice) {
  return c.assembly.displayName
    ? `${c.assembly.name}, ${c.assembly.displayName}`
    : c.assembly.name
}

// the hub's gene track for the assembly: the one an overlay chose, else the
// first the hub offers
export function geneTrackOf(c: Choice): HubTrack | undefined {
  const tracks = geneTracks(c.hub, c.assembly)
  const chosen = c.assembly.geneTrack
  return chosen === undefined
    ? tracks[0]
    : tracks.find(t => t.trackId === chosen)
}

// the genes a file names on the backbone, by the graph's name for a contig or
// the assembly's, as the core's gene pins match them
export function genesOn<T extends { refName: string }>(
  genes: T[],
  backbone: Backbone,
) {
  const bind = refNameBinding(backbone.contigs.map(c => c.refName))
  return genes.filter(g => bind(g.refName) !== undefined)
}

export function targetOf(w: ReferenceWindow): Target {
  return {
    host: siteConfig().jbrowse,
    hub: w.hub,
    assembly: w.assembly,
    geneTrack: geneTrackOf(w),
  }
}
