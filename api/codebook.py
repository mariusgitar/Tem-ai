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
            'select': 'id,user_id',
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


def parse_http_error_details(exc):
    try:
        return json.loads(exc.read().decode('utf-8'))
    except Exception:
        return None


def create_codebook_item(access_token, payload):
    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/codebook",
        data=json.dumps(payload).encode('utf-8'),
        method='POST',
        headers={
            'Content-Type': 'application/json',
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': f'Bearer {access_token}',
            'Prefer': 'return=representation',
        },
    )

    try:
        with urllib.request.urlopen(req) as res:
            rows = json.loads(res.read().decode('utf-8'))
            return rows[0] if rows else None
    except urllib.error.HTTPError as e:
        error_body = e.read().decode('utf-8')
        raise Exception(error_body)


def list_codebook_items(access_token, document_id):
    params = urllib.parse.urlencode(
        {
            'document_id': f'eq.{document_id}',
            'select': 'id,user_id,document_id,code_name,definition,status,source,created_at',
            'order': 'created_at.asc',
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


def update_codebook_item(access_token, item_id, updates):
    params = urllib.parse.urlencode({'id': f'eq.{item_id}'})
    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/codebook?{params}",
        data=json.dumps(updates).encode('utf-8'),
        method='PATCH',
        headers={
            'Content-Type': 'application/json',
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': f'Bearer {access_token}',
            'Prefer': 'return=representation',
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

        params = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        document_id = params.get('document_id', [''])[0].strip()
        if not document_id:
            return send_json(self, 400, {'error': 'Missing document_id query parameter'})

        try:
            document = get_document(access_token, document_id)
        except urllib.error.HTTPError:
            return send_json(self, 500, {'error': 'Could not load document'})

        if not document:
            return send_json(self, 404, {'error': 'Document not found'})

        if document.get('user_id') != user.get('id'):
            return send_json(self, 403, {'error': 'Forbidden'})

        try:
            items = list_codebook_items(access_token, document_id)
        except urllib.error.HTTPError as exc:
            return send_json(
                self,
                500,
                {
                    'error': 'Could not load codebook',
                    'details': parse_http_error_details(exc),
                },
            )

        return send_json(self, 200, {'items': items})

    def do_POST(self):
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

        content_length = int(self.headers.get('Content-Length', '0'))
        if content_length <= 0:
            return send_json(self, 400, {'error': 'Missing request body'})

        try:
            body = json.loads(self.rfile.read(content_length).decode('utf-8'))
        except (UnicodeDecodeError, json.JSONDecodeError):
            return send_json(self, 400, {'error': 'Invalid JSON body'})

        document_id = str(body.get('document_id', '')).strip()
        code_name = str(body.get('code_name', '')).strip()
        definition = str(body.get('definition', '')).strip()
        status = str(body.get('status', '')).strip() or 'draft'
        source = str(body.get('source', '')).strip() or 'manual'

        if not document_id:
            return send_json(self, 400, {'error': 'Missing document_id'})

        if not code_name:
            return send_json(self, 400, {'error': 'Missing code_name'})

        if status not in ('draft', 'approved'):
            return send_json(self, 400, {'error': 'Invalid status'})

        try:
            document = get_document(access_token, document_id)
        except urllib.error.HTTPError:
            return send_json(self, 500, {'error': 'Could not load document'})

        if not document:
            return send_json(self, 404, {'error': 'Document not found'})

        if document.get('user_id') != user.get('id'):
            return send_json(self, 403, {'error': 'Forbidden'})

        try:
            item = create_codebook_item(
                access_token,
                {
                    'user_id': user['id'],
                    'document_id': document_id,
                    'code_name': code_name,
                    'definition': definition,
                    'status': status,
                    'source': source,
                },
            )
        except Exception as e:
            return send_json(
                self,
                500,
                {
                    'error': 'Could not save codebook item',
                    'details': str(e),
                },
            )

        return send_json(self, 200, {'item': item})

    def do_PATCH(self):
        if not SUPABASE_URL or not SUPABASE_ANON_KEY:
            return send_json(self, 500, {'error': 'Missing server environment variables'})

        auth_header = self.headers.get('Authorization', '')
        if not auth_header.startswith('Bearer '):
            return send_json(self, 401, {'error': 'Missing Authorization Bearer token'})

        access_token = auth_header.replace('Bearer ', '', 1).strip()

        try:
            get_user(access_token)
        except Exception:
            return send_json(self, 401, {'error': 'Invalid token'})

        content_length = int(self.headers.get('Content-Length', '0'))
        if content_length <= 0:
            return send_json(self, 400, {'error': 'Missing request body'})

        try:
            body = json.loads(self.rfile.read(content_length).decode('utf-8'))
        except (UnicodeDecodeError, json.JSONDecodeError):
            return send_json(self, 400, {'error': 'Invalid JSON body'})

        item_id = str(body.get('id', '')).strip()
        if not item_id:
            return send_json(self, 400, {'error': 'Missing id'})

        updates = {}

        if 'code_name' in body:
            code_name = str(body.get('code_name', '')).strip()
            if not code_name:
                return send_json(self, 400, {'error': 'code_name cannot be empty'})
            updates['code_name'] = code_name

        if 'definition' in body:
            updates['definition'] = str(body.get('definition', '')).strip()

        if 'status' in body:
            status = str(body.get('status', '')).strip()
            if status not in ('draft', 'approved'):
                return send_json(self, 400, {'error': 'Invalid status'})
            updates['status'] = status

        if not updates:
            return send_json(self, 400, {'error': 'No updatable fields provided'})

        try:
            item = update_codebook_item(access_token, item_id, updates)
        except urllib.error.HTTPError as exc:
            return send_json(
                self,
                500,
                {
                    'error': 'Could not update codebook item',
                    'details': parse_http_error_details(exc),
                },
            )

        if not item:
            return send_json(self, 404, {'error': 'Codebook item not found'})

        return send_json(self, 200, {'item': item})

    def do_PUT(self):
        return send_json(self, 405, {'error': 'Method not allowed'})

    def do_DELETE(self):
        return send_json(self, 405, {'error': 'Method not allowed'})
