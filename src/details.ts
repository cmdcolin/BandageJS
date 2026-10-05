import {
  BUBBLE_KIND_NAMES,
  bubbleSegmentIds,
  classifyBubble,
  formatBp,
} from '@jbrowse/bandage-core'

import { popBubble } from './bubbles'
import { depthVaries, memo } from './derived'
import { genesOn } from './describe'
import { notify } from './feedback'
import { selectNode } from './find'
import { nodeLink } from './jbrowse'
import { nodeLinks, ownStrand, walksThrough } from './nodeDetails'
import { esc } from './overlays'
import { referenceWindow, targetOf } from './reference'
import { current, facts, selectedNode, state, tube } from './state'
import { ui } from './ui'
import { onDraw, scheduleDraw } from './view'
import { liftWalks, toggleWalk } from './walks'

import type { NodeLink } from './nodeDetails'
import type {
  Graph,
  GraphEdge,
  GraphNode,
  MinigraphBubble,
} from '@jbrowse/bandage-core'

// The selected node's details beside the drawing: where it lies, the links at
// each of its ends, the walks through it, its bubble and its genes. A
// neighbour's name selects that node and frames it, so the panel walks the
// graph a link at a time.

const SHOWN_WALKS = 12

const linksOf = memo((graph: Graph, id: string) => nodeLinks(graph, id))

const walksOf = memo((graph: Graph, node: GraphNode) =>
  walksThrough(graph, node, id => facts().nodeById.get(id)?.length ?? 0),
)

const deletionsOf = memo(
  (all: ReturnType<typeof facts>['allDeletions']) =>
    new Map(all.map(d => [d.edgeIndex, d])),
)

// the node whose every walk the panel lists, rather than the first few
let allWalksOf: string | undefined
// what to focus once the panel draws again
let refocus: string | undefined

const minus = (strand: string) => (strand === '-' ? '−' : '+')

function span(contig: string, start: number, end: number) {
  return end - start === 1
    ? `${contig}:${end.toLocaleString()}`
    : `${contig}:${(start + 1).toLocaleString()}-${end.toLocaleString()}`
}

// a link as its L line reads it, `3+ → 65−`
function gfaLink(e: GraphEdge) {
  const name = (id: string) => facts().nodeById.get(id)?.name ?? id
  return `${name(e.from)}${minus(e.fromStrand ?? ownStrand(e.from))} → ${name(e.to)}${minus(e.toStrand ?? ownStrand(e.to))}`
}

function linksHtml(node: GraphNode, links: NodeLink[]) {
  if (links.length === 0) {
    return '<p class="none">No links</p>'
  }
  const graph = state.graph!
  const { nodeById, allDeletions } = facts()
  const deletions = deletionsOf(allDeletions)
  const walked = !!graph.paths?.length
  return `<ul>${links
    .map(l => {
      const other = nodeById.get(l.nodeId)
      const edge = graph.edges[l.edgeIndex]!
      const deletion = deletions.get(l.edgeIndex)
      const walks = edge.pathIds?.length ?? 0
      const facts = [
        l.nodeId === node.id ? 'itself' : formatBp(other?.length ?? 0),
        ...(other?.stable?.rank === 0 ? ['reference'] : []),
        ...(walked ? [`${walks} walk${walks === 1 ? '' : 's'}`] : []),
        ...(deletion ? [`deletion of ${formatBp(deletion.bp)}`] : []),
      ]
      return `<li><button type="button" class="node-link" data-node="${esc(l.nodeId)}">${esc(other?.name ?? l.nodeId)}</button> <small>${esc(facts.join(' · '))}</small><code>${esc(gfaLink(edge))}</code></li>`
    })
    .join('')}</ul>`
}

