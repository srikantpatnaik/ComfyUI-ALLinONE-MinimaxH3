export function normalizeOutputSettings(saved) {
  return {
    fps: Math.max(1, Math.min(240, Math.round(Number(saved.fps) || 24))),
    rifeMultiplier: [1, 2, 4].includes(Number(saved.rifeMultiplier)) ? Number(saved.rifeMultiplier) : 1,
  };
}

export function outputFrameLabel(duration, fps, rifeMultiplier, snapFrames) {
  const baseFps = Math.max(1, Math.round(Number(fps) || 24));
  const multiplier = [1, 2, 4].includes(Number(rifeMultiplier)) ? Number(rifeMultiplier) : 1;
  const finalFps = baseFps * multiplier;
  return `= ${snapFrames(duration)} native frames @ ${finalFps}fps${multiplier > 1 ? ` (${multiplier}x RIFE)` : ""}`;
}

export function createOutputControls({ S, mk, tx, infoIcon, NI, DD, persist, updateFramesLabel }) {
  const fpsRow = mk("div", { display: "flex", flexDirection: "column", gap: "3px" });
  const fpsCapRow = mk("div", { display: "flex", alignItems: "center", gap: "4px" });
  const fpsCap = mk("div", { fontSize: "10px", color: "var(--h3-tx)" });
  tx(fpsCap, "FPS");
  fpsCapRow.append(fpsCap, infoIcon("Base output frame rate. H3 renders its native frame sequence at 24fps; changing this value changes the encoded playback rate. RIFE interpolation multiplies it (for example, 30fps + 2x = 60fps)."));
  const fpsNI = NI("", S.fps, 1, 240, 1, value => {
    S.fps = Math.round(value);
    persist();
    updateFramesLabel();
  }, "60px");
  fpsRow.append(fpsCapRow, fpsNI);

  const rifeRow = mk("div", { display: "flex", flexDirection: "column", gap: "3px" });
  const rifeCapRow = mk("div", { display: "flex", alignItems: "center", gap: "4px" });
  const rifeCap = mk("div", { fontSize: "10px", color: "var(--h3-tx)" });
  tx(rifeCap, "RIFE");
  rifeCapRow.append(rifeCap, infoIcon("Optional RIFE frame interpolation. 1x passes through, 2x doubles the frame count, and 4x quadruples it. Requires the ComfyUI-Frame-Interpolation node pack and rife49.pth."));
  const rifeDD = DD(["1x (off)", "2x", "4x"], `${S.rifeMultiplier}x${S.rifeMultiplier === 1 ? " (off)" : ""}`, value => {
    S.rifeMultiplier = parseInt(value, 10) || 1;
    persist();
    updateFramesLabel();
  });
  rifeRow.append(rifeCapRow, rifeDD.el);

  return { fpsRow, rifeRow };
}

export function patchOutputVideo(workflow, fps, rifeMultiplier) {
  const baseFps = Math.max(1, Math.min(240, Math.round(Number(fps) || 24)));
  const multiplier = [1, 2, 4].includes(Number(rifeMultiplier)) ? Number(rifeMultiplier) : 1;
  Object.keys(workflow).forEach(id => {
    const node = workflow[id];
    if (!node || (node.class_type !== "CreateVideo" && node.class_type !== "MiniMaxH3PreserveExtension")) return;
    node.inputs.fps = baseFps;
    if (multiplier === 1) return;
    const frames = node.inputs.images || node.inputs.continuation_images;
    if (!Array.isArray(frames) || frames.length < 2) return;
    const rifeId = `rife:${id}`;
    workflow[rifeId] = { class_type: "RIFE VFI", inputs: {
      ckpt_name: "rife49.pth", frames,
      clear_cache_after_n_frames: 10, multiplier, fast_mode: true, ensemble: true,
      scale_factor: 1.0, dtype: "float16", torch_compile: false, batch_size: 1,
    }, _meta: { title: `RIFE ${multiplier}x` } };
    if (node.class_type === "CreateVideo") node.inputs.images = [rifeId, 0];
    else node.inputs.continuation_images = [rifeId, 0];
    node.inputs.fps = baseFps * multiplier;
  });
}

export function buildRifePostprocessWorkflow() {
  return {
    "1": { class_type: "LoadVideo", inputs: { file: "h3_native.mp4" }, _meta: { title: "Load Native Assembled Video" } },
    "2": { class_type: "GetVideoComponents", inputs: { video: ["1", 0] }, _meta: { title: "Read Native Video" } },
    "3": { class_type: "RIFE VFI", inputs: {
      ckpt_name: "rife49.pth", frames: ["2", 0], clear_cache_after_n_frames: 10,
      multiplier: 2, fast_mode: true, ensemble: true, scale_factor: 1.0,
      dtype: "float16", torch_compile: false, batch_size: 1,
    }, _meta: { title: "RIFE After Assembly" } },
    "4": { class_type: "CreateVideo", inputs: {
      images: ["3", 0], fps: 48, audio: ["2", 1], bit_depth: ["2", 3],
    }, _meta: { title: "Create Interpolated Video" } },
    "5": { class_type: "SaveVideo", inputs: {
      video: ["4", 0], filename_prefix: "one-node-minimax-h3/rife", format: "auto", codec: "auto",
    }, _meta: { title: "Save RIFE Result" } },
  };
}
