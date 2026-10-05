import {
  chipBoxes,
  expect,
  findNode,
  menuButton,
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

test('hovering a node describes it beside the pointer and clicking opens its details', async ({
  page,
}) => {
  const info = page.locator('#info')
  const details = page.locator('#details')
  const node = await findNode(page)
  await page.mouse.move(0, 0)
  await expect(info).toBeHidden()
  await page.mouse.move(node.x, node.y)
  await expect(info).toBeVisible()
  await expect(info).toContainText('bp, depth')
  const box = (await info.boundingBox())!
  expect(Math.abs(box.x - node.x)).toBeLessThan(box.width + 40)
  expect(Math.abs(box.y - node.y)).toBeLessThan(box.height + 40)
  await page.mouse.click(node.x, node.y)
  await expect(details.getByRole('link', { name: 'JBrowse ↗' })).toBeVisible()
  await expect(details).toContainText('At its start')
  await details
    .getByRole('button', { name: "Close the node's details" })
    .click()
  await expect(details).toBeHidden()
})

test('the details step to a neighbour and lift a walk through the node', async ({
  page,
}) => {
  await openPage(page, 'gfa=examples/ecoli_pggb_subgraph.gfa&layout=force')
  await waitForDrawing(page, '54 nodes')
  await page.locator('#find').fill('3')
  await page.locator('#find').press('Enter')
  const details = page.locator('#details')
  await expect(
    details.getByRole('heading', { level: 2, name: '3', exact: true }),
  ).toBeVisible()
  await expect(details).toContainText('Walks through it 3 of 5')
  await expect(details).toContainText('Sakai#1#chr:1,133,999')
  await details.getByRole('checkbox', { name: 'K12' }).check()
  await expect(page.locator('#legends .walk-key')).toHaveCount(1)
  await expect(details.getByRole('checkbox', { name: 'K12' })).toBeChecked()
  await expect(details.getByRole('checkbox', { name: 'K12' })).toBeFocused()
  await expect(page.locator('#overlay-svg #ring-cut')).toHaveCount(1)
  await details.getByRole('button', { name: '5', exact: true }).click()
  const five = details.getByRole('heading', {
    level: 2,
    name: '5',
    exact: true,
  })
  await expect(five).toBeVisible()
  await expect(five).toBeFocused()
  await expect(page.locator('#announce')).toHaveText(/^Selected 5,/)
  await expect(details).toContainText('3+ → 5+')
  await expect(details).toContainText(
    'IAI39#1#chr:2,249,835-2,249,846, − strand',
  )
  await expect(details.getByRole('button', { name: /SNP/ })).toHaveCount(0)
  await details.getByRole('button', { name: '3', exact: true }).click()
  await details.getByRole('button', { name: 'Open SNP' }).click()
  await expect(page.locator('#back')).toBeVisible()
  await expect(
    details.getByRole('heading', { level: 2, name: '3', exact: true }),
  ).toBeVisible()
  await expect(details.getByRole('button', { name: /SNP/ })).toHaveCount(0)
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

test('a spec names the whole graph, so a popped bubble offers none', async ({
  page,
}) => {
  await page.locator('#overlay-svg [data-halo]').first().click()
  await expect(page.locator('#back')).toBeVisible()
  await menuButton(page, 'File').click()
  const item = page
    .locator('#menu-popup')
    .getByRole('menuitem', { name: /^Copy figure spec/ })
  await expect(item).toBeDisabled()
  await expect(item).toContainText('go back out of this bubble first')
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
