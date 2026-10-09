import { useEffect, useState } from 'react'
import { getRedirectResult, GoogleAuthProvider, signInWithPopup, signInWithRedirect } from 'firebase/auth'
import { auth, isFirebaseConfigured } from '../firebase'
import { DiaryLogo } from './DiaryLogo'
import { MoodIcon } from './MoodIcon'
import type { Mood } from '../types'

const authMoods: Mood[] = ['happy', 'calm', 'excited', 'neutral', 'depressed', 'anxious', 'tired', 'angry']

function GoogleLogo() {
  return (
    <svg viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.482h4.844a4.14 4.14 0 0 1-1.797 2.716v2.258h2.909c1.702-1.567 2.684-3.875 2.684-6.615Z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.468-.806 5.956-2.18l-2.91-2.258c-.805.54-1.835.86-3.046.86-2.344 0-4.329-1.585-5.037-3.714H.956v2.333A9 9 0 0 0 9 18Z" />
      <path fill="#FBBC05" d="M3.963 10.708A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.281-1.708V4.959H.956A9 9 0 0 0 0 9c0 1.45.347 2.824.956 4.041l3.007-2.333Z" />
      <path fill="#EA4335" d="M9 3.578c1.322 0 2.508.454 3.442 1.346l2.58-2.58C13.464.892 11.426 0 9 0A9 9 0 0 0 .956 4.959l3.007 2.333C4.67 5.163 6.656 3.578 9 3.578Z" />
    </svg>
  )
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="5" y="10" width="14" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  )
}

function authErrorMessage(error: unknown) {
  const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : ''
  const messages: Record<string, string> = {
    'auth/popup-blocked': '팝업이 차단되었습니다. 브라우저에서 팝업을 허용해 주세요.',
    'auth/popup-closed-by-user': 'Google 로그인 창이 닫혔습니다.',
    'auth/cancelled-popup-request': '다른 로그인 창이 열려 있습니다.',
    'auth/network-request-failed': '네트워크 연결을 확인한 뒤 다시 시도해 주세요.',
    'auth/unauthorized-domain': '현재 주소가 Firebase 로그인 허용 목록에 없습니다.',
  }
  return messages[code] ?? 'Google 로그인 중 문제가 생겼습니다. 잠시 후 다시 시도해 주세요.'
}

export function AuthScreen() {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!auth) return
    void getRedirectResult(auth).catch((caught) => {
      setSubmitting(false)
      setError(authErrorMessage(caught))
    })
  }, [])

  async function signInWithGoogle() {
    if (!auth) return
    setSubmitting(true)
    setError('')
    try {
      const provider = new GoogleAuthProvider()
      provider.setCustomParameters({ prompt: 'select_account' })
      if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        await signInWithPopup(auth, provider)
      } else {
        await signInWithRedirect(auth, provider)
      }
    } catch (caught) {
      setError(authErrorMessage(caught))
    } finally {
      setSubmitting(false)
    }
  }

  if (!isFirebaseConfigured) {
    return (
      <div className="auth-page">
        <div className="auth-shell">
          <section className="auth-card" aria-labelledby="auth-title">
            <p className="auth-wordmark">MOOD DIARY</p>
            <h1 id="auth-title">Firebase 연결 준비 중</h1>
            <p className="auth-description">앱 연결 정보를 설정한 뒤 다시 실행해 주세요.</p>
          </section>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-page">
      <div className="auth-shell">
        <section className="auth-card" aria-labelledby="auth-title">
          <div className="auth-brand">
            <DiaryLogo className="auth-logo" />
            <p className="auth-wordmark">MOOD DIARY</p>
          </div>

          <div className="auth-moods" aria-label="기록할 수 있는 감정">
            {authMoods.map((mood) => <MoodIcon key={mood} mood={mood} size={30} />)}
          </div>

          <h1 className="auth-welcome" id="auth-title">오늘은 어떤 하루였나요?</h1>
          <p className="auth-description">
            <span>감정 하나와 짧은 글이면 충분해요.</span>
            <span>칸이 모이면 내 기분의 패턴이 보여요.</span>
          </p>

          <button type="button" className="google-auth-button" onClick={() => void signInWithGoogle()} disabled={submitting}>
            <span className="google-logo"><GoogleLogo /></span>
            <span className="google-button-label">{submitting ? '연결 중…' : 'Google로 계속하기'}</span>
          </button>

          {error && <p className="auth-error" role="alert">{error}</p>}
          <p className="auth-privacy"><LockIcon />기록은 로그인한 계정에만 저장돼요.</p>
        </section>
      </div>
    </div>
  )
}
