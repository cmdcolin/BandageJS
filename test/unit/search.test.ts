import { FIT_PADDING } from '@jbrowse/bandage-core'
import { expect, test } from '@playwright/test'

import {
  MAX_FIND_ZOOM,
  NODE_SHARE,
  findNodes,
  frameScale,
} from '../../src/search'

const nodes = ['s10', 'S1', 's100', 'as1', 'x', 's1b'].map(name => ({ name }))
const names = (found: { name: string }[]) => found.map(n => n.name)

test('findNodes ranks exact, then prefix, then contains, ignoring case', () => {
  expect(names(findNodes(nodes, 's1'))).toEqual([
    'S1',
    's10',
    's100',
    's1b',
    'as1',
  ])
})

test('findNodes trims the query and finds nothing for a blank one', () => {
  expect(names(findNodes(nodes, '  X '))).toEqual(['x'])
  expect(findNodes(nodes, '   ')).toEqual([])
  expect(findNodes(nodes, 'nope')).toEqual([])
})

test('findNodes stops at the limit, keeping the best matches', () => {
  expect(names(findNodes(nodes, 's1', 2))).toEqual(['S1', 's10'])
  expect(names(findNodes(nodes, '1', 3))).toEqual(['s10', 'S1', 's100'])
  expect(findNodes(nodes, 's1', 0)).toEqual([])
})

test('findNodes keeps a full prefix tier out of the contains tier', () => {
  const many = ['ab1', 'ab2', 'ab3', 'cab'].map(name => ({ name }))
  expect(names(findNodes(many, 'ab', 2))).toEqual(['ab1', 'ab2'])
})

const usable = (px: number) => (px - FIT_PADDING * 2) * NODE_SHARE

test('frameScale gives the node its share of the tighter axis', () => {
  expect(frameScale({ w: 100, h: 10 }, 1080, 480, false)).toBeCloseTo(
    usable(1080) / 100,
  )
  expect(frameScale({ w: 10, h: 100 }, 1080, 480, false)).toBeCloseTo(
    usable(480) / 100,
  )
})

test('frameScale ignores the height of pixel rows', () => {
  expect(frameScale({ w: 100, h: 1000 }, 1080, 480, true)).toBeCloseTo(
    usable(1080) / 100,
  )
})

test('frameScale caps the zoom for a tiny node', () => {
  expect(frameScale({ w: 0.5, h: 0 }, 1080, 480, false)).toBe(MAX_FIND_ZOOM)
  expect(frameScale({ w: 0, h: 0 }, 1080, 480, false)).toBe(MAX_FIND_ZOOM)
})

test('frameScale never zooms out past the fit', () => {
  expect(frameScale({ w: 1e6, h: 0 }, 1080, 480, true, 0.01)).toBe(0.01)
  expect(frameScale({ w: 0, h: 0 }, 1080, 480, true, 20)).toBe(20)
})
