import { esc } from './overlays'

export type MenuItem =
  | {
      label: string
      onClick: () => void
      checked?: boolean
      radio?: boolean
      disabled?: boolean
      // a second, muted line saying why an item is disabled
      detail?: string
      // stays open after a click, redrawn, so several can be ticked in turn
      keepOpen?: boolean
    }
  // opens its items in place of the menu's, with a way back
  | {
      label: string
      submenu: () => MenuItem[]
      detail?: string
      disabled?: boolean
    }
  | { header: string }
  | { divider: true }
  // a box that filters the items after it by label
  | { search: string }

const HOVER_CLICK_MS = 500

export interface Menu {
  label: string
  items: () => MenuItem[]
}

// The WAI-ARIA menu button pattern: each button opens its items fresh, so
// their checks say what is on screen now; arrows move within a menu and
// across the bar, Escape closes back to the button. A submenu drills down in
// the same popup, and Escape or the left arrow comes back up to the item that
// opened it.
export function menuBar(bar: HTMLElement, menus: Menu[]) {
  bar.setAttribute('role', 'menubar')
  const popup = document.createElement('div')
  popup.className = 'menu'
  popup.id = 'menu-popup'
  popup.setAttribute('role', 'menu')
  popup.hidden = true
  bar.after(popup)
  // `hoveredAt`: when sliding over from another menu opened this one. A click
  // right after is the same gesture, so it keeps the menu open; a later one
  // toggles it shut.
  let open:
    | {
        index: number
        // the item lists drilled into, the menu's own first, each with the
        // index of the item in its parent's list that opened it
        levels: { items: () => MenuItem[]; opener?: number }[]
        items: MenuItem[]
        hoveredAt?: number
      }
    | undefined

  const buttons = menus.map((menu, index) => {
    const button = document.createElement('button')
    button.type = 'button'
    button.textContent = menu.label
    button.className = 'menu-button'
    button.id = `menu-button-${index}`
    button.setAttribute('aria-haspopup', 'menu')
    button.setAttribute('aria-expanded', 'false')
    button.addEventListener('click', () => {
      if (
        open?.index === index &&
        performance.now() - (open.hoveredAt ?? -Infinity) < HOVER_CLICK_MS
      ) {
        open.hoveredAt = undefined
      } else if (open?.index === index) {
        close()
      } else {
        show(index, false)
      }
    })
    button.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        show(index, true)
      } else if (e.key === 'Escape' && open) {
        e.preventDefault()
        close(true)
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
        open.hoveredAt = performance.now()
      }
    })
    bar.append(button)
    return button
  })

  function neighbour(index: number, step: number) {
    return (index + step + menus.length) % menus.length
  }

  function row(item: MenuItem, i: number) {
    if ('submenu' in item) {
      return `<button type="button" role="menuitem" aria-haspopup="menu" tabindex="-1" data-i="${i}"${
        item.disabled ? ' aria-disabled="true" disabled' : ''
      }><span class="mark" aria-hidden="true"></span><span class="label">${esc(
        item.label,
      )}${item.detail ? `<small>${esc(item.detail)}</small>` : ''}</span><span class="more" aria-hidden="true">▸</span></button>`
    }
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
    }${item.disabled ? ' aria-disabled="true" disabled' : ''}><span class="mark" aria-hidden="true">${mark}</span><span class="label">${esc(
      item.label,
    )}${item.detail ? `<small>${esc(item.detail)}</small>` : ''}</span></button>`
  }

  // without the check mark, which would lead a checked item's text
  function labelOf(b: HTMLButtonElement) {
    return b.querySelector('.label')!.textContent!.toLowerCase()
  }

  function enabled() {
    return [
      ...popup.querySelectorAll<HTMLButtonElement>(
        'button[data-i]:not(:disabled)',
      ),
    ].filter(b => !b.hidden)
  }

  function show(index: number, focusFirst: boolean) {
    open = {
      index,
      levels: [{ items: menus[index]!.items }],
      items: [],
    }
    popup.setAttribute('aria-labelledby', `menu-button-${index}`)
    buttons.forEach((b, i) => {
      b.classList.toggle('active', i === index)
      b.setAttribute('aria-expanded', String(i === index))
    })
    popup.hidden = false
    draw(focusFirst ? 'first' : undefined)
  }

  // Redraws the open level with its items read again, keeping what its filter
  // box holds, and focuses the box or first item, the enabled item at an
  // index, or the item a submenu was opened from
  function draw(focus?: 'first' | number | { item: number }) {
    if (!open) {
      return
    }
    const kept = popup.querySelector<HTMLInputElement>('.menu-search')?.value
    const level = open.levels.at(-1)!
    const parent = open.levels.at(-2)
    const opener = parent && parent.items()[level.opener!]
    const back: MenuItem[] = parent
      ? [
          {
            label: `◀ ${opener && 'label' in opener ? opener.label : ''}`,
            onClick: up,
            keepOpen: true,
          },
        ]
      : []
    open.items = [...back, ...level.items()]
    popup.innerHTML = open.items.map(row).join('')
    const rect = buttons[open.index]!.getBoundingClientRect()
    popup.style.top = `${rect.bottom}px`
    popup.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - popup.offsetWidth - 8))}px`
    const search = popup.querySelector<HTMLInputElement>('.menu-search')
    if (search) {
      search.addEventListener('input', () => {
        const q = search.value.toLowerCase()
        for (const b of popup.querySelectorAll<HTMLButtonElement>(
          'button[data-i]',
        )) {
          b.hidden = q !== '' && !labelOf(b).includes(q)
        }
      })
      search.addEventListener('keydown', e => {
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          enabled()[0]?.focus()
        }
      })
      if (kept) {
        search.value = kept
        search.dispatchEvent(new Event('input'))
      }
    }
    if (focus === 'first') {
      ;(search ?? enabled()[0])?.focus()
    } else if (typeof focus === 'number') {
      enabled()[focus]?.focus()
    } else if (focus) {
      popup
        .querySelector<HTMLButtonElement>(`button[data-i="${focus.item}"]`)
        ?.focus()
    }
  }

  // `at` indexes the open items, which lead with a back row below the top
  function down(item: { submenu: () => MenuItem[] }, at: number) {
    if (open) {
      const opener = open.levels.length > 1 ? at - 1 : at
      open.levels.push({ items: item.submenu, opener })
      draw('first')
    }
  }

  function up() {
    if (open && open.levels.length > 1) {
      const { opener } = open.levels.pop()!
      draw({ item: opener! + (open.levels.length > 1 ? 1 : 0) })
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
    if (item && 'submenu' in item && !item.disabled) {
      down(item, Number(target.dataset.i))
    } else if (item && 'onClick' in item && !item.disabled) {
      if (item.keepOpen) {
        const at = enabled().indexOf(target)
        item.onClick()
        if (item.onClick !== up) {
          draw(at)
        }
      } else {
        close(true)
        item.onClick()
      }
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
      if (open && open.levels.length > 1) {
        up()
      } else {
        close(true)
      }
    } else if (e.key === 'Tab') {
      close(true)
    } else if (
      e.key === 'ArrowRight' &&
      document.activeElement?.getAttribute('aria-haspopup') === 'menu'
    ) {
      e.preventDefault()
      ;(document.activeElement as HTMLButtonElement).click()
    } else if (e.key === 'ArrowLeft' && open && open.levels.length > 1) {
      e.preventDefault()
      up()
    } else if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && open) {
      e.preventDefault()
      const next = neighbour(open.index, e.key === 'ArrowRight' ? 1 : -1)
      buttons[next]!.focus()
      show(next, true)
    } else if (e.key.length === 1 && !(e.target instanceof HTMLInputElement)) {
      const key = e.key.toLowerCase()
      const after = [...items.slice(at + 1), ...items.slice(0, at + 1)]
      after.find(b => labelOf(b).startsWith(key))?.focus()
    }
  })
  document.addEventListener('pointerdown', e => {
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
}
