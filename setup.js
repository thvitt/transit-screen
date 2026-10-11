import {
  OSM_COPYRIGHT_URL,
  PROJECT_URL,
  SOURCES_URL,
  configName,
  configToObject,
  fetchDepartures,
  searchStops,
  serializeConfig,
  stripPrefixes,
} from "./lib.js";

const element = (tag, attributes = {}, ...children) => {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attributes)) {
    if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
    else if (value !== undefined && value !== null && value !== false) node.setAttribute(key, value);
  }
  node.append(...children.filter((c) => c !== null && c !== undefined));
  return node;
};

const field = (label, input, className) => element("label", { class: className }, label, input);

export function startSetup(root, initial, configFile) {
  const config = structuredClone(initial);
  let edited = configFile === null;
  root.className = "setup";
  document.title = "Set up departure screen";

  const screenUrl = () => {
    const url = new URL(location.href);
    if (edited) {
      url.search = serializeConfig(config);
    } else {
      const params = new URLSearchParams(url.search);
      params.delete("setup");
      url.search = params.toString();
    }
    return url.toString();
  };

  const output = element("output");
  const openLink = element("a", { target: "_blank" }, "Open screen");
  const downloadLink = element("a");
  const fileHint = element("p", { class: "hint" });

  function showLinks() {
    const url = screenUrl();
    output.textContent = url;
    openLink.href = url;

    const name = configFile ?? configName(config.title);
    const json = `${JSON.stringify(configToObject(config), null, 2)}\n`;
    URL.revokeObjectURL(downloadLink.href);
    downloadLink.href = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    downloadLink.download = `${name}.json`;
    downloadLink.textContent = `Download ${name}.json`;
    const shortUrl = new URL(`?config=${name}`, url).href;
    fileHint.textContent =
      configFile !== null && edited
        ? `You changed the screen loaded from ${name}.json. Upload the downloaded file to replace it, or use the full link above.`
        : `For a short address, upload ${name}.json next to this page and open ${shortUrl}. ` +
          "Edit the file to change the screen; it reloads every night.";

    if (edited) {
      const setupUrl = new URL(url);
      setupUrl.search = `setup&${setupUrl.search.slice(1)}`;
      history.replaceState(null, "", setupUrl);
    }
  }

  function sync() {
    edited = true;
    showLinks();
  }

  const bind = (value, update, attributes = {}) =>
    element("input", {
      value,
      ...attributes,
      oninput: (event) => {
        update(event.target.value);
        sync();
      },
    });

  const stopsSection = element("div");
  const groupsSection = element("div");
  let seenRoutes = [];

  function renderStops() {
    stopsSection.replaceChildren(
      ...config.stops.map((stop, index) =>
        element(
          "div",
          { class: "card" },
          element(
            "div",
            { class: "row" },
            field(
              "Name on screen",
              bind(stop.label, (v) => (stop.label = v), {
                placeholder: stop.name ? stripPrefixes(stop.name, config.strip) : "e.g. Campusbrücke",
              }),
            ),
            field(
              "Walk (min)",
              bind(stop.walk || "", (v) => (stop.walk = Number(v) || 0), { type: "number", min: 0, max: 60 }),
              "narrow",
            ),
            element(
              "button",
              {
                class: "quiet",
                onclick: () => {
                  config.stops.splice(index, 1);
                  renderStops();
                  sync();
                },
              },
              "Remove",
            ),
          ),
          element("span", { class: "stop-id" }, stop.id),
        ),
      ),
    );
  }

  async function lookUpStopNames() {
    const unnamed = config.stops.filter((stop) => !stop.name);
    const results = await Promise.allSettled(unnamed.map((stop) => fetchDepartures({ id: stop.id }, { n: 1 })));
    results.forEach((result, index) => {
      if (result.status === "fulfilled" && result.value.length) unnamed[index].name = result.value[0].stopName;
    });
    if (!stopsSection.contains(document.activeElement)) renderStops();
  }

  function ruleEditor(group, rule, index) {
    return element(
      "div",
      { class: "rule" },
      field(
        "Lines",
        bind(rule.lines.join(", "), (v) => (rule.lines = v.split(",").map((l) => l.trim()).filter(Boolean)), {
          placeholder: "any",
        }),
      ),
      field("Destination contains", bind(rule.headsign, (v) => (rule.headsign = v.trim()), { placeholder: "any" })),
      element(
        "button",
        {
          class: "quiet",
          "aria-label": "Remove rule",
          onclick: () => {
            group.rules.splice(index, 1);
            renderGroups();
            sync();
          },
        },
        "Remove",
      ),
    );
  }

  function seenPicker(group) {
    if (!seenRoutes.length) return null;
    return element(
      "details",
      {},
      element("summary", {}, "Add a line currently departing from your stops"),
      element(
        "div",
        { class: "seen" },
        ...seenRoutes.map(({ line, headsign }) =>
          element(
            "button",
            {
              class: "quiet",
              onclick: () => {
                group.rules.push({ lines: [line], headsign });
                renderGroups();
                sync();
              },
            },
            `${line} ${headsign}`,
          ),
        ),
      ),
    );
  }

  function renderGroups() {
    groupsSection.replaceChildren(
      ...config.groups.map((group, index) =>
        element(
          "div",
          { class: "card" },
          element(
            "div",
            { class: "row" },
            field("Heading", bind(group.heading, (v) => (group.heading = v), { placeholder: "e.g. City/Station" })),
            element(
              "button",
              {
                class: "quiet",
                onclick: () => {
                  config.groups.splice(index, 1);
                  renderGroups();
                  sync();
                },
              },
              "Remove group",
            ),
          ),
          ...group.rules.map((rule, ruleIndex) => ruleEditor(group, rule, ruleIndex)),
          element(
            "div",
            { class: "row" },
            element(
              "button",
              {
                class: "quiet",
                onclick: () => {
                  group.rules.push({ lines: [], headsign: "" });
                  renderGroups();
                  sync();
                },
              },
              "Add rule",
            ),
          ),
          seenPicker(group),
        ),
      ),
    );
  }

  async function loadSeenRoutes(button) {
    button.disabled = true;
    try {
      const results = await Promise.all(config.stops.map((stop) => fetchDepartures(stop, { n: 80 })));
      const unique = new Map();
      for (const d of results.flat()) {
        const headsign = stripPrefixes(d.headsign, config.strip);
        unique.set(`${d.line}|${headsign}`, { line: d.line, headsign });
      }
      seenRoutes = [...unique.values()].sort(
        (a, b) => a.line.localeCompare(b.line, undefined, { numeric: true }) || a.headsign.localeCompare(b.headsign),
      );
      renderGroups();
    } finally {
      button.disabled = false;
    }
  }

  const searchResults = element("ul", { class: "results" });
  const searchInput = element("input", { type: "search", placeholder: "Stop name and town, e.g. Campusbrücke Würzburg" });
  async function runSearch(event) {
    event.preventDefault();
    const text = searchInput.value.trim();
    if (!text) return;
    try {
      const stops = await searchStops(text);
      searchResults.replaceChildren(
        ...stops.map((stop) =>
          element(
            "li",
            {},
            element("span", {}, stop.name, " ", element("small", {}, [stop.area, stop.modes.join(", ")].filter(Boolean).join(", "))),
            element(
              "button",
              {
                class: "quiet",
                onclick: () => {
                  config.stops.push({ id: stop.id, label: "", walk: 0, name: stop.name });
                  renderStops();
                  sync();
                },
              },
              "Add",
            ),
          ),
        ),
      );
      if (!stops.length) searchResults.replaceChildren(element("li", {}, "No stops found. Try adding the town name."));
    } catch (error) {
      searchResults.replaceChildren(element("li", { class: "error" }, error.message));
    }
  }

  const loadButton = element("button", { class: "quiet" }, "Look up lines at these stops");
  loadButton.addEventListener("click", () => loadSeenRoutes(loadButton));

  const copyButton = element(
    "button",
    {
      onclick: async () => {
        await navigator.clipboard.writeText(screenUrl());
        copyButton.textContent = "Copied";
      },
    },
    "Copy link",
  );

  const qrUrl = bind(config.qr ?? "", (v) => (config.qr = v.trim()), {
    type: "url",
    placeholder: "Link to this screen",
    disabled: config.qr === null,
  });
  const qrToggle = element("input", {
    type: "checkbox",
    checked: config.qr !== null,
    onchange: (event) => {
      config.qr = event.target.checked ? qrUrl.value.trim() : null;
      qrUrl.disabled = !event.target.checked;
      sync();
    },
  });

  const language = element(
    "select",
    {
      onchange: (event) => {
        config.lang = event.target.value;
        sync();
      },
    },
    ...[
      ["", "Browser default"],
      ["de", "Deutsch"],
      ["en", "English"],
    ].map(([value, label]) => element("option", { value, selected: config.lang === value }, label)),
  );

  root.append(
    element("h1", {}, "Departure screen"),
    element(
      "p",
      { class: "hint" },
      "Pick your stops and sort their buses into destination groups. Everything is saved in the link, so the finished link is all your signage player needs.",
    ),

    element("h2", {}, "Screen"),
    element(
      "div",
      { class: "row" },
      field("Title", bind(config.title, (v) => (config.title = v), { placeholder: "e.g. Hubland Campus" })),
      field("Language", language, "narrow"),
      field(
        "Text size",
        bind(config.scale, (v) => (config.scale = Number(v) || 1), { type: "number", step: 0.1, min: 0.5, max: 3 }),
        "narrow",
      ),
    ),

    element(
      "div",
      { class: "row" },
      field("QR code", qrToggle, "narrow"),
      field("QR code link (empty: link to this screen)", qrUrl),
    ),

    element("h2", {}, "Stops"),
    element(
      "p",
      { class: "hint" },
      "Walk time hides buses you could no longer reach from here. The name replaces the official stop name on screen.",
    ),
    element(
      "form",
      { class: "row", onsubmit: runSearch },
      field("Find a stop", searchInput),
      element("button", { type: "submit" }, "Search"),
    ),
    searchResults,
    stopsSection,

    element("h2", {}, "Destination groups"),
    element(
      "p",
      { class: "hint" },
      "Each group becomes a column. A bus joins a group when it matches any rule: its line is in the list (empty means any line) and its destination contains the given text.",
    ),
    groupsSection,
    element(
      "div",
      { class: "actions" },
      element(
        "button",
        {
          onclick: () => {
            config.groups.push({ heading: "", rules: [{ lines: [], headsign: "" }] });
            renderGroups();
            sync();
          },
        },
        "Add group",
      ),
      loadButton,
    ),
    element(
      "div",
      { class: "row" },
      field(
        "Heading for buses matching no group (empty hides them)",
        bind(config.other, (v) => (config.other = v), { placeholder: "e.g. Other lines" }),
      ),
    ),

    element("h2", {}, "Fine-tuning"),
    element(
      "div",
      { class: "row" },
      field(
        "Remove town prefix from names",
        bind(
          config.strip.join(", "),
          (v) => {
            config.strip = v.split(",").map((s) => s.trim()).filter(Boolean);
            renderStops();
          },
          { placeholder: "e.g. Würzburg, Wü" },
        ),
      ),
      field(
        "Show next (min)",
        bind(config.horizon, (v) => (config.horizon = Number(v) || 120), { type: "number", min: 10 }),
        "narrow",
      ),
      field(
        "Update every (s)",
        bind(config.refresh, (v) => (config.refresh = Number(v) || 30), { type: "number", min: 15 }),
        "narrow",
      ),
    ),

    element("h2", {}, "Screen link"),
    output,
    element("div", { class: "actions" }, copyButton, openLink, downloadLink),
    fileHint,

    element(
      "footer",
      { class: "credits" },
      "Departure data from ",
      element("a", { href: "https://transitous.org/" }, "Transitous"),
      " (",
      element("a", { href: SOURCES_URL }, "data sources and licenses"),
      "), ",
      element("a", { href: OSM_COPYRIGHT_URL }, "© OpenStreetMap contributors"),
      ".",
      PROJECT_URL ? element("span", {}, " Source code and contact: ", element("a", { href: PROJECT_URL }, PROJECT_URL)) : null,
    ),
  );

  renderStops();
  renderGroups();
  showLinks();
  lookUpStopNames();
}
