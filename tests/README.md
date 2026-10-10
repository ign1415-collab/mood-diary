# 감정 다이어리 QA

기준 문서: `감정 다이어리 테스트 케이스` (2026-10-09)

## 실행

```bash
npm test
npm run test:legacy
npm run test:rules
npm run build
```

- `npm test`: 날짜·백업 로직 테스트와 React 화면/상호작용 테스트
- `npm run test:legacy`: 기존 Express API 회귀 테스트
- `npm run test:rules`: Firebase Emulator 기반 회원별 보안 규칙 테스트(Java 필요)
- `npm run build`: 프로덕션 타입 검사와 빌드

테스트의 오늘 날짜는 2026-10-09로 고정한다. 테스트 이름 앞의 `D1`, `T1`, `WA1` 같은 번호는 기준 문서의 케이스 번호다.

## 현재 자동화 범위

- 날짜 범위와 한국 날짜 키: D1, D3~D9
- 7일 제목·비교·기록 횟수·빈 상태: T1~T7, K1~K9, S1~S6, S8, E1~E8
- 30일 요약·목록·필터·로딩: M1~M10
- 오늘/과거 날씨 전달, 당일 날씨 보충, 실패 허용, 날씨 그룹: W1, W2, W4~W8
- 날씨별 분석: WA1~WA11
- 기존 감정·백업 호환: H1~H7
- 이유 태그: R1~R11과 기본/사용자 태그 수정·비활성화 권한
- 경계값: 비교 5일, 제목 3일, 날씨 분석 10개, 날씨별 후보 4개, 감정 최소 2번, 뚜렷한 차이 20%p
- 느린 네트워크 저장: 서버 응답 전 중복 저장 방지, 응답 후 불필요한 월 재조회 방지
- 회원별 Firestore 접근: 본인 읽기·쓰기, 타인/비회원 차단

## 환경 제한

Firestore 규칙 테스트는 Java가 설치된 환경에서 Firebase Emulator를 실행해야 한다. Java가 없는 환경에서는 `firebase deploy --only firestore:rules --dry-run`으로 규칙 컴파일까지만 확인한다.
