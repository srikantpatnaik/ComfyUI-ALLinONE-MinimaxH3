export async function openComfyGalleryPicker({ kind, mk, tx, api, onSelect }) {
  const overlay = mk("div", {
    position: "fixed", inset: "0", zIndex: "100001", background: "rgba(0,0,0,.78)",
    display: "flex", alignItems: "center", justifyContent: "center", padding: "20px", boxSizing: "border-box",
  });
  const panel = mk("div", {
    width: "min(620px, 100%)", maxHeight: "min(620px, 100%)", display: "flex", flexDirection: "column",
    gap: "10px", padding: "14px", boxSizing: "border-box", background: "#111",
    border: "1px solid var(--h3-line2)", borderRadius: "10px", boxShadow: "0 10px 35px rgba(0,0,0,.6)",
  });
  const header = mk("div", { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" });
  const title = mk("div", { color: "var(--h3-tx)", fontSize: "12px", fontWeight: "700" });
  tx(title, `Choose ${kind} from ComfyUI gallery`);
  const close = mk("button", { background: "transparent", border: "1px solid var(--h3-line2)", borderRadius: "6px", color: "var(--h3-tx2)", padding: "3px 9px", cursor: "pointer" }, { type: "button" });
  tx(close, "Cancel");
  header.append(title, close);
  const grid = mk("div", { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(120px,1fr))", gap: "8px", overflowY: "auto", minHeight: "0" });
  panel.append(header, grid);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);
  const dismiss = event => { if (event.target === overlay || event.key === "Escape") finish(); };
  const finish = () => { overlay.remove(); document.removeEventListener("keydown", dismiss); };
  close.onclick = finish;
  overlay.onclick = dismiss;
  document.addEventListener("keydown", dismiss);
  try {
    const response = await fetch("/h3one/gallery");
    const data = await response.json();
    const items = (data.videos || []).filter(item => item.kind === kind);
    if (!items.length) {
      const empty = mk("div", { gridColumn: "1 / -1", color: "var(--h3-tx2)", fontSize: "10px", padding: "24px", textAlign: "center" });
      tx(empty, `No ${kind}s found in the ComfyUI gallery.`);
      grid.appendChild(empty);
      return;
    }
    items.forEach(item => {
      const card = mk("button", { display: "flex", flexDirection: "column", gap: "4px", minWidth: "0", padding: "0", overflow: "hidden", background: "#1b1b1b", border: "1px solid var(--h3-line)", borderRadius: "7px", color: "var(--h3-tx2)", cursor: "pointer", textAlign: "left" }, { type: "button" });
      const url = api.apiURL(`/view?filename=${encodeURIComponent(item.filename)}&type=output&subfolder=${encodeURIComponent(item.subfolder || "")}`);
      const preview = kind === "image"
        ? mk("img", { width: "100%", height: "76px", objectFit: "cover", background: "#000", display: "block" }, { src: url, alt: item.filename })
        : mk("video", { width: "100%", height: "76px", objectFit: "cover", background: "#000", display: "block", pointerEvents: "none" }, { src: url, muted: true, preload: "metadata" });
      const label = mk("div", { padding: "3px 5px 5px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "8px" });
      tx(label, item.filename);
      card.append(preview, label);
      card.onclick = async () => {
        card.disabled = true;
        try {
          const staged = await fetch("/h3one/stage_input", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ filename: item.filename, subfolder: item.subfolder || "" }) });
          const result = await staged.json();
          if (!result.ok) throw new Error(result.error || "Could not stage the selected file");
          onSelect(result.name);
          finish();
        } catch (error) {
          card.disabled = false;
          tx(label, String(error.message || error));
        }
      };
      grid.appendChild(card);
    });
  } catch (error) {
    const failed = mk("div", { gridColumn: "1 / -1", color: "var(--h3-err)", fontSize: "10px", padding: "24px", textAlign: "center" });
    tx(failed, `Could not load the ComfyUI gallery: ${error.message || error}`);
    grid.appendChild(failed);
  }
}
