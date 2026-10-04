import { panSNContig } from '@jbrowse/bandage-core'

import { HPRC } from './gbz'
import { esc } from './overlays'

import type { Recent } from './recent'
import type { GeneModel, GraphNode } from '@jbrowse/bandage-core'

// `Force-directed` for `Force-directed layout`, where the context says layout
export const layoutName = (label: string) => label.replace(/ layout$/, '')

export function ago(at: number, now = Date.now()) {
  const minutes = (now - at) / 60_000
  if (minutes < 1) {
    return 'just now'
  }
  const [value, unit] =
    minutes < 60
      ? [minutes, 'minute']
      : minutes < 60 * 24
        ? [minutes / 60, 'hour']
        : [minutes / (60 * 24), 'day']
  return new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' }).format(
    -Math.round(value),
    unit as Intl.RelativeTimeFormatUnit,
  )
}

// Where a recent graph came from, the assemblies declared for it, and when,
// with `base` resolving a relative url
export function recentDetail(r: Recent, base: string, now = Date.now()) {
  const host = (url: string) => new URL(url, base).host
  const where =
    r.kind === 'file'
      ? 'File on this computer'
      : r.kind === 'url'
        ? host(r.url)
        : `${r.gbz.db === HPRC.db ? 'HPRC' : host(r.gbz.db)} cut${
            r.gbz.haplotypes?.length
              ? `, ${r.gbz.haplotypes.length} haplotypes`
              : ''
          }`
  const on = [...new Set(Object.values(r.declared ?? {}).map(d => d.assembly))]
  return `${where}${on.length ? ` on ${on.join(', ')}` : ''} · ${ago(r.at, now)}`
}

// The genes over a backbone node, each with how many of its exons the node
// carries, and whether it has more than one exon to count
export function genesOn(node: GraphNode, genes: GeneModel[] = []) {
  const s = node.stable
  if (s?.rank !== 0) {
    return []
  }
  const end = s.start + node.length
  const over = (r: { start: number; end: number }) =>
    r.start < end && r.end > s.start
  return genes
    .filter(g => g.refName === s.refName && over(g))
    .map(g => ({
      name: g.name,
      exons: g.exons.filter(over).length,
      spliced: g.exons.length > 1,
    }))
}

const MAX_HOVER_GENES = 3

export function nodeHtml(node: GraphNode, genes?: GeneModel[]) {
  let html = `<strong>${esc(node.name)}</strong> — ${node.length.toLocaleString()} bp, depth ${node.depth.toFixed(1)}`
  if (node.stable) {
    html += `<br>${esc(node.stable.refName)}:${(node.stable.start + 1).toLocaleString()} (rank ${node.stable.rank})`
  }
  const over = genesOn(node, genes)
  for (const g of over.slice(0, MAX_HOVER_GENES)) {
    const here = !g.exons
      ? ': intron here'
      : g.spliced
        ? `: ${g.exons} exon${g.exons > 1 ? 's' : ''} here`
        : ''
    html += `<br><em>${esc(g.name)}</em>${here}`
  }
  if (over.length > MAX_HOVER_GENES) {
    html += `<br>+${over.length - MAX_HOVER_GENES} more genes`
  }
  return html
}

export function nodeText(node: GraphNode) {
  const at = node.stable
    ? `, ${node.stable.refName}:${(node.stable.start + 1).toLocaleString()} (rank ${node.stable.rank})`
    : ''
  return `${node.name}, ${node.length.toLocaleString()} bp, depth ${node.depth.toFixed(1)}${at}`
}

// A gene's name, its span in 1-based closed coordinates and its strand, and
// whether it runs past the cut when the backbone covers less than `covered`
// of it
export function geneText(gene: GeneModel, covered = 1) {
  const strand =
    gene.strand > 0 ? ', + strand' : gene.strand < 0 ? ', − strand' : ''
  return `${gene.name}\n${panSNContig(gene.refName)}:${(gene.start + 1).toLocaleString()}-${gene.end.toLocaleString()}${strand}${
    covered < 0.98 ? '\nRuns past the cut' : ''
  }`
}
