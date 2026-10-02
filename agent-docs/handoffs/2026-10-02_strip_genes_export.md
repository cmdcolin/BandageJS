# Handoff: genes in the walk strip, and the strip in Export SVG

Follows `2026-10-02_walk_strip.md`. Everything is landed, pushed, released and
deployed; no worktrees or branches are left open.

## Done

- **Plugin and core 4.4.0** on npm (`d369feb`, tag `v4.4.0`):
  - Gene boxes take the rows' pitch (`rowGeneBoxes(…, { rowPx, barPx })`), named
    only where the bar is at least 8 px. Rows too close to box a gene draw none:
    a first version shaded the gene's span on thin bars, but on the HPRC amylase
    strip at 3 px rows the shade read as the charcoal "off the path" colour.
    `StripFrame.boxesGenes` says which, and `stripGeneGaps` makes the key say
    "genes left out: too many rows to box them in".
  - `figureSvg` takes `walkStrip: { rows, rowGenes, rowGeneGaps }` and draws the
    strip, its labels and key below the drawing. A spec's `walkStrip: true` asks
    `bandage-figure` for it; a gbz cut then follows whole walks
    (`snarls: 'overlapping'`) unless the spec says otherwise, and so does a
    walk-rows layout, which it didn't before.
  - `walkStripFrame` defaults `maxHeight` (`WALK_STRIP_CEILING_PX`, 260) and the
    label column; `walkStripLabelsTree` draws the labels. Both hosts use them.
  - The plugin's strip reads per-haplotype genes as walk rows do; the
    `walkGeneReads` views block moved below the strip's, which it now reads.
- **BandageJS** (main, deployed to https://jbrowse.org/demos/bandagejs/): the
  strip boxes genes, and View → Walk rows under the graph reloads them. Export
  SVG and Copy figure spec carry the strip. `img/kiv2_strip.png` is reshot with
  LPA boxed on every bar, and the README says so.

## Checked

- The plugin's walk-strip and walk-rows e2e pass, but their fixtures have no
  genes, so the plugin's gene path is covered by unit tests only. BandageJS has
  an e2e test for strip genes and their export.
- Amylase with 10 samples (23 rows, 10 px) boxes genes unnamed; with 30 samples
  (63 rows, 3 px) the key notes them left out.

## Open

- In an SVG, a walk-rows key's "on the path" swatch is solid blue under the
  reference ramp, while the bars are rainbow; `walkRowsKeyTree` can't draw the
  CSS gradient hosts pass as `rampCss`. Walk-rows figures had this before the
  strip did.
- Still later: the strip in LinearGraphDisplay, and a walk-lift colour on the
  lifted bar. The grey mismatch stays as the previous handoff explains.
- The hosted `latest/` plugin copy follows jbrowse-plugin-list's deploy, not
  this release.
