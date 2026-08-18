const LTX25_RESOLUTIONS = [
  "1280x720",
  "720x1280",
  "1920x1080",
  "1080x1920",
  "2560x1440",
  "1440x2560",
];

export const LTX25_DEFAULTS = {
  prompt: "",
  firstFrame: null,
  resolution: "1280x720",
  duration: 5,
  fps: 24,
  seed: 0,
  rifeMultiplier: 1,
  enableAudio: false,
  enableCache: true,
  strength: 0.7,
  unet: "ltx-2.5-22b-distilled-transformer-comfy-int8-convrot.safetensors",
  videoVae: "ltx-2.5-video-vae-conv-bf16.safetensors",
  audioVae: "ltx-2.5-audio-vae-bf16.safetensors",
  clip: "gemma4-12b-with-proj-ltx-2.5-comfy-int8-convrot.safetensors",
  upscaleModel: "ltx-2.5-latent-spatial-upscaler-x2-bf16-1.0.safetensors",
  lora: "ltx/bb.safetensors",
};

const number = (value, fallback, min, max) => {
  const result = Number(value);
  if (!Number.isFinite(result)) return fallback;
  return Math.max(min, Math.min(max, result));
};

export function normalizeLtx25(saved = {}) {
  const state = {...LTX25_DEFAULTS, ...(saved.ltx25 || {})};
  if (!LTX25_RESOLUTIONS.includes(state.resolution)) state.resolution = LTX25_DEFAULTS.resolution;
  state.duration = Math.round(number(state.duration, 5, 1, 20) * 2) / 2;
  state.fps = Math.round(number(state.fps, 24, 1, 60));
  state.seed = Math.round(number(state.seed, 0, 0, 0xFFFFFFFF));
  state.rifeMultiplier = [1, 2, 4].includes(Number(state.rifeMultiplier)) ? Number(state.rifeMultiplier) : 1;
  state.strength = number(state.strength, 0.7, 0, 1);
  state.enableAudio = state.enableAudio === true;
  state.enableCache = state.enableCache !== false;
  return state;
}

function resolutionSize(value) {
  const match = String(value || "").match(/^(\d+)x(\d+)$/i);
  if (!match) return {width: 1280, height: 720};
  return {width: Number(match[1]), height: Number(match[2])};
}

function ref(node, output = 0) {
  return [node, output];
}

