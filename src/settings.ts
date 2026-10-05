import {
  BUBBLE_SPREADS,
  COLOR_SCHEMES,
  LAYOUT_ENGINES,
  LAYOUT_MODES,
  LAYOUT_QUALITIES,
  NODE_WIDTHS,
} from '@jbrowse/bandage-core'

import type {
  BubbleSpread,
  ColorScheme,
  LayoutEngineKind,
  LayoutModeValue,
  NodeWidth,
} from '@jbrowse/bandage-core'

export interface Settings {
  mode: LayoutModeValue
  colorScheme: ColorScheme
  nodeWidth: NodeWidth
  // which force engine draws the force-directed layout
  engine: LayoutEngineKind
  quality: number
  bubbleSpread: BubbleSpread
  showBubbles: boolean
  showDeletionEdges: boolean
  drawPaths: boolean
  showGenes: boolean
  // walk rows in a strip under a layout that draws nodes, linked to it
  walkStrip: boolean
  // lifted walks drawn side by side, a panel per walk or a row per sample,
  // and how many go across by walk; 0 takes whichever count draws each panel
  // largest
  facet: Facet
  facetColumns: number
  // multiples of the force engine's link length and gap between components
  spacing: number
  componentSeparation: number
  // a node's drawn width in px, before depth widens it
  nodeThickness: number
}

export const DEFAULTS: Settings = {
  mode: 'force',
  colorScheme: 'auto',
  nodeWidth: 'depth',
  engine: 'fmmm',
  quality: 2,
  bubbleSpread: 'auto',
  showBubbles: false,
  showDeletionEdges: true,
  drawPaths: false,
  showGenes: true,
  walkStrip: false,
  facet: 'none',
  facetColumns: 0,
  spacing: 1,
  componentSeparation: 1,
  nodeThickness: 6,
}

export const FACETS = [
  { value: 'none', label: 'Overlaid' },
  { value: 'walk', label: 'Side by side' },
  { value: 'sample', label: 'Grid by sample' },
] as const

export type Facet = (typeof FACETS)[number]['value']

export const SPACINGS = [
  { value: 0.5, label: 'Compact' },
  { value: 1, label: 'Default' },
  { value: 2, label: 'Loose' },
  { value: 4, label: 'Very loose' },
]

export const SEPARATIONS = [
  { value: 0.5, label: 'Close' },
  { value: 1, label: 'Default' },
  { value: 3, label: 'Far' },
]

export const THICKNESSES = [
  { value: 3, label: 'Thin' },
  { value: 6, label: 'Default' },
  { value: 10, label: 'Thick' },
  { value: 16, label: 'Very thick' },
]

const KEY = 'bandagejs-settings'

export function stored<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw === null ? fallback : (JSON.parse(raw) as T)
  } catch {
    return fallback
  }
}

export function store(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {}
}

type Field<K extends keyof Settings = keyof Settings> = {
  key: K
  // the setting's name in a link
  param: string
} & (
  | { choices: readonly { value: Settings[K] }[] }
  | { flag: true }
  | { count: true }
)

const field = <K extends keyof Settings>(f: Field<K>) => f as Field

// Every setting, with its choices where it has a fixed set
const FIELDS: readonly Field[] = [
  field({ key: 'mode', param: 'layout', choices: LAYOUT_MODES }),
  field({ key: 'colorScheme', param: 'color', choices: COLOR_SCHEMES }),
  field({ key: 'nodeWidth', param: 'width', choices: NODE_WIDTHS }),
  field({ key: 'engine', param: 'engine', choices: LAYOUT_ENGINES }),
  field({ key: 'quality', param: 'quality', choices: LAYOUT_QUALITIES }),
  field({ key: 'bubbleSpread', param: 'spread', choices: BUBBLE_SPREADS }),
  field({ key: 'showBubbles', param: 'bubbles', flag: true }),
  field({ key: 'showDeletionEdges', param: 'deletions', flag: true }),
  field({ key: 'drawPaths', param: 'paths', flag: true }),
  field({ key: 'showGenes', param: 'genes', flag: true }),
  field({ key: 'walkStrip', param: 'bars', flag: true }),
  field({ key: 'facet', param: 'facet', choices: FACETS }),
  field({ key: 'facetColumns', param: 'columns', count: true }),
  field({ key: 'spacing', param: 'spacing', choices: SPACINGS }),
  field({
    key: 'componentSeparation',
    param: 'separation',
    choices: SEPARATIONS,
  }),
  field({ key: 'nodeThickness', param: 'thickness', choices: THICKNESSES }),
]

