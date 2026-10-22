import type { ComponentType, SVGProps } from 'react'
import type { Category } from '@/lib/site'


/**
 * Line-art icons for the part categories.
 *
 * Drawn on a shared 24px grid with a single stroke weight so a row of them
 * reads as one set. They inherit colour from the tile via `currentColor`.
 */

type IconProps = SVGProps<SVGSVGElement>

function Icon({ children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      {children}
    </svg>
  )
}

/** Processor: pinned square with a traced die. */
export function CpuIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="6" y="6" width="12" height="12" rx="1.6" />
      <rect x="9.2" y="9.2" width="5.6" height="5.6" rx="0.9" />
      <path d="M9 6V3.2M12 6V3.2M15 6V3.2M9 18v2.8M12 18v2.8M15 18v2.8M6 9H3.2M6 12H3.2M6 15H3.2M18 9h2.8M18 12h2.8M18 15h2.8" />
    </Icon>
  )
}

/** Motherboard: memory slots, socket, and expansion slots. */
export function MotherboardIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3.2" y="3.2" width="17.6" height="17.6" rx="1.2" />
      <path d="M6.6 5.9v6.5M9.6 5.9v6.5" />
      <rect x="13.1" y="5.9" width="5.4" height="5.4" rx="0.8" />
      <path d="M6.1 15.7h12.4M6.1 18.2h7.4" />
    </Icon>
  )
}

/** Memory: a DIMM with its chips and contact edge. */
export function RamIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="2.4" y="7.4" width="19.2" height="9.2" rx="1" />
      <path d="M5.2 10.2v3.6M8.4 10.2v3.6M11.6 10.2v3.6M14.8 10.2v3.6M18 10.2v3.6" />
      <path d="M4.6 18.6h5.6M13.8 18.6h5.6" />
    </Icon>
  )
}

/** Graphics card: twin fans, bracket, and the PCIe edge. */
export function GpuIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M2.6 5.2v13.6" />
      <rect x="4.2" y="6.6" width="16.4" height="8.8" rx="1" />
      <circle cx="9" cy="11" r="2.5" />
      <circle cx="15.6" cy="11" r="2.5" />
      <path d="M7 15.4v2.1M9.4 15.4v2.1M11.8 15.4v2.1M15.4 15.4v2.1M17.8 15.4v2.1" />
    </Icon>
  )
}

/** Drive: platter, spindle, and actuator arm. */
export function StorageIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="4.4" y="2.6" width="15.2" height="18.8" rx="1.6" />
      <circle cx="12" cy="10.4" r="5.2" />
      <circle cx="12" cy="10.4" r="1.5" />
      <path d="m7.6 17.6 3.6-5" />
      <path d="M15 19.3v-2M16.6 19.3v-2M18.2 19.3v-2" />
    </Icon>
  )
}

/** Power supply: chamfered shell, fan grille, inlet, and switch. */
export function PsuIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 8.4 5.6 3.9h12.8L21 8.4" />
      <rect x="3" y="8.4" width="18" height="11.7" rx="1.2" />
      <circle cx="14.9" cy="14.2" r="4" />
      <circle cx="14.9" cy="14.2" r="1.2" />
      <rect x="5.2" y="10.4" width="4.6" height="3.1" rx="0.8" />
      <rect x="5.2" y="15.4" width="4.6" height="2.7" rx="0.7" />
    </Icon>
  )
}

/** Case: tower with drive bays, power button, and feet. */
export function CaseIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="6" y="2.4" width="12" height="18" rx="1.6" />
      <path d="M8.8 6.2h6.4M8.8 8.8h6.4" />
      <circle cx="12" cy="15.6" r="0.9" />
      <path d="M8.6 20.4v1.4M15.4 20.4v1.4" />
    </Icon>
  )
}

