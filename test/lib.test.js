import assert from "node:assert/strict";
import { test } from "node:test";
import {
  configFileUrl,
  configFromObject,
  configName,
  configToObject,
  groupDepartures,
  loadConfigFile,
  minutesUntil,
  normalizeStopTime,
  parseConfig,
  ruleMatches,
  selectUpcoming,
  serializeConfig,
  stripPrefixes,
} from "../lib.js";

const departure = (overrides) => ({
  key: overrides.key ?? `${overrides.line}-${overrides.headsign}`,
  line: "10",
  headsign: "",
  destination: "",
  departure: new Date("2026-10-01T12:00:00Z"),
  scheduled: new Date("2026-10-01T12:00:00Z"),
  walk: 0,
  ...overrides,
});

const exampleSearch =
  "title=Hubland&s=de-DELFI_de:09663:33:0:11|Campusbr%C3%BCcke|3&s=de-DELFI_de:09663:246:0:11" +
  "&g=City/Station|:Hauptbahnhof&g=Frauenland/Sanderau|10:Sanderring|34:Heidingsfeld" +
  "&g=Gerbrunn|14:Gerbrunn|34:Grombühl";

test("parses stops, groups and rules from the URL", () => {
  const config = parseConfig(exampleSearch);
  assert.deepEqual(config.stops, [
    { id: "de-DELFI_de:09663:33:0:11", label: "Campusbrücke", walk: 3 },
    { id: "de-DELFI_de:09663:246:0:11", label: "", walk: 0 },
  ]);
  assert.equal(config.title, "Hubland");
  assert.deepEqual(config.groups[0], {
    heading: "City/Station",
    rules: [{ lines: [], headsign: "Hauptbahnhof" }],
  });
  assert.deepEqual(config.groups[1].rules, [
    { lines: ["10"], headsign: "Sanderring" },
    { lines: ["34"], headsign: "Heidingsfeld" },
  ]);
  assert.equal(config.refresh, 30);
});

test("line-only and multi-line rules", () => {
  const { groups } = parseConfig("g=All|10,34|*");
  assert.deepEqual(groups[0].rules, [
    { lines: ["10", "34"], headsign: "" },
    { lines: [], headsign: "" },
  ]);
});

test("serializing round-trips", () => {
  const config = parseConfig(exampleSearch + "&refresh=60&strip=W%C3%BCrzburg");
  assert.deepEqual(parseConfig(serializeConfig(config)), config);
});

test("rules match line and headsign substrings ignoring case and diacritics", () => {
  const d = departure({ line: "34", headsign: "Grombühl" });
  assert.ok(ruleMatches({ lines: ["34"], headsign: "grombuhl" }, d));
  assert.ok(ruleMatches({ lines: [], headsign: "Grom" }, d));
  assert.ok(!ruleMatches({ lines: ["14"], headsign: "Grombühl" }, d));
  const viaDestination = departure({ headsign: "Sanderring", destination: "Würzburg Sanderglacisstraße" });
  assert.ok(ruleMatches({ lines: ["10"], headsign: "Sanderglacis" }, viaDestination));
});

test("groups departures and collects unmatched ones under the other heading", () => {
  const { groups } = parseConfig(exampleSearch);
  const deps = [
    departure({ line: "14", headsign: "Würzburg, Hauptbahnhof ZOB" }),
    departure({ line: "10", headsign: "Sanderring" }),
    departure({ line: "34", headsign: "Grombühl" }),
    departure({ line: "10", headsign: "Hubland Campus Nord" }),
  ];
  const result = groupDepartures(deps, groups, "Other");
  assert.deepEqual(
    result.map((g) => [g.heading, g.departures.map((d) => d.line)]),
    [
      ["City/Station", ["14"]],
      ["Frauenland/Sanderau", ["10"]],
      ["Gerbrunn", ["34"]],
      ["Other", ["10"]],
    ],
  );
  assert.equal(groupDepartures(deps, groups, "").length, 3);
  assert.deepEqual(groupDepartures(deps, [], "")[0].departures, deps);
});

test("selectUpcoming drops unreachable, distant and duplicate departures", () => {
  const now = new Date("2026-10-01T12:00:00Z");
  const at = (minutes) => new Date(now.getTime() + minutes * 60_000);
  const deps = [
    departure({ key: "late", departure: at(200) }),
    departure({ key: "b", departure: at(10) }),
    departure({ key: "a", departure: at(2) }),
    departure({ key: "walk", departure: at(2), walk: 5 }),
    departure({ key: "a", departure: at(2) }),
    departure({ key: "gone", departure: at(-2) }),
  ];
  assert.deepEqual(
    selectUpcoming(deps, now, 120).map((d) => d.key),
    ["a", "b"],
  );
  assert.equal(minutesUntil(at(2.9), now), 2);
});

