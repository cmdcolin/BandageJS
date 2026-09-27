// Rebuilds the e2e fixtures from the live hubs: each config cut down to the
// assemblies and tracks the tests read, alias files cut to the examples'
// contigs, and gene files cut around the examples' windows. Needs bgzip and
// tabix on the path: node test/e2e/data/fixtures.mjs

import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'

import { TabixIndexedFile } from '@gmod/tabix'
import { RemoteFile } from 'generic-filehandle2'

const here = new URL('.', import.meta.url).pathname
const examples = new URL('../../../examples/', import.meta.url).pathname

async function text(url) {
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} fetching ${url}`)
  }
  return res.text()
}

// a CSI-indexed GFF3's lines in the regions, bgzipped and indexed as `out`
async function cut(url, regions, out) {
  const file = new TabixIndexedFile({
    filehandle: new RemoteFile(url),
    csiFilehandle: new RemoteFile(`${url}.csi`),
  })
  const lines = ['##gff-version 3']
  for (const [refName, start, end] of regions) {
    await file.getLines(refName, start, end, line => lines.push(line))
  }
  writeFileSync(`${here}${out}.txt`, lines.join('\n') + '\n')
  execFileSync(
    'sh',
    [
      '-c',
      `bgzip -c ${out}.txt > ${out} && rm ${out}.txt && tabix -f -C -p gff ${out}`,
    ],
    { cwd: here },
  )
}

function aliasCut(all, names) {
  return all
    .split('\n')
    .filter(
      l => l.startsWith('#') || names.some(n => l.split('\t').includes(n)),
    )
    .join('\n')
}

// every haplotype the bundled examples name, which a node link can open
const haplotypes = new Set(
  readdirSync(examples)
    .filter(f => f.endsWith('.gfa'))
    .flatMap(f =>
      [
        ...readFileSync(examples + f, 'utf8').matchAll(
          /SN:Z:([^#\s]+)#(\d+)#/g,
        ),
      ].map(m => `${m[1]}#${m[2]}`),
    ),
)

const PORTAL = 'https://jbrowse.org/pangenome/hprc-grch38/config.json'
const portal = JSON.parse(await text(PORTAL))
const kept = portal.assemblies.filter(
  a => a.name === 'hg38' || (a.aliases ?? []).some(x => haplotypes.has(x)),
)
const keptNames = new Set(kept.map(a => a.name))
writeFileSync(
  `${here}hprc-grch38.config.json`,
  JSON.stringify(
    {
      plugins: portal.plugins,
      assemblies: kept,
      tracks: portal.tracks
        .filter(t => t.assemblyNames.some(n => keptNames.has(n)))
        .filter(
          t =>
            t.adapter.type === 'Gff3TabixAdapter' ||
            t.type === 'GraphTrack' ||
            t.type === 'SyntenyTrack' ||
            t.trackId.endsWith('_cat_genes'),
        )
        .map(t => ({
          ...t,
          assemblyNames: t.assemblyNames.filter(n => keptNames.has(n)),
        })),
    },
    null,
    1,
  ),
)
writeFileSync(
  `${here}hg38.chromAlias.txt`,
  aliasCut(await text('https://jbrowse.org/ucsc/hg38/hg38.chromAlias.txt'), [
    'chr1',
    'chr6',
  ]),
)
await cut(
  'https://jbrowse.org/ucsc/hg38/ncbiRefSeq.gff.gz',
  [
    ['chr6', 160520000, 160680000],
    ['chr1', 197740000, 197770000],
  ],
  'ncbiRefSeq.gff.gz',
)

const HS1 = 'https://jbrowse.org/ucsc/hs1/config.json'
const hs1 = JSON.parse(await text(HS1))
writeFileSync(
  `${here}hs1.config.json`,
  JSON.stringify(
    {
      assemblies: hs1.assemblies,
      defaultSession: hs1.defaultSession,
      tracks: hs1.tracks.filter(t =>
        ['hs1-ncbiRefSeqGff', 'hs1-ncbiRefSeq'].includes(t.trackId),
      ),
    },
    null,
    1,
  ),
)
writeFileSync(
  `${here}hs1.chromAlias.txt`,
  aliasCut(await text('https://jbrowse.org/ucsc/hs1/hs1.chromAlias.txt'), [
    'chr1',
    'chr6',
  ]),
)
await cut(
  'https://jbrowse.org/ucsc/hs1/hs1.gff.gz',
  [['NC_060925.1', 197000000, 197030000]],
  'hs1.gff.gz',
)

const K12 =
  'https://jbrowse.org/hubs/genark/GCF/000/005/845/GCF_000005845.2/config.json'
const k12 = JSON.parse(await text(K12))
writeFileSync(
  `${here}GCF_000005845.2.config.json`,
  JSON.stringify(
    {
      assemblies: k12.assemblies,
      tracks: k12.tracks.filter(t => t.adapter.type === 'Gff3TabixAdapter'),
    },
    null,
    1,
  ),
)
writeFileSync(
  `${here}GCF_000005845.2.chromAlias.txt`,
  await text(
    'https://hgdownload.soe.ucsc.edu/hubs/GCF/000/005/845/GCF_000005845.2/GCF_000005845.2.chromAlias.txt',
  ),
)
await cut(
  new URL('GCF_000005845.2_ASM584v2_genomic.gff.gz', K12).href,
  [['NC_000913.3', 1000000, 1010000]],
  'GCF_000005845.2.gff.gz',
)
