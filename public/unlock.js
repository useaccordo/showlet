const form = document.querySelector("#unlock");
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = form.querySelector("button"),
    status = document.querySelector("#status");
  button.disabled = true;
  status.textContent = "Unlocking…";
  try {
    const r = await fetch("/unlock/" + form.dataset.video, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Showlet-Request": "1" },
      body: JSON.stringify({
        passcode: document.querySelector("#passcode").value,
      }),
    });
    const data = await r.json();
    if (!r.ok) throw Error(data.error || "Could not unlock. Please retry.");
    location.reload();
  } catch (e) {
    status.textContent = e.message;
    button.disabled = false;
  }
});
