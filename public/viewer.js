const copy = document.querySelector("#copy-share");
copy?.addEventListener("click", async () => {
  const status = document.querySelector("#status");
  if (copy.dataset.protected === "true") {
    await window.copyVideoShare(location.pathname.split("/").pop(), status);
    return;
  }
  try {
    await navigator.clipboard.writeText(location.origin + location.pathname);
    copy.textContent = "Copied!";
    status.textContent =
      copy.dataset.protected === "true"
        ? "Link copied. This video requires a passcode. Remember to share the passcode separately with your recipient."
        : "Link copied.";
    if (copy.dataset.protected === "true") alert(status.textContent);
    setTimeout(() => (copy.textContent = "Copy link"), 2000);
  } catch {
    status.textContent = "Copy the link from your browser’s address bar.";
  }
});

// Keep native controls available when JavaScript is unavailable.
const video = document.querySelector(".watch-card video[data-video-id]");
if (video) {
  const play = document.createElement("button");
  play.type = "button";
  play.className = "video-play-overlay";
  play.setAttribute("aria-label", "Play video");
  play.innerHTML =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" fill="currentColor"/></svg><span>Play video</span>';
  video.parentElement.append(play);
  const status = document.querySelector("#status");
  play.addEventListener("click", async () => {
    play.disabled = true;
    try {
      await video.play();
    } catch {
      play.hidden = false;
      if (status)
        status.textContent =
          "Playback couldn’t start. Try again or use the video controls.";
    } finally {
      play.disabled = false;
    }
  });
  video.addEventListener("playing", () => {
    if (document.activeElement === play) video.focus();
    play.hidden = true;
  });
  video.addEventListener("ended", () => {
    play.setAttribute("aria-label", "Replay video");
    play.querySelector("span").textContent = "Replay video";
    play.hidden = false;
  });
  video.addEventListener("error", () => {
    play.hidden = true;
    if (status)
      status.textContent =
        "The video couldn’t load. Refresh the page to try again.";
  });
}
