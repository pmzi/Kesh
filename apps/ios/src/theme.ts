export const colors = {
  ground: '#FFFFFF',
  surface: '#F5F5F5',
  hairline: '#E6E6E6',
  text: '#111111',
  muted: '#6B6B6B',
  accent: '#2B59FF',
  accentText: '#FFFFFF',
  /** @deprecated alias of accent, kept so older plugins keep working. */
  brass: '#2B59FF',
} as const;

export const fonts = {
  display: 'System',
  ui: 'System',
  mono: 'Menlo',
} as const;

export const theme = {
  colors,
  fonts: { display: fonts.display, ui: fonts.ui, mono: fonts.mono },
};
