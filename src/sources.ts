import { LAYOUT_MODES, loadGraph } from '@jbrowse/bandage-core'

import { replaceParams, replaceQuery } from './address'
import {
  dismiss,
  done,
  fail,
  idle,
  notify,
  pending,
  progress,
  report,
} from './feedback'
import { HPRC, cutGbz, parseRegion } from './gbz'
import { loadGenes, stopGenes } from './genes'
import { relayout, stopLayout } from './layout'
import { gbzFromQuery, gbzQuery } from './query'
import { gfaText, readError } from './read'
import { remember } from './recent'
import { siteConfig } from './hubs'
import {
  backboneKey,
  backboneOf,
  contigsFrom,
  contigsText,
  linkHubs,
  linkedHubs,
  onBindingChange,
  referenceWindow,
} from './reference'
import { clearInteraction, cutsWholeWalks, settings, state } from './state'
import { ui } from './ui'
import { rebuild, showCaption } from './view'
import { askWalks, takeAskedWalks, walkParams } from './walks'

import type { Work } from './feedback'
import type { GbzSource } from './gbz'
import type { Region } from './jbrowse'
import type { Declaration } from './reference'
import type { Source } from './state'
import type { LayoutModeValue, WalkLayer } from '@jbrowse/bandage-core'

const MAX_NODES =
  Number(new URLSearchParams(location.search).get('maxNodes')) || 20_000

let liveOpen = 0
let openAbort: AbortController | undefined
let openWork: Work | undefined

function beginOpen(text: string) {
  openAbort?.abort()
  stopGenes()
  openAbort = new AbortController()
  done(openWork)
  openWork = progress(text)
  const open = ++liveOpen
  dismiss()
  state.referencePath = ''
  return {
    live: () => open === liveOpen,
    signal: openAbort.signal,
    work: openWork,
  }
}

const REFERENCE_PARAMS = ['hub', 'assembly', 'contigs']

// The hubs a link named, and the assembly the reference is on where someone
// chose it rather than the hubs' and the site's names finding it, so the link
// finds it again for anyone
function referenceParams(): [string, string][] {
  const w = referenceWindow()
  const chosen = w && w.how !== 'named' ? w : undefined
  const siteHub = siteConfig().hubs.some(h => h.url === chosen?.hub.url)
  const contigs = contigsText(
    chosen &&
      Object.fromEntries(
        chosen.backbone.contigs.flatMap(c =>
          chosen.contigs[c.contig]
            ? [[c.contig, chosen.contigs[c.contig]!]]
            : [],
        ),
      ),
  )
  return [
    ...[
      ...new Set([
        ...linkedHubs(),
        ...(chosen && !siteHub ? [chosen.hub.url] : []),
      ]),
    ].map((url): [string, string] => ['hub', url]),
    ...(chosen ? [['assembly', chosen.assembly.name] as [string, string]] : []),
    ...(contigs ? [['contigs', contigs] as [string, string]] : []),
  ]
}

// the walk a walk-anchored graph draws x along, where someone chose one
function alongParams(): [string, string][] {
  return state.referencePath ? [['along', state.referencePath]] : []
}

// the path a link asks to draw x along, which the next graph to open takes
let askedAlong = ''

// a shared link opens its graph in the layout, on the assembly, along the walk
// and with the walks lifted it was shared with
function setQuery(params: Record<string, string>) {
  const query = new URLSearchParams(
    Object.keys(params).length ? { ...params, layout: settings.mode } : {},
  )
  if (query.size) {
    for (const [k, v] of [
      ...referenceParams(),
      ...alongParams(),
      ...walkParams(),
    ]) {
      query.append(k, v)
    }
  }
  replaceQuery(query)
}

export function updateReferenceQuery() {
  replaceParams(REFERENCE_PARAMS, referenceParams())
}

export function declarationFromQuery(
  params: URLSearchParams,
): Declaration | undefined {
  const assembly = params.get('assembly')
  const contigs = contigsFrom(params.get('contigs') ?? '')
  return assembly ? { assembly, ...(contigs ? { contigs } : {}) } : undefined
}

