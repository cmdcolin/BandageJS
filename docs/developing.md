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
  `src/core.ts`: parsing, layouts, geometry, renderer, hit testing, labels
- The plugin's `src/core.test.ts` keeps the core free of JBrowse, mobx and
  React; `build.mjs` fails if any of them reach the bundle
- This repo holds the controls and pointer handling (`src/main.ts`), the layout
  worker (`src/layoutWorker.ts`) and SVG ports of the plugin's React overlays
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

`examples/index.json` lists the picker's graphs. The HPRC cuts come from the
tabix pair at `jbrowse.org/demos/hprc/hprc-v2.1-mc-grch38`.
