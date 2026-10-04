import { expect, test } from '@playwright/test'

import { aimedAt } from '../../src/submenuAim'

// a menu whose edge is at x=200, with its submenu at x 200..400, y 0..300
const panel = { left: 200, right: 400, top: 0, bottom: 300 }
const apex = { x: 100, y: 10 }
const aimed = (x: number, y: number) => aimedAt({ x, y }, apex, panel)

test('a diagonal across the rows between stays aimed', () => {
  expect(aimed(150, 100)).toBe(true)
})

test('heading down or up the menu, or away, is not aimed', () => {
  expect(aimed(100, 100)).toBe(false)
  expect(aimed(100, 0)).toBe(false)
  expect(aimed(60, 40)).toBe(false)
})

test('the cone narrows toward its tip', () => {
  expect(aimed(110, 40)).toBe(false)
  expect(aimed(190, 40)).toBe(true)
})

test('the corners of the near edge are aimed', () => {
  expect(aimed(200, 0)).toBe(true)
  expect(aimed(200, 300)).toBe(true)
})

test('past the near edge but off the panel is not aimed', () => {
  expect(aimed(300, 400)).toBe(false)
  expect(aimed(300, -100)).toBe(false)
})

test('a submenu on the left is aimed at leftward', () => {
  const left = { left: -200, right: 0, top: 0, bottom: 300 }
  expect(aimedAt({ x: 50, y: 100 }, apex, left)).toBe(true)
  expect(aimedAt({ x: 150, y: 100 }, apex, left)).toBe(false)
})

test('a submenu raised above its row opens the cone upward', () => {
  const raised = { left: 200, right: 400, top: -300, bottom: 20 }
  expect(aimedAt({ x: 150, y: -100 }, apex, raised)).toBe(true)
  expect(aimedAt({ x: 150, y: 100 }, apex, raised)).toBe(false)
})
