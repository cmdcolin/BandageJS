import { expect, test } from '@playwright/test'

import { ago, geneText, genesOn, needs } from '../../src/describe'

test('needs picks the Needs sentence out of a layout description', () => {
  expect(
    needs(
      'x is reference bp, one row per stable rank. Needs rGFA tags or a reference path.',
    ),
  ).toBe('Needs rGFA tags or a reference path.')
})

test('needs has a fallback for a description without one', () => {
  expect(needs('Always available.')).toBe('Not available for this graph')
})

test('ago says just now under a minute, else the nearest unit', () => {
  const now = Date.UTC(2026, 0, 10)
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
  const minute = 60_000
  expect(ago(now - 30_000, now)).toBe('just now')
  expect(ago(now - 5 * minute, now)).toBe(rtf.format(-5, 'minute'))
  expect(ago(now - 3 * 60 * minute, now)).toBe(rtf.format(-3, 'hour'))
  expect(ago(now - 2 * 24 * 60 * minute, now)).toBe(rtf.format(-2, 'day'))
})

test('geneText gives the span 1-based with the strand, and says when it runs past the cut', () => {
  const gene = {
    name: 'LPA',
    refName: 'chr6',
    start: 160_531_481,
    end: 160_664_275,
    strand: -1,
    exons: [],
  }
  expect(geneText(gene)).toBe(
    `LPA\nchr6:${(160_531_482).toLocaleString()}-${(160_664_275).toLocaleString()}, − strand`,
  )
  expect(geneText({ ...gene, strand: 0 }, 0.5)).toBe(
    `LPA\nchr6:${(160_531_482).toLocaleString()}-${(160_664_275).toLocaleString()}\nRuns past the cut`,
  )
})

test('genesOn names the genes over a backbone node and its exons in them', () => {
  const refName = 'GRCh38#0#chr6'
  const lpa = {
    name: 'LPA',
    refName,
    start: 100,
    end: 900,
    strand: -1,
    exons: [
      { start: 100, end: 150 },
      { start: 400, end: 450 },
      { start: 480, end: 520 },
    ],
  }
  const node = (start: number, length: number, rank = 0) => ({
    id: 'n',
    name: 'n',
    length,
    depth: 1,
    stable: { refName, start, rank },
  })
  expect(genesOn(node(390, 100), [lpa])).toEqual([{ name: 'LPA', exons: 2 }])
  expect(genesOn(node(200, 100), [lpa])).toEqual([{ name: 'LPA', exons: 0 }])
  expect(genesOn(node(900, 100), [lpa])).toEqual([])
  expect(genesOn(node(390, 100, 1), [lpa])).toEqual([])
})
