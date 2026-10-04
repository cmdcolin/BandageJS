import './details'
import './input'
import './walkStrip'

import {
  examplesItems,
  fileItems,
  helpItems,
  layoutItems,
  viewItems,
} from './menuItems'
import { menuBar } from './menus'
import { loadExamples, openFromQuery } from './sources'
import { ui } from './ui'

menuBar(ui.menus, [
  { label: 'File', items: fileItems },
  { label: 'Examples', items: examplesItems },
  { label: 'Layout', items: layoutItems },
  { label: 'View', items: viewItems },
  { label: 'Help', items: helpItems },
])

await loadExamples()
openFromQuery(new URLSearchParams(location.search))
