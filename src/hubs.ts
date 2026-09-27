import { aliasRows, hubFrom } from './hubConfig'
import { store, stored } from './settings'
import { hubEntry, mergeOverlays, siteFrom } from './siteConfig'

import type { Hub } from './hubConfig'
import type { HubEntry, HubOverlay, SiteConfig } from './siteConfig'

const SITE_URL = new URL('config.json', location.href).href

let site: SiteConfig = siteFrom({}, SITE_URL)

export const siteReady = fetch(SITE_URL)
  .then(res => (res.ok ? (res.json() as Promise<unknown>) : {}))
  .catch((e: unknown) => {
    console.error(e)
    return {}
  })
  .then(json => {
    site = siteFrom(json, SITE_URL)
  })

export const siteConfig = () => site

// The user's hubs and choices, kept as the site's are
const KEY = 'bandagejs-hubs'

export function userEntries() {
  const saved = stored<unknown>(KEY, [])
  return (Array.isArray(saved) ? saved : [])
    .map(e => hubEntry(e, location.href))
    .filter(e => e !== undefined)
}

function saveEntries(entries: HubEntry[]) {
  store(KEY, entries)
}

export function saveHub(url: string) {
  const entries = userEntries()
  if (!entries.some(e => e.url === url)) {
    saveEntries([{ url }, ...entries])
  }
}

export function forgetHub(url: string) {
  saveEntries(userEntries().filter(e => e.url !== url))
}

// adds to the user's overlay for a hub, which then comes first
export function remember(url: string, overlay: HubOverlay) {
  const entries = userEntries()
  const entry = entries.find(e => e.url === url) ?? { url }
  saveEntries([
    { url, ...mergeOverlays(entry, overlay) },
    ...entries.filter(e => e !== entry),
  ])
}

// stops the user's overlays calling any assembly by `sample`
export function forgetSample(sample: string) {
  const s = sample.toLowerCase()
  saveEntries(
    userEntries().map(e => ({
      ...e,
      aliases: Object.fromEntries(
        Object.entries(e.aliases ?? {}).map(([assembly, names]) => [
          assembly,
          names.filter(n => n.toLowerCase() !== s),
        ]),
      ),
    })),
  )
}

export interface OrderedHub {
  url: string
  site: HubOverlay
  user: HubOverlay
}

// A link's hubs, then the user's, then the site's, each once with the site's
// overlay and the user's apart, so a binding can say which it came from
export function orderedHubs(linked: string[]): OrderedHub[] {
  const user = userEntries()
  const urls = [
    ...new Set([
      ...linked,
      ...user.map(e => e.url),
      ...site.hubs.map(e => e.url),
    ]),
  ]
  return urls.map(url => ({
    url,
    site: site.hubs.find(e => e.url === url) ?? {},
    user: user.find(e => e.url === url) ?? {},
  }))
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
