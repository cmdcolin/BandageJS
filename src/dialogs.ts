import { haplotypeIndexBeside } from '@jbrowse/bandage-core/gbzCut'

import { recentDetail } from './describe'
import { fail } from './feedback'
import { HPRC, openDb, parseRegion } from './gbz'
import { esc } from './overlays'
import { gbzFromQuery } from './query'
import { forget, pickFile, readHandle, recentList } from './recent'
import { openFile, openGbz, openUrl } from './sources'
import { state } from './state'
import { ui } from './ui'

import type { GbzSource } from './gbz'
import type { Recent } from './recent'

let recents: Recent[] = []

async function drawRecents() {
  recents = await recentList()
  ui.recent.hidden = recents.length === 0
  ui.recentList.innerHTML = recents
    .map(
      (r, i) =>
        `<li><button type="button" class="reopen" data-i="${i}" title="${esc(r.kind === 'url' ? r.url : r.name)}"><span>${esc(r.name)}</span><small>${esc(recentDetail(r, location.href))}</small></button><button type="button" class="forget" data-forget="${i}" aria-label="Forget ${esc(r.name)}">✕</button></li>`,
    )
    .join('')
}

function reopen(r: Recent) {
  if (r.kind === 'url') {
    void openUrl(r.url, { remember: true, declared: r.declared })
  } else if (r.kind === 'gbz') {
    void openGbz(r.gbz, undefined, true, undefined, { declared: r.declared })
  } else {
    void openFile(
      readHandle(r.handle).catch((e: unknown) => {
        if (e instanceof DOMException && e.name === 'NotFoundError') {
          void forget(r)
          throw new Error(`${r.name} is no longer where it was opened from`)
        }
        throw e
      }),
      r.name,
      r.handle,
      r.declared,
    )
  }
}

ui.recentList.addEventListener('click', e => {
  const target = e.target as Element
  const open = target.closest<HTMLElement>('[data-i]')
  const drop = target.closest<HTMLElement>('[data-forget]')
  if (open) {
    ui.openDialog.close()
    reopen(recents[Number(open.dataset.i)]!)
  } else if (drop) {
    void forget(recents[Number(drop.dataset.forget)]!).then(drawRecents)
  }
})

export function showOpenDialog() {
  void drawRecents()
  ui.openDialog.returnValue = ''
  ui.openDialog.showModal()
}

ui.emptyOpen.addEventListener('click', showOpenDialog)
ui.openFile.addEventListener('click', () => {
  ui.openDialog.close()
  const picked = pickFile()
  if (!picked) {
    ui.file.click()
    return
  }
  picked.then(
    handle => {
      void openFile(handle.getFile(), handle.name, handle)
    },
    (e: unknown) => {
      if (!(e instanceof DOMException && e.name === 'AbortError')) {
        fail(e)
      }
    },
  )
})
ui.openGbz.addEventListener('click', () => {
  ui.openDialog.close()
  showGbzDialog()
})

ui.file.addEventListener('change', () => {
  const file = ui.file.files?.[0]
  if (file) {
    void openFile(file, file.name)
  }
  ui.file.value = ''
})

const GBZ_DB = /\.db$/i

// A pasted gbz-base url goes to the cut dialog, filled in
ui.openDialog.addEventListener('close', () => {
  const url = ui.url.value.trim()
  if (ui.openDialog.returnValue !== 'url' || !url) {
    return
  }
  if (GBZ_DB.test(url)) {
    showGbzDialog({ db: url, index: haplotypeIndexBeside(url) })
  } else {
    void openUrl(url, { remember: true })
  }
})

function checkRegion() {
  let message = ''
  try {
    parseRegion(ui.gbzRegion.value)
  } catch (e) {
    message = e instanceof Error ? e.message : String(e)
  }
  ui.gbzRegion.setCustomValidity(message)
}

const SAMPLE_REGION = 'chr6:160,614,798-160,647,758'
const SAMPLE_HAPLOTYPES =
  'HG00097,HG00128,HG01123,HG00099,HG01960,HG02055,HG00133,HG01109'

