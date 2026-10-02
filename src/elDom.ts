import type { El } from '@jbrowse/bandage-core'

const SVG_NS = 'http://www.w3.org/2000/svg'

// A core element tree as SVG DOM nodes
export function svgDom(node: El | string): Node {
  if (typeof node === 'string') {
    return document.createTextNode(node)
  }
  const e = document.createElementNS(SVG_NS, node.tag)
  for (const [name, value] of Object.entries(node.attrs)) {
    if (value !== undefined) {
      e.setAttribute(name, String(value))
    }
  }
  e.append(...node.children.map(svgDom))
  return e
}
