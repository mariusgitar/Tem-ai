import React, { useEffect, useState } from 'react'
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
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
    if (signInError) setError(signInError.message)
    setLoading(false)
  }

  return (
    <main className="page center">
      <form className="card" onSubmit={handleSubmit}>
        <h1>TemAI Lite</h1>
        <p>Logg inn for å fortsette</p>
        <label>
          E-post
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          Passord
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
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
    if (!file) { setError('Velg en .txt-fil før opplasting.'); return }
    setLoading(true); setError(''); setSuccess('')
    const formData = new FormData()
    formData.append('file', file)
    const response = await fetch('/api/upload', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: formData,
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) { setError(data.error || 'Opplasting feilet.'); setLoading(false); return }
    setSuccess('Dokument lastet opp')
    setLoading(false)
    setFile(null)
    event.target.reset()
    window.setTimeout(() => onOpenUpload(data.id), 500)
  }

  return (
    <main className="content">
      <h1>Last opp dokument</h1>
      <form className="card" onSubmit={handleSubmit}>
        <label>
          Tekstfil (.txt)
          <input type="file" accept=".txt,text/plain"
            onChange={(e) => setFile(e.target.files?.[0] || null)} required />
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


function ToggleSwitchButton({ checked, labelOn, labelOff, onClick, disabled, loading, className = '' }) {
  const label = loading ? 'Lagrer…' : checked ? labelOn : labelOff
  return (
    <button
      type="button"
      className={`toggleSwitchButton ${checked ? 'is-on' : 'is-off'} ${className}`.trim()}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={checked}
    >
      <span className="toggleSwitchTrack" aria-hidden="true">
        <span className="toggleSwitchThumb" />
      </span>
      <span>{label}</span>
    </button>
  )
}

function DocumentPage({ accessToken, documentId }) {
  const [activeDocument, setActiveDocument] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [analysisLoading, setAnalysisLoading] = useState(false)
  const [analysisError, setAnalysisError] = useState('')
  const [codes, setCodes] = useState([])
  const [codebookItems, setCodebookItems] = useState([])
  const [codebookLoading, setCodebookLoading] = useState(false)
  const [codebookError, setCodebookError] = useState('')
  const [savingCodebookId, setSavingCodebookId] = useState('')
  const codebookCodeNames = new Set(codebookItems.map((item) => item.code_name))
  const codebookItemByName = new Map(codebookItems.map((item) => [item.code_name, item]))
  const [segments, setSegments] = useState([])
  const [recodeLoading, setRecodeLoading] = useState(false)
  const [recodeError, setRecodeError] = useState('')
  const [wizardStep, setWizardStep] = useState(1)

  const loadCodebook = async (nextDocumentId) => {
    setCodebookLoading(true)
    setCodebookError('')
    const response = await fetch(`/api/codebook?document_id=${encodeURIComponent(nextDocumentId)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
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
      setLoading(true); setError('')
      const response = await fetch(`/api/document?id=${encodeURIComponent(documentId)}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      const data = await response.json().catch(() => ({}))
      if (!isMounted) return
      if (!response.ok) {
        setError(data.error || 'Kunne ikke hente dokument')
        setLoading(false)
        return
      }
      setActiveDocument(data)
      setCodes([])
      setSegments([])
      setAnalysisError('')
      setAnalysisLoading(false)
      setRecodeError('')
      setRecodeLoading(false)
      await loadCodebook(data.id)
      setLoading(false)
    }
    loadDocument()
    return () => { isMounted = false }
  }, [accessToken, documentId])

  const handleAnalyze = async () => {
    if (!activeDocument?.id || analysisLoading) return
    setAnalysisLoading(true); setAnalysisError('')
    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ document_id: activeDocument.id }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        setAnalysisError(data.error || 'Analysering feilet')
        setAnalysisLoading(false)
        return
      }
      setCodes(Array.isArray(data.codes) ? data.codes : [])
      setAnalysisLoading(false)
    } catch (_err) {
      setAnalysisError('Kunne ikke kontakte serveren')
      setAnalysisLoading(false)
    }
  }

  const handleRecode = async () => {
    if (!activeDocument?.id || recodeLoading) return
    setRecodeLoading(true); setRecodeError('')
    try {
      const response = await fetch('/api/recode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ document_id: activeDocument.id }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        setRecodeError(data.error || 'Kunne ikke kode dokumentet med kodebok')
        setRecodeLoading(false)
        return
      }
      setSegments(Array.isArray(data.segments) ? data.segments : [])
      setRecodeLoading(false)
    } catch (_err) {
      setRecodeError('Kunne ikke kontakte serveren')
      setRecodeLoading(false)
    }
  }

  const handleToggleCodebookCode = async (code) => {
    if (!activeDocument?.id || !code?.code_label) return
    const saveKey = `${code.code_label}-${code.quote}`
    const existingItem = codebookItemByName.get(code.code_label)
    setSavingCodebookId(saveKey); setCodebookError('')

    if (existingItem?.id) {
      const response = await fetch(`/api/codebook?id=${encodeURIComponent(existingItem.id)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) { setCodebookError(data.error || 'Kunne ikke fjerne'); setSavingCodebookId(''); return }
      setCodebookItems((prev) => prev.filter((item) => item.id !== existingItem.id))
      setSavingCodebookId('')
      return
    }

    const response = await fetch('/api/codebook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({
        document_id: activeDocument.id,
        code_name: code.code_label,
        definition: code.rationale || '',
        status: 'draft',
        source: 'ai_from_codes',
      }),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) { setCodebookError(data.error || 'Kunne ikke lagre'); setSavingCodebookId(''); return }
    if (data.item) setCodebookItems((prev) => [...prev, data.item])
    setSavingCodebookId('')
  }

  const handleCodebookFieldChange = (itemId, field, value) => {
    setCodebookItems((prev) => prev.map((item) => item.id === itemId ? { ...item, [field]: value } : item))
  }

  const handleSaveCodebookItem = async (itemId, updates) => {
    setSavingCodebookId(itemId); setCodebookError('')
    const response = await fetch('/api/codebook', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ id: itemId, ...updates }),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) { setCodebookError(data.error || 'Kunne ikke oppdatere'); setSavingCodebookId(''); return }
    if (data.item) setCodebookItems((prev) => prev.map((i) => i.id === itemId ? data.item : i))
    setSavingCodebookId('')
  }

  const handleToggleCodebookApproval = async (item) => {
    if (!item?.id || savingCodebookId === item.id) return
    const nextStatus = item.status === 'approved' ? 'draft' : 'approved'
    await handleSaveCodebookItem(item.id, { status: nextStatus })
  }



  const exportCodebookCSV = () => {
    if (codebookItems.length === 0) return
    const header = 'code_name,definition,status'
    const rows = codebookItems.map((item) => {
      const name = `"${(item.code_name || '').replace(/"/g, '""')}"`
      const def = `"${(item.definition || '').replace(/"/g, '""')}"`
      const status = `"${(item.status || '').replace(/"/g, '""')}"`
      return `${name},${def},${status}`
    })
    const csv = [header, ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = window.document.createElement('a')
    a.href = url
    a.download = `kodebok_${activeDocument?.filename || 'export'}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const importCodebookCSV = async (event) => {
    const file = event.target.files?.[0]
    if (!file || !activeDocument?.id) return
    const text = await file.text()
    const lines = text.trim().split('\n')
    if (lines.length < 2) return

    for (const line of lines.slice(1)) {
      const cols = []
      let current = ''
      let inQuotes = false
      for (const char of line) {
        if (char === '"') { inQuotes = !inQuotes }
        else if (char === ',' && !inQuotes) { cols.push(current); current = '' }
        else { current += char }
      }
      cols.push(current)
      const code_name = (cols[0] || '').trim()
      const definition = (cols[1] || '').trim()
      const status = (cols[2] || 'draft').trim()
      if (!code_name) continue
      await fetch('/api/codebook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          document_id: activeDocument.id,
          code_name,
          definition,
          status: ['draft', 'approved'].includes(status) ? status : 'draft',
          source: 'import',
        }),
      })
    }
    await loadCodebook(activeDocument.id)
    event.target.value = ''
  }

  const exportSegmentsCSV = () => {
    if (segments.length === 0) return
    const header = 'code_name,quote,rationale'
    const rows = segments.map((s) => {
      const name = `"${(s.code_name || '').replace(/"/g, '""')}"`
      const quote = `"${(s.quote || '').replace(/"/g, '""')}"`
      const rationale = `"${(s.rationale || '').replace(/"/g, '""')}"`
      return `${name},${quote},${rationale}`
    })
    const csv = [header, ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = window.document.createElement('a')
    a.href = url
    a.download = `segmenter_${activeDocument?.filename || 'export'}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const approvedCodebookItems = codebookItems.filter((item) => item.status === 'approved')
  const maxReachedStep = Math.max(
    1,
    codes.length > 0 ? 2 : 1,
    codebookItems.length > 0 ? 3 : 1,
    segments.length > 0 ? 4 : 1,
  )
  const colorPalette = ['#fef08a', '#bbf7d0', '#bfdbfe', '#fecaca', '#e9d5ff', '#fed7aa']
  const codeNames = [...new Set(segments.map((s) => s.code_name).filter(Boolean))]
  const codeColorMap = codeNames.reduce((map, name, i) => { map[name] = colorPalette[i % colorPalette.length]; return map }, {})

  const rawText = activeDocument?.raw_text || ''
  const highlightedParts = []
  if (segments.length > 0 && rawText) {
    let cursor = 0
    const matches = []
    segments.forEach((segment, si) => {
      const quote = segment?.quote || ''
      if (!quote) return
      const start = rawText.indexOf(quote, cursor)
      if (start === -1) return
      matches.push({ start, end: start + quote.length, quote, code_name: segment.code_name, si })
      cursor = start + quote.length
    })
    cursor = 0
    matches.forEach((match, mi) => {
      if (match.start > cursor) highlightedParts.push(<span key={`t-${mi}`}>{rawText.slice(cursor, match.start)}</span>)
      highlightedParts.push(
        <mark key={`m-${mi}`} data-code={match.code_name}
          style={{ backgroundColor: codeColorMap[match.code_name] || colorPalette[0] }}>
          {match.quote}
        </mark>
      )
      cursor = match.end
    })
    if (cursor < rawText.length) highlightedParts.push(<span key="tail">{rawText.slice(cursor)}</span>)
  }

  if (loading) return <main className="content">Laster dokument…</main>
  if (error) return <main className="content"><p className="error">{error}</p></main>

  return (
    <main className="wizard">
      <div>
        <h1 style={{ marginBottom: '0.25rem' }}>{activeDocument.filename}</h1>
        <p className="meta">Lastet opp: {new Date(activeDocument.created_at).toLocaleString('nb-NO')}</p>
      </div>

      <WizardSteps currentStep={wizardStep} maxReachedStep={maxReachedStep} />

      {wizardStep === 1 && (
        <div className="wizardCard">
          <h2>Dokument</h2>
          <div className="rawText">{activeDocument.raw_text}</div>
          <div className="wizardNav">
            <span />
            <button type="button" onClick={() => setWizardStep(2)}>
              Start analyse →
            </button>
          </div>
        </div>
      )}

      {wizardStep === 2 && (
        <div className="wizardCard">
          <h2>Åpen koding</h2>
          <p className="meta">AI analyserer teksten og foreslår induktive koder.</p>

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
                    <p className="quote">"{code.quote}"</p>
                    <p className="meta">{code.rationale}</p>
                    <ToggleSwitchButton
                      checked={codebookCodeNames.has(code.code_label)}
                      onClick={() => handleToggleCodebookCode(code)}
                      disabled={savingCodebookId === saveKey}
                      loading={savingCodebookId === saveKey}
                      labelOn="Lagt til i kodebok"
                      labelOff="Ikke lagt"
                      className="full-width"
                    />
                  </article>
                )
              })}
            </section>
          ) : null}

          <div className="wizardNav">
            <button type="button" className="btn-secondary"
              onClick={() => setWizardStep(1)}>
              ← Tilbake
            </button>
            <button type="button" onClick={() => setWizardStep(3)}
              disabled={codebookItems.length === 0}>
              Neste: Kodebok →
            </button>
          </div>
        </div>
      )}

      {wizardStep === 3 && (
        <div className="wizardCard">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h2>Kodebok</h2>
              <p className="meta">Rediger og godkjenn koder før lukket koding.</p>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="button" className="btn-secondary"
                onClick={exportCodebookCSV} disabled={codebookItems.length === 0}>
                Eksporter CSV
              </button>
              <label style={{ fontSize: '0.875rem', cursor: 'pointer',
                display: 'grid', placeItems: 'center' }}>
                <span className="btn-secondary" style={{
                  padding: '0.6rem 1.1rem', borderRadius: '6px',
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-surface)', cursor: 'pointer',
                  fontSize: '0.9rem', fontWeight: 500,
                }}>Importer CSV</span>
                <input type="file" accept=".csv" onChange={importCodebookCSV}
                  style={{ display: 'none' }} />
              </label>
            </div>
          </div>

          <div className="divider" />

          {codebookLoading ? <p className="meta">Laster kodebok…</p> : null}
          {codebookError ? <p className="error">{codebookError}</p> : null}
          {codebookItems.length === 0 && !codebookLoading ? (
            <p className="meta">Ingen kodebok-elementer enda. Gå tilbake og analyser dokumentet.</p>
          ) : null}

          <div className="codebookSection">
            {codebookItems.map((item) => (
              <article className="codebookCard" key={item.id}>
                <label>
                  Kodenavn
                  <input type="text" value={item.code_name || ''}
                    onChange={(e) => handleCodebookFieldChange(item.id, 'code_name', e.target.value)}
                    onBlur={() => handleSaveCodebookItem(item.id, { code_name: item.code_name || '' })} />
                </label>
                <label>
                  Definisjon
                  <textarea value={item.definition || ''}
                    onChange={(e) => handleCodebookFieldChange(item.id, 'definition', e.target.value)}
                    onBlur={() => handleSaveCodebookItem(item.id, { definition: item.definition || '' })}
                    rows={2} />
                </label>
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', flex: 1 }}>
                    <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>Status</span>
                    <ToggleSwitchButton
                      checked={item.status === 'approved'}
                      onClick={() => handleToggleCodebookApproval(item)}
                      disabled={savingCodebookId === item.id}
                      loading={savingCodebookId === item.id}
                      labelOn="Godkjent"
                      labelOff="Ikke godkjent"
                      className="full-width"
                    />
                  </div>
                </div>
              </article>
            ))}
          </div>

          <div className="wizardNav">
            <button type="button" className="btn-secondary"
              onClick={() => setWizardStep(2)}>
              ← Tilbake
            </button>
            <button type="button" onClick={() => setWizardStep(4)}
              disabled={approvedCodebookItems.length === 0}>
              {approvedCodebookItems.length === 0
                ? 'Godkjenn minst én kode for å fortsette'
                : 'Neste: Lukket koding →'}
            </button>
          </div>
        </div>
      )}

      {wizardStep === 4 && (
        <div className="wizardCard">
          <div>
            <h2>Lukket koding</h2>
            <p className="meta">
              AI tagger teksten med {approvedCodebookItems.length} godkjente koder.
            </p>
          </div>

          <button type="button" onClick={handleRecode} disabled={recodeLoading}>
            {recodeLoading ? 'Koder teksten…' : 'Kode med kodebok'}
          </button>

          {recodeError ? <p className="error">{recodeError}</p> : null}

          {segments.length > 0 ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  {codeNames.map((name) => (
                    <span key={name} style={{
                      backgroundColor: codeColorMap[name],
                      padding: '0.2rem 0.6rem',
                      borderRadius: '99px',
                      fontSize: '0.8rem',
                      fontWeight: 500,
                    }}>{name}</span>
                  ))}
                </div>
                <button type="button" className="btn-secondary" onClick={exportSegmentsCSV}>
                  Eksporter CSV
                </button>
              </div>
              <div className="rawText">
                {highlightedParts.length > 0 ? highlightedParts : activeDocument.raw_text}
              </div>
            </>
          ) : (
            <div className="rawText">{activeDocument.raw_text}</div>
          )}

          <div className="wizardNav">
            <button type="button" className="btn-secondary"
              onClick={() => setWizardStep(3)}>
              ← Tilbake
            </button>
            <span />
          </div>
        </div>
      )}
    </main>
  )
}

function WizardSteps({ currentStep, maxReachedStep }) {
  const steps = [
    { number: 1, label: 'Dokument' },
    { number: 2, label: 'Åpen koding' },
    { number: 3, label: 'Kodebok' },
    { number: 4, label: 'Lukket koding' },
  ]

  return (
    <div className="wizardSteps">
      {steps.map((step, index) => {
        const isDone = step.number < currentStep
        const isActive = step.number === currentStep
        const isReachable = step.number <= maxReachedStep

        return (
          <React.Fragment key={step.number}>
            <div className="wizardStep">
              <div className={`stepCircle ${isDone ? 'done' : isActive ? 'active' : ''}`}>
                {isDone ? '✓' : step.number}
              </div>
              <span className={`stepLabel ${isDone ? 'done' : isActive ? 'active' : ''}`}>
                {step.label}
              </span>
            </div>
            {index < steps.length - 1 && (
              <div className={`stepConnector ${isDone ? 'done' : ''}`} />
            )}
          </React.Fragment>
        )
      })}
    </div>
  )
}

function DocumentsPage({ accessToken, onOpenDocument }) {
  const [documents, setDocuments] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let isMounted = true
    const loadDocuments = async () => {
      setLoading(true); setError('')
      const response = await fetch('/api/documents', {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      const data = await response.json().catch(() => ({}))
      if (!isMounted) return
      if (!response.ok) {
        setError(data.error || 'Kunne ikke hente dokumenter')
        setDocuments([])
        setLoading(false)
        return
      }
      setDocuments(Array.isArray(data.documents) ? data.documents : [])
      setLoading(false)
    }
    loadDocuments()
    return () => { isMounted = false }
  }, [accessToken])

  if (loading) return <main className="content">Laster dokumenter…</main>
  if (error) return <main className="content"><p className="error">{error}</p></main>
  if (documents.length === 0) return (
    <main className="content">
      <p>Ingen dokumenter ennå.</p>
      <p><a href="/upload">Last opp et dokument</a></p>
    </main>
  )

  return (
    <main className="content">
      <h1>Dokumenter</h1>
      <section className="codesList" aria-label="Dokumentliste">
        {documents.map((doc) => (
          <article className="codeCard" key={doc.id}>
            <h2>{doc.filename}</h2>
            <p className="meta">Lastet opp: {new Date(doc.created_at).toLocaleString('nb-NO')}</p>
            <button type="button" onClick={() => onOpenDocument(doc.id)}>Åpne</button>
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
          <button className="navlink" onClick={() => goToPath('/')}>Dokumenter</button>
          <button className="navlink" onClick={() => goToPath('/upload')}>Last opp</button>
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
        <DocumentsPage accessToken={session.access_token} onOpenDocument={(id) => goToPath(`/document/${id}`)} />
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
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
    })
    return () => subscription.unsubscribe()
  }, [])

  const handleLogout = async () => { await supabase.auth.signOut() }

  if (!ready) return <main className="page center">Laster…</main>
  if (!session) return <LoginPage />
  return <AppShell session={session} onLogout={handleLogout} />
}
