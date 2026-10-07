# MOOD DIARY

하루에 한 번 네 가지 감정 중 하나와 100자 이내의 짧은 메모를 기록하고, 월간 달력과 분석 탭에서 돌아보는 개인용 로컬 웹서비스입니다. 기록은 외부로 전송되지 않습니다.

## 실행 방법

Node.js 24 이상이 필요합니다.

```powershell
npm install
npm run dev
```

브라우저에서 `http://localhost:5173`을 엽니다. 개발 서버를 종료하려면 터미널에서 `Ctrl+C`를 누릅니다.

완성된 버전을 실행하려면 다음 명령을 사용합니다.

```powershell
npm run build
npm start
```

그다음 `http://localhost:3001`을 엽니다.

## 데이터와 백업

- SQLite 데이터 파일: `data/mood-diary.sqlite`
- 화면 오른쪽 위의 톱니바퀴를 눌러 설정으로 이동한 뒤 **백업 내려받기**로 전체 기록을 JSON 파일로 저장할 수 있습니다.
- **백업 복원**은 현재 기록을 백업 파일의 내용으로 교체합니다. 교체 전 확인 창이 표시되며, 파일 검증에 실패하면 기존 기록은 변경되지 않습니다.
- `data` 폴더의 SQLite 파일은 Git에 포함되지 않습니다.

## 명령어

```powershell
npm run dev     # 개발 서버 실행
npm run build   # 타입 검사 및 프런트엔드 빌드
npm start       # 빌드된 로컬 서비스 실행
npm test        # API와 데이터 복원 테스트
```
