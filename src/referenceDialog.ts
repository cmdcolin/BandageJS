import { wellKnownSample } from '@jbrowse/bandage-core'

import { notify } from './feedback'
import { loadGenes } from './genes'
import { normal, searchIndex } from './genomeSearch'
import {
  assemblyNamed,
  geneTrackOf,
  geneTracks,
  hubLabel,
  withOverlay,
} from './hubConfig'
import {
  forgetHub,
  forgetSample,
  loadAliases,
  loadHub,
  orderedHubs,
  remember,
  saveHub,
  siteConfig,
  userEntries,
} from './hubs'
import { esc } from './overlays'
import {
  assemblyLabel,
  backboneKey,
  backboneLabel,
  backboneOf,
  binding,
  bindingReason,
  declarationOf,
  linkedHubs,
  onBindingChange,
} from './reference'
import { genomeHubUrl, mergeOverlays } from './siteConfig'
import { rememberSource, updateReferenceQuery } from './sources'
import { settings, state } from './state'
import { ui } from './ui'
import { scheduleDraw } from './view'

import type { Genome } from './genomeSearch'
import type { Hub } from './hubConfig'
import type { Binding, Choice } from './reference'
import type { Backbone } from '@jbrowse/bandage-core'

// The sample a choice can be remembered for, for every graph that names it
const sampleOf = (b: Backbone) => (b.named ? b.prefixes[0] : undefined)

function refresh() {
  updateReferenceQuery()
  rememberSource()
  loadGenes()
  scheduleDraw()
}

// Binds the drawn backbone to an assembly, for every graph of its sample
// where `forSample`, else for this graph alone
export function choose(
  c: Choice,
  contigs?: Record<string, string>,
  forSample = true,
) {
  const b = backboneOf(state.graph)
  const source = state.source
  if (!b || !source) {
    return
  }
  const sample = sampleOf(b)
  const declared = { ...source.declared }
  if (forSample && sample) {
    remember(c.hub.url, {
      aliases: { [c.assembly.name]: [sample] },
      ...(contigs ? { refNameAliases: { [c.assembly.name]: contigs } } : {}),
    })
    delete declared[backboneKey(b)]
  } else {
    declared[backboneKey(b)] = {
      assembly: c.assembly.name,
      hub: c.hub.url,
      ...(contigs ? { contigs } : {}),
    }
    if (!orderedHubs(linkedHubs()).some(h => h.url === c.hub.url)) {
      saveHub(c.hub.url)
    }
  }
  source.declared = declared
  refresh()
}

// Back to whatever the hubs' and the site's names find
function automatic() {
  const b = backboneOf(state.graph)
  const source = state.source
  if (!b || !source) {
    return
  }
  const declared = { ...source.declared }
  delete declared[backboneKey(b)]
  source.declared = declared
  const sample = sampleOf(b)
  if (sample) {
    forgetSample(sample)
  }
  refresh()
}

function question(b: Backbone) {
  return !b.named
    ? `Which assembly is ${b.contigs.map(c => c.contig).join(', ')} on? The graph names no sample.`
    : `Which assembly is ${sampleOf(b) ?? backboneLabel(b)}?`
}

function howText(b: Extract<Binding, { status: 'bound' }>, backbone: Backbone) {
  return b.how === 'named'
    ? 'found by its sample name'
    : b.how === 'remembered'
      ? `as you chose for ${sampleOf(backbone)}`
      : 'as chosen for this graph'
}

// `hs1 (CHM13)`: the assembly's name, and the one graphs likely call it by
export function choiceLabel(c: Choice) {
  const alias = c.assembly.aliases[0] ?? wellKnownSample(c.assembly.name)
  return alias ? `${c.assembly.name} (${alias})` : c.assembly.name
}

function choiceDetail(c: Choice) {
  return [c.assembly.displayName, hubLabel(c.hub.url)]
    .filter(s => s)
    .join(' · ')
}

// Once per graph and backbone, a notice asking which of the likely assemblies
// an unbound backbone is on
const prompted = new Set<string>()

