type DiaryLogoProps = {
  className?: string
}

export function DiaryLogo({ className = '' }: DiaryLogoProps) {
  return (
    <span className={`diary-logo ${className}`.trim()} aria-hidden="true">
      <svg viewBox="0 0 64 64" role="img">
        <rect x="14" y="12" width="34" height="42" rx="6" />
        <path d="M22 21h18M22 29h13M22 37h9" />
        <path className="diary-logo-pencil" d="m35 43 13-13 5 5-13 13-7 2 2-7Z" />
      </svg>
    </span>
  )
}
