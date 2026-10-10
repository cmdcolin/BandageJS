import { expect, openPage, test, waitForDrawing, withBubbles } from './fixtures'

// chr 0 1 2 5, and an alt arm from 1 to 2 with a SNP between a and d. Popping
// 1..2 by reach would derive 1..2 again; it opens into a..d instead.
const NESTED_GFA = [
  'H VN:Z:1.0',
  'S 0 AAAA SN:Z:chr SO:i:0 SR:i:0',
  'S 1 ACGT SN:Z:chr SO:i:4 SR:i:0',
  'S 2 GGCC SN:Z:chr SO:i:8 SR:i:0',
  'S 5 TTAA SN:Z:chr SO:i:12 SR:i:0',
  'S a TT SN:Z:alt SO:i:0 SR:i:1',
  'S b G SN:Z:alt SO:i:2 SR:i:1',
  'S c C SN:Z:alt2 SO:i:0 SR:i:2',
  'S d AA SN:Z:alt SO:i:3 SR:i:1',
  ...['0 1', '1 2', '2 5', '1 a', 'a b', 'a c', 'b d', 'c d', 'd 2'].map(
    l => `L ${l.replace(' ', ' + ')} + 0M`,
  ),
]

test('a pop opens the bubbles inside the one it opened', async ({ page }) => {
  await page.route('**/examples/nested.gfa', route =>
    route.fulfill({
      body: NESTED_GFA.map(l => l.replaceAll(' ', '\t')).join('\n'),
    }),
  )
  await page.route('**/examples/index.json', route =>
    route.fulfill({
      json: [{ file: 'nested.gfa', name: 'nested.gfa', description: '' }],
    }),
  )
  await withBubbles(page)
  await openPage(page, 'gfa=examples/nested.gfa')
  await waitForDrawing(page, '8 nodes')
  const chips = page.locator('#overlay-svg [data-halo]')

  await chips.first().click()
  await waitForDrawing(page, '6 nodes')
  await chips.first().click()
  await waitForDrawing(page, '4 nodes')
  await expect(page.locator('#back')).toHaveText(/^◀ Back to .+ at chr:8$/)
  await expect(page.locator('#caption')).toContainText('SNP in ')
  // the SNP is the whole drawing now: named, but opening it would redraw it
  const own = page.locator('#overlay-svg .chip', { hasText: 'SNP' })
  await expect(own).toBeVisible()
  await expect(own).not.toHaveAttribute('data-halo')
})
