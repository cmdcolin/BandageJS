import {
  BUBBLE_SPREADS,
  COLOR_SCHEMES,
  LAYOUT_ENGINES,
  LAYOUT_MODES,
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
  showBubbles: true,
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

export const QUALITIES = [
  { value: 0, label: 'Fastest' },
  { value: 1, label: 'Fast' },
  { value: 2, label: 'Default' },
  { value: 3, label: 'Fine' },
  { value: 4, label: 'Best' },
]

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

function oneOf<T>(
  choices: readonly { value: T }[],
  value: unknown,
  fallback: T,
) {
  return choices.find(c => c.value === value)?.value ?? fallback
}

function flag(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback
}

export function count(value: unknown, fallback: number) {
  return Number.isInteger(value) && (value as number) >= 0
    ? (value as number)
    : fallback
}

// Stored settings with each value a choice this build offers, else its default
export function validSettings(raw: unknown): Settings {
  const s: Partial<Record<keyof Settings, unknown>> =
    typeof raw === 'object' && raw !== null ? raw : {}
  return {
    mode: oneOf(LAYOUT_MODES, s.mode, DEFAULTS.mode),
    colorScheme: oneOf(COLOR_SCHEMES, s.colorScheme, DEFAULTS.colorScheme),
    nodeWidth: oneOf(NODE_WIDTHS, s.nodeWidth, DEFAULTS.nodeWidth),
    engine: oneOf(LAYOUT_ENGINES, s.engine, DEFAULTS.engine),
    quality: oneOf(QUALITIES, s.quality, DEFAULTS.quality),
    bubbleSpread: oneOf(BUBBLE_SPREADS, s.bubbleSpread, DEFAULTS.bubbleSpread),
    showBubbles: flag(s.showBubbles, DEFAULTS.showBubbles),
    showDeletionEdges: flag(s.showDeletionEdges, DEFAULTS.showDeletionEdges),
    drawPaths: flag(s.drawPaths, DEFAULTS.drawPaths),
    showGenes: flag(s.showGenes, DEFAULTS.showGenes),
    walkStrip: flag(s.walkStrip, DEFAULTS.walkStrip),
    facet: oneOf(FACETS, s.facet, DEFAULTS.facet),
    facetColumns: count(s.facetColumns, DEFAULTS.facetColumns),
    spacing: oneOf(SPACINGS, s.spacing, DEFAULTS.spacing),
    componentSeparation: oneOf(
      SEPARATIONS,
      s.componentSeparation,
      DEFAULTS.componentSeparation,
    ),
    nodeThickness: oneOf(THICKNESSES, s.nodeThickness, DEFAULTS.nodeThickness),
  }
}

// A record without this format holds every setting, saved before saves kept
// only changes. Its `showDeletionEdges: false` is most likely the default of
// that time, so the current default replaces it.
const FORMAT = 2

export function upgraded(raw: unknown) {
  if (typeof raw !== 'object' || raw === null) {
    return raw
  }
  const { format, ...s } = raw as Record<string, unknown>
  if (format === FORMAT) {
    return s
  }
  const { showDeletionEdges, ...rest } = s
  return showDeletionEdges === false ? rest : s
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
