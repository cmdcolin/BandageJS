import { panSNContig, panSNHaplotype, panSNSample } from '@jbrowse/bandage-core'

import { memo } from './derived'
import { state } from './state'

import type { Region } from './jbrowse'
import type { Graph } from '@jbrowse/bandage-core'

// A graph names the sample its backbone lies on (`GRCh38#0#chr6`), not the
// assembly, and a bare contig (`chr6`) exists in every human assembly at once.
// The page binds genes and links to an assembly only where the backbone's
// PanSN prefix is the assembly's name or one of its aliases, as a JBrowse
// config spells them.

export interface Assembly {
  name: string
  aliases: string[]
  genes?: { name: string; gff3Tabix: string }
}

// from the HPRC portal's config.json, which the page links to
export const ASSEMBLIES: Assembly[] = [
  {
    name: 'hg38',
    aliases: ['GRCh38'],
    genes: {
      name: 'RefSeq',
      gff3Tabix: 'https://jbrowse.org/ucsc/hg38/ncbiRefSeq.gff.gz',
    },
  },
]

export interface Contig {
  // as the graph names it, `GRCh38#0#chr6`
  refName: string
  // as the assembly names it, `chr6`
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

export function assemblyOf(backbone: Backbone | undefined) {
  const prefixes = new Set(backbone?.prefixes.map(p => p.toLowerCase()))
  return ASSEMBLIES.find(a =>
    [a.name, ...a.aliases].some(n => prefixes.has(n.toLowerCase())),
  )
}

export interface ReferenceWindow {
  assembly: Assembly
  backbone: Backbone
  // the cut's window where it applies, else each contig's span
  regions: Region[]
}

export function referenceWindow(): ReferenceWindow | undefined {
  const backbone = backboneOf(state.graph)
  const assembly = assemblyOf(backbone)
  return backbone && assembly
    ? {
        assembly,
        backbone,
        regions: state.region
          ? [state.region]
          : backbone.contigs.map(c => ({
              refName: c.name,
              start: c.start,
              end: c.end,
            })),
      }
    : undefined
}

export function noWindowReason() {
  const backbone = backboneOf(state.graph)
  const [sample] = backbone?.prefixes ?? []
  return !backbone
    ? 'Needs a graph with reference coordinates'
    : !sample
      ? `The reference ${backbone.contigs[0]!.refName} names no sample, so its assembly is unknown`
      : `No assembly known for ${sample}`
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
