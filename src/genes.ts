import {
  featuresOnBackbone,
  genesFromText,
  rowSpan,
} from '@jbrowse/bandage-core'

import { rowsOf } from './derived'
import { fail, notify } from './feedback'
import { assemblyNamed, namesFor } from './hubConfig'
import { loadAliases } from './hubs'
import { gfaText } from './read'
import {
  backboneOf,
  binding,
  bindingReason,
  geneTrackOf,
  onBindingChange,
  referenceWindow,
} from './reference'
import {
  drawnMode,
  saveSettings,
  settings,
  state,
  stripRowsWanted,
} from './state'
import { scheduleDraw } from './view'

import type { GeneSource, HubAssembly } from './hubConfig'
import type { Region } from './jbrowse'
import type { ReferenceWindow } from './reference'
import type { Backbone, GeneModel } from '@jbrowse/bandage-core'

// The genes the backbone shows: the bound assembly's gene track, read after
// the graph opens without holding up its drawing, or those of a file the user
// opened for the backbone drawn then.

interface Read {
  genes: GeneModel[]
  // the regions' contigs the track has no sequence for
  missing: string[]
}

const fetched = new Map<string, Read>()
let abort: AbortController | undefined
let warned = false
let missing: string[] = []
let own:
  | { text: string; backbone: string; name: string; genes: GeneModel[] }
  | undefined

const regionKey = (r: Region) => `${r.refName}:${r.start}-${r.end}`
const backboneId = (b: Backbone | undefined) =>
  b?.contigs.map(c => c.refName).join('\n')

export function stopGenes() {
  abort?.abort()
  walkAbort?.abort()
}

function ownGenes() {
  return own &&
    own.text === state.source?.text &&
    own.backbone === backboneId(backboneOf(state.graph))
    ? own
    : undefined
}

export function ownGenesName() {
  return ownGenes()?.name
}

export function genesSourceName() {
  const w = referenceWindow()
  return w && geneTrackOf(w)?.name
}

// why the Genes toggle has nothing to show, if it doesn't
export function noGenesReason() {
  if (ownGenes()) {
    return undefined
  }
  const bound = binding()
  const reason =
    bound.status === 'unknown'
      ? 'Needs the assembly the reference is on'
      : bindingReason(bound)
  const w = referenceWindow()
  const track = w && geneTrackOf(w)
  return (
    reason ??
    (!track
      ? `No gene track for ${w!.assembly.name}`
      : missing.length && !state.genes?.length
        ? `${track.name} has no sequence named ${missing.join(', ')}`
        : undefined)
  )
}

async function trackGenes(
  w: ReferenceWindow,
  src: GeneSource,
  signal: AbortSignal,
): Promise<Read> {
  const rows = w.assembly.refNameAliases
    ? await loadAliases(w.assembly.refNameAliases).catch((e: unknown) => {
        console.error(e)
        return []
      })
    : []
  const { tabixGenes } = await import('./tabixGenes')
  const reads = await Promise.all(
    w.regions.map(async region => {
      const declared = w.contigs[region.refName]
      const genes = await tabixGenes(
        src,
        namesFor(rows, declared ?? region.refName),
        region,
        signal,
      )
      return {
        region,
        genes: genes?.map(g => ({ ...g, refName: region.refName })),
      }
    }),
  )
  return {
    genes: reads.flatMap(r => r.genes ?? []),
    missing: reads.filter(r => !r.genes).map(r => r.region.refName),
  }
}

const walkFetched = new Map<string, GeneModel[]>()
let walkAbort: AbortController | undefined

async function contigGenes(
  assembly: HubAssembly,
  src: GeneSource,
  region: Region,
  signal: AbortSignal,
) {
  const key = `${src.file} ${regionKey(region)}`
  const hit = walkFetched.get(key)
  if (hit) {
    return hit
  }
  const aliases = assembly.refNameAliases
    ? await loadAliases(assembly.refNameAliases).catch(() => [])
    : []
  const { tabixGenes } = await import('./tabixGenes')
  const genes =
    (
      await tabixGenes(src, namesFor(aliases, region.refName), region, signal)
    )?.map(g => ({ ...g, refName: region.refName })) ?? []
  walkFetched.set(key, genes)
  return genes
}

// How many walk rows a gene track is read for at once, the first rows down
const WALK_GENE_ROWS = 40