// `declare` is the assembly a link or example says the graph's reference is on
export function openGFA(
  text: string,
  {
    declare,
    walks,
    ...source
  }: Omit<Source, 'text'> & { declare?: Declaration; walks?: WalkLayer[] },
  onOpen?: () => void,
  maxNodes = MAX_NODES,
) {
  const work = progress('Parsing GFA')
  try {
    const along = state.referencePath || askedAlong
    askedAlong = ''
    const graph = loadGraph(text, source.name, {
      referencePath: along || undefined,
    })
    state.referencePath = graph.referencePath === along ? along : ''
    if (graph.nodes.length > maxNodes) {
      notify(
        `${source.name} has ${graph.nodes.length.toLocaleString()} nodes, over the ${maxNodes.toLocaleString()} this page draws by default. A layout that size can take minutes.`,
        false,
        {
          label: 'Draw anyway',
          run: () => {
            openGFA(text, { ...source, declare, walks }, onOpen, Infinity)
          },
        },
      )
      return
    }
    // the path a walk-anchored cut is first drawn along is the one its region
    // is on
    const regionPath =
      source.regionPath ??
      (source.region && graph.anchoredBy === 'paths'
        ? graph.referencePath
        : undefined)
    const backbone = backboneOf(graph)
    const declared =
      declare && backbone
        ? { ...source.declared, [backboneKey(backbone)]: declare }
        : source.declared
    state.source = { ...source, regionPath, text, declared }
    state.region =
      source.region && (!regionPath || graph.referencePath === regionPath)
        ? source.region
        : undefined
    state.graph = graph
    state.layout = undefined
    state.stack = []
    state.modeOverride = undefined
    state.walkLayers = takeAskedWalks(graph, walks)
    clearInteraction()
    document.title = `${source.name} · BandageJS`
    ui.empty.hidden = true
    showCaption()
    loadGenes()
    void relayout()
    onOpen?.()
  } catch (e) {
    fail(e)
  } finally {
    done(work)
  }
}

