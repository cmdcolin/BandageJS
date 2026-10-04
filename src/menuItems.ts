import {
  BUBBLE_SPREADS,
  COLOR_SCHEMES,
  LAYOUT_MODES,
  WALK_FIELDS,
  WALK_SCHEMES,
  layoutModeByValue,
  modeUsesLayoutEngine,
  pathColorsLegible,
  resolveColorScheme,
} from '@jbrowse/bandage-core'

import { needs } from './describe'
import { showHelp, showOpenDialog } from './dialogs'
import { copySpec, exportBlocked, exportSvg, specBlocked } from './figure'
import {
  genesSourceName,
  loadGenes,
  noGenesReason,
  openGenes,
  ownGenesName,
} from './genes'
import { jbrowseItems } from './jbrowseItems'
import { relayout } from './layout'
import { backboneOf, referenceAssembly, referenceName } from './reference'
import { referenceItems } from './referenceDialog'
import {
  FACETS,
  QUALITIES,
  SEPARATIONS,
  SPACINGS,
  THICKNESSES,
} from './settings'
import { examples, openExample, recut, reparse } from './sources'
import {
  drawnMode,
  effectiveMode,
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
import type { ColorScheme, LayoutModeValue } from '@jbrowse/bandage-core'

function apply(effect: 'layout' | 'geometry') {
  saveSettings()
  if (recut()) {
    return
  }
  if (effect === 'layout') {
    void relayout()
  } else {
    rebuild()
  }
}

interface Choice<T> {
  value: T
  label: string
  detail?: string
}

function radio<T extends string | number>(
  items: readonly Choice<T>[],
  current: T,
  set: (value: T) => void,
  effect: 'layout' | 'geometry',
  o: { disabled?: (value: T) => string | undefined; keepOpen?: boolean } = {},
): MenuItem[] {
  return items.map(i => {
    const why = o.disabled?.(i.value)
    return {
      label: i.label,
      radio: true,
      checked: i.value === current,
      disabled: why !== undefined,
      detail: why ?? i.detail,
      keepOpen: o.keepOpen,
      onClick: () => {
        set(i.value)
        apply(effect)
      },
    }
  })
}

// A setting's submenu, which stays open so its values can be tried in turn
function pick<T extends string | number>(
  label: string,
  items: readonly Choice<T>[],
  current: () => T,
  set: (value: T) => void,
  effect: 'layout' | 'geometry',
  o: { detail?: string; disabled?: string } = {},
): MenuItem {
  const chosen = items.find(i => i.value === current())?.label
  return {
    label: chosen ? `${label}: ${chosen}` : label,
    detail: o.disabled ?? o.detail,
    disabled: o.disabled !== undefined,
    submenu: () => radio(items, current(), set, effect, { keepOpen: true }),
  }
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

const LAYOUT_DETAILS: Record<LayoutModeValue, string> = {
  auto: 'Along the reference, a row per step off it',
  samplerows: 'Along the reference, a row per assembly',
  walkrows: 'A bar per haplotype, as long as its sequence',
  ordered: 'In reference order, every node given room',
  tubemap: 'Each path a coloured tube through the nodes',
  tubemapref: 'The tube map at reference positions',
  force: "Bandage's layout, nodes pulled together by their links",
}

const layoutName = (label: string) => label.replace(/ layout$/, '')

export function layoutItems(): MenuItem[] {
  const graph = state.graph
  const engine = !!graph && modeUsesLayoutEngine(effectiveMode(), graph)
  const forceOnly = engine ? undefined : 'Force-directed layout only'
  return [
    ...radio(
      LAYOUT_MODES.map(m => ({
        value: m.value,
        label: layoutName(m.label),
        detail: LAYOUT_DETAILS[m.value],
      })),
      drawnMode().value,
      v => {
        settings.mode = v
        state.modeOverride = undefined
        loadGenes()
        const params = new URLSearchParams(location.search)
        if (params.has('layout')) {
          params.set('layout', v)
          history.replaceState(null, '', `?${params}`)
        }
      },
      'layout',
      {
        disabled: v =>
          graph && !facts().drawable.has(v)
            ? needs(layoutModeByValue(v).description)
            : undefined,
      },
    ),
    { divider: true },
    pick(
      'Quality',
      QUALITIES.map(q => ({ value: q.value, label: String(q.value) })),
      () => settings.quality,
      v => (settings.quality = v),
      'layout',
      {
        detail: 'Higher untangles more, and takes longer',
        disabled: forceOnly,
      },
    ),
    pick(
      'Bubble spread',
      BUBBLE_SPREADS,
      () => settings.bubbleSpread,
      v => (settings.bubbleSpread = v),
      'layout',
      { detail: "How far apart a bubble's alleles draw", disabled: forceOnly },
    ),
    pick(
      'Spacing',
      SPACINGS,
      () => settings.spacing,
      v => (settings.spacing = v),
      'layout',
      { detail: 'How far apart linked nodes sit', disabled: forceOnly },
    ),
    pick(
      'Component separation',
      SEPARATIONS,
      () => settings.componentSeparation,
      v => (settings.componentSeparation = v),
      'layout',
      { detail: 'The gap between unconnected pieces', disabled: forceOnly },
    ),
  ]
}

const SCHEME_DETAILS: Record<
  Exclude<ColorScheme, 'auto' | 'reference-position'>,
  string
> = {
  uniform: 'One colour',
  random: 'A colour per node, as Bandage draws',
  rainbow: 'Along the order of the nodes in the file',
  depth: 'By read depth',
  'node-length': 'By length',
  'stable-rank': 'By rank: the reference first, then each step off it',
  grey: 'All grey',
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

function colourItems(): MenuItem[] {
  const name = referenceName()
  const referenced = !!state.graph?.anchoredBy
  return radio(
    COLOR_SCHEMES.map(s => ({
      value: s.value,
      label: schemeLabel(s.value),
      detail:
        s.value === 'auto'
          ? 'The reference position where the graph has one, else one colour'
          : s.value === 'reference-position'
            ? `A rainbow along ${name ?? 'the reference'}`
            : SCHEME_DETAILS[s.value],
    })),
    settings.colorScheme,
    v => (settings.colorScheme = v),
    'geometry',
    {
      keepOpen: true,
      disabled: v =>
        !referenced && NEEDS_REFERENCE.has(v)
          ? 'Needs reference coordinates'
          : undefined,
    },
  )
}

const GENELESS_MODES = new Set(['tubemap', 'tubemapref'])

export function viewItems(): MenuItem[] {
  const paths = state.graph?.paths?.length ?? 0
  const mode = drawnMode()
  return [
    {
      label: `Layout: ${layoutName(mode.label)}`,
      submenu: layoutItems,
    },
    {
      label: `Colour: ${schemeLabel(settings.colorScheme)}`,
      submenu: colourItems,
    },
    pick(
      'Node thickness',
      THICKNESSES,
      () => settings.nodeThickness,
      v => (settings.nodeThickness = v),
      'geometry',
    ),
    {
      label: 'Width by depth',
      checked: settings.nodeWidth === 'depth',
      onClick: () => {
        settings.nodeWidth =
          settings.nodeWidth === 'depth' ? 'uniform' : 'depth'
        apply('geometry')
      },
    },
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
      ...toggle(
        'Walk rows under the graph',
        'walkStrip',
        paths < 2
          ? 'This graph has fewer than two walks'
          : !mode.drawsNodes
            ? `Not drawn under the ${mode.label} layout`
            : undefined,
      ),
      onClick: () => {
        settings.walkStrip = !settings.walkStrip
        saveSettings()
        if (!recut()) {
          loadGenes()
          rebuild()
        }
      },
    },
    ...(facts().walkChoices.length || backboneOf(state.graph)
      ? [{ divider: true } as const]
      : []),
    ...(facts().walkChoices.length
      ? [{ label: walksLabel(), submenu: walksItems }]
      : []),
    ...(backboneOf(state.graph)
      ? [{ label: 'Reference', submenu: referenceMenuItems }]
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

export function referenceMenuItems(): MenuItem[] {
  const own = ownGenesName()
  const fetchedName = genesSourceName()
  return [
    { header: 'Assembly' },
    ...referenceItems(),
    {
      label: 'Open genes…',
      detail: own
        ? `Showing ${own}${fetchedName ? ` in place of ${fetchedName}` : ''}`
        : `A GFF3 or BED file${fetchedName ? `, in place of ${fetchedName}` : ''}`,
      onClick: openGenes,
    },
    { header: 'JBrowse' },
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
      detail: specBlocked() ?? 'To make this figure again with bandage-figure',
      disabled: !!specBlocked(),
      onClick: () => {
        void copySpec()
      },
    },
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
      keepOpen: true,
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
      keepOpen: true,
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
      keepOpen: true,
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
                keepOpen: true,
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
                keepOpen: true,
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
  const anchors = graph?.anchoredBy === 'paths' ? (graph.anchorPaths ?? []) : []
  return [
    ...(tube() ? [] : liftItems()),
    ...(anchors.length > 1
      ? [
          { divider: true } as const,
          {
            label: graph?.referencePath
              ? `Draw x along: ${graph.referencePath}`
              : 'Draw x along',
            submenu: () =>
              anchors.map((a): MenuItem => ({
                label: a.name,
                radio: true,
                checked: graph?.referencePath === a.name,
                onClick: () => {
                  state.referencePath = a.name
                  reparse()
                },
              })),
          },
        ]
      : []),
  ]
}

const DOCS = 'https://github.com/cmdcolin/BandageJS'

function link(label: string, url: string, detail?: string): MenuItem {
  return {
    label: `${label} ↗`,
    detail,
    onClick: () => {
      window.open(url, '_blank', 'noopener')
    },
  }
}

export function helpItems(): MenuItem[] {
  return [
    {
      label: 'Reading the drawing, and controls',
      detail: 'Also the ? key',
      onClick: showHelp,
    },
    { divider: true },
    link('Genes and reference assemblies', `${DOCS}/blob/main/docs/genes.md`),
    link('README', `${DOCS}#readme`, 'Layouts, walks and figures'),
    link('Source on GitHub', DOCS),
    link('Report a problem', `${DOCS}/issues`),
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
