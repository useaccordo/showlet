// Omitting timeZone uses the viewer's browser/system time zone.
window.ShowletLocalTime = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
};
for (const element of document.querySelectorAll("time[data-local-time]")) {
  element.textContent = window.ShowletLocalTime(element.dateTime);
  element.title = "Shown in your local time zone";
}
