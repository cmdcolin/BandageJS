# Developing

```console
git clone https://github.com/cmdcolin/BandageJS.git
cd BandageJS
pnpm install
pnpm dev        # esbuild watch + serve dist/
pnpm typecheck
pnpm build
pnpm test       # unit and browser tests
pnpm deploy     # needs aws credentials for the jbrowse.org bucket
```

## How it fits together

- The page imports only `@jbrowse/bandage-core`, the plugin's core published
  from its `packages/core`: parsing, layouts, geometry, renderer, hit testing,
  labels, and the gbz-base window cut its adapter uses
- The core's index imports nothing from JBrowse's host, mobx or React;
  `build.mjs` fails if any of them reach the bundle
- `src/main.ts` builds the menu bar and opens the graph the address names; the
  rest of the page is split by what it does:
  - `state.ts`: the view's state and saved settings, and what it derives from
    them
  - `view.ts`: the canvas, tube map, overlays, info box and caption
  - `layout.ts`: running layouts, with force-directed ones cached per graph
  - `sources.ts`: opening a GFA from a file, url or gbz cut, and the examples
  - `input.ts`: pointer, wheel, keyboard and drag-drop
  - `bubbles.ts`: popping a bubble into its own view and back
  - `find.ts`: the Find node field, which zooms to a node by name and selects it
  - `dialogs.ts`: the Open, Cut a region and Help dialogs
  - `menuItems.ts`, `jbrowseItems.ts`: what the menus list; `menus.ts` draws
    them
  - `feedback.ts`: the spinner and notices; `ui.ts`: the page's elements
  - `engine.ts`, `layoutWorker.ts`: the force-directed layout's worker
  - `gbz.ts`: range-request access to gbz-base; `recent.ts`: the Open dialog's
    recent list
  - `overlays.ts`: SVG ports of the plugin's React overlays
  - `genes.ts`: the genes pinned to the backbone, RefSeq's for the graph's
    GRCh38 window or a GFF3 or BED file's; `refseq.ts` reads RefSeq by tabix
    range requests, and `genes.ts` imports it on first use, so esbuild splits it
    and `@gmod/tabix` into their own chunk
- Pure logic lives in modules that touch no DOM when imported, so unit tests run
  them in Node: `settings.ts` (defaults and validation), `derived.ts` (memoized
  graph facts), `describe.ts` (text the UI shows), `search.ts` (ranking node
  names and framing a found node), `query.ts` (gbz cuts as query strings),
  `read.ts` (reading GFA text), `geneModels.ts` (GFF3 and BED as genes) and
  `jbrowse.ts` (links into JBrowse)
- Overlay changes in the plugin have to be mirrored in `src/overlays.ts`

## Testing

Playwright runs both suites. `pnpm test:unit` runs `test/unit` in Node;
`pnpm test:e2e` builds `dist/`, serves it on port 4178 (or `TEST_PORT`) and
drives the page in Chromium from `test/e2e`. A run in a second checkout needs
its own `TEST_PORT`, since the tests never reuse a server already running.
Locally the e2e tests use the installed Chrome; CI installs Playwright's own
Chromium. The tests block requests to S3 and jbrowse.org, so they never touch
the network; RefSeq's genes come from a cut of it around LPA in `test/e2e/data`.

The e2e tests drive the page only through its DOM: the ids in
`public/index.html`, roles, and the menu markup `src/menus.ts` builds. To debug
one, `pnpm test:e2e --headed` or `--debug`; a failing test leaves a trace in
`test-results/` for `pnpm exec playwright show-trace`.

## Updating the core

The core publishes with every plugin release.

```console
pnpm update @jbrowse/bandage-core
pnpm typecheck && pnpm build
```

To try an unreleased core, point the dependency at a plugin checkout's
`packages/core` with `pnpm link`.

## Deploying

`pnpm deploy` syncs `dist/` to `s3://jbrowse.org/demos/bandagejs` and
invalidates `/demos/bandagejs/*` on CloudFront.

## Examples

`examples/index.json` lists the Examples menu. A `file` entry is a GFA in
`examples/`; the static HPRC files were cut from the tabix pair at
`jbrowse.org/demos/hprc/hprc-v2.1-mc-grch38`. A `gbz: "hprc"` entry is cut live
from the HPRC release 2 `.gbz.db` on S3, with the haplotype index at
`jbrowse.org/demos/hprc/`.
