/** Crossed cleavers — the copper motif from the Jovanne’s Meat Shop sign. Decorative only. */
export function Cleavers({ className }: { className?: string }) {
  const cleaver = (
    <>
      {/* blade */}
      <path d="M28 70h92a6 6 0 0 1 6 6v46a6 6 0 0 1-6 6H40c-8 0-14-6-14-14V76a6 6 0 0 1 2-6z" fill="currentColor" />
      {/* cutting-edge shine */}
      <path d="M34 122h86" stroke="#fff" strokeOpacity=".35" strokeWidth="3" strokeLinecap="round" />
      {/* hanging hole */}
      <circle cx="44" cy="86" r="6" fill="#2a2322" />
      {/* handle */}
      <rect x="124" y="74" width="58" height="16" rx="8" fill="currentColor" fillOpacity=".75" />
      <circle cx="142" cy="82" r="2.5" fill="#2a2322" />
      <circle cx="162" cy="82" r="2.5" fill="#2a2322" />
    </>
  );
  return (
    <svg viewBox="0 0 200 200" className={className} aria-hidden="true" focusable="false">
      <g transform="rotate(-38 100 100)">{cleaver}</g>
      <g transform="translate(200 0) scale(-1 1) rotate(-38 100 100)">{cleaver}</g>
    </svg>
  );
}
