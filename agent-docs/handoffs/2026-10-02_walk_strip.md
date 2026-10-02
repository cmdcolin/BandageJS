# Handoff: walk strip shipped everywhere

Everything from this session is landed and pushed; no worktrees or branches are
left open.

## Done

- **Plugin and core 4.3.0** are on npm with the walk strip (another session
  released it alongside its deletion-edge routing). The plugin's own handoff,
  `agent-docs/handoffs/2026-10-02_walk_strip.md` there, is updated.
- **BandageJS** (main at `907fc3f`, CI green):
  - View → Walk rows under the graph (`src/walkStrip.ts`): a strip below the
    pane, which shrinks and refits. Pointing at a bar rings its node in the
    drawing, and the hovered node ticks every walk through it. A click selects
    the row and lifts its walk, or drops it.
  - GBZ cuts follow whole walks (`snarls: 'overlapping'`) while walk rows are
    drawn, as the layout or as the strip, as the plugin does. Toggling either
    re-cuts the region (`recut()` in `src/sources.ts`), keeping lifted walks,
    declared assemblies and Draw x along. There's no re-cut while another open
    is pending or a bubble is popped; Back does it.
  - A subagent review's findings are fixed (`48ff7cd`), including a re-cut that
    stored its old cut and so re-cut on every later setting change.
  - The README has a new `img/kiv2_strip.png`, and its amylase text is checked
    against each haplotype's CAT genes.
  - The demo is deployed to https://jbrowse.org/demos/bandagejs/. A deploy whose
    build was killed partway took it down for about ten minutes;
    `scripts/deploy.sh` now refuses a partial `dist`.
- **jbrowse-components** (`b5c0542cd0`): the HPRC tutorial wording landed. The
  figures needed no reshoot, because main already had 4.2.0 renders. One false
  claim is fixed: HG00097.2 has one AMY2A, not two.

## Facts checked against annotation

- GRCh38 amylase, in order: AMY2B, AMY2A, AMY1A, AMY1B, AMYP1
  (chr1:103,713,720-103,719,905), AMY1C.
- HG00097.2: AMY2B, AMY2A, AMY1A, AMYP1, AMY1B, AMY1C, AMYP1, AMY1C. That's four
  AMY1 and one AMY2A.
- HG01123#2 and HG02055#2 are both 146.2 kb with one AMY1; only HG01123#2 has
  AMY2A, where HG02055#2 has AMYP1.

## Open

- **Grey mismatch, left as is on purpose.** Under the reference-position ramp
  the force drawing paints a node with no reference position grey (160, in
  GeometryBuilder `getNodeColor`), while the bars paint the same off-path
  stretch charcoal (`runPaint`). Matching them costs more than it gains:
  - grey bars would sit close to the light-grey `OUTSIDE_CUT`;
  - a charcoal drawing would merge with the rGFA rank > 0 "off the reference"
    colour;
  - either change re-colours published jbrowse-components figures.

  Both keys already label their own colour.

- **Later, from the plugin handoff:** gene boxes in the strip, SVG export of the
  strip, the strip in LinearGraphDisplay, and a walk-lift colour on the lifted
  bar. None of these is in BandageJS either.
- No e2e test cuts a real GBZ (network), so `recut()` is covered only by the
  `cutsWholeWalks` unit test and manual runs.
