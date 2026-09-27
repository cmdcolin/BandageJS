import { HPRC } from './gbz'

import type { GbzSource } from './gbz'

// A gbz cut as the page's query string, the HPRC database as `gbz=hprc`, and
// back.
export function gbzQuery(src: GbzSource): Record<string, string> {
  const preset = src.db === HPRC.db && src.index === HPRC.index
  return {
    gbz: preset ? 'hprc' : src.db,
    ...(!preset && src.index ? { index: src.index } : {}),
    loc: src.region,
    ...(src.referenceSample ? { ref: src.referenceSample } : {}),
    ...(src.haplotypes?.length ? { haps: src.haplotypes.join(',') } : {}),
  }
}

export function gbzFromQuery(params: URLSearchParams): GbzSource | undefined {
  const db = params.get('gbz')
  const loc = params.get('loc')
  if (!db || !loc) {
    return undefined
  }
  const haps = params.get('haps')
  return {
    ...(db === 'hprc' ? HPRC : { db, index: params.get('index') ?? undefined }),
    region: loc,
    referenceSample: params.get('ref') ?? undefined,
    haplotypes: haps ? haps.split(',') : undefined,
  }
}
