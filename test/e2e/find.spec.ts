import { expect, openPage, test, waitForDrawing } from './fixtures'

import type { Page } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await openPage(page)
  await waitForDrawing(page, '58 nodes')
  await expect(page.locator('#overlay-svg [data-halo]').first()).toBeVisible()
})

function overlayPositions(page: Page) {
  return page
    .locator('#overlay-svg [data-halo], #overlay-html .size-label')
    .evaluateAll(els =>
      els.map(e => {
        const r = e.getBoundingClientRect()
        return `${Math.round(r.x)},${Math.round(r.y)}`
      }),
    )
}

function suggestions(page: Page) {
  return page
    .locator('#find-list option')
    .evaluateAll(os => os.map(o => (o as HTMLOptionElement).value))
}

test('Enter zooms to the named node and selects it', async ({ page }) => {
  const info = page.locator('#info')
  const fitted = await overlayPositions(page)
  await page.locator('#find').fill('S338852')
  await page.locator('#find').press('Enter')
  await expect(info).toContainText('s338852')
  await expect(
    info.getByRole('link', { name: 'Show in JBrowse ↗' }),
  ).toBeVisible()
  await expect(page.locator('#announce')).toHaveText(/^Selected s338852/)
  await expect.poll(() => overlayPositions(page)).not.toEqual(fitted)
  await page.locator('#zoom-fit').click()
  await expect.poll(() => overlayPositions(page)).toEqual(fitted)
})

test('an unknown name shows a notice', async ({ page }) => {
  await page.locator('#find').fill('nosuchnode')
  await page.locator('#find').press('Enter')
  await expect(page.locator('#toast')).toBeVisible()
  await expect(page.locator('#toast')).toContainText('No node named nosuchnode')
  await expect(page.locator('#info')).toBeHidden()
})

test('/ focuses the field and Escape clears it', async ({ page }) => {
  const find = page.locator('#find')
  await page.keyboard.press('/')
  await expect(find).toBeFocused()
  await page.keyboard.type('s3388')
  await expect.poll(() => suggestions(page)).toHaveLength(20)
  expect((await suggestions(page)).every(s => s.includes('s3388'))).toBe(true)
  await page.keyboard.press('Escape')
  await expect(find).toHaveValue('')
  await expect(find).not.toBeFocused()
})

test('a popped bubble searches only its own nodes', async ({ page }) => {
  await page.locator('#overlay-svg [data-halo]').first().click()
  await waitForDrawing(page, '29 nodes')
  await page.locator('#find').fill('s338852')
  await page.locator('#find').press('Enter')
  await expect(page.locator('#toast')).toContainText('No node named s338852')
  await page.locator('#find').fill('s338859')
  await page.locator('#find').press('Enter')
  await expect(page.locator('#info')).toContainText('s338859')
})

test('the tube map centres the found node', async ({ page, consoleErrors }) => {
  await openPage(page, 'gfa=examples/ecoli_pggb_subgraph.gfa&layout=tubemap')
  await waitForDrawing(page, '54 nodes')
  await page.locator('#find').fill('16')
  await page.locator('#find').press('Enter')
  await expect(page.locator('#info')).toContainText('16 — 13 bp')
  await expect(page.locator('#toast')).toBeHidden()
  const pane = (await page.locator('#pane').boundingBox())!
  await page.mouse.click(pane.x + pane.width / 2, pane.y + pane.height / 2)
  await expect(page.locator('#info')).toContainText('16 — 13 bp')
  expect(consoleErrors).toEqual([])
})
