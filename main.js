import { parseConfig } from "./lib.js";

const params = new URLSearchParams(location.search);
const config = parseConfig(location.search);
const app = document.getElementById("app");

if (params.has("setup") || !config.stops.length) {
  const { startSetup } = await import("./setup.js");
  startSetup(app, config);
} else {
  const { startScreen } = await import("./screen.js");
  startScreen(app, config);
}
