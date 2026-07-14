type EngineerWorkspaceIllustrationProps = {
  className?: string;
};

/** Minimal editorial SVG — engineer workspace motif (Taste Skill–style restraint). */
export default function EngineerWorkspaceIllustration({
  className = '',
}: EngineerWorkspaceIllustrationProps) {
  return (
    <svg
      viewBox="0 0 640 720"
      preserveAspectRatio="xMidYMid slice"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      <defs>
        <linearGradient id="ew-sky" x1="0" y1="0" x2="640" y2="720" gradientUnits="userSpaceOnUse">
          <stop stopColor="#0ea5e9" stopOpacity="0.14" />
          <stop offset="0.55" stopColor="#f7f7f5" stopOpacity="0.4" />
          <stop offset="1" stopColor="#6366f1" stopOpacity="0.08" />
        </linearGradient>
        <linearGradient id="ew-screen" x1="140" y1="160" x2="420" y2="400" gradientUnits="userSpaceOnUse">
          <stop stopColor="#18181b" />
          <stop offset="1" stopColor="#27272a" />
        </linearGradient>
        <filter id="ew-soft" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="8" stdDeviation="16" floodColor="#0f172a" floodOpacity="0.08" />
        </filter>
      </defs>

      {/* full-panel wash */}
      <rect width="640" height="720" fill="url(#ew-sky)" />
      <circle cx="560" cy="80" r="120" fill="#0ea5e9" opacity="0.06" />
      <circle cx="60" cy="640" r="160" fill="#6366f1" opacity="0.05" />

      {/* dot grid — edge to edge */}
      {Array.from({ length: 18 }).map((_, row) =>
        Array.from({ length: 16 }).map((__, col) => (
          <circle
            key={`${row}-${col}`}
            cx={24 + col * 40}
            cy={24 + row * 40}
            r="1"
            fill="#a1a1aa"
            opacity="0.28"
          />
        )),
      )}

      {/* blueprint arcs */}
      <path
        d="M 40 620 Q 320 480 600 580"
        stroke="#0ea5e9"
        strokeOpacity="0.18"
        strokeWidth="1.5"
        strokeDasharray="6 8"
      />
      <path
        d="M 80 120 Q 320 220 560 140"
        stroke="#6366f1"
        strokeOpacity="0.12"
        strokeWidth="1.5"
        strokeDasharray="4 10"
      />

      {/* desk surface */}
      <rect x="48" y="468" width="544" height="10" rx="5" fill="#e4e4e7" />
      <rect x="72" y="480" width="496" height="5" rx="2.5" fill="#d4d4d8" opacity="0.55" />

      {/* monitor — scaled for full panel */}
      <g filter="url(#ew-soft)">
        <rect x="96" y="168" width="300" height="204" rx="16" fill="url(#ew-screen)" />
        <rect x="112" y="184" width="268" height="156" rx="10" fill="#09090b" />
        <rect x="112" y="184" width="268" height="32" rx="10" fill="#27272a" />
        <circle cx="130" cy="200" r="5" fill="#ef4444" opacity="0.85" />
        <circle cx="148" cy="200" r="5" fill="#eab308" opacity="0.85" />
        <circle cx="166" cy="200" r="5" fill="#22c55e" opacity="0.85" />
        <rect x="128" y="232" width="88" height="7" rx="3.5" fill="#0ea5e9" opacity="0.9" />
        <rect x="128" y="250" width="152" height="6" rx="3" fill="#52525b" />
        <rect x="148" y="266" width="112" height="6" rx="3" fill="#52525b" />
        <rect x="148" y="282" width="132" height="6" rx="3" fill="#52525b" />
        <rect x="128" y="298" width="76" height="6" rx="3" fill="#38bdf8" opacity="0.7" />
        <rect x="128" y="314" width="124" height="6" rx="3" fill="#52525b" />
        <rect x="228" y="372" width="48" height="44" rx="5" fill="#3f3f46" />
        <rect x="204" y="412" width="96" height="8" rx="4" fill="#52525b" />
      </g>

      {/* resume doc */}
      <g filter="url(#ew-soft)">
        <rect x="432" y="196" width="148" height="188" rx="14" fill="#ffffff" stroke="#e4e4e7" strokeWidth="1" />
        <rect x="452" y="220" width="68" height="7" rx="3.5" fill="#18181b" />
        <rect x="452" y="238" width="108" height="5" rx="2.5" fill="#d4d4d8" />
        <rect x="452" y="252" width="88" height="5" rx="2.5" fill="#d4d4d8" />
        <rect x="452" y="276" width="108" height="5" rx="2.5" fill="#e4e4e7" />
        <rect x="452" y="290" width="80" height="5" rx="2.5" fill="#e4e4e7" />
        <rect x="452" y="314" width="48" height="20" rx="8" fill="#0ea5e9" opacity="0.15" />
        <rect x="460" y="322" width="32" height="5" rx="2.5" fill="#0284c7" />
      </g>

      {/* metrics */}
      <g filter="url(#ew-soft)">
        <rect x="432" y="404" width="148" height="68" rx="14" fill="#ffffff" stroke="#e4e4e7" strokeWidth="1" />
        <polyline
          points="452,448 472,432 492,440 512,418 532,426 552,412 568,418"
          stroke="#0ea5e9"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        <circle cx="568" cy="418" r="4" fill="#0ea5e9" />
      </g>

      {/* keyboard */}
      <rect x="136" y="492" width="204" height="24" rx="10" fill="#f4f4f5" stroke="#e4e4e7" strokeWidth="1" />
      {Array.from({ length: 9 }).map((_, i) => (
        <rect
          key={i}
          x={150 + i * 20}
          y={500}
          width="14"
          height="10"
          rx="2.5"
          fill="#d4d4d8"
          opacity={i === 3 ? 1 : 0.65}
        />
      ))}

      {/* status badge */}
      <g filter="url(#ew-soft)">
        <rect x="72" y="108" width="128" height="38" rx="19" fill="#ffffff" stroke="#e4e4e7" strokeWidth="1" />
        <circle cx="94" cy="127" r="7" fill="#22c55e" opacity="0.2" />
        <circle cx="94" cy="127" r="3.5" fill="#16a34a" />
        <rect x="110" y="122" width="68" height="6" rx="3" fill="#71717a" />
        <rect x="110" y="132" width="48" height="5" rx="2.5" fill="#d4d4d8" />
      </g>

      {/* connectors */}
      <circle cx="396" cy="280" r="6" fill="#0ea5e9" opacity="0.22" />
      <circle cx="396" cy="280" r="3" fill="#0284c7" />
      <path d="M 402 280 H 428" stroke="#0ea5e9" strokeOpacity="0.35" strokeWidth="1.5" strokeDasharray="3 4" />
    </svg>
  );
}
