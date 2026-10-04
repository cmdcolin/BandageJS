import './details'
import './input'
import './walkStrip'

import {
  examplesItems,
  fileItems,
  haplotypeItems,
  haplotypesShown,
  helpItems,
  layoutItems,
  viewItems,
} from './menuItems'
import { menuBar } from './menus'
import { loadExamples, openFromQuery } from './sources'
import { ui } from './ui'
import { onDraw } from './view'

const bar = menuBar(ui.menus, [
  { label: 'File', items: fileItems },
  { label: 'Examples', items: examplesItems },
  { label: 'Layout', items: layoutItems },
  { label: 'View', items: viewItems },
  { label: 'Haplotypes', items: haplotypeItems, shown: haplotypesShown },
  { label: 'Help', items: helpItems },
])
bar.refresh()
onDraw(bar.refresh)

await loadExamples()
openFromQuery(new URLSearchParams(location.search))