onBindingChange(() => {
  const b = backboneOf(state.graph)
  const bound = binding()
  const key = `${state.source?.name}\n${b && backboneLabel(b)}`
  if (
    b &&
    bound.status === 'unknown' &&
    bound.candidates.length &&
    settings.showGenes &&
    !prompted.has(key)
  ) {
    prompted.add(key)
    notify(question(b), false, [
      ...bound.candidates.slice(0, 3).map(c => ({
        label: choiceLabel(c),
        run: () => {
          choose(c)
        },
      })),
      { label: 'Other…', run: showReferenceDialog },
    ])
  }
})

// The dialog

type Result =
  | { kind: 'auto' }
  | { kind: 'choice'; choice: Choice }
  | { kind: 'genome'; genome: Genome }

let hubs: { url: string; hub?: Hub; error?: string }[] = []
let results: Result[] = []
let picked: Choice | 'auto' | undefined
let index: Promise<unknown> | undefined
let searchVersion = 0

async function readHubs() {
  hubs = await Promise.all(
    orderedHubs(linkedHubs()).map(entry =>
      loadHub(entry.url).then(
        hub => ({
          url: entry.url,
          hub: withOverlay(hub, mergeOverlays(entry.site, entry.user)),
        }),
        (e: unknown) => ({
          url: entry.url,
          error: e instanceof Error ? e.message : String(e),
        }),
      ),
    ),
  )
}

const allChoices = () =>
  hubs.flatMap(({ hub }) =>
    hub ? hub.assemblies.map(assembly => ({ hub, assembly })) : [],
  )

const sameChoice = (a: Choice | 'auto' | undefined, b: Choice) =>
  a !== 'auto' &&
  a?.hub.url === b.hub.url &&
  a.assembly.name === b.assembly.name

function suggestions(): Result[] {
  const bound = binding()
  const b = backboneOf(state.graph)
  const chosen =
    bound.status === 'bound' && bound.how !== 'named'
      ? [{ kind: 'auto' } as Result]
      : []
  const current =
    bound.status === 'bound'
      ? [{ kind: 'choice', choice: bound } as Result]
      : []
  const likely =
    bound.status === 'unknown'
      ? bound.candidates.map(choice => ({ kind: 'choice', choice }) as Result)
      : []
  // with nothing likelier, the genomes of hubs of a few assemblies, which a
  // site likely offers on purpose
  const offered =
    current.length || likely.length
      ? []
      : allChoices()
          .filter(c => c.hub.assemblies.length <= 5)
          .map(choice => ({ kind: 'choice', choice }) as Result)
  return b ? [...chosen, ...current, ...likely, ...offered] : []
}

async function search(query: string): Promise<Result[]> {
  const q = normal(query)
  const local = allChoices()
    .filter(({ assembly: a }) =>
      [a.name, ...a.aliases, a.displayName ?? ''].some(n =>
        normal(n).includes(q),
      ),
    )
    .slice(0, 30)
    .map(choice => ({ kind: 'choice', choice }) as Result)
  const loadedUrls = new Set(hubs.map(h => h.url))
  const { genomes } = siteConfig()
  const direct = genomeHubUrl(query, genomes)
  const typed: Result[] =
    direct && !loadedUrls.has(direct)
      ? [
          {
            kind: 'genome',
            genome: { id: query.trim(), label: '', hub: direct },
          },
        ]
      : []
  let indexed: Result[] = []
  if (genomes.index && q.length >= 2) {
    index ??= fetch(genomes.index)
      .then(res => (res.ok ? (res.json() as Promise<unknown>) : []))
      .catch((e: unknown) => {
        console.error(e)
        index = undefined
        return []
      })
    // a genome whose hub the page has read is its assembly there, which the
    // index can find by names the hub doesn't give it
    indexed = searchIndex(await index, query, genomes).flatMap(
      (genome): Result[] => {
        const hub = hubs.find(h => h.url === genome.hub)?.hub
        const assembly =
          hub && (assemblyNamed(hub, genome.id) ?? hub.assemblies[0])
        if (hub && assembly) {
          const choice = { hub, assembly }
          return local.some(
            r => r.kind === 'choice' && sameChoice(r.choice, choice),
          )
            ? []
            : [{ kind: 'choice', choice }]
        }
        return genome.hub === direct ? [] : [{ kind: 'genome', genome }]
      },
    )
  }
  return [
    ...typed,
    ...local,
    ...indexed.filter(r => r.kind === 'choice'),
    ...indexed.filter(r => r.kind === 'genome'),
  ]
}