/** Peripherals: a keyboard beside a corded mouse. */
export function PeripheralsIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="1.8" y="10" width="13.4" height="8.2" rx="1.2" />
      <path d="M4.4 12.9h.6M7.1 12.9h.6M9.8 12.9h.6M12.5 12.9h.6M5.4 15.6h6.2" />
      <rect x="16.6" y="8.4" width="5.6" height="9.8" rx="2.8" />
      <path d="M19.4 8.4v3M19.4 8.4c0-2.2-1.4-3.2-3.2-3.2" />
    </Icon>
  )
}

/** Laptop: an open lid on its base. */
export function LaptopIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4.6 15V6.3a1.1 1.1 0 0 1 1.1-1.1h12.6a1.1 1.1 0 0 1 1.1 1.1V15" />
      <path d="M2.4 15h19.2l-1 2.5a1.2 1.2 0 0 1-1.1.8h-15a1.2 1.2 0 0 1-1.1-.8z" />
      <path d="M10.4 16.6h3.2" />
    </Icon>
  )
}

/** Console: a gamepad, d-pad and two buttons. */
export function ConsoleIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M7.2 7h9.6a4.4 4.4 0 0 1 4.3 3.5l1 4.9a2.6 2.6 0 0 1-4.5 2.3L15.8 16H8.2l-1.8 1.7a2.6 2.6 0 0 1-4.5-2.3l1-4.9A4.4 4.4 0 0 1 7.2 7z" />
      <path d="M7.3 9.9v3.4M5.6 11.6H9" />
      <circle cx="16" cy="10.6" r=".7" />
      <circle cx="17.8" cy="12.6" r=".7" />
    </Icon>
  )
}

/**
 * One colour per category, used everywhere a category appears: the home page
 * tiles, the category pills, part pages and the builder. Hues are spaced round
 * the wheel at matched lightness, so no category reads as louder than another.
 *
 * `strong` is the darker shade for white text on a filled pill, or for small
 * coloured text, where `ink` would fall short of 4.5:1.
 */
export const CATEGORY_STYLE: Record<
  Category,
  { Icon: ComponentType<IconProps>; tint: string; ink: string; strong: string }
> = {
  gpu: { Icon: GpuIcon, tint: 'oklch(0.95 0.035 160)', ink: 'oklch(0.53 0.12 160)', strong: 'oklch(0.47 0.11 160)' },
  cpu: { Icon: CpuIcon, tint: 'oklch(0.95 0.03 265)', ink: 'oklch(0.52 0.17 265)', strong: 'oklch(0.47 0.17 265)' },
  motherboard: { Icon: MotherboardIcon, tint: 'oklch(0.95 0.03 215)', ink: 'oklch(0.52 0.1 215)', strong: 'oklch(0.46 0.09 215)' },
  ram: { Icon: RamIcon, tint: 'oklch(0.95 0.035 315)', ink: 'oklch(0.52 0.17 315)', strong: 'oklch(0.47 0.16 315)' },
  storage: { Icon: StorageIcon, tint: 'oklch(0.95 0.045 70)', ink: 'oklch(0.6 0.14 70)', strong: 'oklch(0.5 0.12 70)' },
  psu: { Icon: PsuIcon, tint: 'oklch(0.95 0.035 25)', ink: 'oklch(0.55 0.18 25)', strong: 'oklch(0.48 0.17 25)' },
  case: { Icon: CaseIcon, tint: 'oklch(0.95 0.045 115)', ink: 'oklch(0.55 0.12 115)', strong: 'oklch(0.46 0.1 115)' },
  peripherals: { Icon: PeripheralsIcon, tint: 'oklch(0.95 0.035 355)', ink: 'oklch(0.53 0.16 355)', strong: 'oklch(0.47 0.15 355)' },
  // Slate: the wheel is full, so laptops stand apart by being nearly grey.
  laptops: { Icon: LaptopIcon, tint: 'oklch(0.95 0.012 250)', ink: 'oklch(0.45 0.06 250)', strong: 'oklch(0.4 0.06 250)' },
  consoles: { Icon: ConsoleIcon, tint: 'oklch(0.95 0.04 45)', ink: 'oklch(0.57 0.15 45)', strong: 'oklch(0.48 0.14 45)' },
}
