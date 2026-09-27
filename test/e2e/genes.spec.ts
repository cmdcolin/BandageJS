import {
  K12_HUB,
  expect,
  menuButton,
  openPage,
  test,
  waitForDrawing,
} from './fixtures'

import type { Page } from '@playwright/test'

const genes = (page: Page) => page.locator('#overlay-svg .gene')
const exons = (page: Page) =>
  page.locator('#overlay-svg g[transform] path[stroke="#1c1c22"]')

async function displayItem(page: Page, name: RegExp | string) {
  await menuButton(page, 'Display').click()
  return page.locator('#menu-popup').getByRole('menuitemcheckbox', { name })
}

async function chooseLayout(page: Page, name: RegExp) {
  await menuButton(page, /^Layout/).click()
  await page.locator('#menu-popup').getByRole('menuitemradio', { name }).click()
}

// Draw x along's radios come after Lift a walk's, which can share their names
async function drawAlong(page: Page, path: string) {
  await menuButton(page, /^Walk/).click()
  await page
    .locator('#menu-popup')
    .getByRole('menuitemradio', { name: path })
    .last()
    .click()
}

async function openGenesFile(page: Page, name: string, bed: string) {
  await menuButton(page, 'Display').click()
  const chooser = page.waitForEvent('filechooser')
  await page
    .locator('#menu-popup')
    .getByRole('menuitem', { name: /^Open genes/ })
    .click()
  await (
    await chooser
  ).setFiles({ name, mimeType: 'text/plain', buffer: Buffer.from(bed) })
}

// opened as a bundled example, which can name the region it was cut for
async function openExampleText(
  page: Page,
  file: string,
  lines: string[],
  region?: string,
  query = '',
) {
  await page.route(`**/examples/${file}`, route =>
    route.fulfill({ body: lines.map(l => l.replaceAll(' ', '\t')).join('\n') }),
  )
  await page.route('**/examples/index.json', route =>
    route.fulfill({ json: [{ file, name: file, description: '', region }] }),
  )
  await openPage(page, `gfa=examples/${file}${query}`)
}

const MYGENE_BED =
  'chr6\t160560000\t160640000\tMYGENE\t0\t+\t160560000\t160640000\t0\t2\t5000,5000,\t0,75000,\n'

// CHM13 and GRCh38 both call their contig chr6, and here their walks share its
// coordinates, as the two assemblies' chr6 overlap over most of their length
// K-12's coordinates on NCBI's NC_000913.3, over ycbF, under a name no hub
// knows it by
const K12_WINDOW = [
  'S k1 AAAAAAAAAA SN:Z:K12#1#chr SO:i:1004500 SR:i:0',
  'S k2 CCCCCCCCCC SN:Z:K12#1#chr SO:i:1004510 SR:i:0',
  'S k3 GGGGGGGGGG SN:Z:K12#1#chr SO:i:1004520 SR:i:0',
  'S k4 TTTTT SN:Z:Sakai#1#chr SO:i:0 SR:i:1',
  'L k1 + k2 + 0M',
  'L k2 + k3 + 0M',
  'L k1 + k4 + 0M',
  'L k4 + k3 + 0M',
]

const BARE = [
  'S s1 AAAAAAAAAA SN:Z:chr6 SO:i:160560000 SR:i:0',
  'S s2 CCCCCCCCCC SN:Z:chr6 SO:i:160560010 SR:i:0',
  'S s3 GGGGGGGGGG SN:Z:chr6 SO:i:160560020 SR:i:0',
  'S s4 TTTTT SN:Z:HG1#1#ctg SO:i:0 SR:i:1',
  'L s1 + s2 + 0M',
  'L s2 + s3 + 0M',
  'L s1 + s4 + 0M',
  'L s4 + s3 + 0M',
]

async function referenceItem(page: Page) {
  await menuButton(page, 'Display').click()
  return page
    .locator('#menu-popup')
    .getByRole('menuitem', { name: /Reference assembly/ })
}

async function title(page: Page, gene: string) {
  return genes(page).filter({ hasText: gene }).locator('title')
}

