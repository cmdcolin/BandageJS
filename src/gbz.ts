import { HPRC_GBZ, cutGbzRegion, openGbz } from '@jbrowse/bandage-core'
import { RemoteFile } from 'generic-filehandle2'

import type { GbzSource } from '@jbrowse/bandage-core'

// A window of a gbz-base database read by range requests, the way the plugin's
// GbzBaseSyntenyAdapter reads one, so a 10 GB graph costs a few MB per cut.
// The cut itself is the core's; the page keeps each opened database for the
// next cut and says what it is waiting on.

export { parseRegion } from '@jbrowse/bandage-core'
export type { GbzSource } from '@jbrowse/bandage-core'

export const HPRC: Omit<GbzSource, 'region'> = HPRC_GBZ

const opened = new Map<string, ReturnType<typeof openGbz>>()

// The database at `db`, with its haplotype index where there is one, opened
// once for every cut and probe
export function openDb(db: string, index?: string) {
  const key = `${db}|${index ?? ''}`
  let gbz = opened.get(key)
  if (!gbz) {
    gbz = openGbz(new RemoteFile(db), index ? new RemoteFile(index) : undefined)
    opened.set(key, gbz)
    gbz.catch(() => opened.delete(key))
  }
  return gbz
}

export async function cutGbz(
  src: GbzSource,
  status: (text: string) => void,
  signal: AbortSignal,
) {
  status('Opening pangenome database')
  const gbz = await openDb(src.db, src.index)
  signal.throwIfAborted()
  status(`Cutting ${src.region}`)
  return cutGbzRegion(gbz, src, signal)
}
