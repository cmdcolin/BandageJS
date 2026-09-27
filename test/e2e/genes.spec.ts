import { expect, menuButton, openPage, test, waitForDrawing } from './fixtures'

import type { Page } from '@playwright/test'

const genes = (page: Page) => page.locator('#overlay-svg .gene')
const exons = (page: Page) =>
  page.locator('#overlay-svg g[transform] path[stroke="#1c1c22"]')

async function displayItem(page: Page, name: RegExp | string) {
  await menuButton(page, 'Display').click()
  return page.locator('#menu-popup').getByRole('menuitemcheckbox', { name })
}

async function chooseLayout(page: Page, name: RegExp) {
  await menuButton(page, /^Layout/).click()
  await page.locator('#menu-popup').getByRole('menuitemradio', { name }).click()
}

test('RefSeq genes pin to the backbone of the LPA graph', async ({
  page,
  geneRequests,
}) => {
  await openPage(page)
  await waitForDrawing(page, '58 nodes')
  await expect(genes(page).filter({ hasText: 'LPA' })).toHaveCount(1)
  expect(await exons(page).count()).toBeGreaterThan(0)
  await expect(
    genes(page).filter({ hasText: 'LPA' }).locator('title'),
  ).toHaveText(/^LPA\nchr6:160,531,482-160,664,275, − strand/)
  expect(geneRequests.some(u => u.endsWith('.csi'))).toBe(true)
})

test('genes follow the layouts that draw a backbone', async ({ page }) => {
  await openPage(page)
  await waitForDrawing(page, '58 nodes')
  for (const layout of [/^Anchored/, /^Ordered/, /^Sample rows/]) {
    await chooseLayout(page, layout)
    await expect(genes(page).filter({ hasText: 'LPA' })).toHaveCount(1)
  }
  await chooseLayout(page, /^Variant map/)
  await expect(genes(page)).toHaveCount(0)
  const item = await displayItem(page, /Genes/)
  await expect(item).toBeDisabled()
  await expect(item).toContainText('Not drawn in the Variant map layout')
})

test('the Genes toggle hides them', async ({ page }) => {
  await openPage(page)
  await waitForDrawing(page, '58 nodes')
  await expect(genes(page).first()).toBeVisible()
  await (await displayItem(page, /Genes/)).click()
  await expect(genes(page)).toHaveCount(0)
  await expect(exons(page)).toHaveCount(0)
  await (await displayItem(page, /Genes/)).click()
  await expect(genes(page).filter({ hasText: 'LPA' })).toHaveCount(1)
})

test('Open genes… draws a BED file in place of RefSeq', async ({ page }) => {
  await openPage(page)
  await waitForDrawing(page, '58 nodes')
  await expect(genes(page).filter({ hasText: 'LPA' })).toHaveCount(1)
  await menuButton(page, 'Display').click()
  const chooser = page.waitForEvent('filechooser')
  await page
    .locator('#menu-popup')
    .getByRole('menuitem', { name: /^Open genes/ })
    .click()
  await (
    await chooser
  ).setFiles({
    name: 'mine.bed',
    mimeType: 'text/plain',
    buffer: Buffer.from(
      'track name=mine\nchr6\t160560000\t160640000\tMYGENE\t0\t+\t160560000\t160640000\t0\t2\t5000,5000,\t0,75000,\n',
    ),
  })
  await expect(genes(page).filter({ hasText: 'MYGENE' })).toHaveCount(1)
  await expect(genes(page).filter({ hasText: 'LPA' })).toHaveCount(0)
  await expect(
    page.locator('#menu-popup').getByRole('menuitem', { name: /Open genes/ }),
  ).toBeHidden()
  await menuButton(page, 'Display').click()
  await expect(page.locator('#menu-popup')).toContainText(
    'Showing mine.bed in place of RefSeq',
  )
})

test('a graph off GRCh38 fetches no genes', async ({ page, geneRequests }) => {
  await openPage(page, 'gfa=examples/assembly_graph.gfa')
  await waitForDrawing(page, '64 nodes')
  const item = await displayItem(page, /Genes/)
  await expect(item).toBeDisabled()
  await expect(item).toContainText('Needs a graph on GRCh38')
  expect(geneRequests).toEqual([])
})

test('a failed RefSeq read leaves the graph drawn with a notice', async ({
  page,
}) => {
  await page.route(/ncbiRefSeq/, route => route.abort())
  await openPage(page)
  await waitForDrawing(page, '58 nodes')
  await expect(page.locator('#toast')).toContainText(
    "Couldn't read RefSeq genes",
  )
  await expect(page.locator('#toast')).not.toHaveClass(/error/)
  await expect(genes(page)).toHaveCount(0)
})
