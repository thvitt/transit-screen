export const API_BASE = "https://api.transitous.org/api";
export const SOURCES_URL = "https://transitous.org/sources/";
export const OSM_COPYRIGHT_URL = "https://www.openstreetmap.org/copyright";
// TODO: set to the public repository once published; Transitous wants contact info on the site.
export const PROJECT_URL = "";

// Browsers can't set a User-Agent, so Transitous identifies us by the Referer.
// Send the origin only: the full URL carries the screen configuration.
const API_REQUEST = Object.freeze({ referrerPolicy: "strict-origin-when-cross-origin" });

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

const positiveNumber = (value, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
};

const isObject = (value) => typeof value === "object" && value !== null && !Array.isArray(value);

function listOf(data, key, read) {
  const value = data[key] ?? [];
  if (!Array.isArray(value)) throw new Error(`"${key}" must be a list`);
  return value.map((item, index) => read(item, `${key}[${index}]`));
}

function textOf(data, key, fallback = "") {
  const value = data[key] ?? fallback;
  if (typeof value !== "string") throw new Error(`"${key}" must be text`);
  return value;
}

const stopFromObject = (stop, path) => {
  if (!isObject(stop) || typeof stop.id !== "string" || !stop.id.trim()) throw new Error(`${path} needs an "id"`);
  return { id: stop.id.trim(), label: textOf(stop, "label").trim(), walk: positiveNumber(stop.walk, 0) };
};

const ruleFromObject = (rule, path) => {
  if (!isObject(rule)) throw new Error(`${path} must be an object`);
  return { lines: listOf(rule, "lines", String), headsign: textOf(rule, "headsign").trim() };
};

const groupFromObject = (group, path) => {
  if (!isObject(group)) throw new Error(`${path} must be an object`);
  return { heading: textOf(group, "heading").trim(), rules: listOf(group, "rules", ruleFromObject) };
};

export function configFromObject(data) {
  if (!isObject(data)) throw new Error("expected a JSON object");
  const qr = data.qr ?? null;
  if (qr !== null && typeof qr !== "string") throw new Error('"qr" must be text');
  return {
    stops: listOf(data, "stops", stopFromObject),
    groups: listOf(data, "groups", groupFromObject),
    strip: listOf(data, "strip", String).filter(Boolean),
    title: textOf(data, "title", DEFAULTS.title),
    lang: textOf(data, "lang", DEFAULTS.lang),
    other: textOf(data, "other", DEFAULTS.other),
    qr,
    refresh: positiveNumber(data.refresh, DEFAULTS.refresh),
    horizon: positiveNumber(data.horizon, DEFAULTS.horizon),
    n: positiveNumber(data.n, DEFAULTS.n),
    scale: positiveNumber(data.scale, DEFAULTS.scale),
  };
}

export function configToObject(config) {
  const data = {};
  for (const key of ["title", "lang"]) if (config[key]) data[key] = config[key];
  if (config.strip.length) data.strip = config.strip;
  data.stops = config.stops.map(({ id, label, walk }) => ({ id, ...(label && { label }), ...(walk && { walk }) }));
  data.groups = config.groups.map(({ heading, rules }) => ({
    heading,
    rules: rules.map(({ lines, headsign }) => ({ lines, headsign })),
  }));
  if (config.other) data.other = config.other;
  if (config.qr !== null) data.qr = config.qr;
  for (const key of ["refresh", "horizon", "n", "scale"]) {
    if (config[key] !== DEFAULTS[key]) data[key] = config[key];
  }
  return data;
}

export function parseConfig(search, base = configFromObject({})) {
  const params = new URLSearchParams(search);
  const number = (key) => (params.has(key) ? positiveNumber(params.get(key), base[key]) : base[key]);
  const list = (key, field, parse) => (params.has(key) ? params.getAll(key).filter(Boolean).map(parse) : base[field]);
  return {
    stops: list("s", "stops", parseStop),
    groups: list("g", "groups", parseGroup),
    strip: list("strip", "strip", String),
    title: params.get("title") ?? base.title,
    lang: params.get("lang") ?? base.lang,
    other: params.get("other") ?? base.other,
    qr: params.has("qr") ? params.get("qr") : base.qr,
    refresh: number("refresh"),
    horizon: number("horizon"),
    n: number("n"),
    scale: number("scale"),
  };
}

const CONFIG_NAME = /^[a-z0-9-]+$/;

export function configFileUrl(name, base) {
  if (!CONFIG_NAME.test(name)) {
    throw new Error(`Invalid config name "${name}": use lowercase letters, digits and dashes`);
  }
  return new URL(`${name}.json`, base);
}

export async function loadConfigFile(name, { base = globalThis.location?.href, fetchImpl = fetch } = {}) {
  const response = await fetchImpl(configFileUrl(name, base), { cache: "no-cache" });
  if (!response.ok) throw new Error(`Config ${name}.json: HTTP ${response.status}`);
  try {
    return configFromObject(await response.json());
  } catch (error) {
    throw new Error(`Config ${name}.json: ${error.message}`, { cause: error });
  }
}

export function serializeConfig(config) {
  const params = new URLSearchParams();
  if (config.title) params.set("title", config.title);
  for (const stop of config.stops) params.append("s", serializeStop(stop));
  for (const group of config.groups) params.append("g", serializeGroup(group));
  if (config.other) params.set("other", config.other);
  for (const prefix of config.strip ?? []) params.append("strip", prefix);
  if (config.qr !== null && config.qr !== undefined) params.set("qr", config.qr);
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
    tripId: stopTime.tripId,
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

export function nearestStopOnly(departures, stops) {
  const rank = (d) => [d.walk, stops.findIndex((stop) => stop.id === d.stopId)];
  const closer = (a, b) => {
    const [walkA, indexA] = rank(a);
    const [walkB, indexB] = rank(b);
    return walkA - walkB || indexA - indexB;
  };
  const trip = (d) => d.tripId || d.key;
  const best = new Map();
  for (const d of departures) {
    const current = best.get(trip(d));
    if (!current || closer(d, current) < 0) best.set(trip(d), d);
  }
  return departures.filter((d) => best.get(trip(d)) === d);
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
  const response = await fetchImpl(url, API_REQUEST);
  if (!response.ok) throw new Error(`Stop ${stop.id}: HTTP ${response.status}`);
  const data = await response.json();
  return (data.stopTimes ?? []).map((st) => normalizeStopTime(st, stop));
}

export async function searchStops(text, { fetchImpl = fetch } = {}) {
  const url = new URL(`${API_BASE}/v1/geocode`);
  url.searchParams.set("text", text);
  url.searchParams.set("type", "STOP");
  const response = await fetchImpl(url, API_REQUEST);
  if (!response.ok) throw new Error(`Stop search failed: HTTP ${response.status}`);
  const places = await response.json();
  return places.map((p) => ({
    id: p.id,
    name: p.name,
    area: p.areas?.find((a) => a.default)?.name ?? "",
    modes: p.modes ?? [],
  }));
}

export function configName(title) {
  const slug = (title ?? "")
    .toLowerCase()
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || "departures";
}
