import { expect, menuButton, openPage, test, waitForDrawing } from './fixtures'

import type { Page } from '@playwright/test'

const TINY_GFA = [
  'H\tVN:Z:1.0',
  'S\t1\tACGTACGT',
  'S\t2\tGGCC',
  'S\t3\tTTAAGG',
  'L\t1\t+\t2\t+\t0M',
  'L\t2\t+\t3\t+\t0M',
].join('\n')

async function openCutDialog(page: Page) {
  await openPage(page)
  await waitForDrawing(page, /nodes/)
  await menuButton(page, 'File').click()
  await page
    .locator('#menu-popup')
    .getByRole('menuitem', { name: 'Open…' })
    .click()
  await page.getByRole('button', { name: 'Cut a region…' }).click()
  const dialog = page.locator('#gbz-dialog')
  await expect(dialog).toBeVisible()
  return dialog
}

const returnValue = (page: Page) =>
  page.locator('#gbz-dialog').evaluate((d: HTMLDialogElement) => d.returnValue)

test.describe('the Cut a region dialog', () => {
  test('Enter in the region field starts a cut', async ({ page, blocked }) => {
    const dialog = await openCutDialog(page)
    await page.locator('#gbz-region').press('Enter')
    await expect(dialog).toBeHidden()
    expect(await returnValue(page)).toBe('open')
    await expect.poll(() => blocked.length).toBeGreaterThan(0)
    await expect(page.locator('#toast')).toBeVisible()
  })

  test('a click on the backdrop closes it, a click inside does not', async ({
    page,
  }) => {
    const dialog = await openCutDialog(page)
    await dialog.getByRole('heading').first().click()
    await expect(dialog).toBeVisible()
    await page.mouse.click(2, 2)
    await expect(dialog).toBeHidden()
    expect(await returnValue(page)).toBe('')
  })

  test('Cancel closes without starting a cut', async ({ page, blocked }) => {
    const dialog = await openCutDialog(page)
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog).toBeHidden()
    expect(await returnValue(page)).toBe('')
    await page.evaluate(() => new Promise(requestAnimationFrame))
    await expect(page.locator('#loading')).toBeHidden()
    expect(blocked).toEqual([])
  })

  test('an invalid region blocks submission', async ({ page, blocked }) => {
    const dialog = await openCutDialog(page)
    const region = page.locator('#gbz-region')
    await region.fill('not a region')
    await region.press('Enter')
    await dialog.getByRole('button', { name: 'Cut' }).click()
    await expect(dialog).toBeVisible()
    expect(
      await region.evaluate((i: HTMLInputElement) => i.validity.valid),
    ).toBe(false)
    expect(await returnValue(page)).toBe('')
    expect(blocked).toEqual([])
  })
})

test('a url from the Open dialog loads and goes into the address', async ({
  page,
}) => {
  await openPage(page)
  await waitForDrawing(page, '58 nodes')
  await menuButton(page, 'File').click()
  await page
    .locator('#menu-popup')
    .getByRole('menuitem', { name: 'Open…' })
    .click()
  const url = new URL('examples/assembly_graph.gfa', page.url()).href
  await page.locator('#url').fill(url)
  await page
    .locator('#open-dialog')
    .getByRole('button', { name: 'Open', exact: true })
    .click()
  await waitForDrawing(page, '64 nodes')
  await expect(page.locator('#caption')).toContainText('assembly_graph.gfa')
  expect(new URL(page.url()).searchParams.get('gfa')).toBe(url)
})

test('a dropped file loads under its name', async ({ page }) => {
  await openPage(page)
  await waitForDrawing(page, '58 nodes')
  await page.evaluate(text => {
    const data = new DataTransfer()
    data.items.add(new File([text], 'dropped.gfa', { type: 'text/plain' }))
    window.dispatchEvent(
      new DragEvent('drop', { dataTransfer: data, cancelable: true }),
    )
  }, TINY_GFA)
  await waitForDrawing(page, '3 nodes · 2 edges')
  await expect(page.locator('#caption')).toContainText('dropped.gfa')
  await expect(page).toHaveTitle(/dropped\.gfa/)
})
