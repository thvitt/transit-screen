import { loadConfigFile, parseConfig } from "./lib.js";

const params = new URLSearchParams(location.search);
const configFile = params.get("config");
const base = configFile === null ? undefined : await loadConfigFile(configFile);
const config = parseConfig(location.search, base);
const app = document.getElementById("app");

if (params.has("setup") || !config.stops.length) {
  const { startSetup } = await import("./setup.js");
  startSetup(app, config, configFile);
} else {
  const { startScreen } = await import("./screen.js");
  startScreen(app, config);
}
