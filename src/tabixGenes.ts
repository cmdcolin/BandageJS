import { TabixIndexedFile } from '@gmod/tabix'
import { genesFromBed, genesFromGff3Lines } from '@jbrowse/bandage-core'
import { RemoteFile } from 'generic-filehandle2'

import type { GeneSource } from './hubConfig'
import type { Region } from './jbrowse'
import type { GeneModel } from '@jbrowse/bandage-core'

// `genes.ts` imports this module on first use, so the tabix reader stays out
// of the page's first download.

const files = new Map<string, TabixIndexedFile>()

function fileOf(src: GeneSource) {
  let file = files.get(src.file)
  if (!file) {
    const index = new RemoteFile(src.index)
    file = new TabixIndexedFile({
      filehandle: new RemoteFile(src.file),
      ...(src.indexType === 'CSI'
        ? { csiFilehandle: index }
        : { tbiFilehandle: index }),
    })
    files.set(src.file, file)
  }
  return file
}

// One gene per run of a name's overlapping records, so a gene's transcripts
// merge and its copies down the contig, AMY1A twice in an amylase haplotype,
// stay apart. The core's genesFromBed merges every record of a name.
export function bedGenes(lines: string[]) {
  const genes: GeneModel[] = []
  const open = new Map<string, GeneModel>()
  const records = lines
    .flatMap(line => genesFromBed(line))
    .sort((a, b) => a.start - b.start)
  for (const g of records) {
    const key = `${g.refName}\t${g.name}`
    const last = open.get(key)
    if (last && g.start < last.end) {
      last.end = Math.max(last.end, g.end)
      last.exons = mergedExons([...last.exons, ...g.exons])
    } else {
      const gene = { ...g }
      genes.push(gene)
      open.set(key, gene)
    }
  }
  return genes
}

function mergedExons(exons: GeneModel['exons']) {
  const out: GeneModel['exons'] = []
  for (const e of [...exons].sort((a, b) => a.start - b.start)) {
    const last = out.at(-1)
    if (last && e.start <= last.end) {
      last.end = Math.max(last.end, e.end)
    } else {
      out.push({ ...e })
    }
  }
  return out
}

// The genes in a region, read under the first of `names` the file indexes;
// undefined where it indexes none of them
export async function tabixGenes(
  src: GeneSource,
  names: string[],
  region: Region,
  signal: AbortSignal,
) {
  const file = fileOf(src)
  const indexed = new Set(await file.getReferenceSequenceNames({ signal }))
  const refName = names.find(n => indexed.has(n))
  if (refName === undefined) {
    return undefined
  }
  const lines: string[] = []
  await file.getLines(refName, region.start, region.end, {
    lineCallback: line => lines.push(line),
    signal,
  })
  return src.format === 'gff3' ? genesFromGff3Lines(lines) : bedGenes(lines)
}