const TWO_REFERENCES = [
  'S 1 AAAAAAAAAA',
  'S 2 CCCCCCCCCC',
  'S 3 GGGGGGGGGG',
  'S 4 TTTTTTTTTT',
  'L 1 + 2 + 0M',
  'L 2 + 3 + 0M',
  'L 1 + 4 + 0M',
  'L 4 + 3 + 0M',
  'W CHM13 0 chr6 160560000 160560030 >1>2>3',
  'W GRCh38 0 chr6 160560000 160560030 >1>4>3',
]

test('RefSeq genes pin to the backbone of the LPA graph', async ({
  page,
  geneRequests,
}) => {
  await openPage(page)
  await waitForDrawing(page, '58 nodes')
  await expect(genes(page).filter({ hasText: 'LPA' })).toHaveCount(1)
  expect(await exons(page).count()).toBeGreaterThan(0)
  await expect(
    genes(page).filter({ hasText: 'LPA' }).locator('title'),
  ).toHaveText(/^LPA\nchr6:160,531,482-160,664,275, − strand/)
  expect(geneRequests.some(u => u.endsWith('.csi'))).toBe(true)
})

test('genes follow the layouts that draw a backbone', async ({ page }) => {
  await openPage(page)
  await waitForDrawing(page, '58 nodes')
  for (const layout of [/^Anchored/, /^Ordered/, /^Sample rows/]) {
    await chooseLayout(page, layout)
    await expect(genes(page).filter({ hasText: 'LPA' })).toHaveCount(1)
  }
  await chooseLayout(page, /^Variant map/)
  await expect(genes(page)).toHaveCount(0)
  const item = await displayItem(page, /Genes/)
  await expect(item).toBeDisabled()
  await expect(item).toContainText('Not drawn in the Variant map layout')
})

test('the Genes toggle hides them', async ({ page }) => {
  await openPage(page)
  await waitForDrawing(page, '58 nodes')
  await expect(genes(page).first()).toBeVisible()
  await (await displayItem(page, /Genes/)).click()
  await expect(genes(page)).toHaveCount(0)
  await expect(exons(page)).toHaveCount(0)
  await (await displayItem(page, /Genes/)).click()
  await expect(genes(page).filter({ hasText: 'LPA' })).toHaveCount(1)
})

test('Open genes… draws a BED file in place of RefSeq', async ({ page }) => {
  await openPage(page)
  await waitForDrawing(page, '58 nodes')
  await expect(genes(page).filter({ hasText: 'LPA' })).toHaveCount(1)
  await openGenesFile(page, 'mine.bed', `track name=mine\n${MYGENE_BED}`)
  await expect(genes(page).filter({ hasText: 'MYGENE' })).toHaveCount(1)
  await expect(genes(page).filter({ hasText: 'LPA' })).toHaveCount(0)
  await expect(
    page.locator('#menu-popup').getByRole('menuitem', { name: /Open genes/ }),
  ).toBeHidden()
  await menuButton(page, 'Display').click()
  await expect(page.locator('#menu-popup')).toContainText(
    'Showing mine.bed in place of NCBI RefSeq genes (hg38)',
  )
})

test('a genes file on another contig says so and changes nothing', async ({
  page,
}) => {
  await openPage(page)
  await waitForDrawing(page, '58 nodes')
  await expect(genes(page).filter({ hasText: 'LPA' })).toHaveCount(1)
  await openGenesFile(page, 'chr1.bed', MYGENE_BED.replace('chr6', 'chr1'))
  await expect(page.locator('#toast')).toContainText(
    'chr1.bed has genes on chr1, none on the reference GRCh38#0#chr6',
  )
  await expect(genes(page).filter({ hasText: 'LPA' })).toHaveCount(1)
})

test('CHM13 reads hs1 genes under their NCBI names, GRCh38 hg38 genes', async ({
  page,
  geneRequests,
}) => {
  await openPage(page, 'gfa=examples/chr1_chm13_grch38_paths.gfa')
  await waitForDrawing(page, /nodes/)
  await expect(await title(page, 'DENND1B')).toHaveText(
    /^DENND1B\nchr1:196,766,532-197,041,541, − strand/,
  )
  expect(geneRequests.some(u => u.includes('/hs1/hs1.gff.gz'))).toBe(true)
  expect(geneRequests.some(u => u.includes('/hg38/'))).toBe(false)
  await expect(await referenceItem(page)).toContainText(
    'T2T CHM13v2.0/hs1), from jbrowse.org/ucsc/hs1',
  )
  await page.keyboard.press('Escape')

  await drawAlong(page, 'GRCh38#0#chr1')
  await expect(await title(page, 'DENND1B')).toHaveText(
    /^DENND1B\nchr1:197,504,748-197,782,150, − strand/,
  )
})

