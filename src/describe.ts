import { HPRC } from './gbz'
import { esc } from './overlays'

import type { Recent } from './recent'
import type { GeneModel, GraphNode } from '@jbrowse/bandage-core'

// the "Needs …" sentence of a layout's description, for a greyed-out item
export function needs(description: string) {
  return (
    /Needs [^.]*\./.exec(description)?.[0] ?? 'Not available for this graph'
  )
}

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

// Where a recent graph came from and when, with `base` resolving a relative
// url
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
  return `${where} · ${ago(r.at, now)}`
}

export function nodeHtml(node: GraphNode) {
  let html = `<strong>${esc(node.name)}</strong> — ${node.length.toLocaleString()} bp, depth ${node.depth.toFixed(1)}`
  if (node.stable) {
    html += `<br>${esc(node.stable.refName)}:${node.stable.start.toLocaleString()} (rank ${node.stable.rank})`
  }
  return html
}

export function nodeText(node: GraphNode) {
  const at = node.stable
    ? `, ${node.stable.refName}:${node.stable.start.toLocaleString()} (rank ${node.stable.rank})`
    : ''
  return `${node.name}, ${node.length.toLocaleString()} bp, depth ${node.depth.toFixed(1)}${at}`
}

// A gene's name, its span in 1-based closed coordinates and its strand, and
// whether it runs past the cut when the backbone covers less than `covered`
// of it
export function geneText(gene: GeneModel, covered = 1) {
  const strand =
    gene.strand > 0 ? ', + strand' : gene.strand < 0 ? ', − strand' : ''
  return `${gene.name}\n${gene.refName}:${(gene.start + 1).toLocaleString()}-${gene.end.toLocaleString()}${strand}${
    covered < 0.98 ? '\nRuns past the cut' : ''
  }`
}
