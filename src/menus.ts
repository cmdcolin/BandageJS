import { esc } from './overlays'

export type MenuItem =
  | {
      label: string
      onClick: () => void
      checked?: boolean
      radio?: boolean
      disabled?: boolean
      title?: string
    }
  | { header: string }
  | { divider: true }

export interface Menu {
  label: string
  items: () => MenuItem[]
}

// A row of buttons, each opening its items fresh so their checks say what is
// on screen now. Hovering across the bar while one is open switches menus.
export function menuBar(bar: HTMLElement, menus: Menu[]) {
  const popup = document.createElement('div')
  popup.className = 'menu'
  popup.setAttribute('role', 'menu')
  popup.hidden = true
  document.body.append(popup)
  let open: { index: number; items: MenuItem[] } | undefined

  const buttons = menus.map((menu, index) => {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'menu-button'
    button.textContent = menu.label
    button.setAttribute('aria-haspopup', 'menu')
    button.addEventListener('click', () => {
      if (open?.index === index) {
        close()
      } else {
        show(index)
      }
    })
    button.addEventListener('mouseenter', () => {
      if (open && open.index !== index) {
        show(index)
      }
    })
    bar.append(button)
    return button
  })

  function show(index: number) {
    const items = menus[index]!.items()
    open = { index, items }
    popup.innerHTML = items
      .map((item, i) => {
        if ('divider' in item) {
          return '<hr>'
        }
        if ('header' in item) {
          return `<div class="menu-header">${esc(item.header)}</div>`
        }
        const role =
          item.checked === undefined
            ? 'menuitem'
            : item.radio
              ? 'menuitemradio'
              : 'menuitemcheckbox'
        const mark =
          item.checked === undefined
            ? ''
            : item.checked
              ? item.radio
                ? '●'
                : '✓'
              : ''
        return `<button type="button" role="${role}" data-i="${i}"${item.checked === undefined ? '' : ` aria-checked="${item.checked}"`}${
          item.disabled ? ' disabled' : ''
        }${item.title ? ` title="${esc(item.title)}"` : ''}><span class="mark">${mark}</span>${esc(item.label)}</button>`
      })
      .join('')
    const rect = buttons[index]!.getBoundingClientRect()
    popup.style.left = `${Math.min(rect.left, window.innerWidth - 260)}px`
    popup.style.top = `${rect.bottom}px`
    popup.hidden = false
    buttons.forEach((b, i) => b.classList.toggle('active', i === index))
  }

  function close() {
    open = undefined
    popup.hidden = true
    buttons.forEach(b => b.classList.remove('active'))
  }

  popup.addEventListener('click', e => {
    const target = (e.target as Element).closest<HTMLButtonElement>(
      'button[data-i]',
    )
    const item = target && open?.items[Number(target.dataset.i)]
    if (item && 'onClick' in item && !item.disabled) {
      close()
      item.onClick()
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
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      close()
    }
  })
  window.addEventListener('resize', close)
}
