import { genomeHubUrl } from './siteConfig'

import type { SiteConfig } from './siteConfig'

// A genome someone can pick by name: a hub the page hasn't read yet
export interface Genome {
  // the accession or UCSC db
  id: string
  label: string
  hub: string
}

export const normal = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

// genomes.jbrowse.org's searchIndex.json: one array per genome, the accession
// or UCSC db, common name, scientific name and assembly name first, and its
// ncbiStatus bits (1 for NCBI's reference) eighth
export function searchIndex(
  rows: unknown,
  query: string,
  genomes: SiteConfig['genomes'],
  limit = 20,
): Genome[] {
  const q = normal(query)
  if (q.length < 2 || !Array.isArray(rows)) {
    return []
  }
  const hits: { genome: Genome; rank: number }[] = []
  for (const row of rows) {
    if (!Array.isArray(row) || typeof row[0] !== 'string') {
      continue
    }
    const [id = '', common = '', scientific = '', assembly = ''] = row.map(
      (x: unknown) => (typeof x === 'string' ? x : ''),
    )
    const names = [id, common, scientific, assembly].map(normal)
    if (!names.some(n => n.includes(q))) {
      continue
    }
    const hub = genomeHubUrl(id, genomes)
    if (hub) {
      const exact = names[0] === q || names[3] === q
      const reference = typeof row[7] === 'number' && (row[7] & 1) === 1
      hits.push({
        genome: {
          id,
          label: [common, assembly].filter(s => s).join(', '),
          hub,
        },
        rank: exact ? 0 : reference ? 1 : 2,
      })
    }
  }
  return hits
    .sort((a, b) => a.rank - b.rank)
    .slice(0, limit)
    .map(h => h.genome)
}
