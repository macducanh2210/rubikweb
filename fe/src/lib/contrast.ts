function relativeLuminance(hex: string): number {
  const channels = [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16) / 255)
  const linear = channels.map((value) => value <= 0.04045
    ? value / 12.92
    : ((value + 0.055) / 1.055) ** 2.4)
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]
}

export function contrastRatio(first: string, second: string): number {
  const a = relativeLuminance(first)
  const b = relativeLuminance(second)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

export interface ContrastPair {
  label: string
  foreground: string
  background: string
  minimum: 3 | 4.5
}

export const contrastPairs: ContrastPair[] = [
  { label: 'Chữ chính / bề mặt', foreground: '--text', background: '--surface', minimum: 4.5 },
  { label: 'Chữ phụ / bề mặt', foreground: '--muted', background: '--surface', minimum: 4.5 },
  { label: 'Chữ chính / nền trang', foreground: '--text', background: '--page', minimum: 4.5 },
  { label: 'Chữ phụ / nền trang', foreground: '--muted', background: '--page', minimum: 4.5 },
  { label: 'Liên kết / bề mặt', foreground: '--link', background: '--surface', minimum: 4.5 },
  { label: 'Lỗi / bề mặt', foreground: '--danger-text', background: '--surface', minimum: 4.5 },
  { label: 'Chữ trắng / nút xanh', foreground: '--on-action', background: '--action', minimum: 4.5 },
  { label: 'Chữ trắng / nút đỏ', foreground: '--on-danger', background: '--danger', minimum: 4.5 },
  { label: 'Chữ tối / xanh lá', foreground: '--on-bright', background: '--success', minimum: 4.5 },
  { label: 'Chữ tối / cam', foreground: '--on-bright', background: '--warning', minimum: 4.5 },
  { label: 'Chữ tối / vàng', foreground: '--on-bright', background: '--current-step', minimum: 4.5 },
  { label: 'Chữ tối / ô trắng', foreground: '--on-bright', background: '--sticker-white', minimum: 4.5 },
  { label: 'Viền điều khiển / bề mặt', foreground: '--control-border', background: '--surface', minimum: 3 },
  { label: 'Vòng focus / bề mặt', foreground: '--focus', background: '--surface', minimum: 3 },
  { label: 'Viền ô trắng / ô trắng', foreground: '--sticker-outline', background: '--sticker-white', minimum: 3 },
  { label: 'Chấm hoàn thành / bề mặt', foreground: '--success', background: '--surface', minimum: 3 },
  { label: 'Chấm cảnh báo / bề mặt', foreground: '--warning', background: '--surface', minimum: 3 },
  { label: 'Chấm lỗi / bề mặt', foreground: '--danger-text', background: '--surface', minimum: 3 },
]
