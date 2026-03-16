# Changelog

## Unreleased
- Switched LLM provider from Anthropic direct to OpenRouter
- Added model selector dropdown in open coding step
- Both analyze and recode endpoints now accept a model parameter
- Supported models: Claude Haiku, Claude Sonnet, Llama 4 Scout/Maverick, Gemini Flash, GPT-4o Mini
- Added document type dropdown and context field to open coding step
- Context and document type are passed to Claude for improved analysis quality
- Context note shown to user when context is set
- Replaced open-coding add/remove code buttons with iOS-style toggle switch
- Replaced status buttons with iOS-style toggle switch in codebook cards
- Refactored DocumentPage into 4-step wizard with step indicator
- Moved export/import buttons into wizard steps
- Restored documents list page and API after revert
- Restored recode UI with inline highlighting and color legend
- Restored recode backend endpoint using claude-haiku-4-5
- Added disabled button styling
- Added recode endpoint using claude-haiku-4-5 for closed coding with approved codebook
- Switched analyze.py to claude-haiku-4-5 for cost reduction
- Added GET /api/documents endpoint that returns all documents for the authenticated user
- Added DocumentsPage component on the root route showing a clickable list of uploaded documents
- Completed `/api/analyze` flow for production by disabling temporary debug mode, parsing Anthropic text as JSON, validating array/object shape (`code_label`, `quote`, `rationale`), and returning a normalized `{ "codes": [...] }` response.
- Updated `/api/analyze` success responses to only expose `code_label`, `quote`, and `rationale` for each returned code.
- Persisted parsed AI-generated codes to Supabase `codes` with `document_id`, `code_label`, `quote`, `rationale`, and `source = "ai"`.
- Kept `/document/:id` analysis UX minimal: the **Analyser dokument** action shows loading, displays friendly backend/network errors, and renders returned codes below the raw document text.
- Added `POST /api/analyze` endpoint that verifies document ownership, sends the document text to Anthropic `claude-sonnet-4-6`, validates strict JSON output, stores AI codes in Supabase `codes`, and returns inserted codes.
- Added a Supabase migration for a `codes` table with RLS policies tied to document ownership.
