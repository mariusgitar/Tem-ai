import cgi
import json
import os
import urllib.request
from http.server import BaseHTTPRequestHandler

SUPABASE_URL = os.environ.get('SUPABASE_URL')
SUPABASE_SERVICE_ROLE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY')


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
            'apikey': SUPABASE_SERVICE_ROLE_KEY,
        },
    )

    with urllib.request.urlopen(req) as res:
        return json.loads(res.read().decode('utf-8'))


def insert_document(user_id, filename, raw_text):
    body = json.dumps(
        {
            'user_id': user_id,
            'filename': filename,
            'raw_text': raw_text,
        }
    ).encode('utf-8')

    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/documents",
        data=body,
        method='POST',
        headers={
            'Content-Type': 'application/json',
            'apikey': SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': f'Bearer {SUPABASE_SERVICE_ROLE_KEY}',
            'Prefer': 'return=representation',
        },
    )

    with urllib.request.urlopen(req) as res:
        rows = json.loads(res.read().decode('utf-8'))
        return rows[0]


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
            return send_json(self, 500, {'error': 'Missing server environment variables'})

        auth_header = self.headers.get('Authorization', '')
        if not auth_header.startswith('Bearer '):
            return send_json(self, 401, {'error': 'Missing Authorization Bearer token'})

        access_token = auth_header.replace('Bearer ', '', 1).strip()

        try:
            user = get_user(access_token)
        except Exception:
            return send_json(self, 401, {'error': 'Invalid token'})

        content_type = self.headers.get('Content-Type', '')
        if 'multipart/form-data' not in content_type:
            return send_json(self, 400, {'error': 'Expected multipart/form-data'})

        form = cgi.FieldStorage(
            fp=self.rfile,
            headers=self.headers,
            environ={
                'REQUEST_METHOD': 'POST',
                'CONTENT_TYPE': content_type,
            },
        )

        if 'file' not in form:
            return send_json(self, 400, {'error': 'Missing file'})

        file_field = form['file']
        if not getattr(file_field, 'file', None):
            return send_json(self, 400, {'error': 'Missing file'})

        filename = file_field.filename or 'document.txt'

        try:
            raw_text = file_field.file.read().decode('utf-8')
        except Exception:
            return send_json(self, 400, {'error': 'File must be UTF-8 text'})

        try:
            row = insert_document(user['id'], filename, raw_text)
        except Exception:
            return send_json(self, 500, {'error': 'Could not save document'})

        return send_json(self, 200, {'id': row['id'], 'filename': row['filename']})

    def do_GET(self):
        return send_json(self, 405, {'error': 'Method not allowed'})
