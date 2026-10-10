import qrcode from "./vendor/qrcode-generator-2.0.4.mjs";

const QUIET_ZONE = 4;

export function qrCodeSvg(text) {
  const code = qrcode(0, "M");
  code.addData(text);
  code.make();
  const count = code.getModuleCount();
  const runs = [];
  for (let y = 0; y < count; y++) {
    for (let x = 0; x < count; x++) {
      if (!code.isDark(y, x)) continue;
      const start = x;
      while (x + 1 < count && code.isDark(y, x + 1)) x++;
      const length = x - start + 1;
      runs.push(`M${start + QUIET_ZONE} ${y + QUIET_ZONE}h${length}v1h-${length}z`);
    }
  }
  const size = count + 2 * QUIET_ZONE;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="#fff"/><path d="${runs.join("")}" fill="#000"/></svg>`;
}
