import {
  figureSpecSettings,
  figureSvg,
  referenceLabel,
} from '@jbrowse/bandage-core'

import { notify } from './feedback'
import { HPRC } from './gbz'
import { ownGenesName } from './genes'
import { geneTrackOf } from './hubConfig'
import { referenceName, referenceWindow } from './reference'
import {
  current,
  drawnMode,
  settings,
  state,
  stripGenes,
  stripRows,
} from './state'

// The drawing as the spec @jbrowse/bandage-core's bandage-figure makes it
// from, and as the SVG that makes: what is on screen, fitted, made again from a
// script with `npx -p @jbrowse/bandage-core bandage-figure spec.json`.

export function figureSpec() {
  const { source, graph, region } = state
  if (!source || !graph) {
    return undefined
  }
  const gbz = source.gbz
  const preset = gbz?.db === HPRC.db && gbz.index === HPRC.index
  const lifted = state.walkLayers.length
  const spec = {
    ...(gbz
      ? {
          gbz: {
            db: preset ? 'hprc' : gbz.db,
            index: preset ? undefined : gbz.index,
            region: gbz.region,
            haplotypes: gbz.haplotypes,
            referenceSample: gbz.referenceSample,
          },
        }
      : {
          gfa: source.url ?? source.name,
          region: region && `${region.refName}:${region.start}-${region.end}`,
        }),
    genes: geneSpec(),
    referencePath: state.referencePath || undefined,
    layout: drawnMode().value,
    walkStrip: !!stripRows() || undefined,
    ...figureSpecSettings({
      engine: settings.engine,
      quality: settings.quality,
      bubbleSpread: settings.bubbleSpread,
      spacing: settings.spacing,
      componentSeparation: settings.componentSeparation,
      showDeletionEdges: settings.showDeletionEdges,
      colorScheme: settings.colorScheme,
      nodeWidth: settings.nodeWidth,
      contigThickness: settings.nodeThickness,
    }),
    walks: lifted
      ? state.walkLayers.map(l => (l.color ? l : l.walk))
      : undefined,
    facet: lifted > 1 && settings.facet !== 'none' ? facetInput() : undefined,
    width: state.width,
    height: state.height,
    referenceName:
      referenceName() === referenceLabel(graph, region)
        ? undefined
        : referenceName(),
  }
  // undefined fields drop out
  return JSON.parse(JSON.stringify(spec)) as Record<string, unknown>
}

// the facet as a spec writes it, with the column count only a panel per walk
// takes
function facetInput() {
  return settings.facet === 'walk' && settings.facetColumns
    ? { field: settings.facet, columns: settings.facetColumns }
    : settings.facet
}

// The gene track the backbone's genes came from; a file the user opened has
// no address a spec could name
function geneSpec() {
  const w = referenceWindow()
  const src =
    w && settings.showGenes && !ownGenesName()
      ? geneTrackOf(w)?.genes
      : undefined
  return (
    src &&
    w && {
      file: src.file,
      index: src.index,
      format: src.format,
      refNames: Object.keys(w.contigs).length ? w.contigs : undefined,
    }
  )
}

// why bandage-figure can't make the drawing again, if it can't
export function specBlocked() {
  const m = drawnMode()
  return !state.graph
    ? 'Open a graph first'
    : state.stack.length
      ? 'A spec names the whole graph, so go back out of this bubble first'
      : m.drawsNodes
        ? undefined
        : `bandage-figure draws no ${m.label} layout`
}

// why Export SVG can't draw the current layout, if it can't
export function exportBlocked() {
  return !state.layout
    ? 'Open a graph first'
    : state.layout.tubeMap
      ? 'A tube map draws no nodes to export'
      : undefined
}

export function exportSvg() {
  const { graph, layout } = state
  if (!graph || !layout) {
    return
  }
  // the SVG carries the spec only where the spec draws this same picture
  const spec = specBlocked() ? undefined : figureSpec()
  const d = current()
  const strip = stripRows()
  const svg = figureSvg(graph, layout, {
    width: state.width,
    height: state.height,
    walks: state.walkLayers,
    facet: facetInput(),
    colorScheme: settings.colorScheme,
    nodeWidth: settings.nodeWidth,
    contigThickness: settings.nodeThickness,
    referenceName: referenceName(),
    showDeletionEdges: settings.showDeletionEdges,
    region: state.region,
    // a popped bubble is drawn to its own extent, as it is on screen
    fitToDrawing: state.stack.length > 0,
    genes: settings.showGenes ? state.genes : undefined,
    walkRows: d.bars,
    rowGenes: d.rowGenes,
    rowGeneGaps: state.walkGeneNote,
    walkStrip: strip && {
      rows: strip,
      rowGenes: stripGenes(strip),
      rowGeneGaps: state.walkGeneNote,
    },
    spec,
  })
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `${graph.name.replaceAll(/[^\w.-]+/g, '_')}.svg`
  a.click()
  setTimeout(() => {
    URL.revokeObjectURL(url)
  }, 0)
}

export async function copySpec() {
  const spec = figureSpec()
  if (!spec) {
    return
  }
  try {
    await navigator.clipboard.writeText(`${JSON.stringify(spec, null, 2)}\n`)
    notify(
      'Figure spec copied. Save it as spec.json and run: npx -p @jbrowse/bandage-core bandage-figure spec.json -o figure.svg',
      false,
    )
  } catch (e) {
    notify(`Could not copy the figure spec: ${String(e)}`)
  }
}
