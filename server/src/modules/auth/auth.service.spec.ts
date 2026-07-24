import { tokenHash } from './auth.service'

describe('refresh token hashing', () => {
  it('is stable without storing the raw token', () => {
    expect(tokenHash('secret')).toBe(tokenHash('secret'))
    expect(tokenHash('secret')).not.toContain('secret')
  })
})
