import json
import os
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler

SUPABASE_URL = os.environ.get('SUPABASE_URL')
SUPABASE_ANON_KEY = os.environ.get('SUPABASE_ANON_KEY')

DOCUMENT_TYPES = [
    'Brukerintervju',
    'Fokusgruppeintervju',
    'Sporreundersokelse (apne svar)',
    'Ekspertintervju',
    'Observasjonsnotat',
    'Annet',
]


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


def list_projects(access_token):
    params = urllib.parse.urlencode({
        'select': 'id,name,description,document_type,created_at',
        'order': 'created_at.desc',
    })
    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/projects?{params}",
        headers={
            'Authorization': f'Bearer {access_token}',
            'apikey': SUPABASE_ANON_KEY,
        },
    )
    with urllib.request.urlopen(req) as res:
        return json.loads(res.read().decode('utf-8'))


def get_project(access_token, project_id):
    params = urllib.parse.urlencode({
        'id': f'eq.{project_id}',
        'select': 'id,user_id,name,description,document_type,created_at',
        'limit': '1',
    })
    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/projects?{params}",
        headers={
            'Authorization': f'Bearer {access_token}',
            'apikey': SUPABASE_ANON_KEY,
        },
    )
    with urllib.request.urlopen(req) as res:
        rows = json.loads(res.read().decode('utf-8'))
        return rows[0] if rows else None


def create_project(access_token, user_id, name, description, document_type):
    body = json.dumps({
        'user_id': user_id,
        'name': name,
        'description': description,
        'document_type': document_type,
    }).encode('utf-8')
    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/projects",
        data=body,
        method='POST',
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


def list_project_documents(access_token, project_id):
    params = urllib.parse.urlencode({
        'project_id': f'eq.{project_id}',
        'select': 'id,filename,created_at',
        'order': 'created_at.desc',
    })
    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/documents?{params}",
        headers={
            'Authorization': f'Bearer {access_token}',
            'apikey': SUPABASE_ANON_KEY,
        },
    )
    with urllib.request.urlopen(req) as res:
        return json.loads(res.read().decode('utf-8'))


def get_project_codebook(access_token, project_id):
    params = urllib.parse.urlencode({
        'project_id': f'eq.{project_id}',
        'select': 'id,code_name,definition,status,source,created_at',
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

        params = urllib.parse.parse_qs(
            urllib.parse.urlparse(self.path).query
        )
        project_id = params.get('id', [''])[0].strip()

        if project_id:
            try:
                project = get_project(access_token, project_id)
            except Exception:
                return send_json(self, 500, {'error': 'Could not load project'})
            if not project:
                return send_json(self, 404, {'error': 'Project not found'})
            if project.get('user_id') != user.get('id'):
                return send_json(self, 403, {'error': 'Forbidden'})
            try:
                documents = list_project_documents(access_token, project_id)
            except Exception:
                documents = []
            try:
                codebook = get_project_codebook(access_token, project_id)
            except Exception:
                codebook = []
            return send_json(self, 200, {
                'project': project,
                'documents': documents,
                'codebook': codebook,
            })

        try:
            projects = list_projects(access_token)
        except Exception:
            return send_json(self, 500, {'error': 'Could not load projects'})

        return send_json(self, 200, {'projects': projects})

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
        except Exception:
            return send_json(self, 400, {'error': 'Invalid JSON body'})

        name = str(body.get('name', '')).strip()
        description = str(body.get('description', '')).strip()
        document_type = str(body.get('document_type', '')).strip()

        if not name:
            return send_json(self, 400, {'error': 'Missing name'})

        try:
            project = create_project(
                access_token,
                user['id'],
                name,
                description,
                document_type,
            )
        except Exception:
            return send_json(self, 500, {'error': 'Could not create project'})

        return send_json(self, 200, {'project': project})

    def do_PUT(self):
        return send_json(self, 405, {'error': 'Method not allowed'})

    def do_DELETE(self):
        return send_json(self, 405, {'error': 'Method not allowed'})
