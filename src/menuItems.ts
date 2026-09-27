import {
  BUBBLE_SPREADS,
  COLOR_SCHEMES,
  LAYOUT_MODES,
  NODE_WIDTHS,
  layoutModeByValue,
  modeUsesLayoutEngine,
  pathColorsLegible,
} from '@jbrowse/bandage-core'

import { needs } from './describe'
import {
  genesSourceName,
  loadGenes,
  noGenesReason,
  openGenes,
  ownGenesName,
} from './genes'
import { relayout } from './layout'
import { backboneOf } from './reference'
import { QUALITIES } from './settings'
import { examples, openExample, reparse } from './sources'
import {
  drawnMode,
  effectiveMode,
  facts,
  saveSettings,
  settings,
  state,
} from './state'
import { rebuild, scheduleDraw } from './view'

import type { MenuItem } from './menus'
import type { Example } from './sources'

function apply(effect: 'layout' | 'geometry') {
  saveSettings()
  if (effect === 'layout') {
    void relayout()
  } else {
    rebuild()
  }
}

function radio<T extends string | number>(
  items: readonly { value: T; label: string }[],
  current: T,
  set: (value: T) => void,
  effect: 'layout' | 'geometry',
  disabled: (value: T) => string | undefined = () => undefined,
): MenuItem[] {
  return items.map(i => {
    const why = disabled(i.value)
    return {
      label: i.label,
      radio: true,
      checked: i.value === current,
      disabled: why !== undefined,
      detail: why,
      onClick: () => {
        set(i.value)
        apply(effect)
      },
    }
  })
}

function toggle(
  label: string,
  key: 'showBubbles' | 'showDeletionEdges' | 'drawPaths' | 'showGenes',
  disabled?: string,
): MenuItem {
  return {
    label,
    checked: settings[key],
    disabled: disabled !== undefined,
    detail: disabled,
    onClick: () => {
      settings[key] = !settings[key]
      apply('geometry')
    },
  }
}

export function layoutItems(): MenuItem[] {
  const graph = state.graph
  const engine = !!graph && modeUsesLayoutEngine(effectiveMode(), graph)
  return [
    ...radio(
      LAYOUT_MODES,
      drawnMode().value,
      v => {
        settings.mode = v
        state.modeOverride = undefined
        const params = new URLSearchParams(location.search)
        if (params.has('layout')) {
          params.set('layout', v)
          history.replaceState(null, '', `?${params}`)
        }
      },
      'layout',
      v =>
        graph && !facts().drawable.has(v)
          ? needs(layoutModeByValue(v).description)
          : undefined,
    ),
    ...(engine
      ? [
          { header: 'Force-directed quality' },
          ...radio(
            QUALITIES,
            settings.quality,
            v => (settings.quality = v),
            'layout',
          ),
          { header: 'Bubble spread' },
          ...radio(
            BUBBLE_SPREADS,
            settings.bubbleSpread,
            v => (settings.bubbleSpread = v),
            'layout',
          ),
        ]
      : []),
  ]
}

const GENELESS_MODES = new Set([
  'variants',
  'walkrows',
  'tubemap',
  'tubemapref',
])

function genesItems(): MenuItem[] {
  const own = ownGenesName()
  const fetchedName = genesSourceName()
  const backbone = backboneOf(state.graph)
  const mode = drawnMode()
  return [
    {
      ...toggle(
        'Genes',
        'showGenes',
        GENELESS_MODES.has(mode.value)
          ? `Not drawn in the ${mode.label} layout`
          : noGenesReason(),
      ),
      onClick: () => {
        settings.showGenes = !settings.showGenes
        saveSettings()
        loadGenes()
        scheduleDraw()
      },
    },
    {
      label: 'Open genes…',
      detail: !backbone
        ? 'Needs a graph with reference coordinates'
        : own
          ? `Showing ${own}${fetchedName ? ` in place of ${fetchedName}` : ''}`
          : `A GFF3 or BED file${fetchedName ? `, in place of ${fetchedName}` : ''}`,
      disabled: !backbone,
      onClick: openGenes,
    },
  ]
}

export function displayItems(): MenuItem[] {
  const paths = state.graph?.paths?.length ?? 0
  return [
    { header: 'Colour' },
    ...radio(
      COLOR_SCHEMES,
      settings.colorScheme,
      v => (settings.colorScheme = v),
      'geometry',
    ),
    { header: 'Node width' },
    ...radio(
      NODE_WIDTHS,
      settings.nodeWidth,
      v => (settings.nodeWidth = v),
      'geometry',
    ),
    { header: 'Show' },
    toggle('Bubbles', 'showBubbles'),
    toggle('Deletion edges', 'showDeletionEdges'),
    toggle(
      'Path colours',
      'drawPaths',
      paths === 0
        ? 'This graph has no paths'
        : !pathColorsLegible(paths)
          ? 'Too many paths to tell their colours apart'
          : undefined,
    ),
    ...genesItems(),
  ]
}

export function walksItems(): MenuItem[] {
  const graph = state.graph
  const walks = facts().walkLabels
  const anchors = graph?.anchoredBy === 'paths' ? (graph.anchorPaths ?? []) : []
  return [
    ...(walks.size > 10 ? [{ search: 'Filter walks' } as MenuItem] : []),
    { header: 'Lift a walk' },
    ...[['', 'None'] as const, ...walks].map(([name, label]): MenuItem => ({
      label,
      radio: true,
      checked: state.highlightedPath === name,
      onClick: () => {
        state.highlightedPath = name
        rebuild()
      },
    })),
    ...(anchors.length > 1
      ? [
          { header: 'Draw x along' } as MenuItem,
          ...anchors.map((a): MenuItem => ({
            label: a.name,
            radio: true,
            checked: graph?.referencePath === a.name,
            onClick: () => {
              state.referencePath = a.name
              reparse()
            },
          })),
        ]
      : []),
  ]
}

export function examplesItems(): MenuItem[] {
  const item = (x: Example): MenuItem => ({
    label: x.name,
    detail: x.description,
    onClick: () => {
      openExample(x)
    },
  })
  return [
    { header: 'Live from the HPRC database, a few seconds each' },
    ...examples.filter(x => 'gbz' in x).map(item),
    { header: 'Bundled GFA files' },
    ...examples.filter(x => 'file' in x).map(item),
  ]
}
