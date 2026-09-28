import {
  BUBBLE_KIND_COLORS,
  HALO_FACTOR,
  LABEL_CHAR_PX,
  LABEL_PAD,
  LABEL_PX,
  REFERENCE_RAMP_MAX_HUE,
  ROW_HEIGHT_PX,
  encodingSwatchCss,
  formatBp,
} from '@jbrowse/bandage-core'

import { geneText } from './describe'

import type {
  BubbleHalo,
  GenePin,
  LabelLayout,
  LiftedWalk,
  WalkLift,
  WalkRows,
} from '@jbrowse/bandage-core'

// Everything drawn over the canvas, as markup rebuilt per frame from the
// core's outputs: the plugin's BubbleHalos, GenePins, LabelLayer,
// WalkRowsOverlay, row and size labels and legends, without React.

export interface Pane {
  width: number
  height: number
  scaleX: number
  scaleY: number
  translateX: number
  translateY: number
  contigThickness: number
  halos: BubbleHalo[]
  genePins: GenePin[]
  labels: LabelLayout
  rowLabels: { label: string; y: number }[]
  walkBars: WalkRows | undefined
  // where the cut window ends, which the backbone the canvas draws runs to
  regionEnd: number | undefined
  highlight: WalkLift | undefined
}

const EXON_COLOR = '#1c1c22'
const ON_REFERENCE = '#2f8fd6'
const OFF_REFERENCE = '#8e3fbf'
const BAR_PX = 12
const MIN_TILE_PX = 3

