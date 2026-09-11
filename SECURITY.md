# Security

Showlet is an early, self-hosted community release, provided as is without warranty or security-response commitments. No supported-version or patch-response SLA is offered. It has not undergone an independent security audit. Deployers should review and test it for their own requirements.

If you find a vulnerability, use GitHub's **Report a vulnerability** option in this repository's Security tab when available. Do not publish credentials, private video links, transcripts, or exploit details in an issue or pull request. Acknowledgment or remediation is not guaranteed; if private reporting is unavailable, do not disclose sensitive information publicly as a fallback.

Security boundaries: Cloudflare Access admission plus JWT verification for team routes; owner checks for management and media preview; admin role checks; origin/header checks for mutations; salted passcode hashes for verification; AES-GCM-encrypted passcodes for owner sharing; private R2 with short-lived signed upload URLs. Saved encryption keys, session tokens, and S3 credentials must be treated as secrets.

Passcodes protect links, not against authorized recipients resharing them. Email OTP depends on mailbox security. Playback events are lightweight telemetry, not tamper-proof accounting. Deployers own monitoring, backups, abuse response, data retention, consent requirements, upgrades, and incident handling.
