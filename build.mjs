import fs from 'node:fs'

import * as esbuild from 'esbuild'

const serve = process.argv.includes('--serve')
const outdir = 'dist'

// The page is the plugin's core with no host under it; any of these in the
// bundle means an import reached past graphgenomeviewer/src/core.ts.
const FORBIDDEN =
  /node_modules\/(react|react-dom|mobx|mobx-react|@mui|@emotion|@jbrowse\/mobx-state-tree)\//

const copyStatic = {
  name: 'copy-static',
  setup(build) {
    build.onEnd(result => {
      fs.mkdirSync(outdir, { recursive: true })
      for (const file of ['index.html', 'style.css']) {
        fs.copyFileSync(`public/${file}`, `${outdir}/${file}`)
      }
      fs.cpSync('examples', `${outdir}/examples`, { recursive: true })
      const leaked = Object.keys(result.metafile?.inputs ?? {}).filter(p =>
        FORBIDDEN.test(p),
      )
      if (leaked.length > 0) {
        throw new Error(`host code in the bundle:\n${leaked.join('\n')}`)
      }
    })
  },
}

const options = {
  entryPoints: {
    app: 'src/main.ts',
    layoutWorker: 'src/layoutWorker.ts',
  },
  outdir,
  bundle: true,
  format: 'esm',
  target: 'es2022',
  minify: !serve,
  sourcemap: true,
  metafile: true,
  logLevel: 'info',
  plugins: [copyStatic],
}

if (serve) {
  const ctx = await esbuild.context(options)
  await ctx.watch()
  const { hosts, port } = await ctx.serve({ servedir: outdir })
  console.log(`http://${hosts[0]}:${port}/`)
} else {
  const result = await esbuild.build(options)
  for (const [file, { bytes }] of Object.entries(result.metafile.outputs)) {
    if (!file.endsWith('.map')) {
      console.log(`${file} ${(bytes / 1024).toFixed(0)} kB`)
    }
  }
}
