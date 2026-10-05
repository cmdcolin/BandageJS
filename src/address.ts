// The page's address, rewritten in place as the view changes so that it links
// back to what is on screen

export function replaceQuery(query: URLSearchParams) {
  const text = query.toString()
  history.replaceState(null, '', text ? `?${text}` : location.pathname)
}

// whether the address names a graph; a file opened from this computer has
// nothing to link to
export const linkable = () => location.search.length > 1

// Swaps the parameters named `keys` for `entries`, in an address that names a
// graph
export function replaceParams(keys: string[], entries: [string, string][]) {
  const query = new URLSearchParams(location.search)
  if (query.size === 0) {
    return
  }
  for (const k of keys) {
    query.delete(k)
  }
  for (const [k, v] of entries) {
    query.append(k, v)
  }
  replaceQuery(query)
}

// The layout point at the pane's centre and the zoom, as `view` states them
export interface View {
  x: number
  y: number
  scale: number
}

const short = (n: number) => String(Number(n.toPrecision(6)))

export function formatView(v: View) {
  return [v.x, v.y, v.scale].map(short).join(',')
}

export function parseView(text: string | null): View | undefined {
  const [x, y, scale] = (text ?? '').split(',').map(Number)
  return text && [x, y, scale].every(n => Number.isFinite(n)) && scale! > 0
    ? { x: x!, y: y!, scale: scale! }
    : undefined
}
