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

async function viewItem(page: Page, name: RegExp | string) {
  await menuButton(page, 'View').click()
  return page.locator('#menu-popup').getByRole('menuitemcheckbox', { name })
}

async function chooseLayout(page: Page, name: RegExp) {
  await menuButton(page, /^Layout/).click()
  await page.locator('#menu-popup').getByRole('menuitemradio', { name }).click()
}

// Draw x along lists each fragment of a walk under the walk's one name
async function drawAlong(page: Page, path: string) {
  await menuButton(page, /^Walk/).click()
  await page
    .locator('#menu-popup')
    .getByRole('menuitem', { name: /^Draw x along/ })
    .click()
  await page
    .locator('#menu-popup')
    .getByRole('menuitemradio', { name: path })
    .last()
    .click()
}

async function openGenesFile(page: Page, name: string, bed: string) {
  await menuButton(page, 'Reference').click()
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

// K-12's coordinates on NCBI's NC_000913.3, over ycbF, under a sample name no
// hub knows
const KAY12_WINDOW = [
  'S k1 AAAAAAAAAA SN:Z:Kay12#1#chr SO:i:1004500 SR:i:0',
  'S k2 CCCCCCCCCC SN:Z:Kay12#1#chr SO:i:1004510 SR:i:0',
  'S k3 GGGGGGGGGG SN:Z:Kay12#1#chr SO:i:1004520 SR:i:0',
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

async function referenceMenu(page: Page) {
  await menuButton(page, 'Reference').click()
  return page.locator('#menu-popup')
}

async function title(page: Page, gene: string) {
  return genes(page).filter({ hasText: gene }).locator('title')
}

// CHM13 and GRCh38 both call their contig chr6, and here their walks share its
// coordinates, as the two assemblies' chr6 overlap over most of their length
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

// GRCh38 through LPA, and HG00099#1 through the one gene on its CTGX
const HAPLOTYPE_GFA = [
  'S 1 AAAAAAAAAA',
  'S 2 CCCCCCCCCC',
  'S 3 GGGGGGGGGG',
  'S 4 TTTTTTTTTTTTTTT',
  'L 1 + 2 + 0M',
  'L 2 + 3 + 0M',
  'L 1 + 4 + 0M',
  'L 4 + 3 + 0M',
  'W GRCh38 0 chr6 160560000 160560030 >1>2>3',
  'W HG00099 1 CTGX 1000 1035 >1>4>3',
]

test("walk rows draw each haplotype's genes from its own assembly", async ({
  page,
}) => {
  await openExampleText(
    page,
    'haplotype.gfa',
    HAPLOTYPE_GFA,
    undefined,
    '&layout=walkrows',
  )
  await waitForDrawing(page, '4 nodes')
  const rowGenes = page.locator('#overlay-svg .row-gene')
  await expect(rowGenes.locator('title')).toHaveText(['LPA', 'HAPGENE'])
  await expect(page.locator('#legends')).toContainText(
    "genes, each row's own annotation",
  )
  await menuButton(page, 'File').click()
  const download = page.waitForEvent('download')
  await page
    .locator('#menu-popup')
    .getByRole('menuitem', { name: /^Export SVG/ })
    .click()
  const svg = (
    await (await (await download).createReadStream()).toArray()
  ).join('')
  expect(svg.match(/<g class="row-gene"/g)).toHaveLength(2)
  expect(svg).toContain('>HAPGENE</text>')
  expect(svg).toContain('>genes, each row')

  const box = (await rowGenes.last().boundingBox())!
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  const info = page.locator('#info')
  await expect(info).toContainText('HG00099#1')
  await expect(info).toContainText('CTGX:1,001-1,035')
  const href = decodeURIComponent(
    (await info.getByRole('link', { name: /JBrowse/ }).getAttribute('href'))!,
  )
  expect(href).toContain('"assembly":"HG00099.1"')
  expect(href).toContain('"loc":"CTGX:1001-1035"')
  expect(href).toContain('HG00099.1_cat_genes')
  await page.keyboard.press('Escape')
  await expect(info).toBeHidden()

  await (await viewItem(page, /Genes/)).click()
  await expect(rowGenes).toHaveCount(0)
})

test("walk rows under the graph box each haplotype's genes", async ({
  page,
}) => {
  await openExampleText(
    page,
    'haplotype.gfa',
    HAPLOTYPE_GFA,
    undefined,
    '&layout=force',
  )
  await waitForDrawing(page, '4 nodes')
  await (await viewItem(page, /^Walk rows under the graph/)).click()
  await page.keyboard.press('Escape')
  const rowGenes = page.locator('#strip-bars .row-gene')
  await expect(rowGenes.locator('title')).toHaveText(['LPA', 'HAPGENE'])
  await expect(page.locator('#strip-key')).toContainText(
    "genes, each row's own annotation",
  )
  await menuButton(page, 'File').click()
  const download = page.waitForEvent('download')
  await page
    .locator('#menu-popup')
    .getByRole('menuitem', { name: /^Export SVG/ })
    .click()
  const svg = (
    await (await (await download).createReadStream()).toArray()
  ).join('')
  expect(svg.match(/<g class="row-gene"/g)).toHaveLength(2)
  expect(svg).toContain('>HG00099#1</text>')
  expect(svg).toContain('&quot;walkStrip&quot;:true')

  await (await viewItem(page, /Genes/)).click()
  await expect(rowGenes).toHaveCount(0)
})

test('genes follow the layouts that draw a backbone', async ({ page }) => {
  await openPage(page)
  await waitForDrawing(page, '58 nodes')
  for (const layout of [/^Anchored/, /^Ordered/, /^Sample rows/]) {
    await chooseLayout(page, layout)
    await expect(genes(page).filter({ hasText: 'LPA' })).toHaveCount(1)
  }
})

test('the Genes toggle hides them', async ({ page }) => {
  await openPage(page)
  await waitForDrawing(page, '58 nodes')
  await expect(genes(page).first()).toBeVisible()
  await (await viewItem(page, /Genes/)).click()
  await expect(genes(page)).toHaveCount(0)
  await expect(exons(page)).toHaveCount(0)
  await (await viewItem(page, /Genes/)).click()
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
  await menuButton(page, 'Reference').click()
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
  await expect(await referenceMenu(page)).toContainText(
    'hs1 (CHM13)found by its sample name, from jbrowse.org/ucsc/hs1',
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
  await expect(await referenceMenu(page)).toContainText('hs1 (CHM13)')
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

test('bare contig names get a question with the likely assemblies', async ({
  page,
  geneRequests,
}) => {
  await openExampleText(page, 'bare.gfa', BARE)
  await waitForDrawing(page, '4 nodes')
  const toast = page.locator('#toast')
  await expect(toast).toContainText(
    'Which assembly is chr6 on? The graph names no sample.',
  )
  await expect(
    toast.getByRole('button', { name: 'hg38 (GRCh38)' }),
  ).toBeVisible()
  await expect(toast.getByRole('button', { name: 'hs1 (CHM13)' })).toBeVisible()
  expect(geneRequests).toEqual([])
  const item = await viewItem(page, /Genes/)
  await expect(item).toBeDisabled()
  await expect(item).toContainText('Needs the assembly the reference is on')
  await page.keyboard.press('Escape')
  await expect(await referenceMenu(page)).toContainText('On hs1 (CHM13)')
  await page.keyboard.press('Escape')

  await toast.getByRole('button', { name: 'hg38 (GRCh38)' }).click()
  await expect(genes(page).filter({ hasText: 'LPA' })).toHaveCount(1)
  expect(new URL(page.url()).searchParams.get('assembly')).toBe('hg38')
  await expect(await referenceMenu(page)).toContainText(
    'as chosen for this graph, from jbrowse.org/pangenome/hprc-grch38',
  )
})

test("gbz-base's generic reference counts as naming no sample", async ({
  page,
}) => {
  await openExampleText(page, 'generic.gfa', [
    'S 1 AAAAAAAAAA',
    'S 2 CCCCCCCCCC',
    'S 3 GGGGGGGGGG',
    'L 1 + 2 + 0M',
    'L 2 + 3 + 0M',
    'W _gbwt_ref 0 chr6 160560000 160560030 >1>2>3',
  ])
  await waitForDrawing(page, '3 nodes')
  const toast = page.locator('#toast')
  await expect(toast).toContainText('Which assembly is chr6 on?')
  await toast.getByRole('button', { name: 'hg38 (GRCh38)' }).click()
  await expect(genes(page).filter({ hasText: 'LPA' })).toHaveCount(1)
})

test('bare contig names take a genes file without an assembly', async ({
  page,
}) => {
  await openExampleText(page, 'bare.gfa', BARE)
  await waitForDrawing(page, '4 nodes')
  await openGenesFile(page, 'mine.bed', MYGENE_BED)
  await expect(genes(page).filter({ hasText: 'MYGENE' })).toHaveCount(1)
})

test('a link can say which assembly bare contig names are on', async ({
  page,
}) => {
  await openExampleText(page, 'bare.gfa', BARE, undefined, '&assembly=hg38')
  await waitForDrawing(page, '4 nodes')
  await expect(genes(page).filter({ hasText: 'LPA' })).toHaveCount(1)
  await expect(page.locator('#toast')).toBeHidden()
  expect(new URL(page.url()).searchParams.get('assembly')).toBe('hg38')
})

test('the E. coli example binds K-12 through the site config', async ({
  page,
}) => {
  await openPage(page, 'gfa=examples/ecoli_pggb_subgraph.gfa')
  await waitForDrawing(page, /nodes/)
  await expect(await title(page, 'ycbF')).toHaveText(
    /^ycbF\nchr:1,003,947-1,004,657, \+ strand/,
  )
  await expect(genes(page).filter({ hasText: 'pyrD' })).toHaveCount(1)
  await expect(await referenceMenu(page)).toContainText(
    'GCF_000005845.2 (K12)found by its sample name',
  )
  expect(new URL(page.url()).searchParams.has('assembly')).toBe(false)
})

test('a site config can name assemblies for its own samples', async ({
  page,
}) => {
  await page.route(
    url => url.pathname === '/config.json' && url.hostname === 'localhost',
    route =>
      route.fulfill({
        json: {
          hubs: [
            {
              url: K12_HUB,
              aliases: { 'GCF_000005845.2': ['Kay12'] },
              refNameAliases: { 'GCF_000005845.2': { chr: 'NC_000913.3' } },
            },
          ],
        },
      }),
  )
  await openExampleText(page, 'kay12.gfa', KAY12_WINDOW)
  await waitForDrawing(page, '4 nodes')
  await expect(genes(page).filter({ hasText: 'ycbF' })).toHaveCount(1)
  await expect(page.locator('#toast')).toBeHidden()
})

test('an unknown sample is found by search and remembered', async ({
  page,
  geneRequests,
}) => {
  await openExampleText(page, 'kay12.gfa', KAY12_WINDOW)
  await waitForDrawing(page, '4 nodes')
  const region = (await referenceMenu(page)).getByRole('menuitem', {
    name: /Open this region/,
  })
  await expect(region).toBeDisabled()
  await expect(region).toContainText('No hub has an assembly for Kay12')
  await page.keyboard.press('Escape')
  expect(geneRequests).toEqual([])

  await (
    await referenceMenu(page)
  )
    .getByRole('menuitem', { name: /Choose the assembly/ })
    .click()
  const dialog = page.locator('#reference-dialog')
  await expect(dialog.locator('#reference-status')).toContainText(
    'No hub has an assembly for Kay12',
  )
  await dialog.getByRole('searchbox').fill('coli')
  await dialog
    .locator('#genome-results')
    .getByRole('button', { name: /GCF_000005845\.2/ })
    .click()
  await expect(dialog.locator('#reference-contigs select')).toHaveValue(
    'NC_000913.3',
  )
  await expect(dialog.locator('#reference-remember')).toBeChecked()
  await dialog.getByRole('button', { name: 'Use GCF_000005845.2' }).click()
  await expect(genes(page).filter({ hasText: 'ycbF' })).toHaveCount(1)
  const params = new URL(page.url()).searchParams
  expect(params.get('assembly')).toBe('GCF_000005845.2')
  expect(params.get('contigs')).toBe('chr:NC_000913.3')

  await openExampleText(page, 'kay12.gfa', KAY12_WINDOW)
  await waitForDrawing(page, '4 nodes')
  await expect(genes(page).filter({ hasText: 'ycbF' })).toHaveCount(1)
  await expect(await referenceMenu(page)).toContainText(
    'as you chose for Kay12',
  )
})

test('a common name finds any genome on genomes.jbrowse.org', async ({
  page,
}) => {
  await openExampleText(page, 'kay12.gfa', KAY12_WINDOW)
  await waitForDrawing(page, '4 nodes')
  await (
    await referenceMenu(page)
  )
    .getByRole('menuitem', { name: /Choose the assembly/ })
    .click()
  const dialog = page.locator('#reference-dialog')
  const results = dialog.locator('#genome-results')
  await dialog.getByRole('searchbox').fill('thale cress')
  await expect(results).toContainText(
    'GCF_000001735.4thale cress (tair10.1 Columbia 2018), TAIR10.1',
  )
  // K-12's hub is already read, so the index doesn't list it again
  await dialog.getByRole('searchbox').fill('K-12')
  await expect(results.getByRole('button')).toHaveCount(1)
})

test('an accession finds a genome the hubs lack', async ({ page }) => {
  await page.route(
    url => url.pathname === '/config.json' && url.hostname === 'localhost',
    route =>
      route.fulfill({
        json: {
          hubs: [],
          genomes: { genark: 'https://jbrowse.org/hubs/genark/' },
        },
      }),
  )
  await openExampleText(page, 'kay12.gfa', KAY12_WINDOW)
  await waitForDrawing(page, '4 nodes')
  await (
    await referenceMenu(page)
  )
    .getByRole('menuitem', { name: /Choose the assembly/ })
    .click()
  const dialog = page.locator('#reference-dialog')
  await dialog.getByRole('searchbox').fill('GCF_000005845.2')
  await dialog
    .locator('#genome-results')
    .getByRole('button', { name: /GCF_000005845\.2/ })
    .click()
  await dialog.getByRole('button', { name: 'Use GCF_000005845.2' }).click()
  await expect(genes(page).filter({ hasText: 'ycbF' })).toHaveCount(1)
  expect(new URL(page.url()).searchParams.getAll('hub')).toEqual([K12_HUB])
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
  await menuButton(page, 'Reference').click()
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

test('a graph with no reference fetches no genes and has no Reference menu', async ({
  page,
  geneRequests,
}) => {
  await openPage(page, 'gfa=examples/assembly_graph.gfa')
  await waitForDrawing(page, '64 nodes')
  await expect(menuButton(page, 'Reference')).toBeHidden()
  const item = await viewItem(page, /Genes/)
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
  await expect(await referenceMenu(page)).toContainText(
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
