import { TabixIndexedFile } from '@gmod/tabix'
import { RemoteFile } from 'generic-filehandle2'

import { genesFromGff3Lines } from './geneModels'

import type { Region } from './jbrowse'

// `genes.ts` imports this module on first use, so the tabix reader stays out
// of the page's first download.

const files = new Map<string, TabixIndexedFile>()

function fileAt(url: string) {
  let file = files.get(url)
  if (!file) {
    file = new TabixIndexedFile({
      filehandle: new RemoteFile(url),
      csiFilehandle: new RemoteFile(`${url}.csi`),
    })
    files.set(url, file)
  }
  return file
}

export async function tabixGenes(
  url: string,
  region: Region,
  signal: AbortSignal,
) {
  const lines: string[] = []
  await fileAt(url).getLines(region.refName, region.start, region.end, {
    lineCallback: line => lines.push(line),
    signal,
  })
  return genesFromGff3Lines(lines)
}
