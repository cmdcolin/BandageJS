import { expect, test } from '@playwright/test'

import {
  ago,
  geneText,
  genesOn,
  needs,
  nodeHtml,
  recentDetail,
} from '../../src/describe'

test('a recent graph says where it came from and the assembly declared for it', () => {
  const now = Date.UTC(2026, 0, 10)
  const r = {
    kind: 'url' as const,
    url: 'https://example.org/graphs/bare.gfa',
    name: 'bare.gfa',
    at: now - 10_000,
    declared: { chr6: { assembly: 'hg38' } },
  }
  expect(recentDetail(r, 'https://page.example/', now)).toBe(
    'example.org on hg38 · just now',
  )
  expect(
    recentDetail({ ...r, declared: undefined }, 'https://page.example/', now),
  ).toBe('example.org · just now')
})

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
  expect(genesOn(node(390, 100), [lpa])).toEqual([
    { name: 'LPA', exons: 2, spliced: true },
  ])
  expect(genesOn(node(200, 100), [lpa])).toEqual([
    { name: 'LPA', exons: 0, spliced: true },
  ])
  expect(genesOn(node(900, 100), [lpa])).toEqual([])
  expect(genesOn(node(390, 100, 1), [lpa])).toEqual([])
})

test('nodeHtml lists three genes over a node and counts the rest', () => {
  const refName = 'chr'
  const gene = (name: string, exons: { start: number; end: number }[]) => ({
    name,
    refName,
    start: 0,
    end: 100,
    strand: 1,
    exons,
  })
  const html = nodeHtml(
    {
      id: 'n',
      name: 'n',
      length: 100,
      depth: 1,
      stable: { refName, start: 0, rank: 0 },
    },
    [
      gene('aaa', [{ start: 0, end: 100 }]),
      gene('bbb', [
        { start: 0, end: 10 },
        { start: 50, end: 60 },
      ]),
      gene('ccc', []),
      gene('ddd', [{ start: 0, end: 100 }]),
      gene('eee', [{ start: 0, end: 100 }]),
    ],
  )
  expect(html).toContain('<em>aaa</em><br>')
  expect(html).toContain('<em>bbb</em>: 2 exons here')
  expect(html).toContain('<em>ccc</em>: intron here')
  expect(html).not.toContain('ddd')
  expect(html).toContain('+2 more genes')
})
