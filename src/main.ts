import './input'
import './walkStrip'

import { examplesItems, fileItems, helpItems, viewItems } from './menuItems'
import { menuBar } from './menus'
import { loadExamples, openFromQuery } from './sources'
import { ui } from './ui'
import { onDraw } from './view'

const bar = menuBar(ui.menus, [
  { label: () => 'File', items: fileItems },
  { label: () => 'Examples', items: examplesItems },
  { label: () => 'View', items: viewItems },
  { label: () => 'Help', items: helpItems },
])
onDraw(bar.refresh)

await loadExamples()
openFromQuery(new URLSearchParams(location.search))
