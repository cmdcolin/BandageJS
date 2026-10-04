import { expect, test } from '@playwright/test'

import { hubFrom, withOverlay } from '../../src/hubConfig'
import { cutTrack, nodeLink, regionLink, rowLink } from '../../src/jbrowse'

import type { GraphNode, WalkRow } from '@jbrowse/bandage-core'

const DB = 'https://s3/x.gbz.db'
const adapter = { type: 'GbzBaseSyntenyAdapter', uri: DB }

function target(tracks: object[]) {
  const hub = hubFrom(
    {
      plugins: [{ name: 'GraphGenomeView' }],
      assemblies: [{ name: 'hg38' }, { name: 'HG00097.1' }],
      tracks,
    },
    'https://example.org/config.json',
  )
  return { host: 'https://jbrowse.example/', hub, assembly: hub.assemblies[0]! }
}

function lanesIn(link: string) {
  const spec = JSON.parse(decodeURIComponent(link.split('session=spec-')[1]!))
  return spec.views[0].tracks.find(
    (x: { type?: string }) => x.type === 'MultiWaySyntenyDisplay',
  )?.trackId
}

const region = { refName: 'chr1', start: 0, end: 100 }

test('the lanes are the gbz GraphTrack when the hub has no SyntenyTrack', () => {
  const t = target([
    { type: 'GraphTrack', trackId: 'lanes', assemblyNames: ['hg38'], adapter },
  ])
  expect(cutTrack(t, DB)?.trackId).toBe('lanes')
  expect(lanesIn(regionLink(t, region, ['HG00097']))).toBe('lanes')
})

test('a gbz SyntenyTrack is the lanes over a gbz GraphTrack beside it', () => {
  const t = target([
    { type: 'GraphTrack', trackId: 'graph', assemblyNames: ['hg38'], adapter },
    {
      type: 'SyntenyTrack',
      trackId: 'lanes',
      assemblyNames: ['hg38'],
      adapter,
    },
  ])
  expect(cutTrack(t, DB)?.trackId).toBe('lanes')
  expect(lanesIn(regionLink(t, region, ['HG00097']))).toBe('lanes')
})

const geneTrack = (trackId: string) => ({
  type: 'FeatureTrack',
  trackId,
  assemblyNames: ['HG00097#1'],
  adapter: { type: 'Gff3TabixAdapter', uri: `https://x/${trackId}.gff.gz` },
})

function tracksIn(link: string | undefined) {
  const spec = JSON.parse(decodeURIComponent(link!.split('session=spec-')[1]!))
  return spec.views[0].tracks
}

test("a haplotype's links open the gene track the hub's overlay chose", () => {
  const hub = withOverlay(
    hubFrom(
      {
        assemblies: [{ name: 'hg38' }, { name: 'HG00097#1' }],
        tracks: [geneTrack('first'), geneTrack('chosen')],
      },
      'https://example.org/config.json',
    ),
    { genes: { 'HG00097#1': 'chosen' } },
  )
  const t = {
    host: 'https://jbrowse.example/',
    hub,
    assembly: hub.assemblies[0]!,
  }
  const node: GraphNode = {
    id: 'n',
    name: 'n',
    length: 10,
    depth: 1,
    stable: { refName: 'HG00097#1#chr1', start: 5000, rank: 1 },
  }
  const row = {
    name: 'HG00097#1#chr1',
    sample: 'HG00097',
    haplotype: 1,
    bp: 100,
    axis: { contig: 'chr1', start: 5000, reversed: false },
  } as WalkRow
  expect(tracksIn(nodeLink(node, t))).toEqual(['chosen'])
  expect(tracksIn(rowLink(row, false, t))).toEqual(['chosen'])
})
