import './input'
import './walkStrip'

import {
  fileItems,
  layoutItems,
  referenceMenuItems,
  viewItems,
  walksItems,
} from './menuItems'
import { menuBar } from './menus'
import { backboneOf } from './reference'
import { loadExamples, openFromQuery } from './sources'
import { drawnMode, facts, state, walks } from './state'
import { ui } from './ui'
import { onDraw } from './view'

const bar = menuBar(ui.menus, [
  { label: () => 'File', items: fileItems },
  {
    label: () => `Layout: ${drawnMode().label.replace(/ layout$/, '')}`,
    items: layoutItems,
  },
  { label: () => 'View', items: viewItems },
  {
    label: () => {
      const lifted = (walks().lift?.walks ?? []).map(
        w => facts().walkLabels.get(w.name) ?? w.name,
      )
      return lifted.length === 0
        ? 'Walks'
        : lifted.length === 1
          ? `Walk: ${lifted[0]}`
          : `Walks: ${lifted.length} lifted`
    },
    items: walksItems,
    hidden: () => facts().walkChoices.length === 0,
  },
  {
    label: () => 'Reference',
    items: referenceMenuItems,
    hidden: () => !backboneOf(state.graph),
  },
])
onDraw(bar.refresh)

await loadExamples()
openFromQuery(new URLSearchParams(location.search))