// The genes of walk rows, as the layout or the strip, each row's from the gene
// track of the assembly the bound hub names for its haplotype (`HG00097#1`),
// over the span of its own contig the row's bar covers. The first
// WALK_GENE_ROWS rows with a track are read.
function loadWalkGenes() {
  state.walkGenes = undefined
  state.walkGeneNote = undefined
  const graph = state.graph
  const b = binding()
  const bars =
    drawnMode().value === 'walkrows'
      ? rowsOf(graph, state.region)
      : stripRowsWanted()
  if (!settings.showGenes || !graph || !bars || b.status !== 'bound') {
    return
  }
  const tracked = bars.rows.flatMap(row => {
    const axis = row.axis
    const assembly =
      row.haplotype === undefined
        ? undefined
        : assemblyNamed(b.hub, `${row.sample}#${row.haplotype}`)
    const src = assembly && geneTrackOf({ hub: b.hub, assembly })?.genes
    return axis && assembly && src ? [{ row, axis, assembly, src }] : []
  })
  const reads = tracked.slice(0, WALK_GENE_ROWS)
  state.walkGeneNote = {
    untracked: bars.rows.length - tracked.length,
    unread: tracked.length - reads.length,
  }
  if (reads.length === 0) {
    return
  }
  const controller = new AbortController()
  walkAbort = controller
  void Promise.all(
    reads.map(({ row, axis, assembly, src }) =>
      contigGenes(
        assembly,
        src,
        { refName: axis.contig, ...rowSpan(axis, row.bp) },
        controller.signal,
      )
        .catch((e: unknown): GeneModel[] => {
          if (!controller.signal.aborted) {
            console.error(e)
          }
          return []
        })
        .then(genes => [row.name, genes] as const),
    ),
  ).then(entries => {
    if (!controller.signal.aborted) {
      state.walkGenes = new Map(entries)
      scheduleDraw()
    }
  })
}

export function loadGenes() {
  stopGenes()
  loadWalkGenes()
  const source = state.source
  if (own && own.text !== source?.text) {
    own = undefined
  }
  missing = []
  state.genes = ownGenes()?.genes
  state.genesFrom = ownGenes()?.name
  const w = referenceWindow()
  const track = w && geneTrackOf(w)
  const src = track?.genes
  if (state.genes || !w || !track || !src || !settings.showGenes) {
    return
  }
  const key = `${src.file} ${JSON.stringify(w.contigs)} ${w.regions.map(regionKey).join(' ')}`
  // under the graph's names for the contigs, which the pins match exactly
  const apply = (read: Read) => {
    state.genes = featuresOnBackbone(read.genes, w.backbone)
    state.genesFrom = track.name
    missing = read.missing
  }
  const hit = fetched.get(key)
  if (hit) {
    apply(hit)
    return
  }
  const controller = new AbortController()
  abort = controller
  trackGenes(w, src, controller.signal).then(
    read => {
      fetched.set(key, read)
      if (!controller.signal.aborted && !ownGenes()) {
        apply(read)
        scheduleDraw()
      }
    },
    (e: unknown) => {
      if (controller.signal.aborted) {
        return
      }
      console.error(e)
      if (!warned) {
        warned = true
        notify(
          `Couldn't read ${track.name}: ${e instanceof Error ? e.message : String(e)}`,
          false,
        )
      }
    },
  )
}

onBindingChange(() => {
  loadGenes()
  scheduleDraw()
})

const picker = Object.assign(document.createElement('input'), {
  type: 'file',
  accept: '.gff,.gff3,.bed,.gz,.txt,text/plain',
  hidden: true,
})
picker.setAttribute('aria-label', 'Genes file')
document.body.append(picker)

async function readGenes(file: File) {
  const source = state.source
  const backbone = backboneOf(state.graph)
  try {
    const text = await gfaText(file)
    const all = genesFromText(text)
    if (all.length === 0) {
      notify(`${file.name} has no genes in GFF3 or BED`)
      return
    }
    if (state.source !== source || !source || !backbone) {
      return
    }
    const genes = featuresOnBackbone(all, backbone)
    if (genes.length === 0) {
      const named = [...new Set(all.map(g => g.refName))]
      notify(
        `${file.name} has genes on ${named.slice(0, 3).join(', ')}${named.length > 3 ? '…' : ''}, none on the reference ${backbone.contigs.map(c => c.refName).join(', ')}`,
      )
      return
    }
    stopGenes()
    own = {
      text: source.text,
      backbone: backboneId(backbone)!,
      name: file.name,
      genes,
    }
    state.genes = genes
    state.genesFrom = file.name
    settings.showGenes = true
    saveSettings()
    scheduleDraw()
  } catch (e) {
    fail(e)
  }
}

picker.addEventListener('change', () => {
  const file = picker.files?.[0]
  if (file) {
    void readGenes(file)
  }
  picker.value = ''
})

export function openGenes() {
  picker.click()
}
