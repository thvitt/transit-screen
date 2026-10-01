import {
  delayMinutes,
  fetchDepartures,
  groupDepartures,
  minutesUntil,
  selectUpcoming,
  stripPrefixes,
} from "./lib.js";
import { resolveLanguage, strings } from "./i18n.js";

const RENDER_INTERVAL_MS = 5_000;

const element = (tag, className, ...children) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.append(...children.filter((c) => c !== null && c !== undefined && c !== ""));
  return node;
};

export function startScreen(root, config) {
  const lang = resolveLanguage(config.lang);
  const t = strings(lang);
  const timeFormat = new Intl.DateTimeFormat(lang, { hour: "2-digit", minute: "2-digit" });
  const formatTime = (date) => timeFormat.format(date);
  const tidy = (name) => stripPrefixes(name, config.strip);

  const byStop = new Map();
  let lastFailure = null;
  let lastSuccess = null;

  document.documentElement.lang = lang;
  document.documentElement.style.setProperty("--scale", String(config.scale));
  document.title = config.title || "Departures";
  root.className = "screen";

  const clock = element("time", "clock");
  const status = element("p", "status", t.loading);
  const board = element("div", "board");
  board.style.setProperty("--groups", String(Math.max(1, config.groups.length + (config.other ? 1 : 0))));
  root.append(
    element(
      "header",
      "masthead",
      element("h1", "title", config.title || config.stops.map((s) => s.label).filter(Boolean).join(", ")),
      status,
      clock,
    ),
    board,
    element("footer", "legend", t.scheduledHint),
  );

  async function refresh() {
    const results = await Promise.allSettled(config.stops.map((stop) => fetchDepartures(stop, config)));
    results.forEach((result, index) => {
      if (result.status === "fulfilled") byStop.set(config.stops[index].id, result.value);
      else console.error(result.reason);
    });
    if (results.some((r) => r.status === "rejected")) lastFailure ??= new Date();
    else lastFailure = null;
    if (results.some((r) => r.status === "fulfilled")) lastSuccess = new Date();
    render();
  }

  function renderStatus() {
    if (!lastFailure) {
      status.textContent = lastSuccess ? "" : t.loading;
    } else {
      status.textContent = lastSuccess ? t.stale(formatTime(lastSuccess)) : t.failed;
    }
    status.classList.toggle("is-warning", Boolean(lastFailure));
  }

  function renderCountdown(departure, now) {
    if (departure.cancelled) return element("span", "countdown is-cancelled", t.cancelled);
    const minutes = minutesUntil(departure.departure, now);
    const box = element("span", `countdown${departure.realTime ? "" : " is-scheduled"}`);
    if (minutes < 1) {
      box.classList.add("is-now");
      box.append(t.now);
    } else if (minutes < 60) {
      box.append(element("span", "countdown-value", String(minutes)), element("span", "countdown-unit", t.min));
    } else {
      box.append(element("span", "countdown-value", formatTime(departure.departure)));
    }
    return box;
  }

  function renderClockTime(departure) {
    const delay = departure.realTime && !departure.cancelled ? delayMinutes(departure) : 0;
    return element(
      "span",
      "planned",
      formatTime(departure.scheduled),
      delay !== 0 ? element("span", "delay", delay > 0 ? `+${delay}` : `−${-delay}`) : null,
    );
  }

  function renderRow(departure, now) {
    const badge = element("span", "line", departure.line);
    if (departure.color) {
      badge.style.setProperty("--line-bg", departure.color);
      badge.style.setProperty("--line-fg", departure.textColor || "#fff");
    }
    const origin = element(
      "span",
      "origin",
      element("span", "origin-name", tidy(departure.stopName)),
      departure.track ? element("span", "track", `${t.platform} ${departure.track}`) : null,
    );
    return element(
      "li",
      `departure${departure.cancelled ? " is-cancelled" : ""}`,
      badge,
      element("span", "where", element("span", "headsign", tidy(departure.headsign)), origin),
      element("span", "when", renderCountdown(departure, now), renderClockTime(departure)),
    );
  }

  function fitRows(list) {
    while (list.children.length > 1 && list.scrollHeight > list.clientHeight + 1) {
      list.lastElementChild.remove();
    }
  }

  function render() {
    const now = new Date();
    clock.textContent = formatTime(now);
    clock.dateTime = now.toISOString();
    renderStatus();
    if (!lastSuccess) return;

    const upcoming = selectUpcoming([...byStop.values()].flat(), now, config.horizon);
    const groups = groupDepartures(upcoming, config.groups, config.other || (config.groups.length ? "" : " "));
    board.replaceChildren(
      ...groups.map((group) => {
        const list = element("ol", "departures", ...group.departures.map((d) => renderRow(d, now)));
        if (!group.departures.length) list.append(element("li", "empty", t.empty(config.horizon)));
        return element("section", "group", group.heading.trim() ? element("h2", "heading", group.heading) : null, list);
      }),
    );
    board.querySelectorAll(".departures").forEach(fitRows);
  }

  function scheduleNightlyReload() {
    const next = new Date();
    next.setHours(3, 30 + Math.floor(Math.random() * 20), 0, 0);
    if (next <= new Date()) next.setDate(next.getDate() + 1);
    setTimeout(() => location.reload(), next - new Date());
  }

  refresh();
  setInterval(refresh, config.refresh * 1000);
  setInterval(render, RENDER_INTERVAL_MS);
  addEventListener("resize", render);
  scheduleNightlyReload();
}
