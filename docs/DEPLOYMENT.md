# Deployment and operation

Complete the [team login setup](LOGIN.md) before configuring the Worker. The configuration script does not create your Zero Trust organization, enable email OTP, or create an Access application/policy.

## Configuration map

| Setting                                    | Meaning                                                                 |
| ------------------------------------------ | ----------------------------------------------------------------------- |
| `account_id`, `ACCOUNT_ID`                 | The same Cloudflare account that owns your R2 bucket                    |
| `routes[].pattern`, `ORIGIN`               | Custom hostname and exact HTTPS origin                                  |
| `ACCESS_ISSUER`                            | `https://YOUR_TEAM.cloudflareaccess.com`                                |
| `ACCESS_AUD`                               | Access application's audience tag                                       |
| `ADMIN_EMAILS`                             | Comma-separated initial administrator emails; also allow them in Access |
| `DB`                                       | Your D1 database binding and ID                                         |
| `MEDIA`, `R2_BUCKET`                       | Your private R2 bucket binding and S3 bucket name                       |
| `AI`                                       | Workers AI binding used only when requested                             |
| `PASSCODE_ENCRYPTION_KEY`                  | Base64 32-byte AES-GCM key in Worker secrets                            |
| `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | Bucket-scoped S3 credentials in Worker secrets                          |

The checked-in Wrangler settings are placeholders. `npm run configure` validates common fields but does not provision Access or change your DNS on its own. Wrangler deployment attaches the configured custom domain. Inspect that value carefully. Keep workers.dev and preview URLs disabled.

All SQL migrations are required, in filename order. Migration 0008 intentionally contains only a comment to preserve numbering without private staff seeds. Local preview: `npx wrangler d1 migrations apply DB --local`, then `npm run dev`. Public pages can be previewed locally; authenticated flows require a real signed Access assertion. Local emulation does not implement the external R2 S3 upload destination. Use a separate test account/domain/bucket for end-to-end development.

## Release checklist

- Run `npm ci`, `npm run check`, `npm test`, and `npx wrangler deploy --dry-run`.
- Confirm anonymous `/record`, `/library`, `/library/admin`, `/api/videos` requests redirect to Access. Test denial with an unapproved email.
- Confirm an approved member can manage only their own recordings and cannot access Admin. Confirm the initial admin works.
- Record a disposable clip in a supported desktop browser. Test microphone, tab audio where available, countdown, pause/resume, stop, title, upload and seek.
- Test protected and unprotected publishing. Check media/thumbnail URLs are denied before unlocking, then play after unlocking. Change and remove the passcode and verify old grants stop working.
- Check share-copy text, transcript/title generation, first-login Help, light/dark mode, and playback counts. Repeat playback with the same cookie to verify daily deduplication.
- Delete only your disposable test video and check the public link stops working.

The automated tests do not substitute for these browser and infrastructure checks. The v0.1 code has not had an independent security audit.

## Backups and updates

Back up D1 using your Cloudflare account's export/recovery features, R2 media using your chosen backup system, and the encryption key separately. Restoring only D1 will not restore media. Losing the encryption key breaks recovery of stored passcodes for sharing; the existing hashes can still verify viewer passcodes. Rotating the key requires re-encrypting existing values or having owners reset them. No automatic key-rotation tool is included.

Keep your deployment configuration and secrets outside upstream commits. Before updating, review the diff and migrations, back up state, test in staging, apply new migrations, then deploy. A Worker rollback does not undo database changes. Do not rewrite migrations that have already run. Daily cleanup removes expired uploads, purges deleted media, trims AI counters, and removes short-lived analytics deduplication rows; aggregate statistics remain.

If you migrate from a private customized deployment, review ownership IDs and data handling yourself. There is no supported automatic migration from Accordo's installation.
