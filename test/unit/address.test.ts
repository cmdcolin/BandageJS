import { expect, test } from '@playwright/test'

import { formatView, parseView } from '../../src/address'

test('a view goes into a link short and comes back as it went', () => {
  const view = { x: 1234.56789, y: -0.000123456789, scale: 2.5 }
  expect(formatView(view)).toBe('1234.57,-0.000123457,2.5')
  expect(parseView(formatView(view))).toEqual({
    x: 1234.57,
    y: -0.000123457,
    scale: 2.5,
  })
})

test('a view that is not three finite numbers with a positive zoom is ignored', () => {
  expect(parseView(null)).toBeUndefined()
  expect(parseView('')).toBeUndefined()
  expect(parseView('1,2')).toBeUndefined()
  expect(parseView('1,2,0')).toBeUndefined()
  expect(parseView('1,2,-3')).toBeUndefined()
  expect(parseView('a,2,3')).toBeUndefined()
  expect(parseView('1,2,3')).toEqual({ x: 1, y: 2, scale: 3 })
})
