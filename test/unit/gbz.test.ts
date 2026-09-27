import { expect, test } from '@playwright/test'

import { parseRegion } from '../../src/gbz'

test('parseRegion reads a region with thousands separators', () => {
  expect(parseRegion('chr6:160,614,798-160,647,758')).toEqual({
    refName: 'chr6',
    start: 160_614_798,
    end: 160_647_758,
  })
})

test('parseRegion ignores surrounding whitespace', () => {
  expect(parseRegion('  chr1:100-200\n')).toEqual({
    refName: 'chr1',
    start: 100,
    end: 200,
  })
})

test('parseRegion rejects a string that is not a region', () => {
  expect(() => parseRegion('chr6 160000')).toThrow(/is not a region/)
  expect(() => parseRegion('')).toThrow(/is not a region/)
})
