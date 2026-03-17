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

function UploadPage({ accessToken, projectId, onOpenUpload, onBack }) {
  const [file, setFile] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [csvColumns, setCsvColumns] = useState(null)
  const [csvRows, setCsvRows] = useState(null)
  const [selectedColumn, setSelectedColumn] = useState('')

  const detectSeparator = (text) => {
    const commas = (text.slice(0, 2000).match(/,/g) || []).length
    const semicolons = (text.slice(0, 2000).match(/;/g) || []).length
    return semicolons > commas ? ';' : ','
  }

  const parseCSV = (text) => {
    const separator = detectSeparator(text)
    const lines = text.trim().split('\n').filter(Boolean)
    if (lines.length < 2) return null

    const parseRow = (line) => {
      const cols = []
      let current = ''
      let inQuotes = false
      for (const char of line) {
        if (char === '"') { inQuotes = !inQuotes }
        else if (char === separator && !inQuotes) { cols.push(current.trim()); current = '' }
        else { current += char }
      }
      cols.push(current.trim())
      return cols
    }

    const headers = parseRow(lines[0])
    const rows = lines.slice(1).map(parseRow)
    return { headers, rows }
  }

  const handleFileChange = async (event) => {
    const selected = event.target.files?.[0] || null
    setFile(selected)
    setCsvColumns(null)
    setCsvRows(null)
    setSelectedColumn('')
    setError('')

    if (selected && selected.name.endsWith('.csv')) {
      const text = await selected.text()
      const parsed = parseCSV(text)
      if (!parsed) {
        setError('Kunne ikke lese CSV-filen. Sjekk at den har en header-rad.')
        return
      }
      setCsvColumns(parsed.headers)
      setCsvRows(parsed.rows)
    }
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!file) { setError('Velg en fil før opplasting.'); return }

    if (file.name.endsWith('.csv')) {
      if (!selectedColumn) { setError('Velg hvilken kolonne som skal analyseres.'); return }

      const colIndex = csvColumns.indexOf(selectedColumn)
      const combined = csvRows
        .map((row, i) => {
          const val = (row[colIndex] || '').trim()
          return val ? `Svar ${i + 1}: ${val}` : null
        })
        .filter(Boolean)
        .join('\n\n')

      if (!combined) { setError('Kolonnen inneholder ingen tekst.'); return }

      setLoading(true); setError(''); setSuccess('')

      const blob = new Blob([combined], { type: 'text/plain' })
      const filename = `${file.name.replace('.csv', '')}_${selectedColumn}.txt`
      const formData = new FormData()
      formData.append('file', blob, filename)
      if (projectId) {
        formData.append('project_id', projectId)
      }

      const response = await fetch('/api/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        body: formData,
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) { setError(data.error || 'Opplasting feilet.'); setLoading(false); return }
      setSuccess('Dokument lastet opp')
      setLoading(false)
      window.setTimeout(() => onOpenUpload(data.id), 500)
      return
    }

    setLoading(true); setError(''); setSuccess('')
    const formData = new FormData()
    formData.append('file', file)
    if (projectId) {
      formData.append('project_id', projectId)
    }
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

  const isCSV = file && file.name.endsWith('.csv')

  return (
    <main className="content">
      <button type="button" className="btn-secondary"
        onClick={onBack} style={{ marginBottom: '1rem' }}>
        ← Tilbake til prosjekt
      </button>
      <h1>Last opp dokument</h1>
      <form className="card" style={{ maxWidth: '560px' }} onSubmit={handleSubmit}>
        <label>
          Tekstfil (.txt eller .csv)
          <input
            type="file"
            accept=".txt,.csv,text/plain,text/csv"
            onChange={handleFileChange}
            required
          />
        </label>

        {isCSV && csvColumns && (
          <>
            <div className="divider" />
            <div style={{ display: 'grid', gap: '0.5rem' }}>
              <p style={{ fontWeight: 600, fontSize: '0.95rem' }}>
                CSV-fil oppdaget – velg kolonne å analysere
              </p>
              <p className="meta">
                {csvRows?.length} rader funnet. Velg hvilken kolonne som inneholder tekstsvarene.
              </p>
              <label>
                Kolonne
                <select
                  value={selectedColumn}
                  onChange={(e) => setSelectedColumn(e.target.value)}
                  required
                >
                  <option value="">Velg kolonne…</option>
                  {csvColumns.map((col) => (
                    <option key={col} value={col}>{col}</option>
                  ))}
                </select>
              </label>
              {selectedColumn && csvRows && (
                <div style={{
                  background: 'var(--color-bg)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '0.75rem',
                  fontSize: '0.825rem',
                  color: 'var(--color-text-muted)',
                }}>
                  <strong>Forhåndsvisning (første 3 svar):</strong>
                  {csvRows.slice(0, 3).map((row, i) => {
                    const val = (row[csvColumns.indexOf(selectedColumn)] || '').trim()
                    return val ? <p key={i} style={{ margin: '0.25rem 0' }}>Svar {i + 1}: {val}</p> : null
                  })}
                </div>
              )}
            </div>
          </>
        )}

        {error ? <p className="error">{error}</p> : null}
        {success ? <p className="success">{success}</p> : null}
        <button type="submit" disabled={loading || !!success}>
          {loading
            ? 'Laster opp…'
            : success
            ? 'Åpner dokument…'
            : isCSV && selectedColumn
            ? `Importer "${selectedColumn}"`
            : 'Last opp'}
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

function DocumentPage({ accessToken, documentId, onBack }) {
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
  const [analysisContext, setAnalysisContext] = useState('')
  const [documentType, setDocumentType] = useState('')
  const [projectId, setProjectId] = useState(null)
  const [analyzeOverlap, setAnalyzeOverlap] = useState(null)
  const [selectedModel, setSelectedModel] = useState('anthropic/claude-haiku-4-5')

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
      const query = new URLSearchParams({
        id: documentId,
        select: 'id,user_id,filename,raw_text,created_at,project_id',
      })
      const response = await fetch(`/api/document?${query.toString()}`, {
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
      if (data.project_id) setProjectId(data.project_id)
      setCodes([])
      setSegments([])
      setAnalyzeOverlap(null)
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
        body: JSON.stringify({
          document_id: activeDocument.id,
          project_id: projectId,
          document_type: documentType,
          context: analysisContext,
          model: selectedModel,
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        setAnalysisError(data.error || 'Analysering feilet')
        setAnalysisLoading(false)
        return
      }
      setCodes(Array.isArray(data.codes) ? data.codes : [])
      setAnalyzeOverlap({
        new_count: data.new_count || 0,
        overlap_count: data.overlap_count || 0,
        total_existing: data.total_existing || 0,
      })
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
        body: JSON.stringify({ document_id: activeDocument.id, model: selectedModel }),
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

  const handleAddToCodebook = async (code) => {
    if (!activeDocument?.id || !code?.code_label || codebookCodeNames.has(code.code_label)) return
    const saveKey = `${code.code_label}-${code.quote}`
    setSavingCodebookId(saveKey)
    setCodebookError('')

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
    if (!response.ok) {
      setCodebookError(data.error || 'Kunne ikke lagre')
      setSavingCodebookId('')
      return
    }
    if (data.item) setCodebookItems((prev) => [...prev, data.item])
    setSavingCodebookId('')
  }

  const handleAddAllToCodebook = async () => {
    const codesToAdd = codes.filter(
      (code) => !codebookCodeNames.has(code.code_label)
    )
    for (const code of codesToAdd) {
      await handleAddToCodebook(code)
    }
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
    if (!response.ok) {
      setCodebookError(data.error || 'Kunne ikke oppdatere')
      setSavingCodebookId('')
      return false
    }
    if (data.item) setCodebookItems((prev) => prev.map((i) => i.id === itemId ? data.item : i))
    setSavingCodebookId('')
    return true
  }

  const handleToggleCodebookApproval = async (item, checkedValue) => {
    if (!item?.id || savingCodebookId === item.id) return
    const previousStatus = item.status === 'approved' ? 'approved' : 'draft'
    const nextStatus = typeof checkedValue === 'boolean'
      ? (checkedValue ? 'approved' : 'draft')
      : previousStatus === 'approved'
        ? 'draft'
        : 'approved'

    setCodebookItems((prev) => prev.map((i) => i.id === item.id ? { ...i, status: nextStatus } : i))
    const saved = await handleSaveCodebookItem(item.id, { status: nextStatus })
    if (!saved) {
      setCodebookItems((prev) => prev.map((i) => i.id === item.id ? { ...i, status: previousStatus } : i))
    }
  }

  const handleApproveAll = async () => {
    const drafts = codebookItems.filter((item) => item.status !== 'approved')
    for (const item of drafts) {
      handleCodebookFieldChange(item.id, 'status', 'approved')
      const saved = await handleSaveCodebookItem(item.id, { status: 'approved' })
      if (!saved) {
        handleCodebookFieldChange(item.id, 'status', item.status === 'approved' ? 'approved' : 'draft')
      }
    }
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
        <button type="button" className="btn-secondary"
          onClick={() => onBack && onBack(projectId)}
          style={{ marginBottom: '0.5rem' }}>
          ← Tilbake
        </button>
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

          <div style={{ display: 'grid', gap: '0.75rem' }}>
            <label>
              Dokumenttype
              <select
                value={documentType}
                onChange={(e) => setDocumentType(e.target.value)}
              >
                <option value="">Velg dokumenttype (valgfritt)</option>
                <option value="Brukerintervju">Brukerintervju</option>
                <option value="Fokusgruppeintervju">Fokusgruppeintervju</option>
                <option value="Spørreundersøkelse (åpne svar)">Spørreundersøkelse (åpne svar)</option>
                <option value="Ekspertintervju">Ekspertintervju</option>
                <option value="Observasjonsnotat">Observasjonsnotat</option>
                <option value="Annet">Annet</option>
              </select>
            </label>

            <label>
              Analysekontekst
              <textarea
                value={analysisContext}
                onChange={(e) => setAnalysisContext(e.target.value)}
                rows={3}
                placeholder="Beskriv hva du leter etter, hvem informantene er, eller hvilket tema analysen skal fokusere på. Eksempel: Dette er intervjuer med eldre brukere av kommunale digitale tjenester. Fokuser på bruksbarrierer og frustrasjoner."
              />
            </label>

            {(documentType || analysisContext) ? (
              <p className="meta" style={{ fontStyle: 'italic' }}>
                💡 Konteksten sendes med til AI-en og påvirker både åpen og lukket koding.
              </p>
            ) : null}

            <div style={{
              background: 'var(--color-bg)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-sm)',
              padding: '0.75rem 1rem',
              fontSize: '0.875rem',
              color: 'var(--color-text-muted)',
            }}>
              🤖 <strong>Iterativ koding:</strong> Runde 1 med Claude Haiku (bred dekning),
              runde 2 med Llama 4 Maverick (finner det Haiku gikk glipp av).
              Resultatene slås sammen automatisk.
            </div>
          </div>

          <button type="button" onClick={handleAnalyze} disabled={analysisLoading}>
            {analysisLoading ? 'Analyserer…' : 'Analyser dokument'}
          </button>

          {analyzeOverlap && analyzeOverlap.total_existing > 0 ? (
            <div style={{
              background: 'var(--color-bg)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-sm)',
              padding: '0.75rem 1rem',
              fontSize: '0.875rem',
              color: 'var(--color-text-muted)',
            }}>
              📊 <strong>{analyzeOverlap.new_count} nye koder</strong> funnet.
              {analyzeOverlap.overlap_count > 0
                ? ` ${analyzeOverlap.overlap_count} overlappet med eksisterende kodebok og ble ikke lagt til.`
                : ' Ingen overlapp med eksisterende kodebok.'}
            </div>
          ) : null}

          {analysisError ? <p className="error">{analysisError}</p> : null}

          {codes.length > 0 ? (
            <section className="codesList" aria-label="Foreslåtte koder">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <p className="meta">{codes.length} koder foreslått</p>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={handleAddAllToCodebook}
                  disabled={codes.every((code) => codebookCodeNames.has(code.code_label))}
                >
                  {codes.every((code) => codebookCodeNames.has(code.code_label))
                    ? 'Alle lagt til ✓'
                    : 'Legg alle til i kodebok'}
                </button>
              </div>
              {codes.map((code, index) => {
                const saveKey = `${code.code_label}-${code.quote}`
                return (
                  <article className="codeCard" key={code.id || `${code.code_label}-${index}`}>
                    <h2>{code.code_label}</h2>
                    <p className="quote">"{code.quote}"</p>
                    <p className="meta">{code.rationale}</p>
                    <label className="toggleWrapper">
                      <span className="toggleSwitch">
                        <input
                          type="checkbox"
                          checked={codebookCodeNames.has(code.code_label)}
                          onChange={() => handleToggleCodebookCode(code)}
                          disabled={savingCodebookId === saveKey}
                        />
                        <span className="toggleSlider" />
                      </span>
                      <span className={`toggleLabel ${codebookCodeNames.has(code.code_label) ? 'checked' : ''}`}>
                        {savingCodebookId === saveKey
                          ? 'Lagrer…'
                          : codebookCodeNames.has(code.code_label)
                            ? 'Lagt til i kodebok'
                            : 'Ikke lagt'}
                      </span>
                    </label>
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
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={handleApproveAll}
                disabled={
                  codebookItems.length === 0 ||
                  codebookItems.every((item) => item.status === 'approved')
                }
              >
                {codebookItems.every((item) => item.status === 'approved')
                  ? 'Alle godkjent ✓'
                  : 'Godkjenn alle'}
              </button>
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
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>Status</span>
                    <label className="toggleWrapper">
                      <span className="toggleSwitch">
                        <input
                          type="checkbox"
                          checked={item.status === 'approved'}
                          onChange={(e) => handleToggleCodebookApproval(item, e.target.checked)}
                          disabled={savingCodebookId === item.id}
                        />
                        <span className="toggleSlider" />
                      </span>
                      <span className={`toggleLabel ${item.status === 'approved' ? 'checked' : ''}`}>
                        {item.status === 'approved' ? 'Godkjent' : 'Draft'}
                      </span>
                    </label>
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

          <label>
            Modell for lukket koding
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
            >
              <option value="anthropic/claude-haiku-4-5">
                Claude Haiku 4.5 ✦ Anbefalt – rask og billig
              </option>
              <option value="anthropic/claude-sonnet-4-5">
                Claude Sonnet 4.5 – høyere kvalitet
              </option>
              <option value="meta-llama/llama-4-maverick">
                Llama 4 Maverick (gratis)
              </option>
              <option value="meta-llama/llama-4-scout">
                Llama 4 Scout (gratis)
              </option>
              <option value="google/gemini-flash-1.5">
                Gemini Flash 1.5 (veldig billig)
              </option>
              <option value="openai/gpt-4o-mini">
                GPT-4o Mini
              </option>
            </select>
          </label>

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

function ProjectsPage({ accessToken, onOpenProject, onCreateProject }) {
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!accessToken) return
    let isMounted = true
    const load = async () => {
      setLoading(true)
      const response = await fetch('/api/projects', {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      const data = await response.json().catch(() => ({}))
      if (!isMounted) return
      if (!response.ok) { setError(data.error || 'Kunne ikke hente prosjekter'); setLoading(false); return }
      setProjects(Array.isArray(data.projects) ? data.projects : [])
      setLoading(false)
    }
    load()
    return () => { isMounted = false }
  }, [accessToken])

  if (loading) return <main className="content">Laster prosjekter…</main>
  if (error) {
    return (
      <main className="content">
        <p className="error">{error}</p>
        <p className="meta">Token tilgjengelig: {accessToken ? 'ja' : 'nei'}</p>
      </main>
    )
  }

  return (
    <main className="content">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h1>Prosjekter</h1>
        <button type="button" onClick={onCreateProject}>
          + Nytt prosjekt
        </button>
      </div>

      {projects.length === 0 ? (
        <div className="wizardCard" style={{ textAlign: 'center', padding: '3rem' }}>
          <p style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>Ingen prosjekter ennå.</p>
          <p className="meta" style={{ marginBottom: '1.5rem' }}>
            Opprett et prosjekt for å begynne å analysere tekst.
          </p>
          <button type="button" onClick={onCreateProject}>
            Opprett ditt første prosjekt
          </button>
        </div>
      ) : (
        <section className="codesList">
          {projects.map((project) => (
            <article className="codeCard" key={project.id}
              style={{ cursor: 'pointer' }}
              onClick={() => onOpenProject(project.id)}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h2>{project.name}</h2>
                  {project.document_type ? (
                    <span style={{
                      fontSize: '0.75rem',
                      background: 'var(--color-bg)',
                      border: '1px solid var(--color-border)',
                      borderRadius: '99px',
                      padding: '0.15rem 0.6rem',
                      color: 'var(--color-text-muted)',
                    }}>{project.document_type}</span>
                  ) : null}
                  {project.description ? (
                    <p className="meta" style={{ marginTop: '0.4rem' }}>{project.description}</p>
                  ) : null}
                </div>
                <p className="meta">{new Date(project.created_at).toLocaleDateString('nb-NO')}</p>
              </div>
            </article>
          ))}
        </section>
      )}
    </main>
  )
}

function CreateProjectPage({ accessToken, onCreated, onBack }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [documentType, setDocumentType] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!name.trim()) { setError('Prosjektnavn er påkrevd.'); return }
    setLoading(true); setError('')

    const response = await fetch('/api/projects', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ name, description, document_type: documentType }),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) { setError(data.error || 'Kunne ikke opprette prosjekt'); setLoading(false); return }
    onCreated(data.project.id)
  }

  return (
    <main className="content">
      <button type="button" className="btn-secondary"
        onClick={onBack} style={{ marginBottom: '1rem' }}>
        ← Tilbake
      </button>
      <h1 style={{ marginBottom: '1.5rem' }}>Nytt prosjekt</h1>
      <form className="wizardCard" onSubmit={handleSubmit}>
        <label>
          Prosjektnavn *
          <input type="text" value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="F.eks. Brukerundersøkelse 2026"
            required />
        </label>
        <label>
          Beskrivelse
          <textarea value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="Kort beskrivelse av prosjektet og formålet med analysen" />
        </label>
        <label>
          Dokumenttype
          <select value={documentType}
            onChange={(e) => setDocumentType(e.target.value)}>
            <option value="">Velg dokumenttype (valgfritt)</option>
            <option value="Brukerintervju">Brukerintervju</option>
            <option value="Fokusgruppeintervju">Fokusgruppeintervju</option>
            <option value="Spørreundersøkelse (åpne svar)">Spørreundersøkelse (åpne svar)</option>
            <option value="Ekspertintervju">Ekspertintervju</option>
            <option value="Observasjonsnotat">Observasjonsnotat</option>
            <option value="Annet">Annet</option>
          </select>
        </label>
        {error ? <p className="error">{error}</p> : null}
        <div className="wizardNav">
          <button type="button" className="btn-secondary" onClick={onBack}>
            Avbryt
          </button>
          <button type="submit" disabled={loading}>
            {loading ? 'Oppretter…' : 'Opprett prosjekt →'}
          </button>
        </div>
      </form>
    </main>
  )
}

function ProjectPage({ accessToken, projectId, onOpenDocument, onUpload, onBack }) {
  const [project, setProject] = useState(null)
  const [documents, setDocuments] = useState([])
  const [codebook, setCodebook] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let isMounted = true
    const load = async () => {
      setLoading(true)
      const response = await fetch(`/api/projects?id=${encodeURIComponent(projectId)}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      const data = await response.json().catch(() => ({}))
      if (!isMounted) return
      if (!response.ok) { setError(data.error || 'Kunne ikke hente prosjekt'); setLoading(false); return }
      setProject(data.project)
      setDocuments(Array.isArray(data.documents) ? data.documents : [])
      setCodebook(Array.isArray(data.codebook) ? data.codebook : [])
      setLoading(false)
    }
    load()
    return () => { isMounted = false }
  }, [accessToken, projectId])

  if (loading) return <main className="content">Laster prosjekt…</main>
  if (error) return <main className="content"><p className="error">{error}</p></main>

  const approvedCount = codebook.filter((c) => c.status === 'approved').length

  return (
    <main className="content">
      <button type="button" className="btn-secondary"
        onClick={onBack} style={{ marginBottom: '1rem' }}>
        ← Prosjekter
      </button>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
        <div>
          <h1>{project.name}</h1>
          {project.document_type ? (
            <span style={{
              fontSize: '0.75rem',
              background: 'var(--color-bg)',
              border: '1px solid var(--color-border)',
              borderRadius: '99px',
              padding: '0.15rem 0.6rem',
              color: 'var(--color-text-muted)',
            }}>{project.document_type}</span>
          ) : null}
          {project.description ? (
            <p className="meta" style={{ marginTop: '0.4rem' }}>{project.description}</p>
          ) : null}
        </div>
        <button type="button" onClick={onUpload}>
          + Last opp dokument
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
        <div className="wizardCard" style={{ padding: '1rem' }}>
          <p className="meta">Dokumenter</p>
          <p style={{ fontSize: '1.5rem', fontWeight: 700 }}>{documents.length}</p>
        </div>
        <div className="wizardCard" style={{ padding: '1rem' }}>
          <p className="meta">Kodebok</p>
          <p style={{ fontSize: '1.5rem', fontWeight: 700 }}>
            {approvedCount} <span style={{ fontSize: '0.9rem', fontWeight: 400 }}>godkjente</span>
          </p>
        </div>
      </div>

      <h2 style={{ marginBottom: '0.75rem' }}>Dokumenter</h2>
      {documents.length === 0 ? (
        <div className="wizardCard" style={{ textAlign: 'center', padding: '2rem' }}>
          <p className="meta" style={{ marginBottom: '1rem' }}>
            Ingen dokumenter ennå. Last opp det første for å starte analysen.
          </p>
          <button type="button" onClick={onUpload}>
            Last opp første dokument
          </button>
        </div>
      ) : (
        <section className="codesList">
          {documents.map((doc) => (
            <article className="codeCard" key={doc.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h2>{doc.filename}</h2>
                  <p className="meta">{new Date(doc.created_at).toLocaleString('nb-NO')}</p>
                </div>
                <button type="button" onClick={() => onOpenDocument(doc.id)}>
                  Åpne
                </button>
              </div>
            </article>
          ))}
        </section>
      )}
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
  const projectMatch = path.match(/^\/projects\/([^/]+)$/)
  const projectUploadMatch = path.match(/^\/projects\/([^/]+)\/upload$/)

  if (!session?.access_token || !session?.user) return <main className="page center">Laster…</main>

  return (
    <div className="page">
      <header className="topnav">
        <nav>
          <button className="navlink" onClick={() => goToPath('/')}>
            Prosjekter
          </button>
        </nav>
        <div className="userActions">
          <span>{session.user.email}</span>
          <button onClick={onLogout}>Logg ut</button>
        </div>
      </header>
      {path === '/projects/new' ? (
        <CreateProjectPage
          accessToken={session.access_token}
          onCreated={(id) => goToPath(`/projects/${id}`)}
          onBack={() => goToPath('/')}
        />
      ) : projectUploadMatch ? (
        <UploadPage
          accessToken={session.access_token}
          projectId={projectUploadMatch[1]}
          onOpenUpload={(id) => goToPath(`/document/${id}`)}
          onBack={() => goToPath(`/projects/${projectUploadMatch[1]}`)}
        />
      ) : projectMatch ? (
        <ProjectPage
          accessToken={session.access_token}
          projectId={projectMatch[1]}
          onOpenDocument={(id) => goToPath(`/document/${id}`)}
          onUpload={() => goToPath(`/projects/${projectMatch[1]}/upload`)}
          onBack={() => goToPath('/')}
        />
      ) : documentMatch ? (
        <DocumentPage
          accessToken={session.access_token}
          documentId={documentMatch[1]}
          onBack={(nextProjectId) => nextProjectId
            ? goToPath(`/projects/${nextProjectId}`)
            : goToPath('/')}
        />
      ) : (
        <ProjectsPage
          accessToken={session.access_token}
          onOpenProject={(id) => goToPath(`/projects/${id}`)}
          onCreateProject={() => goToPath('/projects/new')}
        />
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
