import {
  expect,
  menuButton,
  openPage,
  test,
  viewMenu,
  waitForDrawing,
} from './fixtures'

test.beforeEach(async ({ page }) => {
  await openPage(page)
  await waitForDrawing(page, /nodes/)
})

test('the bar holds File, Examples, View and Help', async ({ page }) => {
  await expect(page.locator('#menus').getByRole('button')).toHaveText([
    'File',
    'Examples',
    'View',
    'Help',
  ])
})

test('typeahead reaches the checked item and Escape climbs back out', async ({
  page,
}) => {
  const view = menuButton(page, 'View')
  const popup = page.locator('#menu-popup')
  await view.focus()
  await view.press('ArrowDown')
  await expect(popup).toBeVisible()
  await expect(view).toHaveAttribute('aria-expanded', 'true')
  await page.keyboard.press('l')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('f')
  const force = popup.getByRole('menuitemradio', {
    name: /^Force-directed/,
  })
  await expect(force).toBeFocused()
  await expect(force).toHaveAttribute('aria-checked', 'true')
  await page.keyboard.press('Escape')
  await expect(
    popup.getByRole('menuitem', { name: /^Layout: Force-directed/ }),
  ).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(popup).toBeHidden()
  await expect(view).toBeFocused()
  await expect(view).toHaveAttribute('aria-expanded', 'false')
})

test('leaving a submenu focuses the item that opened it', async ({ page }) => {
  const popup = await viewMenu(page, /^Colour/)
  const colour = popup.getByRole('menuitem', { name: /^Colour/ })
  const submenu = popup.getByRole('menu', { name: /^Colour/ })
  await expect(colour).toHaveAttribute('aria-expanded', 'true')
  await expect(submenu.getByRole('menuitemradio').first()).toBeFocused()
  await page.keyboard.press('ArrowLeft')
  await expect(submenu).toBeHidden()
  await expect(colour).toBeFocused()
  await expect(colour).toHaveAttribute('aria-expanded', 'false')
})

test('hovering an item with a submenu opens it beside the menu', async ({
  page,
}) => {
  const popup = await viewMenu(page)
  await popup.getByRole('menuitem', { name: /^Layout/ }).hover()
  const submenu = popup.getByRole('menu', { name: /^Layout/ })
  await expect(submenu).toBeVisible()
  const [menuBox, subBox] = await Promise.all([
    popup.boundingBox(),
    submenu.boundingBox(),
  ])
  expect(subBox!.x).toBeGreaterThanOrEqual(menuBox!.x + menuBox!.width - 1)
  await popup.getByRole('menuitemcheckbox', { name: 'Bubbles' }).hover()
  await expect(submenu).toBeHidden()
})

test('a pointer crossing items on its way to a submenu keeps it open', async ({
  page,
}) => {
  const popup = await viewMenu(page)
  const layout = popup.getByRole('menuitem', { name: /^Layout/ })
  await layout.hover()
  const submenu = popup.getByRole('menu', { name: /^Layout/ })
  const from = (await layout.boundingBox())!
  const to = (await submenu
    .getByRole('menuitemradio', { name: 'Force-directed' })
    .boundingBox())!
  await page.mouse.move(to.x + 20, to.y + to.height / 2, { steps: 15 })
  await expect(submenu).toBeVisible()
  await expect(layout).toHaveAttribute('aria-expanded', 'true')
  await page.mouse.move(from.x + 20, from.y + from.height / 2)
  await page.mouse.move(from.x + 20, from.y + from.height * 2.5, { steps: 3 })
  await expect(submenu).toBeHidden()
})

test('a choice in a submenu that stays open relabels its item', async ({
  page,
}) => {
  const popup = await viewMenu(page, /^Colour/)
  await popup.getByRole('menuitemradio', { name: 'Uniform' }).click()
  await expect(
    popup.getByRole('menuitem', { name: 'Colour: Uniform' }),
  ).toHaveAttribute('aria-expanded', 'true')
  await expect(
    popup.getByRole('menuitemradio', { name: 'Uniform' }),
  ).toHaveAttribute('aria-checked', 'true')
})

test('ArrowRight moves to the next menu', async ({ page }) => {
  const file = menuButton(page, 'File')
  const examples = menuButton(page, 'Examples')
  const popup = page.locator('#menu-popup')
  await file.focus()
  await file.press('ArrowDown')
  await expect(popup).toBeVisible()
  await page.keyboard.press('ArrowRight')
  await expect(examples).toHaveAttribute('aria-expanded', 'true')
  await expect(file).toHaveAttribute('aria-expanded', 'false')
  await expect(popup).toHaveAttribute(
    'aria-labelledby',
    (await examples.getAttribute('id'))!,
  )
  await expect(popup.getByRole('menuitem').first()).toBeFocused()
})

test('Help holds the user guide and About', async ({ page }) => {
  await menuButton(page, 'Help').click()
  const popup = page.locator('#menu-popup')
  await expect(popup.getByRole('menuitem')).toHaveText(['User guide', 'About'])
  await popup.getByRole('menuitem', { name: 'User guide' }).click()
  await expect(page.locator('#guide-dialog')).toContainText('Dashed links')
  await page.keyboard.press('Escape')
  await menuButton(page, 'Help').click()
  await popup.getByRole('menuitem', { name: 'About' }).click()
  await expect(page.locator('#about-dialog')).toContainText('Source on GitHub')
})

test('a pointerdown outside closes an open menu', async ({ page }) => {
  const popup = page.locator('#menu-popup')
  await menuButton(page, 'View').click()
  await expect(popup).toBeVisible()
  await page.locator('#caption').dispatchEvent('pointerdown')
  await expect(popup).toBeHidden()
})
