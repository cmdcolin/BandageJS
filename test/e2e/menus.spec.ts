import {
  expect,
  menuButton,
  openMenu,
  openPage,
  test,
  viewMenu,
  waitForDrawing,
} from './fixtures'

test.beforeEach(async ({ page }) => {
  await openPage(page)
  await waitForDrawing(page, /nodes/)
})

test('the bar holds File, Examples, Layout, View and Help', async ({
  page,
}) => {
  await expect(page.locator('#menus').getByRole('button')).toHaveText([
    'File',
    'Examples',
    'Layout',
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
  await page.keyboard.press('c')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('a')
  const auto = popup.getByRole('menuitemradio', { name: /^Auto/ })
  await expect(auto).toBeFocused()
  await expect(auto).toHaveAttribute('aria-checked', 'true')
  await page.keyboard.press('Escape')
  await expect(popup.getByRole('menuitem', { name: /^Colour/ })).toBeFocused()
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
  await popup.getByRole('menuitem', { name: /^Colour/ }).hover()
  const submenu = popup.getByRole('menu', { name: /^Colour/ })
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
  const colour = popup.getByRole('menuitem', { name: /^Colour/ })
  await colour.hover()
  const submenu = popup.getByRole('menu', { name: /^Colour/ })
  const from = (await colour.boundingBox())!
  const to = (await submenu
    .getByRole('menuitemradio', { name: 'Random' })
    .boundingBox())!
  await page.mouse.move(to.x + 20, to.y + to.height / 2, { steps: 15 })
  await expect(submenu).toBeVisible()
  await expect(colour).toHaveAttribute('aria-expanded', 'true')
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

test('a checkbox keeps the menu open so it can be toggled back', async ({
  page,
}) => {
  const popup = await viewMenu(page)
  const bubbles = popup.getByRole('menuitemcheckbox', { name: 'Bubbles' })
  const before = await bubbles.getAttribute('aria-checked')
  await bubbles.click()
  await expect(popup).toBeVisible()
  await expect(bubbles).not.toHaveAttribute('aria-checked', before!)
  await bubbles.click()
  await expect(bubbles).toHaveAttribute('aria-checked', before!)
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

test('Layout settings relay the graph out and hide what the layout ignores', async ({
  page,
}) => {
  const settings = page.locator('#layout-dialog')
  await (
    await openMenu(page, 'Layout')
  )
    .getByRole('menuitem', { name: 'Layout settings…' })
    .click()
  await expect(settings).toBeVisible()
  await settings.locator('input[data-key="spacing"]').fill('2')
  await expect(settings.locator('output[data-for="spacing"]')).toHaveText(
    'Loose',
  )
  await waitForDrawing(page, /nodes/)
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('bandagejs-settings')!).spacing,
    ),
  ).toBe(2)
  await settings.getByRole('button', { name: 'Done' }).click()
  await expect(settings).toBeHidden()

  await (
    await openMenu(page, 'Layout')
  )
    .getByRole('menuitemradio', { name: 'Anchored' })
    .click()
  await (
    await openMenu(page, 'Layout')
  )
    .getByRole('menuitem', { name: 'Layout settings…' })
    .click()
  await expect(settings.locator('#force-settings')).toBeHidden()
  await expect(settings.locator('#force-hint')).toBeVisible()
})
