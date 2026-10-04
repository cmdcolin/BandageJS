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
  - `figure.ts`: Export SVG and Copy figure spec, through the core's `figureSvg`
  - `walks.ts`: highlighting walks, drawing them side by side and colouring
    each, kept in the page's address; `view.ts` draws the facet panels, which
    share the pane's transform, so `input.ts` binds every panel's canvas as it
    binds the pane's
  - `walkStrip.ts`: walk rows under a layout that draws nodes, with each row's
    genes, hover and click linking bars and nodes
  - `find.ts`: the Find node field, which zooms to a node by name and selects it
  - `details.ts`: the selected node's details panel, from what `nodeDetails.ts`
    reads off the graph: its links by end and the walks through it
  - `dialogs.ts`: the Open, Cut a region, User guide and About dialogs
  - `menuItems.ts`, `jbrowseItems.ts`: what the menus list; `menus.ts` draws
    them
  - `feedback.ts`: the spinner and notices; `ui.ts`: the page's elements
  - `engine.ts`, `layoutWorker.ts`: the force-directed layout's worker
  - `gbz.ts`: range-request access to gbz-base; `recent.ts`: the Open dialog's
    recent list
  - `overlays.ts`: SVG ports of the plugin's React overlays
  - `reference.ts`: which assembly the drawn backbone is on: declared, found by
    name in the hubs `hubs.ts` loads in the order `public/config.json` and the
    user's choices give, or narrowed down to candidates to ask about.
    `referenceDialog.ts` asks: the notice and File → Reference genome….
    [docs/genes.md](genes.md) has the rules
  - `genes.ts`: the genes pinned to the backbone, the bound assembly's gene
    track or a GFF3 or BED file's; `tabixGenes.ts` reads a tabix GFF3 or BED by
    range requests, and `genes.ts` imports it on first use, so esbuild splits it
    and `@gmod/tabix` into their own chunk
- Pure logic lives in modules that touch no DOM when imported, so unit tests run
  them in Node: `settings.ts` (defaults and validation), `derived.ts` (memoized
  graph facts), `describe.ts` (text the UI shows), `search.ts` (ranking node
  names and framing a found node), `nodeDetails.ts` (a node's links and the
  walks through it), `query.ts` (gbz cuts as query strings), `read.ts` (reading
  GFA text), `hubConfig.ts` (a JBrowse config as assemblies and tracks),
  `siteConfig.ts` (the page's `config.json` and the overlays it puts on hubs),
  `genomeSearch.ts` (finding a genome by name in a genomes.jbrowse.org index)
  and `jbrowse.ts` (links into JBrowse)
- Overlay changes in the plugin have to be mirrored in `src/overlays.ts`

## Testing

Playwright runs both suites. `pnpm test:unit` runs `test/unit` in Node;
`pnpm test:e2e` builds `dist/`, serves it on port 4178 (or `TEST_PORT`) and
drives the page in Chromium from `test/e2e`. A run in a second checkout needs
its own `TEST_PORT`, since the tests never reuse a server already running.
Locally the e2e tests use the installed Chrome; CI installs Playwright's own
Chromium. The tests block requests to S3, jbrowse.org and UCSC, so they never
touch the network. They serve the default hubs and GenArk's E. coli K-12 from
`test/e2e/data`, as `test/e2e/data/fixtures.mjs` cuts them down: configs with
the assemblies the examples name, and gene files around the examples' windows.
`micb-kir3dl1.gbz.db` there, the plugin's 46-sample gbz-base test database, is
served as `https://gbz.test/` for the tests that cut a window by range requests.

The e2e tests drive the page only through its DOM: the ids in
`public/index.html`, roles, and the menu markup `src/menus.ts` builds. To debug
one, `pnpm test:e2e --headed` or `--debug`; a failing test leaves a trace in
`test-results/` for `pnpm exec playwright show-trace`.

## Updating the core

The core publishes with every plugin release, at the plugin's version.

```console
pnpm update @jbrowse/bandage-core
pnpm typecheck && pnpm build
```

To try an unreleased core, run `node build.mjs` in a plugin checkout's
`packages/core`, then point `node_modules/@jbrowse/bandage-core` at a directory
holding that build's `dist` and a `package.json` whose `exports` is
`{".": {"types": "./dist/types/index.d.ts", "default": "./dist/index.js"}}`. The
core's own `package.json` exports `src/*.ts`, which BandageJS can't consume.
`pnpm install` restores the link.

The plugin's CI installs each core push into BandageJS and runs its tests, on
BandageJS's `core-next` branch when one exists and on `main` otherwise. A
breaking core change therefore lands with its BandageJS side pushed to
`core-next` first. After the release, bump the core on `core-next`, fast-forward
`main` to it and delete the remote branch.

## Deploying

`pnpm run deploy` builds, syncs `dist/` to `s3://jbrowse.org/demos/bandagejs`
with `--delete` and invalidates `/demos/bandagejs/*` on CloudFront. Bare
`pnpm deploy` is pnpm's own workspace command, not this script.
`scripts/deploy.sh` refuses a `dist/` missing the page's core files, since the
sync deletes whatever `dist/` lacks.

## Examples

`examples/index.json` lists the Examples menu. A `file` entry is a GFA in
`examples/`; the static HPRC files were cut from the tabix pair at
`jbrowse.org/demos/hprc/hprc-v2.1-mc-grch38`. A `gbz: "hprc"` entry is cut live
from the HPRC release 2 `.gbz.db` on S3, with the haplotype index at
`jbrowse.org/demos/hprc/`.
