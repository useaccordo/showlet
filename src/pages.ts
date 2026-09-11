import { branding } from "./branding";
import { Env, Video } from "./types";
export const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export function page(
  name: string,
  content: string,
  head = "",
  script = "",
  staff = false,
  staffLink = "/signin",
) {
  const nav = staff
    ? `<a href="/record" ${name === "Record" ? 'aria-current="page"' : ""}>Record</a><a href="/library" ${name === "Library" || name === "Manage video" ? 'aria-current="page"' : ""}>Library</a>`
    : `<a href="${escape(branding.aboutUrl)}">About Showlet <span aria-hidden="true">↗</span></a><a href="${escape(staffLink)}">${staffLink === "/signin" ? "Team sign in" : "Manage video"}</a>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><script src="/theme.js?v=20260910-public-links"></script><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${escape(name)} · ${escape(branding.name)}</title><link rel="icon" type="image/svg+xml" href="/assets/favicon.svg"><meta name="theme-color" content="#152257"><link rel="stylesheet" href="/app.css?v=20260910-public-links"><script src="/playback.js" defer></script><script src="/local-time.js?v=20260910-public-links" defer></script><script src="/copy-share.js?v=20260910-public-links" defer></script>${head}</head><body><header class="app-header"><div class="header-inner"><a href="${staff ? "/library" : escape(branding.aboutUrl)}" class="brand" aria-label="${escape(branding.name)}"><img src="/assets/favicon.svg" alt="" width="40" height="40"><span class="brand-name">${escape(branding.name)}</span></a><nav aria-label="Main navigation">${nav}${staff ? `<a href="/library/admin">Admin</a><a href="/library/help" ${name === "Help" ? 'aria-current="page"' : ""}>Help</a>` : ""}<button id="theme-toggle" class="secondary theme-toggle" type="button" aria-label="Switch color theme">Theme</button></nav></div></header><main>${content}</main>${script ? `<script src="${script}?v=20260910-public-links" defer></script>` : ""}</body></html>`;
}
export const missing = () =>
  page(
    "Not found",
    "<h1>This recording isn’t available.</h1><p>It may have been deleted, or the link is incorrect.</p>",
  );
export function recording(env: Env) {
  return page(
    "Record",
    `<div class="heading"><div><p class="eyebrow">SHARE A LITTLE CLARITY</p><h1>Show them how.</h1></div></div><section data-max-duration="${Number(env.MAX_DURATION)}" data-max-bytes="${Number(env.MAX_BYTES)}" id="recorder"><div class="preview"><video id="preview" autoplay muted playsinline></video><span id="countdown"></span></div><div class="controls"><button id="start">Enable microphone</button><button id="pause" disabled>Pause</button><button id="stop" disabled>Stop</button><strong id="timer">00:00</strong></div><p id="status" role="status">First enable your microphone, then choose a screen. Turn your sound on: three countdown beeps, then a start chime when recording begins. Screen and microphone. Up to ${Number(env.MAX_DURATION) / 60} minutes.</p><form id="publish-form" class="publish-review" hidden><p class="eyebrow">REVIEW &amp; PUBLISH</p><h2>Give your recording a clear title.</h2><p>Your video stays in this browser until you publish it.</p><div class="ai-options"><button id="generate-transcript" type="button" class="secondary">Generate transcript &amp; suggest title</button><button id="cancel-generation" type="button" class="secondary" hidden>Cancel generation</button><p class="fine-print">Optional. Audio is processed privately by Cloudflare to create a transcript and suggest a title. Nothing is published yet.</p><p id="ai-status" role="status"></p></div><label for="title">Recording title</label><input id="title" maxlength="200" required placeholder="e.g. How to update your sponsor profile" aria-describedby="title-hint"><p id="title-hint" class="fine-print">Choose a title that tells viewers what they’ll learn, instead of a date and time.</p><div id="title-suggestion" hidden><p id="suggested-title"></p><button id="use-suggestion" type="button" class="secondary">Use suggested title</button></div><div id="transcript-review" hidden><label for="transcript-text">Transcript</label><textarea id="transcript-text" rows="8" maxlength="60000" aria-describedby="transcript-hint"></textarea><p id="transcript-hint" class="fine-print">AI-generated. Review names and details before publishing.</p><label class="check-label"><input type="checkbox" id="include-transcript" checked> Include transcript with the published video</label></div><label class="check-label"><input id="protect-video" type="checkbox"> Require a passcode to watch</label><div id="passcode-options" hidden><label for="publish-passcode">Video passcode</label><input id="publish-passcode" type="text" autocomplete="off" spellcheck="false" autocapitalize="none" minlength="8" maxlength="128" disabled><p class="fine-print">Use 8–128 characters. Copy link will include the passcode.</p></div><div id="public-warning" class="sharing-warning"><strong>Anyone with this link can watch and forward this video and its transcript.</strong><p>We ask search engines not to index recordings, but the link is not private. Add a passcode for customer or confidential information.</p><label class="check-label"><input id="public-acknowledged" type="checkbox" required> I understand—publish without a passcode</label></div><div class="controls"><button id="publish" type="submit">Publish video</button><button id="discard" class="secondary" type="button">Discard recording</button></div></form><progress id="progress" max="100" value="0" hidden></progress><div id="result" hidden><a id="share" target="_blank" rel="noopener"></a><button id="copy">Copy link</button><a id="manage-recording" class="button secondary-link" hidden>Manage video</a></div><a id="download" hidden>Download recording</a><button id="retry" hidden>Retry upload</button></section>`,
    '<script src="/transcription.js?v=20260910-public-links" defer></script>',
    "/record.js",
    true,
  );
}
export const library = () =>
  page(
    "Library",
    '<div class="heading"><div><p class="eyebrow">YOUR RECORDINGS</p><h1>A little help, on demand.</h1></div><a class="button" href="/record">New recording</a></div><p id="status" role="status"></p><div id="videos"></div>',
    "",
    "/library.js",
    true,
  );
