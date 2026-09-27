import * as esbuild from 'esbuild'

const ctx = await esbuild.context({})
const { port } = await ctx.serve({ servedir: 'dist', port: 4178 })
console.log(`http://localhost:${port}/`)
