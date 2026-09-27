import {
  chipBoxes,
  expect,
  findNode,
  openPage,
  test,
  waitForDrawing,
} from './fixtures'

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

test('hovering a node describes it and clicking selects it', async ({
  page,
}) => {
  const info = page.locator('#info')
  const node = await findNode(page)
  await page.mouse.move(0, 0)
  await expect(info).toBeHidden()
  await page.mouse.move(node.x, node.y)
  await expect(info).toBeVisible()
  await expect(info).toContainText('bp, depth')
  await page.mouse.click(node.x, node.y)
  await expect(
    info.getByRole('link', { name: 'Show in JBrowse ↗' }),
  ).toBeVisible()
  await info.getByRole('button', { name: 'Deselect' }).click()
  await expect(info).toBeHidden()
})

test('a bubble chip opens its subgraph and Back returns', async ({ page }) => {
  const caption = page.locator('#caption')
  const back = page.locator('#back')
  await expect(back).toBeHidden()
  await page.locator('#overlay-svg [data-halo]').first().click()
  await expect(back).toBeVisible()
  await expect(back).toHaveText('◀ Back to hprc_kiv2.gfa')
  await expect(caption).not.toContainText('hprc_kiv2.gfa')
  await expect(page.locator('#loading')).toBeHidden()
  await back.click()
  await expect(back).toBeHidden()
  await expect(caption).toContainText('hprc_kiv2.gfa')
  await waitForDrawing(page, '58 nodes · 81 edges')
})

test('the wheel zooms over a bubble chip', async ({ page }) => {
  const before = await chipBoxes(page)
  const box = (await page
    .locator('#overlay-svg [data-halo]')
    .first()
    .boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.wheel(0, -300)
  await expect.poll(() => chipBoxes(page)).not.toEqual(before)
})

test('zoom buttons change the view and fit restores it', async ({ page }) => {
  const fitted = await overlayPositions(page)
  await page.locator('#zoom-in').click()
  await expect.poll(() => overlayPositions(page)).not.toEqual(fitted)
  await page.locator('#zoom-fit').click()
  await expect.poll(() => overlayPositions(page)).toEqual(fitted)
  await page.locator('#zoom-out').click()
  await expect.poll(() => overlayPositions(page)).not.toEqual(fitted)
  await page.locator('#zoom-fit').click()
  await expect.poll(() => overlayPositions(page)).toEqual(fitted)
})

test('the + − 0 keys change the view and restore it', async ({ page }) => {
  const fitted = await overlayPositions(page)
  await page.keyboard.press('+')
  await expect.poll(() => overlayPositions(page)).not.toEqual(fitted)
  await page.keyboard.press('-')
  await page.keyboard.press('-')
  await expect.poll(() => overlayPositions(page)).not.toEqual(fitted)
  await page.keyboard.press('0')
  await expect.poll(() => overlayPositions(page)).toEqual(fitted)
})
