export interface Point {
  x: number
  y: number
}

export interface Rect {
  left: number
  right: number
  top: number
  bottom: number
}

// Whether a pointer at `point` is still on its way to `panel`, a submenu that
// opened with the pointer at `apex`. The region is a cone lying open toward
// the panel, its tip at `apex` and its mouth the panel's near edge: a pointer
// crossing the parent's rows on a diagonal stays inside, while one heading
// down the menu leaves at once, so nothing has to wait out a fixed delay.
export function aimedAt(point: Point, apex: Point, panel: Rect) {
  // the edge facing the tip, since a submenu without room on the right opens
  // on the left
  const nearX =
    Math.abs(panel.left - apex.x) <= Math.abs(panel.right - apex.x)
      ? panel.left
      : panel.right
  const toPanel = nearX - apex.x
  if (toPanel === 0) {
    return true
  }
  // past the near edge, the cone stops widening at the panel's own extent
  const crossed = Math.min((point.x - apex.x) / toPanel, 1)
  return (
    crossed > 0 &&
    point.y >= apex.y + (panel.top - apex.y) * crossed &&
    point.y <= apex.y + (panel.bottom - apex.y) * crossed
  )
}
