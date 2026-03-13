import json
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler

SUPABASE_URL = os.environ.get('SUPABASE_URL')
SUPABASE_ANON_KEY = os.environ.get('SUPABASE_ANON_KEY')
GROQ_API_KEY = os.environ.get('temai_groq_api_key')

RECODE_SYSTEM_PROMPT = """Du er en kvalitativ analytiker.
Du får en tekst og en kodebok med godkjente koder.
Gå gjennom teksten og identifiser segmenter som passer til kodene.
Returner kun en gyldig JSON-array.
Ingen markdown. Ingen prose. Ingen kodeblokker.
Hvert element skal ha:
- code_name: navnet på koden fra kodeboken
- quote: det eksakte sitatet fra teksten
- rationale: kort begrunnelse"""


class AnthropicParseError(ValueError):
    def __init__(self, message, preview=None, raw_text=None, response_debug=None):
        super().__init__(message)
        self.preview = preview
        self.raw_text = raw_text
        self.response_debug = response_debug or {}


def text_preview(value, limit=400):
    clean = (value or '').replace('\n', '\\n').strip()
    if len(clean) <= limit:
        return clean
    return f"{clean[:limit]}..."


def extract_first_json_array(model_text):
    text = (model_text or '').strip()
    if not text:
        raise AnthropicParseError('Anthropic returned empty text')

    fence_match = re.search(r'```(?:json)?\s*(.*?)\s*```', text, flags=re.IGNORECASE | re.DOTALL)
    if fence_match:
        text = fence_match.group(1).strip()

    start_index = text.find('[')
    if start_index == -1:
        raise AnthropicParseError('Could not find JSON array in Anthropic output', preview=text_preview(text))

    depth = 0
    in_string = False
    escaped = False

    for index in range(start_index, len(text)):
        char = text[index]

        if in_string:
            if escaped:
                escaped = False
            elif char == '\\':
                escaped = True
            elif char == '"':
                in_string = False
            continue

        if char == '"':
            in_string = True
        elif char == '[':
            depth += 1
        elif char == ']':
            depth -= 1
            if depth == 0:
                return text[start_index : index + 1]

    raise AnthropicParseError('Could not find a complete JSON array in Anthropic output', preview=text_preview(text))


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
    params = urllib.parse.urlencode(
        {
            'id': f'eq.{document_id}',
            'select': 'id,user_id,raw_text',
            'limit': '1',
        }
    )

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
    params = urllib.parse.urlencode(
        {
            'document_id': f'eq.{document_id}',
            'status': 'eq.approved',
            'select': 'code_name,definition',
        }
    )

    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/codebook?{params}",
        headers={
            'Authorization': f'Bearer {access_token}',
            'apikey': SUPABASE_ANON_KEY,
        },
    )

    with urllib.request.urlopen(req) as res:
        return json.loads(res.read().decode('utf-8'))


def call_llm(raw_text, codebook_items):
    user_content = f"Kodebok:\n{json.dumps(codebook_items, ensure_ascii=False)}\n\nTekst:\n{raw_text}"

    body = json.dumps(
        {
            'model': 'meta-llama/llama-4-maverick-17b-128e-instruct',
            'max_tokens': 1500,
            'temperature': 0,
            'messages': [
                {
                    'role': 'system',
                    'content': RECODE_SYSTEM_PROMPT,
                },
                {
                    'role': 'user',
                    'content': user_content,
                },
            ],
        }
    ).encode('utf-8')
    print('GROQ_BODY_SIZE_BYTES:', len(body), flush=True)
    print('GROQ_REQUEST_BODY_PREVIEW:', body[:200].decode('utf-8'), flush=True)

    req = urllib.request.Request(
        'https://api.groq.com/openai/v1/chat/completions',
        data=body,
        method='POST',
        headers={
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {GROQ_API_KEY}',
        },
    )

    print('GROQ_KEY_SET:', bool(GROQ_API_KEY), flush=True)
    print('GROQ_KEY_LENGTH:', len(GROQ_API_KEY) if GROQ_API_KEY else 0, flush=True)
    print('GROQ_URL: https://api.groq.com/openai/v1/chat/completions', flush=True)

    with urllib.request.urlopen(req, timeout=45) as res:
        data = json.loads(res.read().decode('utf-8'))

    choices = data.get('choices') or []
    if not choices:
        raise AnthropicParseError('Anthropic returned empty content')

    response_debug = {
        'content_block_count': len(choices),
        'first_block_type': 'message' if choices else None,
    }

    model_text = choices[0].get('message', {}).get('content', '')
    if not model_text.strip():
        raise AnthropicParseError('Anthropic returned empty text')

    print('ANTHROPIC_RAW_OUTPUT:', model_text[:2000])

    try:
        json_array_text = extract_first_json_array(model_text)
        parsed = json.loads(json_array_text)
    except (json.JSONDecodeError, AnthropicParseError) as exc:
        print(
            f"Anthropic parse failure. Preview: {text_preview(model_text)}",
            flush=True,
        )
        if isinstance(exc, AnthropicParseError):
            if not exc.preview:
                exc.preview = model_text[:500]
            if not exc.raw_text:
                exc.raw_text = model_text
            if not exc.response_debug:
                exc.response_debug = response_debug
            raise
        raise AnthropicParseError(
            'Anthropic returned invalid JSON',
            preview=model_text[:500],
            raw_text=model_text,
            response_debug=response_debug,
        ) from exc

    if not isinstance(parsed, list):
        raise AnthropicParseError('Anthropic output must be a JSON array', preview=model_text[:500], raw_text=model_text, response_debug=response_debug)

    normalized = []
    for entry in parsed:
        if not isinstance(entry, dict):
            raise AnthropicParseError('Anthropic output array items must be objects', preview=model_text[:500], raw_text=model_text, response_debug=response_debug)

        code_name = str(entry.get('code_name', '')).strip()
        quote = str(entry.get('quote', '')).strip()
        rationale = str(entry.get('rationale', '')).strip()

        if not code_name or not quote or not rationale:
            raise AnthropicParseError('Anthropic output missing required keys', preview=model_text[:500], raw_text=model_text, response_debug=response_debug)

        normalized.append(
            {
                'code_name': code_name,
                'quote': quote,
                'rationale': rationale,
            }
        )

    return normalized


