import type { Graph, GraphNode, GraphEdge } from '../types'
import type { GFAGraph } from './gfaParser'

/**
 * Parse CIGAR string to extract overlap information
 * CIGAR format: [0-9]+[MIDNSHPX=]
 * For overlap, we typically care about M (match/mismatch)
 */
function parseCigarOverlap(cigar: string): number {
  if (!cigar || cigar === '*') return 0

  // Extract all match operations and sum them
  const matches = cigar.match(/(\d+)M/g)
  if (!matches) return 0

  return matches.reduce((sum, match) => {
    const num = parseInt(match.slice(0, -1))
    return sum + num
  }, 0)
}

/**
 * Convert GFA graph to Bandage app Graph format
 */
export function convertGFAToGraph(
  gfaGraph: GFAGraph,
  name: string = 'Imported GFA',
): Graph {
  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []

  // First pass: determine which strand nodes are actually used
  const usedStrands = new Set<string>()
  for (const link of gfaGraph.links) {
    const sourceStrand = link.strand1 || '+'
    const targetStrand = link.strand2 || '+'
    usedStrands.add(`${link.source}${sourceStrand}`)
    usedStrands.add(`${link.target}${targetStrand}`)
  }

  // Convert nodes - only create strand versions that are actually used
  for (const gfaNode of gfaGraph.nodes) {
    // Extract depth from tags (common tags: dp, RC, FC, KC)
    const depth =
      (gfaNode.tags.dp as number) ||
      (gfaNode.tags.RC as number) ||
      (gfaNode.tags.FC as number) ||
      (gfaNode.tags.KC as number) ||
      1.0

    // Create positive strand node only if it's used in edges
    if (usedStrands.has(`${gfaNode.id}+`)) {
      nodes.push({
        id: `${gfaNode.id}+`,
        name: gfaNode.id,
        length: gfaNode.length,
        depth: typeof depth === 'number' ? depth : 1.0,
      })
    }

    // Create negative strand node only if it's used in edges
    if (usedStrands.has(`${gfaNode.id}-`)) {
      nodes.push({
        id: `${gfaNode.id}-`,
        name: gfaNode.id,
        length: gfaNode.length,
        depth: typeof depth === 'number' ? depth : 1.0,
      })
    }
  }

  // Convert links to edges
  for (const link of gfaGraph.links) {
    const overlap = parseCigarOverlap(link.cigar)

    // Determine the strand orientation
    const sourceStrand = link.strand1 || '+'
    const targetStrand = link.strand2 || '+'

    // Create edge with proper strand notation
    const from = `${link.source}${sourceStrand}`
    const to = `${link.target}${targetStrand}`

    edges.push({
      from,
      to,
      overlap,
    })
  }

  return {
    name,
    description: `Imported from GFA file with ${nodes.length} nodes and ${edges.length} links`,
    nodes,
    edges,
  }
}
