import { TabixIndexedFile } from '@gmod/tabix'
import { RemoteFile } from 'generic-filehandle2'

import { genesFromGff3Lines } from './geneModels'

import type { Region } from './jbrowse'

// NCBI RefSeq on hg38 as UCSC builds it, the gene track the JBrowse portal
// shows, read by range requests. `genes.ts` imports this module on first use,
// so the tabix reader stays out of the page's first download.
export const REFSEQ_GFF = 'https://jbrowse.org/ucsc/hg38/ncbiRefSeq.gff.gz'

const file = new TabixIndexedFile({
  filehandle: new RemoteFile(REFSEQ_GFF),
  csiFilehandle: new RemoteFile(`${REFSEQ_GFF}.csi`),
})

export async function refseqGenes(region: Region, signal: AbortSignal) {
  const lines: string[] = []
  await file.getLines(region.refName, region.start, region.end, {
    lineCallback: line => lines.push(line),
    signal,
  })
  return genesFromGff3Lines(lines)
}
