import { useState } from 'react'
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth'
import { auth, isFirebaseConfigured } from '../firebase'

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

  async function signInWithGoogle() {
    if (!auth) return
    setSubmitting(true)
    setError('')
    try {
      const provider = new GoogleAuthProvider()
      provider.setCustomParameters({ prompt: 'select_account' })
      await signInWithPopup(auth, provider)
    } catch (caught) {
      setError(authErrorMessage(caught))
    } finally {
      setSubmitting(false)
    }
  }

  if (!isFirebaseConfigured) {
    return (
      <div className="auth-shell">
        <section className="auth-card" aria-labelledby="auth-title">
          <p className="auth-eyebrow">MOOD DIARY</p>
          <h1 id="auth-title">Firebase 연결 준비 중</h1>
          <p className="auth-description">앱 연결 정보를 설정한 뒤 다시 실행해 주세요.</p>
        </section>
      </div>
    )
  }

  return (
    <div className="auth-shell">
      <section className="auth-card" aria-labelledby="auth-title">
        <p className="auth-eyebrow">MOOD DIARY</p>
        <h1 id="auth-title">다시 만나 반가워요</h1>
        <p className="auth-description">내 감정을 기록하려면 Google 계정으로 로그인해 주세요.</p>

        <button type="button" className="google-auth-button" onClick={() => void signInWithGoogle()} disabled={submitting}>
          <span aria-hidden="true">G</span>
          {submitting ? '연결 중…' : 'Google로 계속하기'}
        </button>

        {error && <p className="auth-error" role="alert">{error}</p>}
        <p className="auth-privacy">감정 기록은 로그인한 계정에 안전하게 분리되어 저장됩니다.</p>
      </section>
    </div>
  )
}
