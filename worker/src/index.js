const CACHE_SECONDS = 600

function allowedOrigin(request, env) {
  const origin = request.headers.get('Origin')
  if (!origin) return null
  const allowed = (env.ALLOWED_ORIGINS ?? '').split(',').map((value) => value.trim())
  return allowed.includes(origin) ? origin : false
}

function corsHeaders(origin) {
  return origin ? {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  } : {}
}

function jsonResponse(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...corsHeaders(origin),
    },
  })
}

async function verifyFirebaseUser(request, env) {
  const authorization = request.headers.get('Authorization') ?? ''
  if (!authorization.startsWith('Bearer ')) return false
  const idToken = authorization.slice('Bearer '.length)
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${env.FIREBASE_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  })
  if (!response.ok) return false
  const result = await response.json()
  return Boolean(result.users?.[0]?.localId)
}

function coordinate(value, minimum, maximum) {
  const number = Number(value)
  return Number.isFinite(number) && number >= minimum && number <= maximum ? number : null
}

export default {
  async fetch(request, env, context) {
    const origin = allowedOrigin(request, env)
    if (origin === false) return jsonResponse({ error: '허용되지 않은 사이트입니다.' }, 403, null)

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) })
    }

    const url = new URL(request.url)
    if (request.method !== 'GET' || url.pathname !== '/weather') {
      return jsonResponse({ error: '찾을 수 없는 주소입니다.' }, 404, origin)
    }

    if (!await verifyFirebaseUser(request, env)) {
      return jsonResponse({ error: '로그인이 필요합니다.' }, 401, origin)
    }

    const latitude = coordinate(url.searchParams.get('lat'), -90, 90)
    const longitude = coordinate(url.searchParams.get('lon'), -180, 180)
    if (latitude === null || longitude === null) {
      return jsonResponse({ error: '위치가 올바르지 않습니다.' }, 400, origin)
    }

    const cacheKey = new Request(`https://weather-cache.invalid/${latitude.toFixed(2)}/${longitude.toFixed(2)}`)
    const cached = await caches.default.match(cacheKey)
    if (cached) {
      return new Response(cached.body, { status: cached.status, headers: { ...Object.fromEntries(cached.headers), ...corsHeaders(origin) } })
    }

    const weatherParams = new URLSearchParams({
      lat: String(latitude),
      lon: String(longitude),
      appid: env.OPENWEATHER_API_KEY,
      units: 'metric',
      lang: 'kr',
    })
    const geocodeParams = new URLSearchParams({
      lat: String(latitude),
      lon: String(longitude),
      limit: '1',
      appid: env.OPENWEATHER_API_KEY,
    })

    const [weatherResponse, geocodeResponse] = await Promise.all([
      fetch(`https://api.openweathermap.org/data/2.5/weather?${weatherParams}`),
      fetch(`https://api.openweathermap.org/geo/1.0/reverse?${geocodeParams}`),
    ])
    if (!weatherResponse.ok) return jsonResponse({ error: '날씨를 불러오지 못했습니다.' }, 502, origin)

    const weather = await weatherResponse.json()
    const geocode = geocodeResponse.ok ? await geocodeResponse.json() : []
    const condition = weather.weather?.[0]
    if (typeof weather.main?.temp !== 'number' || typeof condition?.id !== 'number') {
      return jsonResponse({ error: '날씨 응답이 올바르지 않습니다.' }, 502, origin)
    }

    const payload = {
      temperature: Math.round(weather.main.temp),
      description: condition.description ?? '현재 날씨',
      location: geocode[0]?.local_names?.ko ?? geocode[0]?.name ?? weather.name ?? '현재 위치',
      weatherId: condition.id,
      iconCode: condition.icon ?? '',
      observedAt: new Date().toISOString(),
    }
    const cacheResponse = new Response(JSON.stringify(payload), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': `public, max-age=${CACHE_SECONDS}`,
      },
    })
    context.waitUntil(caches.default.put(cacheKey, cacheResponse.clone()))
    return new Response(cacheResponse.body, { headers: { ...Object.fromEntries(cacheResponse.headers), ...corsHeaders(origin) } })
  },
}
