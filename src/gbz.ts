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

export async function cutGbz(
  src: GbzSource,
  status: (text: string) => void,
  signal: AbortSignal,
) {
  status('Opening pangenome database')
  const key = `${src.db}|${src.index ?? ''}`
  let db = opened.get(key)
  if (!db) {
    db = openGbz(
      new RemoteFile(src.db),
      src.index ? new RemoteFile(src.index) : undefined,
    )
    opened.set(key, db)
    db.catch(() => opened.delete(key))
  }
  const gbz = await db
  signal.throwIfAborted()
  status(`Cutting ${src.region}`)
  return cutGbzRegion(gbz, src, signal)
}
