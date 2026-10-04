import { esc } from './overlays'
import { aimedAt } from './submenuAim'

import type { Point } from './submenuAim'

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
  // opens its items in a panel beside the menu's
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

// How long a pointer may rest on its way to an open submenu before the rows
// it crossed take over. Only a pointer still aimed at the submenu waits; one
// that veers off is answered at once.
const AIM_GRACE_MS = 120

// Material icons, as the JBrowse menus draw them
const ICONS = {
  checkbox:
    'M19 5v14H5V5zm0-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2',
  checkboxOn:
    'M19 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.11 0 2-.9 2-2V5c0-1.1-.89-2-2-2m-9 14-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8z',
  radio:
    'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2m0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8',
  radioOn:
    'M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5m0-5C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2m0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8',
  more: 'M10 6 8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z',
}

function icon(name: keyof typeof ICONS, on = false) {
  return `<svg${on ? ' class="on"' : ''} viewBox="0 0 24 24" aria-hidden="true"><path d="${ICONS[name]}"/></svg>`
}

export interface Menu {
  label: string
  items: () => MenuItem[]
}

// One open panel: the menu's own, or a submenu nested in the panel of the row
// that opened it, with where the pointer was then
interface Level {
  items: () => MenuItem[]
  list: MenuItem[]
  panel: HTMLElement
  opener?: HTMLButtonElement
  apex?: Point
}

