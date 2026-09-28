import { figureSvg } from '@jbrowse/bandage-core'

import { notify } from './feedback'
import { HPRC } from './gbz'
import { drawnMode, settings, state } from './state'

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
    referencePath: state.referencePath || undefined,
    layout: drawnMode().value,
    quality: settings.quality,
    bubbleSpread: settings.bubbleSpread,
    walks: lifted
      ? state.walkLayers.map(l => (l.color ? l : l.walk))
      : undefined,
    facet: lifted > 1 && settings.facet !== 'none' ? settings.facet : undefined,
    columns:
      settings.facet === 'walk' && settings.facetColumns
        ? settings.facetColumns
        : undefined,
    width: state.width,
    height: state.height,
    colorScheme: settings.colorScheme,
    nodeWidth: settings.nodeWidth,
    showDeletionEdges: settings.showDeletionEdges || undefined,
  }
  // undefined fields drop out
  return JSON.parse(JSON.stringify(spec)) as Record<string, unknown>
}

export function canExport() {
  return !!state.layout && !state.layout.tubeMap
}

export function exportSvg() {
  const { graph, layout } = state
  const spec = figureSpec()
  if (!graph || !layout || !spec) {
    return
  }
  const svg = figureSvg(graph, layout, {
    width: state.width,
    height: state.height,
    walks: state.walkLayers,
    facet: settings.facet,
    columns: settings.facetColumns || undefined,
    colorScheme: settings.colorScheme,
    nodeWidth: settings.nodeWidth,
    showDeletionEdges: settings.showDeletionEdges,
    region: state.region,
    metadata: JSON.stringify(spec),
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
