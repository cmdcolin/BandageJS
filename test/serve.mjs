import * as esbuild from 'esbuild'

const ctx = await esbuild.context({})
const { port } = await ctx.serve({
  servedir: 'dist',
  port: Number(process.env.TEST_PORT),
})
console.log(`http://localhost:${port}/`)
