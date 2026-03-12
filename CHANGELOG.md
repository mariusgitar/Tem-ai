# Changelog

## Unreleased
- Completed `/api/analyze` flow for production by disabling temporary debug mode, parsing Anthropic text as JSON, validating array/object shape (`code_label`, `quote`, `rationale`), and returning a normalized `{ "codes": [...] }` response.
- Updated `/api/analyze` success responses to only expose `code_label`, `quote`, and `rationale` for each returned code.
- Persisted parsed AI-generated codes to Supabase `codes` with `document_id`, `code_label`, `quote`, `rationale`, and `source = "ai"`.
- Kept `/document/:id` analysis UX minimal: the **Analyser dokument** action shows loading, displays friendly backend/network errors, and renders returned codes below the raw document text.
- Added `POST /api/analyze` endpoint that verifies document ownership, sends the document text to Anthropic `claude-sonnet-4-6`, validates strict JSON output, stores AI codes in Supabase `codes`, and returns inserted codes.
- Added a Supabase migration for a `codes` table with RLS policies tied to document ownership.
