import {
  expect,
  inkedPixels,
  openMenu,
  openPage,
  test,
  waitForDrawing,
} from './fixtures'

test('with no query the page opens the first example', async ({
  page,
  consoleErrors,
}) => {
  await openPage(page)
  await waitForDrawing(page, '58 nodes · 81 edges')
  await expect(page.locator('#caption')).toBeVisible()
  await expect(page.locator('#caption')).toContainText('hprc_kiv2.gfa')
  await expect(page.locator('#graph')).toBeVisible()
  await expect(page.locator('#empty')).toBeHidden()
  expect(await inkedPixels(page.locator('#graph'))).toBeGreaterThan(0)
  expect(consoleErrors).toEqual([])
})

test('a layout the graph cannot draw falls back to force-directed with halos', async ({
  page,
}) => {
  await openPage(page, 'gfa=examples/ecoli_rgfa_slice.gfa&layout=walkrows')
  await waitForDrawing(page, /nodes/)
  await expect(
    (await openMenu(page, 'Layout')).getByRole('menuitemradio', {
      name: 'Force-directed',
    }),
  ).toHaveAttribute('aria-checked', 'true')
  await page.keyboard.press('Escape')
  const halos = page.locator('#overlay-svg [data-halo]')
  await expect(halos.first()).toBeVisible()
})

test('the colour key counts whole bases between its ends', async ({ page }) => {
  await openPage(page, 'gfa=examples/ecoli_pggb_subgraph.gfa&layout=force')
  await waitForDrawing(page, /nodes/)
  await expect(page.locator('#legends .ramp-ends')).toHaveText(
    /^1,004,501\(429 bp\)1,004,930$/,
  )
})

test('the tube map keeps its pixel size and draws after a wheel zoom', async ({
  page,
}) => {
  await openPage(page, 'gfa=examples/ecoli_pggb_subgraph.gfa&layout=tubemap')
  await waitForDrawing(page, /nodes/)
  await expect(
    (await openMenu(page, 'Layout')).getByRole('menuitemradio', {
      name: 'Tube map',
      exact: true,
    }),
  ).toHaveAttribute('aria-checked', 'true')
  await page.keyboard.press('Escape')
  const tube = page.locator('#tube')
  await expect(tube).toBeVisible()
  await expect.poll(() => inkedPixels(tube)).toBeGreaterThan(0)
  const size = () =>
    tube.evaluate((c: HTMLCanvasElement) => ({
      width: c.width,
      height: c.height,
      client: [c.clientWidth, c.clientHeight],
    }))
  const before = await size()
  const inkBefore = await inkedPixels(tube)
  const box = (await tube.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.wheel(0, -400)
  await expect.poll(() => inkedPixels(tube)).not.toBe(inkBefore)
  expect(await inkedPixels(tube)).toBeGreaterThan(0)
  expect(await size()).toEqual(before)
})

test('the corner hint tells a mouse to scroll and drag nodes', async ({
  page,
}) => {
  await openPage(page)
  await waitForDrawing(page, /nodes/)
  const hint = page.locator('#hint')
  await expect(hint).toContainText('drag a node to move it', {
    useInnerText: true,
  })
  await expect(hint).not.toContainText('tap', { useInnerText: true })
})

test.describe('on a touch screen', () => {
  test.use({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 390, height: 760 },
  })

  test('the corner hint speaks of taps, and drags no node', async ({
    page,
  }) => {
    await openPage(page)
    await waitForDrawing(page, /nodes/)
    const hint = page.locator('#hint')
    await expect(hint).toContainText('tap a node for its details', {
      useInnerText: true,
    })
    await expect(hint).not.toContainText('drag a node', { useInnerText: true })
  })
})
