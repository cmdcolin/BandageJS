import {
  expect,
  inkedPixels,
  menuButton,
  openPage,
  test,
  viewMenu,
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

function walkMenu(page: Page) {
  return viewMenu(page, /^Walk/)
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
  await expect(
    popup.getByRole('menuitem', { name: 'Walks: 2 lifted' }),
  ).toBeVisible()
  const key = page.locator('#legends .legend.walks')
  await expect(key.locator('.walk-key')).toHaveCount(2)
  await expect(key).toContainText('449 bp reversed')
  await expect(key).toContainText('not on these walks')
  expect(new URL(page.url()).searchParams.getAll('walk')).toEqual([K12, IAI39])
})

test('Enter on a walk keeps the focus there as None comes on above it', async ({
  page,
}) => {
  await openPage(page, PGGB)
  await waitForDrawing(page, /nodes/)
  const popup = await walkMenu(page)
  const k12 = popup.getByRole('menuitemcheckbox', { name: /^K12/ })
  await k12.focus()
  await page.keyboard.press('Enter')
  await expect(k12).toHaveAttribute('aria-checked', 'true')
  await expect(popup.getByRole('menuitem', { name: 'None' })).toBeEnabled()
  await expect(k12).toBeFocused()
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

// Inked points of a canvas in page coordinates, a few hundred at most
async function inkedPoints(page: Page, selector: string) {
  return page.locator(selector).evaluate((c: HTMLCanvasElement) => {
    const dpr = c.width / c.clientWidth
    const { data, width, height } = c
      .getContext('2d')!
      .getImageData(0, 0, c.width, c.height)
    const rect = c.getBoundingClientRect()
    const step = Math.max(1, Math.round(6 * dpr))
    const points: { x: number; y: number }[] = []
    for (let y = 0; y < height; y += step) {
      for (let x = 0; x < width; x += step) {
        const i = (y * width + x) * 4
        if (data[i + 3]! > 0 && data[i]! + data[i + 1]! + data[i + 2]! < 600) {
          points.push({ x: rect.left + x / dpr, y: rect.top + y / dpr })
        }
      }
    }
    return points.filter((_, i) => i % Math.ceil(points.length / 300) === 0)
  })
}

// Hovers inked points until `line` stops reading `rest`
async function hoverUntilChanged(
  page: Page,
  selector: string,
  line: ReturnType<Page['locator']>,
  rest: string,
) {
  for (const p of await inkedPoints(page, selector)) {
    await page.mouse.move(p.x, p.y)
    if ((await line.textContent()) !== rest) {
      return
    }
  }
}

const POSITION = /^(\S+:[\d,]+-[\d,]+|not on this walk)$/

test("a hovered node's place on each lifted walk replaces the walk's stretch", async ({
  page,
}) => {
  await openPage(page, `${PGGB}${lifted(IAI39)}`)
  await waitForDrawing(page, /nodes/)
  const at = page.locator('#legends .walk-key .walk-at')
  const stretch = 'chr:2,249,412-2,249,872 (460 bp)'
  await expect(at).toHaveText(stretch)
  await hoverUntilChanged(page, '#graph', at, stretch)
  await expect(at).toHaveText(POSITION)
  await page.mouse.move(0, 0)
  await expect(at).toHaveText(stretch)
})

test('side by side, each panel title says where the hovered node sits on its walk', async ({
  page,
}) => {
  await openPage(page, `${PGGB}${lifted(K12, IAI39)}&facet=walk`)
  await waitForDrawing(page, /nodes/)
  const at = page.locator('#facets .facet-title .walk-at')
  await expect(at).toHaveCount(2)
  const stretch = (await at.nth(1).textContent())!
  await hoverUntilChanged(
    page,
    '#facets .facet:nth-child(2) canvas',
    at.nth(1),
    stretch,
  )
  await expect(at.nth(0)).toHaveText(POSITION)
  await expect(at.nth(1)).toHaveText(POSITION)
  await page.mouse.move(0, 0)
  await expect(at.nth(1)).toHaveText(stretch)
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
  await expect(popup.getByRole('menu', { name: 'Columns' })).toBeVisible()
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
  const popup = await walkMenu(page)
  await expect(popup).not.toContainText('Lift walks')
  await expect(page.locator('#legends .walk-key')).toHaveCount(0)
})

// ref walks v1 v2 v3; one sample's haplotypes take a1, or cross v3 v2 v1
// backwards
const DIPLOID = [
  'S v1 AAAA',
  'S v2 CC',
  'S v3 GGG',
  'S a1 TTTTTT',
  'L v1 + v2 + 0M',
  'L v2 + v3 + 0M',
  'L v1 + a1 + 0M',
  'L a1 + v3 + 0M',
  'W ref 0 chr 0 9 >v1>v2>v3',
  'W alt 1 chr 0 13 >v1>a1>v3',
  'W alt 2 chr 0 9 <v3<v2<v1',
].map(l => l.replaceAll(' ', '\t'))

async function openDiploid(page: Page, query: string) {
  await page.route('**/examples/diploid.gfa', route =>
    route.fulfill({ body: DIPLOID.join('\n') }),
  )
  await openPage(
    page,
    `gfa=examples/diploid.gfa&layout=force${lifted('ref#0#chr', 'alt#1#chr', 'alt#2#chr')}${query}`,
  )
  await waitForDrawing(page, /nodes/)
}

test('Draw x along keeps the lifted walks, and a link keeps the walk it follows', async ({
  page,
}) => {
  await page.route('**/examples/diploid.gfa', route =>
    route.fulfill({ body: DIPLOID.join('\n') }),
  )
  await openPage(
    page,
    `gfa=examples/diploid.gfa&layout=force${lifted('alt#2#chr')}`,
  )
  await waitForDrawing(page, /nodes/)
  const popup = await walkMenu(page)
  await popup.getByRole('menuitem', { name: /^Draw x along/ }).click()
  await popup.getByRole('menuitemradio', { name: 'alt#1#chr' }).click()
  await waitForDrawing(page, /nodes/)
  await expect(page.locator('#legends .walk-key')).toHaveCount(1)
  const params = new URL(page.url()).searchParams
  expect(params.getAll('walk')).toEqual(['alt#2#chr'])
  expect(params.get('along')).toBe('alt#1#chr')

  await page.reload()
  await waitForDrawing(page, /nodes/)
  await expect(
    (await walkMenu(page)).getByRole('menuitem', {
      name: 'Draw x along: alt#1#chr',
    }),
  ).toBeVisible()
})

test('by sample, a sample takes a row and its haplotypes the columns', async ({
  page,
}) => {
  await openDiploid(page, '&facet=sample')
  const cells = await page
    .locator('#facets .facet')
    .evaluateAll(els =>
      els.map(e => [
        (e as HTMLElement).style.gridRow,
        (e as HTMLElement).style.gridColumn,
      ]),
    )
  expect(cells).toEqual([
    ['1', '1'],
    ['2', '1'],
    ['2', '2'],
  ])
  await expect(page.locator('#facets .facet').nth(2)).toContainText(
    '9 bp reversed',
  )
})

test('Export SVG saves the drawing with its spec, and the spec copies', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await openDiploid(page, '&facet=walk')
  await menuButton(page, 'File').click()
  const download = page.waitForEvent('download')
  await page
    .locator('#menu-popup')
    .getByRole('menuitem', { name: /^Export SVG/ })
    .click()
  const file = await download
  expect(file.suggestedFilename()).toMatch(/\.svg$/)
  const svg = (await (await file.createReadStream()).toArray()).join('')
  expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/)
  expect(svg).toContain('<metadata>')
  expect(svg.match(/<svg x=/g)).toHaveLength(3)

  await menuButton(page, 'File').click()
  await page
    .locator('#menu-popup')
    .getByRole('menuitem', { name: /^Copy figure spec/ })
    .click()
  const spec = JSON.parse(
    await page.evaluate(() => navigator.clipboard.readText()),
  ) as Record<string, unknown>
  expect(spec).toMatchObject({
    gfa: expect.stringMatching(/^http.*\/examples\/diploid\.gfa$/),
    layout: 'force',
    walks: ['ref#0#chr', 'alt#1#chr', 'alt#2#chr'],
    facet: 'walk',
  })
})

test('walk rows offer no figure spec, since bandage-figure draws none', async ({
  page,
}) => {
  await openDiploid(page, '')
  const popup = await viewMenu(page, /^Layout/)
  await popup.getByRole('menuitemradio', { name: /^Walk rows/ }).click()
  await menuButton(page, 'File').click()
  const item = page
    .locator('#menu-popup')
    .getByRole('menuitem', { name: /^Copy figure spec/ })
  await expect(item).toBeDisabled()
  await expect(item).toContainText('bandage-figure draws no Walk rows layout')
})

test('the copied spec states the column count inside its facet', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await openDiploid(page, '&facet=walk&columns=1')
  await menuButton(page, 'File').click()
  await page
    .locator('#menu-popup')
    .getByRole('menuitem', { name: /^Copy figure spec/ })
    .click()
  const spec = JSON.parse(
    await page.evaluate(() => navigator.clipboard.readText()),
  ) as Record<string, unknown>
  expect(spec.facet).toEqual({ field: 'walk', columns: 1 })
  expect(spec).not.toHaveProperty('columns')
})
