import { LAYOUT_MODES, loadGraph } from '@jbrowse/bandage-core'

import { dismiss, done, fail, idle, notify, progress, report } from './feedback'
import { HPRC, cutGbz, parseRegion } from './gbz'
import { loadGenes, stopGenes } from './genes'
import { relayout, stopLayout } from './layout'
import { gbzFromQuery, gbzQuery } from './query'
import { gfaText, readError } from './read'
import { remember } from './recent'
import {
  backboneKey,
  backboneOf,
  contigsFrom,
  contigsText,
  declarationOf,
  linkHubs,
  linkedHubs,
} from './reference'
import { clearInteraction, settings, state } from './state'
import { ui } from './ui'
import { rebuild, showCaption } from './view'

import type { Work } from './feedback'
import type { GbzSource } from './gbz'
import type { Region } from './jbrowse'
import type { Declaration } from './reference'
import type { Source } from './state'
import type { LayoutModeValue } from '@jbrowse/bandage-core'

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

// the hubs a link named and the assembly declared for the drawn backbone
function referenceParams(): [string, string][] {
  const declared = declarationOf(backboneOf(state.graph))
  const d = declared?.implied ? undefined : declared
  const contigs = contigsText(d?.contigs)
  return [
    ...[...new Set([...linkedHubs(), ...(d?.hub ? [d.hub] : [])])].map(
      (url): [string, string] => ['hub', url],
    ),
    ...(d ? [['assembly', d.assembly] as [string, string]] : []),
    ...(contigs ? [['contigs', contigs] as [string, string]] : []),
  ]
}

function replaceQuery(query: URLSearchParams) {
  const text = query.toString()
  history.replaceState(null, '', text ? `?${text}` : location.pathname)
}

// a shared link opens its graph in the layout, and on the assembly, it was
// shared with
function setQuery(params: Record<string, string>) {
  const query = new URLSearchParams(
    Object.keys(params).length ? { ...params, layout: settings.mode } : {},
  )
  if (query.size) {
    for (const [k, v] of referenceParams()) {
      query.append(k, v)
    }
  }
  replaceQuery(query)
}

export function updateReferenceQuery() {
  const query = new URLSearchParams(location.search)
  if (query.size) {
    for (const k of REFERENCE_PARAMS) {
      query.delete(k)
    }
    for (const [k, v] of referenceParams()) {
      query.append(k, v)
    }
    replaceQuery(query)
  }
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
  { declare, ...source }: Omit<Source, 'text'> & { declare?: Declaration },
  onOpen?: () => void,
  maxNodes = MAX_NODES,
) {
  const work = progress('Parsing GFA')
  try {
    const graph = loadGraph(text, source.name, {
      referencePath: state.referencePath || undefined,
    })
    if (graph.nodes.length > maxNodes) {
      notify(
        `${source.name} has ${graph.nodes.length.toLocaleString()} nodes, over the ${maxNodes.toLocaleString()} this page draws by default. A layout that size can take minutes.`,
        false,
        {
          label: 'Draw anyway',
          run: () => {
            openGFA(text, { ...source, declare }, onOpen, Infinity)
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
    state.highlightedPath = ''
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
    if (live()) {
      openGFA(
        text,
        {
          name,
          description: extra.description,
          region: extra.region,
          url: absolute.protocol.startsWith('http') ? absolute.href : undefined,
          declare: extra.declare,
        },
        () => {
          setQuery({ gfa: url })
          if (extra.remember) {
            void remember({ kind: 'url', url: absolute.href, name })
          }
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

export async function openGbz(
  src: GbzSource,
  description?: string,
  rememberIt = false,
  declare?: Declaration,
) {
  const { live, signal, work } = beginOpen('Opening pangenome database')
  try {
    parseRegion(src.region)
    const { text, region, sample } = await cutGbz(
      src,
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
        sample,
        declare,
      },
      () => {
        setQuery(gbzQuery(src))
        if (rememberIt) {
          void remember({ kind: 'gbz', gbz: src, name: src.region })
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
) {
  const { live, work } = beginOpen(`Reading ${name}`)
  try {
    const text = await gfaText(await file)
    if (live()) {
      openGFA(text, { name }, () => {
        setQuery({})
        if (handle) {
          void remember({ kind: 'file', handle, name })
        }
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

// Re-reads the graph on screen, after a change to how it parses
export function reparse() {
  const { text, ...src } = state.source!
  openGFA(text, src, undefined, Infinity)
}

function cancel() {
  const drawing = !!state.layout
  openAbort?.abort()
  liveOpen++
  stopLayout()
  idle()
  if (state.graph && !drawing) {
    rebuild()
    notify('Layout cancelled. Pick a faster one from the Layout menu.', false)
  }
}

ui.cancel.addEventListener('click', cancel)

export type Example = {
  name: string
  description: string
  layout?: LayoutModeValue
  // the assembly the example's reference is on, where no hub's names say
  reference?: Declaration
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
      declare: x.reference && { ...x.reference, implied: true },
    })
  } else {
    void openGbz(
      { ...HPRC, region: x.region, haplotypes: x.haplotypes },
      x.description,
      false,
      x.reference && { ...x.reference, implied: true },
    )
  }
}

// The graph and layout the page's address names, else the first example
export function openFromQuery(params: URLSearchParams) {
  const layout = LAYOUT_MODES.find(m => m.value === params.get('layout'))
  if (layout) {
    settings.mode = layout.value
  }
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
      declare:
        declare ??
        (example?.reference && { ...example.reference, implied: true }),
    })
  } else if (examples[0]) {
    openExample(examples[0])
  }
}
