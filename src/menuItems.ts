import {
  COLOR_SCHEMES,
  LAYOUT_MODES,
  pathColorsLegible,
  resolveColorScheme,
} from '@jbrowse/bandage-core'

import { replaceParams } from './address'
import { layoutName } from './describe'
import { showAbout, showGuide, showOpenDialog } from './dialogs'
import { copySpec, exportBlocked, exportSvg, specBlocked } from './figure'
import { loadGenes, noGenesReason, openGenes } from './genes'
import { jbrowseItems } from './jbrowseItems'
import { showHighlightDialog } from './highlightDialog'
import { applySettings, showLayoutDialog } from './layoutDialog'
import { backboneOf, binding, referenceAssembly } from './reference'
import { choiceLabel, showReferenceDialog } from './referenceDialog'
import { FACETS } from './settings'
import { examples, openExample, recut, reparse } from './sources'
import { drawnMode, facts, saveSettings, settings, state, tube } from './state'
import { rebuild, scheduleDraw } from './view'
import { liftWalks, setFacet, toggleWalk } from './walks'

import type { MenuItem } from './menus'
import type { Example } from './sources'
import type { ColorScheme, Graph } from '@jbrowse/bandage-core'

interface Choice<T> {
  value: T
  label: string
}

function radio<T extends string | number>(
  items: readonly Choice<T>[],
  current: T,
  set: (value: T) => void,
  effect: 'layout' | 'geometry',
): MenuItem[] {
  return items.map(i => ({
    label: i.label,
    radio: true,
    checked: i.value === current,
    onClick: () => {
      set(i.value)
      applySettings(effect)
    },
  }))
}

function toggle(
  label: string,
  key:
    | 'showBubbles'
    | 'showDeletionEdges'
    | 'drawPaths'
    | 'showGenes'
    | 'walkStrip',
  disabled?: string,
  applied = () => {
    applySettings('geometry')
  },
): MenuItem {
  return {
    label,
    checked: settings[key],
    disabled: disabled !== undefined,
    detail: disabled,
    onClick: () => {
      settings[key] = !settings[key]
      applied()
    },
  }
}

// The layouts the graph can take, where it can take more than one
export function layoutItems(): MenuItem[] {
  const graph = state.graph
  const modes = LAYOUT_MODES.filter(
    m => !graph || facts().drawable.has(m.value),
  )
  return [
    ...(modes.length > 1
      ? [
          ...radio(
            modes.map(m => ({ value: m.value, label: layoutName(m.label) })),
            drawnMode().value,
            v => {
              settings.mode = v
              state.modeOverride = undefined
              loadGenes()
              replaceParams(['layout'], [['layout', v]])
            },
            'layout',
          ),
          { divider: true } as const,
        ]
      : []),
    { label: 'Layout settings…', onClick: showLayoutDialog },
  ]
}

const NEEDS_REFERENCE = new Set<ColorScheme>([
  'reference-position',
  'stable-rank',
])

// A scheme's name with what it means for this graph: Auto says what it
// resolves to, and the reference ramp names the assembly it runs along
function schemeLabel(value: ColorScheme): string {
  const assembly = referenceAssembly()
  if (value === 'reference-position') {
    return assembly ? `${assembly} position` : 'Reference position'
  }
  if (value === 'auto') {
    return `Auto (${schemeLabel(resolveColorScheme('auto', state.graph))})`
  }
  return COLOR_SCHEMES.find(s => s.value === value)!.label
}

// Schemes that need reference coordinates are left out for a graph without
function colourItems(): MenuItem[] {
  const referenced = !state.graph || !!state.graph.anchoredBy
  return radio(
    COLOR_SCHEMES.filter(s => referenced || !NEEDS_REFERENCE.has(s.value)).map(
      s => ({
        value: s.value,
        label: schemeLabel(s.value),
      }),
    ),
    settings.colorScheme,
    v => (settings.colorScheme = v),
    'geometry',
  )
}

const GENELESS_MODES = new Set(['tubemap', 'tubemapref'])

// What to draw. A row the graph can't use is left out; one the layout rules
// out stays, disabled, since another layout brings it back.
export function viewItems(): MenuItem[] {
  const mode = drawnMode()
  return [
    {
      label: `Colour: ${schemeLabel(settings.colorScheme)}`,
      submenu: colourItems,
    },
    { divider: true },
    toggle('Bubbles', 'showBubbles'),
    toggle('Deletion edges', 'showDeletionEdges', undefined, () => {
      applySettings(state.layoutMode === 'force' ? 'layout' : 'geometry')
    }),
    ...(backboneOf(state.graph)
      ? [
          toggle(
            'Genes',
            'showGenes',
            GENELESS_MODES.has(mode.value)
              ? `Not drawn in the ${mode.label} layout`
              : noGenesReason(),
            () => {
              saveSettings()
              loadGenes()
              scheduleDraw()
            },
          ),
        ]
      : []),
  ]
}

