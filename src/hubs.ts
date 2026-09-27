import { aliasRows, hubFrom } from './hubConfig'
import { store, stored } from './settings'

import type { Hub } from './hubConfig'

// The HPRC portal: hg38 as GRCh38 and every HPRC haplotype as its own
// assembly, with their genes. Then UCSC's T2T-CHM13, hs1.
export const DEFAULT_HUBS = [
  'https://jbrowse.org/pangenome/hprc-grch38/config.json',
  'https://jbrowse.org/ucsc/hs1/config.json',
]

const KEY = 'bandagejs-hubs'

export function savedHubs() {
  const saved = stored<unknown>(KEY, [])
  return Array.isArray(saved)
    ? saved.filter((u): u is string => typeof u === 'string')
    : []
}

export function saveHub(url: string) {
  store(KEY, [url, ...savedHubs().filter(u => u !== url)])
}

export function forgetHub(url: string) {
  store(
    KEY,
    savedHubs().filter(u => u !== url),
  )
}

// a link's hubs, then the user's, then the defaults: the first to know an
// assembly binds it
export function hubUrls(linked: string[] = []) {
  return [...new Set([...linked, ...savedHubs(), ...DEFAULT_HUBS])]
}

const hubs = new Map<string, Promise<Hub>>()

export function loadHub(url: string) {
  let hub = hubs.get(url)
  if (!hub) {
    hub = fetch(url)
      .then(res => {
        if (!res.ok) {
          throw new Error(`HTTP ${res.status} fetching ${url}`)
        }
        return res.json() as Promise<unknown>
      })
      .then(json => hubFrom(json, url))
    hubs.set(url, hub)
    hub.catch(() => hubs.delete(url))
  }
  return hub
}

const aliases = new Map<string, Promise<string[][]>>()

export function loadAliases(url: string) {
  let rows = aliases.get(url)
  if (!rows) {
    rows = fetch(url)
      .then(res => {
        if (!res.ok) {
          throw new Error(`HTTP ${res.status} fetching ${url}`)
        }
        return res.text()
      })
      .then(aliasRows)
    aliases.set(url, rows)
    rows.catch(() => aliases.delete(url))
  }
  return rows
}
