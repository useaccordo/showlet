const $ = (s) => document.querySelector(s),
  manager = $("#video-manager"),
  id = manager.dataset.video,
  endpoint = "/api/videos/" + id;
let dirty = false,
  working = false,
  saving = false,
  controller,
  capture,
  suggestion = "",
  captureComplete = false;
async function api(path, method = "GET", data, signal) {
  const r = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json", "X-Showlet-Request": "1" },
    body: data === undefined ? undefined : JSON.stringify(data),
    signal,
  });
  let result;
  try {
    result = await r.json();
  } catch {
    throw Error("Your session may have expired. Sign in again and retry.");
  }
  if (!r.ok) throw Error(result.error || "Request failed. Please retry.");
  return result;
}
const markDirty = () => {
  dirty = true;
  $("#details-status").textContent = "Unsaved changes";
};
$("#manage-title").oninput = markDirty;
$("#manage-transcript").oninput = markDirty;
$("#details-form").onsubmit = async (event) => {
  event.preventDefault();
  if (working || saving) return;
  saving = true;
  $("#save-details").disabled = true;
  const values = {
    title: $("#manage-title").value,
    transcript: $("#manage-transcript").value,
  };
  try {
    await api(endpoint, "PATCH", values);
    dirty =
      values.title !== $("#manage-title").value ||
      values.transcript !== $("#manage-transcript").value;
    $("#details-status").textContent = dirty
      ? "Saved. You have further unsaved changes."
      : "Changes saved. The public page is up to date.";
  } catch (e) {
    $("#details-status").textContent = e.message;
  } finally {
    saving = false;
    $("#save-details").disabled = false;
  }
};
function aiBusy(value) {
  working = value;
  for (const key of [
    "#generate-saved",
    "#suggest-saved",
    "#save-details",
    "#delete-video",
  ])
    $(key).disabled = value;
  $("#cancel-saved").hidden = !value;
}
async function suggest(signal) {
  const transcript = $("#manage-transcript").value;
  if (!transcript.trim()) throw Error("Generate or enter a transcript first.");
  const result = await api(
    "/api/suggest-title",
    "POST",
    { transcript },
    signal,
  );
  suggestion = result.title;
  $("#suggestion-text").textContent = "Suggested title: " + suggestion;
  $("#saved-suggestion").hidden = false;
}
$("#generate-saved").onclick = async () => {
  if (working || saving) return;
  if (
    $("#manage-transcript").value.trim() &&
    !confirm(
      "Replace the transcript in this editor with a newly generated one? Your saved transcript stays unchanged until you save.",
    )
  )
    return;
  controller = new AbortController();
  aiBusy(true);
  try {
    if (!capture) {
      $("#ai-status").textContent =
        "Loading the saved recording… Keep this tab open.";
      const r = await fetch(endpoint + "/media", { signal: controller.signal });
      if (!r.ok || !r.headers.get("Content-Type")?.startsWith("video/"))
        throw Error("Could not load the recording. Sign in again or retry.");
      capture = window.ShowletTranscription.fromFile(await r.blob());
    } else if (captureComplete) {
      capture.texts = [];
      captureComplete = false;
    }
    const transcript = await capture.transcribe(
      (text) => ($("#ai-status").textContent = text),
      controller.signal,
    );
    captureComplete = true;
    if (!transcript)
      throw Error("No speech was detected. You can add a transcript yourself.");
    $("#manage-transcript").value = transcript;
    markDirty();
    $("#ai-status").textContent = "Transcript ready. Suggesting a title…";
    await suggest(controller.signal);
    $("#ai-status").textContent =
      "Review the transcript and suggested title, then save changes.";
  } catch (e) {
    $("#ai-status").textContent =
      e.name === "AbortError"
        ? "Generation cancelled. Your saved recording is unchanged."
        : e.message;
  } finally {
    aiBusy(false);
  }
};
$("#suggest-saved").onclick = async () => {
  if (working || saving) return;
  controller = new AbortController();
  aiBusy(true);
  $("#ai-status").textContent = "Suggesting a title…";
  try {
    await suggest(controller.signal);
    $("#ai-status").textContent =
      "Use the suggestion or reword it, then save changes.";
  } catch (e) {
    $("#ai-status").textContent =
      e.name === "AbortError" ? "Cancelled." : e.message;
  } finally {
    aiBusy(false);
  }
};
$("#apply-suggestion").onclick = () => {
  $("#manage-title").value = suggestion;
  markDirty();
  $("#manage-title").focus();
};
$("#cancel-saved").onclick = () => controller?.abort();
$("#copy-public").onclick = () =>
  window.copyVideoShare(id, $("#sharing-status"));

let sharing = false;
async function savePasscode(passcode) {
  if (sharing) return;
  sharing = true;
  $("#save-passcode").disabled = $("#remove-passcode").disabled = true;
  try {
    await api(endpoint, "PATCH", {
      passcode,
      publicAcknowledged: passcode === null,
    });
    manager.dataset.protected = String(passcode !== null);
    $("#manage-passcode").value = "";
    $("#saved-passcode").value = passcode || "";
    $("#saved-passcode-section").hidden = passcode === null;
    $("#legacy-passcode-hint").hidden = true;
    $('label[for="manage-passcode"]').textContent =
      passcode === null ? "Add a passcode" : "New passcode";
    $("#sharing-state").textContent =
      passcode === null
        ? "Anyone with the link can watch"
        : "Passcode protected";
    $("#remove-passcode").hidden = passcode === null;
    $("#sharing-status").textContent =
      passcode === null
        ? "Passcode removed. Anyone with the link can watch and forward the recording."
        : "Passcode saved. Copy link includes the passcode.";
  } catch (e) {
    $("#sharing-status").textContent = e.message;
  } finally {
    sharing = false;
    $("#save-passcode").disabled = $("#remove-passcode").disabled = false;
  }
}
$("#sharing-form").onsubmit = (event) => {
  event.preventDefault();
  savePasscode($("#manage-passcode").value);
};
$("#remove-passcode").onclick = () => {
  if (
    confirm(
      "Remove the passcode? Anyone with the link can watch and forward this video and its transcript. The link is not private. Continue only if you understand and accept this.",
    )
  )
    savePasscode(null);
};
$("#delete-video").onclick = async () => {
  if (
    working ||
    saving ||
    sharing ||
    !confirm(
      "Permanently delete this recording and its transcript? Its public link will stop working.",
    )
  )
    return;
  $("#delete-video").disabled = true;
  try {
    await api(endpoint, "DELETE");
    dirty = false;
    location.href = "/library";
  } catch (e) {
    $("#details-status").textContent = e.message;
    $("#delete-video").disabled = false;
  }
};
window.addEventListener("beforeunload", (event) => {
  if (dirty || working || saving) {
    event.preventDefault();
    event.returnValue = "";
  }
});

$("#format-transcript").onclick = () => {
  const field = $("#manage-transcript");
  field.value = window.ShowletTranscription.format(
    field.value.split(/\n\s*\n/),
  );
  markDirty();
  $("#details-status").textContent =
    "Formatting updated. Review the transcript, then save changes.";
};
