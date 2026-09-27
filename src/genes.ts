import { fail, notify } from './feedback'
import { genesFromText } from './geneModels'
import { gfaText } from './read'
import { grch38Region, saveSettings, settings, state } from './state'
import { scheduleDraw } from './view'

import type { Region } from './jbrowse'
import type { GeneModel } from '@jbrowse/bandage-core'

// The genes the backbone shows: RefSeq's for the graph's GRCh38 window,
// fetched after the graph opens without holding up its drawing, or those of a
// file the user opened for this graph.

const fetched = new Map<string, GeneModel[]>()
let abort: AbortController | undefined
let warned = false
let own: { text: string; name: string; genes: GeneModel[] } | undefined

const keyOf = (r: Region) => `${r.refName}:${r.start}-${r.end}`

export function stopGenes() {
  abort?.abort()
}

// the name of the file the genes on screen came from, if they did
export function ownGenesName() {
  return own && own.text === state.source?.text ? own.name : undefined
}

export function loadGenes() {
  stopGenes()
  const source = state.source
  if (own && own.text !== source?.text) {
    own = undefined
  }
  const region = grch38Region()
  state.genes = own?.genes ?? (region && fetched.get(keyOf(region)))
  if (state.genes || !region || !settings.showGenes) {
    return
  }
  const controller = new AbortController()
  abort = controller
  import('./refseq')
    .then(m => m.refseqGenes(region, controller.signal))
    .then(
      genes => {
        fetched.set(keyOf(region), genes)
        if (state.source === source && !own) {
          state.genes = genes
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
            `Couldn't read RefSeq genes: ${e instanceof Error ? e.message : String(e)}`,
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
  try {
    const text = await gfaText(file)
    const genes = genesFromText(text)
    if (genes.length === 0) {
      notify(`${file.name} has no genes in GFF3 or BED`)
      return
    }
    if (state.source !== source || !source) {
      return
    }
    stopGenes()
    own = { text: source.text, name: file.name, genes }
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
