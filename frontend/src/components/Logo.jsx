// TEKNOPLAST rangin (rainbow) to'qilgan olti burchak logotipi.
// 6 ta rangli "chevron" segment markaz atrofida 60° aylantirilib pinwheel hosil qiladi.
export default function Logo({ size = 36, className = '' }) {
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      fill="none"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      aria-label="TEKNOPLAST"
    >
      <g strokeLinecap="round" strokeLinejoin="round" strokeWidth="10">
        <path d="M39.87 19.85 L50 14 L67.93 24.35" stroke="#8b5cf6" />
        <path d="M39.87 19.85 L50 14 L67.93 24.35" stroke="#3b82f6" transform="rotate(60 50 50)" />
        <path d="M39.87 19.85 L50 14 L67.93 24.35" stroke="#06b6d4" transform="rotate(120 50 50)" />
        <path d="M39.87 19.85 L50 14 L67.93 24.35" stroke="#22c55e" transform="rotate(180 50 50)" />
        <path d="M39.87 19.85 L50 14 L67.93 24.35" stroke="#f59e0b" transform="rotate(240 50 50)" />
        <path d="M39.87 19.85 L50 14 L67.93 24.35" stroke="#ef4444" transform="rotate(300 50 50)" />
      </g>
    </svg>
  );
}