export function esc(s: string) {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function dimmed(p: Pane, h: BubbleHalo) {
  return (
    p.highlight !== undefined &&
    !h.nodeIds.some(id => p.highlight!.nodeIds.has(id))
  )
}

function chip(o: {
  x: number
  y: number
  w: number
  text: string
  color: string
  small?: boolean
  italic?: boolean
  dimmed?: boolean
  title?: string
  attrs?: string
}) {
  const clickable = o.attrs !== undefined
  return `<g class="chip${clickable ? ' clickable' : ''}" ${
    clickable
      ? `${o.attrs} role="button" tabindex="0" aria-label="Open ${esc(o.text)}"`
      : ''
  } opacity="${o.dimmed ? 0.35 : 1}">${
    o.title ? `<title>${esc(o.title)}</title>` : ''
  }<rect x="${o.x - o.w / 2}" y="${o.y - LABEL_PX - LABEL_PAD + 2}" width="${o.w}" height="${
    LABEL_PX + LABEL_PAD * 2 - 2
  }" rx="3" fill="rgba(255,255,255,0.85)" stroke="${o.color}" stroke-width="${o.small ? 0.6 : 1}"/><text x="${o.x}" y="${o.y}" font-size="${
    o.small ? LABEL_PX - 1 : LABEL_PX
  }" fill="${o.color}"${
    o.italic ? ' font-style="italic" font-weight="600"' : ''
  } text-anchor="middle">${esc(o.text)}</text></g>`
}

// Halos, then exons over them, in layout units under the pane's transform
function alongNodes(p: Pane) {
  const width = p.contigThickness * HALO_FACTOR
  const halos = p.halos
    .filter(h => !h.whole)
    .map(
      h =>
        `<path d="${h.path}" fill="none" stroke="${BUBBLE_KIND_COLORS[h.kind]}" stroke-opacity="${
          dimmed(p, h) ? 0.06 : 0.22
        }" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>`,
    )
  const exons = p.genePins
    .filter(pin => pin.exons)
    .map(
      pin =>
        `<path d="${pin.exons}" fill="none" stroke="${EXON_COLOR}" stroke-opacity="0.9" stroke-width="${
          p.contigThickness * 0.55
        }" stroke-linecap="round" vector-effect="non-scaling-stroke"/>`,
    )
  const paths = [...halos, ...exons]
  return paths.length
    ? `<g transform="translate(${p.translateX} ${p.translateY}) scale(${p.scaleX} ${p.scaleY})">${paths.join('')}</g>`
    : ''
}

function leaders(p: Pane) {
  return p.labels.sizes
    .flatMap(({ leader }) =>
      leader
        ? [
            `<line x1="${leader.arcX}" y1="${leader.arcY}" x2="${leader.labelX}" y2="${leader.labelY}" stroke="#18181c" stroke-width="1"/>`,
          ]
        : [],
    )
    .join('')
}

function geneLabels(p: Pane) {
  return p.labels.genes.map(({ item: pin, x, y, w, text }) => {
    const pinY = pin.at.y * p.scaleY + p.translateY + p.contigThickness / 2
    const name = chip({
      x,
      y,
      w,
      text,
      color: EXON_COLOR,
      italic: true,
      title: geneText(pin.gene, pin.covered),
    })
    return `<g class="gene"><line x1="${x}" x2="${x}" y1="${y - LABEL_PX - 2}" y2="${pinY}" stroke="${EXON_COLOR}" stroke-width="0.8" stroke-opacity="0.6"/>${name}</g>`
  })
}

function chips(p: Pane) {
  const genes = geneLabels(p)
  const routes = p.labels.routes.map(
    ({ item: { halo: h, route }, x, y, w, text }) =>
      chip({
        x,
        y,
        w,
        text,
        color: BUBBLE_KIND_COLORS[h.kind],
        small: true,
        dimmed:
          p.highlight !== undefined &&
          !route.route.walks.some(w => p.highlight!.names.has(w)),
        title: `${route.route.walks.length} walk(s): ${route.route.walks.join(', ')}`,
      }),
  )
  const bubbles = p.labels.bubbles.map(({ item: h, x, y, w, text }) =>
    chip({
      x,
      y,
      w,
      text,
      color: BUBBLE_KIND_COLORS[h.kind],
      dimmed: dimmed(p, h),
      title: `${h.label}\n${h.bubble.segmentCount} segments · click to open`,
      attrs: `data-halo="${p.halos.indexOf(h)}"`,
    }),
  )
  return genes.join('') + routes.join('') + bubbles.join('')
}

function kb(bp: number) {
  return `${(bp / 1000).toFixed(bp < 10_000 ? 1 : 0)} kb`
}

function units(bp: number, unit: number | undefined) {
  return unit ? ` ≈ ${Math.round(bp / unit)} units` : ''
}

function readout(
  bp: number,
  referenceBp: number,
  complete: boolean,
  unit?: number,
) {
  const delta = bp - referenceBp
  const against =
    delta === 0 ? '' : ` (${delta > 0 ? '+' : '−'}${kb(Math.abs(delta))})`
  return `${kb(bp)}${units(bp, unit)}${against}${complete ? '' : ' · partial walk'}`
}

function walkRows(p: Pane) {
  const bars = p.walkBars
  if (!bars) {
    return ''
  }
  const X = (bp: number) => bp * p.scaleX + p.translateX
  const Y = (row: number) => row * ROW_HEIGHT_PX * p.scaleY + p.translateY
  const { origin, unit, reference, rows } = bars
  const label = (text: string, endBp: number, y: number) => {
    const x = X(endBp) + 6
    const fits = x + text.length * LABEL_CHAR_PX < p.width
    return `<text x="${fits ? x : X(endBp) - 6}" y="${y + 4}" font-size="11" fill="#333" ${
      fits ? '' : 'stroke="white" stroke-width="3" paint-order="stroke"'
    } text-anchor="${fits ? 'start' : 'end'}">${esc(text)}</text>`
  }
  const out = [
    label(
      `${kb(reference.bp)}${units(reference.bp, unit)}`,
      Math.max(origin + reference.bp, p.regionEnd ?? 0),
      Y(0),
    ),
  ]
  rows.forEach((row, i) => {
    const y = Y(i + 1)
    if (y < -BAR_PX || y > p.height + BAR_PX) {
      return
    }
    for (const run of row.runs) {
      out.push(
        `<rect x="${X(origin + run.start)}" y="${y - BAR_PX / 2}" width="${Math.max(1, run.bp * p.scaleX)}" height="${BAR_PX}" fill="${
          run.onReference ? ON_REFERENCE : OFF_REFERENCE
        }"/>`,
      )
    }
    if (unit && unit * p.scaleX >= MIN_TILE_PX) {
      for (let k = unit; k < row.bp; k += unit) {
        out.push(
          `<line x1="${X(origin + k)}" x2="${X(origin + k)}" y1="${y - BAR_PX / 2}" y2="${y + BAR_PX / 2}" stroke="white"/>`,
        )
      }
    }
    out.push(
      label(
        readout(row.bp, reference.bp, row.complete, unit),
        origin + row.bp,
        y,
      ),
    )
  })
  return out.join('')
}

export function overlaySvg(p: Pane) {
  return alongNodes(p) + leaders(p) + chips(p) + walkRows(p)
}

export function overlayHtml(p: Pane) {
  const rows = p.rowLabels
    .map(({ label, y }) => ({ label, screenY: y * p.scaleY + p.translateY }))
    .filter(({ screenY }) => screenY >= 0 && screenY <= p.height)
    .map(
      ({ label, screenY }) =>
        `<div class="row-label" style="top:${screenY}px">${esc(label)}</div>`,
    )
  const sizes = p.labels.sizes.map(
    ({ text, x, y, kind }) =>
      `<div class="size-label${kind === 'deletion' ? ' deletion' : ''}" style="left:${x}px;top:${y}px">${esc(
        text,
      )}</div>`,
  )
  return rows.join('') + sizes.join('')
}

const RAMP = `linear-gradient(to right, ${Array.from(
  { length: 7 },
  (_, i) =>
    `hsl(${(i / 6) * REFERENCE_RAMP_MAX_HUE}, 70%, 50%) ${(i / 6) * 100}%`,
).join(', ')})`

export function legendsHtml(o: {
  ramp: { start: number; end: number; refName?: string } | undefined
  paths: { name: string; label: string; color: string }[]
  walkBars: WalkRows | undefined
  highlight: LiftedWalk | undefined
  highlightLabel: string | undefined
}) {
  const out: string[] = []
  if (o.ramp) {
    out.push(
      `<div class="legend"><div class="legend-title">${esc(o.ramp.refName ? `${o.ramp.refName} position` : 'Reference position')}</div><div class="ramp" style="background:${RAMP}"></div><div class="ramp-ends"><span>${Math.round(o.ramp.start).toLocaleString()}</span><span>(${formatBp(
        o.ramp.end - o.ramp.start,
      )})</span><span>${Math.round(o.ramp.end).toLocaleString()}</span></div></div>`,
    )
  }
  if (o.paths.length > 0) {
    out.push(
      `<div class="legend">${o.paths
        .map(
          ({ label, color }) =>
            `<div class="legend-row"><div class="swatch" style="background:${color}"></div><span>${esc(label)}</span></div>`,
        )
        .join('')}</div>`,
    )
  }
  if (o.walkBars) {
    out.push(
      `<div class="legend"><div class="legend-row"><div class="swatch bar" style="background:${ON_REFERENCE}"></div><span>sequence ${esc(
        o.walkBars.reference.label,
      )} also carries</span></div><div class="legend-row"><div class="swatch bar" style="background:${OFF_REFERENCE}"></div><span>sequence it does not</span></div></div>`,
    )
  }
  const h = o.highlight
  if (h) {
    const label = o.highlightLabel ?? h.name
    const delta =
      h.referenceBp === undefined || h.bp === h.referenceBp
        ? ''
        : ` ${h.bp > h.referenceBp ? '+' : '−'}${formatBp(Math.abs(h.bp - h.referenceBp))}`
    const reversed =
      h.reversedBp > 0 ? `, ${formatBp(h.reversedBp)} reversed` : ''
    const range = h.range
    // the walk's key: its gradient, from its first coordinate on its own
    // contig to its last, as the reference-position key states its interval
    out.push(
      `<div class="legend"${range ? ` title="${esc(`${range.contig}:${range.start.toLocaleString()}-${range.end.toLocaleString()}`)}"` : ''}><div><strong>${esc(label)}</strong>${delta}${reversed}</div><div class="ramp" style="background:${encodingSwatchCss(h.encoding)}"></div>${
        range
          ? `<div class="ramp-ends"><span>${range.start.toLocaleString()}</span><span>(${formatBp(range.end - range.start)})</span><span>${range.end.toLocaleString()}</span></div>`
          : ''
      }<div class="legend-row"><div class="swatch" style="background:rgba(160,160,160,0.18)"></div><span>not on ${esc(label)}</span></div></div>`,
    )
  }
  return out.join('')
}
