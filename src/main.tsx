import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { onAuthStateChanged, type User } from 'firebase/auth'
import App from './App'
import { AuthScreen } from './components/AuthScreen'
import { auth } from './firebase'
import './styles.css'

function Root() {
  const [user, setUser] = useState<User | null>(null)
  const [checkingAuth, setCheckingAuth] = useState(true)

  useEffect(() => {
    if (!auth) {
      setCheckingAuth(false)
      return
    }
    return onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser)
      setCheckingAuth(false)
    })
  }, [])

  if (checkingAuth) return <div className="auth-loading" role="status">로그인 상태를 확인하고 있어요…</div>
  if (!user) return <AuthScreen />
  return <App userId={user.uid} userEmail={user.email ?? ''} onSignOut={() => auth?.signOut()} />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
