export function ConnectSphereMark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" fill="none" className={className} aria-hidden>
      <defs>
        <linearGradient id="cs-bg" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#120E24" />
          <stop offset="55%" stopColor="#23194D" />
          <stop offset="100%" stopColor="#0E2A3A" />
        </linearGradient>
        <linearGradient id="cs-orb" x1="12" y1="12" x2="52" y2="52" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#7C5CFF" />
          <stop offset="55%" stopColor="#4F7BFF" />
          <stop offset="100%" stopColor="#22D3EE" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="url(#cs-bg)" />
      <path d="M49.5 23.5A19.5 19.5 0 1 0 49.5 40.5" stroke="url(#cs-orb)" strokeWidth="4" strokeLinecap="round" />
      <ellipse cx="32" cy="32" rx="16" ry="7" transform="rotate(-35 32 32)" stroke="url(#cs-orb)" strokeWidth="2.4" strokeOpacity="0.85" />
      <ellipse cx="32" cy="32" rx="16" ry="7" transform="rotate(35 32 32)" stroke="url(#cs-orb)" strokeWidth="2.4" strokeOpacity="0.85" />
      <circle cx="32" cy="32" r="4.6" fill="url(#cs-orb)" />
      <circle cx="47" cy="24" r="2.4" fill="#22D3EE" />
      <circle cx="19" cy="21" r="2.4" fill="#22D3EE" />
      <circle cx="21" cy="44" r="2.4" fill="#22D3EE" />
    </svg>
  );
}
