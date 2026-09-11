document.querySelector("#complete-onboarding").onclick = async () => {
  const button = document.querySelector("#complete-onboarding"),
    status = document.querySelector("#help-status");
  button.disabled = true;
  try {
    const response = await fetch("/api/onboarding", {
      method: "POST",
      headers: { "X-Showlet-Request": "1" },
    });
    if (!response.ok)
      throw Error("Could not save your progress. Please try again.");
    const next = new URLSearchParams(location.search).get("next") || "/library";
    location.href = /^\/(?:record|library(?:\/(?:admin|[\w-]{22}))?)$/.test(
      next,
    )
      ? next
      : "/library";
  } catch (error) {
    status.textContent = error.message;
    button.disabled = false;
  }
};
