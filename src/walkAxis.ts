import type { GeneModel, Graph, WalkRows } from '@jbrowse/bandage-core'

type GraphPath = NonNullable<Graph['paths']>[number]

// Where a walk row's bar lies on the walk's own contig: the contig position
// at the bar's left end, and whether positions fall rightward. The core cuts
// each row between the last reference node that ends at or before the
// window and the first that starts at or after it, reversing the row where
// the walk meets them in the other order; this repeats that choice.
export interface RowAxis {
  contig: string
  start: number
  reversed: boolean
}

interface Step {
  id?: string
  start: number
  end: number
}

function stepsOf(pieces: GraphPath[], lengthOf: Map<string, number>) {
  const steps: Step[] = []
  for (const piece of pieces) {
    let pos = piece.start!
    for (const id of piece.nodeIds) {
      const len = lengthOf.get(id) ?? 0
      steps.push({ id, start: pos, end: pos + len })
      pos += len
    }
  }
  return steps
}

export function rowAxes(
  graph: Graph,
  bars: WalkRows,
  region: { start: number; end: number } | undefined,
) {
  const lengthOf = new Map(graph.nodes.map(n => [n.id, n.length]))
  const byName = new Map<string, GraphPath[]>()
  for (const path of graph.paths ?? []) {
    byName.set(path.name, [...(byName.get(path.name) ?? []), path])
  }
  const span = new Map<string, { start: number; end: number }>()
  for (const s of stepsOf(
    (byName.get(bars.reference.name) ?? []).filter(p => p.start !== undefined),
    lengthOf,
  )) {
    if (!span.has(s.id!)) {
      span.set(s.id!, s)
    }
  }
  const cut = region && region.end > region.start ? region : undefined
  const spans = [...span.values()]
  const flanked =
    !cut ||
    (spans.some(s => s.end <= cut.start) && spans.some(s => s.start >= cut.end))

  const axes = new Map<string, RowAxis>()
  for (const row of [bars.reference, ...bars.rows]) {
    const pieces = byName.get(row.name) ?? []
    const contig = pieces[0]?.contig
    if (!contig || pieces.some(p => p.start === undefined)) {
      continue
    }
    const steps = stepsOf(
      [...pieces].sort((a, b) => a.start! - b.start!),
      lengthOf,
    )
    let i0 = -1
    let i1 = -1
    let bestEnd = -Infinity
    let bestStart = Infinity
    if (cut && flanked) {
      steps.forEach((step, i) => {
        const s = span.get(step.id!)
        if (s && s.end <= cut.start && s.end > bestEnd) {
          bestEnd = s.end
          i0 = i
        }
        if (s && s.start >= cut.end && s.start < bestStart) {
          bestStart = s.start
          i1 = i
        }
      })
    }
    axes.set(
      row.name,
      i0 < 0 || i1 < 0
        ? { contig, start: steps[0]?.start ?? 0, reversed: false }
        : i0 < i1
          ? { contig, start: steps[i0]!.end, reversed: false }
          : { contig, start: steps[i0]!.start, reversed: true },
    )
  }
  return axes
}

// a contig span as offsets along the row's bar
export function alongRow(axis: RowAxis, start: number, end: number) {
  return axis.reversed
    ? { start: axis.start - end, end: axis.start - start }
    : { start: start - axis.start, end: end - axis.start }
}

// the contig span a row's bar covers
export function rowSpan(axis: RowAxis, bp: number) {
  return axis.reversed
    ? { start: axis.start - bp, end: axis.start }
    : { start: axis.start, end: axis.start + bp }
}

export interface RowGene {
  name: string
  start: number
  end: number
  exons: { start: number; end: number }[]
}

const onContig = (refName: string, contig: string) =>
  refName === contig || refName.endsWith(`#${contig}`)

// Each row's genes as offsets along its bar, those on the row's contig that
// overlap it
export function placeRowGenes(
  graph: Graph,
  bars: WalkRows,
  region: { start: number; end: number } | undefined,
  byRow: Map<string, GeneModel[]>,
) {
  const axes = rowAxes(graph, bars, region)
  const placed = new Map<string, RowGene[]>()
  for (const row of [bars.reference, ...bars.rows]) {
    const axis = axes.get(row.name)
    const genes = byRow.get(row.name)
    if (!axis || !genes) {
      continue
    }
    placed.set(
      row.name,
      genes
        .filter(g => onContig(g.refName, axis.contig))
        .map(g => ({
          name: g.name,
          ...alongRow(axis, g.start, g.end),
          exons: g.exons.map(e => alongRow(axis, e.start, e.end)),
        }))
        .filter(g => g.end > 0 && g.start < row.bp)
        .sort((a, b) => a.start - b.start),
    )
  }
  return placed
}
