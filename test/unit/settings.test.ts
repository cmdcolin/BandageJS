import { expect, test } from '@playwright/test'

import { DEFAULTS, validSettings } from '../../src/settings'

test('validSettings keeps stored values that are choices this build offers', () => {
  const saved = {
    mode: 'variants',
    colorScheme: 'reference-position',
    nodeWidth: 'uniform',
    quality: 0,
    bubbleSpread: 'open',
    showBubbles: false,
    showDeletionEdges: true,
    drawPaths: true,
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
    }),
  ).toEqual({ ...DEFAULTS, drawPaths: true })
})

test('validSettings falls back to the defaults for anything but an object', () => {
  for (const raw of [null, undefined, 'force', 3, []]) {
    expect(validSettings(raw)).toEqual(DEFAULTS)
  }
})
