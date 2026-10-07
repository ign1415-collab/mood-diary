import { useCallback, useEffect, useState } from 'react'
import { auth } from '../firebase'
import type { WeatherSnapshot } from '../types'

type WeatherState =
  | { status: 'loading' }
  | { status: 'ready'; weather: WeatherSnapshot }
  | { status: 'missing-key' }
  | { status: 'location-error' }
  | { status: 'api-error' }

type OpenWeatherResponse = {
  temperature?: number
  description?: string
  location?: string
  weatherId?: number
  iconCode?: string
  observedAt?: string
}

function weatherEmoji(id: number, iconCode: string) {
  if (id >= 200 && id < 300) return '⛈️'
  if (id >= 300 && id < 600) return '🌧️'
  if (id >= 600 && id < 700) return '🌨️'
  if (id >= 700 && id < 800) return '🌫️'
  if (id === 800) return iconCode.endsWith('n') ? '🌙' : '☀️'
  if (id > 800) return '☁️'
  return '🌤️'
}

function currentPosition() {
  return new Promise<GeolocationPosition>((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported.'))
      return
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: false,
      maximumAge: 10 * 60 * 1000,
      timeout: 10_000,
    })
  })
}

type Props = {
  onWeatherChange: (weather: WeatherSnapshot | null) => void
}

export function WeatherBadge({ onWeatherChange }: Props) {
  const [state, setState] = useState<WeatherState>({ status: 'loading' })

  const loadWeather = useCallback(async () => {
    const endpoint = import.meta.env.VITE_WEATHER_API_URL?.trim()
    if (!endpoint) {
      setState({ status: 'missing-key' })
      onWeatherChange(null)
      return
    }

    setState({ status: 'loading' })
    let position: GeolocationPosition
    try {
      position = await currentPosition()
    } catch {
      setState({ status: 'location-error' })
      onWeatherChange(null)
      return
    }

    try {
      const user = auth?.currentUser
      if (!user) throw new Error('Firebase user is unavailable.')
      const url = new URL(endpoint)
      url.searchParams.set('lat', String(position.coords.latitude))
      url.searchParams.set('lon', String(position.coords.longitude))
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${await user.getIdToken()}` },
      })
      if (!response.ok) throw new Error(`Weather worker returned ${response.status}`)

      const data = await response.json() as OpenWeatherResponse
      if (typeof data.temperature !== 'number' || typeof data.weatherId !== 'number') {
        throw new Error('Weather response is incomplete.')
      }

      const weather: WeatherSnapshot = {
        temperature: data.temperature,
        description: data.description ?? '현재 날씨',
        location: data.location ?? '현재 위치',
        icon: weatherEmoji(data.weatherId, data.iconCode ?? ''),
        observed_at: data.observedAt ?? new Date().toISOString(),
      }
      setState({ status: 'ready', weather })
      onWeatherChange(weather)
    } catch {
      setState({ status: 'api-error' })
      onWeatherChange(null)
    }
  }, [onWeatherChange])

  useEffect(() => { void loadWeather() }, [loadWeather])

  const content = state.status === 'ready'
    ? `${state.weather.icon} ${state.weather.temperature}°`
    : state.status === 'loading'
      ? '날씨…'
      : state.status === 'missing-key'
        ? '날씨 설정'
        : state.status === 'location-error'
          ? '위치 허용'
          : '날씨 재시도'

  const title = state.status === 'ready'
    ? `${state.weather.location} · ${state.weather.description} · ${state.weather.temperature}°C · 눌러서 새로고침`
    : state.status === 'missing-key'
      ? '날씨 서버 주소가 설정되지 않았습니다.'
      : state.status === 'location-error'
        ? '현재 날씨를 보려면 위치 권한을 허용해 주세요.'
        : state.status === 'api-error'
          ? '날씨를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.'
          : '현재 위치의 날씨를 불러오는 중입니다.'

  return (
    <button
      type="button"
      className={`weather-button ${state.status === 'ready' ? 'ready' : ''}`}
      onClick={() => void loadWeather()}
      disabled={state.status === 'loading'}
      title={title}
      aria-label={title}
    >
      {content}
    </button>
  )
}
