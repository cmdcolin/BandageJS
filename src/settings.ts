import {
  BUBBLE_SPREADS,
  COLOR_SCHEMES,
  LAYOUT_MODES,
  NODE_WIDTHS,
} from '@jbrowse/bandage-core'

import type {
  BubbleSpread,
  ColorScheme,
  LayoutModeValue,
  NodeWidth,
} from '@jbrowse/bandage-core'

export interface Settings {
  mode: LayoutModeValue
  colorScheme: ColorScheme
  nodeWidth: NodeWidth
  quality: number
  bubbleSpread: BubbleSpread
  showBubbles: boolean
  showDeletionEdges: boolean
  drawPaths: boolean
  showGenes: boolean
  // lifted walks drawn side by side, a panel per walk or a row per sample,
  // and how many go across by walk; 0 takes whichever count draws each panel
  // largest
  facet: Facet
  facetColumns: number
}

export const DEFAULTS: Settings = {
  mode: 'force',
  colorScheme: 'auto',
  nodeWidth: 'depth',
  quality: 2,
  bubbleSpread: 'auto',
  showBubbles: true,
  showDeletionEdges: true,
  drawPaths: false,
  showGenes: true,
  facet: 'none',
  facetColumns: 0,
}

export const FACETS = [
  { value: 'none', label: 'Off' },
  { value: 'walk', label: 'A panel per walk' },
  { value: 'sample', label: 'A row per sample, a column per haplotype' },
] as const

export type Facet = (typeof FACETS)[number]['value']

export const QUALITIES = [0, 1, 2, 3, 4].map(q => ({
  value: q,
  label: `Quality ${q}`,
}))

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
    quality: oneOf(QUALITIES, s.quality, DEFAULTS.quality),
    bubbleSpread: oneOf(BUBBLE_SPREADS, s.bubbleSpread, DEFAULTS.bubbleSpread),
    showBubbles: flag(s.showBubbles, DEFAULTS.showBubbles),
    showDeletionEdges: flag(s.showDeletionEdges, DEFAULTS.showDeletionEdges),
    drawPaths: flag(s.drawPaths, DEFAULTS.drawPaths),
    showGenes: flag(s.showGenes, DEFAULTS.showGenes),
    facet: oneOf(FACETS, s.facet, DEFAULTS.facet),
    facetColumns: count(s.facetColumns, DEFAULTS.facetColumns),
  }
}

export function loadSettings() {
  return validSettings(stored<unknown>(KEY, {}))
}

export function saveSettings(settings: Settings) {
  store(KEY, settings)
}
