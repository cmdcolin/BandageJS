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
- **Plugin and core 4.6.0**, after a review of this handoff's open items:
  - A figure spec records the strip's sample filter as `walkRowSamples`, and
    `bandage-figure` applies it. `filterSamples` moved into core's `walkRows`.
    The CLI draws no walk-rows layout, so only the strip needed it.
  - An SVG walk-rows key paints its "on the path" swatch as the reference ramp,
    through a `linearGradient`, where it was solid blue beside rainbow bars.
- **BandageJS** Export SVG draws the backbone's genes, which it had left out,
  and Copy figure spec names their gene track. A genes file the user opened has
  no address for a spec to name.
- **Plugin and core 4.7.0**, with BandageJS main on it:
  - `bandage-figure` boxes the reference row's genes in the strip from the
    spec's backbone gene file, and the key says the other rows have no gene
    track. BandageJS's `onRow` moved into core as `genesOnRow`.
  - Copy figure spec is disabled, with the reason, for walk rows and tube maps
    in both the plugin and BandageJS, since `bandage-figure` refuses them.

## Checked

- The plugin's walk-strip and walk-rows e2e pass, but their fixtures have no
  genes, so the plugin's gene path is covered by unit tests only. BandageJS has
  an e2e test for strip genes and their export.
- Amylase with 10 samples (23 rows, 10 px) boxes genes unnamed; with 30 samples
  (63 rows, 3 px) the key notes them left out.

## Open

- `bandage-figure` boxes only the reference row's genes in the strip. Every
  row's own genes needs a spec field naming a gene file per sample, plus contig
  mapping.
- Still later: the strip in LinearGraphDisplay, and a walk-lift colour on the
  lifted bar. The grey mismatch stays as the previous handoff explains.

Settled: BandageJS caps the on-screen strip at `min(260, 40% of the window)` but
exports it at 260, matching what the CLI makes from the spec. The export can box
genes the screen left out, and its key describes its own frame.
