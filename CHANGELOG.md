# Changelog

## Unreleased
- Added redirect from upload success to `/document/:id` with a short loading state and confirmation message.
- Added `GET /api/document?id=<document_id>` endpoint with auth and document ownership checks.
- Added a new document page that shows filename, upload time, raw text, and a placeholder analysis button.
