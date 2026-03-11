import { useEffect, useState } from 'react'
import { supabase } from './supabase'

function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (event) => {
    event.preventDefault()
    setLoading(true)
    setError('')

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (signInError) {
      setError(signInError.message)
    }

    setLoading(false)
  }

  return (
    <main className="page center">
      <form className="card" onSubmit={handleSubmit}>
        <h1>TemAI Lite</h1>
        <p>Logg inn for å fortsette</p>

        <label>
          E-post
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>

        <label>
          Passord
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>

        {error ? <p className="error">{error}</p> : null}

        <button type="submit" disabled={loading}>
          {loading ? 'Logger inn…' : 'Logg inn'}
        </button>
      </form>
    </main>
  )
}

function AppShell({ email, onLogout }) {
  return (
    <div className="page">
      <header className="topnav">
        <nav>
          <a href="#">Dokumenter</a>
          <a href="#">Last opp</a>
        </nav>

        <div className="userActions">
          <span>{email}</span>
          <button onClick={onLogout}>Logg ut</button>
        </div>
      </header>

      <main className="content">
        <h1>TemAI Lite</h1>
      </main>
    </div>
  )
}

export default function App() {
  const [session, setSession] = useState(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setReady(true)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
    })

    return () => subscription.unsubscribe()
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
  }

  if (!ready) {
    return <main className="page center">Laster…</main>
  }

  if (!session) {
    return <LoginPage />
  }

  return <AppShell email={session.user.email} onLogout={handleLogout} />
}
