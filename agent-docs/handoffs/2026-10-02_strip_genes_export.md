# Handoff: genes in the walk strip, and the strip in Export SVG

Follows `2026-10-02_walk_strip.md`. Everything is landed, pushed, released and
deployed; no worktrees or branches are left open.

## Done

- **Plugin and core 4.4.0** on npm (`d369feb`, tag `v4.4.0`), and 4.4.1 with the
  review fixes below:
  - Gene boxes take the rows' pitch (`rowGeneBoxes(…, { rowPx, barPx })`), named
    only where the bar is at least 8 px. Rows too close to box a gene draw none:
    a first version shaded the gene's span on thin bars, but on the HPRC amylase
    strip at 3 px rows the shade read as the charcoal "off the path" colour.
    `StripFrame.boxesGenes` says which, and `stripGeneGaps` makes the key say
    "genes left out: too many rows to box them in".
  - `figureSvg` takes `walkStrip: { rows, rowGenes, rowGeneGaps }` and draws the
    strip, its labels and key below the drawing. A spec's `walkStrip: true` asks
    `bandage-figure` for it; a gbz cut then follows whole walks
    (`snarls: 'overlapping'`) unless the spec says otherwise. The plugin's spec
    records the overlapping snarls its cut used. `bandage-figure` draws no
    walk-rows layout at all (`checkLayout` takes only layouts that draw nodes).
  - `walkStripFrame` defaults `maxHeight` (`WALK_STRIP_CEILING_PX`, 260) and the
    label column; `walkStripLabelsTree` draws the labels. Both hosts use them.
  - The plugin's strip reads per-haplotype genes as walk rows do; the
    `walkGeneReads` views block moved below the strip's, which it now reads.
- **BandageJS** (main, deployed to https://jbrowse.org/demos/bandagejs/): the
  strip boxes genes, and View → Walk rows under the graph reloads them. Export
  SVG and Copy figure spec carry the strip. `img/kiv2_strip.png` is reshot with
  LPA boxed on every bar, and the README says so.
- **Review fixes** (an Opus subagent reviewed both repos):
  - BandageJS read no haplotype genes for the strip after picking a node layout
    from walk rows or a tube map, since it asked what was drawn before the new
    layout landed, and lost them for Back when genes changed inside a popped
    bubble. `stripRowsWanted()` asks the chosen mode and the root graph; an e2e
    test covers both, and fails without the fix.
  - The walk-rows `rowGenesOf` call no longer evicts the strip's one-slot memo
    on every node drag.
- **Plugin and core 4.5.0** (`f00fffa`, tag `v4.5.0`), with BandageJS main on
  it:
  - `stripGeneGaps(frame, rowGenes, gaps)` takes all three arguments. 4.4.1 made
    `rowGenes` an optional third, because the plugin's CI typechecked BandageJS
    main against each core push and a required one broke it.
  - The plugin's CI now tests BandageJS's `core-next` branch when one exists,
    otherwise main. A breaking core change lands with its BandageJS side on
    `core-next`; after the release, BandageJS main fast-forwards to it and the
    branch is deleted.
  - JBrowse 5.0.0-beta.11 is the floor: the plugin passes its new
    `releaseTargets` render callback (core's `Renderer` gained
    `releaseOffscreenTargets`), drops the beta.9 `ClipOptions` workaround, and
    `test/setup.ts` refuses a host without `releaseTargets`. The e2e host is
    `.test-jbrowse-beta11` in the plugin's primary checkout; all 37 pass.
  - Latest dependencies in both repos. BandageJS typechecks with TypeScript 7;
    the plugin stays on 6 because typescript-eslint and core's type build need
    its JavaScript API, and runs 7 through the `typescript7` alias.

## Checked

- The plugin's walk-strip and walk-rows e2e pass, but their fixtures have no
  genes, so the plugin's gene path is covered by unit tests only. BandageJS has
  an e2e test for strip genes and their export.
- Amylase with 10 samples (23 rows, 10 px) boxes genes unnamed; with 30 samples
  (63 rows, 3 px) the key notes them left out.

## Open

- A figure spec doesn't record the plugin's walk-row sample filter, so
  `bandage-figure` draws every row; walk-rows figures had this too. The CLI also
  boxes no genes in the strip, having only the backbone's.
- BandageJS sizes the on-screen strip to `min(260, 40% of the window)` but
  exports it at 260, so on a short window the export can box genes the screen
  left out. The export matches what the CLI makes from its spec.

- In an SVG, a walk-rows key's "on the path" swatch is solid blue under the
  reference ramp, while the bars are rainbow; `walkRowsKeyTree` can't draw the
  CSS gradient hosts pass as `rampCss`. Walk-rows figures had this before the
  strip did.
- Still later: the strip in LinearGraphDisplay, and a walk-lift colour on the
  lifted bar. The grey mismatch stays as the previous handoff explains.
- The hosted `latest/` plugin copy follows jbrowse-plugin-list's deploy, not
  this release.
