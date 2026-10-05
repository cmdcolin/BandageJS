import {
  expect,
  openMenu,
  openPage,
  test,
  viewMenu,
  waitForDrawing,
} from './fixtures'

const CACTUS = 'gfa=examples/cactus_240_280.gfa'

test('a link with reads draws the tube map with them, and a node counts its reads', async ({
  page,
}) => {
  await openPage(
    page,
    `${CACTUS}&reads=examples/cactus_240_280.gaf&layout=force`,
  )
  await waitForDrawing(page, /reads · Force-directed/)
  await expect(page.locator('#stats')).toContainText('236 reads')
  await expect(page.locator('#toast')).toContainText(
    '236 of 236 reads in cactus_240_280.gaf lie on this graph',
  )
  expect(new URL(page.url()).searchParams.get('reads')).toBe(
    'examples/cactus_240_280.gaf',
  )

  await page.locator('#find').fill('247')
  await page.locator('#find').press('Enter')
  const details = page.locator('#details')
  await expect(details).toContainText('Reads')
  await expect(details).toContainText(/\d+ of 236 over it/)
  await expect(
    details.locator('li').filter({ hasText: 'ERR194148' }).first(),
  ).toBeVisible()

  const popup = await viewMenu(page)
  const width = popup.getByRole('menuitemcheckbox', {
    name: 'Width by read coverage',
  })
  await expect(width).toHaveAttribute('aria-checked', 'true')
  await width.click()
  await expect(width).toHaveAttribute('aria-checked', 'false')
  await page.keyboard.press('Escape')

  await (
    await openMenu(page, 'Layout')
  )
    .getByRole('menuitemradio', { name: 'Tube map', exact: true })
    .click()
  await waitForDrawing(page, /reads · Tube map/)
})

test('the cactus example opens as a tube map with its reads, and a dropped GAF attaches', async ({
  page,
}) => {
  await openPage(page, `${CACTUS}&layout=tubemap`)
  await waitForDrawing(page, /236 reads · Tube map/)

  await openPage(page, `${CACTUS}&layout=force`)
  await waitForDrawing(page, /nodes/)
  const gaf = await page.evaluate(() =>
    fetch('examples/cactus_240_280.gaf').then(r => r.text()),
  )
  await page.evaluate(text => {
    const data = new DataTransfer()
    data.items.add(new File([text], 'mine.gaf', { type: 'text/plain' }))
    window.dispatchEvent(
      new DragEvent('drop', { dataTransfer: data, cancelable: true }),
    )
  }, gaf.split('\n').slice(0, 50).join('\n'))
  await waitForDrawing(page, /\d+ reads/)
  await expect(page.locator('#toast')).toContainText(
    /reads in mine.gaf lie on this graph/,
  )
  expect(new URL(page.url()).searchParams.has('reads')).toBe(false)
})
