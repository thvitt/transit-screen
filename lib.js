export const API_BASE = "https://api.transitous.org/api";

const DEFAULTS = Object.freeze({
  title: "",
  lang: "",
  other: "",
  refresh: 30,
  horizon: 120,
  n: 40,
  scale: 1,
});

export function parseStop(raw) {
  const [id, label = "", walk = ""] = raw.split("|");
  if (!id.trim()) throw new Error(`Invalid stop "${raw}": missing stop id`);
  return { id: id.trim(), label: label.trim(), walk: Number(walk) || 0 };
}

export function serializeStop({ id, label, walk }) {
  return [id, label ?? "", walk ? String(walk) : ""].join("|").replace(/\|+$/, "");
}

export function parseRule(raw) {
  const sep = raw.indexOf(":");
  const linePart = sep === -1 ? raw : raw.slice(0, sep);
  const headsign = sep === -1 ? "" : raw.slice(sep + 1).trim();
  const lines = linePart
    .split(",")
    .map((l) => l.trim())
    .filter((l) => l && l !== "*");
  return { lines, headsign };
}

export function serializeRule({ lines, headsign }) {
  const linePart = lines.join(",");
  return headsign ? `${linePart}:${headsign}` : linePart || "*";
}

export function parseGroup(raw) {
  const [heading, ...rules] = raw.split("|");
  return {
    heading: heading.trim(),
    rules: rules.filter((r) => r.trim()).map(parseRule),
  };
}

export function serializeGroup({ heading, rules }) {
  return [heading, ...rules.map(serializeRule)].join("|");
}

export function parseConfig(search) {
  const params = new URLSearchParams(search);
  const number = (key) => {
    const value = Number(params.get(key));
    return params.has(key) && Number.isFinite(value) && value > 0 ? value : DEFAULTS[key];
  };
  return {
    stops: params.getAll("s").filter(Boolean).map(parseStop),
    groups: params.getAll("g").filter(Boolean).map(parseGroup),
    strip: params.getAll("strip").filter(Boolean),
    title: params.get("title") ?? DEFAULTS.title,
    lang: params.get("lang") ?? DEFAULTS.lang,
    other: params.get("other") ?? DEFAULTS.other,
    refresh: number("refresh"),
    horizon: number("horizon"),
    n: number("n"),
    scale: number("scale"),
  };
}

export function serializeConfig(config) {
  const params = new URLSearchParams();
  if (config.title) params.set("title", config.title);
  for (const stop of config.stops) params.append("s", serializeStop(stop));
  for (const group of config.groups) params.append("g", serializeGroup(group));
  if (config.other) params.set("other", config.other);
  for (const prefix of config.strip ?? []) params.append("strip", prefix);
  for (const key of ["lang", "refresh", "horizon", "n", "scale"]) {
    if (config[key] && config[key] !== DEFAULTS[key]) params.set(key, String(config[key]));
  }
  return params
    .toString()
    .replace(/%(3A|7C|2F|2C)/g, (encoded) => decodeURIComponent(encoded));
}

const fold = (text) =>
  (text ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

export function ruleMatches(rule, departure) {
  if (rule.lines.length && !rule.lines.some((l) => fold(l) === fold(departure.line))) return false;
  if (!rule.headsign) return true;
  const needle = fold(rule.headsign);
  return [departure.headsign, departure.destination].some((t) => fold(t).includes(needle));
}

export function groupDepartures(departures, groups, otherHeading) {
  if (!groups.length) return [{ heading: otherHeading, departures }];
  const matched = new Set();
  const result = groups.map((group) => {
    const members = departures.filter((d) => group.rules.some((r) => ruleMatches(r, d)));
    for (const d of members) matched.add(d);
    return { heading: group.heading, departures: members };
  });
  if (otherHeading) {
    result.push({ heading: otherHeading, departures: departures.filter((d) => !matched.has(d)) });
  }
  return result;
}

export function stripPrefixes(text, prefixes) {
  for (const prefix of prefixes) {
    const rest = text.slice(prefix.length);
    if (text.startsWith(prefix) && /^[\s,]+\S/.test(rest)) return rest.replace(/^[\s,]+/, "");
  }
  return text;
}

export function normalizeStopTime(stopTime, stop) {
  const place = stopTime.place;
  return {
    key: `${stopTime.tripId}@${place.stopId}`,
    line: stopTime.routeShortName || stopTime.displayName || "",
    color: stopTime.routeColor ? `#${stopTime.routeColor}` : "",
    textColor: stopTime.routeTextColor ? `#${stopTime.routeTextColor}` : "",
    mode: stopTime.mode,
    headsign: stopTime.headsign || stopTime.tripTo?.name || "",
    destination: stopTime.tripTo?.name || "",
    stopId: stop.id,
    stopName: stop.label || place.name,
    track: place.track || place.scheduledTrack || "",
    departure: new Date(place.departure ?? place.scheduledDeparture),
    scheduled: new Date(place.scheduledDeparture ?? place.departure),
    realTime: Boolean(stopTime.realTime),
    cancelled: Boolean(stopTime.cancelled || stopTime.tripCancelled || place.cancelled),
    walk: stop.walk,
  };
}

export function selectUpcoming(departures, now, horizonMinutes) {
  const horizon = now.getTime() + horizonMinutes * 60_000;
  const seen = new Set();
  return departures
    .filter((d) => {
      if (seen.has(d.key)) return false;
      seen.add(d.key);
      const reachable = d.departure.getTime() - d.walk * 60_000 >= now.getTime() - 30_000;
      return reachable && d.departure.getTime() <= horizon;
    })
    .sort((a, b) => a.departure - b.departure);
}

export function minutesUntil(date, now) {
  return Math.max(0, Math.floor((date.getTime() - now.getTime()) / 60_000));
}

export function delayMinutes(departure) {
  return Math.round((departure.departure - departure.scheduled) / 60_000);
}

export async function fetchDepartures(stop, { n, fetchImpl = fetch } = {}) {
  const url = new URL(`${API_BASE}/v5/stoptimes`);
  url.searchParams.set("stopId", stop.id);
  url.searchParams.set("n", String(n ?? DEFAULTS.n));
  const response = await fetchImpl(url);
  if (!response.ok) throw new Error(`Stop ${stop.id}: HTTP ${response.status}`);
  const data = await response.json();
  return (data.stopTimes ?? []).map((st) => normalizeStopTime(st, stop));
}

export async function searchStops(text, { fetchImpl = fetch } = {}) {
  const url = new URL(`${API_BASE}/v1/geocode`);
  url.searchParams.set("text", text);
  url.searchParams.set("type", "STOP");
  const response = await fetchImpl(url);
  if (!response.ok) throw new Error(`Stop search failed: HTTP ${response.status}`);
  const places = await response.json();
  return places.map((p) => ({
    id: p.id,
    name: p.name,
    area: p.areas?.find((a) => a.default)?.name ?? "",
    modes: p.modes ?? [],
  }));
}

const escapeHtml = (text) =>
  String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export function shortcutHtml(url, title) {
  const href = escapeHtml(url);
  const script = JSON.stringify(url).replace(/</g, "\\u003c");
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>${escapeHtml(title || "Departures")}</title>
    <meta http-equiv="refresh" content="0; url=${href}">
    <script>location.replace(${script});</script>
  </head>
  <body>
    <a href="${href}">${escapeHtml(title || "Departures")}</a>
  </body>
</html>
`;
}

export function shortcutFileName(title) {
  const slug = (title ?? "")
    .toLowerCase()
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${slug || "departures"}.html`;
}
