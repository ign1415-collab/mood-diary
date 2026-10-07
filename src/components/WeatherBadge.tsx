import { useCallback, useEffect, useState } from 'react'
import type { WeatherSnapshot } from '../types'

type WeatherState =
  | { status: 'loading' }
  | { status: 'ready'; weather: WeatherSnapshot }
  | { status: 'missing-key' }
  | { status: 'location-error' }
  | { status: 'api-error' }

type OpenWeatherResponse = {
  name?: string
  main?: { temp?: number }
  weather?: Array<{ id?: number; icon?: string; description?: string }>
}

type ReverseGeocodeResult = Array<{
  name?: string
  local_names?: { ko?: string }
}>

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
    const apiKey = import.meta.env.VITE_OPENWEATHERMAP_API_KEY?.trim()
    if (!apiKey) {
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
      const params = new URLSearchParams({
        lat: String(position.coords.latitude),
        lon: String(position.coords.longitude),
        appid: apiKey,
        units: 'metric',
        lang: 'kr',
      })
      const geocodeParams = new URLSearchParams({
        lat: String(position.coords.latitude),
        lon: String(position.coords.longitude),
        limit: '1',
        appid: apiKey,
      })
      const [response, geocodeResponse] = await Promise.all([
        fetch(`https://api.openweathermap.org/data/2.5/weather?${params}`),
        fetch(`https://api.openweathermap.org/geo/1.0/reverse?${geocodeParams}`),
      ])
      if (!response.ok) throw new Error(`OpenWeatherMap returned ${response.status}`)

      const data = await response.json() as OpenWeatherResponse
      const geocode = geocodeResponse.ok
        ? await geocodeResponse.json() as ReverseGeocodeResult
        : []
      const condition = data.weather?.[0]
      if (typeof data.main?.temp !== 'number' || typeof condition?.id !== 'number') {
        throw new Error('Weather response is incomplete.')
      }

      const weather: WeatherSnapshot = {
        temperature: Math.round(data.main.temp),
        description: condition.description ?? '현재 날씨',
        location: geocode[0]?.local_names?.ko ?? geocode[0]?.name ?? data.name ?? '현재 위치',
        icon: weatherEmoji(condition.id, condition.icon ?? ''),
        observed_at: new Date().toISOString(),
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
      ? '.env.local에 OpenWeatherMap API 키를 입력해 주세요.'
      : state.status === 'location-error'
        ? '현재 날씨를 보려면 위치 권한을 허용해 주세요.'
        : state.status === 'api-error'
          ? '날씨를 불러오지 못했습니다. API 키와 네트워크를 확인해 주세요.'
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
