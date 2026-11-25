import { describe, expect, test } from 'bun:test'

import { describeError } from '../src/errors'

describe('describeError', () => {
  test('reads the body ngx-eden wraps', () => {
    expect(describeError({ status: 404, value: { message: 'Not found' } })).toBe('Not found')
    expect(describeError({ status: 422, value: { summary: 'Expected string' } })).toBe(
      'Expected string',
    )
  })

  test('reads the body of an HttpErrorResponse', () => {
    expect(
      describeError({ status: 404, error: { message: 'Gone' }, message: 'Http failure' }),
    ).toBe('Gone')
    expect(describeError({ status: 0, message: 'Http failure response: 0 Unknown Error' })).toBe(
      'The server cannot be reached.',
    )
  })

  test('reads the first issue of a form the server refused', () => {
    const issues = [
      { ref: 'email', message: 'Invalid email' },
      { ref: 'message', message: 'This field is required' },
    ]
    expect(describeError({ status: 422, value: { issues } })).toBe('email: Invalid email')
    expect(describeError({ status: 422, value: { issues: [] } })).toBe(
      'Something went wrong. Try again.',
    )
  })

  test('reads a plain Error and falls back', () => {
    expect(describeError(new Error('boom'))).toBe('boom')
    expect(describeError({ status: 0 })).toBe('The server cannot be reached.')
    expect(describeError({ status: 500, value: 'oops' })).toBe('Something went wrong. Try again.')
    expect(describeError(null)).toBe('Something went wrong. Try again.')
  })
})
