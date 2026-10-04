// The page's address, rewritten in place as the view changes so that it links
// back to what is on screen

export function replaceQuery(query: URLSearchParams) {
  const text = query.toString()
  history.replaceState(null, '', text ? `?${text}` : location.pathname)
}

// Swaps the parameters named `keys` for `entries`, in an address that names a
// graph; a file opened from this computer has none to link to
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