function resultHtml(r: Result, i: number) {
  const [title, detail, pressed] =
    r.kind === 'auto'
      ? ['Automatic', "Whatever the graph's names find", picked === 'auto']
      : r.kind === 'choice'
        ? [
            choiceLabel(r.choice),
            choiceDetail(r.choice),
            sameChoice(picked, r.choice),
          ]
        : [
            r.genome.id,
            [r.genome.label, hubLabel(r.genome.hub)].filter(s => s).join(' · '),
            false,
          ]
  return `<li><button type="button" class="genome" data-i="${i}" aria-pressed="${pressed}"><strong>${esc(title)}</strong><small>${esc(detail)}</small></button></li>`
}

function drawResults() {
  ui.genomeResults.innerHTML = results.map(resultHtml).join('')
  const count = allChoices().length
  ui.genomeHint.textContent = ui.genomeSearch.value.trim()
    ? results.length
      ? ''
      : `No genome by that name${siteConfig().genomes.index ? '' : ' in these hubs'}. Try an accession like GCF_000005845.2, or add a hub below.`
    : siteConfig().genomes.index
      ? 'Or search every genome on genomes.jbrowse.org by name or accession.'
      : `Or search ${count.toLocaleString()} assemblies in ${hubs.filter(h => h.hub).length} hubs by name or accession.`
}

async function drawChosen() {
  const b = backboneOf(state.graph)
  ui.referenceChosen.hidden = !picked || picked === 'auto' || !b
  ui.referenceApply.disabled = !picked
  ui.referenceApply.textContent =
    picked === 'auto'
      ? 'Use automatic'
      : picked
        ? `Use ${picked.assembly.name}`
        : 'Use this genome'
  if (!picked || picked === 'auto' || !b) {
    return
  }
  const choice = picked
  const tracks = geneTracks(choice.hub, choice.assembly)
  const current = geneTrackOf(choice)?.trackId ?? ''
  ui.referenceGenesRow.hidden = tracks.length < 2
  ui.referenceGenes.innerHTML = [
    ...tracks.map(
      t => `<option value="${esc(t.trackId)}">${esc(t.name)}</option>`,
    ),
    '<option value="">None</option>',
  ].join('')
  ui.referenceGenes.value = current
  const sample = sampleOf(b)
  const bound = binding()
  // a choice the names already made needs no remembering
  ui.referenceRememberRow.hidden =
    !sample ||
    (bound.status === 'bound' &&
      bound.how === 'named' &&
      sameChoice(choice, bound))
  ui.referenceRememberText.textContent = `Use it for every graph whose reference is ${sample}`
  ui.referenceContigs.innerHTML = ''
  const showsNothing = () =>
    ui.referenceGenesRow.hidden &&
    ui.referenceRememberRow.hidden &&
    !ui.referenceContigs.childElementCount
  ui.referenceChosen.hidden = showsNothing()
  const rows = choice.assembly.refNameAliases
    ? await loadAliases(choice.assembly.refNameAliases).catch(() => [])
    : []
  if (picked !== choice || !rows.length) {
    return
  }
  const known = new Set(rows.flat())
  const mapped = {
    ...choice.assembly.contigs,
    ...declarationOf(b)?.contigs,
  }
  const sequences = rows.map(r => r[0]!)
  ui.referenceContigs.innerHTML = b.contigs
    .filter(c => !known.has(c.contig))
    .map(c => {
      const value =
        mapped[c.contig] ?? (sequences.length === 1 ? sequences[0]! : '')
      return `<label>${esc(c.refName)} is ${esc(choice.assembly.name)}'s <select data-contig="${esc(c.contig)}"><option value="">sequence…</option>${sequences
        .map(
          s =>
            `<option value="${esc(s)}"${s === value ? ' selected' : ''}>${esc(s)}</option>`,
        )
        .join('')}</select></label>`
    })
    .join('')
  ui.referenceChosen.hidden = showsNothing()
}