test('genes follow the reference a walk graph is drawn along', async ({
  page,
  geneRequests,
}) => {
  await openExampleText(
    page,
    'two_references.gfa',
    TWO_REFERENCES,
    'chr6:160,560,000-160,560,030',
  )
  await waitForDrawing(page, '4 nodes')
  await expect(await referenceItem(page)).toContainText('hs1')
  await page.keyboard.press('Escape')
  await expect(genes(page)).toHaveCount(0)
  expect(geneRequests.some(u => u.includes('/hg38/'))).toBe(false)

  await drawAlong(page, 'GRCh38#0#chr6')
  await expect(genes(page).filter({ hasText: 'LPA' })).toHaveCount(1)

  await drawAlong(page, 'CHM13#0#chr6')
  await expect(genes(page)).toHaveCount(0)
})

test('a genes file stays with the reference it was opened on', async ({
  page,
}) => {
  await openExampleText(
    page,
    'two_references.gfa',
    TWO_REFERENCES,
    'chr6:160,560,000-160,560,030',
  )
  await waitForDrawing(page, '4 nodes')
  await openGenesFile(page, 'mine.bed', MYGENE_BED)
  await expect(genes(page).filter({ hasText: 'MYGENE' })).toHaveCount(1)

  await drawAlong(page, 'GRCh38#0#chr6')
  await expect(genes(page).filter({ hasText: 'MYGENE' })).toHaveCount(0)
  await expect(genes(page).filter({ hasText: 'LPA' })).toHaveCount(1)

  await drawAlong(page, 'CHM13#0#chr6')
  await expect(genes(page).filter({ hasText: 'MYGENE' })).toHaveCount(1)
})

test('bare contig names fetch no genes but take a genes file', async ({
  page,
  geneRequests,
}) => {
  await openExampleText(page, 'bare.gfa', BARE)
  await waitForDrawing(page, '4 nodes')
  const item = await displayItem(page, /Genes/)
  await expect(item).toBeDisabled()
  await expect(item).toContainText(
    'The reference chr6 names no sample, so its assembly is unknown',
  )
  await page.keyboard.press('Escape')
  expect(geneRequests).toEqual([])
  await openGenesFile(page, 'mine.bed', MYGENE_BED)
  await expect(genes(page).filter({ hasText: 'MYGENE' })).toHaveCount(1)
})

test('a link can say which assembly bare contig names are on', async ({
  page,
}) => {
  await openExampleText(page, 'bare.gfa', BARE, undefined, '&assembly=hg38')
  await waitForDrawing(page, '4 nodes')
  await expect(genes(page).filter({ hasText: 'LPA' })).toHaveCount(1)
  expect(new URL(page.url()).searchParams.get('assembly')).toBe('hg38')
})

test('the E. coli example reads K-12 genes from its GenArk hub', async ({
  page,
}) => {
  await openPage(page, 'gfa=examples/ecoli_pggb_subgraph.gfa')
  await waitForDrawing(page, /nodes/)
  await expect(await title(page, 'ycbF')).toHaveText(
    /^ycbF\nchr:1,003,947-1,004,657, \+ strand/,
  )
  await expect(genes(page).filter({ hasText: 'pyrD' })).toHaveCount(1)
  expect(new URL(page.url()).searchParams.has('assembly')).toBe(false)
})

