import { WALK_FIELDS, WALK_SCHEMES } from '@jbrowse/bandage-core'

import { esc } from './overlays'
import { facts, state, walks as walkView } from './state'
import { ui } from './ui'
import { setWalkColor } from './walks'

import type { WalkEncoding } from '@jbrowse/bandage-core'

// A highlighted walk's colouring as it is drawn: its panel's while side by
// side, its lane's otherwise
function encodingOf(name: string) {
  const { lift, panels } = walkView()
  return (
    panels?.find(p => p.walks[0]!.name === name)?.walks[0] ??
    lift?.walks.find(w => w.name === name)
  )?.encoding
}

function options<T extends string>(
  choices: readonly { value: T; label: string }[],
  current: T,
) {
  return choices
    .map(
      c =>
        `<option value="${c.value}"${c.value === current ? ' selected' : ''}>${esc(c.label)}</option>`,
    )
    .join('')
}

function draw() {
  const labels = facts().walkLabels
  ui.highlightRows.innerHTML = [
    '<span class="head">Haplotype</span><span class="head">Colour by</span><span class="head">Palette</span>',
    ...state.walkLayers.map(({ walk }) => {
      const e = encodingOf(walk)
      if (!e) {
        return ''
      }
      const label = labels.get(walk) ?? walk
      // the rainbow is the reference-position ramp
      const schemes = WALK_SCHEMES.filter(
        s => s.value !== 'rainbow' || e.field === 'reference',
      )
      return `<strong>${esc(label)}</strong>
        <select data-walk="${esc(walk)}" data-part="field" aria-label="Colour ${esc(label)} by">${options(WALK_FIELDS, e.field)}</select>
        <select data-walk="${esc(walk)}" data-part="scheme" aria-label="Palette for ${esc(label)}">${options(schemes, e.scheme)}</select>`
    }),
  ].join('')
}

ui.highlightRows.addEventListener('change', e => {
  const select = e.target as HTMLSelectElement
  const walk = select.dataset.walk!
  setWalkColor(
    walk,
    select.dataset.part === 'field'
      ? { field: select.value as WalkEncoding['field'] }
      : { scheme: select.value as WalkEncoding['scheme'] },
  )
  draw()
})

export function showHighlightDialog() {
  draw()
  ui.highlightDialog.showModal()
}
