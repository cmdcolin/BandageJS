import { expect, test } from '@playwright/test'

import { hubFrom } from '../../src/hubConfig'
import { cutTrack, regionLink } from '../../src/jbrowse'

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
