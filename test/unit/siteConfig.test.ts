import { expect, test } from '@playwright/test'

import { searchIndex } from '../../src/genomeSearch'
import { hubFrom, withOverlay } from '../../src/hubConfig'
import {
  DEFAULT_JBROWSE,
  genomeHubUrl,
  mergeOverlays,
  siteFrom,
} from '../../src/siteConfig'

const SITE = 'https://example.org/bandage/config.json'

test('siteFrom reads hubs as urls or with overlays, relative to itself', () => {
  const site = siteFrom(
    {
      jbrowse: 'https://jbrowse.example.org/',
      hubs: [
        'hubs/one/config.json',
        {
          url: 'https://other.org/config.json',
          aliases: { asm: ['S1', 7] },
          refNameAliases: { asm: { chr: 'NC_1', bad: 3 } },
          genes: { asm: '' },
        },
        { aliases: {} },
        42,
      ],
      genomes: { genark: 'https://jbrowse.org/hubs/genark/' },
    },
    SITE,
  )
  expect(site.jbrowse).toBe('https://jbrowse.example.org/')
  expect(site.hubs).toEqual([
    { url: 'https://example.org/bandage/hubs/one/config.json' },
    {
      url: 'https://other.org/config.json',
      aliases: { asm: ['S1'] },
      refNameAliases: { asm: { chr: 'NC_1' } },
      genes: { asm: '' },
    },
  ])
  expect(site.genomes.genark).toBe('https://jbrowse.org/hubs/genark/')
  expect(site.genomes.index).toBeUndefined()
})

test('an empty or broken site config has no hubs and the default JBrowse', () => {
  expect(siteFrom({}, SITE)).toEqual({
    jbrowse: DEFAULT_JBROWSE,
    hubs: [],
    genomes: {},
  })
  expect(siteFrom('nonsense', SITE).hubs).toEqual([])
})

test('mergeOverlays adds names and lets the second choose genes', () => {
  expect(
    mergeOverlays(
      {
        aliases: { a: ['S1'] },
        refNameAliases: { a: { chr: 'NC_1' } },
        genes: { a: 't1' },
      },
      {
        aliases: { a: ['S1', 'S2'], b: ['S3'] },
        refNameAliases: { a: { plasmid: 'NC_2' } },
        genes: { a: '' },
      },
    ),
  ).toEqual({
    aliases: { a: ['S1', 'S2'], b: ['S3'] },
    refNameAliases: { a: { chr: 'NC_1', plasmid: 'NC_2' } },
    genes: { a: '' },
  })
})

test('withOverlay puts an overlay on the hub assembly it names', () => {
  const hub = withOverlay(
    hubFrom(
      { assemblies: [{ name: 'a', aliases: ['x'] }, { name: 'b' }] },
      SITE,
    ),
    {
      aliases: { a: ['S1'] },
      refNameAliases: { a: { chr: 'NC_1' } },
      genes: { b: 't' },
    },
  )
  expect(hub.assemblies).toEqual([
    {
      name: 'a',
      aliases: ['x', 'S1'],
      contigs: { chr: 'NC_1' },
      geneTrack: undefined,
      displayName: undefined,
      refNameAliases: undefined,
    },
    {
      name: 'b',
      aliases: [],
      contigs: {},
      geneTrack: 't',
      displayName: undefined,
      refNameAliases: undefined,
    },
  ])
})

const GENOMES = {
  genark: 'https://jbrowse.org/hubs/genark/',
  ucsc: 'https://jbrowse.org/ucsc/',
}

test('genomeHubUrl shards a GenArk accession and names a UCSC db', () => {
  expect(genomeHubUrl(' GCF_000005845.2 ', GENOMES)).toBe(
    'https://jbrowse.org/hubs/genark/GCF/000/005/845/GCF_000005845.2/config.json',
  )
  expect(genomeHubUrl('mm39', GENOMES)).toBe(
    'https://jbrowse.org/ucsc/mm39/config.json',
  )
  expect(genomeHubUrl('danRer11', GENOMES)).toBe(
    'https://jbrowse.org/ucsc/danRer11/config.json',
  )
  expect(genomeHubUrl('E. coli', GENOMES)).toBeUndefined()
  expect(genomeHubUrl('GCF_000005845.2', {})).toBeUndefined()
})

test('searchIndex finds genomes by any name, exact and reference ones first', () => {
  const rows = [
    [
      'GCF_000750555.1',
      'E. coli (K-12 BW25113 2014 refseq)',
      'Escherichia coli BW25113',
      'ASM75055v1',
      'Complete Genome',
      'bacteria',
      679895,
      0,
    ],
    [
      'GCF_000005845.2',
      'E. coli (K-12 MG1655 2013 refseq)',
      'Escherichia coli str. K-12 substr. MG1655',
      'ASM584v2',
      'Complete Genome',
      'bacteria',
      511145,
      1,
    ],
    ['hs1', 'Human', 'Homo sapiens', 'T2T CHM13v2.0', '', 'ucsc', 9606, 0],
    'not a row',
  ]
  expect(searchIndex(rows, 'k-12', GENOMES).map(g => g.id)).toEqual([
    'GCF_000005845.2',
    'GCF_000750555.1',
  ])
  expect(searchIndex(rows, 'chm13', GENOMES)).toEqual([
    {
      id: 'hs1',
      label: 'Human, T2T CHM13v2.0',
      hub: 'https://jbrowse.org/ucsc/hs1/config.json',
    },
  ])
  expect(searchIndex(rows, 'x', GENOMES)).toEqual([])
})
