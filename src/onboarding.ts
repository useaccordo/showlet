import { Env, HttpError, json } from "./types";
import { page } from "./pages";
export async function onboarding(
  request: Request,
  env: Env,
  owner: string,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname === "/api/onboarding") {
    if (request.method !== "POST")
      throw new HttpError(405, "Method not allowed");
    await env.DB.prepare(
      "UPDATE staff_users SET onboarding_completed_at=? WHERE id=?",
    )
      .bind(new Date().toISOString(), owner)
      .run();
    return json({ ok: true });
  }
  if (url.pathname === "/library/help")
    return new Response(
      page(
        "Help",
        `
 <div class="heading"><div><p class="eyebrow">WELCOME TO SHOWLET RECORDINGS</p><h1>A clear walkthrough starts here.</h1><p>Record your screen, review your video, and share it with the right people.</p></div></div>
 <section class="help-intro"><h2>Your first recording</h2><ol class="help-steps">
 <li><h3>Enable your microphone</h3><p>Open <strong>Record</strong>, click <strong>Enable microphone</strong>, and approve the browser prompt. Then click <strong>Choose screen &amp; record</strong>. Use a desktop browser.</p></li>
 <li><h3>Choose what to show</h3><p>Select a tab, window, or screen. Close private content first. If you need audio from the selected tab, enable the browser's audio-sharing option when available.</p></li>
 <li><h3>Listen for the start</h3><p>You'll hear three countdown beeps, then a higher start chime. Begin speaking after the chime. Keep your sound on; headphones help avoid microphone pickup.</p><p>Return to the recorder tab to <strong>Pause</strong>, <strong>Resume</strong>, or <strong>Stop</strong>. Each recording can be up to 15 minutes and 512 MB.</p></li>
 <li><h3>Review before publishing</h3><p>After stopping, your recording stays in this browser until you publish. Give it a useful title, or choose <strong>Generate transcript &amp; suggest title</strong>. Review AI-generated wording and edit anything that needs correction.</p><p>Keep this tab open until publishing finishes. You can download a local copy if an upload fails.</p></li>
 <li><h3>Choose access and share</h3><p>Add a passcode before publishing for customer or confidential content. Without one, anyone with the link can watch and forward the recording and transcript.</p><p><strong>Copy link</strong> or <strong>Copy share details</strong> prepares the title, link, and saved passcode together. Anyone receiving those details can watch. Paste the message into your email or chat.</p></li>
 </ol></section>
 <section class="help-return"><h2>Come back to any video</h2><p>Open <strong>Library</strong> and click the recording title or <strong>Manage video</strong> to edit its title, generate or format a transcript, update its passcode, or delete it. Review transcript changes and click <strong>Save changes</strong>.</p><p>The public video page is what recipients see. Your management page contains the staff tools.</p><p>Use the header's <strong>Light / Dark</strong> toggle to choose your appearance. This guide is always available under <strong>Help</strong>.</p></section>
 <section class="help-return"><h2>If something doesn't work</h2><ul><li><strong>No microphone:</strong> allow microphone access for showlet.example in your browser's site settings, then try again.</li><li><strong>Can't share your screen:</strong> check the browser's screen-recording permission in your computer's privacy settings. A browser restart may be required.</li><li><strong>Can't sign in:</strong> use your approved email. Ask your administrator to check your team access if needed.</li><li><strong>Transcript needs cleanup:</strong> use Format transcript, review incomplete wording, and save your edits.</li></ul></section>
 <div class="help-continue"><button id="complete-onboarding">Got it — continue</button><p id="help-status" role="status">You can return to this guide anytime using Help in the header.</p></div>`,
        "",
        "/help.js",
        true,
      ),
      { headers: { "Content-Type": "text/html;charset=utf-8" } },
    );
  if (
    request.method === "GET" &&
    (url.pathname === "/record" ||
      url.pathname === "/library" ||
      url.pathname.startsWith("/library/"))
  ) {
    const user = await env.DB.prepare(
      "SELECT onboarding_completed_at FROM staff_users WHERE id=?",
    )
      .bind(owner)
      .first<{ onboarding_completed_at: string | null }>();
    if (user && !user.onboarding_completed_at)
      return new Response(null, {
        status: 302,
        headers: {
          Location: "/library/help?next=" + encodeURIComponent(url.pathname),
          "Cache-Control": "no-store",
        },
      });
  }
  return null;
}
