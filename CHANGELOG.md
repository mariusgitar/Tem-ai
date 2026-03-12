# Changelog

## Unreleased
- Fixed document analysis trigger to always use `fetch()` with `POST /api/analyze`, JSON body `{ "document_id": "<id>" }`, and Supabase bearer token auth; also added explicit frontend console logging for failed requests.
- Hardened `/api/analyze` Anthropic parsing: extracts text from Messages API content blocks, strips common wrappers (code fences/prose), safely parses the first JSON array, validates required keys, logs parse-failure previews server-side, and returns a clear `{"error":"Anthropic returned non-JSON output"}` response when parsing fails.
- Added `POST /api/analyze` endpoint that verifies document ownership, sends the document text to Anthropic `claude-sonnet-4-6`, validates strict JSON output, stores AI codes in Supabase `codes`, and returns inserted codes.
- Added a Supabase migration for a `codes` table with RLS policies tied to document ownership.
- Updated `/document/:id` to run analysis from the **Analyser dokument** button, show loading/error states, and render returned codes as cards while keeping filename and raw text visible.
- Improved error handling to expose backend analysis errors in the UI and safely handle invalid model output.
