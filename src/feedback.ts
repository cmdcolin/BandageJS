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

export interface Action {
  label: string
  run: () => void
}

let toastActions: Action[] = []
let toastTimer: ReturnType<typeof setTimeout> | undefined

// An error or a notice with actions stays until dismissed; others go by
// themselves
export function notify(
  text: string,
  isError = true,
  actions?: Action | Action[],
) {
  clearTimeout(toastTimer)
  toastActions = actions ? [actions].flat() : []
  if (!isError && !toastActions.length) {
    toastTimer = setTimeout(dismiss, NOTICE_MS)
  }
  ui.toastText.textContent = text
  ui.toast.classList.toggle('error', isError)
  ui.toast.hidden = false
  ui.toastActions.replaceChildren(
    ...toastActions.map((a, i) =>
      Object.assign(document.createElement('button'), {
        type: 'button',
        textContent: a.label,
        value: String(i),
      }),
    ),
  )
}

export function dismiss() {
  ui.toast.hidden = true
}

export function fail(e: unknown) {
  console.error(e)
  notify(e instanceof Error ? e.message : String(e))
}

ui.toastClose.addEventListener('click', dismiss)
ui.toastActions.addEventListener('click', e => {
  const button = (e.target as Element).closest('button')
  const action = button && toastActions[Number(button.value)]
  if (action) {
    dismiss()
    action.run()
  }
})
