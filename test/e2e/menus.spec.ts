import { expect, menuButton, openPage, test, waitForDrawing } from './fixtures'

test.beforeEach(async ({ page }) => {
  await openPage(page)
  await waitForDrawing(page, /nodes/)
})

test('typeahead reaches the checked item and Escape returns to the button', async ({
  page,
}) => {
  const layout = menuButton(page, /^Layout/)
  const popup = page.locator('#menu-popup')
  await layout.focus()
  await layout.press('ArrowDown')
  await expect(popup).toBeVisible()
  await expect(layout).toHaveAttribute('aria-expanded', 'true')
  await page.keyboard.press('f')
  const force = popup.getByRole('menuitemradio', {
    name: 'Force-directed layout',
  })
  await expect(force).toBeFocused()
  await expect(force).toHaveAttribute('aria-checked', 'true')
  await page.keyboard.press('Escape')
  await expect(popup).toBeHidden()
  await expect(layout).toBeFocused()
  await expect(layout).toHaveAttribute('aria-expanded', 'false')
})

test('ArrowRight moves to the next menu', async ({ page }) => {
  const layout = menuButton(page, /^Layout/)
  const display = menuButton(page, 'Display')
  const popup = page.locator('#menu-popup')
  await layout.focus()
  await layout.press('ArrowDown')
  await expect(popup).toBeVisible()
  await page.keyboard.press('ArrowRight')
  await expect(display).toHaveAttribute('aria-expanded', 'true')
  await expect(layout).toHaveAttribute('aria-expanded', 'false')
  await expect(popup).toHaveAttribute(
    'aria-labelledby',
    (await display.getAttribute('id'))!,
  )
  await expect(popup.getByRole('menuitemradio').first()).toBeFocused()
})

test('a pointerdown outside closes an open menu', async ({ page }) => {
  const popup = page.locator('#menu-popup')
  await menuButton(page, 'Display').click()
  await expect(popup).toBeVisible()
  await page.locator('#caption').dispatchEvent('pointerdown')
  await expect(popup).toBeHidden()
})
