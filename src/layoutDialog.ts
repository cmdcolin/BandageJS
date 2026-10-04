import { BUBBLE_SPREADS, modeUsesLayoutEngine } from '@jbrowse/bandage-core'

import { depthVaries } from './derived'
import { relayout } from './layout'
import { esc } from './overlays'
import {
  DEFAULTS,
  QUALITIES,
  SEPARATIONS,
  SPACINGS,
  THICKNESSES,
} from './settings'
import { recut } from './sources'
import { effectiveMode, saveSettings, settings, state } from './state'
import { ui } from './ui'
import { rebuild } from './view'

type Effect = 'layout' | 'geometry'

export function applySettings(effect: Effect) {
  saveSettings()
  if (recut()) {
    return
  }
  if (effect === 'layout') {
    void relayout()
  } else {
    rebuild()
  }
}

type NumberKey = 'nodeThickness' | 'quality' | 'spacing' | 'componentSeparation'

// A setting of a few ordered values, as a slider over them
interface Slider {
  key: NumberKey
  label: string
  choices: readonly { value: number; label: string }[]
  effect: Effect
}

const THICKNESS: Slider = {
  key: 'nodeThickness',
  label: 'Node thickness',
  choices: THICKNESSES,
  effect: 'geometry',
}

const FORCE: Slider[] = [
  {
    key: 'quality',
    label: 'Quality',
    choices: QUALITIES,
    effect: 'layout',
  },
  { key: 'spacing', label: 'Spacing', choices: SPACINGS, effect: 'layout' },
  {
    key: 'componentSeparation',
    label: 'Component separation',
    choices: SEPARATIONS,
    effect: 'layout',
  },
]

function sliderHtml(s: Slider) {
  return `<label class="slider">
    <span>${esc(s.label)} <output data-for="${s.key}"></output></span>
    <input type="range" data-key="${s.key}" min="0" max="${s.choices.length - 1}" step="1" />
  </label>`
}

const nodes = ui.layoutDialog.querySelector<HTMLElement>('#node-settings')!
const force = ui.layoutDialog.querySelector<HTMLElement>('#force-settings')!
const hint = ui.layoutDialog.querySelector<HTMLElement>('#force-hint')!

nodes.innerHTML = `${sliderHtml(THICKNESS)}
  <label class="check"><input type="checkbox" id="depth-width" /> Width by depth <small id="depth-note">· every node has one depth</small></label>`
force.insertAdjacentHTML(
  'beforeend',
  `${sliderHtml(FORCE[0]!)}
  <label>Bubble spread <select id="bubble-spread">${BUBBLE_SPREADS.map(
    s =>
      `<option value="${s.value}" title="${esc(s.description)}">${esc(s.label)}</option>`,
  ).join('')}</select></label>
  ${FORCE.slice(1).map(sliderHtml).join('')}`,
)

const depth = nodes.querySelector<HTMLInputElement>('#depth-width')!
const spread = force.querySelector<HTMLSelectElement>('#bubble-spread')!
const sliders = [THICKNESS, ...FORCE]

const inputOf = (s: Slider) =>
  ui.layoutDialog.querySelector<HTMLInputElement>(`input[data-key="${s.key}"]`)!
const outputOf = (s: Slider) =>
  ui.layoutDialog.querySelector(`output[data-for="${s.key}"]`)!

function draw() {
  for (const s of sliders) {
    const i = Math.max(
      0,
      s.choices.findIndex(c => c.value === settings[s.key]),
    )
    inputOf(s).value = String(i)
    outputOf(s).textContent = s.choices[i]!.label
  }
  depth.checked = settings.nodeWidth === 'depth'
  spread.value = settings.bubbleSpread
  const graph = state.graph
  const uniform = !!graph && !depthVaries(graph)
  depth.disabled = uniform
  nodes.querySelector<HTMLElement>('#depth-note')!.hidden = !uniform
  const engine = !graph || modeUsesLayoutEngine(effectiveMode(), graph)
  force.hidden = !engine
  hint.hidden = engine
}

// A redraw follows a slider as it moves; a relayout waits for its release
for (const s of sliders) {
  const input = inputOf(s)
  const commit = () => {
    settings[s.key] = s.choices[Number(input.value)]!.value
    applySettings(s.effect)
  }
  input.addEventListener('input', () => {
    outputOf(s).textContent = s.choices[Number(input.value)]!.label
    if (s.effect === 'geometry') {
      commit()
    }
  })
  if (s.effect === 'layout') {
    input.addEventListener('change', commit)
  }
}

depth.addEventListener('change', () => {
  settings.nodeWidth = depth.checked ? 'depth' : 'uniform'
  applySettings('geometry')
})

spread.addEventListener('change', () => {
  settings.bubbleSpread = spread.value as typeof settings.bubbleSpread
  applySettings('layout')
})

ui.layoutReset.addEventListener('click', () => {
  const relaid =
    FORCE.some(s => settings[s.key] !== DEFAULTS[s.key]) ||
    settings.bubbleSpread !== DEFAULTS.bubbleSpread
  for (const s of sliders) {
    settings[s.key] = DEFAULTS[s.key]
  }
  settings.nodeWidth = DEFAULTS.nodeWidth
  settings.bubbleSpread = DEFAULTS.bubbleSpread
  draw()
  applySettings(relaid ? 'layout' : 'geometry')
})

export function showLayoutDialog() {
  draw()
  ui.layoutDialog.showModal()
}
