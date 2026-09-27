import { backboneAssembly } from '@jbrowse/bandage-core'

import { loadGenes } from './genes'
import { assemblyNamed, geneTracks, hubLabel } from './hubConfig'
import {
  DEFAULT_HUBS,
  forgetHub,
  loadAliases,
  loadHub,
  saveHub,
  savedHubs,
} from './hubs'
import { esc } from './overlays'
import {
  allHubUrls,
  backboneKey,
  backboneLabel,
  backboneOf,
  chooseGeneTrack,
  contigsFrom,
  contigsText,
  declarationOf,
  geneTrackOf,
  linkedHubs,
} from './reference'
import { updateReferenceQuery } from './sources'
import { state } from './state'
import { ui } from './ui'
import { scheduleDraw } from './view'

import type { Hub, HubAssembly } from './hubConfig'

const AUTO = ''
const NONE = ''

let hubs: { url: string; hub?: Hub; error?: string }[] = []

async function readHubs() {
  hubs = await Promise.all(
    allHubUrls().map(url =>
      loadHub(url).then(
        hub => ({ url, hub }),
        (e: unknown) => ({
          url,
          error: e instanceof Error ? e.message : String(e),
        }),
      ),
    ),
  )
}

const optionValue = (hub: Hub, a: HubAssembly) => `${hub.url}\t${a.name}`

function chosen() {
  const [url, name] = ui.referenceAssembly.value.split('\t')
  const hub = hubs.find(h => h.url === url)?.hub
  const assembly = hub && name ? assemblyNamed(hub, name) : undefined
  return hub && assembly ? { hub, assembly } : undefined
}

// what the page binds the backbone to with nothing declared
function automatic() {
  const b = backboneOf(state.graph)
  for (const { hub } of hubs) {
    const assembly = hub && backboneAssembly(b, hub.assemblies)
    if (assembly) {
      return { hub: hub!, assembly }
    }
  }
  return undefined
}

function drawHubs() {
  const saved = new Set(savedHubs())
  const fixed = new Set([...DEFAULT_HUBS, ...linkedHubs()])
  ui.hubList.innerHTML = hubs
    .map(
      ({ url, hub, error }) =>
        `<li><span title="${esc(url)}">${esc(hubLabel(url))}</span><small>${
          hub
            ? `${hub.assemblies.length.toLocaleString()} ${hub.assemblies.length === 1 ? 'assembly' : 'assemblies'}`
            : esc(`couldn't read: ${error ?? ''}`)
        }</small>${
          saved.has(url) && !fixed.has(url)
            ? `<button type="button" data-forget="${esc(url)}" aria-label="Remove ${esc(hubLabel(url))}">✕</button>`
            : ''
        }</li>`,
    )
    .join('')
}

function drawAssemblies(selected: string) {
  const auto = automatic()
  ui.referenceAssembly.innerHTML = [
    `<option value="${AUTO}">Automatic: ${esc(auto ? `${auto.assembly.name}, from ${hubLabel(auto.hub.url)}` : 'none found')}</option>`,
    ...hubs.flatMap(({ url, hub }) =>
      hub
        ? [
            `<optgroup label="${esc(hubLabel(url))}">${hub.assemblies
              .map(
                a =>
                  `<option value="${esc(optionValue(hub, a))}">${esc(a.displayName ? `${a.name}: ${a.displayName}` : a.name)}</option>`,
              )
              .join('')}</optgroup>`,
          ]
        : [],
    ),
  ].join('')
  ui.referenceAssembly.value = selected
  if (ui.referenceAssembly.value !== selected) {
    ui.referenceAssembly.value = AUTO
  }
}

function drawGenes() {
  const target = chosen() ?? automatic()
  const tracks = target ? geneTracks(target.hub, target.assembly) : []
  const current = target && geneTrackOf(target)
  ui.referenceGenes.innerHTML = [
    ...tracks.map(
      t => `<option value="${esc(t.trackId)}">${esc(t.name)}</option>`,
    ),
    `<option value="${NONE}">None</option>`,
  ].join('')
  ui.referenceGenes.value = current?.trackId ?? NONE
  ui.referenceGenes.disabled = !target
  ui.referenceSequences.innerHTML = ''
  const aliases = target?.assembly.refNameAliases
  if (aliases) {
    void loadAliases(aliases).then(
      rows => {
        if ((chosen() ?? automatic())?.assembly === target.assembly) {
          ui.referenceSequences.innerHTML = rows
            .map(r => `<option value="${esc(r[0]!)}"></option>`)
            .join('')
        }
      },
      () => {},
    )
  }
}

async function draw() {
  const b = backboneOf(state.graph)
  const d = declarationOf(b)
  ui.referenceAbout.textContent = b
    ? `The graph's reference is ${backboneLabel(b)}. Its assembly decides which genes the page reads and where JBrowse links open.`
    : 'The graph has no reference coordinates.'
  ui.referenceAssembly.disabled = true
  ui.referenceAssembly.innerHTML = '<option>Reading hubs…</option>'
  await readHubs()
  const declared =
    d &&
    hubs.find(
      ({ hub }) =>
        hub && (!d.hub || hub.url === d.hub) && assemblyNamed(hub, d.assembly),
    )?.hub
  drawHubs()
  drawAssemblies(
    declared
      ? optionValue(declared, assemblyNamed(declared, d.assembly)!)
      : AUTO,
  )
  ui.referenceAssembly.disabled = !b
  ui.referenceContigs.value = contigsText(d?.contigs)
  drawGenes()
}

