import json
import os
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler

SUPABASE_URL = os.environ.get('SUPABASE_URL')
SUPABASE_ANON_KEY = os.environ.get('SUPABASE_ANON_KEY')


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
            'select': 'id,user_id,filename,raw_text,created_at',
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


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if not SUPABASE_URL or not SUPABASE_ANON_KEY:
            return send_json(self, 500, {'error': 'Missing server environment variables'})

        auth_header = self.headers.get('Authorization', '')
        if not auth_header.startswith('Bearer '):
            return send_json(self, 401, {'error': 'Missing Authorization Bearer token'})

        access_token = auth_header.replace('Bearer ', '', 1).strip()

        try:
            user = get_user(access_token)
        except Exception:
            return send_json(self, 401, {'error': 'Invalid token'})

        query = urllib.parse.urlparse(self.path).query
        params = urllib.parse.parse_qs(query)
        document_id = params.get('id', [''])[0]

        if not document_id:
            return send_json(self, 400, {'error': 'Missing id query parameter'})

        try:
            document = get_document(access_token, document_id)
        except urllib.error.HTTPError:
            return send_json(self, 500, {'error': 'Could not load document'})

        if not document:
            return send_json(self, 404, {'error': 'Document not found'})

        if document['user_id'] != user['id']:
            return send_json(self, 403, {'error': 'Forbidden'})

        return send_json(
            self,
            200,
            {
                'id': document['id'],
                'filename': document['filename'],
                'raw_text': document['raw_text'],
                'created_at': document['created_at'],
            },
        )

    def do_POST(self):
        return send_json(self, 405, {'error': 'Method not allowed'})
