export function FormNotice({ message, tone = 'error' }: { message: string; tone?: 'error' | 'success' }) {
  return <p role={tone === 'error' ? 'alert' : 'status'} className={`text-small ${tone === 'error' ? 'text-danger-text' : 'text-ink'}`}>{message}</p>
}
