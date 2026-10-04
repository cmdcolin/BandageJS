import {
  MICB_DB,
  expect,
  openPage,
  test,
  viewMenu,
  waitForDrawing,
} from './fixtures'

import type { Page } from '@playwright/test'

const MICB = `gbz=${encodeURIComponent(MICB_DB)}&loc=chr6:31,500,000-31,501,000&ref=GRCh38&layout=force`

// Every line the spinner shows from now on
async function spinnerLines(page: Page) {
  await page.evaluate(() => {
    const text = document.getElementById('loading-text')!
    const w = window as { said?: string[] }
    w.said = []
    new MutationObserver(() => {
      w.said!.push(text.textContent ?? '')
    }).observe(text, { childList: true, characterData: true, subtree: true })
  })
  return () => page.evaluate(() => (window as { said?: string[] }).said!)
}

async function toggleStrip(page: Page) {
  await (
    await viewMenu(page)
  )
    .getByRole('menuitemcheckbox', { name: /^Walk rows under the graph/ })
    .click()
  await page.keyboard.press('Escape')
}

test('turning walk rows on cuts a gbz window again for whole walks, keeping the lifted walk', async ({
  page,
}) => {
  await openPage(page, MICB)
  await waitForDrawing(page, /91 paths/)
  await (
    await viewMenu(page, /^Walk/)
  )
    .getByRole('menu', { name: 'Walks' })
    .getByRole('menuitemcheckbox')
    .first()
    .click()
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  const lifted = new URL(page.url()).searchParams.getAll('walk')
  expect(lifted).toHaveLength(1)

  const said = await spinnerLines(page)
  await toggleStrip(page)
  await expect(page.locator('#walk-strip')).toBeVisible()
  await expect.poll(said).toContainEqual(expect.stringMatching(/^Cutting/))
  await waitForDrawing(page, /91 paths/)
  await expect(page.locator('#legends .walk-key')).toHaveCount(1)
  expect(new URL(page.url()).searchParams.getAll('walk')).toEqual(lifted)

  // the strip off, a window cut to the edge is enough again
  const again = await spinnerLines(page)
  await toggleStrip(page)
  await expect(page.locator('#walk-strip')).toBeHidden()
  await expect.poll(again).toContainEqual(expect.stringMatching(/^Cutting/))
  await waitForDrawing(page, /91 paths/)
})
