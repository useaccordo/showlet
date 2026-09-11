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
