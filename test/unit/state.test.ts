import { expect, test } from '@playwright/test'

import {
  clearInteraction,
  cutsWholeWalks,
  settings,
  state,
} from '../../src/state'

test('a graph opened or a bubble popped selects neither a node nor a row', () => {
  state.selectedNode = 'n1'
  state.selectedRow = 'HG00097#1#chr6'
  clearInteraction()
  expect(state.selectedNode).toBeNull()
  expect(state.selectedRow).toBeNull()
})

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