test("strips configured prefixes", () => {
  assert.equal(stripPrefixes("Würzburg, Hauptbahnhof ZOB", ["Würzburg"]), "Hauptbahnhof ZOB");
  assert.equal(stripPrefixes("Gerbrunn Casteller Platz", ["Würzburg"]), "Gerbrunn Casteller Platz");
  assert.equal(stripPrefixes("Würzburg Hubland TGZ", ["Wü", "Würzburg"]), "Hubland TGZ");
  assert.equal(stripPrefixes("Wü Philosophische Fakultät", ["Wü"]), "Philosophische Fakultät");
  assert.equal(stripPrefixes("Würzburg", ["Würzburg"]), "Würzburg");
});

test("normalizes an API stop time", () => {
  const d = normalizeStopTime(
    {
      tripId: "t1",
      routeShortName: "10",
      routeColor: "f29205",
      routeTextColor: "ffffff",
      mode: "BUS",
      realTime: true,
      headsign: "Sanderring",
      tripTo: { name: "Würzburg Sanderglacisstraße" },
      place: {
        stopId: "x",
        name: "Würzburg Campusbrücke",
        track: "11",
        departure: "2026-10-01T11:54:00Z",
        scheduledDeparture: "2026-10-01T11:53:00Z",
      },
    },
    { id: "x", label: "", walk: 0 },
  );
  assert.equal(d.stopName, "Würzburg Campusbrücke");
  assert.equal(d.color, "#f29205");
  assert.equal(d.departure - d.scheduled, 60_000);
  assert.equal(d.cancelled, false);
});

test("config file name is a readable slug of the title", () => {
  assert.equal(configName("Hubland Campus / Süd"), "hubland-campus-sud");
  assert.equal(configName("Straße"), "strasse");
  assert.equal(configName(""), "departures");
});

test("config files round-trip and leave out defaults", () => {
  const config = parseConfig(exampleSearch + "&refresh=60&strip=W%C3%BCrzburg&qr");
  const data = configToObject(config);
  assert.deepEqual(data.stops[1], { id: "de-DELFI_de:09663:246:0:11" });
  assert.equal(data.refresh, 60);
  assert.equal("horizon" in data, false);
  assert.deepEqual(configFromObject(JSON.parse(JSON.stringify(data))), config);
});

test("missing keys in a config file take the defaults", () => {
  assert.deepEqual(configFromObject({}), parseConfig(""));
});

test("config files reject malformed entries", () => {
  assert.throws(() => configFromObject([]), /JSON object/);
  assert.throws(() => configFromObject({ stops: [{ label: "x" }] }), /stops\[0\] needs an "id"/);
  assert.throws(() => configFromObject({ groups: [{ rules: "10" }] }), /"rules" must be a list/);
  assert.throws(() => configFromObject({ title: 3 }), /"title" must be text/);
});

test("URL parameters override the config file", () => {
  const base = configFromObject({ title: "Hubland", scale: 1.2, stops: [{ id: "a" }], strip: ["Würzburg"] });
  const config = parseConfig("config=hubland&scale=1.5&s=b|B", base);
  assert.equal(config.title, "Hubland");
  assert.equal(config.scale, 1.5);
  assert.deepEqual(config.stops, [{ id: "b", label: "B", walk: 0 }]);
  assert.deepEqual(config.strip, ["Würzburg"]);
});

test("config names are restricted to files next to the page", () => {
  assert.equal(configFileUrl("zpd", "https://example.org/screen/?config=zpd").href, "https://example.org/screen/zpd.json");
  for (const name of ["../x", "https://evil.example/x", "a/b", "ZPD", ""]) {
    assert.throws(() => configFileUrl(name, "https://example.org/"), /Invalid config name/);
  }
});

test("loading a config file reports the file on failure", async () => {
  const respond = (status, body) => async (url, init) => {
    assert.equal(url.href, "https://example.org/zpd.json");
    assert.equal(init.cache, "no-cache");
    return { ok: status === 200, status, json: async () => body };
  };
  const options = (fetchImpl) => ({ base: "https://example.org/", fetchImpl });
  const config = await loadConfigFile("zpd", options(respond(200, { title: "ZPD", stops: [{ id: "a" }] })));
  assert.equal(config.title, "ZPD");
  await assert.rejects(loadConfigFile("zpd", options(respond(404))), /Config zpd\.json: HTTP 404/);
  await assert.rejects(loadConfigFile("zpd", options(respond(200, { stops: {} }))), /Config zpd\.json: "stops" must be a list/);
});

test("qr is off by default, on when present, and may carry its own URL", () => {
  assert.equal(parseConfig("s=a").qr, null);
  assert.equal(parseConfig("s=a&qr").qr, "");
  const withUrl = parseConfig("s=a&qr=https://example.org/hubland.html");
  assert.equal(withUrl.qr, "https://example.org/hubland.html");
  assert.match(serializeConfig(withUrl), /qr=https:\/\/example\.org\/hubland\.html/);
  assert.match(serializeConfig(parseConfig("s=a&qr")), /(^|&)qr=($|&)/);
  assert.doesNotMatch(serializeConfig(parseConfig("s=a")), /qr/);
});
