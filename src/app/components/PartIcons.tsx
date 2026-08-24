import type { SVGProps } from 'react'

/**
 * Line-art icons for the seven part categories.
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
