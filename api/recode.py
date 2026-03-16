import json
import os
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler

SUPABASE_URL = os.environ.get('SUPABASE_URL')
SUPABASE_ANON_KEY = os.environ.get('SUPABASE_ANON_KEY')
OPENROUTER_API_KEY = os.environ.get('OPENROUTER_API_KEY')

SYSTEM_PROMPT = (
    "Du er en kvalitativ forsker som utforer systematisk lukket koding. "
    "Du far en kodebok med godkjente koder og en tekst. "
    "Identifiser alle tekstsegmenter som matcher kodene. "
    "Regler: "
    "Sitater skal vaere lange nok til a bevare kontekst (minst en hel setning). "
    "En kode kan matche flere ulike sitater - registrer alle relevante funn. "
    "Ikke tving en match hvis teksten ikke stotter koden. "
    "Rationale skal forklare hvorfor akkurat dette segmentet matcher koden. "
    "Returner kun en gyldig JSON-array. "
    "Ingen markdown. Ingen forklaring. "
    "Hvert element: code_name, quote, rationale."
)


class ParseError(ValueError):
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


def get_approved_codebook(access_token, document_id):
    params = urllib.parse.urlencode({
        'document_id': f'eq.{document_id}',
        'status': 'eq.approved',
        'select': 'code_name,definition',
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


def call_anthropic(raw_text, codebook_items, model='anthropic/claude-haiku-4-5'):
    codebook_json = json.dumps(codebook_items, ensure_ascii=True)
    user_content = "Codebook:\n" + codebook_json + "\n\nText:\n" + raw_text
    max_tokens = min(4000, 1500 + len(codebook_items) * 150)

    body = json.dumps({
        'model': model,
        'max_tokens': max_tokens,
        'temperature': 0,
        'messages': [
            {'role': 'system', 'content': SYSTEM_PROMPT},
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

    with urllib.request.urlopen(req, timeout=45) as res:
        data = json.loads(res.read().decode('utf-8'))

    choices = data.get('choices') or []
    if not choices:
        raise ParseError('Empty response from model')

    text = choices[0].get('message', {}).get('content', '') or ''
    if not text.strip():
        raise ParseError('Empty text from model')

    start = text.find('[')
    end = text.rfind(']')
    if start == -1 or end == -1:
        raise ParseError('No JSON array in response', raw_text=text)

    try:
        parsed = json.loads(text[start:end + 1])
    except json.JSONDecodeError as exc:
        raise ParseError('Invalid JSON', raw_text=text) from exc

    if not isinstance(parsed, list):
        raise ParseError('Response is not a list', raw_text=text)

    result = []
    for item in parsed:
        if not isinstance(item, dict):
            continue
        code_name = str(item.get('code_name', '')).strip()
        quote = str(item.get('quote', '')).strip()
        rationale = str(item.get('rationale', '')).strip()
        if code_name and quote and rationale:
            result.append({'code_name': code_name, 'quote': quote, 'rationale': rationale})

    if not result:
        raise ParseError('No valid segments in response', raw_text=text)

    return result


def insert_segments(access_token, document_id, segments):
    payload = [
        {
            'document_id': document_id,
            'code_name': s['code_name'],
            'quote': s['quote'],
            'rationale': s['rationale'],
            'source': 'recode',
        }
        for s in segments
    ]
    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/segments",
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
        model = str(body.get('model', '')).strip() or 'anthropic/claude-haiku-4-5'
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

        try:
            codebook_items = get_approved_codebook(access_token, document_id)
        except Exception:
            return send_json(self, 500, {'error': 'Could not load codebook'})

        if not codebook_items:
            return send_json(self, 400, {'error': 'No approved codes in codebook'})

        try:
            segments = call_anthropic(raw_text, codebook_items, model=model)
        except urllib.error.HTTPError as exc:
            try:
                details = json.loads(exc.read().decode('utf-8'))
                msg = details.get('error', {}).get('message', 'Anthropic request failed')
            except Exception:
                msg = 'Anthropic request failed'
            status = 503 if exc.code == 529 else 502
            return send_json(self, status, {'error': msg})
        except Exception as exc:
            return send_json(self, 502, {'error': 'Recode failed: ' + str(exc)})

        try:
            rows = insert_segments(access_token, document_id, segments)
        except Exception:
            return send_json(self, 500, {'error': 'Could not save segments'})

        return send_json(self, 200, {'segments': [
            {'code_name': r.get('code_name'), 'quote': r.get('quote'), 'rationale': r.get('rationale')}
            for r in rows
        ]})

    def do_GET(self):
        return send_json(self, 405, {'error': 'Method not allowed'})
