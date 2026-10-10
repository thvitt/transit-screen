import assert from "node:assert/strict";
import { test } from "node:test";
import { qrCodeSvg } from "../qr.js";

test("renders a square SVG with a quiet zone around the modules", () => {
  const svg = qrCodeSvg("https://example.org/?s=de-DELFI_de:09663:33:0:11");
  const [, size] = svg.match(/viewBox="0 0 (\d+) \1"/);
  assert.equal((Number(size) - 8 - 17) % 4, 0);
  assert.match(svg, /<path d="M4 4h7v1h-7z/);
});
