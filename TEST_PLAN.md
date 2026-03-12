# Test Plan

## Manual checks
1. Log in with a valid user account.
2. Open `/upload`, choose a `.txt` file, and click **Last opp**.
3. Verify the message **Dokument lastet opp** appears, then app redirects to `/document/<id>`.
4. Verify the document page still shows filename, upload date, and full raw text.
5. Open browser Network tab, click **Analyser dokument**, and verify the request is `POST /api/analyze` (no `GET` request is sent).
6. Verify request headers include `Authorization: Bearer <token>` and `Content-Type: application/json`.
7. Verify request payload contains `{ "document_id": "<id>" }`.
8. Verify button text changes to **Analyserer…** while request is in progress.
9. Verify successful analysis renders one card per returned code with `code_label`, `quote`, and `rationale`.
10. Trigger a backend failure (for example missing `ANTHROPIC_API_KEY` in server env) and verify the real backend message is shown in the UI.
11. Call `POST /api/analyze` with another user's `document_id` and verify it returns `403`.
12. Simulate malformed model output and verify `POST /api/analyze` returns `502` with a safe non-JSON Anthropic error response.
13. Simulate Anthropic output with markdown fences or prose around JSON and verify `/api/analyze` still extracts and parses the first JSON array.
14. Simulate non-JSON Anthropic output and verify `/api/analyze` returns `502` with `{ "error": "Anthropic returned non-JSON output" }` and (optionally) a short preview.

## Automated checks
1. Run `npm run build` and verify it completes successfully.
2. Run `python -m py_compile api/analyze.py api/document.py api/upload.py` and verify no syntax errors.
