import {
  expect,
  inkedPixels,
  menuButton,
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
  await expect(menuButton(page, /^Layout/)).toHaveText('Layout: Force-directed')
  const halos = page.locator('#overlay-svg [data-halo]')
  await expect(halos.first()).toBeVisible()
})

test('the tube map keeps its pixel size and draws after a wheel zoom', async ({
  page,
}) => {
  await openPage(page, 'gfa=examples/ecoli_pggb_subgraph.gfa&layout=tubemap')
  await waitForDrawing(page, /nodes/)
  await expect(menuButton(page, /^Layout/)).toHaveText('Layout: Tube map')
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