export function showReferenceDialog() {
  ui.referenceDialog.returnValue = ''
  ui.hubUrl.value = ''
  ui.hubUrl.setCustomValidity('')
  ui.referenceDialog.showModal()
  void draw()
}

ui.referenceAssembly.addEventListener('change', drawGenes)

ui.hubList.addEventListener('click', e => {
  const url = (e.target as Element).closest<HTMLElement>('[data-forget]')
    ?.dataset.forget
  if (url) {
    forgetHub(url)
    void draw()
  }
})

ui.hubAdd.addEventListener('click', () => {
  const url = ui.hubUrl.value.trim()
  if (!url) {
    return
  }
  let absolute: string
  try {
    absolute = new URL(url, location.href).href
  } catch {
    ui.hubUrl.setCustomValidity(`${url} is not a url`)
    ui.hubUrl.reportValidity()
    return
  }
  ui.hubAdd.disabled = true
  loadHub(absolute)
    .then(
      () => {
        saveHub(absolute)
        ui.hubUrl.value = ''
        ui.hubUrl.setCustomValidity('')
        return draw()
      },
      (e: unknown) => {
        ui.hubUrl.setCustomValidity(
          `Couldn't read ${url}: ${e instanceof Error ? e.message : String(e)}`,
        )
        ui.hubUrl.reportValidity()
      },
    )
    .finally(() => {
      ui.hubAdd.disabled = false
    })
})

ui.hubUrl.addEventListener('input', () => {
  ui.hubUrl.setCustomValidity('')
})

ui.hubUrl.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    e.preventDefault()
    ui.hubAdd.click()
  }
})

ui.referenceDialog.addEventListener('close', () => {
  const b = backboneOf(state.graph)
  const source = state.source
  if (ui.referenceDialog.returnValue !== 'apply' || !b || !source) {
    return
  }
  const contigs = contigsFrom(ui.referenceContigs.value)
  const pick = chosen() ?? (contigs ? automatic() : undefined)
  const declared = { ...source.declared }
  const before = declarationOf(b)
  if (pick) {
    const d = {
      assembly: pick.assembly.name,
      hub: pick.hub.url,
      ...(contigs ? { contigs } : {}),
    }
    const same =
      before &&
      assemblyNamed(pick.hub, before.assembly) === pick.assembly &&
      contigsText(before.contigs) === contigsText(d.contigs)
    declared[backboneKey(b)] = same ? before : d
  } else {
    delete declared[backboneKey(b)]
  }
  source.declared = declared
  const target = pick ?? automatic()
  if (target) {
    const genes = ui.referenceGenes.value
    chooseGeneTrack(
      target,
      genes === geneTracks(target.hub, target.assembly)[0]?.trackId
        ? undefined
        : genes,
    )
  }
  updateReferenceQuery()
  loadGenes()
  scheduleDraw()
})
