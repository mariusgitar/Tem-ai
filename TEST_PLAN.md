# Test Plan

## Manual checks
1. Log in with a valid user account.
2. Open `/upload`, choose a `.txt` file, and click **Last opp**.
3. Verify the message **Dokument lastet opp** appears, then app redirects to `/document/<id>`.
4. Verify the document page shows filename, upload date, and full raw text in a scrollable area.
5. Click **Analyser dokument** and verify message **Analyse kommer i neste versjon** appears.
6. Open `/api/document?id=<another_users_id>` with your token and verify it returns `403`.
7. Open `/api/document?id=<missing_id>` with your token and verify it returns `404`.
