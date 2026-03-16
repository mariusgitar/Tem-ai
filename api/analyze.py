import json
import os
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler

SUPABASE_URL = os.environ.get('SUPABASE_URL')
SUPABASE_ANON_KEY = os.environ.get('SUPABASE_ANON_KEY')
OPENROUTER_API_KEY = os.environ.get('OPENROUTER_API_KEY')

SYSTEM_PROMPT_ROUND1 = """Du er en erfaren kvalitativ forsker.

Din oppgave er å gjennomføre åpen koding av teksten nedenfor.

Regler:
- Kode BREDT og SYSTEMATISK – dekk alle temaer i teksten.
- Kodeetiketter skal være ANALYTISKE og KONSEPTUELLE, ikke deskriptive omskrivninger.
- Velg sitater som er lange nok til å gi kontekst (minst én hel setning).
- Samme kode kan brukes flere ganger med ulike sitater hvis teksten støtter det.
- Rationale skal forklare den analytiske tolkningen, ikke bare beskrive sitatet.
- Slå sammen koder som dekker samme konsept.

Eksempel på DÅRLIG kode: "Vanskelig å finne informasjon"
Eksempel på GOD kode: "Fragmentert tjenestelandskap som navigasjonsbarriere"

Returner kun en gyldig JSON-array. Ingen markdown. Ingen prose.
Hvert element: code_label, quote, rationale.

Hvis en eksisterende kodebok er oppgitt: foreslå KUN koder som 
ikke allerede er dekket. Returner tom liste [] hvis ingen nye 
koder er nødvendige."""

SYSTEM_PROMPT_ROUND2 = """Du er en kritisk kvalitativ forsker og din oppgave er å finne det den første koderen gikk glipp av.

Du får:
1. Den originale teksten
2. Koder fra runde 1

Din oppgave:
- Les teksten grundig og identifiser temaer og mønstre som IKKE er dekket av runde 1-kodene.
- Fokuser spesielt på: implisitte temaer, emosjonelle undertoner, systemiske mønstre, og det som sies mellom linjene.
- IKKE gjenta koder som allerede er dekket av runde 1.
- Hvis runde 1 har dekket teksten godt, er det helt greit å returnere en tom liste [].

Kodeetiketter skal være ANALYTISKE og KONSEPTUELLE.
Velg sitater som er lange nok til å gi kontekst (minst én hel setning).

Returner kun en gyldig JSON-array. Ingen markdown. Ingen prose.
Hvert element: code_label, quote, rationale."""


class LLMParseError(ValueError):
    def __init__(self, message, raw_text=None):
        super().__init__(message)
        self.raw_text = raw_text


def send_json(handler, status_code, payload):
    handler.send_response(status_code)
    handler.send_header('Content-Type', 'application/json')
    handler.end_headers()
    handler.wfile.write(json.dumps(payload).encode('utf-8'))


def get_user(access_token):
    req = urllib.request.Request(
        f"{SUPABASE_URL}/auth/v1/user",
        headers={
            'Authorization': f'Bearer {access_token}',
            'apikey': SUPABASE_ANON_KEY,
        },
    )
    with urllib.request.urlopen(req) as res:
        return json.loads(res.read().decode('utf-8'))


def get_document(access_token, document_id):
    params = urllib.parse.urlencode({
        'id': f'eq.{document_id}',
        'select': 'id,user_id,raw_text',
        'limit': '1',
    })
    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/documents?{params}",
        headers={
            'Authorization': f'Bearer {access_token}',
            'apikey': SUPABASE_ANON_KEY,
        },
    )
    with urllib.request.urlopen(req) as res:
        rows = json.loads(res.read().decode('utf-8'))
        return rows[0] if rows else None


def get_project_codebook(access_token, project_id):
    if not project_id:
        return []
    params = urllib.parse.urlencode({
        'project_id': f'eq.{project_id}',
        'select': 'code_name,definition',
        'order': 'created_at.asc',
    })
    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/codebook?{params}",
        headers={
            'Authorization': f'Bearer {access_token}',
            'apikey': SUPABASE_ANON_KEY,
        },
    )
    with urllib.request.urlopen(req) as res:
        return json.loads(res.read().decode('utf-8'))