function walksHtml(node: GraphNode) {
  const graph = state.graph!
  const all = graph.paths?.length ?? 0
  if (all === 0) {
    return ''
  }
  const through = walksOf(graph, node)
  const lifted = new Set(state.walkLayers.map(l => l.walk))
  const labels = facts().walkLabels
  const liftable = !tube()
  const shown = allWalksOf === node.id ? through : through.slice(0, SHOWN_WALKS)
  const rows = shown.map(w => {
    const label = esc(labels.get(w.name) ?? w.name)
    const at = [
      span(w.at.contig, w.at.start, w.at.end),
      ...(w.strand ? [`${minus(w.strand)} strand`] : []),
      ...(w.visits > 1 ? [`${w.visits} times`] : []),
    ].join(', ')
    return liftable
      ? `<li><label><input type="checkbox" data-walk="${esc(w.name)}"${lifted.has(w.name) ? ' checked' : ''}> ${label}</label><small>${esc(at)}</small></li>`
      : `<li>${label}<small>${esc(at)}</small></li>`
  })
  const more =
    through.length > shown.length
      ? `<button type="button" class="node-link" data-all>Show all ${through.length}</button>`
      : ''
  const liftAll =
    liftable && through.length > 1
      ? `<button type="button" class="node-link" data-lift-all>Highlight them all</button>`
      : ''
  return `<section><h3>Walks through it <small>${through.length} of ${all}</small></h3>${
    through.length
      ? `${liftable ? '<p class="hint">Tick a walk to highlight it</p>' : ''}<ul class="walks">${rows.join('')}</ul><p class="walk-actions">${more}${liftAll}</p>`
      : '<p class="none">None</p>'
  }</section>`
}

// The bubbles a node is in, as the drawing labels them where it does; not a
// popped view's own bubble, which is all of the graph on screen
function bubblesOf(node: GraphNode) {
  const graph = state.graph!
  const shown: { label: string; bubble: MinigraphBubble }[] = current().halos
    .length
    ? current().halos.filter(h => h.nodeIds.includes(node.id))
    : facts()
        .bubbles.filter(b => bubbleSegmentIds(b).includes(node.name))
        .map(bubble => ({
          label: BUBBLE_KIND_NAMES[classifyBubble(bubble).kind],
          bubble,
        }))
  const whole = (b: MinigraphBubble) => {
    const ids = new Set(bubbleSegmentIds(b))
    return (
      ids.size === graph.nodes.length && graph.nodes.every(n => ids.has(n.name))
    )
  }
  return state.stack.length ? shown.filter(s => !whole(s.bubble)) : shown
}

let bubbles: MinigraphBubble[] = []

function bubblesHtml(node: GraphNode) {
  const mine = bubblesOf(node)
  bubbles = mine.map(b => b.bubble)
  return mine.length
    ? `<section><h3>Bubble</h3><ul>${mine
        .map(
          (b, i) =>
            `<li><button type="button" class="node-link" data-bubble="${i}">Open ${esc(b.label)}</button></li>`,
        )
        .join('')}</ul></section>`
    : ''
}

function genesHtml(node: GraphNode) {
  const genes = genesOn(node, state.genes)
  return genes.length
    ? `<section><h3>Genes</h3><ul>${genes
        .map(g => {
          const here = !g.exons
            ? 'intron here'
            : g.spliced
              ? `${g.exons} exon${g.exons > 1 ? 's' : ''} here`
              : ''
          return `<li><em>${esc(g.name)}</em>${here ? ` <small>${here}</small>` : ''}</li>`
        })
        .join('')}</ul></section>`
    : ''
}

function placeHtml(node: GraphNode) {
  const s = node.stable
  const lines = [
    `${node.length.toLocaleString()} bp${
      depthVaries(state.graph!) ? ` · depth ${node.depth.toFixed(1)}` : ''
    }`,
    ...(ownStrand(node.id) === '-'
      ? [`<small>Drawn reverse-complemented, as ${esc(node.name)}−</small>`]
      : []),
  ]
  return `<p>${lines.join('<br>')}</p>${
    s
      ? `<p>${esc(span(s.refName, s.start, s.start + node.length))}<br><small>${
          s.rank === 0
            ? 'On the reference'
            : `Off the reference: rGFA rank ${s.rank}, its coordinates on the assembly above`
        }</small></p>`
      : ''
  }${
    node.samples?.length && !state.graph!.paths?.length
      ? `<p><small>Carried by ${esc(node.samples.join(', '))}</small></p>`
      : ''
  }`
}

