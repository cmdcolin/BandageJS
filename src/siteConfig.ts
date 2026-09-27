// The page's config.json, which whoever deploys the page edits: the JBrowse
// configs to find assemblies in, first to last, with anything those configs
// don't say themselves, and where to find a genome someone types the name of.
// A user's own choices are kept in the same form.

// What a hub's config doesn't say: other names graphs call an assembly by,
// other names for its sequences, and which of its tracks is its genes, ''
// for none. Each is keyed by assembly name.
export interface HubOverlay {
  aliases?: Record<string, string[]>
  refNameAliases?: Record<string, Record<string, string>>
  genes?: Record<string, string>
}

export interface HubEntry extends HubOverlay {
  url: string
}

export interface SiteConfig {
  jbrowse: string
  hubs: HubEntry[]
  genomes: {
    // where a UCSC genome's config is, by its db name: `<ucsc><db>/config.json`
    ucsc?: string
    // where a GenArk assembly's is, by its accession, sharded as UCSC does
    genark?: string
    // a genomes.jbrowse.org searchIndex.json, to find a genome by name
    index?: string
  }
}

export const DEFAULT_JBROWSE = 'https://jbrowse.org/code/jb2/main/'

type Json = Record<string, unknown>

const isObject = (v: unknown): v is Json =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const text = (v: unknown) => (typeof v === 'string' && v !== '' ? v : undefined)

function record<T>(v: unknown, value: (x: unknown) => T | undefined) {
  if (!isObject(v)) {
    return undefined
  }
  const out: Record<string, T> = {}
  for (const [k, x] of Object.entries(v)) {
    const y = value(x)
    if (y !== undefined) {
      out[k] = y
    }
  }
  return Object.keys(out).length ? out : undefined
}

const names = (v: unknown) =>
  Array.isArray(v)
    ? v.filter((s): s is string => typeof s === 'string')
    : undefined

// a hub as a url, or a url with an overlay; relative urls against `base`
export function hubEntry(v: unknown, base: string): HubEntry | undefined {
  const raw = isObject(v) ? v : { url: v }
  const url = text(raw.url)
  if (!url) {
    return undefined
  }
  let href: string
  try {
    href = new URL(url, base).href
  } catch {
    return undefined
  }
  const aliases = record(raw.aliases, names)
  const refNameAliases = record(raw.refNameAliases, x =>
    record(x, y => (typeof y === 'string' ? y : undefined)),
  )
  const genes = record(raw.genes, y => (typeof y === 'string' ? y : undefined))
  return {
    url: href,
    ...(aliases ? { aliases } : {}),
    ...(refNameAliases ? { refNameAliases } : {}),
    ...(genes ? { genes } : {}),
  }
}

export function siteFrom(v: unknown, base: string): SiteConfig {
  const raw = isObject(v) ? v : {}
  const genomes = isObject(raw.genomes) ? raw.genomes : {}
  const url = (x: unknown) => {
    const s = text(x)
    try {
      return s ? new URL(s, base).href : undefined
    } catch {
      return undefined
    }
  }
  return {
    jbrowse: url(raw.jbrowse) ?? DEFAULT_JBROWSE,
    hubs: (Array.isArray(raw.hubs) ? raw.hubs : [])
      .map(h => hubEntry(h, base))
      .filter(h => h !== undefined),
    genomes: {
      ucsc: url(genomes.ucsc),
      genark: url(genomes.genark),
      index: url(genomes.index),
    },
  }
}

// Two overlays as one, the second's gene choices winning
export function mergeOverlays(a: HubOverlay, b: HubOverlay): HubOverlay {
  const aliases: Record<string, string[]> = { ...a.aliases }
  for (const [assembly, more] of Object.entries(b.aliases ?? {})) {
    aliases[assembly] = [...new Set([...(aliases[assembly] ?? []), ...more])]
  }
  const refNameAliases: Record<string, Record<string, string>> = {
    ...a.refNameAliases,
  }
  for (const [assembly, more] of Object.entries(b.refNameAliases ?? {})) {
    refNameAliases[assembly] = { ...refNameAliases[assembly], ...more }
  }
  return {
    aliases,
    refNameAliases,
    genes: { ...a.genes, ...b.genes },
  }
}

// The hub config a genome name or accession stands for: a GenArk accession
// (`GCF_000005845.2`) or a UCSC db name (`mm39`)
export function genomeHubUrl(
  query: string,
  genomes: SiteConfig['genomes'],
): string | undefined {
  const q = query.trim()
  const accession = /^(GC[AF])_(\d{3})(\d{3})(\d{3})\.\d+$/.exec(q)
  if (accession && genomes.genark) {
    const [, prefix, a, b, c] = accession
    return new URL(`${prefix}/${a}/${b}/${c}/${q}/config.json`, genomes.genark)
      .href
  }
  return /^[a-z][A-Za-z]*\d+$/.test(q) && genomes.ucsc
    ? new URL(`${q}/config.json`, genomes.ucsc).href
    : undefined
}
