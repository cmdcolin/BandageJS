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
- This repo holds the menus (`src/menus.ts`), pointer handling (`src/main.ts`),
  the layout worker (`src/layoutWorker.ts`), range-request access to gbz-base
  (`src/gbz.ts`), the Open dialog's recent list (`src/recent.ts`) and SVG ports
  of the plugin's React overlays (`src/overlays.ts`)
- Overlay changes in the plugin have to be mirrored in `src/overlays.ts`

## Testing

Playwright runs both suites. `pnpm test:unit` runs `test/unit` in Node;
`pnpm test:e2e` builds `dist/`, serves it on port 4178 and drives the page in
Chromium from `test/e2e`. Locally the e2e tests use the installed Chrome; CI
installs Playwright's own Chromium. The tests block requests to S3 and
jbrowse.org, so they never touch the network.

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
