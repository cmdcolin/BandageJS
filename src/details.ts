import { formatBp } from '@jbrowse/bandage-core'

import { popBubble } from './bubbles'
import { memo } from './derived'
import { genesOn } from './describe'
import { notify } from './feedback'
import { frameNode } from './find'
import { nodeLink } from './jbrowse'
import { nodeLinks, walksThrough } from './nodeDetails'
import { esc } from './overlays'
import { referenceWindow, targetOf } from './reference'
import { current, facts, settings, state, tube } from './state'
import { ui } from './ui'
import { onDraw, scheduleDraw } from './view'
import { toggleWalk } from './walks'

import type { NodeLink } from './nodeDetails'
import type { Graph, GraphNode } from '@jbrowse/bandage-core'

// The selected node's details beside the drawing: where it lies, the nodes
// at each of its ends, the walks through it, its bubble and its genes. A
// neighbour's name selects that node and frames it, so the panel walks the
// graph a link at a time.

const MAX_WALKS = 12

const linksOf = memo((graph: Graph, id: string) => nodeLinks(graph, id))

const walksOf = memo((graph: Graph, node: GraphNode) =>
  walksThrough(graph, node, id => facts().nodeById.get(id)?.length ?? 0),
)

function span(contig: string, start: number, end: number) {
  return end - start === 1
    ? `${contig}:${end.toLocaleString()}`
    : `${contig}:${(start + 1).toLocaleString()}-${end.toLocaleString()}`
}

function linksHtml(node: GraphNode, links: NodeLink[]) {
  if (links.length === 0) {
    return '<p class="none">No links</p>'
  }
  const { nodeById } = facts()
  const deletions = new Map(current().deletions.map(d => [d.edgeIndex, d]))
  return `<ul>${links
    .map(l => {
      const other = nodeById.get(l.nodeId)
      const deletion = deletions.get(l.edgeIndex)
      const what = [
        l.nodeId === node.id ? 'itself' : formatBp(other?.length ?? 0),
        `its ${l.side}`,
        ...(deletion ? [`skips ${formatBp(deletion.bp)}`] : []),
      ]
      return `<li><button type="button" class="node-link" data-node="${esc(l.nodeId)}">${esc(other?.name ?? l.nodeId)}</button> <small>${esc(what.join(', '))}</small></li>`
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
  const rows = through.slice(0, MAX_WALKS).map(w => {
    const label = esc(labels.get(w.name) ?? w.name)
    const visits = w.visits > 1 ? `, ${w.visits} times` : ''
    const at = `<small>${esc(span(w.at.contig, w.at.start, w.at.end))}${visits}</small>`
    return liftable
      ? `<li><label><input type="checkbox" data-walk="${esc(w.name)}"${lifted.has(w.name) ? ' checked' : ''}> ${label}</label>${at}</li>`
      : `<li>${label}${at}</li>`
  })
  const more =
    through.length > MAX_WALKS
      ? `<p class="none">and ${through.length - MAX_WALKS} more</p>`
      : ''
  return `<section><h3>Walks through it <small>${through.length} of ${all}</small></h3>${
    through.length
      ? `${liftable ? '<p class="hint">Tick a walk to lift it out of the drawing</p>' : ''}<ul class="walks">${rows.join('')}</ul>${more}`
      : '<p class="none">None</p>'
  }</section>`
}

function bubblesHtml(node: GraphNode) {
  const halos = current().halos
  const mine = halos.filter(h => h.nodeIds.includes(node.id))
  return mine.length
    ? `<section><h3>Bubble</h3><ul>${mine
        .map(
          h =>
            `<li><button type="button" class="node-link" data-bubble="${halos.indexOf(h)}">${esc(h.label)}</button> <small>open it on its own</small></li>`,
        )
        .join('')}</ul></section>`
    : ''
}

function genesHtml(node: GraphNode) {
  const genes = genesOn(node, settings.showGenes ? state.genes : undefined)
  return genes.length
    ? `<section><h3>Genes</h3><ul>${genes
        .map(
          g =>
            `<li><em>${esc(g.name)}</em> <small>${
              !g.exons
                ? 'intron here'
                : g.spliced
                  ? `${g.exons} exon${g.exons > 1 ? 's' : ''} here`
                  : ''
            }</small></li>`,
        )
        .join('')}</ul></section>`
    : ''
}

function detailsHtml(node: GraphNode) {
  const graph = state.graph!
  const links = linksOf(graph, node.id)
  const s = node.stable
  const ref = referenceWindow()
  const jbrowse = ref && nodeLink(node, targetOf(ref), ref.contigs)
  return `<header><h2>${esc(node.name)}</h2><button type="button" data-close aria-label="Close the node's details">✕</button></header>
<p>${node.length.toLocaleString()} bp · depth ${node.depth.toFixed(1)}</p>${
    s
      ? `<p>${esc(span(s.refName, s.start, s.start + node.length))}<br><small>${
          s.rank === 0 ? 'on the reference' : `rank ${s.rank} off the reference`
        }</small></p>`
      : ''
  }
<div class="details-actions"><button type="button" data-zoom>Zoom to it</button><button type="button" data-copy>Copy name</button>${
    jbrowse
      ? `<a href="${esc(jbrowse)}" target="_blank" rel="noopener">JBrowse ↗</a>`
      : ''
  }</div>
<section><h3>At its start</h3>${linksHtml(node, links.start)}</section>
<section><h3>At its end</h3>${linksHtml(node, links.end)}</section>
${bubblesHtml(node)}${walksHtml(node)}${genesHtml(node)}`
}

let shown = ''

function drawDetails() {
  const node = state.selectedNode
    ? facts().nodeById.get(state.selectedNode)
    : undefined
  ui.details.hidden = !node
  ui.pane.classList.toggle('details-open', !!node)
  const html = node ? detailsHtml(node) : ''
  if (html !== shown) {
    shown = html
    ui.details.innerHTML = html
  }
}

onDraw(drawDetails)

function select(id: string) {
  state.selectedNode = id
  state.hoveredNode = null
  if (!frameNode(id)) {
    notify(`${facts().nodeById.get(id)?.name ?? id} isn't drawn here`, false)
  }
  scheduleDraw()
}

ui.details.addEventListener('click', e => {
  const target = e.target as Element
  const node = target.closest<HTMLElement>('[data-node]')?.dataset.node
  const bubble = target.closest<HTMLElement>('[data-bubble]')?.dataset.bubble
  if (target.closest('[data-close]')) {
    state.selectedNode = null
    scheduleDraw()
  } else if (node) {
    select(node)
  } else if (target.closest('[data-zoom]') && state.selectedNode) {
    select(state.selectedNode)
  } else if (target.closest('[data-copy]') && state.selectedNode) {
    const name = facts().nodeById.get(state.selectedNode)?.name ?? ''
    navigator.clipboard.writeText(name).then(
      () => notify(`Copied ${name}`, false),
      (err: unknown) => notify(`Could not copy: ${String(err)}`),
    )
  } else if (bubble !== undefined) {
    const halo = current().halos[Number(bubble)]
    if (halo) {
      popBubble(halo.bubble)
    }
  }
})

ui.details.addEventListener('change', e => {
  const walk = (e.target as HTMLElement).dataset.walk
  if (walk) {
    toggleWalk(walk)
  }
})

// a neighbour's name lights its node in the drawing
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
