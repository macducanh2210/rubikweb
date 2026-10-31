import type { StickerColor } from '../../types'

export const stickerLabels: Record<StickerColor, string> = {
  white: 'Trắng',
  red: 'Đỏ',
  green: 'Xanh lá',
  blue: 'Xanh dương',
  yellow: 'Vàng',
  orange: 'Cam',
}

export interface StickerProps {
  color?: StickerColor | null
  size?: 'overview' | 'editor' | 'swatch'
  label?: string
  selected?: boolean
  onClick?: () => void
}

const sizes = {
  overview: 'size-full min-h-0',
  editor: 'size-14 min-h-11 min-w-11 sm:size-16',
  swatch: 'size-11',
} as const

export function Sticker({ color, size = 'overview', label, selected = false, onClick }: StickerProps) {
  const name = label ?? (color ? stickerLabels[color] : 'Chưa chụp')
  const classes = `sticker block rounded-sticker border border-[var(--sticker-outline)] ${sizes[size]} ${selected ? 'outline-2 outline-offset-2 outline-focus' : ''}`

  if (!onClick) return <span className={classes} data-color={color ?? 'empty'} aria-label={name} />

  return (
    <button
      type="button"
      className={classes}
      data-color={color ?? 'empty'}
      aria-label={name}
      aria-pressed={selected}
      onClick={onClick}
    />
  )
}