test('a sample no hub knows gets no genes or links until one is chosen', async ({
  page,
  geneRequests,
}) => {
  await openExampleText(page, 'k12.gfa', K12_WINDOW)
  await waitForDrawing(page, '4 nodes')
  const item = await displayItem(page, /Genes/)
  await expect(item).toBeDisabled()
  await expect(item).toContainText('No hub has an assembly for K12')
  await page.keyboard.press('Escape')
  await menuButton(page, 'JBrowse').click()
  const region = page
    .locator('#menu-popup')
    .getByRole('menuitem', { name: /Open this region/ })
  await expect(region).toBeDisabled()
  await expect(region).toContainText('No hub has an assembly for K12')
  await page.keyboard.press('Escape')
  expect(geneRequests).toEqual([])

  await (await referenceItem(page)).click()
  const dialog = page.locator('#reference-dialog')
  await expect(dialog).toContainText("The graph's reference is K12#1#chr")
  await dialog.getByLabel('JBrowse config url').fill(K12_HUB)
  await dialog.getByRole('button', { name: 'Add' }).click()
  await expect(dialog.locator('#hub-list')).toContainText(
    'jbrowse.org/hubs/genark/GCF/000/005/845/GCF_000005845.2',
  )
  await dialog
    .locator('#reference-assembly')
    .selectOption(`${K12_HUB}\tGCF_000005845.2`)
  await expect(dialog.locator('#reference-genes')).toHaveValue(
    'GCF_000005845.2-ncbiGff',
  )
  await dialog.getByLabel(/Sequence names/).fill('chr:NC_000913.3')
  await dialog.getByRole('button', { name: 'Apply' }).click()
  await expect(genes(page).filter({ hasText: 'ycbF' })).toHaveCount(1)
  const params = new URL(page.url()).searchParams
  expect(params.get('assembly')).toBe('GCF_000005845.2')
  expect(params.get('contigs')).toBe('chr:NC_000913.3')
  expect(params.getAll('hub')).toEqual([K12_HUB])
})

test('the region link opens the hub with its gene and graph tracks', async ({
  page,
}) => {
  await openPage(page)
  await waitForDrawing(page, '58 nodes')
  await expect(genes(page).filter({ hasText: 'LPA' })).toHaveCount(1)
  await page.evaluate(() => {
    window.open = url => {
      document.body.dataset.opened = String(url)
      return null
    }
  })
  await menuButton(page, 'JBrowse').click()
  const item = page
    .locator('#menu-popup')
    .getByRole('menuitem', { name: /Open this region/ })
  await expect(item).toContainText(
    'of hg38, from jbrowse.org/pangenome/hprc-grch38',
  )
  await item.click()
  const opened = await page.locator('body').getAttribute('data-opened')
  const hash = new URLSearchParams(new URL(opened!).hash.slice(1))
  expect(hash.get('config')).toBe(
    'https://jbrowse.org/pangenome/hprc-grch38/config.json',
  )
  const view = JSON.parse(hash.get('session')!.replace(/^spec-/, '')).views[0]
  expect(view.assembly).toBe('hg38')
  expect(view.tracks).toContain('hg38_ncbiRefSeq_ucsc')
  expect(view.tracks).toContain('hprc_minigraph_segments')
})

test('a graph with no reference fetches no genes', async ({
  page,
  geneRequests,
}) => {
  await openPage(page, 'gfa=examples/assembly_graph.gfa')
  await waitForDrawing(page, '64 nodes')
  const item = await displayItem(page, /Genes/)
  await expect(item).toBeDisabled()
  await expect(item).toContainText('Needs a graph with reference coordinates')
  expect(geneRequests).toEqual([])
})

test('an unreadable hub leaves the graph drawn and says so', async ({
  page,
}) => {
  await page.route(/hprc-grch38\/config\.json/, route => route.abort())
  await openPage(page)
  await waitForDrawing(page, '58 nodes')
  const item = await displayItem(page, /Genes/)
  await expect(item).toContainText(
    "No hub has an assembly for GRCh38 (couldn't read jbrowse.org/pangenome/hprc-grch38)",
  )
})

test('a failed RefSeq read leaves the graph drawn with a notice', async ({
  page,
}) => {
  await page.route(/ncbiRefSeq/, route => route.abort())
  await openPage(page)
  await waitForDrawing(page, '58 nodes')
  await expect(page.locator('#toast')).toContainText(
    "Couldn't read NCBI RefSeq genes (hg38)",
  )
  await expect(page.locator('#toast')).not.toHaveClass(/error/)
  await expect(genes(page)).toHaveCount(0)
})