def call_openrouter(system_prompt, user_content, model, max_tokens=3000):
    body = json.dumps({
        'model': model,
        'max_tokens': max_tokens,
        'temperature': 0,
        'messages': [
            {'role': 'system', 'content': system_prompt},
            {'role': 'user', 'content': user_content},
        ],
    }).encode('utf-8')

    req = urllib.request.Request(
        'https://openrouter.ai/api/v1/chat/completions',
        data=body,
        method='POST',
        headers={
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {OPENROUTER_API_KEY}',
            'HTTP-Referer': 'https://tem-ai.vercel.app',
            'X-Title': 'TemAI',
        },
    )

    with urllib.request.urlopen(req, timeout=60) as res:
        data = json.loads(res.read().decode('utf-8'))

    choices = data.get('choices') or []
    if not choices:
        raise LLMParseError('Empty response from model')

    text = choices[0].get('message', {}).get('content', '') or ''
    if not text.strip():
        raise LLMParseError('Empty text from model')

    return text


def parse_codes(text):
    start = text.find('[')
    end = text.rfind(']')
    if start == -1 or end == -1:
        return []

    try:
        parsed = json.loads(text[start:end + 1])
    except json.JSONDecodeError:
        return []

    if not isinstance(parsed, list):
        return []

    result = []
    for item in parsed:
        if not isinstance(item, dict):
            continue
        code_label = str(item.get('code_label', '')).strip()
        quote = str(item.get('quote', '')).strip()
        rationale = str(item.get('rationale', '')).strip()
        if code_label and quote and rationale:
            result.append({
                'code_label': code_label,
                'quote': quote,
                'rationale': rationale,
            })

    return result


def deduplicate_codes(round1, round2):
    seen_labels = {c['code_label'].lower() for c in round1}
    seen_quotes = {c['quote'][:50].lower() for c in round1}

    merged = list(round1)
    for code in round2:
        label_key = code['code_label'].lower()
        quote_key = code['quote'][:50].lower()
        if label_key not in seen_labels and quote_key not in seen_quotes:
            merged.append(code)
            seen_labels.add(label_key)
            seen_quotes.add(quote_key)

    return merged


