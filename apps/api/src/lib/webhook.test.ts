import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { verifyGitHubSignature } from './webhook'

describe('verifyGitHubSignature', () => {
  it('accepts a valid HMAC signature', () => {
    const payload = '{"zen":"Keep it logically awesome."}'
    const secret = 'test-secret'
    const signature = `sha256=${createHmac('sha256', secret).update(payload).digest('hex')}`
    expect(verifyGitHubSignature(payload, signature, secret)).toBe(true)
  })

  it('rejects invalid and missing signatures', () => {
    expect(verifyGitHubSignature('{}', 'sha256=bad', 'secret')).toBe(false)
    expect(verifyGitHubSignature('{}', null, 'secret')).toBe(false)
  })
})
