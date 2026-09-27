import { esc } from './overlays'

export type MenuItem =
  | {
      label: string
      onClick: () => void
      checked?: boolean
      radio?: boolean
      disabled?: boolean
      // a second, muted line: what an example is, or why an item is disabled
      detail?: string
    }
  | { header: string }
  | { divider: true }
  // a box that filters the items after it by label
  | { search: string }

export interface Menu {
  label: () => string
  items: () => MenuItem[]
  hidden?: () => boolean
}

// The WAI-ARIA menu button pattern: each button opens its items fresh, so
// their checks say what is on screen now; arrows move within a menu and
// across the bar, Escape closes back to the button. Labels can say what is
// chosen, so `refresh` re-reads them.
export function menuBar(bar: HTMLElement, menus: Menu[]) {
  bar.setAttribute('role', 'menubar')
  const popup = document.createElement('div')
  popup.className = 'menu'
  popup.id = 'menu-popup'
  popup.setAttribute('role', 'menu')
  popup.hidden = true
  bar.after(popup)
  let open: { index: number; items: MenuItem[] } | undefined

  const buttons = menus.map((_, index) => {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'menu-button'
    button.setAttribute('aria-haspopup', 'menu')
    button.setAttribute('aria-expanded', 'false')
    button.addEventListener('click', () => {
      if (open?.index === index) {
        close()
      } else {
        show(index, false)
      }
    })
    button.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        show(index, true)
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault()
        const next = neighbour(index, e.key === 'ArrowRight' ? 1 : -1)
        buttons[next]!.focus()
        if (open) {
          show(next, false)
        }
      }
    })
    button.addEventListener('mouseenter', () => {
      if (open && open.index !== index) {
        show(index, false)
      }
    })
    bar.append(button)
    return button
  })

  function neighbour(index: number, step: number) {
    let next = index
    do {
      next = (next + step + menus.length) % menus.length
    } while (buttons[next]!.hidden && next !== index)
    return next
  }

  function refresh() {
    menus.forEach((menu, i) => {
      const button = buttons[i]!
      const label = menu.label()
      if (button.textContent !== label) {
        button.textContent = label
      }
      button.hidden = menu.hidden?.() ?? false
    })
    if (open && buttons[open.index]!.hidden) {
      close()
    }
  }
  refresh()

  function row(item: MenuItem, i: number) {
    if ('divider' in item) {
      return '<hr role="separator">'
    }
    if ('header' in item) {
      return `<div class="menu-header" role="presentation">${esc(item.header)}</div>`
    }
    if ('search' in item) {
      return `<input class="menu-search" type="search" placeholder="${esc(item.search)}" aria-label="${esc(item.search)}">`
    }
    const role =
      item.checked === undefined
        ? 'menuitem'
        : item.radio
          ? 'menuitemradio'
          : 'menuitemcheckbox'
    const mark = item.checked ? (item.radio ? '●' : '✓') : ''
    return `<button type="button" role="${role}" tabindex="-1" data-i="${i}"${
      item.checked === undefined ? '' : ` aria-checked="${item.checked}"`
    }${item.disabled ? ' aria-disabled="true" disabled' : ''}><span class="mark">${mark}</span><span class="label">${esc(
      item.label,
    )}${item.detail ? `<small>${esc(item.detail)}</small>` : ''}</span></button>`
  }

  function enabled() {
    return [
      ...popup.querySelectorAll<HTMLButtonElement>(
        'button[data-i]:not(:disabled)',
      ),
    ].filter(b => !b.hidden)
  }

  function show(index: number, focusFirst: boolean) {
    const items = menus[index]!.items()
    open = { index, items }
    popup.innerHTML = items.map(row).join('')
    popup.setAttribute('aria-labelledby', `menu-button-${index}`)
    buttons.forEach((b, i) => {
      b.id = `menu-button-${i}`
      b.classList.toggle('active', i === index)
      b.setAttribute('aria-expanded', String(i === index))
    })
    popup.hidden = false
    const rect = buttons[index]!.getBoundingClientRect()
    popup.style.top = `${rect.bottom}px`
    popup.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - popup.offsetWidth - 8))}px`
    const search = popup.querySelector<HTMLInputElement>('.menu-search')
    if (search) {
      search.addEventListener('input', () => {
        const q = search.value.toLowerCase()
        for (const b of popup.querySelectorAll<HTMLButtonElement>(
          'button[data-i]',
        )) {
          b.hidden = q !== '' && !b.textContent!.toLowerCase().includes(q)
        }
      })
      search.addEventListener('keydown', e => {
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          enabled()[0]?.focus()
        }
      })
    }
    if (focusFirst) {
      ;(search ?? enabled()[0])?.focus()
    }
  }

  function close(refocus = false) {
    if (!open) {
      return
    }
    const button = buttons[open.index]!
    open = undefined
    popup.hidden = true
    buttons.forEach(b => {
      b.classList.remove('active')
      b.setAttribute('aria-expanded', 'false')
    })
    if (refocus) {
      button.focus()
    }
  }

  popup.addEventListener('click', e => {
    const target = (e.target as Element).closest<HTMLButtonElement>(
      'button[data-i]',
    )
    const item = target && open?.items[Number(target.dataset.i)]
    if (item && 'onClick' in item && !item.disabled) {
      close(true)
      item.onClick()
    }
  })
  popup.addEventListener('keydown', e => {
    const items = enabled()
    const at = items.indexOf(document.activeElement as HTMLButtonElement)
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const step = e.key === 'ArrowDown' ? 1 : -1
      items[(at + step + items.length) % items.length]?.focus()
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault()
      items[e.key === 'Home' ? 0 : items.length - 1]?.focus()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      close(true)
    } else if (e.key === 'Tab') {
      close(true)
    } else if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && open) {
      e.preventDefault()
      const next = neighbour(open.index, e.key === 'ArrowRight' ? 1 : -1)
      buttons[next]!.focus()
      show(next, true)
    } else if (e.key.length === 1 && !(e.target instanceof HTMLInputElement)) {
      const key = e.key.toLowerCase()
      const after = [...items.slice(at + 1), ...items.slice(0, at + 1)]
      after
        .find(b => b.textContent!.trim().toLowerCase().startsWith(key))
        ?.focus()
    }
  })
  document.addEventListener('mousedown', e => {
    if (
      open &&
      !popup.contains(e.target as Node) &&
      !bar.contains(e.target as Node)
    ) {
      close()
    }
  })
  window.addEventListener('resize', () => {
    close()
  })
  return { refresh }
}
