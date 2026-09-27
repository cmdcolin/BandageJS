import { TabixIndexedFile } from '@gmod/tabix'
import { RemoteFile } from 'generic-filehandle2'

import { genesFromBed, genesFromGff3Lines } from './geneModels'

import type { GeneSource } from './hubConfig'
import type { Region } from './jbrowse'

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
  return src.format === 'gff3'
    ? genesFromGff3Lines(lines)
    : genesFromBed(lines.join('\n'))
}