export function buildLtx25Workflow(state) {
  const {width, height} = resolutionSize(state.resolution);
  const frames = Math.max(1, Math.round(Number(state.duration) * Number(state.fps)) + 1);
  const latentWidth = Math.max(32, Math.floor(width / 2));
  const latentHeight = Math.max(32, Math.floor(height / 2));
  const graph = {
    input: {class_type: "LoadImage", inputs: {image: state.firstFrame}, _meta: {title: "LTX First Frame"}},
    clip: {class_type: "CLIPLoader", inputs: {clip_name: state.clip, type: "ltxv", device: "default"}, _meta: {title: "LTX Text Encoder"}},
    model: {class_type: "UNETLoader", inputs: {unet_name: state.unet, weight_dtype: "default"}, _meta: {title: "LTX Diffusion Model"}},
    video_vae: {class_type: "VAELoader", inputs: {vae_name: state.videoVae}, _meta: {title: "LTX Video VAE"}},
    audio_vae: {class_type: "VAELoader", inputs: {vae_name: state.audioVae}, _meta: {title: "LTX Audio VAE"}},
    positive: {class_type: "CLIPTextEncode", inputs: {text: state.prompt, clip: ref("model_patch", 1)}, _meta: {title: "LTX Positive Prompt"}},
    negative: {class_type: "CLIPTextEncode", inputs: {text: "pc game, console game, video game, cartoon, childish, ugly", clip: ref("model_patch", 1)}, _meta: {title: "LTX Negative Prompt"}},
    conditioning: {class_type: "LTXVConditioning", inputs: {frame_rate: ref("fps"), positive: ref("positive"), negative: ref("negative")}, _meta: {title: "LTX Conditioning"}},
    fps: {class_type: "PrimitiveFloat", inputs: {value: Number(state.fps)}, _meta: {title: "Frame Rate"}},
    duration: {class_type: "PrimitiveInt", inputs: {value: Number(state.duration)}, _meta: {title: "Duration"}},
    resize: {class_type: "ResizeImageMaskNode", inputs: {resize_type: "scale longer dimension", "resize_type.longer_size": 1536, scale_method: "lanczos", input: ref("input")}, _meta: {title: "Fit First Frame"}},
    preprocess: {class_type: "LTXVPreprocess", inputs: {img_compression: 18, image: ref("resize")}, _meta: {title: "LTX Image Preprocess"}},
    empty_video: {class_type: "EmptyLTXVLatentVideo", inputs: {width: latentWidth, height: latentHeight, length: frames, batch_size: 1}, _meta: {title: "LTX Empty Video"}},
    image_condition: {class_type: "LTXVImgToVideoInplace", inputs: {strength: Number(state.strength), bypass: false, vae: ref("video_vae"), image: ref("preprocess"), latent: ref("empty_video")}, _meta: {title: "LTX Image Conditioning"}},
    empty_audio: {class_type: "LTXVEmptyLatentAudio", inputs: {frames_number: frames, frame_rate: ref("fps"), batch_size: 1, audio_vae: ref("audio_vae")}, _meta: {title: "LTX Empty Audio"}},
    first_concat: {class_type: "LTXVConcatAVLatent", inputs: {video_latent: ref("image_condition"), audio_latent: ref("empty_audio")}, _meta: {title: "LTX First Pass Latent"}},
    first_noise: {class_type: "RandomNoise", inputs: {noise_seed: Number(state.seed)}, _meta: {title: "LTX First Noise"}},
    first_sampler: {class_type: "KSamplerSelect", inputs: {sampler_name: "euler_ancestral"}, _meta: {title: "LTX First Sampler"}},
    first_sigmas: {class_type: "ManualSigmas", inputs: {sigmas: "1.0, 0.99375, 0.9875, 0.98125, 0.975, 0.909375, 0.725, 0.421875, 0.0"}, _meta: {title: "LTX First Sigmas"}},
    model_patch: {class_type: "LoraLoaderThree", inputs: {lora_name_1: state.lora || "None", strength_model_1: 1, strength_clip_1: 1, lora_name_2: "None", strength_model_2: 1, strength_clip_2: 1, lora_name_3: "None", strength_model_3: 1, strength_clip_3: 1, model: ref("model"), clip: ref("clip")}, _meta: {title: "LTX LoRA"}},
    cache: {class_type: "EasyCache", inputs: {reuse_threshold: 0.2, start_percent: 0.15, end_percent: 0.95, verbose: false, model: ref("model_patch")}, _meta: {title: "LTX EasyCache"}},
    first_model: {class_type: "ComfySwitchNode", inputs: {switch: state.enableCache, on_false: ref("model_patch"), on_true: ref("cache")}, _meta: {title: "LTX Cache"}},
    first_guider: {class_type: "LTXVDualCFGGuider", inputs: {video_cfg: 1, audio_cfg: 1, model: ref("first_model"), positive: ref("conditioning"), negative: ref("conditioning", 1)}, _meta: {title: "LTX First Guider"}},
    first_sample: {class_type: "SamplerCustomAdvanced", inputs: {noise: ref("first_noise"), guider: ref("first_guider"), sampler: ref("first_sampler"), sigmas: ref("first_sigmas"), latent_image: ref("first_concat")}, _meta: {title: "LTX First Sampling"}},
    first_separate: {class_type: "LTXVSeparateAVLatent", inputs: {av_latent: ref("first_sample")}, _meta: {title: "LTX First Separate"}},
    upscale: {class_type: "LTXVLatentUpsampler", inputs: {samples: ref("first_separate"), upscale_model: ref("upscale_model"), vae: ref("video_vae")}, _meta: {title: "LTX Latent Upscale"}},
    second_image: {class_type: "LTXVImgToVideoInplace", inputs: {strength: 1, bypass: false, vae: ref("video_vae"), image: ref("preprocess"), latent: ref("upscale")}, _meta: {title: "LTX Refined Image Conditioning"}},
    second_concat: {class_type: "LTXVConcatAVLatent", inputs: {video_latent: ref("second_image"), audio_latent: ref("first_separate", 1)}, _meta: {title: "LTX Refined Latent"}},
    second_noise: {class_type: "RandomNoise", inputs: {noise_seed: Number(state.seed)}, _meta: {title: "LTX Refined Noise"}},
    second_sampler: {class_type: "KSamplerSelect", inputs: {sampler_name: "euler_ancestral"}, _meta: {title: "LTX Refined Sampler"}},
    second_sigmas: {class_type: "ManualSigmas", inputs: {sigmas: "0.85, 0.7250, 0.4219, 0.0"}, _meta: {title: "LTX Refined Sigmas"}},
    second_guider: {class_type: "LTXVDualCFGGuider", inputs: {video_cfg: 1, audio_cfg: 1, model: ref("first_model"), positive: ref("conditioning"), negative: ref("conditioning", 1)}, _meta: {title: "LTX Refined Guider"}},
    second_sample: {class_type: "SamplerCustomAdvanced", inputs: {noise: ref("second_noise"), guider: ref("second_guider"), sampler: ref("second_sampler"), sigmas: ref("second_sigmas"), latent_image: ref("second_concat")}, _meta: {title: "LTX Refined Sampling"}},
    separate: {class_type: "LTXVSeparateAVLatent", inputs: {av_latent: ref("second_sample")}, _meta: {title: "LTX Separate Output"}},
    decode: {class_type: "VAEDecodeTiled", inputs: {tile_size: 512, overlap: 64, temporal_size: 64, temporal_overlap: 16, samples: ref("separate"), vae: ref("video_vae")}, _meta: {title: "LTX Video Decode"}},
    audio_decode: {class_type: "LTXVAudioVAEDecode", inputs: {samples: ref("separate", 1), audio_vae: ref("audio_vae")}, _meta: {title: "LTX Audio Decode"}},
    upscale_model: {class_type: "LatentUpscaleModelLoader", inputs: {model_name: state.upscaleModel}, _meta: {title: "LTX Latent Upscaler"}},
  };

  let videoFrames = ref("decode");
  let outputFps = Number(state.fps);
  if (state.rifeMultiplier > 1) {
    graph.rife = {class_type: "RIFE VFI", inputs: {ckpt_name: "rife49.pth", clear_cache_after_n_frames: 10, multiplier: Number(state.rifeMultiplier), fast_mode: true, ensemble: true, scale_factor: 1, dtype: "float32", torch_compile: false, batch_size: 1, frames: ref("decode")}, _meta: {title: `LTX RIFE ${state.rifeMultiplier}x`}};
    videoFrames = ref("rife");
    outputFps *= Number(state.rifeMultiplier);
  }
  graph.video = {class_type: "CreateVideo", inputs: {fps: outputFps, bit_depth: 8, images: videoFrames}, _meta: {title: "LTX Create Video"}};
  if (state.enableAudio) graph.video.inputs.audio = ref("audio_decode");
  graph.save = {class_type: "SaveVideo", inputs: {video: ref("video"), filename_prefix: "one-node-minimax-h3/ltx25", format: "auto", codec: "auto"}, _meta: {title: "Save LTX-2.5 Video"}};
  return graph;
}