def parse_http_error_details(exc):
    try:
        return json.loads(exc.read().decode('utf-8'))
    except Exception:
        return None


def is_overloaded_error(details):
    if not isinstance(details, dict):
        return False

    error_obj = details.get('error')
    if isinstance(error_obj, dict):
        error_type = str(error_obj.get('type', '')).lower()
        error_message = str(error_obj.get('message', '')).lower()
        return error_type == 'overloaded_error' or 'overloaded' in error_message

    backend_error = str(details.get('backendError', '')).lower()
    return 'overloaded' in backend_error


def insert_segments(access_token, document_id, segments):
    payload = [
        {
            'document_id': document_id,
            'code_name': segment['code_name'],
            'quote': segment['quote'],
            'rationale': segment['rationale'],
            'source': 'recode',
        }
        for segment in segments
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
        import traceback

        print('RECODE_CALLED', flush=True)

        try:
            if not SUPABASE_URL or not SUPABASE_ANON_KEY:
                return send_json(self, 500, {'error': 'Missing server environment variables'})

            if not GROQ_API_KEY:
                return send_json(self, 500, {'error': 'Missing temai_groq_api_key'})

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
            except (UnicodeDecodeError, json.JSONDecodeError):
                return send_json(self, 400, {'error': 'Invalid JSON body'})

            document_id = str(body.get('document_id', '')).strip()
            if not document_id:
                return send_json(self, 400, {'error': 'Missing document_id'})

            try:
                document = get_document(access_token, document_id)
            except urllib.error.HTTPError:
                return send_json(self, 500, {'error': 'Could not load document'})

            if not document:
                return send_json(self, 404, {'error': 'Document not found'})

            if document.get('user_id') != user.get('id'):
                return send_json(self, 403, {'error': 'Forbidden'})

            raw_text = (document.get('raw_text') or '').strip()
            if not raw_text:
                return send_json(self, 400, {'error': 'Document has no text to analyze'})

            try:
                codebook_items = get_approved_codebook(access_token, document_id)
            except urllib.error.HTTPError:
                return send_json(self, 500, {'error': 'Could not load codebook'})

            if not codebook_items:
                return send_json(self, 400, {'error': 'No approved codes in codebook'})

            segments = None
            for attempt in range(2):
                try:
                    print('RECODE_CALLING_LLM', flush=True)
                    segments = call_llm(raw_text, codebook_items)
                    break
                except urllib.error.HTTPError as exc:
                    details = parse_http_error_details(exc)
                    if is_overloaded_error(details):
                        if attempt == 0:
                            time.sleep(0.8)
                            continue
                        return send_json(
                            self,
                            503,
                            {
                                'error': 'Analyze temporarily unavailable',
                                'details': 'Claude is overloaded, please try again in a moment',
                            },
                        )

                    error_message = None
                    if isinstance(details, dict):
                        error_message = details.get('error', {}).get('message')
                    return send_json(self, 502, {'error': error_message or 'Anthropic request failed'})
                except (TimeoutError, urllib.error.URLError):
                    return send_json(self, 502, {'error': 'Anthropic request failed'})
                except AnthropicParseError as exc:
                    payload = {
                        'error': 'Anthropic returned non-JSON output',
                        'raw_text': (exc.raw_text or '')[:4000],
                        'response_debug': {
                            'content_block_count': exc.response_debug.get('content_block_count'),
                            'first_block_type': exc.response_debug.get('first_block_type'),
                        },
                    }
                    return send_json(self, 502, payload)
                except Exception as exc:
                    print('RECODE_LLM_UNEXPECTED_ERROR:', type(exc).__name__, str(exc), flush=True)
                    return send_json(self, 502, {'error': f'LLM call failed: {type(exc).__name__}: {str(exc)}'})

            if segments is None:
                return send_json(self, 502, {'error': 'Anthropic request failed'})

            try:
                rows = insert_segments(access_token, document_id, segments)
            except urllib.error.HTTPError:
                return send_json(self, 500, {'error': 'Could not save segments'})

            response_segments = [
                {
                    'code_name': row.get('code_name'),
                    'quote': row.get('quote'),
                    'rationale': row.get('rationale'),
                }
                for row in rows
            ]

            return send_json(self, 200, {'segments': response_segments})
        except Exception as e:
            print('RECODE_UNHANDLED_ERROR:', traceback.format_exc(), flush=True)
            return send_json(self, 500, {'error': 'Internal server error', 'details': str(e)})

    def do_GET(self):
        return send_json(self, 405, {'error': 'Method not allowed'})
