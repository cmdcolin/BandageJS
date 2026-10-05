import { expect, test } from '@playwright/test'

import {
  formatRegion,
  namesContig,
  parseLocation,
  shifted,
  within,
} from '../../src/region'

test('a region parses with commas, two dots or a single position', () => {
  expect(parseLocation('chr6:160,614,798-160,647,758')).toEqual({
    refName: 'chr6',
    start: 160_614_798,
    end: 160_647_758,
  })
  expect(parseLocation(' GRCh38#0#chr6:100..200 ')).toEqual({
    refName: 'GRCh38#0#chr6',
    start: 100,
    end: 200,
  })
  expect(parseLocation('chr6:160,614,798')).toEqual({
    refName: 'chr6',
    start: 160_614_798,
    end: 160_614_799,
  })
})

test('a region with its end first, or no contig, is not one', () => {
  expect(parseLocation('chr6:200-100')).toBeUndefined()
  expect(parseLocation('LPA')).toBeUndefined()
  expect(parseLocation(':1-2')).toBeUndefined()
  expect(parseLocation('')).toBeUndefined()
})

test('a region formats with grouped digits', () => {
  expect(
    formatRegion({ refName: 'chr6', start: 160614798, end: 160647758 }),
  ).toBe('chr6:160,614,798-160,647,758')
  expect(formatRegion({ refName: 'chr', start: 0, end: 999 })).toBe('chr:0-999')
})

test('a bare contig names its PanSN contig', () => {
  expect(namesContig('chr6', 'GRCh38#0#chr6')).toBe(true)
  expect(namesContig('GRCh38#0#chr6', 'GRCh38#0#chr6')).toBe(true)
  expect(namesContig('chr6', 'chr6')).toBe(true)
  expect(namesContig('chr5', 'GRCh38#0#chr6')).toBe(false)
})

test('a step moves half a window and stops at the start', () => {
  const r = { refName: 'chr6', start: 1000, end: 2000 }
  expect(shifted(r, 0.5)).toEqual({ refName: 'chr6', start: 1500, end: 2500 })
  expect(shifted(r, -0.5)).toEqual({ refName: 'chr6', start: 500, end: 1500 })
  expect(shifted({ ...r, start: 200, end: 1200 }, -0.5)).toEqual({
    refName: 'chr6',
    start: 0,
    end: 1000,
  })
})

test('within needs the same contig and the inner span inside the outer', () => {
  const outer = { refName: 'GRCh38#0#chr6', start: 1000, end: 2000 }
  expect(within({ refName: 'chr6', start: 1000, end: 2000 }, outer)).toBe(true)
  expect(within({ refName: 'chr6', start: 1500, end: 2001 }, outer)).toBe(false)
  expect(within({ refName: 'chr5', start: 1500, end: 1600 }, outer)).toBe(false)
})