export function createLtx25Panel({S, mk, tx, NI, DD, ImgSlot, infoIcon, persist, seedMax}) {
  const panel = mk("div", {display: "flex", flexDirection: "column", gap: "9px"}, {className: "h3-card"});
  const title = mk("div", {fontSize: "10px", fontWeight: "700", letterSpacing: ".08em", textTransform: "uppercase", color: "var(--h3-tx)"});
  tx(title, "LTX-2.5 Image to Video");
  const hint = mk("div", {fontSize: "9px", color: "var(--h3-tx2)", lineHeight: "1.45"});
  tx(hint, "Native local LTX-2.5 I2V workflow with two-pass latent refinement and optional RIFE.");
  const prompt = mk("textarea", {background:"var(--h3-bg2)", border:"1px solid var(--h3-line2)", borderRadius:"7px", color:"var(--h3-tx)", fontSize:"11px", padding:"7px 8px", minHeight:"70px", resize:"vertical", outline:"none", fontFamily:"inherit", lineHeight:"1.45", boxSizing:"border-box", width:"100%"}, {placeholder:"Describe the motion..."});
  prompt.value = S.ltx25.prompt || "";
  prompt.oninput = () => { S.ltx25.prompt = prompt.value; persist(); };
  const sourceLabel = mk("div", {fontSize:"9px", fontWeight:"700", color:"var(--h3-tx2)", textTransform:"uppercase", letterSpacing:".07em"});
  tx(sourceLabel, "First frame");
  const source = ImgSlot(false, name => { S.ltx25.firstFrame = name; persist(); });
  if (S.ltx25.firstFrame) source._restorePreview(S.ltx25.firstFrame);
  const sourceRow = mk("div", {display:"flex", alignItems:"center", gap:"8px"});
  sourceRow.append(source.el, mk("div", {fontSize:"8px", color:"var(--h3-tx2)", lineHeight:"1.4", maxWidth:"180px"}, {textContent:"Required. Choose from the ComfyUI gallery or your PC."}));

  const resolution = DD(LTX25_RESOLUTIONS, S.ltx25.resolution, value => { S.ltx25.resolution = value; persist(); });
  const duration = NI("", S.ltx25.duration, 1, 20, 0.5, value => { S.ltx25.duration = Math.round(value * 2) / 2; persist(); }, "72px");
  const fps = NI("", S.ltx25.fps, 1, 60, 1, value => { S.ltx25.fps = Math.round(value); persist(); }, "60px");
  const rife = DD(["1x (off)", "2x", "4x"], `${S.ltx25.rifeMultiplier}x${S.ltx25.rifeMultiplier === 1 ? " (off)" : ""}`, value => { S.ltx25.rifeMultiplier = parseInt(value, 10) || 1; persist(); });
  const seed = NI("", S.ltx25.seed, 0, seedMax, 1, value => { S.ltx25.seed = Math.round(value); persist(); }, "110px");
  const field = (label, control, tip) => {
    const row = mk("div", {display:"flex", flexDirection:"column", gap:"3px"});
    const cap = mk("div", {display:"flex", alignItems:"center", gap:"4px", fontSize:"9px", color:"var(--h3-tx)"});
    tx(cap, label); if (tip) cap.append(infoIcon(tip));
    row.append(cap, control.el || control);
    return row;
  };
  const tune = mk("div", {display:"grid", gridTemplateColumns:"1fr 1fr", gap:"8px"});
  tune.append(field("Resolution", resolution), field("Duration (s)", duration), field("FPS", fps), field("RIFE", rife), field("Seed", seed));
  const checkRow = mk("div", {display:"flex", gap:"12px", flexWrap:"wrap", gridColumn:"1 / -1"});
  const checkbox = (label, key) => {
    const wrap = mk("label", {display:"inline-flex", alignItems:"center", gap:"5px", fontSize:"9px", color:"var(--h3-tx2)", cursor:"pointer"});
    const input = mk("input", {accentColor:"var(--h3accent)", margin:"0"}, {type:"checkbox", checked:!!S.ltx25[key]});
    input.onchange = () => { S.ltx25[key] = input.checked; persist(); };
    wrap.append(input, mk("span", {}, {textContent:label}));
    return wrap;
  };
  checkRow.append(checkbox("Generate audio", "enableAudio"), checkbox("EasyCache", "enableCache"));
  tune.appendChild(checkRow);
  panel.append(title, hint, prompt, sourceLabel, sourceRow, tune);
  return {el: panel, source, prompt, refresh(){ prompt.value = S.ltx25.prompt || ""; }};
}
