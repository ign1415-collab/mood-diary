type Props = {
  description: string
  size?: number
  className?: string
}

export type WeatherKind = 'clear' | 'cloudy' | 'rain' | 'snow'

export function getWeatherKind(description: string): WeatherKind {
  if (/눈|snow/i.test(description)) return 'snow'
  if (/비|소나기|rain|drizzle|thunder/i.test(description)) return 'rain'
  if (/흐림|구름|cloud|mist|fog/i.test(description)) return 'cloudy'
  return 'clear'
}

export function WeatherIcon({ description, size = 16, className = '' }: Props) {
  const kind = getWeatherKind(description)

  return (
    <svg
      className={`weather-icon ${className}`.trim()}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      {kind === 'clear' && (
        <>
          <circle cx="12" cy="12" r="3.5" />
          <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4" />
        </>
      )}
      {kind !== 'clear' && <path d="M7.2 16.5h9.5a3.3 3.3 0 0 0 .4-6.6A5.2 5.2 0 0 0 7.2 8.4a4.1 4.1 0 0 0 0 8.1Z" />}
      {kind === 'rain' && <path d="m8 19-1 2M13 19l-1 2M18 19l-1 2" />}
      {kind === 'snow' && <path d="M8 19v3M6.7 19.8l2.6 1.4M9.3 19.8l-2.6 1.4M16 19v3M14.7 19.8l2.6 1.4M17.3 19.8l-2.6 1.4" />}
    </svg>
  )
}
