import { panSNContig } from '@jbrowse/bandage-core'

import type { Region } from './jbrowse'

// Regions on the reference as people type them: `chr6:160,614,798-160,647,758`,
// `chr6:160614798..160647758`, or one position, `chr6:160,614,798`

export function parseLocation(text: string): Region | undefined {
  const m = /^\s*([^:\s]+):\s*([\d,]+)(?:\s*(?:-|\.\.)\s*([\d,]+))?\s*$/.exec(
    text,
  )
  if (!m) {
    return undefined
  }
  const n = (s: string) => Number(s.replaceAll(',', ''))
  const start = n(m[2]!)
  const end = m[3] ? n(m[3]) : start + 1
  return end > start ? { refName: m[1]!, start, end } : undefined
}

const grouped = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',')

export function formatRegion(r: Region) {
  return `${r.refName}:${grouped(r.start)}-${grouped(r.end)}`
}

// Whether `typed` names the contig `refName`: in full, or by the bare contig
// of a PanSN name, so `chr6` finds `GRCh38#0#chr6`
export function namesContig(typed: string, refName: string) {
  return typed === refName || panSNContig(typed) === panSNContig(refName)
}

// The region moved along its contig by `fraction` of its width, back when
// negative, no further than the contig's start
export function shifted(r: Region, fraction: number): Region {
  const width = r.end - r.start
  const start = Math.max(0, r.start + Math.round(width * fraction))
  return { refName: r.refName, start, end: start + width }
}

// Whether `inner` lies within `outer` on the same contig
export function within(inner: Region, outer: Region) {
  return (
    namesContig(inner.refName, outer.refName) &&
    inner.start >= outer.start &&
    inner.end <= outer.end
  )
}