function detailsHtml(node: GraphNode) {
  const links = linksOf(state.graph!, node.id)
  const ref = referenceWindow()
  const jbrowse = ref && nodeLink(node, targetOf(ref), ref.contigs)
  return `<header><h2 tabindex="-1">${esc(node.name)}</h2><button type="button" data-close aria-label="Close the node's details">✕</button></header>
${placeHtml(node)}
<div class="details-actions"><button type="button" data-zoom>Zoom to it</button><button type="button" data-copy>Copy name</button>${
    jbrowse
      ? `<a href="${esc(jbrowse)}" target="_blank" rel="noopener">JBrowse ↗</a>`
      : ''
  }</div>
<section><h3>At its start</h3>${linksHtml(node, links.start)}</section>
<section><h3>At its end</h3>${linksHtml(node, links.end)}</section>
${bubblesHtml(node)}${walksHtml(node)}${genesHtml(node)}`
}

// the selector for the panel's control `el`, by the data attribute that
// names it, so focus finds it again once the markup is replaced
function selectorOf(el: Element | null) {
  const attr = el && [...el.attributes].find(a => a.name.startsWith('data-'))
  return attr
    ? attr.value
      ? `[${attr.name}="${CSS.escape(attr.value)}"]`
      : `[${attr.name}]`
    : undefined
}

let shown = ''

function drawDetails() {
  const node = selectedNode()
  ui.details.hidden = !node
  ui.pane.classList.toggle('details-open', !!node)
  const html = node ? detailsHtml(node) : ''
  if (html === shown) {
    return
  }
  shown = html
  const focused = ui.details.contains(document.activeElement)
    ? selectorOf(document.activeElement)
    : undefined
  ui.details.innerHTML = html
  const target = refocus ?? focused
  refocus = undefined
  if (target) {
    ui.details.querySelector<HTMLElement>(target)?.focus()
  }
}

onDraw(drawDetails)

ui.details.addEventListener('click', e => {
  const target = e.target as Element
  const pick = (name: string) =>
    target.closest<HTMLElement>(`[data-${name}]`)?.dataset[name]
  const node = pick('node')
  const bubble = pick('bubble')
  const id = state.selectedNode
  if (target.closest('[data-close]')) {
    state.selectedNode = null
    scheduleDraw()
  } else if (node) {
    refocus = 'h2'
    selectNode(node)
  } else if (target.closest('[data-zoom]') && id) {
    selectNode(id)
  } else if (target.closest('[data-copy]') && id) {
    const name = facts().nodeById.get(id)?.name ?? ''
    navigator.clipboard.writeText(name).then(
      () => notify(`Copied ${name}`, false),
      (err: unknown) => notify(`Could not copy: ${String(err)}`),
    )
  } else if (target.closest('[data-all]') && id) {
    allWalksOf = id
    scheduleDraw()
  } else if (target.closest('[data-lift-all]')) {
    const node = selectedNode()
    if (node) {
      liftWalks(walksOf(state.graph!, node).map(w => w.name))
    }
  } else if (bubble !== undefined) {
    const b = bubbles[Number(bubble)]
    if (b) {
      popBubble(b)
    }
  }
})

ui.details.addEventListener('change', e => {
  const walk = (e.target as HTMLElement).dataset.walk
  if (walk) {
    toggleWalk(walk)
  }
})

// a neighbour's name rings its node in the drawing
ui.details.addEventListener('mouseover', e => {
  const id =
    (e.target as Element).closest<HTMLElement>('[data-node]')?.dataset.node ??
    null
  if (id !== state.hoveredNode) {
    state.hoveredNode = id
    scheduleDraw()
  }
})

ui.details.addEventListener('mouseleave', () => {
  state.hoveredNode = null
  scheduleDraw()
})
