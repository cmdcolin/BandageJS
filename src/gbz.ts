import { GBZBase } from '@gmod/gbz-base'
import { RemoteFile } from 'generic-filehandle2'

import {
  cutWindowGFA,
  haplotypeWanted,
  referencePathQuery,
  referenceSamplesOf,
  resolveReferenceSample,
} from '../graphgenomeviewer/src/core'

// A window of a gbz-base database read by range requests, the way the plugin's
// GbzBaseSyntenyAdapter reads one, so a 10 GB graph costs a few MB per cut.

export interface GbzSource {
  db: string
  index?: string
  region: string
  haplotypes?: string[]
  referenceSample?: string
}

export const HPRC: Omit<GbzSource, 'region'> = {
  db: 'https://s3-us-west-2.amazonaws.com/human-pangenomics/pangenomes/freeze/release2/minigraph-cactus/v2.1/hprc-v2.1-mc-grch38/hprc-v2.1-mc-grch38.gbz.db',
  index:
    'https://jbrowse.org/demos/hprc/hprc-v2.1-mc-grch38.haplotype-index.db',
}

export function parseRegion(text: string) {
  const m = /^\s*([^:\s]+):([\d,]+)-([\d,]+)\s*$/.exec(text)
  if (!m) {
    throw new Error(
      `"${text}" is not a region like chr6:160,614,798-160,647,758`,
    )
  }
  const n = (s: string) => Number(s.replaceAll(',', ''))
  return { refName: m[1]!, start: n(m[2]!), end: n(m[3]!) }
}

// gbz-base counts every node it walks, which runs well past the nodes a cut
// keeps; the plugin's own nodeLimit default, with the page's drawing cap left
// to loadGraph
const WALK_LIMIT = 100_000

const opened = new Map<string, ReturnType<typeof open>>()

async function open(db: string, index: string | undefined) {
  const base = await GBZBase.open(
    new RemoteFile(db),
    index ? { haplotypeIndex: new RemoteFile(index) } : {},
  )
  return { base, referenceSamples: await referenceSamplesOf(base) }
}

export async function cutGbz(src: GbzSource, status: (text: string) => void) {
  const region = parseRegion(src.region)
  status('Opening pangenome database')
  const key = `${src.db}|${src.index ?? ''}`
  let db = opened.get(key)
  if (!db) {
    db = open(src.db, src.index)
    opened.set(key, db)
    db.catch(() => opened.delete(key))
  }
  const { base, referenceSamples } = await db
  const sample = resolveReferenceSample({
    configured: src.referenceSample ?? '',
    anchorPrefix: referenceSamples[0] ?? '',
    referenceSamples,
  })
  status(`Cutting ${src.region}`)
  const query = await referencePathQuery(base, sample, region.refName)
  if (!query) {
    throw new Error(`${sample} has no indexed path named ${region.refName}`)
  }
  const wanted = src.haplotypes?.length ? src.haplotypes : undefined
  const text = await cutWindowGFA(base, query, region.start, region.end, {
    context: 1000,
    snarls: 'contained',
    limit: WALK_LIMIT,
    ...(wanted ? { keep: name => haplotypeWanted(name, wanted) } : {}),
  })
  return { text, region }
}
