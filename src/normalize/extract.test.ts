import assert from 'node:assert/strict'
import { test } from 'node:test'

import { extractPeripheral } from './extract'

const id = (title: string, shelf?: string) => extractPeripheral(title, shelf)?.partId ?? null

test('peripherals: major brands parse to type, connection and a clean model', () => {
  assert.deepEqual(extractPeripheral('Logitech G304 Lightspeed Wireless Gaming Mouse - Black'), {
    category: 'peripherals',
    partId: 'logitech-g304-lightspeed',
    brand: 'Logitech',
    model: 'G304 Lightspeed',
    peripheralType: 'mouse',
    wireless: true,
  })
  assert.equal(extractPeripheral('SteelSeries Apex Pro Gen 3 Gaming Keyboard')?.peripheralType, 'keyboard')
  assert.equal(extractPeripheral('Logitech F310 Gaming Pad')?.peripheralType, 'gamepad')
  assert.equal(extractPeripheral('Corsair K100 RGB Mechanical Keyboard')?.wireless, false)
})

test('peripherals: colour, switch and "Logitech G" variants share an id', () => {
  assert.equal(id('Logitech G Pro X Superlight 2 Lightspeed Mouse White'), id('LOGITECH PRO X SUPERLIGHT 2 LIGHTSPEED Wireless Mouse Black'))
  assert.equal(id('ASUS ROG Harpe Ace Mini Gaming Mouse'), id('ROG Harpe Ace Mini Mouse'))
  assert.equal(id('Razer BlackWidow V4 X Mechanical Gaming Keyboard (Green Switch)'), 'razer-blackwidow-v4-x')
  assert.notEqual(id('Logitech G Pro X Superlight 2 Mouse'), id('Logitech G Pro X Superlight Mouse'))
  assert.equal(id('Asus TUF K3 GEN II Mechanichal Gaming Keyboard'), 'asus-tuf-k3-gen-ii')
})

test('peripherals: a wireless version is its own product unless a named radio says so', () => {
  assert.equal(id('Corsair KATAR Pro Ultra-Light Wired Gaming Mouse'), 'corsair-katar-pro')
  assert.equal(id('Corsair KATAR Pro Wireless Gaming Mouse'), 'corsair-katar-pro-wireless')
})

test('peripherals: the shop shelf supplies the type when the title does not', () => {
  assert.equal(id('Razer Viper V3 Pro'), null)
  assert.equal(extractPeripheral('Razer Viper V3 Pro', 'MOUSE')?.peripheralType, 'mouse')
  assert.equal(
    extractPeripheral('Logitech G413 SE', 'Mouse, Keyboard & Combo > Keyboard')?.peripheralType,
    'keyboard',
  )
})

test('peripherals: console controllers keep their model name', () => {
  assert.equal(id('Sony PS5 DualSense Wireless Controller - Midnight Black'), 'playstation-dualsense')
  assert.equal(id('DualSense Edge Wireless Controller'), 'playstation-dualsense-edge')
  assert.equal(id('Xbox Wireless Controller - Carbon Black'), 'xbox-wireless-controller')
})

test('peripherals: other brands, accessories and combos are dropped', () => {
  for (const title of [
    'Fantech X9 Thor Gaming Mouse',
    'PXN P5 Wireless Controller for PC / Xbox / PS4',
    'Logitech MK220 Wireless Keyboard and Mouse Combo',
    'Logitech G840 XL Gaming Mouse Pad',
    'Logitech G29 Driving Force Racing Wheel',
    'Razer Mouse Bungee V3',
    'Logitech Unifying Receiver',
    'Corsair PBT Double-shot Keycaps',
  ]) {
    assert.equal(extractPeripheral(title), null, title)
  }
  assert.ok(extractPeripheral('Logitech M185 Wireless Mouse with Nano Receiver'))
})

test('peripherals: shop paths and ASUS part codes', () => {
  assert.equal(
    extractPeripheral('Logitech MX Anywhere 3S - Pale Grey', 'Peripherals / Mouse / Office Wireless')
      ?.peripheralType,
    'mouse',
  )
  assert.equal(id('ASUS P309 TUF Gaming M3 Gen II Mouse'), id('Asus TUF M3 GEN II Gaming Mouse'))
})

test('peripherals: a shelf naming every type is no hint', () => {
  assert.equal(extractPeripheral('Logitech MX Master 4', 'keyboardmouse-gamepad-controller'), null)
})
