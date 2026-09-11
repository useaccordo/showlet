const player = document.querySelector("video[data-video-id]");
let counted = false;
player?.addEventListener("playing", async () => {
  if (counted) return;
  counted = true;
  try {
    const response = await fetch("/playback/" + player.dataset.videoId, {
      method: "POST",
      headers: { "X-Showlet-Request": "1" },
      keepalive: true,
    });
    if (!response.ok) counted = false;
  } catch {
    counted = false;
  }
});
