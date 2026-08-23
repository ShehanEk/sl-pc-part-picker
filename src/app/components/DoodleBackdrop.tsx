/**
 * Faint line-art wallpaper of the parts this site tracks.
 *
 * Drawn as one tiling <pattern> rather than a raster image so it stays crisp at
 * any density, weighs nothing, and takes its colour from the theme — the same
 * strokes read correctly on the light grey ground and on black.
 *
 * Fixed to the viewport and pointer-events-none, so it never scrolls oddly
 * behind the lists nor intercepts a tap meant for a row.
 */
export function DoodleBackdrop() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 select-none text-label"
      // Opacity is a theme variable rather than a class: dark mode needs a
      // slightly stronger stroke to read the same against black.
      style={{ opacity: 'var(--doodle-opacity)' }}
    >
      <svg className="h-full w-full" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern
            id="pc-parts-doodle"
            x="0"
            y="0"
            width="340"
            height="300"
            patternUnits="userSpaceOnUse"
          >
            <g
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {/* Graphics card — board, shroud, twin fans, PCIe edge */}
              <g transform="translate(14 26) rotate(-8)">
                <rect x="0" y="0" width="104" height="42" rx="4" />
                <path d="M0 34h104" />
                <circle cx="28" cy="19" r="12" />
                <circle cx="28" cy="19" r="3" />
                <circle cx="70" cy="19" r="12" />
                <circle cx="70" cy="19" r="3" />
                <path d="M8 42v6M24 42v6M40 42v6M56 42v6" />
                <path d="M104 6h9v12h-9" />
              </g>

              {/* CPU — package, die, orientation notch, pad hint */}
              <g transform="translate(170 18) rotate(10)">
                <rect x="0" y="0" width="46" height="46" rx="4" />
                <rect x="11" y="11" width="24" height="24" rx="2" />
                <path d="M0 9 9 0" />
                <path d="M6 46v5M16 46v5M26 46v5M36 46v5" />
              </g>

              {/* Memory module — heatspreader, notch, chips */}
              <g transform="translate(238 74) rotate(-4)">
                <rect x="0" y="0" width="96" height="26" rx="3" />
                <rect x="9" y="7" width="15" height="12" />
                <rect x="30" y="7" width="15" height="12" />
                <rect x="51" y="7" width="15" height="12" />
                <rect x="72" y="7" width="15" height="12" />
                <path d="M0 26h34l4 5h16l4-5h38" />
              </g>

              {/* Case fan — frame, hub, blades */}
              <g transform="translate(24 122) rotate(6)">
                <rect x="0" y="0" width="60" height="60" rx="8" />
                <circle cx="30" cy="30" r="25" />
                <circle cx="30" cy="30" r="7" />
                <path d="M30 5a25 25 0 0 1 20 12M55 30a25 25 0 0 1-12 21M30 55a25 25 0 0 1-20-12M5 30a25 25 0 0 1 12-21" />
              </g>

              {/* Power supply — chassis, intake fan, vents, tail of cable */}
              <g transform="translate(116 140) rotate(-5)">
                <rect x="0" y="0" width="86" height="54" rx="4" />
                <circle cx="34" cy="27" r="19" />
                <circle cx="34" cy="27" r="4" />
                <path d="M64 12h14M64 20h14M64 28h14M64 36h14" />
                <path d="M86 44c12 2 16 10 28 8" />
              </g>

              {/* Motherboard — socket, memory slots, expansion slot, capacitors */}
              <g transform="translate(228 154) rotate(4)">
                <rect x="0" y="0" width="94" height="86" rx="4" />
                <rect x="10" y="10" width="30" height="30" rx="2" />
                <path d="M52 8v34M60 8v34M68 8v34M76 8v34" />
                <rect x="10" y="56" width="66" height="7" rx="2" />
                <rect x="10" y="70" width="46" height="7" rx="2" />
                <circle cx="86" cy="20" r="4" />
                <circle cx="86" cy="34" r="4" />
              </g>

              {/* M.2 drive — board, notch, controller */}
              <g transform="translate(20 216) rotate(-3)">
                <rect x="0" y="0" width="78" height="18" rx="2" />
                <rect x="10" y="4" width="20" height="10" />
                <rect x="38" y="4" width="20" height="10" />
                <path d="M70 0v18" />
              </g>

              {/* Power connector — the 8-pin the compatibility rule cares about */}
              <g transform="translate(128 224) rotate(8)">
                <rect x="0" y="0" width="52" height="22" rx="3" />
                <path d="M13 0v22M26 0v22M39 0v22M0 11h52" />
              </g>
            </g>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#pc-parts-doodle)" />
      </svg>
    </div>
  )
}
