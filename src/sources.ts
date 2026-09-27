import { LAYOUT_MODES, loadGraph } from '@jbrowse/bandage-core'

import { dismiss, done, fail, idle, notify, progress, report } from './feedback'
import { HPRC, cutGbz, parseRegion } from './gbz'
import { relayout, stopLayout } from './layout'
import { gbzFromQuery, gbzQuery } from './query'
import { gfaText, readError } from './read'
import { remember } from './recent'
import { clearInteraction, settings, state } from './state'
import { ui } from './ui'
import { rebuild, showCaption } from './view'

import type { Work } from './feedback'
import type { GbzSource } from './gbz'
import type { Region } from './jbrowse'
import type { Source } from './state'
import type { LayoutModeValue } from '@jbrowse/bandage-core'

const MAX_NODES =
  Number(new URLSearchParams(location.search).get('maxNodes')) || 20_000

let liveOpen = 0
let openAbort: AbortController | undefined
let openWork: Work | undefined

function beginOpen(text: string) {
  openAbort?.abort()
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

// a shared link opens its graph in the layout it was shared in
function setQuery(params: Record<string, string>) {
  const query = new URLSearchParams(
    Object.keys(params).length ? { ...params, layout: settings.mode } : {},
  ).toString()
  history.replaceState(null, '', query ? `?${query}` : location.pathname)
}

export function openGFA(
  text: string,
  source: Omit<Source, 'text'>,
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
            openGFA(text, source, onOpen, Infinity)
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
    state.source = { ...source, regionPath, text }
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
  const gfa = params.get('gfa')
  const gbz = gbzFromQuery(params)
  if (gbz) {
    void openGbz(gbz, undefined, true)
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
    })
  } else if (examples[0]) {
    openExample(examples[0])
  }
}
