window.copyVideoShare = async (id, status) => {
  const dialog = document.createElement("dialog"),
    heading = document.createElement("h2"),
    context = document.createElement("p"),
    label = document.createElement("label"),
    message = document.createElement("p"),
    text = document.createElement("textarea"),
    copy = document.createElement("button"),
    close = document.createElement("button"),
    linkOnly = document.createElement("button"),
    actions = document.createElement("div");
  dialog.className = "share-dialog";
  context.textContent =
    "Paste these details into an email or message to invite someone to watch.";
  label.textContent = "Message to share";
  label.htmlFor = "share-message";
  text.id = "share-message";
  message.className = "share-feedback";
  heading.textContent = "Share this recording";
  heading.id = "share-copy-heading";
  dialog.setAttribute("aria-labelledby", heading.id);
  message.textContent = "Preparing share details…";
  message.setAttribute("role", "status");
  text.readOnly = true;
  text.rows = 8;
  text.setAttribute("aria-label", "Link and passcode to share");
  text.hidden = true;
  copy.textContent = "Copy everything";
  copy.disabled = true;
  close.textContent = "Close";
  close.className = "secondary";
  actions.className = "dialog-actions";
  linkOnly.textContent = "Copy link only";
  linkOnly.className = "secondary";
  linkOnly.onclick = async () => {
    try {
      await navigator.clipboard.writeText(location.origin + "/v/" + id);
      message.textContent = "Link copied without the passcode.";
    } catch {
      message.textContent = "Copy the video link from its public page.";
    }
  };
  actions.append(copy, linkOnly);
  const footer = document.createElement("div");
  footer.className = "share-footer";
  footer.append(close);
  dialog.append(heading, context, label, text, actions, message, footer);
  document.body.append(dialog);
  dialog.showModal();
  close.onclick = () => dialog.close();
  dialog.onclose = () => dialog.remove();
  const details = fetch(`/api/videos/${id}/share`, { redirect: "error" }).then(
    async (response) => {
      const result = await response.json();
      if (!response.ok)
        throw Error(result.error || "Could not load share details.");
      return result;
    },
  );
  // A promised ClipboardItem preserves Safari's user gesture during the request.
  const automatic =
    navigator.clipboard.write && window.ClipboardItem
      ? navigator.clipboard
          .write([
            new ClipboardItem({
              "text/plain": details.then(
                (result) => new Blob([result.text], { type: "text/plain" }),
              ),
            }),
          ])
          .then(
            () => true,
            () => false,
          )
      : Promise.resolve(false);
  try {
    const result = await details;
    text.value = result.text;
    context.textContent = result.protected
      ? "Send the message below by email or chat. Your recipient needs both the link and passcode to watch."
      : "Send the message below by email or chat. Anyone with the link can watch this recording.";
    text.hidden = false;
    copy.disabled = false;
    const copied = await automatic;
    message.textContent = copied
      ? result.protected
        ? "Copied the link and passcode together. Anyone receiving these details can watch."
        : "Share details copied."
      : "Ready to share. Choose Copy everything below.";
    if (status) status.textContent = message.textContent;
    copy.onclick = async () => {
      try {
        await navigator.clipboard.writeText(text.value);
        message.textContent = "Copied everything.";
        if (status)
          status.textContent = result.protected
            ? "Link and passcode copied together."
            : "Share details copied.";
      } catch {
        message.textContent = "Select and copy the share details above.";
        text.focus();
        text.select();
      }
    };
  } catch (error) {
    message.textContent =
      error instanceof TypeError
        ? "Sign in as the recording owner to copy the passcode. You can still copy the link only."
        : error.message || "Could not load share details.";
    if (status) status.textContent = message.textContent;
  }
};
