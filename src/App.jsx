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

function UploadPage({ accessToken }) {
  const [file, setFile] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const handleSubmit = async (event) => {
    event.preventDefault()

    if (!file) {
      setError('Velg en .txt-fil før opplasting.')
      return
    }

    setLoading(true)
    setError('')
    setSuccess('')

    const formData = new FormData()
    formData.append('file', file)

    const response = await fetch('/api/upload', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: formData,
    })

    const data = await response.json().catch(() => ({}))

    if (!response.ok) {
      setError(data.error || 'Opplasting feilet.')
      setLoading(false)
      return
    }

    setSuccess(`Lastet opp: ${data.filename}`)
    setFile(null)
    event.target.reset()
    setLoading(false)
  }

  return (
    <main className="content">
      <h1>Last opp dokument</h1>

      <form className="card" onSubmit={handleSubmit}>
        <label>
          Tekstfil (.txt)
          <input
            type="file"
            accept=".txt,text/plain"
            onChange={(event) => setFile(event.target.files?.[0] || null)}
            required
          />
        </label>

        {error ? <p className="error">{error}</p> : null}
        {success ? <p className="success">{success}</p> : null}

        <button type="submit" disabled={loading}>
          {loading ? 'Laster opp…' : 'Last opp'}
        </button>
      </form>
    </main>
  )
}

function AppShell({ session, onLogout }) {
  const [page, setPage] = useState('documents')

  return (
    <div className="page">
      <header className="topnav">
        <nav>
          <button className="navlink" onClick={() => setPage('documents')}>
            Dokumenter
          </button>
          <button className="navlink" onClick={() => setPage('upload')}>
            Last opp
          </button>
        </nav>

        <div className="userActions">
          <span>{session.user.email}</span>
          <button onClick={onLogout}>Logg ut</button>
        </div>
      </header>

      {page === 'upload' ? (
        <UploadPage accessToken={session.access_token} />
      ) : (
        <main className="content">
          <h1>TemAI Lite</h1>
        </main>
      )}
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

  return <AppShell session={session} onLogout={handleLogout} />
}
