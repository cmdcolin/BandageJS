#!/usr/bin/env node
//
// Reshoots the README figures in img/ from a fresh build, cutting the HPRC
// figures live from the hosted gbz-base database and haplotype index.
//
// Usage:
//   node scripts/shoot-readme.mjs              # every figure, into img/
//   node scripts/shoot-readme.mjs kiv2_facet   # one figure
import { execFileSync } from 'node:child_process'

import { chromium } from '@playwright/test'
import * as esbuild from 'esbuild'

const FIGURES = {
  kiv2_force: {
    query: 'gfa=examples/hprc_kiv2.gfa&layout=force',
    size: [1400, 800],
  },
  kiv2_facet: {
    query: [
      'gbz=hprc',
      'loc=chr6:160,614,798-160,647,758',
      'haps=HG00097,HG00133',
      'walk=GRCh38%230%23chr6',
      'walk=HG00097%231%23JBIRDD010000043.1',
      'walk=HG00133%231%23CM090050.1',
      'facet=walk',
      'columns=3',
    ].join('&'),
    size: [1400, 800],
  },
  amy1_force: {
    query: 'gfa=examples/hprc_amy1.gfa&layout=force',
    size: [1400, 800],
  },
  assembly_graph: {
    query: 'gfa=examples/assembly_graph.gfa&layout=force',
    size: [1400, 900],
    settings: { colorScheme: 'random' },
  },
  tube_map: {
    query: 'gfa=examples/ecoli_pggb_subgraph.gfa&layout=tubemap',
    size: [1400, 520],
  },
}

const names = process.argv.slice(2)
for (const name of names) {
  if (!(name in FIGURES)) {
    throw new Error(`no figure ${name}; one of ${Object.keys(FIGURES)}`)
  }
}

execFileSync('node', ['build.mjs'], { stdio: 'inherit' })
const ctx = await esbuild.context({})
const { port } = await ctx.serve({ servedir: 'dist', port: 0 })
const browser = await chromium.launch({ channel: 'chrome' })
try {
  for (const [name, { query, size, settings }] of Object.entries(FIGURES)) {
    if (names.length && !names.includes(name)) {
      continue
    }
    const page = await browser.newPage({
      viewport: { width: size[0], height: size[1] },
      deviceScaleFactor: 1,
    })
    await page.addInitScript(stored => {
      localStorage.setItem('bandagejs-hint-dismissed', 'true')
      if (stored) {
        localStorage.setItem('bandagejs-settings', JSON.stringify(stored))
      }
    }, settings)
    await page.goto(`http://localhost:${port}/?${query}`)
    await page
      .locator('#stats')
      .getByText(/nodes/)
      .waitFor({ timeout: 120_000 })
    await page
      .locator('#loading')
      .waitFor({ state: 'hidden', timeout: 120_000 })
    // the force layout settles over a few frames after the worker returns
    await page.waitForTimeout(3000)
    await page.mouse.move(0, size[1] - 1)
    await page.screenshot({ path: `img/${name}.png` })
    console.log(`img/${name}.png`)
    await page.close()
  }
} finally {
  await browser.close()
  await ctx.dispose()
}
