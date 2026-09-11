const el = (tag, text) => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  return node;
};
const status = document.querySelector("#admin-status");
async function loadAdmin() {
  try {
    const days = Number(document.querySelector("#analytics-period").value);
    const response = await fetch("/api/admin?days=" + days);
    const data = await response.json();
    if (!response.ok) throw Error(data.error);
    const stats = document.querySelector("#admin-stats");
    stats.replaceChildren();
    for (const [label, value] of [
      ["Recordings", data.stats.recordings],
      ["Storage", (data.stats.bytes / 1048576).toFixed(1) + " MB"],
      [
        "Playback starts · period",
        data.daily.reduce((sum, d) => sum + d.views, 0),
      ],
      ["Historical page opens", data.stats.legacyViews],
    ]) {
      const card = el("section");
      card.append(el("p", label), el("strong", String(value)));
      stats.append(card);
    }
    const chart = document.querySelector("#views-chart");
    chart.replaceChildren();
    const totals = new Map(data.daily.map((row) => [row.day, row.views]));
    const rows = Array.from({ length: days }, (_, i) => {
      const date = new Date(data.since + "T00:00:00Z");
      date.setUTCDate(date.getUTCDate() + i);
      const day = date.toISOString().slice(0, 10);
      return { day, views: totals.get(day) || 0 };
    });
    // Native meters remain accessible without inline styles or a chart dependency.
    const max = Math.max(1, ...rows.map((row) => row.views));
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 720 190");
    svg.setAttribute("role", "img");
    svg.setAttribute(
      "aria-label",
      `Daily playback starts over the last ${days} days. Daily totals are available below.`,
    );
    rows.forEach((row, index) => {
      const bar = document.createElementNS(svg.namespaceURI, "rect");
      const height = (row.views / max) * 150;
      bar.setAttribute("x", String((index * 720) / days));
      bar.setAttribute("y", String(160 - height));
      bar.setAttribute("width", String(Math.max(2, 720 / days - 3)));
      bar.setAttribute("height", String(Math.max(1, height)));
      const title = document.createElementNS(svg.namespaceURI, "title");
      title.textContent = row.day + ": " + row.views;
      bar.append(title);
      svg.append(bar);
    });
    if (rows.some((row) => row.views > 0)) chart.append(svg);
    else {
      const empty = el("div");
      empty.className = "analytics-empty";
      empty.append(
        el("strong", "No playback starts yet"),
        el(
          "p",
          "Views will appear here when someone starts watching a shared recording.",
        ),
      );
      chart.append(empty);
    }
    const range = el("p", rows[0].day + " — " + rows.at(-1).day + " (UTC)");
    range.className = "fine-print";
    chart.append(range);
    const table = el("table");
    const header = el("tr");
    header.append(el("th", "Date (UTC)"), el("th", "Playback starts"));
    table.append(header);
    for (const row of rows) {
      const line = el("div");
      line.className = "chart-row";
      const meter = el("meter");
      meter.min = 0;
      meter.max = max;
      meter.value = row.views;
      meter.setAttribute(
        "aria-label",
        row.day + ": " + row.views + " playback starts",
      );
      line.append(el("span", row.day), meter, el("strong", String(row.views)));

      const tr = el("tr");
      tr.append(el("td", row.day), el("td", String(row.views)));
      table.append(tr);
    }
    document.querySelector("#views-table").replaceChildren(table);
    const users = el("table");
    const head = el("tr");
    for (const name of [
      "Staff member",
      "Last active",
      "Videos",
      "Role",
      "Access",
      "",
    ])
      head.append(el("th", name));
    users.append(head);
    for (const user of data.users) {
      const tr = el("tr");
      tr.append(
        el("td", user.email),
        el(
          "td",
          user.last_seen
            ? window.ShowletLocalTime(user.last_seen)
            : "Not signed in yet",
        ),
        el("td", String(user.recordings)),
      );
      const role = el("select");
      for (const name of ["member", "admin"]) {
        const option = el("option", name);
        option.value = name;
        role.append(option);
      }
      role.value = user.role;
      role.setAttribute("aria-label", "Role for " + user.email);
      const access = el("select");
      for (const [value, label] of [
        ["0", "Active"],
        ["1", "Disabled"],
      ]) {
        const option = el("option", label);
        option.value = value;
        access.append(option);
      }
      access.value = String(user.disabled);
      access.setAttribute("aria-label", "Access for " + user.email);
      const save = el("button", user.id === data.owner ? "You" : "Save");
      role.disabled = access.disabled = save.disabled = user.id === data.owner;
      save.onclick = async () => {
        save.disabled = true;
        try {
          const r = await fetch("/api/admin", {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              "X-Showlet-Request": "1",
            },
            body: JSON.stringify({
              id: user.id,
              role: role.value,
              disabled: access.value === "1",
            }),
          });
          const result = await r.json();
          if (!r.ok) throw Error(result.error);
          status.textContent = "Staff settings saved.";
          await loadAdmin();
        } catch (e) {
          status.textContent = e.message;
          save.disabled = false;
        }
      };
      for (const node of [role, access, save]) {
        const td = el("td");
        td.append(node);
        tr.append(td);
      }
      users.append(tr);
    }
    document.querySelector("#users-table").replaceChildren(users);
  } catch (error) {
    status.textContent = error.message || "Could not load administration.";
  }
}
document.querySelector("#analytics-period").onchange = loadAdmin;
loadAdmin();
