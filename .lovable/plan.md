Publish the current project to its Lovable URL (https://aurora-aimee.lovable.app).

Preflight:
- Verify website info (title, meta description, OG/Twitter tags, favicon) on `src/routes/__root.tsx` and the landing route; fill in anything generic before publishing.
- Run a security scan and review results; only proceed if no unresolved critical findings.

Deploy:
- Call the publish action to ship the latest commit. Frontend goes live in ~1 minute; backend changes (if any) are already live.

No code changes required unless the metadata preflight finds gaps.