def run_iterative_coding(raw_text, document_type='', context='',
                         existing_codebook=None):
    word_count = len(raw_text.split())
    max_tokens = min(4000, max(1500, word_count // 2))

    context_parts = []
    min_codes = max(3, min(8, word_count // 150))
    max_codes = max(5, min(20, word_count // 80))
    context_parts.append(
        f"Foreslå mellom {min_codes} og {max_codes} koder basert på "
        f"tekstens lengde og tematiske rikdom ({word_count} ord)."
    )
    if document_type:
        context_parts.append(f"Dokumenttype: {document_type}")
    if context:
        context_parts.append(f"Analysekontekst: {context}")
    if existing_codebook:
        existing_names = [c['code_name'] for c in existing_codebook]
        existing_json = json.dumps(existing_names, ensure_ascii=True)
        context_parts.append(
            "Eksisterende kodebok (ikke gjenta disse, finn KUN nye koder): "
            + existing_json
        )

    user_content_r1 = "\n".join(context_parts) + "\n\n---\n\n" + raw_text

    # Round 1: Haiku – broad systematic coding
    print("ANALYZE_ROUND1_START", flush=True)
    text_r1 = call_openrouter(
        system_prompt=SYSTEM_PROMPT_ROUND1,
        user_content=user_content_r1,
        model='anthropic/claude-haiku-4-5',
        max_tokens=max_tokens,
    )
    codes_r1 = parse_codes(text_r1)
    print(f"ANALYZE_ROUND1_DONE codes={len(codes_r1)}", flush=True)

    # Round 2: Maverick – find what Haiku missed
    print("ANALYZE_ROUND2_START", flush=True)
    round1_summary = json.dumps(
        [{'code_label': c['code_label'], 'quote': c['quote'][:80]} for c in codes_r1],
        ensure_ascii=True,
    )
    user_content_r2 = (
        "Runde 1-koder:\n" + round1_summary +
        "\n\n---\n\nOriginaltekst:\n" + raw_text
    )
    if context:
        user_content_r2 = f"Analysekontekst: {context}\n\n" + user_content_r2

    text_r2 = call_openrouter(
        system_prompt=SYSTEM_PROMPT_ROUND2,
        user_content=user_content_r2,
        model='meta-llama/llama-4-maverick',
        max_tokens=max_tokens,
    )
    codes_r2 = parse_codes(text_r2)
    print(f"ANALYZE_ROUND2_DONE codes={len(codes_r2)}", flush=True)

    merged = deduplicate_codes(codes_r1, codes_r2)
    print(f"ANALYZE_MERGED total={len(merged)}", flush=True)

    if not merged:
        raise LLMParseError('No valid codes after both rounds')

    existing_labels = {c['code_name'].lower() for c in (existing_codebook or [])}
    overlap_count = sum(
        1 for c in merged
        if c['code_label'].lower() in existing_labels
    )
    new_codes = [
        c for c in merged
        if c['code_label'].lower() not in existing_labels
    ]

    return {
        'codes': new_codes,
        'overlap_count': overlap_count,
        'total_existing': len(existing_codebook or []),
    }


def insert_codes(access_token, document_id, codes):
    payload = [
        {
            'document_id': document_id,
            'code_label': c['code_label'],
            'quote': c['quote'],
            'rationale': c['rationale'],
            'source': 'ai',
        }
        for c in codes
    ]
    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/codes",
        data=json.dumps(payload).encode('utf-8'),
        method='POST',
        headers={
            'Content-Type': 'application/json',
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': f'Bearer {access_token}',
            'Prefer': 'return=representation',
        },
    )
    with urllib.request.urlopen(req) as res:
        return json.loads(res.read().decode('utf-8'))


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        if not SUPABASE_URL or not SUPABASE_ANON_KEY:
            return send_json(self, 500, {'error': 'Missing server environment variables'})
        if not OPENROUTER_API_KEY:
            return send_json(self, 500, {'error': 'Missing OPENROUTER_API_KEY'})

        auth_header = self.headers.get('Authorization', '')
        if not auth_header.startswith('Bearer '):
            return send_json(self, 401, {'error': 'Missing Authorization Bearer token'})
        access_token = auth_header.replace('Bearer ', '', 1).strip()

        try:
            user = get_user(access_token)
        except Exception:
            return send_json(self, 401, {'error': 'Invalid token'})

        content_length = int(self.headers.get('Content-Length', '0'))
        if content_length <= 0:
            return send_json(self, 400, {'error': 'Missing request body'})

        try:
            body = json.loads(self.rfile.read(content_length).decode('utf-8'))
        except Exception:
            return send_json(self, 400, {'error': 'Invalid JSON body'})

        document_id = str(body.get('document_id', '')).strip()
        project_id = str(body.get('project_id', '')).strip()
        document_type = str(body.get('document_type', '')).strip()
        context = str(body.get('context', '')).strip()

        if not document_id:
            return send_json(self, 400, {'error': 'Missing document_id'})

        try:
            document = get_document(access_token, document_id)
        except Exception:
            return send_json(self, 500, {'error': 'Could not load document'})

        if not document:
            return send_json(self, 404, {'error': 'Document not found'})
        if document.get('user_id') != user.get('id'):
            return send_json(self, 403, {'error': 'Forbidden'})

        raw_text = (document.get('raw_text') or '').strip()
        if not raw_text:
            return send_json(self, 400, {'error': 'Document has no text'})

        existing_codebook = []
        if project_id:
            try:
                existing_codebook = get_project_codebook(access_token, project_id)
            except Exception:
                existing_codebook = []

        try:
            result = run_iterative_coding(
                raw_text,
                document_type,
                context,
                existing_codebook=existing_codebook,
            )
            codes = result['codes']
            overlap_count = result['overlap_count']
            total_existing = result['total_existing']
        except urllib.error.HTTPError as exc:
            try:
                details = json.loads(exc.read().decode('utf-8'))
                msg = details.get('error', {}).get('message', 'LLM request failed')
            except Exception:
                msg = 'LLM request failed'
            status = 503 if exc.code == 529 else 502
            return send_json(self, status, {'error': msg})
        except Exception as exc:
            return send_json(self, 502, {'error': 'Analyze failed: ' + str(exc)})

        try:
            rows = insert_codes(access_token, document_id, codes)
        except Exception:
            return send_json(self, 500, {'error': 'Could not save codes'})

        return send_json(self, 200, {'codes': [
            {
                'code_label': r.get('code_label'),
                'quote': r.get('quote'),
                'rationale': r.get('rationale'),
            }
            for r in rows
        ],
            'overlap_count': overlap_count,
            'total_existing': total_existing,
            'new_count': len(codes),
        })

    def do_GET(self):
        return send_json(self, 405, {'error': 'Method not allowed'})
