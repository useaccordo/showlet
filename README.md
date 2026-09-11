# Showlet

**Small recordings. Clear explanations.**

[Project site](https://useaccordo.github.io/showlet/) · [Installation](#install) · [License](LICENSE)

A lightweight, self-hosted screen recorder and video-sharing app for small teams, built on Cloudflare Workers, R2, D1, and Access. Released by [Accordo](https://useaccordo.com) as a small contribution to the community.

Showlet is software you deploy into **your own Cloudflare account**. It is not a hosted service. It is an early v0.1 release, provided **as is, without warranty or any support commitment**. Read [LICENSE](LICENSE) and [SECURITY.md](SECURITY.md) before deploying.

![Showlet screen illustration](public/assets/showlet-illustration.svg)

## What it does

- Record a browser tab, window, or screen with microphone and supported screen audio.
- Microphone-first setup, audible countdown/start cue, pause, resume, and local review.
- Direct uploads to private R2 storage, with signed multipart uploads for larger files.
- Shareable video links, embeds, optional passcodes, and owner-only management.
- Optional Cloudflare AI transcription and editable title suggestions, before or after publishing.
- A first-login guide, team library, lightweight admin dashboard, and light/dark mode.
- Daily playback-start trends, recording counts, storage totals, and team roles.

Default limits are 15 minutes and 512 MiB per recording. This is a deliberately small tool, not a replacement for a full video platform.

## Before you deploy

You need Node.js 24+, npm, a Cloudflare account with Workers/R2/D1/Workers AI available, a custom hostname on a Cloudflare-managed zone, and permission to configure Cloudflare Access. R2 may require billing enrollment. There is no free-cost guarantee.

Your team signs in through Access; recipients use their video link and optional passcode. **Access must protect `/record`, `/library`, `/api` and every descendant path.** The Worker also verifies signed Access JWTs. There is no development or production authentication bypass.

## Install

```sh
git clone https://github.com/useaccordo/showlet.git
cd showlet
npm ci
npx wrangler login
npx wrangler d1 create showlet
npx wrangler r2 bucket create showlet-media
```

Keep the database ID returned by D1. Create a Cloudflare Access self-hosted application for your chosen hostname and the three protected path prefixes listed above. Add an **Allow → Emails** rule containing only your intended team members. Use email OTP or your preferred identity provider. Copy the application's AUD and your team's Access issuer URL. Allow your initial administrator's email in that policy.

```sh
npm run configure
```

This writes non-secret deployment settings to `wrangler.jsonc`: account ID, hostname, D1 ID, Access issuer/AUD, and initial admin emails. Review the result. If you use different Worker, D1, or bucket names, update them in the file before deploying. Do not commit your deployment configuration to the upstream repository.

Create an **R2 S3 API credential** scoped to Object Read & Write on **only your Showlet bucket**. Keep the bucket private, disable its public development URL, and do not attach a public bucket domain. Install the credentials as Worker secrets:

```sh
npx wrangler secret put R2_ACCESS_KEY_ID
npx wrangler secret put R2_SECRET_ACCESS_KEY
```

Generate a 32-byte random encryption key, store it in your password manager, and install its base64 value using `npx wrangler secret put PASSCODE_ENCRYPTION_KEY`. For example, `openssl rand -base64 32` generates a suitable value. Avoid shell history, screenshots, CI logs, or source control containing secrets. The key allows owners to recover saved video passcodes for sharing; **back it up**. Do not replace it casually: existing encrypted passcodes depend on it.

Configure R2 CORS using [docs/r2-cors.example.json](docs/r2-cors.example.json), replacing the example origin with the exact HTTPS origin of your deployment. Allow PUT and expose ETag. In the R2 dashboard, add a lifecycle rule that aborts incomplete multipart uploads after one day. Keep object auto-deletion off unless you intentionally want that behavior.

```sh
npx wrangler d1 migrations apply DB --remote
npm run check
npm test
npm run deploy
```

Visit `https://YOUR_HOST/signin`, authenticate with your initial admin email, and complete the quick-start guide. **Admin** opens the dashboard. Initial admin emails seed roles on first login only; subsequently manage roles in the dashboard. Email admission is still controlled by Access. Never broaden the Access policy to everyone just to make setup easier.

If Cloudflare asks to create a Worker while installing secrets, use the same Worker name as your reviewed configuration. See [deployment notes](docs/DEPLOYMENT.md) for validation, upgrades, and recovery.

## Customization

Edit `src/branding.ts` for the name, description, about URL, and optional link to your main app. The default does not include an event platform or customer login. Use trusted HTTPS URLs for external links. Replace `public/assets/favicon.svg` and `showlet-illustration.svg` with artwork you have rights to use; adjust the brand styling in `public/app.css`.

`ADMIN_EMAILS`, `MAX_DURATION`, and `MAX_BYTES` live in Wrangler variables. The UI guide describes the defaults; update that copy when changing limits. Domain changes also require updating Access, R2 CORS, and existing distributed video links.

## Cost and limitations

You pay your providers directly. Budget for Workers requests, D1 operations/storage, R2 operations/storage, and optional Workers AI use. Consult current [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/), [R2 pricing](https://developers.cloudflare.com/r2/pricing/), [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/), and [Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/). Prices, quotas, and plan requirements can change.

The app caps AI at 300 audio minutes and 100 title suggestions per UTC day; this is an application guardrail, not a provider billing cap. Failed requests can consume the allowance. Transcription uses 30-second audio chunks and may miss words, repeat phrases, or need editing. Browser decoding depends on available codecs and memory.

Playback statistics are estimates: starts are deduplicated per browser/video/UTC day using a short-lived cookie. Blocked or cleared cookies and bots affect counts. These are not unique-person or billing metrics. Public links are not private unless protected; noindex is not access control. A recipient with both a URL and passcode can forward both.

There is no transcoding pipeline, adaptive bitrate streaming, camera overlay, mobile recording guarantee, SSO provisioning UI, invitation email service, or uptime promise. Screen/audio permission behavior varies by OS and browser. Cross-site embeds of passcode-protected recordings direct recipients to the full video page.

## Community and maintenance

MIT licensed. No warranty, support service, SLA, or promised maintenance schedule. Questions and pull requests may go unanswered. You are responsible for operation, security review, backups, retention, legal obligations, and costs in your deployment.

We use a private customized version at Accordo and intend to consider reusable improvements for Showlet as we make them. That is an intention, not a release or support commitment. See [CONTRIBUTING.md](CONTRIBUTING.md), [maintenance workflow](docs/MAINTENANCE.md), and [third-party notices](THIRD_PARTY_NOTICES.md). Accordo branding, product links, production configuration, and private history are not part of this release.

## Project website

The static project site lives in `site/` and publishes to GitHub Pages through `.github/workflows/pages.yml`. It uses no build system, analytics, third-party fonts, or hosted demo. Edit it alongside product documentation when behavior changes.
