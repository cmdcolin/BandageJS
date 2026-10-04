import { expect, test } from '@playwright/test'

import {
  DEFAULTS,
  changedSettings,
  upgraded,
  validSettings,
} from '../../src/settings'

test('validSettings keeps stored values that are choices this build offers', () => {
  const saved = {
    mode: 'walkrows',
    colorScheme: 'reference-position',
    nodeWidth: 'uniform',
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

test('a record saved whole takes the deletion edges default it predates', () => {
  const whole = {
    mode: 'force',
    colorScheme: 'auto',
    nodeWidth: 'depth',
    quality: 2,
    bubbleSpread: 'auto',
    showBubbles: true,
    showDeletionEdges: false,
    drawPaths: false,
    showGenes: false,
    walkStrip: false,
    facet: 'none',
    facetColumns: 0,
  }
  expect(validSettings(upgraded(whole))).toEqual({
    ...DEFAULTS,
    showGenes: false,
  })
  expect(validSettings(upgraded({ showDeletionEdges: false }))).toEqual({
    ...DEFAULTS,
    showDeletionEdges: false,
  })
})
