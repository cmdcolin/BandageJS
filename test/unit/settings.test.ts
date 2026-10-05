import { expect, test } from '@playwright/test'

import {
  DEFAULTS,
  changedSettings,
  readSettingsParams,
  settingsParams,
  upgraded,
  validSettings,
} from '../../src/settings'

test('validSettings keeps stored values that are choices this build offers', () => {
  const saved = {
    mode: 'walkrows',
    colorScheme: 'reference-position',
    nodeWidth: 'uniform',
    engine: 'stress',
    quality: 0,
    bubbleSpread: 'open',
    showBubbles: false,
    showDeletionEdges: true,
    drawPaths: true,
    showGenes: false,
    walkStrip: true,
    facet: 'sample',
    facetColumns: 2,
    spacing: 2,
    componentSeparation: 3,
    nodeThickness: 10,
  }
  expect(validSettings(saved)).toEqual(saved)
})

test('validSettings replaces each unknown value with its default', () => {
  expect(
    validSettings({
      mode: 'bogus',
      colorScheme: 7,
      nodeWidth: 'depth',
      engine: 'ogdf',
      quality: 9,
      bubbleSpread: null,
      showBubbles: 'yes',
      drawPaths: true,
      showGenes: 1,
      facet: 'rows',
      facetColumns: -2,
      spacing: 3,
      componentSeparation: '1',
      nodeThickness: 0,
    }),
  ).toEqual({ ...DEFAULTS, drawPaths: true })
})

test('validSettings falls back to the defaults for anything but an object', () => {
  for (const raw of [null, undefined, 'force', 3, []]) {
    expect(validSettings(raw)).toEqual(DEFAULTS)
  }
})

test('only settings that differ from the defaults are saved', () => {
  expect(changedSettings(DEFAULTS)).toEqual({})
  expect(
    changedSettings({ ...DEFAULTS, spacing: 2, showDeletionEdges: false }),
  ).toEqual({ spacing: 2, showDeletionEdges: false })
})

test('a record saved before the format takes the defaults of its time', () => {
  const nineKeys = {
    mode: 'force',
    colorScheme: 'auto',
    nodeWidth: 'depth',
    quality: 2,
    bubbleSpread: 'auto',
    showBubbles: true,
    showDeletionEdges: false,
    drawPaths: false,
    showGenes: false,
  }
  expect(validSettings(upgraded(nineKeys))).toEqual({
    ...DEFAULTS,
    showGenes: false,
  })
})

test('a record in the format keeps the bubbles it was saved with', () => {
  expect(validSettings(upgraded({ format: 2, showBubbles: true }))).toEqual({
    ...DEFAULTS,
    showBubbles: true,
  })
})

test('a record in the format keeps deletion edges off when saved off', () => {
  expect(
    validSettings(upgraded({ format: 2, showDeletionEdges: false })),
  ).toEqual({ ...DEFAULTS, showDeletionEdges: false })
})

test('a link names the layout and whatever else differs from the defaults', () => {
  expect(settingsParams(DEFAULTS)).toEqual([['layout', 'force']])
  expect(
    settingsParams({
      ...DEFAULTS,
      mode: 'ordered',
      colorScheme: 'depth',
      showBubbles: false,
      walkStrip: true,
      facet: 'walk',
      facetColumns: 2,
      spacing: 0.5,
    }),
  ).toEqual([
    ['layout', 'ordered'],
    ['color', 'depth'],
    ['bubbles', '0'],
    ['bars', '1'],
    ['facet', 'walk'],
    ['columns', '2'],
    ['spacing', '0.5'],
  ])
})

test('a link sets the settings it names and leaves the rest', () => {
  const s = { ...DEFAULTS, nodeThickness: 10 }
  readSettingsParams(
    new URLSearchParams(
      'layout=ordered&color=depth&genes=0&bars=true&columns=3&thickness=bogus&quality=4',
    ),
    s,
  )
  expect(s).toEqual({
    ...DEFAULTS,
    mode: 'ordered',
    colorScheme: 'depth',
    showGenes: false,
    walkStrip: true,
    facetColumns: 3,
    nodeThickness: 10,
    quality: 4,
  })
})

test('every setting a link states comes back as it went', () => {
  const s = {
    ...DEFAULTS,
    mode: 'walkrows' as const,
    colorScheme: 'reference-position' as const,
    nodeWidth: 'uniform' as const,
    engine: 'stress' as const,
    quality: 0,
    bubbleSpread: 'open' as const,
    showBubbles: false,
    showDeletionEdges: false,
    drawPaths: true,
    showGenes: false,
    walkStrip: true,
    facet: 'sample' as const,
    facetColumns: 2,
    spacing: 2,
    componentSeparation: 3,
    nodeThickness: 10,
  }
  const back = { ...DEFAULTS }
  readSettingsParams(new URLSearchParams(settingsParams(s)), back)
  expect(back).toEqual(s)
})
