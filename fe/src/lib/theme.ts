import type { Theme } from '../types'

const THEME_KEY = 'theme'

export function setTheme(theme: Theme): void {
  previewTheme(theme)
  localStorage.setItem(THEME_KEY, theme)
}

export function previewTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme
}

export function initializeTheme(): void {
  const stored = localStorage.getItem(THEME_KEY)
  document.documentElement.dataset.theme = stored === 'dark' ? 'dark' : 'light'
}
