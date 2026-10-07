# MOOD DIARY

Google 계정으로 로그인해 하루에 한 번 네 가지 감정 중 하나와 300자 이내의 메모를 기록하는 웹서비스입니다. 기록은 사용자별로 분리되어 Cloud Firestore 서울 리전에 저장됩니다.

## 실행 방법

Node.js 24 이상이 필요합니다.

```powershell
npm install
npm run dev
```

개발 화면은 `http://localhost:5173`에서 열립니다. 완성된 빌드를 로컬에서 실행하려면 다음 명령을 사용합니다.

```powershell
npm run build
npm start
```

그다음 `http://localhost:3001`을 엽니다.

## Firebase 구성

- 프로젝트: `mood-diary-ign1415`
- 인증: 모든 Google 계정
- 데이터베이스: Cloud Firestore, `asia-northeast3`(서울), 무료 Spark 요금제
- 데이터 경로: `users/{uid}/diaries/{generationId}/entries/{YYYY-MM-DD}`
- 실제 연결 정보는 Git에 포함되지 않는 `.env.local`에 저장됩니다.
- 새 PC에서는 `.env.example`을 `.env.local`로 복사한 뒤 Firebase 웹앱 설정값을 입력합니다.
- `firestore.rules`는 로그인한 사용자가 자신의 UID 경로에만 접근하도록 제한합니다.

## 날씨 구성

상단 날씨는 브라우저에서 허용한 현재 위치를 사용해 OpenWeatherMap의 현재 날씨를 표시합니다. 브라우저는 OpenWeatherMap을 직접 호출하지 않고 Cloudflare Worker를 사용하므로 API 키가 공개되지 않습니다. `.env.local`에는 공개 가능한 Worker 주소만 설정합니다.

```text
VITE_WEATHER_API_URL=https://mood-diary-weather.계정.workers.dev/weather
```

OpenWeatherMap 키는 Cloudflare의 `OPENWEATHER_API_KEY` Secret에, Firebase 웹 API 키는 Worker의 `FIREBASE_API_KEY` Secret에 저장합니다. 현재 위치는 날씨 조회를 위해 Cloudflare Worker와 OpenWeatherMap으로 전송됩니다.
날씨가 정상적으로 불러와진 상태에서 일기를 저장하면 당시의 지역명, 날씨, 기온과 아이콘도 해당 날짜 기록에 함께 저장됩니다.

```powershell
npx wrangler secret put OPENWEATHER_API_KEY --config worker/wrangler.toml
npx wrangler secret put FIREBASE_API_KEY --config worker/wrangler.toml
npm run worker:deploy
```

## 기록 저장

- 이전 SQLite 파일 `data/mood-diary.sqlite`는 삭제하거나 Firebase로 이전하지 않습니다. 앱의 활성 데이터 저장에는 사용되지 않습니다.

## 명령어

```powershell
npm run dev          # 개발 서버 실행
npm run build        # 타입 검사 및 프런트엔드 빌드
npm start            # 빌드된 로컬 서비스 실행
npm test             # 날짜·입력·통계·백업 검증 테스트
npm run test:rules   # Firestore 보안 규칙 테스트(Java 필요)
npm run test:legacy  # 보존된 SQLite API 테스트
```

Firestore 규칙을 다시 배포하려면 Firebase CLI 로그인 후 아래 명령을 사용합니다.

```powershell
npx firebase-tools deploy --only firestore:rules --project mood-diary-ign1415
```
