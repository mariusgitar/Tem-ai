# TemAI Lite Auth Shell

Minimal React + Vite shell for TemAI Lite with Supabase Auth and document upload.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy env file and fill in Supabase values:
   ```bash
   cp .env.example .env
   ```
3. Start dev server:
   ```bash
   npm run dev
   ```

## Environment variables

Frontend:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Serverless function (`/api/upload`):

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Serverless function (`/api/analyze`):

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `GROQ_API_KEY`

## What is included

- Login screen for unauthenticated users.
- Simple app shell for authenticated users.
- Upload page for one `.txt` file.
- POST upload call to `/api/upload` using `Authorization: Bearer <access_token>`.
- Python Vercel function that stores uploaded text in `documents` table.