// The WAI-ARIA menu button pattern: each button opens its items fresh, so
// their checks say what is on screen now; arrows move within a menu and
// across the bar, Escape closes back to the button. A submenu opens in a
// panel beside its item on hover, click or the right arrow, and Escape or the
// left arrow closes it back to that item.
export function menuBar(bar: HTMLElement, menus: Menu[]) {
  bar.setAttribute('role', 'menubar')
  const popup = document.createElement('div')
  popup.className = 'menu'
  popup.id = 'menu-popup'
  popup.setAttribute('role', 'menu')
  popup.hidden = true
  popup.addEventListener(
    'scroll',
    e => {
      follow(e.target as HTMLElement)
    },
    true,
  )
  bar.after(popup)
  // `hoveredAt`: when sliding over from another menu opened this one. A click
  // right after is the same gesture, so it keeps the menu open; a later one
  // toggles it shut.
  let open: { index: number; levels: Level[]; hoveredAt?: number } | undefined
  let pointer: Point | undefined
  // whether the last press was a finger or pen, which has no hover to close
  // a submenu with
  let tapped = false
  // a hover change held back while the pointer is aimed at an open submenu
  let pending:
    | {
        depth: number
        row?: HTMLButtonElement
        point: Point
        timer: ReturnType<typeof setTimeout>
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
    if ('divider' in item) {
      return '<hr role="separator">'
    }
    if ('header' in item) {
      return `<div class="menu-header" role="presentation">${esc(item.header)}</div>`
    }
    if ('search' in item) {
      return `<input class="menu-search" type="search" placeholder="${esc(item.search)}" aria-label="${esc(item.search)}">`
    }
    const label = `<span class="label">${esc(item.label)}${
      item.detail ? `<small>${esc(item.detail)}</small>` : ''
    }</span>`
    const disabled = item.disabled ? ' aria-disabled="true" disabled' : ''
    if ('submenu' in item) {
      return `<button type="button" role="menuitem" aria-haspopup="menu" aria-expanded="false" tabindex="-1" data-i="${i}"${disabled}>${label}${icon('more')}</button>`
    }
    if (item.checked === undefined) {
      return `<button type="button" role="menuitem" tabindex="-1" data-i="${i}"${disabled}>${label}</button>`
    }
    const role = item.radio ? 'menuitemradio' : 'menuitemcheckbox'
    const glyph = item.radio
      ? icon(item.checked ? 'radioOn' : 'radio', item.checked)
      : icon(item.checked ? 'checkboxOn' : 'checkbox', item.checked)
    return `<button type="button" role="${role}" aria-checked="${item.checked}" tabindex="-1" data-i="${i}"${disabled}>${label}${glyph}</button>`
  }

  function labelOf(b: HTMLButtonElement) {
    return b.textContent!.toLowerCase()
  }

  function rows(panel: HTMLElement) {
    return [...panel.querySelectorAll<HTMLButtonElement>(':scope > button')]
  }

  function enabled(panel: HTMLElement) {
    return rows(panel).filter(b => !b.disabled && !b.hidden)
  }

  function depthOf(el: Element) {
    const panel = el.closest('.menu')
    return open ? open.levels.findIndex(l => l.panel === panel) : -1
  }

  function centre(el: Element) {
    const r = el.getBoundingClientRect()
    return { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 }
  }

  function show(index: number, focusFirst: boolean) {
    close()
    open = {
      index,
      levels: [{ items: menus[index]!.items, list: [], panel: popup }],
    }
    popup.setAttribute('aria-labelledby', `menu-button-${index}`)
    buttons.forEach((b, i) => {
      b.classList.toggle('active', i === index)
      b.setAttribute('aria-expanded', String(i === index))
    })
    popup.hidden = false
    fill(open.levels[0]!)
    place(open.levels[0]!)
    if (focusFirst) {
      focusIn(popup)
    }
  }

  // Draws a level's items read again, keeping what its filter box holds and
  // the submenu open from it
  function fill(level: Level) {
    const { panel } = level
    const kept = panel.querySelector<HTMLInputElement>(
      ':scope > .menu-search',
    )?.value
    const child = panel.querySelector(':scope > .menu')
    level.list = level.items()
    panel.innerHTML = level.list.map(row).join('')
    if (child) {
      panel.append(child)
    }
    const search = panel.querySelector<HTMLInputElement>(
      ':scope > .menu-search',
    )
    if (search) {
      const filter = () => {
        const q = search.value.toLowerCase()
        for (const b of rows(panel)) {
          b.hidden = q !== '' && !labelOf(b).includes(q)
        }
      }
      search.addEventListener('input', () => {
        closeFrom(depthOf(panel) + 1)
        filter()
      })
      if (kept) {
        search.value = kept
        filter()
      }
    }
  }

  // The menu hangs under its button; a submenu beside the item that opened
  // it, on whichever side has room, its first item level with that one. With
  // room on neither, as on a phone, it hangs under the item instead of over it.
  function place({ panel, opener }: Level) {
    // measured from the left edge, where nothing squeezes it
    panel.style.left = '0'
    const { offsetWidth: w, offsetHeight: h } = panel
    if (!opener) {
      const rect = buttons[open!.index]!.getBoundingClientRect()
      panel.style.top = `${rect.bottom}px`
      panel.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - w - 8))}px`
      return
    }
    const parent = opener.parentElement!.getBoundingClientRect()
    const row = opener.getBoundingClientRect()
    const beside =
      parent.right + w <= innerWidth - 8
        ? parent.right
        : parent.left - w >= 8
          ? parent.left - w
          : undefined
    const top =
      beside === undefined ? row.bottom : row.top - panel.clientTop - 4
    panel.style.left = `${Math.max(8, beside ?? innerWidth - w - 8)}px`
    panel.style.top = `${Math.max(8, Math.min(top, innerHeight - h - 8))}px`
  }

  function focusIn(panel: HTMLElement) {
    ;(
      panel.querySelector<HTMLInputElement>(':scope > .menu-search') ??
      enabled(panel)[0]
    )?.focus()
  }

  // Opens the submenu of the item `opener` in the panel at `depth`, unless it
  // is open already
  function enter(depth: number, opener: HTMLButtonElement, apex: Point) {
    cancelPending()
    const levels = open!.levels
    if (levels[depth + 1]?.opener === opener) {
      return levels[depth + 1]!
    }
    closeFrom(depth + 1)
    const item = levels[depth]!.list[Number(opener.dataset.i)]
    if (!item || !('submenu' in item)) {
      return undefined
    }
    const panel = document.createElement('div')
    panel.className = 'menu'
    panel.setAttribute('role', 'menu')
    panel.setAttribute('aria-label', item.label)
    levels[depth]!.panel.append(panel)
    const level = { items: item.submenu, list: [], panel, opener, apex }
    levels.push(level)
    opener.setAttribute('aria-expanded', 'true')
    fill(level)
    place(level)
    return level
  }

  // Closes the submenus from `depth` down, handing focus held in one back to
  // the item that opened them
  function closeFrom(depth: number) {
    const [level] = open?.levels.splice(Math.max(depth, 1)) ?? []
    if (!level) {
      return
    }
    cancelPending()
    const focused = level.panel.contains(document.activeElement)
    level.panel.remove()
    level.opener!.setAttribute('aria-expanded', 'false')
    if (focused) {
      level.opener!.focus()
    }
  }

  // A submenu follows its item as the panel holding it scrolls, and closes
  // once the item is out of sight
  function follow(panel: HTMLElement) {
    const depth = depthOf(panel)
    const child = open?.levels[depth + 1]
    if (depth < 0 || !child) {
      return
    }
    const row = child.opener!.getBoundingClientRect()
    const box = panel.getBoundingClientRect()
    if (row.bottom <= box.top || row.top >= box.bottom) {
      closeFrom(depth + 1)
    } else {
      open!.levels.slice(depth + 1).forEach(place)
    }
  }

  // Reads every open level's items again after one changed a setting, so a
  // parent item's label and state stay true while its submenu is up
  function refresh(depth: number) {
    closeFrom(depth + 1)
    const levels = open!.levels
    for (let d = 0; d < levels.length; d++) {
      const level = levels[d]!
      fill(level)
      const child = levels[d + 1]
      if (child) {
        const at = child.opener!.dataset.i!
        const item = level.list[Number(at)]
        const opener = level.panel.querySelector<HTMLButtonElement>(
          `:scope > button[data-i="${at}"]`,
        )
        if (opener && item && 'submenu' in item && !item.disabled) {
          opener.setAttribute('aria-expanded', 'true')
          child.opener = opener
          child.items = item.submenu
        } else {
          closeFrom(d + 1)
        }
      }
      place(level)
    }
  }

  function cancelPending() {
    if (pending) {
      clearTimeout(pending.timer)
      pending = undefined
    }
  }

  // The pointer asked for the submenu of `row` at `depth` to be the open one,
  // or with no row, for none to be
  function commit(
    depth: number,
    row: HTMLButtonElement | undefined,
    point: Point,
  ) {
    cancelPending()
    pointer = point
    if (row?.isConnected) {
      enter(depth, row, point)
    } else {
      closeFrom(depth + 1)
    }
  }

  function defer(
    depth: number,
    row: HTMLButtonElement | undefined,
    point: Point,
  ) {
    cancelPending()
    pending = {
      depth,
      row,
      point,
      timer: setTimeout(() => {
        commit(depth, row, point)
      }, AIM_GRACE_MS),
    }
  }

  // 'unmeasured' rather than a lenient 'inside': a cone aimed at nothing
  // would hold the submenu open for as long as the pointer kept moving
  function aim(level: Level, point: Point) {
    const rect = level.panel.getBoundingClientRect()
    if (!level.apex || (rect.width === 0 && rect.height === 0)) {
      return 'unmeasured'
    }
    return aimedAt(point, level.apex, rect) ? 'inside' : 'outside'
  }

  // A row under a pointer that has not moved slid there as the menu redrew,
  // so it is no hover
  function hover(
    depth: number,
    row: HTMLButtonElement | undefined,
    point: Point,
  ) {
    const child = open!.levels[depth + 1]
    if (child ? child.opener === row : !row) {
      cancelPending()
    } else if (pointer && point.x === pointer.x && point.y === pointer.y) {
      return
    } else if (!child || aim(child, point) === 'outside') {
      commit(depth, row, point)
    } else {
      defer(depth, row, point)
    }
  }

  function close(refocus = false) {
    if (!open) {
      return
    }
    cancelPending()
    closeFrom(1)
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

  // Hover intent is the mouse's: a tap's pointer events arrive with its click
  popup.addEventListener('pointerover', e => {
    const target = e.target as Element
    const depth = depthOf(target)
    if (depth < 0 || e.pointerType !== 'mouse') {
      return
    }
    const b = target.closest<HTMLButtonElement>('button[data-i]')
    const item = b && open!.levels[depth]!.list[Number(b.dataset.i)]
    hover(depth, item && 'submenu' in item && !item.disabled ? b : undefined, {
      x: e.clientX,
      y: e.clientY,
    })
  })
  document.addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse') {
      return
    }
    pointer = { x: e.clientX, y: e.clientY }
    const held = pending
    const child = held && open?.levels[held.depth + 1]
    if (!held || !child) {
      return
    }
    const aimed = aim(child, pointer)
    if (aimed === 'outside') {
      commit(held.depth, held.row, held.point)
    } else if (aimed === 'inside') {
      defer(held.depth, held.row, held.point)
    }
  })
  popup.addEventListener('pointerdown', e => {
    tapped = e.pointerType !== 'mouse'
  })
  popup.addEventListener('click', e => {
    const target = (e.target as Element).closest<HTMLButtonElement>(
      'button[data-i]',
    )
    const depth = target ? depthOf(target) : -1
    const item = open?.levels[depth]?.list[Number(target?.dataset.i)]
    if (!target || !item || !('label' in item) || item.disabled) {
      return
    }
    if (
      'submenu' in item &&
      tapped &&
      e.detail !== 0 &&
      open!.levels[depth + 1]?.opener === target
    ) {
      closeFrom(depth + 1)
    } else if ('submenu' in item) {
      const sub = enter(
        depth,
        target,
        e.detail === 0 ? centre(target) : { x: e.clientX, y: e.clientY },
      )
      if (sub) {
        focusIn(sub.panel)
      }
    } else if (item.keepOpen) {
      const at = enabled(target.parentElement!).indexOf(target)
      item.onClick()
      refresh(depth)
      const level = open?.levels[depth]
      if (level) {
        enabled(level.panel)[at]?.focus()
      }
    } else {
      close(true)
      item.onClick()
    }
  })
  popup.addEventListener('keydown', e => {
    const target = e.target as HTMLElement
    const depth = depthOf(target)
    if (!open || depth < 0) {
      return
    }
    const level = open.levels[depth]!
    const typing = target instanceof HTMLInputElement
    const items = enabled(level.panel)
    const at = items.indexOf(target as HTMLButtonElement)
    const move = (to: HTMLButtonElement | undefined) => {
      closeFrom(depth + 1)
      to?.focus()
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const step = e.key === 'ArrowDown' ? 1 : -1
      move(
        items[
          at < 0
            ? step > 0
              ? 0
              : items.length - 1
            : (at + step + items.length) % items.length
        ],
      )
    } else if (e.key === 'Escape') {
      e.preventDefault()
      if (depth > 0) {
        closeFrom(depth)
      } else {
        close(true)
      }
    } else if (e.key === 'Tab') {
      close(true)
    } else if (typing) {
      return
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault()
      move(items[e.key === 'Home' ? 0 : items.length - 1])
    } else if (
      e.key === 'ArrowRight' &&
      target.getAttribute('aria-haspopup') === 'menu'
    ) {
      e.preventDefault()
      target.click()
    } else if (e.key === 'ArrowLeft' && depth > 0) {
      e.preventDefault()
      closeFrom(depth)
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault()
      const next = neighbour(open.index, e.key === 'ArrowRight' ? 1 : -1)
      buttons[next]!.focus()
      show(next, true)
    } else if (e.key.length === 1) {
      const key = e.key.toLowerCase()
      const after = [...items.slice(at + 1), ...items.slice(0, at + 1)]
      const found = after.find(b => labelOf(b).startsWith(key))
      if (found) {
        move(found)
      }
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
