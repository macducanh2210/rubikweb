import { useEffect, useRef, useState } from 'react'

interface GoogleCredentialResponse { credential: string }
interface GoogleIdentityClient {
  initialize(options: { client_id: string; callback: (response: GoogleCredentialResponse) => void }): void
  renderButton(element: HTMLElement, options: { theme: string; size: string; text: string; locale: string; width: number }): void
}
interface GoogleBridge {
  clientId: string | null
  onCredential: ((credential: string) => void) | null
}

declare global {
  interface Window {
    google?: { accounts: { id: GoogleIdentityClient } }
    __rubikGoogleBridge?: GoogleBridge
  }
}

let scriptPromise: Promise<void> | null = null

function getBridge(): GoogleBridge {
  window.__rubikGoogleBridge ??= { clientId: null, onCredential: null }
  return window.__rubikGoogleBridge
}

export function ensureGoogleIdentityInitialized(
  clientId: string, client: GoogleIdentityClient, bridge: GoogleBridge,
): void {
  if (bridge.clientId === clientId) return
  client.initialize({
    client_id: clientId,
    callback: (response) => { if (response.credential) bridge.onCredential?.(response.credential) },
  })
  bridge.clientId = clientId
}

function loadGoogleScript(): Promise<void> {
  if (window.google?.accounts.id) return Promise.resolve()
  if (scriptPromise) return scriptPromise
  scriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.onload = () => window.google?.accounts.id ? resolve() : reject(new Error('Google Identity Services unavailable'))
    script.onerror = () => reject(new Error('Google Identity Services unavailable'))
    document.head.appendChild(script)
  }).catch((error: unknown) => {
    scriptPromise = null
    throw error
  })
  return scriptPromise
}

export function GoogleSignInButton({ onCredential, busy = false, text = 'continue_with' }: {
  onCredential: (idToken: string) => void
  busy?: boolean
  text?: 'signin_with' | 'signup_with' | 'continue_with'
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const callbackRef = useRef(onCredential)
  const [failed, setFailed] = useState(false)
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim()
  callbackRef.current = onCredential

  useEffect(() => {
    if (!clientId) return
    let active = true
    let handler: ((credential: string) => void) | null = null
    void loadGoogleScript().then(() => {
      if (!active || !hostRef.current || !window.google) return
      const host = hostRef.current
      host.replaceChildren()
      handler = (credential) => { if (active) callbackRef.current(credential) }
      const bridge = getBridge()
      bridge.onCredential = handler
      ensureGoogleIdentityInitialized(clientId, window.google.accounts.id, bridge)
      window.google.accounts.id.renderButton(host, {
        theme: 'outline', size: 'large', text, locale: 'vi',
        // Google only renders its generic text button below 200px.
        width: 199,
      })
      setFailed(false)
    }).catch(() => { if (active) setFailed(true) })
    return () => {
      active = false
      const bridge = window.__rubikGoogleBridge
      if (bridge?.onCredential === handler) bridge.onCredential = null
    }
  }, [clientId, text])

  if (!clientId) return null
  return (
    <div className="grid gap-2">
      <div ref={hostRef} className={`flex min-h-11 justify-center ${busy ? 'pointer-events-none opacity-60' : ''}`} aria-label="Tiếp tục với Google" />
      {failed && <p role="alert" className="text-small text-error">Không mở được Google. Kiểm tra kết nối rồi tải lại trang.</p>}
    </div>
  )
}
