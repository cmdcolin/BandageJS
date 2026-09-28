import {
  expect,
  inkedPixels,
  menuButton,
  openPage,
  test,
  waitForDrawing,
} from './fixtures'

import type { Page } from '@playwright/test'

const PGGB = 'gfa=examples/ecoli_pggb_subgraph.gfa&layout=force'
const K12 = 'K12#1#chr:1004500-1004961'
const IAI39 = 'IAI39#1#chr:2249412-2249872'
const SAKAI = 'Sakai#1#chr:1133973-1134433'

function lifted(...walks: string[]) {
  return walks.map(w => `&walk=${encodeURIComponent(w)}`).join('')
}

async function walkMenu(page: Page) {
  await menuButton(page, /^Walk/).click()
  return page.locator('#menu-popup')
}

test('walks lift from the menu as lanes, each keyed in one short row', async ({
  page,
}) => {
  await openPage(page, PGGB)
  await waitForDrawing(page, /nodes/)
  const popup = await walkMenu(page)
  await popup.getByRole('menuitemcheckbox', { name: /^K12/ }).click()
  await popup.getByRole('menuitemcheckbox', { name: /^IAI39/ }).click()
  await expect(
    popup.getByRole('menuitemcheckbox', { name: /^IAI39/ }),
  ).toHaveAttribute('aria-checked', 'true')
  await page.keyboard.press('Escape')
  await expect(menuButton(page, 'Walks: 2 lifted')).toBeVisible()
  const key = page.locator('#legends .legend.walks')
  await expect(key.locator('.walk-key')).toHaveCount(2)
  await expect(key).toContainText('449 bp reversed')
  await expect(key).toContainText('not on these walks')
  expect(new URL(page.url()).searchParams.getAll('walk')).toEqual([K12, IAI39])
})

test('a walk lifted alone shades along itself, its stretch written under its bar', async ({
  page,
}) => {
  await openPage(page, `${PGGB}${lifted(IAI39)}`)
  await waitForDrawing(page, /nodes/)
  const key = page.locator('#legends .walk-key')
  await expect(key.locator('.swatch.scale')).toBeVisible()
  await expect(key).toContainText('chr:2,249,412-2,249,872 (460 bp)')
  await expect(page.locator('#legends')).toContainText('not on IAI39')
})

test('side by side draws a panel per walk on one view, titled by its key', async ({
  page,
}) => {
  await openPage(page, `${PGGB}${lifted(K12, IAI39)}&facet=walk`)
  await waitForDrawing(page, /nodes/)
  const panels = page.locator('#facets .facet')
  await expect(panels).toHaveCount(2)
  await expect(panels.nth(1).locator('.facet-title')).toContainText(
    '449 bp reversed',
  )
  await expect(panels.nth(1).locator('.facet-title')).toContainText(
    'chr:2,249,412-2,249,872 (460 bp)',
  )
  await expect(page.locator('#legends')).toBeEmpty()
  const first = panels.nth(0).locator('canvas')
  const second = panels.nth(1).locator('canvas')
  await expect.poll(() => inkedPixels(second)).toBeGreaterThan(0)

  // a zoom in one panel zooms them all
  const before = await second.evaluate((c: HTMLCanvasElement) => c.toDataURL())
  const box = (await first.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.wheel(0, -400)
  await expect
    .poll(() => second.evaluate((c: HTMLCanvasElement) => c.toDataURL()))
    .not.toBe(before)

  // a title lifts its walk alone
  await panels.nth(1).locator('.facet-title').click()
  await expect(page.locator('#facets')).toBeHidden()
  await expect(page.locator('#legends .walk-key')).toHaveCount(1)
  expect(new URL(page.url()).searchParams.getAll('walk')).toEqual([IAI39])
})

test('Columns sets how many panels go across', async ({ page }) => {
  await openPage(page, `${PGGB}${lifted(K12, IAI39, SAKAI)}&facet=walk`)
  await waitForDrawing(page, /nodes/)
  await expect(page.locator('#facets .facet')).toHaveCount(3)
  const popup = await walkMenu(page)
  await popup.getByRole('menuitem', { name: 'Columns' }).click()
  await expect(popup.getByRole('menuitem', { name: '◀ Columns' })).toBeVisible()
  await popup.getByRole('menuitemradio', { name: '1', exact: true }).click()
  await expect(page.locator('#facets')).toHaveCSS(
    'grid-template-columns',
    /^\S+$/,
  )
  expect(new URL(page.url()).searchParams.get('columns')).toBe('1')
})

test('a walk colours by what its submenu picks, and the keyboard goes in and out', async ({
  page,
}) => {
  await openPage(page, `${PGGB}${lifted(K12, IAI39)}`)
  await waitForDrawing(page, /nodes/)
  const popup = await walkMenu(page)
  const colour = popup.getByRole('menuitem', { name: /^Colour IAI39/ })
  await colour.focus()
  await page.keyboard.press('ArrowRight')
  const progress = popup.getByRole('menuitemradio', {
    name: 'Progress along the walk',
  })
  await expect(progress).toBeVisible()
  await progress.click()
  await expect(progress).toHaveAttribute('aria-checked', 'true')
  await page.keyboard.press('ArrowLeft')
  await expect(colour).toBeVisible()
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await expect(popup).toBeHidden()
  await expect(
    page.locator('#legends .walk-key').nth(1).locator('.swatch.scale'),
  ).toBeVisible()
})

test('a tube map draws every walk as a tube, so it lifts none', async ({
  page,
}) => {
  await openPage(
    page,
    `gfa=examples/ecoli_pggb_subgraph.gfa&layout=tubemap${lifted(IAI39)}`,
  )
  await waitForDrawing(page, /nodes/)
  await expect(menuButton(page, 'Walks')).toBeVisible()
  const popup = await walkMenu(page)
  await expect(popup).not.toContainText('Lift walks')
  await expect(page.locator('#legends .walk-key')).toHaveCount(0)
})
