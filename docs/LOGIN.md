# Set up team login

Showlet's sign-in page links to `/library`. Cloudflare Access handles authentication there, and Showlet verifies the signed token. There is no Showlet password database, SMTP setup, OAuth callback to register in Showlet, or manual user-creation step. `npx wrangler login` authenticates the person deploying the Worker only.

## 1. Create or select your Zero Trust organization

Open your Cloudflare account's **Zero Trust** dashboard. If this is your first use, finish onboarding, choose a plan, and choose a team name. Under **Zero Trust → Settings**, find the team domain, such as `your-team.cloudflareaccess.com`. Your Showlet `ACCESS_ISSUER` is `https://your-team.cloudflareaccess.com` (no trailing slash), not your recording hostname. [Cloudflare organization setup](https://developers.cloudflare.com/cloudflare-one/faq/getting-started-faq/)

## 2. Enable email codes

In **Zero Trust → Integrations → Identity providers**, choose **Add new identity provider → One-time PIN**. Reuse it if already configured. New organizations do not automatically have OTP enabled. Cloudflare sends the codes; Showlet needs no email-service credentials. [Cloudflare OTP setup](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/one-time-pin/)

If you prefer an existing identity provider, configure that provider instead and select it in the next step. The instructions below assume email OTP.

## 3. Create one Access application

Under **Zero Trust → Access controls → Applications**, choose **Create new application → Self-hosted and private → Add public hostname**. Name it `Showlet team`. Add these three public-hostname entries to **the same application**, replacing the example hostname:

| Hostname            | Path      |
| ------------------- | --------- |
| `clips.example.com` | `record`  |
| `clips.example.com` | `library` |
| `clips.example.com` | `api`     |

These parent paths also protect their descendants through Access's path inheritance. Do not substitute only `library/*`: that wildcard excludes `/library` itself. Check that no existing, more-specific application overrides these paths. [Cloudflare path matching](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/app-paths/)

Do not leave the Path field blank or protect the entire hostname: `/`, `/signin`, static assets, and recipient routes such as `/v/…`, `/e/…`, `/media/…`, `/thumb/…`, and `/playback/…` must remain outside team Access. Showlet enforces video passcodes itself.

Attach a policy with **Action: Allow**, **Include selector: Emails**, and the exact email addresses of your team, including yourself. In the application's login methods, explicitly select **One-time PIN**; disable “Accept all available identity providers” if you want OTP only. Choose a session duration (for example, 24 hours), then save the application. Menu labels may vary slightly. [Cloudflare application setup](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public-app/)

Do not use an Everyone or Bypass policy. An OTP login-method rule alone is not an email allowlist. One application matters because Showlet accepts one `ACCESS_AUD`; separate applications can issue different audiences. This Worker deployment needs no Cloudflare Tunnel or WARP client.

## 4. Connect Access to Showlet

Open the saved application's settings and copy **Application Audience (AUD) Tag** from **Additional settings**. This is not the application UUID or a Cloudflare API token. [Cloudflare token validation](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/)

Run `npm run configure` and supply:

- `ACCESS_ISSUER`: the HTTPS team domain from step 1.
- `ACCESS_AUD`: the audience tag from this application.
- `ADMIN_EMAILS`: your intended initial administrator email(s), also allowed by the Access policy.

Finish the storage, secrets, migrations, and deployment steps in the [README](../README.md#install). Set initial admin emails **before the first login**: Showlet creates the user and seeds their role on that first authenticated request. Later changes to this variable do not promote an existing member; an existing administrator can change roles in Admin.

## 5. Verify login after deploying

1. Open `https://clips.example.com/signin` in a private browser window and click **Continue to recordings**.
2. Enter an allowed email on Cloudflare's page, receive the code, and enter it. Complete Showlet's first-login guide; your initial administrator should see **Admin** in the header.
3. Check `/record`, `/library`, `/library/help`, `/library/admin`, and `/api/videos` in a separate signed-out window: Access should intercept each. An unapproved email must not gain access.
4. Open a shared video in a signed-out window: it should show the video or its video-passcode prompt, without a team login.

For new teammates, update the Access email allowlist. Their Showlet user row appears after their first login; there is no invitation email sent by Showlet. Use the dashboard for Showlet roles and disabled status.

## If something goes wrong

| Symptom                                              | Check                                                                                     |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| No email-code option                                 | OTP exists in Identity providers and is selected for this application.                    |
| No code received                                     | Exact allowed email, spam folder, and Access authentication logs.                         |
| Showlet says login required without an Access prompt | Hostname/path coverage, especially the parent `/library` path.                            |
| Invalid staff session after login                    | Issuer and AUD match the same saved Access application; redeploy corrected configuration. |
| Login works but no Admin link                        | Initial admin email was configured before that user's first login.                        |
| Recipients are asked for a team login                | A hostname-wide or overlapping Access application is protecting public routes.            |