function drawHubs() {
  const site = new Set(siteConfig().hubs.map(h => h.url))
  const linked = new Set(linkedHubs())
  const own = new Set(userEntries().map(e => e.url))
  ui.hubList.innerHTML = hubs
    .map(
      ({ url, hub, error }) =>
        `<li><span title="${esc(url)}">${esc(hubLabel(url))}</span><small>${
          hub
            ? `${hub.assemblies.length.toLocaleString()} ${hub.assemblies.length === 1 ? 'assembly' : 'assemblies'}`
            : esc(`couldn't read: ${error ?? ''}`)
        }</small>${
          own.has(url) && !site.has(url) && !linked.has(url)
            ? `<button type="button" data-forget="${esc(url)}" aria-label="Remove ${esc(hubLabel(url))}">✕</button>`
            : ''
        }</li>`,
    )
    .join('')
  ui.referenceHubs.querySelector('summary')!.textContent =
    `Hubs (${hubs.length})`
}

function status() {
  const b = backboneOf(state.graph)
  const bound = binding()
  return !b
    ? 'The graph has no reference coordinates.'
    : bound.status === 'bound'
      ? `${backboneLabel(b)} is on ${assemblyLabel(bound)}, ${howText(bound, b)}.`
      : `${bindingReason(bound)}. Pick the assembly ${backboneLabel(b)} is on to read its genes.`
}

async function redraw() {
  const version = ++searchVersion
  const query = ui.genomeSearch.value.trim()
  const found = query ? await search(query) : suggestions()
  if (version === searchVersion) {
    results = found
    drawResults()
  }
}

async function draw() {
  ui.referenceStatus.textContent = status()
  ui.genomeResults.innerHTML = ''
  ui.genomeHint.textContent = 'Reading hubs…'
  await readHubs()
  const bound = binding()
  picked =
    bound.status === 'bound'
      ? { hub: bound.hub, assembly: bound.assembly }
      : undefined
  drawHubs()
  await redraw()
  await drawChosen()
}

export function showReferenceDialog() {
  ui.referenceDialog.returnValue = ''
  ui.genomeSearch.value = ''
  ui.hubUrl.value = ''
  ui.hubUrl.setCustomValidity('')
  picked = undefined
  ui.referenceChosen.hidden = true
  ui.referenceDialog.showModal()
  void draw()
}

async function pick(r: Result) {
  if (r.kind === 'auto') {
    picked = 'auto'
  } else if (r.kind === 'choice') {
    picked = r.choice
  } else {
    ui.genomeHint.textContent = `Reading ${hubLabel(r.genome.hub)}…`
    try {
      const hub = await loadHub(r.genome.hub)
      const assembly = assemblyNamed(hub, r.genome.id) ?? hub.assemblies[0]!
      picked = { hub, assembly }
    } catch (e) {
      ui.genomeHint.textContent = `Couldn't read ${hubLabel(r.genome.hub)}: ${e instanceof Error ? e.message : String(e)}`
      return
    }
  }
  drawResults()
  await drawChosen()
}

ui.genomeSearch.addEventListener('input', () => {
  void redraw()
})

ui.genomeSearch.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    e.preventDefault()
    const first = results[0]
    if (first) {
      void pick(first)
    }
  }
})

ui.genomeResults.addEventListener('click', e => {
  const button = (e.target as Element).closest<HTMLElement>('[data-i]')
  const r = button && results[Number(button.dataset.i)]
  if (r) {
    void pick(r)
  }
})

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
    absolute = new URL(
      genomeHubUrl(url, siteConfig().genomes) ?? url,
      location.href,
    ).href
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
  if (ui.referenceDialog.returnValue !== 'apply' || !picked) {
    return
  }
  if (picked === 'auto') {
    automatic()
    return
  }
  const choice = picked
  const contigs = Object.fromEntries(
    [...ui.referenceContigs.querySelectorAll('select')]
      .filter(s => s.value)
      .map(s => [s.dataset.contig!, s.value]),
  )
  const genesChanged =
    !ui.referenceGenesRow.hidden &&
    ui.referenceGenes.value !== (geneTrackOf(choice)?.trackId ?? '')
  if (genesChanged) {
    remember(choice.hub.url, {
      genes: { [choice.assembly.name]: ui.referenceGenes.value },
    })
  }
  // the assembly already bound, which choosing again would only restate
  const bound = binding()
  if (
    bound.status === 'bound' &&
    sameChoice(choice, bound) &&
    !Object.keys(contigs).length
  ) {
    if (genesChanged) {
      refresh()
    }
    return
  }
  choose(
    choice,
    Object.keys(contigs).length ? contigs : undefined,
    ui.referenceRemember.checked,
  )
})
