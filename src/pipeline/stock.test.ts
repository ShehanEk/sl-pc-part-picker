import assert from 'node:assert/strict'
import { test } from 'node:test'

import { resolveStock } from './stock'

test('a reported status wins over the last known one', () => {
  assert.equal(resolveStock(true, false), true)
  assert.equal(resolveStock(false, true), false)
})

test('an unknown status keeps the last known one', () => {
  assert.equal(resolveStock(null, true), true)
  assert.equal(resolveStock(null, false), false)
  assert.equal(resolveStock(undefined, false), false)
})

test('an unknown status on a new listing is not claimed as in stock', () => {
  assert.equal(resolveStock(null, undefined), false)
})