// The reference's assembly and what it opens, for a graph with one
function referenceFileItems(): MenuItem[] {
  if (!backboneOf(state.graph)) {
    return []
  }
  const bound = binding()
  return [
    { divider: true },
    {
      label:
        bound.status === 'bound'
          ? `Reference genome: ${choiceLabel(bound)}…`
          : bound.status === 'pending'
            ? 'Finding the reference genome…'
            : 'Choose reference genome…',
      disabled: bound.status === 'pending',
      onClick: showReferenceDialog,
    },
    { label: 'Open genes…', onClick: openGenes },
    ...jbrowseItems(),
  ]
}

export function fileItems(): MenuItem[] {
  return [
    { label: 'Open…', onClick: showOpenDialog },
    { divider: true },
    {
      label: 'Export SVG',
      disabled: !!exportBlocked(),
      detail: exportBlocked(),
      onClick: exportSvg,
    },
    {
      label: 'Copy figure spec',
      detail: specBlocked(),
      disabled: !!specBlocked(),
      onClick: () => {
        void copySpec()
      },
    },
    ...referenceFileItems(),
  ]
}

// Each walk once, by name, however many fragments of it the graph holds
function fragmentsOf(graph: Graph | undefined) {
  const fragments = new Map<string, number>()
  for (const a of graph?.anchoredBy === 'paths'
    ? (graph.anchorPaths ?? [])
    : []) {
    fragments.set(a.name, (fragments.get(a.name) ?? 0) + 1)
  }
  return fragments
}

export const haplotypesShown = () => facts().walkChoices.length > 0

// Highlighting walks, how highlighted walks are drawn, and what else draws
// them. A tube map draws every walk as a tube, so it highlights none.
function highlightItems(): MenuItem[] {
  const walks = facts().walkLabels
  const lifted = state.walkLayers.map(l => l.walk)
  return [
    ...(walks.size > 10 ? [{ search: 'Filter haplotypes' } as MenuItem] : []),
    { header: 'Highlight' },
    ...[...walks].map(([name, label]): MenuItem => ({
      label,
      checked: lifted.includes(name),
      onClick: () => {
        toggleWalk(name)
      },
    })),
    {
      label: 'Clear highlights',
      disabled: lifted.length === 0,
      onClick: () => {
        liftWalks([])
      },
    },
    ...(lifted.length > 1
      ? [
          { divider: true } as const,
          ...FACETS.map((f): MenuItem => ({
            label: f.label,
            radio: true,
            checked: settings.facet === f.value,
            onClick: () => {
              setFacet(f.value)
            },
          })),
        ]
      : []),
    ...(lifted.length > 0
      ? [{ label: 'Colour highlighted…', onClick: showHighlightDialog }]
      : []),
  ]
}

export function haplotypeItems(): MenuItem[] {
  const graph = state.graph
  const paths = graph?.paths?.length ?? 0
  const mode = drawnMode()
  const fragments = fragmentsOf(graph)
  const others = [
    ...(!tube() && pathColorsLegible(paths)
      ? [toggle('Colour every haplotype', 'drawPaths')]
      : []),
    ...(paths > 1
      ? [
          toggle(
            'Bars under the graph',
            'walkStrip',
            mode.drawsNodes
              ? undefined
              : `Not drawn under the ${mode.label} layout`,
            () => {
              saveSettings()
              if (!recut()) {
                loadGenes()
                rebuild()
              }
            },
          ),
        ]
      : []),
    ...(fragments.size > 1
      ? [
          {
            label: graph?.referencePath
              ? `Reference haplotype: ${graph.referencePath}`
              : 'Reference haplotype',
            submenu: () =>
              [...fragments].map(([name, n]): MenuItem => ({
                label: n > 1 ? `${name}, ${n} fragments` : name,
                radio: true,
                checked: graph?.referencePath === name,
                onClick: () => {
                  state.referencePath = name
                  reparse()
                },
              })),
          },
        ]
      : []),
  ]
  const highlights = tube() ? [] : highlightItems()
  return [
    ...highlights,
    ...(highlights.length && others.length ? [{ divider: true } as const] : []),
    ...others,
  ]
}

export function helpItems(): MenuItem[] {
  return [
    { label: 'User guide', onClick: showGuide },
    { label: 'About', onClick: showAbout },
  ]
}

export function examplesItems(): MenuItem[] {
  const item = (x: Example): MenuItem => ({
    label: x.name,
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
