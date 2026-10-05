import { MICB_DB, expect, openPage, test, waitForDrawing } from './fixtures'

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

async function goTo(page: Page, text: string) {
  await page.locator('#locate').fill(text)
  await page.locator('#locate').press('Enter')
}

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

test.describe('in an rGFA with a window', () => {
  test.beforeEach(async ({ page }) => {
    await openPage(page)
    await waitForDrawing(page, '58 nodes')
    await expect(page.locator('#overlay-svg [data-halo]').first()).toBeVisible()
  })

  test('the box shows the window, and a region in it is framed', async ({
    page,
  }) => {
    const locate = page.locator('#locate')
    await expect(locate).toHaveValue('chr6:160,525,000-160,655,000')
    const fitted = await overlayPositions(page)
    await goTo(page, 'chr6:160,600,000-160,601,000')
    await expect.poll(() => overlayPositions(page)).not.toEqual(fitted)
    await expect.poll(() => params(page).has('view')).toBe(true)
    await expect(page.locator('#toast')).toBeHidden()
  })

  test('one position selects the node under it', async ({ page }) => {
    await goTo(page, 'chr6:160,600,500')
    await expect(page.locator('#details')).toBeVisible()
    await expect(page.locator('#details')).toContainText('chr6:')
  })

  test('g focuses the box and a gene name frames the gene', async ({
    page,
  }) => {
    await expect(page.locator('#overlay-svg .gene').first()).toBeVisible({
      timeout: 20_000,
    })
    const fitted = await overlayPositions(page)
    await page.keyboard.press('g')
    await expect(page.locator('#locate')).toBeFocused()
    await page.keyboard.type('lpa')
    await page.keyboard.press('Enter')
    await expect.poll(() => overlayPositions(page)).not.toEqual(fitted)
    await expect(page.locator('#toast')).toBeHidden()
  })

  test('a region off the graph, or no region, says so', async ({ page }) => {
    await goTo(page, 'chr9:1-2')
    await expect(page.locator('#toast')).toContainText(
      'Nothing in the graph at chr9:1-2; it covers GRCh38#0#chr6:',
    )
    await goTo(page, 'nowhere')
    await expect(page.locator('#toast')).toContainText(
      'nowhere is not a region like',
    )
  })

  test('› steps half a window on', async ({ page }) => {
    await page.locator('#locate-forward').click()
    await expect(page.locator('#locate')).toHaveValue(
      'chr6:160,590,000-160,720,000',
    )
    await page.locator('#locate-back').click()
    await expect(page.locator('#locate')).toHaveValue(
      'chr6:160,525,000-160,655,000',
    )
  })
})

test.describe('in a window cut from a database', () => {
  const MICB = `gbz=${encodeURIComponent(MICB_DB)}&loc=chr6:31,500,000-31,501,000&ref=GRCh38&layout=force`

  test('a region inside the window is framed without a cut, one outside is cut', async ({
    page,
  }) => {
    await openPage(page, MICB)
    await waitForDrawing(page, /91 paths/)
    await expect(page.locator('#locate')).toHaveValue(
      'chr6:31,500,000-31,501,000',
    )
    const said = await spinnerLines(page)
    await goTo(page, 'chr6:31,500,200-31,500,400')
    await expect.poll(() => params(page).has('view')).toBe(true)
    expect(await said()).toEqual([])
    expect(params(page).get('loc')).toBe('chr6:31,500,000-31,501,000')

    await goTo(page, 'chr6:31,500,500-31,501,500')
    await expect.poll(said).toContainEqual(expect.stringMatching(/^Cutting/))
    await waitForDrawing(page, /paths/)
    expect(params(page).get('loc')).toBe('chr6:31,500,500-31,501,500')
    await expect(page.locator('#locate')).toHaveValue(
      'chr6:31,500,500-31,501,500',
    )

    // › steps from the window on screen, and so cuts again
    const again = await spinnerLines(page)
    await page.locator('#locate-forward').click()
    await expect.poll(again).toContainEqual(expect.stringMatching(/^Cutting/))
    await waitForDrawing(page, /paths/)
    expect(params(page).get('loc')).toBe('chr6:31,501,000-31,502,000')
  })
})
