import { readFileSync } from 'node:fs'

import { expect, test as base } from '@playwright/test'

import type { Locator, Page, Route } from '@playwright/test'

export { expect }

const REFSEQ = /jbrowse\.org\/ucsc\/hg38\/ncbiRefSeq\.gff\.gz(\.csi)?$/
const REFSEQ_FIXTURE = {
  gff: readFileSync(new URL('data/ncbiRefSeq.gff.gz', import.meta.url)),
  csi: readFileSync(new URL('data/ncbiRefSeq.gff.gz.csi', import.meta.url)),
}

// A file served the way a static host serves one, answering a byte range
function serveRange(route: Route, body: Buffer) {
  const cors = {
    'access-control-allow-origin': '*',
    'access-control-expose-headers': 'content-range',
  }
  const range = /bytes=(\d+)-(\d*)/.exec(route.request().headers().range ?? '')
  if (!range) {
    return route.fulfill({ body, headers: cors })
  }
  const start = Number(range[1])
  const end = Math.min(range[2] ? Number(range[2]) : Infinity, body.length - 1)
  return route.fulfill({
    status: 206,
    body: body.subarray(start, end + 1),
    headers: {
      ...cors,
      'content-range': `bytes ${start}-${end}/${body.length}`,
    },
  })
}

export const test = base.extend<{
  consoleErrors: string[]
  blocked: string[]
  geneRequests: string[]
}>({
  consoleErrors: async ({ page }, use) => {
    const errors: string[] = []
    page.on('console', m => {
      if (m.type() === 'error') {
        errors.push(m.text())
      }
    })
    page.on('pageerror', e => errors.push(e.message))
    await use(errors)
  },
  blocked: [
    async ({ page }, use) => {
      const urls: string[] = []
      await page.route(/amazonaws\.com|jbrowse\.org/, route => {
        urls.push(route.request().url())
        return route.abort()
      })
      await use(urls)
    },
    { auto: true },
  ],
  // RefSeq, which the page reads genes from for a graph on GRCh38, served
  // from a cut of it around LPA
  geneRequests: [
    async ({ page, blocked: _ }, use) => {
      const urls: string[] = []
      await page.route(REFSEQ, route => {
        const url = route.request().url()
        urls.push(url)
        return serveRange(
          route,
          url.endsWith('.csi') ? REFSEQ_FIXTURE.csi : REFSEQ_FIXTURE.gff,
        )
      })
      await use(urls)
    },
    { auto: true },
  ],
})

export async function openPage(page: Page, query = '') {
  await page.goto(query ? `/?${query}` : '/')
}

export async function waitForDrawing(page: Page, stats: RegExp | string) {
  await expect(page.locator('#stats')).toContainText(stats, { timeout: 20_000 })
  await expect(page.locator('#loading')).toBeHidden({ timeout: 20_000 })
}

export function menuButton(page: Page, name: RegExp | string) {
  return page.locator('#menus').getByRole('button', { name })
}

export async function inkedPixels(canvas: Locator) {
  return canvas.evaluate((c: HTMLCanvasElement) => {
    const { data } = c.getContext('2d')!.getImageData(0, 0, c.width, c.height)
    let n = 0
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3]! > 0 && data[i]! + data[i + 1]! + data[i + 2]! < 600) {
        n++
      }
    }
    return n
  })
}

// A viewport point over a node: the first inked canvas pixel whose hover the
// info box describes as a node. The hover is left cleared.
export async function findNode(page: Page) {
  const point = await page
    .locator('#graph')
    .evaluate(async (c: HTMLCanvasElement) => {
      const dpr = c.width / c.clientWidth
      const { data, width, height } = c
        .getContext('2d')!
        .getImageData(0, 0, c.width, c.height)
      const rect = c.getBoundingClientRect()
      const onCanvas = (p: { x: number; y: number }) =>
        document.elementFromPoint(p.x, p.y) === c
      const info = document.getElementById('info')!
      const frame = () => new Promise(r => requestAnimationFrame(r))
      const step = Math.max(1, Math.round(4 * dpr))
      const candidates: { x: number; y: number }[] = []
      for (let y = 0; y < height; y += step) {
        for (let x = 0; x < width; x += step) {
          const i = (y * width + x) * 4
          if (
            data[i + 3]! > 0 &&
            data[i]! + data[i + 1]! + data[i + 2]! < 600
          ) {
            candidates.push({ x: rect.left + x / dpr, y: rect.top + y / dpr })
          }
        }
      }
      const stride = Math.max(1, Math.floor(candidates.length / 400))
      let found: { x: number; y: number } | undefined
      for (let k = 0; k < candidates.length; k += stride) {
        const p = candidates[k]!
        if (!onCanvas(p)) {
          continue
        }
        c.dispatchEvent(
          new PointerEvent('pointermove', {
            clientX: p.x,
            clientY: p.y,
            pointerType: 'mouse',
            bubbles: true,
          }),
        )
        await frame()
        await frame()
        if (!info.hidden && /bp, depth/.test(info.textContent ?? '')) {
          found = p
          break
        }
      }
      c.dispatchEvent(
        new PointerEvent('pointerleave', { pointerType: 'mouse' }),
      )
      return found
    })
  expect(point, 'a point over a node').toBeDefined()
  return point!
}

export async function chipBoxes(page: Page) {
  return page.locator('#overlay-svg [data-halo]').evaluateAll(chips =>
    chips.map(c => {
      const r = c.getBoundingClientRect()
      return { x: r.x, y: r.y, width: r.width, height: r.height }
    }),
  )
}
