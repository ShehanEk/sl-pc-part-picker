import assert from 'node:assert/strict'
import { test } from 'node:test'

import { pageStock } from './winsoft'

/** The markup as served on 2026-11-05. */
const priceBlock = (label: string) => `
  <div class="ty-product-page-price-holder">
    <div class="ty-product-page-price-message">
      <span class="ty-stock-msg">${label}</span>
    </div>
  </div>`

test('reads the stock label in the product price block', () => {
  assert.equal(pageStock(priceBlock('In Stock')), true)
  assert.equal(pageStock(priceBlock('Out of Stock')), false)
})

test('casing and spacing do not change the answer', () => {
  assert.equal(pageStock(priceBlock('  IN STOCK ')), true)
  assert.equal(pageStock(priceBlock('out of stock')), false)
})

test('any other label is not a promise of stock', () => {
  assert.equal(pageStock(priceBlock('Pre Order')), false)
})

test('a label on another product card is ignored', () => {
  assert.equal(pageStock('<div class="card"><span class="ty-stock-msg">In Stock</span></div>'), null)
})

test('a page with no label or an empty one is unknown', () => {
  assert.equal(pageStock('<h1>Corsair</h1>'), null)
  assert.equal(pageStock(priceBlock('')), null)
})
