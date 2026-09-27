import { expect, test } from '@playwright/test'
import { backboneAssembly } from '@jbrowse/bandage-core'

import { aliasRows, geneTracks, hubFrom, namesFor } from '../../src/hubConfig'

const URL = 'https://example.org/hubs/demo/config.json'

const config = {
  assemblies: [
    {
      name: 'hg38',
      aliases: ['GRCh38'],
      refNameAliases: {
        adapter: { type: 'RefNameAliasAdapter', uri: 'hg38.chromAlias.txt' },
      },
    },
    { name: 'HG00097.1', aliases: ['HG00097#1'] },
    { name: 'hs1', displayName: 'T2T CHM13v2.0/hs1' },
    { name: 'GCF_000005845.2' },
  ],
  plugins: [{ name: 'GraphGenomeView', esmUrl: 'x.js' }],
  defaultSession: {
    views: [{ type: 'LinearGenomeView', init: { tracks: ['hs1-default'] } }],
  },
  tracks: [
    {
      type: 'AlignmentsTrack',
      trackId: 'alleles',
      assemblyNames: ['hg38'],
      adapter: { type: 'BedTabixAdapter', uri: 'alleles.bed.gz' },
    },
    {
      type: 'FeatureTrack',
      trackId: 'bubbles',
      assemblyNames: ['hg38'],
      adapter: { type: 'BedTabixAdapter', uri: 'bubbles.bed.gz' },
    },
    {
      type: 'FeatureTrack',
      trackId: 'hg38_ncbiRefSeq',
      name: 'NCBI RefSeq genes',
      assemblyNames: ['hg38'],
      adapter: {
        type: 'Gff3TabixAdapter',
        uri: 'https://genes.example.org/ncbiRefSeq.gff.gz',
        csi: true,
      },
    },
    {
      type: 'FeatureTrack',
      trackId: 'HG00097.1_cat_genes',
      assemblyNames: ['HG00097.1'],
      adapter: { type: 'BedTabixAdapter', uri: 'genes/HG00097.1.bed.gz' },
    },
    {
      type: 'FeatureTrack',
      trackId: 'hs1-gff',
      name: 'RefSeq All (GFF)',
      assemblyNames: ['hs1'],
      adapter: {
        type: 'Gff3TabixAdapter',
        gffGzLocation: { uri: 'hs1.gff.gz', locationType: 'UriLocation' },
        index: { location: { uri: 'hs1.gff.gz.csi' }, indexType: 'CSI' },
      },
    },
    {
      type: 'FeatureTrack',
      trackId: 'hs1-default',
      name: 'Repeats',
      assemblyNames: ['hs1'],
      adapter: {
        type: 'BedTabixAdapter',
        bedGzLocation: { uri: 'repeats.bed.gz' },
      },
    },
    {
      type: 'FeatureTrack',
      trackId: 'hs1-bigbed',
      assemblyNames: ['hs1'],
      adapter: { type: 'BigBedAdapter', uri: 'genes.bb' },
    },
    {
      type: 'SyntenyTrack',
      trackId: 'lanes',
      assemblyNames: ['hg38', 'HG00097.1'],
      adapter: { type: 'GbzBaseSyntenyAdapter', uri: 'https://s3/x.gbz.db' },
    },
  ],
}

test('hubFrom reads assemblies, gene sources and gbz tracks', () => {
  const hub = hubFrom(config, URL)
  expect(hub.assemblies.map(a => a.name)).toEqual([
    'hg38',
    'HG00097.1',
    'hs1',
    'GCF_000005845.2',
  ])
  expect(hub.assemblies[0]!.refNameAliases).toBe(
    'https://example.org/hubs/demo/hg38.chromAlias.txt',
  )
  expect(hub.plugins).toEqual(['GraphGenomeView'])
  expect(hub.defaultTracks).toEqual(['hs1-default'])
  const byId = new Map(hub.tracks.map(t => [t.trackId, t]))
  expect(byId.get('alleles')!.genes).toBeUndefined()
  expect(byId.get('hs1-bigbed')!.genes).toBeUndefined()
  expect(byId.get('hg38_ncbiRefSeq')!.genes).toEqual({
    format: 'gff3',
    file: 'https://genes.example.org/ncbiRefSeq.gff.gz',
    index: 'https://genes.example.org/ncbiRefSeq.gff.gz.csi',
    indexType: 'CSI',
  })
  expect(byId.get('HG00097.1_cat_genes')!.genes).toEqual({
    format: 'bed',
    file: 'https://example.org/hubs/demo/genes/HG00097.1.bed.gz',
    index: 'https://example.org/hubs/demo/genes/HG00097.1.bed.gz.tbi',
    indexType: 'TBI',
  })
  expect(byId.get('hs1-gff')!.genes).toEqual({
    format: 'gff3',
    file: 'https://example.org/hubs/demo/hs1.gff.gz',
    index: 'https://example.org/hubs/demo/hs1.gff.gz.csi',
    indexType: 'CSI',
  })
  expect(byId.get('lanes')!.gbz).toBe('https://s3/x.gbz.db')
})

test('hubFrom takes a single-assembly config and refuses one with none', () => {
  expect(
    hubFrom({ assembly: { name: 'x' }, tracks: [] }, URL).assemblies,
  ).toHaveLength(1)
  expect(() => hubFrom({ tracks: [] }, URL)).toThrow(/names no assemblies/)
  expect(() => hubFrom([], URL)).toThrow(/not a JBrowse config/)
})

test("a hub's assemblies bind by name, alias or the sample UCSC names", () => {
  const hub = hubFrom(config, URL)
  const bound = (prefixes: string[]) =>
    backboneAssembly({ contigs: [], prefixes, named: true }, hub.assemblies)
      ?.name
  expect(bound(['GRCh38', 'GRCh38#0'])).toBe('hg38')
  expect(bound(['grch38'])).toBe('hg38')
  expect(bound(['CHM13', 'CHM13#0'])).toBe('hs1')
  expect(bound(['HG00097', 'HG00097#1'])).toBe('HG00097.1')
  expect(bound(['HG00097', 'HG00097#2'])).toBeUndefined()
  expect(bound(['K12', 'K12#1'])).toBeUndefined()
  expect(bound([])).toBeUndefined()
})

test('geneTracks puts the default session first, then names that say genes', () => {
  const hub = hubFrom(config, URL)
  const ids = (name: string) =>
    geneTracks(
      hub,
      hub.assemblies.find(a => a.name === name)!,
    ).map(t => t.trackId)
  expect(ids('hg38')).toEqual(['hg38_ncbiRefSeq', 'bubbles'])
  expect(ids('hs1')).toEqual(['hs1-default', 'hs1-gff'])
  expect(ids('GCF_000005845.2')).toEqual([])
})

test('namesFor finds every name the alias file gives a sequence', () => {
  const rows = aliasRows(
    '# ucsc\tgenbank\trefseq\nchr1\tCP068277.2\tNC_060925.1\n\nchr2\tCP068276.2\tNC_060926.1\n',
  )
  expect(namesFor(rows, 'chr1')).toEqual(['chr1', 'CP068277.2', 'NC_060925.1'])
  expect(namesFor(rows, 'NC_060926.1')).toEqual([
    'NC_060926.1',
    'chr2',
    'CP068276.2',
  ])
  expect(namesFor(rows, 'chrX')).toEqual(['chrX'])
})
