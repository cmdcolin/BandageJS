import { expect, test } from '@playwright/test'

import { memo, walkLabelsOf } from '../../src/derived'

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
