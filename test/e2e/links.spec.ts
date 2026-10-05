import {
  expect,
  menuButton,
  openPage,
  test,
  viewMenu,
  waitForDrawing,
} from './fixtures'

import type { Page } from '@playwright/test'

const params = (page: Page) => new URL(page.url()).searchParams

function overlayPositions(page: Page) {
  return page.locator('#overlay-svg [data-halo]').evaluateAll(els =>
    els.map(e => {
      const r = e.getBoundingClientRect()
      return `${Math.round(r.x)},${Math.round(r.y)}`
    }),
  )
}

async function fileMenuItem(page: Page, name: string) {
  await menuButton(page, 'File').click()
  return page.locator('#menu-popup').getByRole('menuitem', { name })
}

test.beforeEach(async ({ page }) => {
  await openPage(page)
  await waitForDrawing(page, '58 nodes')
  await expect(page.locator('#overlay-svg [data-halo]').first()).toBeVisible()
})

test('the selected node goes into the address, and a link selects it', async ({
  page,
}) => {
  await page.locator('#find').fill('S338852')
  await page.locator('#find').press('Enter')
  await expect(page.locator('#details')).toContainText('s338852')
  await expect.poll(() => params(page).get('node')).toBe('s338852')

  await page.goto(page.url())
  await waitForDrawing(page, '58 nodes')
  await expect(page.locator('#details')).toContainText('s338852')

  await page.keyboard.press('Escape')
  await expect(page.locator('#details')).toBeHidden()
  await expect.poll(() => params(page).has('node')).toBe(false)
})

test('a link naming no such node says so', async ({ page }) => {
  await openPage(page, 'gfa=examples/hprc_kiv2.gfa&node=nosuchnode')
  await waitForDrawing(page, '58 nodes')
  await expect(page.locator('#toast')).toContainText('No node named nosuchnode')
})

test('a zoomed view goes into the address, and a link lands on it', async ({
  page,
}) => {
  const fitted = await overlayPositions(page)
  expect(params(page).has('view')).toBe(false)
  await page.locator('#zoom-in').click()
  await page.locator('#zoom-in').click()
  await expect
    .poll(() => params(page).get('view'))
    .toMatch(/^[-\d.e]+,[-\d.e]+,[\d.e]+$/)
  const zoomed = await overlayPositions(page)
  expect(zoomed).not.toEqual(fitted)

  await page.goto(page.url())
  await waitForDrawing(page, '58 nodes')
  await expect.poll(() => overlayPositions(page)).toEqual(zoomed)

  await page.locator('#zoom-fit').click()
  await expect.poll(() => overlayPositions(page)).toEqual(fitted)
  await expect.poll(() => params(page).has('view')).toBe(false)
})

test('a link states the colour and what is drawn, and a change updates it', async ({
  page,
}) => {
  await openPage(page, 'gfa=examples/hprc_kiv2.gfa&color=depth&bubbles=0')
  await waitForDrawing(page, '58 nodes')
  const popup = await viewMenu(page)
  await expect(
    popup.getByRole('menuitem', { name: 'Colour: Depth' }),
  ).toBeVisible()
  const bubbles = popup.getByRole('menuitemcheckbox', { name: 'Bubbles' })
  await expect(bubbles).toHaveAttribute('aria-checked', 'false')
  await bubbles.click()
  await expect(bubbles).toHaveAttribute('aria-checked', 'true')
  await expect.poll(() => params(page).has('bubbles')).toBe(false)
  expect(params(page).get('color')).toBe('depth')
  expect(params(page).get('layout')).toBe('force')
})

test('Copy link is offered for a graph with an address, not for a dropped file', async ({
  page,
}) => {
  await expect(await fileMenuItem(page, 'Copy link')).toBeEnabled()
  await page.keyboard.press('Escape')
  await page.evaluate(() => {
    const data = new DataTransfer()
    data.items.add(
      new File(['H\tVN:Z:1.0\nS\t1\tACGT\n'], 'dropped.gfa', {
        type: 'text/plain',
      }),
    )
    window.dispatchEvent(
      new DragEvent('drop', { dataTransfer: data, cancelable: true }),
    )
  })
  await waitForDrawing(page, '1 node')
  expect(new URL(page.url()).search).toBe('')
  await expect(await fileMenuItem(page, 'Copy link')).toBeDisabled()
})
