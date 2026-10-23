import assert from 'node:assert/strict'
import { test } from 'node:test'

import { extractConsole, extractLaptop, extractPeripheral } from './extract'

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

test('laptops: a full config parses, and the maker code is the id when present', () => {
  const loq = extractLaptop(
    'Lenovo LOQ 15AHP11 AMD Ryzen 7 250 | RTX 5050, 8GB GDDR6 | 16GB DDR5 5600MHz | 512GB M.2 NVMe SSD | 15.3" Inch IPS 165Hz Display',
  )
  assert.equal(loq?.partId, 'lenovo-loq-15ahp11-ryzen-7-250-rtx-5050-16gb-512gb')
  assert.equal(loq?.memoryGb, 16, '8GB GDDR6 is video memory')
  assert.equal(
    extractLaptop('ASUS TUF Gaming A15, FA506NCG-HN332WS, AMD Ryzen 7 8845HS Processor, 16GB RAM, 512GB SSD')?.partId,
    'asus-fa506ncg-hn332ws',
  )
  assert.equal(extractLaptop('APPLE MACBOOK AIR M5 13" 16GB 512GB')?.storageGb, 512)
})

test('laptops: a SKU glued to an i7 is not the processor', () => {
  assert.equal(
    extractLaptop('ASUS EXPERTBOOK B1503CVA-I716512G5D | i7-1355U | 16GB DDR5 | 512GB NVMe')?.cpuModel,
    'Core i7-1355U',
  )
})

test('laptops: no code and no full config, used machines and Mac minis are dropped', () => {
  for (const title of [
    'ASUS TUF Gaming A16 FA608PM Ryzen 9 RTX 5060',
    'DELL LATITUDE 5510 15.6" INTEL CORE I7 10TH GEN 16GB RAM 256GB NVME SSD LAPTOP (USED ITEM)',
    'APPLE MAC MINI M5 PRO 24GB 512GB',
    'Chuwi CoreBook CW1575 Intel Core I3 10100Y | 8GB DDR3 | 256GB SSD',
  ]) {
    assert.equal(extractLaptop(title), null, title)
  }
})

test('consoles: one model however the title words it, shelf-mates dropped', () => {
  assert.equal(extractConsole('PLAYSTATION 5 SLIM 1TB DISK EDITION CONSOLE')?.partId, 'playstation-5-slim-disc-1tb')
  assert.equal(extractConsole('Sony PlayStation 5 DISC Slim Edition 1TB (PS5)')?.partId, 'playstation-5-slim-disc-1tb')
  assert.equal(extractConsole('Sony PlayStation 5 Pro - 2TB(PS5)')?.partId, 'playstation-5-pro')
  assert.equal(extractConsole('MSI Claw - A1M 14TH GEN ARC Graphics Handheld Console')?.consoleType, 'handheld')
  for (const title of ['PLAYSTATION 5 DUALSENSE WIRELESS CONTROLLER', 'XBOX Wireless Headset', 'Porodo Gaming PS5 Slim Cooling Station']) {
    assert.equal(extractConsole(title), null, title)
  }
})

test('laptops: slash-separated specs and odd dashes', () => {
  const vivo = extractLaptop("ASUS VIVOBOOK 15 OLED M513UA AMD RYZEN 5 8GB/512GB/15.6'' WIN 11")
  assert.equal(vivo?.memoryGb, 8)
  assert.equal(vivo?.storageGb, 512)
  assert.equal(extractLaptop('ASUS ROG STRIX G16 G615JPR‑S5035WS | i9-14900HX | 16GB | 1TB')?.makerCode, 'G615JPR-S5035WS')
})

test('consoles: dashes, brackets, bundles and Steam Machine', () => {
  assert.equal(extractConsole('Nintendo Switch – OLED Model')?.partId, 'nintendo-switch-oled')
  assert.equal(
    extractConsole('PlayStation 5 Console – Ghost of Yotei Gold Limited Edition Bundle (Slim)')?.partId,
    'playstation-5-slim-bundle',
  )
  assert.equal(extractConsole('Nintendo Switch 2 + Mario Kart World Bundle')?.partId, 'nintendo-switch-2-bundle')
  assert.equal(extractConsole('Steam Deck Steam Machine')?.partId, 'steam-machine')
  assert.equal(extractConsole('MSI Claw A8 BZ2EM')?.partId, 'claw-a8')
})

test('peripherals: a "Controllers" shelf types a controller with no type in its name', () => {
  assert.equal(extractPeripheral('Razer Wolverine V3 Pro 8K PC', 'Accessories, Controllers, PC')?.peripheralType, 'gamepad')
})
