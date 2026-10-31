export function formatDate(value: string): string {
  return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(value))
}

export function formatDateTime(value: string): string {
  const time = new Intl.DateTimeFormat('vi-VN', {
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(value))
  return `${formatDate(value)}, ${time}`
}

export function formatDuration(seconds: number): string {
  const wholeSeconds = Math.max(0, Math.round(seconds))
  return `${String(Math.floor(wholeSeconds / 60)).padStart(2, '0')}:${String(wholeSeconds % 60).padStart(2, '0')}`
}
