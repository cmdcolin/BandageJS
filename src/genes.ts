import { fail, notify } from './feedback'
import { genesFromText } from './geneModels'
import { gfaText } from './read'
import {
  backboneOf,
  genesOn,
  noWindowReason,
  referenceWindow,
} from './reference'
import { saveSettings, settings, state } from './state'
import { scheduleDraw } from './view'

import type { Region } from './jbrowse'
import type { Backbone } from './reference'
import type { GeneModel } from '@jbrowse/bandage-core'

// The genes the backbone shows: the bound assembly's, fetched after the graph
// opens without holding up its drawing, or those of a file the user opened
// for the backbone drawn then.

const fetched = new Map<string, GeneModel[]>()
let abort: AbortController | undefined
let warned = false
let own:
  | { text: string; backbone: string; name: string; genes: GeneModel[] }
  | undefined

const regionKey = (r: Region) => `${r.refName}:${r.start}-${r.end}`
const backboneKey = (b: Backbone | undefined) =>
  b?.contigs.map(c => c.refName).join('\n')

export function stopGenes() {
  abort?.abort()
}

function ownGenes() {
  return own &&
    own.text === state.source?.text &&
    own.backbone === backboneKey(backboneOf(state.graph))
    ? own
    : undefined
}

export function ownGenesName() {
  return ownGenes()?.name
}

export function genesSourceName() {
  return referenceWindow()?.assembly.genes?.name
}

// why the Genes toggle has nothing to show, if it doesn't
export function noGenesReason() {
  const window = referenceWindow()
  return ownGenes() || window?.assembly.genes
    ? undefined
    : window
      ? `No genes known for ${window.assembly.name}`
      : noWindowReason()
}

export function loadGenes() {
  stopGenes()
  const source = state.source
  if (own && own.text !== source?.text) {
    own = undefined
  }
  const window = referenceWindow()
  const genes = window?.assembly.genes
  const key =
    window && genes
      ? `${genes.gff3Tabix} ${window.regions.map(regionKey).join(' ')}`
      : undefined
  state.genes = ownGenes()?.genes ?? (key ? fetched.get(key) : undefined)
  if (state.genes || !key || !genes || !settings.showGenes) {
    return
  }
  const controller = new AbortController()
  abort = controller
  import('./tabixGenes')
    .then(m =>
      Promise.all(
        window!.regions.map(r =>
          m.tabixGenes(genes.gff3Tabix, r, controller.signal),
        ),
      ),
    )
    .then(
      perRegion => {
        const all = perRegion.flat()
        fetched.set(key, all)
        if (state.source === source && !ownGenes()) {
          state.genes = all
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
            `Couldn't read ${genes.name} genes: ${e instanceof Error ? e.message : String(e)}`,
            false,
          )
        }
      },
    )
}

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
    const genes = genesOn(all, backbone)
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
      backbone: backboneKey(backbone)!,
      name: file.name,
      genes,
    }
    state.genes = genes
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
