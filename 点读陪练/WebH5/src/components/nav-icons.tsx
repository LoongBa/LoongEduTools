// 导航与功能图标：圆润线条，贴合儿童向调性（避免通用图标堆砌感）
export function HomeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M3.6 10.8 12 4l8.4 6.8V19a1.6 1.6 0 0 1-1.6 1.6H5.2A1.6 1.6 0 0 1 3.6 19z" />
      <path d="M9.6 20.6v-6h4.8v6" />
    </svg>
  );
}

export function BookIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M12 6.4C10.4 5 8.4 4.4 4.4 4.4v13c4 0 6 .6 7.6 2 1.6-1.4 3.6-2 7.6-2v-13c-4 0-6-.6-7.6 2z" />
      <path d="M12 6.4v13" />
    </svg>
  );
}

export function MusicIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <circle cx="7" cy="17.4" r="2.6" />
      <circle cx="17.4" cy="15" r="2.6" />
      <path d="M9.6 17.4V7.2l10.4-2.2V15" />
    </svg>
  );
}

export function UserIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <circle cx="12" cy="8" r="3.8" />
      <path d="M4.6 20.4a7.4 7.4 0 0 1 14.8 0" />
    </svg>
  );
}

export function PlayIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M8.4 5.6a1.2 1.2 0 0 1 1.83-1.02l8.2 5.4a1.2 1.2 0 0 1 0 2.04l-8.2 5.4a1.2 1.2 0 0 1-1.83-1.02z" transform="translate(-1.5 1)" />
    </svg>
  );
}

export function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M12 3.4 5 6v5.6c0 4 2.9 7.4 7 9 4.1-1.6 7-5 7-9V6z" />
      <path d="m9 12 2.2 2.2L15.4 10" />
    </svg>
  );
}

export function RepeatIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M4.4 10.4A7.6 7.6 0 0 1 18 7.4M19.6 13.6a7.6 7.6 0 0 1-13.6 3" />
      <path d="M18.4 3.6v3.9h-3.9M5.6 20.4v-3.9h3.9" />
    </svg>
  );
}

export function LeafIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M20 4C9.5 4 4 9 4 15.5c0 1.6.5 3 1.3 4.2C7 13 11.5 9.5 17 8.5" />
      <path d="M5.3 19.7C11 20.5 17 17 19 11.5" />
    </svg>
  );
}
