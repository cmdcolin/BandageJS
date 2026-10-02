import { expect, test } from '@playwright/test'

import { bedGenes } from '../../src/tabixGenes'

const bed = (name: string, start: number, end: number) =>
  `ctg\t${start}\t${end}\t${name}\t0\t+`

test("a name's overlapping records merge and its copies stay apart", () => {
  const genes = bedGenes([
    bed('AMY1A', 100, 200),
    bed('AMY1A', 150, 260),
    bed('AMY2A', 300, 400),
    bed('AMY1A', 1000, 1100),
  ])
  expect(genes.map(g => [g.name, g.start, g.end])).toEqual([
    ['AMY1A', 100, 260],
    ['AMY2A', 300, 400],
    ['AMY1A', 1000, 1100],
  ])
  expect(genes[0]!.exons).toEqual([{ start: 100, end: 260 }])
})
