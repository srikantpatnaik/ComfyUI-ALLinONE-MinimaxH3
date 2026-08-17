const ASPECT_RATIOS = {
  original: null,
  "16:9": 16 / 9,
  "9:16": 9 / 16,
};

export function normalizeI2VAspect(value) {
  return Object.prototype.hasOwnProperty.call(ASPECT_RATIOS, value) ? value : "original";
}

export function i2vCanvasSize(width, height, aspect) {
  const ratio = ASPECT_RATIOS[normalizeI2VAspect(aspect)];
  if (!ratio) return { width, height };
  const area = width * height;
  const alignedWidth = Math.max(32, Math.round(Math.sqrt(area * ratio) / 32) * 32);
  const alignedHeight = Math.max(32, Math.round(Math.sqrt(area / ratio) / 32) * 32);
  return { width: alignedWidth, height: alignedHeight };
}

export function createI2VAspectControl({ S, mk, tx, infoIcon, DD, persist, onChange }) {
  const row = mk("div", { display: "flex", flexDirection: "column", gap: "3px" });
  const capRow = mk("div", { display: "flex", alignItems: "center", gap: "4px" });
  const label = mk("div", { fontSize: "9px", fontWeight: "700", color: "var(--h3-tx2)", textTransform: "uppercase", letterSpacing: ".07em" });
  tx(label, "I2V aspect ratio");
  capRow.append(label, infoIcon("Original keeps the selected video canvas and fits the source image inside it without distortion. 16:9 and 9:16 change the video canvas to that ratio, then fit the source image inside it without distortion."));
  const dropdown = DD(["Original", "16:9", "9:16"], S.i2vAspect === "original" ? "Original" : S.i2vAspect, value => {
    S.i2vAspect = value === "Original" ? "original" : value;
    persist();
    onChange();
  });
  row.append(capRow, dropdown.el);
  return row;
}
