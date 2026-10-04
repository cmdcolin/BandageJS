import {
  COLOR_SCHEMES,
  LAYOUT_MODES,
  WALK_FIELDS,
  WALK_SCHEMES,
  pathColorsLegible,
  resolveColorScheme,
} from '@jbrowse/bandage-core'

import { replaceParams } from './address'
import { layoutName } from './describe'
import { showAbout, showGuide, showOpenDialog } from './dialogs'
import { copySpec, exportBlocked, exportSvg, specBlocked } from './figure'
import { loadGenes, noGenesReason, openGenes } from './genes'
import { jbrowseItems } from './jbrowseItems'
import { applySettings, showLayoutDialog } from './layoutDialog'
import { backboneOf, binding, referenceAssembly } from './reference'
import { choiceLabel, showReferenceDialog } from './referenceDialog'
import { FACETS } from './settings'
import { examples, openExample, recut, reparse } from './sources'
import {
  drawnMode,
  facts,
  saveSettings,
  settings,
  state,
  tube,
  walks as walkView,
} from './state'
import { rebuild, scheduleDraw } from './view'
import {
  liftWalks,
  setFacet,
  setFacetColumns,
  setWalkColor,
  toggleWalk,
} from './walks'

import type { MenuItem } from './menus'
import type { Example } from './sources'
import type { ColorScheme } from '@jbrowse/bandage-core'

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

// The layouts the graph can take
export function layoutItems(): MenuItem[] {
  const graph = state.graph
  return [
    ...radio(
      LAYOUT_MODES.filter(m => !graph || facts().drawable.has(m.value)).map(
        m => ({ value: m.value, label: layoutName(m.label) }),
      ),
      drawnMode().value,
      v => {
        settings.mode = v
        state.modeOverride = undefined
        loadGenes()
        replaceParams(['layout'], [['layout', v]])
      },
      'layout',
    ),
    { divider: true },
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
  const paths = state.graph?.paths?.length ?? 0
  const mode = drawnMode()
  return [
    {
      label: `Colour: ${schemeLabel(settings.colorScheme)}`,
      submenu: colourItems,
    },
    { divider: true },
    toggle('Bubbles', 'showBubbles'),
    toggle('Deletion edges', 'showDeletionEdges'),
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
    ...(paths > 0 && pathColorsLegible(paths)
      ? [toggle('Path colours', 'drawPaths')]
      : []),
    ...(paths > 1
      ? [
          toggle(
            'Walk rows under the graph',
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
    ...(facts().walkChoices.length
      ? [
          { divider: true } as const,
          { label: walksLabel(), submenu: walksItems },
        ]
      : []),
  ]
}

function walksLabel() {
  const lifted = (walkView().lift?.walks ?? []).map(
    w => facts().walkLabels.get(w.name) ?? w.name,
  )
  return lifted.length === 0
    ? 'Walks'
    : lifted.length === 1
      ? `Walk: ${lifted[0]}`
      : `Walks: ${lifted.length} lifted`
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

// Colour by and palette for one lifted walk, as it is drawn: its panel's
// encoding while side by side, its lane's otherwise
function walkColourItems(name: string): MenuItem[] {
  const { lift, panels } = walkView()
  const drawn =
    panels?.find(p => p.walks[0]!.name === name)?.walks[0] ??
    lift?.walks.find(w => w.name === name)
  if (!drawn) {
    return []
  }
  const { field, scheme } = drawn.encoding
  return [
    { header: 'Colour by' },
    ...WALK_FIELDS.map((f): MenuItem => ({
      label: f.label,
      radio: true,
      checked: field === f.value,
      onClick: () => {
        setWalkColor(name, { field: f.value })
      },
    })),
    { header: 'Palette' },
    // the rainbow is the reference-position ramp
    ...WALK_SCHEMES.filter(
      s => s.value !== 'rainbow' || field === 'reference',
    ).map((s): MenuItem => ({
      label: s.label,
      radio: true,
      checked: scheme === s.value,
      onClick: () => {
        setWalkColor(name, { scheme: s.value })
      },
    })),
  ]
}

// Lifting walks, drawing them side by side, and each one's colours. A tube
// map draws every walk as a tube, so it lifts none.
function liftItems(): MenuItem[] {
  const walks = facts().walkLabels
  const lifted = state.walkLayers.map(l => l.walk)
  const faceted = !!walkView().panels
  return [
    ...(walks.size > 10 ? [{ search: 'Filter walks' } as MenuItem] : []),
    { header: 'Lift walks' },
    {
      label: 'None',
      disabled: lifted.length === 0,
      onClick: () => {
        liftWalks([])
      },
    },
    ...[...walks].map(([name, label]): MenuItem => ({
      label,
      checked: lifted.includes(name),
      onClick: () => {
        toggleWalk(name)
      },
    })),
    ...(lifted.length > 1
      ? [
          { divider: true } as const,
          {
            label: 'Side by side',
            submenu: () =>
              FACETS.map((f): MenuItem => ({
                label: f.label,
                radio: true,
                checked: settings.facet === f.value,
                onClick: () => {
                  setFacet(f.value)
                },
              })),
          },
        ]
      : []),
    ...(faceted && settings.facet === 'walk'
      ? [
          {
            label: 'Columns',
            submenu: () =>
              [0, ...lifted.map((_, i) => i + 1)].map((n): MenuItem => ({
                label: n === 0 ? 'Auto' : String(n),
                radio: true,
                checked: settings.facetColumns === n,
                onClick: () => {
                  setFacetColumns(n)
                },
              })),
          },
        ]
      : []),
    ...(lifted.length > 0 ? [{ divider: true } as const] : []),
    ...lifted.map((name): MenuItem => ({
      label: `Colour ${walks.get(name) ?? name}`,
      submenu: () => walkColourItems(name),
    })),
  ]
}

export function walksItems(): MenuItem[] {
  const graph = state.graph
  // each walk once, by name, however many fragments of it the graph holds
  const fragments = new Map<string, number>()
  for (const a of graph?.anchoredBy === 'paths'
    ? (graph.anchorPaths ?? [])
    : []) {
    fragments.set(a.name, (fragments.get(a.name) ?? 0) + 1)
  }
  return [
    ...(tube() ? [] : liftItems()),
    ...(fragments.size > 1
      ? [
          { divider: true } as const,
          {
            label: graph?.referencePath
              ? `Draw x along: ${graph.referencePath}`
              : 'Draw x along',
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
