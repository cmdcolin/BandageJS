import {
  expect,
  haplotypesMenu,
  openPage,
  test,
  waitForDrawing,
} from './fixtures'

import type { Page } from '@playwright/test'

const PGGB = 'gfa=examples/ecoli_pggb_subgraph.gfa&layout=force'

async function showStrip(page: Page) {
  await (
    await haplotypesMenu(page)
  )
    .getByRole('menuitemcheckbox', { name: /^Bars under the graph/ })
    .click()
  await page.keyboard.press('Escape')
}

// The middle of the widest run on a strip row, in page pixels
async function onRow(page: Page, row: number) {
  return page.locator('#strip-svg').evaluate((svg, i) => {
    const rects = [
      ...svg.querySelectorAll(
        '#strip-bars [data-testid^="graph-walk-r"] > rect',
      ),
    ]
    const ys = [
      ...new Set(
        rects.map(
          r =>
            Number(r.getAttribute('y')) + Number(r.getAttribute('height')) / 2,
        ),
      ),
    ].sort((a, b) => a - b)
    const y = ys[i]!
    const widest = rects
      .filter(
        r =>
          Number(r.getAttribute('y')) + Number(r.getAttribute('height')) / 2 ===
          y,
      )
      .reduce((a, b) =>
        Number(b.getAttribute('width')) > Number(a.getAttribute('width'))
          ? b
          : a,
      )
    const box = svg.getBoundingClientRect()
    return {
      x:
        box.x +
        Number(widest.getAttribute('x')) +
        Number(widest.getAttribute('width')) / 2,
      y: box.y + y,
    }
  }, row)
}

test('walk rows under the graph show every walk, keyed by the reference path', async ({
  page,
}) => {
  await openPage(page, PGGB)
  await waitForDrawing(page, /nodes/)
  await expect(page.locator('#walk-strip')).toBeHidden()
  const before = await page.locator('#pane').boundingBox()
  await showStrip(page)
  const strip = page.locator('#walk-strip')
  await expect(strip).toBeVisible()
  await expect(strip.locator('#strip-labels text')).toHaveCount(5)
  await expect(page.locator('#strip-key')).toContainText("'s path")
  // the drawing gives up the strip's height and fits what is left
  const after = await page.locator('#pane').boundingBox()
  expect(after!.height).toBeLessThan(before!.height)
})

test('a point on a bar lights its node, ringed, and ticks every walk through it', async ({
  page,
}) => {
  await openPage(page, PGGB)
  await waitForDrawing(page, /nodes/)
  await showStrip(page)
  const at = await onRow(page, 1)
  await page.mouse.move(at.x, at.y)
  await expect(page.locator('#strip-locator circle')).toHaveCount(2)
  await expect(page.locator('#info')).toContainText('bp')
  expect(
    await page.locator('#strip-marks rect').count(),
  ).toBeGreaterThanOrEqual(2)
  await page.mouse.move(at.x, at.y - 200)
  await expect(page.locator('#strip-locator circle')).toHaveCount(0)
})

test('a click on a bar highlights its walk and selects its row; a second drops it', async ({
  page,
}) => {
  await openPage(page, PGGB)
  await waitForDrawing(page, /nodes/)
  await showStrip(page)
  const at = await onRow(page, 1)
  await page.mouse.click(at.x, at.y)
  await expect(
    (await haplotypesMenu(page)).getByRole('menuitem', {
      name: 'Clear highlights',
    }),
  ).toBeEnabled()
  await page.keyboard.press('Escape')
  // the hover's node shows over the selection until the pointer leaves
  await page.locator('#strip-key').hover()
  await expect(page.locator('#info')).toContainText('chr:1,189,697-1,190,158')
  await expect(page.locator('#info [data-close]')).toBeVisible()
  await page.mouse.click(at.x, at.y)
  await expect(
    (await haplotypesMenu(page)).getByRole('menuitem', {
      name: 'Clear highlights',
    }),
  ).toBeDisabled()
})
