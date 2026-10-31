import { describe, expect, it, vi } from 'vitest'
import { ensureGoogleIdentityInitialized } from './GoogleSignInButton'

describe('Google Identity Services initialization', () => {
  it('initializes once and sends a credential to the latest mounted page', () => {
    let callback: ((response: { credential: string }) => void) | undefined
    const initialize = vi.fn((options: { callback: (response: { credential: string }) => void }) => {
      callback = options.callback
    })
    const client = { initialize, renderButton: vi.fn() }
    const first = vi.fn()
    const second = vi.fn()
    const bridge = { clientId: null as string | null, onCredential: first as ((token: string) => void) | null }

    ensureGoogleIdentityInitialized('client-id', client, bridge)
    bridge.onCredential = second
    ensureGoogleIdentityInitialized('client-id', client, bridge)
    callback?.({ credential: 'id-token' })

    expect(initialize).toHaveBeenCalledTimes(1)
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledWith('id-token')
  })
})
