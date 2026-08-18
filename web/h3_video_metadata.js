function cloneSettings(state) {
  return JSON.parse(JSON.stringify(state, (key, value) => key.startsWith("_") ? undefined : value));
}

function referenceName(state) {
  if (state.mode === "i2v") return state.firstFrame || state.lastFrame || "";
  if (state.mode === "r2v" || state.mode === "audio_drive") return state.refImages?.[0] || "";
  if (state.mode === "keyframes") return state.kf?.find(item => item.img)?.img || "";
  if (state.mode === "image") return state.imgRefs?.[0] || "";
  return "";
}

async function dataUrl(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not read reference image (${response.status})`);
  const blob = await response.blob();
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error("Could not encode reference image"));
    reader.readAsDataURL(blob);
  });
}

export async function createH3RestoreMetadata(state, api) {
  const name = referenceName(state);
  let referenceImage = "";
  if (name) {
    try {
      referenceImage = await dataUrl(api.apiURL(`/view?filename=${encodeURIComponent(name)}&type=input&subfolder=`));
    } catch (error) {
      console.warn("[H3One] reference image metadata:", error);
    }
  }
  return {
    version: 1,
    settings: cloneSettings(state),
    reference_image: referenceImage,
    reference_image_name: name,
  };
}

export function embedH3VideoMetadata(item, payload) {
  if (!item || item.kind === "image" || !payload) return;
  const settings = {...payload};
  delete settings.reference_image;
  return fetch("/h3one/embed_metadata", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({
      filename: item.filename,
      subfolder: item.subfolder || "",
      settings,
      reference_image: payload.reference_image || "",
    }),
  }).then(response => response.json()).catch(() => null);
}

export async function fetchH3RestoreMetadata(item) {
  const query = `filename=${encodeURIComponent(item.filename)}&subfolder=${encodeURIComponent(item.subfolder || "")}`;
  const response = await fetch(`/h3one/restore_metadata?${query}`);
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error(data.error || "Video has no H3 restore metadata");
  return data;
}
