import { expect, menuButton, openPage, test, waitForDrawing } from './fixtures'

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
    name: 'Force-directed layout',
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

test('Help opens the controls and links to the docs', async ({ page }) => {
  await menuButton(page, 'Help').click()
  const popup = page.locator('#menu-popup')
  await expect(popup).toContainText('Genes and reference assemblies')
  await popup
    .getByRole('menuitem', { name: /^Mouse, touch and keyboard/ })
    .click()
  await expect(page.locator('#help-dialog')).toBeVisible()
})

test('a pointerdown outside closes an open menu', async ({ page }) => {
  const popup = page.locator('#menu-popup')
  await menuButton(page, 'View').click()
  await expect(popup).toBeVisible()
  await page.locator('#caption').dispatchEvent('pointerdown')
  await expect(popup).toBeHidden()
})
