import { expect, test } from '@playwright/test'

import { cutsWholeWalks, settings } from '../../src/state'

test('a gbz cut follows whole walks for walk rows, as the layout or under it', () => {
  const was = { ...settings }
  settings.mode = 'force'
  settings.walkStrip = false
  expect(cutsWholeWalks()).toBe(false)
  settings.walkStrip = true
  expect(cutsWholeWalks()).toBe(true)
  settings.walkStrip = false
  settings.mode = 'walkrows'
  expect(cutsWholeWalks()).toBe(true)
  // the strip draws nothing under a tube map, so asks for no larger cut
  settings.mode = 'tubemap'
  settings.walkStrip = true
  expect(cutsWholeWalks()).toBe(false)
  Object.assign(settings, was)
})
