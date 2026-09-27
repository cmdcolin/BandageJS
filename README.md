# BandageJS

Draw a GFA graph in the browser: https://jbrowse.org/demos/bandagejs/

Open a file, paste a url, or drop a GFA on the page. The force-directed layout
is [Bandage](https://github.com/rrwick/Bandage)'s own OGDF FMMM engine compiled
to wasm and run in a worker. A graph with reference coordinates (rGFA tags, or
P/W lines naming a reference) also gets the anchored, ordered, sample-row,
walk-row and variant-map layouts, bubbles found from the graph and labelled by
kind, and haplotype walks you can lift out of the drawing.

`?gfa=<url>` opens a graph on load; the server has to allow cross-origin reads.

## How it is built

The page is a thin UI over the core of
[jbrowse-plugin-graphgenomeviewer](https://github.com/GMOD/jbrowse-plugin-graphgenomeviewer),
the JBrowse 2 graph genome view. The plugin is a git submodule, and this repo
imports only its `src/core.ts`: GFA parsing, every layout, geometry, the
Canvas2D renderer, hit testing and label placement, with no JBrowse, state tree
or UI framework behind it. The plugin tests that boundary (`src/core.test.ts`),
and `build.mjs` fails if React, mobx or MUI ever reach the bundle. So what this
page draws is what the plugin's view draws, and a fix to either lands in both.

What lives here is the part a host supplies: the controls, the canvas's
pan/zoom/hover/drag, the layout worker (`src/layoutWorker.ts`), and the SVG
overlays (`src/overlays.ts`) that the plugin draws with React.

This repo used to hold a full BandageNG fork cross-compiled with Emscripten.
That history is on the
[`bandage-layout-js`](https://github.com/cmdcolin/BandageJS/tree/bandage-layout-js)
branch; its layout engine now lives in the plugin at `src/bandage/`.

## Developing

```console
git clone --recurse-submodules https://github.com/cmdcolin/BandageJS.git
cd BandageJS
pnpm install
pnpm dev          # esbuild watch + serve dist/
pnpm typecheck
pnpm build
```

To follow the plugin's main branch:

```console
git submodule update --remote graphgenomeviewer
```

`pnpm deploy` builds and syncs `dist/` to `s3://jbrowse.org/demos/bandagejs`,
then invalidates the CloudFront path. It needs aws credentials for that bucket.

## Examples

`examples/` holds the graphs in the picker: HPRC release 2 cuts (KIV-2, MHC
class II, CFH, AMY1) from `jbrowse.org/demos/hprc`, the KIV-2 repeat at base
level with eight haplotype walks from gbz-base, a chr1 cut with 161 walks, a de
novo assembly graph, and two E. coli pangenome graphs.

## License

GPL-3.0-or-later, as Bandage, OGDF and the plugin are.
