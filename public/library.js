const status = document.querySelector("#status"),
  list = document.querySelector("#videos");
async function api(path, method = "GET", data) {
  const r = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json", "X-Showlet-Request": "1" },
    body: data ? JSON.stringify(data) : undefined,
  });
  const result = await r.json();
  if (!r.ok)
    throw Error(result.error || "Request failed. Sign in again or retry.");
  return result;
}
const el = (tag, text) => {
  const n = document.createElement(tag);
  if (text) n.textContent = text;
  return n;
};
async function load() {
  try {
    const videos = await api("/api/videos");
    list.replaceChildren();
    status.textContent = videos.length
      ? ""
      : "Your first recording starts here.";
    for (const v of videos) {
      const card = el("article");
      card.className = "card";
      const img = el("img");
      img.src = "/api/videos/" + v.id + "/thumb";
      img.alt = "";
      const info = el("div"),
        link = el("a", v.title);
      link.href = "/library/" + v.id;
      const h = el("h2");
      h.append(link);
      info.append(
        h,
        el(
          "p",
          `${window.ShowletLocalTime(v.created_at)} · ${Math.round(v.duration_sec)} seconds · ${v.views} views`,
        ),
      );
      const actions = el("div");
      actions.className = "actions";
      const manage = el("a", "Manage video");
      manage.className = "button";
      manage.href = "/library/" + v.id;
      actions.append(manage);
      for (const [name, action] of [
        [
          "Copy link",
          async () => {
            await window.copyVideoShare(v.id, status);
          },
        ],
        [
          "Rename",
          async () => {
            const name = prompt("Recording title", v.title);
            if (name) {
              await api("/api/videos/" + v.id, "PATCH", { title: name });
              await load();
            }
          },
        ],
        ["Sharing", async () => sharing(v)],
        [
          "Delete",
          async () => {
            if (
              confirm(
                "Delete this recording? Its share link will stop working.",
              )
            ) {
              await api("/api/videos/" + v.id, "DELETE");
              await load();
            }
          },
        ],
      ]) {
        const b = el("button", name);
        b.className = "secondary";
        b.onclick = async () => {
          b.disabled = true;
          try {
            await action();
          } catch (e) {
            status.textContent = e.message;
          } finally {
            b.disabled = false;
          }
        };
        actions.append(b);
      }
      card.append(img, info, actions);
      list.append(card);
    }
  } catch (e) {
    status.textContent = e.message;
  }
}
load();

function sharing(v) {
  const dialog = el("dialog"),
    form = el("form"),
    heading = el("h2", "Sharing settings"),
    description = el(
      "p",
      v.passcode_protected
        ? "A passcode is required to watch. Set a new one or remove protection."
        : "Anyone with the link can watch. Add a passcode for more privacy.",
    ),
    label = el("label", v.passcode_protected ? "New passcode" : "Passcode"),
    input = el("input"),
    note = el(
      "p",
      "Use 8–128 characters. Share the passcode separately. Changing it signs out existing viewers.",
    ),
    error = el("p"),
    actions = el("div"),
    save = el("button", "Save passcode"),
    cancel = el("button", "Cancel");
  input.id = "sharing-passcode";
  input.type = "password";
  input.autocomplete = "new-password";
  input.minLength = 8;
  input.maxLength = 128;
  input.required = true;
  label.htmlFor = input.id;
  heading.id = "sharing-heading";
  dialog.setAttribute("aria-labelledby", heading.id);
  error.setAttribute("role", "status");
  actions.className = "dialog-actions";
  save.type = "submit";
  cancel.type = "button";
  cancel.className = "secondary";
  cancel.onclick = () => dialog.close();
  actions.append(save, cancel);
  async function update(passcode) {
    save.disabled = true;
    try {
      await api("/api/videos/" + v.id, "PATCH", {
        passcode,
        publicAcknowledged: passcode === null,
      });
      dialog.close();
      await load();
      status.textContent =
        passcode === null
          ? "Passcode removed. Anyone with the link can watch."
          : "Passcode saved. Copy link includes the passcode.";
    } catch (e) {
      error.textContent = e.message;
      save.disabled = false;
    }
  }
  if (v.passcode_protected) {
    const remove = el("button", "Remove passcode");
    remove.type = "button";
    remove.className = "secondary";
    remove.onclick = async () => {
      if (
        confirm(
          "Remove the passcode? Anyone with the link can watch and forward this video and its transcript. The link is not private. Continue only if you understand and accept this.",
        )
      ) {
        remove.disabled = true;
        await update(null);
        remove.disabled = false;
      }
    };
    actions.append(remove);
  }
  form.onsubmit = (event) => {
    event.preventDefault();
    update(input.value);
  };
  form.append(label, input, note, error, actions);
  dialog.append(heading, description, form);
  document.body.append(dialog);
  dialog.addEventListener("close", () => dialog.remove());
  dialog.showModal();
  input.focus();
}
