const STRINGS = {
  en: {
    now: "now",
    min: "min",
    cancelled: "cancelled",
    platform: "Pl.",
    other: "Other",
    empty: (minutes) => `No departures in the next ${minutes} minutes`,
    loading: "Loading departures…",
    stale: (time) => `No live connection since ${time}`,
    failed: "Cannot reach transitous.org",
    scheduledHint: "Grey times are timetable, not live",
  },
  de: {
    now: "jetzt",
    min: "min",
    cancelled: "fällt aus",
    platform: "Steig",
    other: "Sonstige",
    empty: (minutes) => `Keine Abfahrten in den nächsten ${minutes} Minuten`,
    loading: "Abfahrten werden geladen…",
    stale: (time) => `Keine Verbindung seit ${time}`,
    failed: "transitous.org nicht erreichbar",
    scheduledHint: "Graue Zeiten laut Fahrplan, ohne Echtzeit",
  },
};

export function resolveLanguage(requested) {
  const candidate = (requested || navigator.language || "en").slice(0, 2).toLowerCase();
  return candidate in STRINGS ? candidate : "en";
}

export function strings(lang) {
  return STRINGS[resolveLanguage(lang)];
}
