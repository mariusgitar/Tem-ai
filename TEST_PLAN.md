# Test Plan

## Manual checks
1. Log in with a valid user account.
2. Open `/upload`, choose a `.txt` file, and click **Last opp**.
3. Verify the message **Dokument lastet opp** appears, then app redirects to `/document/<id>`.
4. Verify the document page still shows filename, upload date, and full raw text.
5. Click **Analyser dokument** and verify button text changes to **Analyserer…** while request is in progress.
6. Verify successful analysis renders one card per returned code with `code_label`, `quote`, and `rationale`.
7. Trigger a backend failure (for example missing `ANTHROPIC_API_KEY` in server env) and verify the real backend message is shown in the UI.
8. Call `POST /api/analyze` with another user's `document_id` and verify it returns `403`.
9. Simulate malformed model output and verify `POST /api/analyze` returns `502` with a safe invalid JSON error.

## Automated checks
1. Run `npm run build` and verify it completes successfully.
2. Run `python -m py_compile api/analyze.py api/document.py api/upload.py` and verify no syntax errors.
