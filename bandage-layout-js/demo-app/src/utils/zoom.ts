/**
 * Zoom utility functions matching Bandage's zoom implementation
 * References: BandageNG/program/settings.cpp lines 61-63
 */

// Bandage zoom constants
export const MIN_ZOOM = 0.001 // 0.1%
export const MAX_ZOOM = 100.0 // 10,000%

/**
 * Clamp zoom value to Bandage's min/max range
 */
export function clampZoom(zoom: number): number {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom))
}

/**
 * Format zoom value as percentage string
 */
export function formatZoomPercent(zoom: number): string {
  return `${(zoom * 100).toFixed(1)}%`
}
