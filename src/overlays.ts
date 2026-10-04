import {
  BUBBLE_KIND_COLORS,
  HALO_FACTOR,
  LABEL_PAD,
  LABEL_PX,
  RAMP_GRADIENT_CSS,
  REFERENCE_RAMP_MAX_HUE,
  encodingSwatchCss,
  formatBp,
  walkKey,
  el,
  serializeEl,
  walkRowsKey,
  walkRowsTree,
} from '@jbrowse/bandage-core'

import { geneText } from './describe'

import type {
  BubbleHalo,
  GeneGaps,
  GenePin,
  KeyEntry,
  LabelLayout,
  LiftedWalk,
  RowGene,
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
  // each node's drawn half width, which its exons tick past
  halfWidthPx: (nodeId: string) => number
  labels: LabelLayout
  rowLabels: { label: string; y: number }[]
  walkBars: WalkRows | undefined
  // each walk row's genes, by walk name, as offsets along its bar
  rowGenes: Map<string, RowGene[]> | undefined
  // the reference-position ramp's interval, where the bars take its hues
  walkRamp: { start: number; end: number } | undefined
  // where the cut window ends, which the backbone the canvas draws runs to
  regionEnd: number | undefined
  highlight: WalkLift | undefined
}

const EXON_COLOR = '#1c1c22'
// an exon stands out past the node it lies on, as a tick across it
const EXON_PER_NODE_WIDTH = 1.8
// under lifted walks an exon is a faint band across their lanes
const EXON_BAND_LANE_PX = 4

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
  const lanes = p.highlight?.walks.length
  const exons = lanes
    ? p.genePins
        .filter(pin => pin.exons)
        .map(
          pin =>
            `<path d="${pin.exons}" fill="none" stroke="${EXON_COLOR}" stroke-opacity="0.2" stroke-width="${
              lanes * EXON_BAND_LANE_PX + 6
            }" vector-effect="non-scaling-stroke"/>`,
        )
    : p.genePins.flatMap(pin =>
        pin.exonsByNode.map(
          ({ nodeId, d }) =>
            `<path d="${d}" fill="none" stroke="${EXON_COLOR}" stroke-opacity="0.9" stroke-width="${
              2 * p.halfWidthPx(nodeId) * EXON_PER_NODE_WIDTH
            }" vector-effect="non-scaling-stroke"/>`,
        ),
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

// Walk rows as core's element tree, so they read the same here, in the plugin
// and in an exported figure
export function walkRowsLayer(p: Pane) {
  return p.walkBars
    ? walkRowsTree(
        p.walkBars,
        {
          scaleX: p.scaleX,
          scaleY: p.scaleY,
          translateX: p.translateX,
          translateY: p.translateY,
          width: p.width,
          height: p.height,
        },
        { ramp: p.walkRamp, rowGenes: p.rowGenes },
      )
    : undefined
}

export function overlaySvg(p: Pane) {
  return alongNodes(p) + leaders(p) + chips(p)
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

// a node off the lifted walks: grey at the fade's alpha
const FADED_SWATCH = 'rgba(160, 160, 160, 0.18)'

// One walk's key: a swatch, or a short bar of the scale its lane shades by,
// then its name, with the stretch that scale runs over under it. `at`, where
// the hovered node sits on the walk, stands in for the stretch while there is
// one.
export function walkKeyHtml(
  walk: LiftedWalk,
  label: string,
  reference?: { name?: string; start: number; end: number },
  hint?: string,
  at?: string,
) {
  const key = walkKey(walk, reference)
  const title = [key.hover, hint].filter(Boolean).join(' · ')
  return `<div class="walk-key"${title ? ` title="${esc(title)}"` : ''}><div class="legend-row"><div class="swatch walk${
    key.shades ? ' scale' : ''
  }" style="background:${encodingSwatchCss(walk.encoding)}"></div><span><strong>${esc(label)}</strong>${esc(
    key.delta + key.reversed,
  )}</span></div><div class="walk-at">${esc(at ?? key.scale ?? '')}</div></div>`
}

export function walkRowsKeyHtml(entries: KeyEntry[]) {
  return serializeEl(
    el(
      'div',
      { class: 'legend' },
      ...entries.map(e =>
        e.note
          ? el('div', { class: 'legend-note' }, e.label)
          : el(
              'div',
              { class: 'legend-row' },
              el('div', {
                class: `swatch bar${e.swatch.kind === 'gene' ? ' gene-box' : ''}${e.swatch.kind === 'gap' ? ' gap' : ''}`,
                style:
                  e.swatch.kind === 'gene'
                    ? undefined
                    : `background:${e.swatch.fill}`,
              }),
              el('span', {}, e.label),
            ),
      ),
    ),
  )
}

const EXON_SWATCH = `<svg class="swatch-exon" width="18" height="12" viewBox="0 0 18 12" aria-hidden="true"><rect y="3" width="18" height="6" rx="3" fill="#b9bec6"/><rect x="7" width="3" height="12" fill="${EXON_COLOR}"/></svg>`

export function legendsHtml(o: {
  ramp: { start: number; end: number; refName?: string } | undefined
  // where the exons ticked across the backbone come from
  exons: string | undefined
  paths: { name: string; label: string; color: string }[]
  walkBars: WalkRows | undefined
  // the walk rows' gene key, with the rows it couldn't read genes for
  rowGenes: GeneGaps | undefined
  walkRamp: { start: number; end: number } | undefined
  walks: { walk: LiftedWalk; label: string; at?: string }[]
  reference: { name?: string; start: number; end: number } | undefined
}) {
  const out: string[] = []
  if (o.ramp) {
    out.push(
      `<div class="legend"><div class="legend-title">${esc(o.ramp.refName ? `${o.ramp.refName} position` : 'Reference position')}</div><div class="ramp" style="background:${RAMP}"></div><div class="ramp-ends"><span>${Math.round(o.ramp.start).toLocaleString()}</span><span>(${formatBp(
        o.ramp.end - o.ramp.start,
      )})</span><span>${Math.round(o.ramp.end).toLocaleString()}</span></div></div>`,
    )
  }
  if (o.exons) {
    out.push(
      `<div class="legend"><div class="legend-row">${EXON_SWATCH}<span>Exon, from ${esc(o.exons)}</span></div></div>`,
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
      walkRowsKeyHtml(
        walkRowsKey(o.walkBars, {
          ramp: o.walkRamp,
          rampCss: RAMP_GRADIENT_CSS,
          genes: o.rowGenes,
        }),
      ),
    )
  }
  if (o.walks.length > 0) {
    const notOn = o.walks.length === 1 ? o.walks[0]!.label : 'these walks'
    out.push(
      `<div class="legend walks">${o.walks
        .map(({ walk, label, at }) =>
          walkKeyHtml(walk, label, o.reference, undefined, at),
        )
        .join(
          '',
        )}<div class="legend-row"><div class="swatch walk" style="background:${FADED_SWATCH}"></div><span>not on ${esc(notOn)}</span></div></div>`,
    )
  }
  return out.join('')
}