export function locked(id: string, embed = false) {
  return page(
    "Protected recording",
    `<section class="unlock-card"><div class="lock-mark" aria-hidden="true">⌑</div><p class="eyebrow">JUST FOR YOU</p><h1>A little privacy.</h1><p>This recording is protected. Enter the passcode shared with you to watch.</p>${embed ? `<a class="button" href="/v/${id}" target="_blank" rel="noopener">Open recording to unlock ↗</a><p class="fine-print">Protected recordings open in their own tab.</p>` : `<form id="unlock" data-video="${id}"><label for="passcode">Video passcode</label><input id="passcode" type="text" autocomplete="off" spellcheck="false" autocapitalize="none" required maxlength="128" autofocus><button type="submit">Unlock recording</button><p id="status" role="status"></p></form>`}</section>${embed ? "" : publicLinks()}`,
    "",
    embed ? "" : "/unlock.js",
  );
}
function publicLinks() {
  return `<section class="public-destinations"><h2>Made with ${escape(branding.name)}</h2><div class="landing-actions"><a class="button" href="${escape(branding.aboutUrl)}" target="_blank" rel="noopener">About ${escape(branding.name)} ↗</a>${branding.appUrl ? `<a class="button secondary-link" href="${escape(branding.appUrl)}" target="_blank" rel="noopener">Open app ↗</a>` : ""}</div></section>`;
}
export function share(v: Video, env: Env, embed: boolean) {
  const name = escape(v.title),
    url = `${env.ORIGIN}/v/${v.id}`,
    poster = `${env.ORIGIN}/thumb/${v.id}`,
    seconds = Math.max(0, Math.round(v.duration_sec)),
    duration = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`,
    player = `<video data-video-id="${v.id}" aria-label="${name}" controls playsinline preload="metadata" poster="${poster}" src="/media/${v.id}"></video>`;
  if (embed)
    return `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${name}</title><link rel="icon" type="image/svg+xml" href="/assets/favicon.svg"><meta name="theme-color" content="#152257"><link rel="stylesheet" href="/app.css?v=20260910-public-links"></head><body class="embed">${player}<script src="/playback.js" defer></script></body></html>`;
  return page(
    v.title,
    `<div class="watch-heading"><p class="eyebrow">A LITTLE CLARITY, FROM SHOWLET</p><h1>${name}</h1><div class="watch-meta"><span><time data-local-time datetime="${escape(v.created_at)}">${escape(new Date(v.created_at).toUTCString())}</time></span><span class="meta-dot" aria-hidden="true">·</span><span>${duration}</span>${v.passcode_hash ? '<span class="privacy-badge">Passcode protected</span>' : ""}</div></div><div class="watch-card"><div class="player">${player}</div><div class="player-footer"><span>Made to make things clear.</span><button class="secondary" id="copy-share" data-protected="${!!v.passcode_hash}">Copy link</button></div></div><p id="status" role="status" class="watch-status"></p>${v.transcript ? `<section class="transcript-panel"><div class="heading"><h2>Transcript</h2></div><p class="fine-print">AI-generated transcript. Names and details may contain errors.</p><div id="video-transcript">${escape(v.transcript)}</div></section>` : ""}<p class="watch-note">A quick walkthrough. A helpful answer. A little less back-and-forth.</p>${publicLinks()}`,
    v.passcode_hash
      ? ""
      : `<meta property="og:type" content="video.other"><meta property="og:title" content="${name}"><meta property="og:site_name" content="Showlet"><meta property="og:url" content="${url}"><meta property="og:image" content="${poster}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${name}"><meta name="twitter:image" content="${poster}">`,
    "/viewer.js",
    false,
    `/library/${v.id}`,
  );
}

export function manage(
  v: Video,
  env: Env,
  savedPasscode: string | null = null,
) {
  return page(
    "Manage video",
    `<div id="video-manager" data-video="${v.id}" data-protected="${!!v.passcode_hash}" data-bytes="${v.size_bytes}"><a class="back-link" href="/library">← Back to library</a><div class="heading"><div><p class="eyebrow">YOUR RECORDING</p><h1>Make it ready to share.</h1></div><a class="button secondary-link" href="/v/${v.id}" target="_blank" rel="noopener">View public page ↗</a></div><div class="management-player player"><video id="managed-player" controls playsinline preload="metadata" poster="/api/videos/${v.id}/thumb" src="/api/videos/${v.id}/media"></video></div><p class="fine-print"><time data-local-time datetime="${escape(v.created_at)}">${escape(new Date(v.created_at).toUTCString())}</time> · ${Math.round(v.duration_sec)} seconds · ${v.views} views</p><div class="management-grid"><section><form id="details-form"><h2>Video details</h2><label for="manage-title">Title</label><input id="manage-title" value="${escape(v.title)}" maxlength="200" required><div class="ai-options"><div class="actions"><button id="generate-saved" type="button" class="secondary">${v.transcript ? "Regenerate transcript" : "Generate transcript"}</button><button id="format-transcript" type="button" class="secondary">Format transcript</button><button id="suggest-saved" type="button" class="secondary">Suggest title</button><button id="cancel-saved" type="button" class="secondary" hidden>Cancel</button></div><p class="fine-print">Generate from the saved recording, then review and save your changes. AI-generated text may contain errors.</p><p id="ai-status" role="status"></p><div id="saved-suggestion" hidden><p id="suggestion-text"></p><button id="apply-suggestion" class="secondary" type="button">Use suggested title</button></div></div><label for="manage-transcript">Transcript</label><textarea id="manage-transcript" rows="10" maxlength="60000" placeholder="Generate a transcript or add your own.">${escape(v.transcript || "")}</textarea><p class="fine-print">Saving a transcript makes it available to the same viewers as the video. Clear this field to remove it.</p><button id="save-details" type="submit">Save changes</button><p id="details-status" role="status"></p></form></section><aside><section class="sharing-card"><h2>Sharing</h2><p id="sharing-state">${v.passcode_hash ? "Passcode protected" : "Anyone with the link can watch"}</p><p class="fine-print">Send the recording link and, when protected, its passcode to your recipient.</p><div class="share-details"><label for="public-link">Public link</label><input id="public-link" readonly value="${escape(env.ORIGIN)}/v/${v.id}"><div id="saved-passcode-section" ${v.passcode_hash ? "" : "hidden"}><label for="saved-passcode">Current passcode</label><input id="saved-passcode" type="text" readonly value="${escape(savedPasscode || "")}"><p id="legacy-passcode-hint" class="fine-print" ${savedPasscode ? "hidden" : ""}>Set the passcode again once to make it visible here.</p></div><button id="copy-public">Copy share details</button></div><form id="sharing-form"><h3>Update access</h3><label for="manage-passcode">${v.passcode_hash ? "New passcode" : "Add a passcode"}</label><input id="manage-passcode" type="text" autocomplete="off" spellcheck="false" autocapitalize="none" minlength="8" maxlength="128" required><p class="fine-print">Changing the passcode signs out current viewers. Copy link includes the passcode.</p><button id="save-passcode" type="submit">Save passcode</button></form><button id="remove-passcode" class="secondary" ${v.passcode_hash ? "" : "hidden"}>Remove passcode</button><p id="sharing-status" role="status"></p></section><section class="delete-section"><h2>Delete recording</h2><p class="fine-print">Permanently removes the video and disables its public link.</p><button id="delete-video" class="secondary">Delete recording</button></section></aside></div></div>`,
    '<script src="/transcription.js?v=20260910-public-links" defer></script>',
    "/manage.js",
    true,
  );
}

export function signIn() {
  return page(
    "Sign in",
    `<section class="signin-card"><p class="eyebrow">TEAM RECORDINGS</p><h1>Show someone how.</h1><p>Record walkthroughs, share helpful answers, and manage your team's videos.</p><a class="button" href="/library">Continue to recordings →</a><p class="fine-print">Continue through Cloudflare Access with your approved email address. If you received a recording link, open that link to watch instead.</p></section>`,
  );
}
export function landing() {
  return page(
    "Recordings",
    `<div class="landing-hero"><div class="landing-copy"><p class="eyebrow">${escape(branding.name)}</p><h1>A little clarity.<br><span>Ready to share.</span></h1><p class="landing-lead">${escape(branding.description)}</p><p>Have a video link? Open it to watch your recording. Team members can sign in to create and manage videos.</p><div class="landing-actions"><a class="button" href="/signin">Team sign in →</a><a class="button secondary-link" href="${escape(branding.aboutUrl)}">About ${escape(branding.name)}</a>${branding.appUrl ? `<a class="button secondary-link" href="${escape(branding.appUrl)}">Open app ↗</a>` : ""}</div></div><div class="landing-art"><img src="/assets/showlet-illustration.svg" width="480" height="360" alt="A screen recording window with a play button and timeline"></div></div><div class="landing-note"><strong>Here for a recording?</strong><p>Use the link from your email or message, and enter the passcode if one was provided.</p></div>`,
  );
}