export const SETTING_PARAMS = FIELDS.map(f => f.param)

export function count(value: unknown, fallback: number) {
  return Number.isInteger(value) && (value as number) >= 0
    ? (value as number)
    : fallback
}

// `value` where it is one the field takes, else `fallback`
function valid<T>(f: Field, value: unknown, fallback: T): T {
  if ('flag' in f) {
    return (typeof value === 'boolean' ? value : fallback) as T
  }
  if ('count' in f) {
    return count(value, fallback as number) as T
  }
  return (f.choices.find(c => c.value === value)?.value ?? fallback) as T
}

// Stored settings with each value a choice this build offers, else its default
export function validSettings(raw: unknown): Settings {
  const s: Partial<Record<keyof Settings, unknown>> =
    typeof raw === 'object' && raw !== null ? raw : {}
  return Object.fromEntries(
    FIELDS.map(f => [f.key, valid(f, s[f.key], DEFAULTS[f.key])]),
  ) as unknown as Settings
}

// The settings as a link states them: the layout always, and whatever else
// differs from the defaults, so a link stays short and a changed default
// reaches its reader
export function settingsParams(s: Settings): [string, string][] {
  return FIELDS.filter(
    f => f.param === 'layout' || s[f.key] !== DEFAULTS[f.key],
  ).map(f => {
    const v = s[f.key]
    return [f.param, typeof v === 'boolean' ? (v ? '1' : '0') : String(v)]
  })
}

// `text` as the field's value where it spells one: 1 or 0 for a flag, a
// choice's value otherwise
function fromText(f: Field, text: string): unknown {
  if ('flag' in f) {
    return text === '1' || text === 'true'
      ? true
      : text === '0' || text === 'false'
        ? false
        : undefined
  }
  if ('count' in f) {
    return Number(text)
  }
  return f.choices.find(c => String(c.value) === text)?.value
}

// Sets each setting a link names, leaving the rest as they were
export function readSettingsParams(params: URLSearchParams, s: Settings) {
  const settings = s as unknown as Record<string, unknown>
  for (const f of FIELDS) {
    const text = params.get(f.param)
    if (text !== null) {
      settings[f.key] = valid(f, fromText(f, text), s[f.key])
    }
  }
}

// A record without this format holds every setting, saved before saves kept
// only changes. A value there that was the default of its time says nothing
// about what the reader chose, so the current default replaces it.
const FORMAT = 2
const WAS_DEFAULT: Partial<Record<keyof Settings, unknown>> = {
  showDeletionEdges: false,
  showBubbles: true,
}

export function upgraded(raw: unknown) {
  if (typeof raw !== 'object' || raw === null) {
    return raw
  }
  const { format, ...s } = raw as Record<string, unknown>
  return format === FORMAT
    ? s
    : Object.fromEntries(
        Object.entries(s).filter(
          ([k, v]) => v !== WAS_DEFAULT[k as keyof Settings],
        ),
      )
}

export function loadSettings() {
  return validSettings(upgraded(stored<unknown>(KEY, {})))
}

// The settings that differ from the defaults, the only ones a save keeps, so
// a changed default reaches a returning visitor
export function changedSettings(settings: Settings) {
  return Object.fromEntries(
    Object.entries(settings).filter(
      ([k, v]) => v !== DEFAULTS[k as keyof Settings],
    ),
  )
}

export function saveSettings(settings: Settings) {
  store(KEY, { format: FORMAT, ...changedSettings(settings) })
}
