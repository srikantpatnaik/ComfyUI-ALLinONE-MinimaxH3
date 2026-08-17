import os
import shutil
import subprocess
import tempfile
import uuid
import wave
from pathlib import Path

import folder_paths
import numpy as np
import torch

from comfy_api.latest import InputImpl


def _ffmpeg_path():
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise RuntimeError("H3 extension assembly needs ffmpeg on PATH")
    return ffmpeg


def _input_file(name):
    base = Path(folder_paths.get_input_directory()).resolve()
    path = (base / str(name)).resolve()
    try:
        path.relative_to(base)
    except ValueError as exc:
        raise ValueError("H3 extension source must be inside ComfyUI's input folder") from exc
    if not path.is_file():
        raise FileNotFoundError("H3 extension source video was not found: %s" % name)
    return str(path)


def _run(command):
    result = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if result.returncode:
        detail = result.stderr.strip().splitlines()
        raise RuntimeError("H3 extension ffmpeg failed: %s" % (detail[-1] if detail else "unknown error"))


def _write_audio(path, audio, sample_rate=48000, duration=None):
    if audio is None:
        data = np.zeros((int(round(float(duration or 0) * sample_rate)), 2), dtype="<i2")
    else:
        waveform = audio.get("waveform")
        if waveform is None or getattr(waveform, "ndim", 0) != 3:
            raise ValueError("H3 extension audio must be a [batch, channels, samples] waveform")
        waveform = waveform[:1].detach().to(device="cpu", dtype=torch.float32)
        if waveform.shape[1] == 1:
            waveform = waveform.repeat(1, 2, 1)
        elif waveform.shape[1] > 2:
            waveform = waveform[:, :2]
        data = waveform[0].transpose(0, 1).numpy()
        data = np.clip(data * 32767.0, -32768, 32767).astype("<i2")
        if duration is not None:
            wanted = max(0, int(round(float(duration) * sample_rate)))
            if len(data) < wanted:
                data = np.pad(data, ((0, wanted - len(data)), (0, 0)))
            else:
                data = data[:wanted]
    with wave.open(path, "wb") as stream:
        stream.setnchannels(2)
        stream.setsampwidth(2)
        stream.setframerate(sample_rate)
        stream.writeframes(data.tobytes(order="C"))


def _has_audio(ffmpeg, source):
    ffprobe = os.path.join(os.path.dirname(ffmpeg), "ffprobe")
    if os.name == "nt":
        ffprobe += ".exe"
    if not os.path.isfile(ffprobe):
        ffprobe = shutil.which("ffprobe")
    if not ffprobe:
        return True
    result = subprocess.run(
        [ffprobe, "-v", "error", "-select_streams", "a:0", "-show_entries", "stream=index", "-of", "csv=p=0", source],
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        text=True,
    )
    return bool(result.stdout.strip())


class MiniMaxH3PreserveExtension:
    """Assemble an H3 tail without sending the existing source through a VAE."""

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "source_file": ("STRING", {"default": ""}),
                "continuation_images": ("IMAGE",),
                "fps": ("FLOAT", {"default": 24.0, "min": 1.0, "max": 240.0, "step": 0.001}),
                "crop": (["disabled", "center"], {"default": "center"}),
            },
            "optional": {"continuation_audio": ("AUDIO",)},
        }

    RETURN_TYPES = ("VIDEO",)
    RETURN_NAMES = ("video",)
    FUNCTION = "assemble"
    CATEGORY = "conditioning/minimax"
    DESCRIPTION = "Keep the original Extend source out of the VAE and assemble it with the generated H3 tail at high video quality."

    def assemble(self, source_file, continuation_images, fps=24.0, crop="center", continuation_audio=None):
        ffmpeg = _ffmpeg_path()
        source = _input_file(source_file)
        fps = float(fps)
        if fps <= 0:
            raise ValueError("H3 extension fps must be greater than zero")
        if getattr(continuation_images, "ndim", 0) != 4 or int(continuation_images.shape[0]) < 1:
            raise ValueError("H3 extension continuation is empty")

        height = int(continuation_images.shape[1])
        width = int(continuation_images.shape[2])
        if width % 2 or height % 2:
            raise ValueError("H3 extension output dimensions must be even")
        duration = int(continuation_images.shape[0]) / fps
        tempdir = tempfile.mkdtemp(prefix="h3_preserve_extension_")
        source_norm = os.path.join(tempdir, "source.mp4")
        tail = os.path.join(tempdir, "tail.mp4")
        concat_list = os.path.join(tempdir, "concat.txt")
        output = os.path.join(folder_paths.get_temp_directory(), "h3_preserved_%s.mp4" % uuid.uuid4().hex)
        try:
            scale = "scale=%d:%d:force_original_aspect_ratio=increase,crop=%d:%d" % (width, height, width, height) if crop == "center" else "scale=%d:%d" % (width, height)
            source_audio_present = _has_audio(ffmpeg, source)
            source_command = [ffmpeg, "-y", "-i", source]
            if not source_audio_present:
                source_command += ["-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000"]
            source_command += ["-vf", "fps=%s,%s" % (fps, scale), "-map", "0:v:0"]
            source_command += ["-map", "0:a:0?"] if source_audio_present else ["-map", "1:a:0"]
            source_command += [
                "-r", str(fps), "-c:v", "libx264", "-preset", "medium", "-crf", "10",
                "-pix_fmt", "yuv420p", "-c:a", "aac", "-ar", "48000", "-ac", "2",
                "-b:a", "320k", "-shortest", source_norm,
            ]
            _run(source_command)

            tail_audio = os.path.join(tempdir, "tail.wav")
            _write_audio(tail_audio, continuation_audio, duration=duration)
            raw = continuation_images[..., :3].detach().to(device="cpu", dtype=torch.float32)
            raw = (raw.clamp(0.0, 1.0) * 255.0).round().to(dtype=torch.uint8).contiguous().numpy()
            tail_command = [
                ffmpeg, "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", "%dx%d" % (width, height),
                "-r", str(fps), "-i", "-", "-i", tail_audio, "-map", "0:v:0", "-map", "1:a:0",
                "-c:v", "libx264", "-preset", "medium", "-crf", "10", "-pix_fmt", "yuv420p",
                "-c:a", "aac", "-ar", "48000", "-ac", "2", "-b:a", "320k", "-af", "apad",
                "-t", "%.9f" % duration, "-shortest", tail,
            ]
            proc = subprocess.Popen(tail_command, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
            try:
                proc.stdin.write(raw.tobytes(order="C"))
                proc.stdin.close()
            except BrokenPipeError as exc:
                stderr = proc.stderr.read().decode(errors="replace").strip().splitlines()
                proc.wait()
                raise RuntimeError("H3 extension tail encoding failed: %s" % (stderr[-1] if stderr else exc)) from exc
            stderr = proc.stderr.read().decode(errors="replace").strip().splitlines()
            if proc.wait() != 0:
                raise RuntimeError("H3 extension tail encoding failed: %s" % (stderr[-1] if stderr else "unknown error"))

            with open(concat_list, "w", encoding="utf-8") as stream:
                stream.write("file '%s'\nfile '%s'\n" % (source_norm.replace("'", "'\\''"), tail.replace("'", "'\\''")))
            _run([ffmpeg, "-y", "-f", "concat", "-safe", "0", "-i", concat_list, "-c", "copy", "-movflags", "+faststart", output])
            return (InputImpl.VideoFromFile(output),)
        finally:
            shutil.rmtree(tempdir, ignore_errors=True)
