import { isObject } from './siteConfig'

import type { HubOverlay, Json } from './siteConfig'

// A JBrowse config.json read as a catalogue: its assemblies, the names each
// goes by, and the tracks on each. Any config works, the HPRC portal's, a UCSC
// or GenArk mirror's, or one of the user's own.

export interface HubAssembly {
  name: string
  aliases: string[]
  displayName?: string
  // a RefNameAliasAdapter file: one sequence per row, every name it goes by
  refNameAliases?: string
  // the assembly's name for a sequence a graph names otherwise, from an overlay
  contigs?: Record<string, string>
  // the gene track an overlay chose, '' for none
  geneTrack?: string
}

export interface GeneSource {
  format: 'gff3' | 'bed'
  file: string
  index: string
  indexType: 'CSI' | 'TBI'
}

export interface HubTrack {
  trackId: string
  name: string
  type: string
  adapterType: string
  assemblyNames: string[]
  genes?: GeneSource
  // a gbz-base database the track reads
  gbz?: string
}

export interface Hub {
  url: string
  assemblies: HubAssembly[]
  tracks: HubTrack[]
  plugins: string[]
  // the tracks the config's default session opens
  defaultTracks: string[]
}

const strings = (v: unknown) =>
  Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : []

function resolve(uri: unknown, base: string) {
  if (typeof uri !== 'string' || uri === '') {
    return undefined
  }
  try {
    return new URL(uri, base).href
  } catch {
    return undefined
  }
}

// `{ uri, baseUri? }` or a bare uri, relative to the config
function locationUrl(loc: unknown, base: string) {
  return isObject(loc)
    ? resolve(loc.uri, resolve(loc.baseUri, base) ?? base)
    : resolve(loc, base)
}

// Gff3TabixAdapter and BedTabixAdapter, with JBrowse's `uri` shorthand, whose
// index is the file plus .tbi, or .csi where `csi` is set
function geneSource(adapter: Json, base: string): GeneSource | undefined {
  const format =
    adapter.type === 'Gff3TabixAdapter'
      ? 'gff3'
      : adapter.type === 'BedTabixAdapter'
        ? 'bed'
        : undefined
  if (!format) {
    return undefined
  }
  const file = locationUrl(
    adapter.uri ??
      (format === 'gff3' ? adapter.gffGzLocation : adapter.bedGzLocation),
    base,
  )
  const index = isObject(adapter.index) ? adapter.index : {}
  const indexType =
    index.indexType === 'CSI' || (!index.indexType && adapter.csi === true)
      ? 'CSI'
      : 'TBI'
  const indexUrl =
    locationUrl(index.location, base) ??
    (file && `${file}.${indexType.toLowerCase()}`)
  return file && indexUrl
    ? { format, file, index: indexUrl, indexType }
    : undefined
}

function assemblyFrom(a: Json, base: string): HubAssembly | undefined {
  if (typeof a.name !== 'string') {
    return undefined
  }
  const aliasAdapter = isObject(a.refNameAliases)
    ? a.refNameAliases.adapter
    : undefined
  return {
    name: a.name,
    aliases: strings(a.aliases),
    displayName: typeof a.displayName === 'string' ? a.displayName : undefined,
    refNameAliases:
      isObject(aliasAdapter) && aliasAdapter.type === 'RefNameAliasAdapter'
        ? locationUrl(aliasAdapter.uri ?? aliasAdapter.location, base)
        : undefined,
  }
}

function trackFrom(t: Json, base: string): HubTrack | undefined {
  const adapter = isObject(t.adapter) ? t.adapter : undefined
  if (typeof t.trackId !== 'string' || !adapter) {
    return undefined
  }
  const adapterType = typeof adapter.type === 'string' ? adapter.type : ''
  const type = typeof t.type === 'string' ? t.type : ''
  return {
    trackId: t.trackId,
    name: typeof t.name === 'string' ? t.name : t.trackId,
    type,
    adapterType,
    assemblyNames: strings(t.assemblyNames),
    genes: type === 'FeatureTrack' ? geneSource(adapter, base) : undefined,
    gbz:
      adapterType === 'GbzBaseSyntenyAdapter'
        ? locationUrl(adapter.uri ?? adapter.gbzLocation, base)
        : undefined,
  }
}

