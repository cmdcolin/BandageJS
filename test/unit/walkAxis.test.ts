import { loadGraph, walkRows } from '@jbrowse/bandage-core'
import { expect, test } from '@playwright/test'

import { placeRowGenes, rowAxes, rowSpan } from '../../src/walkAxis'

// Five 10 bp reference nodes on chr1 from 1000, and a 5 bp node no reference
// walk passes
const GFA = [
  'H\tVN:Z:1.1',
  ...['a', 'b', 'c', 'd', 'e'].map(id => `S\t${id}\tAAAAAAAAAA`),
  'S\tx\tCCCCC',
  'W\tGRCh38\t0\tchr1\t1000\t1050\t>a>b>c>d>e',
  'W\tHG1\t1\tctg1\t500\t545\t>a>x>c>d>e',
  'W\tHG2\t2\tctg2\t100\t150\t<e<d<c<b<a',
  'W\tHG3\t1\tctg3\t0\t20\t>a>b',
  'W\tHG3\t1\tctg3\t30\t50\t>d>e',
].join('\n')

const region = { start: 1012, end: 1038 }

function setup() {
  const graph = loadGraph(GFA, 'test')
  const bars = walkRows(graph, region)!
  return { graph, bars, axes: rowAxes(graph, bars, region) }
}

const rowNamed = (bars: ReturnType<typeof setup>['bars'], name: string) =>
  bars.rows.find(r => r.name === name)!

test('a row starts where the walk leaves the last reference node before the window', () => {
  const { bars, axes } = setup()
  expect(rowNamed(bars, 'HG1#1#ctg1').bp).toBe(25)
  expect(axes.get('HG1#1#ctg1')).toEqual({
    contig: 'ctg1',
    start: 510,
    reversed: false,
  })
  expect(axes.get(bars.reference.name)).toEqual({
    contig: 'chr1',
    start: 1010,
    reversed: false,
  })
})

test('a walk against the reference reads its contig leftward along the row', () => {
  const { bars, axes } = setup()
  const axis = axes.get('HG2#2#ctg2')!
  expect(axis).toEqual({ contig: 'ctg2', start: 140, reversed: true })
  expect(rowSpan(axis, rowNamed(bars, 'HG2#2#ctg2').bp)).toEqual({
    start: 110,
    end: 140,
  })
})

test('a gap between pieces keeps the contig position linear along the row', () => {
  const { bars, axes } = setup()
  const row = rowNamed(bars, 'HG3#1#ctg3')
  expect(row.gapBp).toBe(10)
  expect(axes.get(row.name)).toEqual({
    contig: 'ctg3',
    start: 10,
    reversed: false,
  })
})

test('genes land at their contig offsets, those off the row dropped', () => {
  const { graph, bars } = setup()
  const gene = (name: string, refName: string, start: number, end: number) => ({
    name,
    refName,
    start,
    end,
    strand: 1,
    exons: [{ start, end }],
  })
  const placed = placeRowGenes(
    graph,
    bars,
    region,
    new Map([
      [
        'HG1#1#ctg1',
        [gene('C1', 'ctg1', 515, 525), gene('FAR', 'ctg1', 900, 910)],
      ],
      [
        'HG2#2#ctg2',
        [gene('C2', 'ctg2', 120, 130), gene('ELSEWHERE', 'chr9', 120, 130)],
      ],
    ]),
  )
  expect(placed.get('HG1#1#ctg1')).toEqual([
    { name: 'C1', start: 5, end: 15, exons: [{ start: 5, end: 15 }] },
  ])
  expect(placed.get('HG2#2#ctg2')).toEqual([
    { name: 'C2', start: 10, end: 20, exons: [{ start: 10, end: 20 }] },
  ])
})
