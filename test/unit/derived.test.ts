import { loadGraph } from '@jbrowse/bandage-core'
import { expect, test } from '@playwright/test'

import { memo, walkLabelsOf, walkView } from '../../src/derived'

test('memo recomputes only when a key changes identity', () => {
  let calls = 0
  const f = memo((a: object, n: number) => {
    calls++
    return { a, n }
  })
  const key = {}
  const first = f(key, 1)
  expect(f(key, 1)).toBe(first)
  expect(calls).toBe(1)
  expect(f({}, 1)).not.toBe(first)
  expect(f({}, 1)).not.toBe(first)
  expect(calls).toBe(3)
  f(key, 2)
  expect(calls).toBe(4)
})

test('walkLabelsOf keeps distinct labels and numbers repeats in label order', () => {
  const labels = walkLabelsOf([
    { name: 'HG002#1#chr6:10-20', label: 'HG002#1' },
    { name: 'CHM13#0#chr6', label: 'CHM13' },
    { name: 'HG002#1#chr6:30-40', label: 'HG002#1' },
    { name: 'HG002#1#chr6:50-60', label: 'HG002#1' },
  ])
  expect([...labels]).toEqual([
    ['CHM13#0#chr6', 'CHM13'],
    ['HG002#1#chr6:10-20', 'HG002#1'],
    ['HG002#1#chr6:30-40', 'HG002#1 (2)'],
    ['HG002#1#chr6:50-60', 'HG002#1 (3)'],
  ])
})

test('walkLabelsOf of no walks is empty', () => {
  expect(walkLabelsOf([]).size).toBe(0)
})

const WALKS = [
  'S\tv1\tAAAA',
  'S\tv2\tCC',
  'S\tv3\tGGG',
  'S\ta1\tTTTTTT',
  'L\tv1\t+\tv2\t+\t0M',
  'L\tv2\t+\tv3\t+\t0M',
  'L\tv1\t+\ta1\t+\t0M',
  'L\ta1\t+\tv3\t+\t0M',
  'W\tref\t0\tchr\t0\t9\t>v1>v2>v3',
  'W\talt\t1\tchr\t0\t13\t>v1>a1>v3',
].join('\n')

test('walkView lifts walks as lanes, and side by side a lift of each alone', () => {
  const graph = loadGraph(WALKS, 'walks', { referencePath: 'ref' })
  const layers = [{ walk: 'ref#0#chr' }, { walk: 'alt#1#chr' }]
  const lanes = walkView(graph, layers, undefined, false, 'none')
  expect(lanes.lift!.walks.map(w => w.encoding.field)).toEqual(['walk', 'walk'])
  expect(lanes.panels).toBeUndefined()
  const facets = walkView(graph, layers, undefined, false, 'walk')
  expect(
    facets.panels!.map(p => [p.walks[0]!.name, p.walks[0]!.encoding]),
  ).toEqual([
    ['ref#0#chr', { field: 'progress', scheme: 'red' }],
    ['alt#1#chr', { field: 'progress', scheme: 'red' }],
  ])
  expect(
    walkView(graph, [{ walk: 'alt#1#chr' }], undefined, false, 'walk').panels,
  ).toBeUndefined()
  expect(walkView(graph, layers, undefined, true, 'walk')).toEqual({
    lift: undefined,
    panels: undefined,
  })
})
