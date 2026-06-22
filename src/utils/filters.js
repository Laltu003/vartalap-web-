// ============================================================
// src/utils/filters.js
// Color filter presets — CSS filter strings for live preview,
// applied to a canvas at capture time to "bake" them into the photo.
// ============================================================

export const FILTERS = [
  { id: 'none', label: 'Normal', css: 'none' },
  { id: 'bw', label: 'B&W', css: 'grayscale(1) contrast(1.1)' },
  { id: 'sepia', label: 'Sepia', css: 'sepia(0.75) contrast(1.05) brightness(1.05)' },
  { id: 'vintage', label: 'Vintage', css: 'sepia(0.35) contrast(0.9) brightness(1.1) saturate(1.3)' },
  { id: 'vivid', label: 'Vivid', css: 'saturate(1.6) contrast(1.15) brightness(1.05)' },
  { id: 'cool', label: 'Cool', css: 'hue-rotate(15deg) saturate(1.2) brightness(1.05)' },
  { id: 'warm', label: 'Warm', css: 'hue-rotate(-10deg) saturate(1.25) brightness(1.08) contrast(1.05)' },
  { id: 'noir', label: 'Noir', css: 'grayscale(1) contrast(1.4) brightness(0.9)' },
  { id: 'fade', label: 'Fade', css: 'contrast(0.85) brightness(1.15) saturate(0.8)' },
];

export function getFilterById(id) {
  return FILTERS.find(f => f.id === id) || FILTERS[0];
}
