import { expect, test } from '@playwright/test'

import { linkSides, nodeLinks, walksThrough } from '../../src/nodeDetails'

import type { Graph } from '@jbrowse/bandage-core'

const node = (id: string, length: number) => ({
  id,
  name: id,
  length,
  depth: 1,
})

test('linkSides reads a flipped strand as the other end', () => {
  expect(linkSides({ from: 'a', to: 'b' })).toEqual({
    from: 'end',
    to: 'start',
  })
  expect(
    linkSides({ from: 'a', to: 'b', fromStrand: '-', toStrand: '-' }),
  ).toEqual({ from: 'start', to: 'end' })
  expect(
    linkSides({ from: 'a-', to: 'b', fromStrand: '-', toStrand: '+' }),
  ).toEqual({ from: 'end', to: 'start' })
})

test('nodeLinks groups a node’s neighbours by the end they join', () => {
  const graph: Graph = {
    name: 'g',
    nodes: [node('a', 5), node('b', 3), node('c', 4)],
    edges: [
      { from: 'a', to: 'b' },
      { from: 'b', to: 'c', fromStrand: '+', toStrand: '-' },
      { from: 'b', to: 'b', fromStrand: '+', toStrand: '+' },
    ],
  }
  expect(nodeLinks(graph, 'b')).toEqual({
    start: [
      { edgeIndex: 0, nodeId: 'a', side: 'end' },
      { edgeIndex: 2, nodeId: 'b', side: 'end' },
    ],
    end: [
      { edgeIndex: 1, nodeId: 'c', side: 'end' },
      { edgeIndex: 2, nodeId: 'b', side: 'start' },
    ],
  })
})

test('nodeLinks reads a node drawn reversed by its drawn ends, and a hairpin once', () => {
  const graph: Graph = {
    name: 'g',
    nodes: [node('3+', 5), node('65-', 3)],
    edges: [
      { from: '3+', to: '65-', fromStrand: '+', toStrand: '-' },
      { from: '3+', to: '65-', fromStrand: '+', toStrand: '-' },
      { from: '65-', to: '65-', fromStrand: '-', toStrand: '+' },
    ],
  }
  expect(nodeLinks(graph, '65-')).toEqual({
    start: [{ edgeIndex: 0, nodeId: '3+', side: 'end' }],
    end: [{ edgeIndex: 2, nodeId: '65-', side: 'end' }],
  })
})

test('walksThrough places a node on each walk’s own contig', () => {
  const graph: Graph = {
    name: 'g',
    nodes: [node('a', 5), node('b', 3), node('c', 4)],
    edges: [],
    paths: [
      {
        name: 'x#1#chr',
        nodeIds: ['a', 'b', 'c', 'b'],
        start: 100,
        contig: 'chr',
      },
      { name: 'y#1#ctg:10-22', nodeIds: ['c', 'b'], start: 10 },
      { name: 'z', nodeIds: ['a', 'c'] },
    ],
  }
  graph.pathVisits = new Map([
    [
      'b',
      [
        { path: 'x#1#chr', sample: 'x', start: 105, strand: '-' as const },
        { path: 'y#1#ctg', sample: 'y', start: 14, strand: '+' as const },
      ],
    ],
  ])
  const length = (id: string) => graph.nodes.find(n => n.id === id)!.length
  expect(walksThrough(graph, graph.nodes[1]!, length)).toEqual([
    {
      name: 'x#1#chr',
      visits: 2,
      at: { contig: 'chr', start: 105, end: 108 },
      strand: '-',
    },
    {
      name: 'y#1#ctg:10-22',
      visits: 1,
      at: { contig: 'y#1#ctg', start: 14, end: 17 },
      strand: '+',
    },
  ])
})
