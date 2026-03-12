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

function UploadPage({ accessToken, onOpenUpload }) {
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

    setSuccess('Dokument lastet opp')
    setLoading(false)
    setFile(null)
    event.target.reset()

    window.setTimeout(() => {
      onOpenUpload(data.id)
    }, 500)
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

        <button type="submit" disabled={loading || !!success}>
          {loading ? 'Laster opp…' : success ? 'Åpner dokument…' : 'Last opp'}
        </button>
      </form>
    </main>
  )
}

function DocumentPage({ accessToken, documentId }) {
  const [document, setDocument] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [analysisLoading, setAnalysisLoading] = useState(false)
  const [analysisError, setAnalysisError] = useState('')
  const [codes, setCodes] = useState([])
  const [codebookItems, setCodebookItems] = useState([])
  const [codebookLoading, setCodebookLoading] = useState(false)
  const [codebookError, setCodebookError] = useState('')
  const [savingCodebookId, setSavingCodebookId] = useState('')

  const loadCodebook = async (nextDocumentId) => {
    setCodebookLoading(true)
    setCodebookError('')

    const response = await fetch(`/api/codebook?document_id=${encodeURIComponent(nextDocumentId)}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })

    const data = await response.json().catch(() => ({}))

    if (!response.ok) {
      setCodebookError(data.error || 'Kunne ikke hente kodebok')
      setCodebookItems([])
      setCodebookLoading(false)
      return
    }

    setCodebookItems(Array.isArray(data.items) ? data.items : [])
    setCodebookLoading(false)
  }

  useEffect(() => {
    let isMounted = true

    const loadDocument = async () => {
      setLoading(true)
      setError('')

      const response = await fetch(`/api/document?id=${encodeURIComponent(documentId)}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      })

      const data = await response.json().catch(() => ({}))

      if (!isMounted) {
        return
      }

      if (!response.ok) {
        setError(data.error || 'Kunne ikke hente dokument')
        setLoading(false)
        return
      }

      setDocument(data)
      setCodes([])
      setAnalysisError('')
      setAnalysisLoading(false)
      await loadCodebook(data.id)
      setLoading(false)
    }

    loadDocument()

    return () => {
      isMounted = false
    }
  }, [accessToken, documentId])

  const handleAnalyze = async (event) => {
    event?.preventDefault?.()

    if (!document?.id || analysisLoading) {
      return
    }

    setAnalysisLoading(true)
    setAnalysisError('')

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          document_id: document.id,
        }),
      })

      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        const frontendMessage = data.error || 'Analysering feilet'
        console.error('Analyze request failed', {
          status: response.status,
          statusText: response.statusText,
          backendError: data.error,
          documentId: document.id,
        })
        setAnalysisError(frontendMessage)
        setAnalysisLoading(false)
        return
      }

      setCodes(Array.isArray(data.codes) ? data.codes : [])
      setAnalysisLoading(false)
    } catch (fetchError) {
      console.error('Analyze request failed before response', {
        error: fetchError,
        documentId: document.id,
      })
      setAnalysisError('Kunne ikke kontakte serveren for analysering')
      setAnalysisLoading(false)
    }
  }

  const handleAddToCodebook = async (code) => {
    if (!document?.id || !code?.code_label) {
      return
    }

    const saveKey = `${code.code_label}-${code.quote}`
    setSavingCodebookId(saveKey)
    setCodebookError('')

    const response = await fetch('/api/codebook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        document_id: document.id,
        code_name: code.code_label,
        definition: code.rationale || '',
        status: 'draft',
        source: 'ai_from_codes',
      }),
    })

    const data = await response.json().catch(() => ({}))

    if (!response.ok) {
      setCodebookError(data.error || 'Kunne ikke lagre kodebok-element')
      setSavingCodebookId('')
      return
    }

    if (data.item) {
      setCodebookItems((previous) => [...previous, data.item])
    }
    setSavingCodebookId('')
  }

  const handleCodebookFieldChange = (itemId, field, value) => {
    setCodebookItems((previous) =>
      previous.map((item) => (item.id === itemId ? { ...item, [field]: value } : item))
    )
  }

  const handleSaveCodebookItem = async (item) => {
    setSavingCodebookId(item.id)
    setCodebookError('')

    const response = await fetch('/api/codebook', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        id: item.id,
        code_name: item.code_name,
        definition: item.definition || '',
        status: item.status,
      }),
    })

    const data = await response.json().catch(() => ({}))

    if (!response.ok) {
      setCodebookError(data.error || 'Kunne ikke oppdatere kodebok-element')
      setSavingCodebookId('')
      return
    }

    if (data.item) {
      setCodebookItems((previous) =>
        previous.map((existingItem) => (existingItem.id === item.id ? data.item : existingItem))
      )
    }
    setSavingCodebookId('')
  }

  if (loading) {
    return <main className="content">Laster dokument…</main>
  }

  if (error) {
    return (
      <main className="content">
        <p className="error">{error}</p>
      </main>
    )
  }

  return (
    <main className="content documentPage">
      <h1>{document.filename}</h1>
      <p className="meta">Lastet opp: {new Date(document.created_at).toLocaleString('nb-NO')}</p>

      <div className="rawText">{document.raw_text}</div>

      <button type="button" onClick={handleAnalyze} disabled={analysisLoading}>
        {analysisLoading ? 'Analyserer…' : 'Analyser dokument'}
      </button>

      {analysisError ? <p className="error">{analysisError}</p> : null}

      {codes.length > 0 ? (
        <section className="codesList" aria-label="Foreslåtte koder">
          {codes.map((code, index) => {
            const saveKey = `${code.code_label}-${code.quote}`

            return (
              <article className="codeCard" key={code.id || `${code.code_label}-${index}`}>
                <h2>{code.code_label}</h2>
                <p className="quote">“{code.quote}”</p>
                <p>{code.rationale}</p>
                <button type="button" onClick={() => handleAddToCodebook(code)} disabled={savingCodebookId === saveKey}>
                  {savingCodebookId === saveKey ? 'Lagrer…' : 'Legg til i kodebok'}
                </button>
              </article>
            )
          })}
        </section>
      ) : null}

      <section className="codebookSection" aria-label="Kodebok">
        <h2>Kodebok</h2>
        {codebookLoading ? <p>Laster kodebok…</p> : null}
        {codebookError ? <p className="error">{codebookError}</p> : null}

        {codebookItems.length === 0 && !codebookLoading ? <p>Ingen kodebok-elementer enda.</p> : null}

        {codebookItems.map((item) => (
          <article className="codebookCard" key={item.id}>
            <label>
              Kodenavn
              <input
                type="text"
                value={item.code_name || ''}
                onChange={(event) => handleCodebookFieldChange(item.id, 'code_name', event.target.value)}
              />
            </label>

            <label>
              Definisjon
              <textarea
                value={item.definition || ''}
                onChange={(event) => handleCodebookFieldChange(item.id, 'definition', event.target.value)}
                rows={3}
              />
            </label>

            <label>
              Status
              <select
                value={item.status || 'draft'}
                onChange={(event) => handleCodebookFieldChange(item.id, 'status', event.target.value)}
              >
                <option value="draft">draft</option>
                <option value="approved">approved</option>
              </select>
            </label>

            <button type="button" onClick={() => handleSaveCodebookItem(item)} disabled={savingCodebookId === item.id}>
              {savingCodebookId === item.id ? 'Lagrer…' : 'Lagre endringer'}
            </button>
          </article>
        ))}
      </section>
    </main>
  )
}

function AppShell({ session, onLogout }) {
  const [path, setPath] = useState(window.location.pathname)

  const goToPath = (nextPath) => {
    window.history.pushState({}, '', nextPath)
    setPath(nextPath)
  }

  useEffect(() => {
    const onPopState = () => setPath(window.location.pathname)
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const documentMatch = path.match(/^\/document\/([^/]+)$/)

  return (
    <div className="page">
      <header className="topnav">
        <nav>
          <button className="navlink" onClick={() => goToPath('/')}>
            Dokumenter
          </button>
          <button className="navlink" onClick={() => goToPath('/upload')}>
            Last opp
          </button>
        </nav>

        <div className="userActions">
          <span>{session.user.email}</span>
          <button onClick={onLogout}>Logg ut</button>
        </div>
      </header>

      {path === '/upload' ? (
        <UploadPage accessToken={session.access_token} onOpenUpload={(id) => goToPath(`/document/${id}`)} />
      ) : documentMatch ? (
        <DocumentPage accessToken={session.access_token} documentId={documentMatch[1]} />
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