function defaultTracksOf(session: unknown) {
  const views =
    isObject(session) && Array.isArray(session.views) ? session.views : []
  return views.flatMap(v =>
    isObject(v) && isObject(v.init) ? strings(v.init.tracks) : [],
  )
}

export function hubFrom(config: unknown, url: string): Hub {
  if (!isObject(config)) {
    throw new Error(`${url} is not a JBrowse config`)
  }
  const assemblies = (
    Array.isArray(config.assemblies) ? config.assemblies : [config.assembly]
  )
    .filter(isObject)
    .map(a => assemblyFrom(a, url))
    .filter(a => a !== undefined)
  if (assemblies.length === 0) {
    throw new Error(`${url} names no assemblies`)
  }
  return {
    url,
    assemblies,
    tracks: (Array.isArray(config.tracks) ? config.tracks : [])
      .filter(isObject)
      .map(t => trackFrom(t, url))
      .filter(t => t !== undefined),
    plugins: (Array.isArray(config.plugins) ? config.plugins : [])
      .filter(isObject)
      .map(p => p.name)
      .filter(n => typeof n === 'string'),
    defaultTracks: defaultTracksOf(config.defaultSession),
  }
}

export function assemblyNamed(hub: Hub, name: string) {
  const n = name.toLowerCase()
  return hub.assemblies.find(a =>
    [a.name, ...a.aliases].some(x => x.toLowerCase() === n),
  )
}

const GENE_HINT = /gene|refseq|gencode|ensembl|annotation/i

// The hub with an overlay's names and choices on its assemblies
export function withOverlay(hub: Hub, overlay: HubOverlay): Hub {
  return {
    ...hub,
    assemblies: hub.assemblies.map(a => ({
      ...a,
      aliases: [
        ...new Set([...a.aliases, ...(overlay.aliases?.[a.name] ?? [])]),
      ],
      contigs: { ...a.contigs, ...overlay.refNameAliases?.[a.name] },
      geneTrack: overlay.genes?.[a.name] ?? a.geneTrack,
    })),
  }
}

// The tracks on an assembly the page can read genes from, the one to show
// first: the default session's, then those whose name says genes
export function geneTracks(hub: Hub, assembly: HubAssembly) {
  const names = new Set([assembly.name, ...assembly.aliases])
  const rank = (t: HubTrack) =>
    hub.defaultTracks.includes(t.trackId)
      ? 0
      : GENE_HINT.test(`${t.trackId} ${t.name}`)
        ? 1
        : 2
  return hub.tracks
    .filter(t => t.genes && t.assemblyNames.some(n => names.has(n)))
    .sort((a, b) => rank(a) - rank(b))
}

// the hub's gene track for the assembly: the one an overlay chose, else the
// first the hub offers
export function geneTrackOf(c: {
  hub: Hub
  assembly: HubAssembly
}): HubTrack | undefined {
  const tracks = geneTracks(c.hub, c.assembly)
  const chosen = c.assembly.geneTrack
  return chosen === undefined
    ? tracks[0]
    : tracks.find(t => t.trackId === chosen)
}

export function tracksOn(hub: Hub, assembly: HubAssembly, type: string) {
  const names = new Set([assembly.name, ...assembly.aliases])
  return hub.tracks.filter(
    t => t.type === type && t.assemblyNames.some(n => names.has(n)),
  )
}

// A RefNameAliasAdapter file as rows of names, one row per sequence
export function aliasRows(text: string) {
  return text
    .split(/\r?\n/)
    .filter(l => l.trim() !== '' && !l.startsWith('#'))
    .map(l =>
      l
        .split('\t')
        .map(s => s.trim())
        .filter(s => s !== ''),
    )
}

// A graph's name for a sequence and every name its assembly also calls it
export function namesFor(rows: string[][], name: string) {
  return [
    name,
    ...(rows.find(r => r.includes(name)) ?? []).filter(n => n !== name),
  ]
}

export function hubLabel(url: string) {
  return url.replace(/^https?:\/\//, '').replace(/\/config\.json$/, '')
}
