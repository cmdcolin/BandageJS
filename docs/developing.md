# Developing

```console
git clone --recurse-submodules https://github.com/cmdcolin/BandageJS.git
cd BandageJS
pnpm install
pnpm dev        # esbuild watch + serve dist/
pnpm typecheck
pnpm build
pnpm deploy     # needs aws credentials for the jbrowse.org bucket
```

## How it fits together

- `graphgenomeviewer/` is the plugin, as a submodule. The page imports only its
  `src/core.ts`: parsing, layouts, geometry, renderer, hit testing, labels, and
  the gbz-base window cut its adapter uses
- The plugin's `src/core.test.ts` keeps the core free of JBrowse, mobx and
  React; `build.mjs` fails if any of them reach the bundle
- This repo holds the menus (`src/menus.ts`), pointer handling (`src/main.ts`),
  the layout worker (`src/layoutWorker.ts`), range-request access to gbz-base
  (`src/gbz.ts`) and SVG ports of the plugin's React overlays
  (`src/overlays.ts`)
- Overlay changes in the plugin have to be mirrored in `src/overlays.ts`

## Updating the plugin

```console
git submodule update --remote graphgenomeviewer
pnpm typecheck && pnpm build
```

## Deploying

`pnpm deploy` syncs `dist/` to `s3://jbrowse.org/demos/bandagejs` and
invalidates `/demos/bandagejs/*` on CloudFront.

## Examples

`examples/index.json` lists the Examples menu. A `file` entry is a GFA in
`examples/`; the static HPRC files were cut from the tabix pair at
`jbrowse.org/demos/hprc/hprc-v2.1-mc-grch38`. A `gbz: "hprc"` entry is cut live
from the HPRC release 2 `.gbz.db` on S3, with the haplotype index at
`jbrowse.org/demos/hprc/`.
