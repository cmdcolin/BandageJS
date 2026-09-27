import { ui } from './ui'

const NOTICE_MS = 6000

// Work under way, which the spinner shows the newest of until all of it is
// done or cancelled
export interface Work {
  text: string
}

const works: Work[] = []
let loadingSince = 0
let loadingTimer: ReturnType<typeof setInterval> | undefined

function showWorks() {
  const newest = works.at(-1)
  if (newest && ui.loading.hidden) {
    loadingSince = performance.now()
    loadingTimer = setInterval(() => {
      ui.loadingTime.textContent = `${((performance.now() - loadingSince) / 1000).toFixed(0)} s`
    }, 500)
  } else if (!newest) {
    clearInterval(loadingTimer)
  }
  if (newest && ui.loadingText.textContent !== newest.text) {
    ui.loadingText.textContent = newest.text
    ui.loadingTime.textContent = ''
  }
  ui.loading.hidden = !newest
  ui.pane.classList.toggle('busy', !!newest)
}

export function progress(text: string): Work {
  const work = { text }
  works.push(work)
  showWorks()
  return work
}

export function report(work: Work, text: string) {
  work.text = text
  showWorks()
}

export function done(work: Work | undefined) {
  const i = work ? works.indexOf(work) : -1
  if (i >= 0) {
    works.splice(i, 1)
    showWorks()
  }
}

export function idle() {
  works.length = 0
  showWorks()
}

let toastAction: (() => void) | undefined
let toastTimer: ReturnType<typeof setTimeout> | undefined

// An error or a notice with an action stays until dismissed; others go by
// themselves
export function notify(
  text: string,
  isError = true,
  action?: { label: string; run: () => void },
) {
  clearTimeout(toastTimer)
  if (!isError && !action) {
    toastTimer = setTimeout(dismiss, NOTICE_MS)
  }
  ui.toastText.textContent = text
  ui.toast.classList.toggle('error', isError)
  ui.toast.hidden = false
  ui.toastAction.hidden = !action
  ui.toastAction.textContent = action?.label ?? ''
  toastAction = action?.run
}

export function dismiss() {
  ui.toast.hidden = true
}

export function fail(e: unknown) {
  console.error(e)
  notify(e instanceof Error ? e.message : String(e))
}

ui.toastClose.addEventListener('click', dismiss)
ui.toastAction.addEventListener('click', () => {
  dismiss()
  toastAction?.()
})
