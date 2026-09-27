import { FIT_PADDING, clampZoom } from '@jbrowse/bandage-core'

// A found node takes up at most this much of the pane each way, leaving the
// rest for its neighbours
export const NODE_SHARE = 1 / 3

// Pixels per layout unit: 10 px a bp in the anchored layouts, 50 px for the
// force layout's shortest node
export const MAX_FIND_ZOOM = 10

const lowered = new WeakMap<readonly { name: string }[], string[]>()

function lowerNames(nodes: readonly { name: string }[]) {
  let names = lowered.get(nodes)
  if (!names) {
    names = nodes.map(n => n.name.toLowerCase())
    lowered.set(nodes, names)
  }
  return names
}

// Exact matches, then prefixes, then names containing the query, ignoring
// case, each in graph order
export function findNodes<T extends { name: string }>(
  nodes: readonly T[],
  query: string,
  limit = Infinity,
) {
  const q = query.trim().toLowerCase()
  if (q === '' || limit <= 0) {
    return []
  }
  const exact: T[] = []
  const prefix: T[] = []
  const within: T[] = []
  lowerNames(nodes).forEach((name, i) => {
    if (name === q) {
      exact.push(nodes[i]!)
    } else if (name.startsWith(q)) {
      if (prefix.length < limit) {
        prefix.push(nodes[i]!)
      }
    } else if (within.length < limit && name.includes(q)) {
      within.push(nodes[i]!)
    }
  })
  return [...exact, ...prefix, ...within].slice(0, limit)
}

// The zoom that frames a node whose box measures `unit` on screen at zoom 1.
// Pixel rows don't scale with zoom, so only the width counts there. It never
// zooms out past `least`, the graph's own fit.
export function frameScale(
  unit: { w: number; h: number },
  width: number,
  height: number,
  pixelRows: boolean,
  least = 0,
) {
  const byX =
    unit.w > 0 ? ((width - FIT_PADDING * 2) * NODE_SHARE) / unit.w : Infinity
  const byY =
    !pixelRows && unit.h > 0
      ? ((height - FIT_PADDING * 2) * NODE_SHARE) / unit.h
      : Infinity
  return clampZoom(Math.max(least, Math.min(byX, byY, MAX_FIND_ZOOM)))
}