export async function openUrl(
  url: string,
  extra: {
    description?: string
    region?: Region
    remember?: boolean
    declare?: Declaration
    declared?: Source['declared']
  } = {},
) {
  const name = url.split('/').pop() || url
  const { live, signal, work } = beginOpen(`Fetching ${name}`)
  try {
    const res = await fetch(url, { signal }).catch((e: unknown) => {
      throw readError(e, url)
    })
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} fetching ${url}`)
    }
    const text = await gfaText(await res.blob())
    const absolute = new URL(url, location.href)
    const recent = extra.remember
      ? ({ kind: 'url', url: absolute.href, name } as const)
      : undefined
    if (live()) {
      openGFA(
        text,
        {
          name,
          description: extra.description,
          region: extra.region,
          url: absolute.protocol.startsWith('http') ? absolute.href : undefined,
          declare: extra.declare,
          declared: extra.declared,
          recent,
        },
        () => {
          setQuery({ gfa: url })
          rememberSource()
        },
      )
    }
  } catch (e) {
    if (live() && !signal.aborted) {
      fail(e)
    }
  } finally {
    done(work)
  }
}

// What a re-cut keeps of the region on screen, or the recent list of a cut
interface Kept {
  declared: Source['declared']
  regionPath: Source['regionPath']
  referencePath: string
  walks: WalkLayer[]
  recent: Source['recent']
}

export async function openGbz(
  src: GbzSource,
  description?: string,
  rememberIt = false,
  declare?: Declaration,
  kept: Partial<Kept> = {},
) {
  const { live, signal, work } = beginOpen('Opening pangenome database')
  if (kept.referencePath) {
    state.referencePath = kept.referencePath
  }
  const wholeWalks = cutsWholeWalks()
  try {
    parseRegion(src.region)
    const { text, region, sample } = await cutGbz(
      wholeWalks ? { ...src, snarls: 'overlapping' } : src,
      text => {
        report(work, text)
      },
      signal,
    )
    if (!live()) {
      return
    }
    openGFA(
      text,
      {
        name: `${sample} ${src.region}`,
        description,
        region,
        gbz: src,
        wholeWalks,
        sample,
        declare,
        declared: kept.declared,
        regionPath: kept.regionPath,
        walks: kept.walks,
        recent:
          kept.recent ??
          (rememberIt
            ? { kind: 'gbz', gbz: src, name: src.region }
            : undefined),
      },
      () => {
        setQuery(gbzQuery(src))
        if (rememberIt) {
          rememberSource()
        }
      },
    )
  } catch (e) {
    if (live() && !signal.aborted) {
      fail(readError(e, src.db))
    }
  } finally {
    done(work)
  }
}

export async function openFile(
  file: File | Promise<File>,
  name: string,
  handle?: FileSystemFileHandle,
  declared?: Source['declared'],
) {
  const { live, work } = beginOpen(`Reading ${name}`)
  try {
    const text = await gfaText(await file)
    if (live()) {
      const recent = handle
        ? ({ kind: 'file', handle, name } as const)
        : undefined
      openGFA(text, { name, declared, recent }, () => {
        setQuery({})
        rememberSource()
      })
    }
  } catch (e) {
    if (live()) {
      fail(e)
    }
  } finally {
    done(work)
  }
}

// Cuts the region on screen again when walk rows came to need whole walks, or
// stopped needing them, and says whether it did. Not while another open is
// under way, which the re-cut would cancel, nor inside a popped bubble, which
// it would close; Back cuts it then.
export function recut() {
  const source = state.source
  if (
    !source?.gbz ||
    pending(openWork) ||
    state.stack.length > 0 ||
    !!source.wholeWalks === cutsWholeWalks()
  ) {
    return false
  }
  void openGbz(source.gbz, source.description, false, undefined, {
    declared: source.declared,
    regionPath: source.regionPath,
    referencePath: state.referencePath,
    walks: state.walkLayers,
    recent: source.recent,
  })
  return true
}

// Saves the graph on screen to the Open dialog's recent list, with the
// assemblies declared for it, where it was opened to be remembered
export function rememberSource() {
  const s = state.source
  if (s?.recent) {
    void remember({ ...s.recent, declared: s.declared })
  }
}

// Re-reads the graph on screen, its walks still lifted, after a change to how
// it parses
export function reparse() {
  const { text, ...src } = state.source!
  openGFA(
    text,
    { ...src, walks: state.walkLayers },
    () => {
      replaceParams(['along'], alongParams())
    },
    Infinity,
  )
}

function cancel() {
  const drawing = !!state.layout
  openAbort?.abort()
  liveOpen++
  stopLayout()
  idle()
  if (state.graph && !drawing) {
    rebuild()
    notify('Layout cancelled. Pick a faster one from View → Layout.', false)
  }
}

ui.cancel.addEventListener('click', cancel)

export type Example = {
  name: string
  description: string
  layout?: LayoutModeValue
} & (
  | { file: string; region?: string }
  | { gbz: 'hprc'; region: string; haplotypes?: string[] }
)

export let examples: Example[] = []

export async function loadExamples() {
  examples = await fetch('examples/index.json')
    .then(res => res.json() as Promise<Example[]>)
    .catch(() => [])
}

export function openExample(x: Example) {
  if (x.layout) {
    settings.mode = x.layout
  }
  if ('file' in x) {
    const url = `examples/${x.file}`
    void openUrl(url, {
      description: x.description,
      region: x.region ? parseRegion(x.region) : undefined,
    })
  } else {
    void openGbz(
      { ...HPRC, region: x.region, haplotypes: x.haplotypes },
      x.description,
    )
  }
}

// The graph and layout the page's address names, else the first example
export function openFromQuery(params: URLSearchParams) {
  const layout = LAYOUT_MODES.find(m => m.value === params.get('layout'))
  if (layout) {
    settings.mode = layout.value
  }
  askWalks(params)
  askedAlong = params.get('along') ?? ''
  linkHubs(params.getAll('hub').map(url => new URL(url, location.href).href))
  const declare = declarationFromQuery(params)
  const gfa = params.get('gfa')
  const gbz = gbzFromQuery(params)
  if (gbz) {
    void openGbz(gbz, undefined, true, declare)
  } else if (gfa) {
    const example = examples.find(
      x => 'file' in x && `examples/${x.file}` === gfa,
    )
    void openUrl(gfa, {
      remember: !example,
      description: example?.description,
      region:
        example && 'file' in example && example.region
          ? parseRegion(example.region)
          : undefined,
      declare,
    })
  } else if (examples[0]) {
    openExample(examples[0])
  }
}

onBindingChange(updateReferenceQuery)