// The dialog filled in with `preset`, else the cut on screen or in the
// address, else the HPRC sample
function showGbzDialog(preset?: Partial<GbzSource>) {
  const src: Partial<GbzSource> = preset ??
    state.source?.gbz ??
    gbzFromQuery(new URLSearchParams(location.search)) ?? {
      ...HPRC,
      region: SAMPLE_REGION,
      haplotypes: SAMPLE_HAPLOTYPES.split(','),
    }
  ui.gbzDb.value = src.db ?? ''
  ui.gbzIndex.value = src.index ?? ''
  ui.gbzRef.value = src.referenceSample ?? ''
  ui.gbzRegion.value = src.region ?? ''
  ui.gbzHaplotypes.value = src.haplotypes?.join(',') ?? ''
  checkRegion()
  ui.gbzStatus.textContent = ''
  ui.gbzRefs.replaceChildren()
  probed = ''
  if (preset) {
    void probe()
  }
  ui.gbzDialog.returnValue = ''
  ui.gbzDialog.showModal()
}

let probes = 0
let probed = ''

// Opens the database named in the dialog to say what it holds: its reference
// samples, offered for the reference field. A haplotype index that can't be
// read is dropped, with a note, where the database alone opens.
async function probe() {
  const db = ui.gbzDb.value.trim()
  const index = ui.gbzIndex.value.trim() || undefined
  const key = `${db}|${index ?? ''}`
  if (key === probed) {
    return
  }
  probed = key
  const id = ++probes
  const live = () => id === probes
  ui.gbzRefs.replaceChildren()
  if (!db) {
    ui.gbzStatus.textContent = ''
    return
  }
  ui.gbzStatus.textContent = 'Opening the database…'
  let note = ''
  let samples: string[] | undefined
  try {
    ;({ referenceSamples: samples } = await openDb(db, index))
  } catch (e) {
    if (index) {
      ;({ referenceSamples: samples } = await openDb(db).catch(() => ({
        referenceSamples: undefined,
      })))
      note = `No haplotype index could be read at ${index}, so walks go unnamed. `
    }
    if (!samples) {
      if (live()) {
        ui.gbzStatus.textContent = `Can't open ${db}: ${e instanceof Error ? e.message : String(e)}`
      }
      return
    }
  }
  if (!live()) {
    return
  }
  if (note) {
    ui.gbzIndex.value = ''
  }
  ui.gbzRefs.replaceChildren(
    ...samples.map(s =>
      Object.assign(document.createElement('option'), { value: s }),
    ),
  )
  ui.gbzStatus.textContent = `${note}Reference samples: ${samples.join(', ') || 'none'}`
}

ui.gbzRegion.addEventListener('input', checkRegion)
ui.gbzDb.addEventListener('change', () => void probe())
ui.gbzIndex.addEventListener('change', () => void probe())
ui.gbzRef.addEventListener('focus', () => void probe())

ui.gbzDialog.addEventListener('close', () => {
  if (ui.gbzDialog.returnValue === 'open') {
    const haps = ui.gbzHaplotypes.value.split(/[\s,]+/).filter(h => h !== '')
    void openGbz(
      {
        db: ui.gbzDb.value.trim(),
        index: ui.gbzIndex.value.trim() || undefined,
        region: ui.gbzRegion.value.trim(),
        haplotypes: haps.length ? haps : undefined,
        referenceSample: ui.gbzRef.value.trim() || undefined,
      },
      undefined,
      true,
    )
  }
})

export function showGuide() {
  ui.guideDialog.showModal()
}

export function showAbout() {
  ui.aboutDialog.showModal()
}

// Cancel isn't a submit button: as a dialog's first one, Enter in a field
// would press it
for (const b of document.querySelectorAll('dialog [data-dismiss]')) {
  b.addEventListener('click', () => b.closest('dialog')!.close())
}

for (const d of document.querySelectorAll('dialog')) {
  let pressedOutside = false
  const outside = (e: MouseEvent) => {
    const r = d.getBoundingClientRect()
    return (
      e.target === d &&
      (e.clientX < r.left ||
        e.clientX > r.right ||
        e.clientY < r.top ||
        e.clientY > r.bottom)
    )
  }
  d.addEventListener('mousedown', e => (pressedOutside = outside(e)))
  d.addEventListener('click', e => {
    if (pressedOutside && outside(e)) {
      d.close()
    }
    pressedOutside = false
  })
}
