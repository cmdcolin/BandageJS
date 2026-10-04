import { readFileSync } from 'node:fs'

import { expect, test as base } from '@playwright/test'

import type { Locator, Page, Route } from '@playwright/test'

export { expect }

const K12 = 'https://jbrowse.org/hubs/genark/GCF/000/005/845/GCF_000005845.2/'

// The files of the hubs the page reads, as test/e2e/data/fixtures.mjs cuts
// them down: the HPRC portal with hg38, UCSC's hs1 and GenArk's E. coli K-12
const HUB_FILES: Record<string, string> = {
  'https://genomes.jbrowse.org/searchIndex.json': 'searchIndex.json',
  'https://jbrowse.org/pangenome/hprc-grch38/config.json':
    'hprc-grch38.config.json',
  'https://jbrowse.org/ucsc/hg38/hg38.chromAlias.txt': 'hg38.chromAlias.txt',
  'https://jbrowse.org/ucsc/hg38/ncbiRefSeq.gff.gz': 'ncbiRefSeq.gff.gz',
  'https://jbrowse.org/ucsc/hg38/ncbiRefSeq.gff.gz.csi':
    'ncbiRefSeq.gff.gz.csi',
  'https://jbrowse.org/ucsc/hs1/config.json': 'hs1.config.json',
  'https://jbrowse.org/ucsc/hs1/hs1.chromAlias.txt': 'hs1.chromAlias.txt',
  'https://jbrowse.org/ucsc/hs1/hs1.gff.gz': 'hs1.gff.gz',
  'https://jbrowse.org/ucsc/hs1/hs1.gff.gz.csi': 'hs1.gff.gz.csi',
  [`${K12}config.json`]: 'GCF_000005845.2.config.json',
  [`${K12}GCF_000005845.2_ASM584v2_genomic.gff.gz`]: 'GCF_000005845.2.gff.gz',
  [`${K12}GCF_000005845.2_ASM584v2_genomic.gff.gz.csi`]:
    'GCF_000005845.2.gff.gz.csi',
  'https://hgdownload.soe.ucsc.edu/hubs/GCF/000/005/845/GCF_000005845.2/GCF_000005845.2.chromAlias.txt':
    'GCF_000005845.2.chromAlias.txt',
  // made by hand, one gene on a contig of no real assembly
  'https://jbrowse.org/pangenome/hprc-grch38/genes/HG00099.1.genes.bed.gz':
    'HG00099.1.genes.bed.gz',
  'https://jbrowse.org/pangenome/hprc-grch38/genes/HG00099.1.genes.bed.gz.tbi':
    'HG00099.1.genes.bed.gz.tbi',
}

export const K12_HUB = `${K12}config.json`

const GENE_FILE = /\.(gff|bed)\.gz(\.csi|\.tbi)?$/

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
      await page.route(/amazonaws\.com|jbrowse\.org|ucsc\.edu/, route => {
        urls.push(route.request().url())
        return route.abort()
      })
      await use(urls)
    },
    { auto: true },
  ],
  // the gene files read, of the hubs served from test/e2e/data
  geneRequests: [
    async ({ page, blocked: _ }, use) => {
      const urls: string[] = []
      await page.route(
        url => url.href in HUB_FILES,
        route => {
          const url = route.request().url()
          if (GENE_FILE.test(url)) {
            urls.push(url)
          }
          return serveRange(
            route,
            readFileSync(new URL(`data/${HUB_FILES[url]}`, import.meta.url)),
          )
        },
      )
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

// Opens View, and its submenu of that name when given one. The popup holds the
// submenu's panel, and Escape there closes only the submenu.
export async function viewMenu(page: Page, submenu?: RegExp | string) {
  const view = menuButton(page, 'View')
  if ((await view.getAttribute('aria-expanded')) === 'true') {
    await view.click()
  }
  await view.click()
  const popup = page.locator('#menu-popup')
  if (submenu !== undefined) {
    await popup.getByRole('menuitem', { name: submenu, exact: true }).click()
  }
  return popup
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
