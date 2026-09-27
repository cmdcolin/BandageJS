import './input'

import { jbrowseItems } from './jbrowseItems'
import {
  displayItems,
  examplesItems,
  layoutItems,
  walksItems,
} from './menuItems'
import { menuBar } from './menus'
import { loadExamples, openFromQuery } from './sources'
import { drawnMode, facts, state } from './state'
import { ui } from './ui'
import { onDraw } from './view'

const bar = menuBar(ui.menus, [
  { label: () => 'Examples', items: examplesItems },
  {
    label: () => `Layout: ${drawnMode().label.replace(/ layout$/, '')}`,
    items: layoutItems,
  },
  { label: () => 'Display', items: displayItems },
  {
    label: () => {
      const walk = facts().walkLabels.get(state.highlightedPath)
      return walk ? `Walk: ${walk}` : 'Walks'
    },
    items: walksItems,
    hidden: () => facts().walkChoices.length === 0,
  },
  { label: () => 'JBrowse', items: jbrowseItems },
])
onDraw(bar.refresh)

await loadExamples()
openFromQuery(new URLSearchParams(location.search))
