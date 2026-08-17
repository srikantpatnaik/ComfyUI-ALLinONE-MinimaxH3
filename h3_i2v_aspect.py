import math

import comfy.utils
import torch


def _canvas_size(width, height, aspect_ratio):
    if aspect_ratio == "original":
        return width, height
    ratio = 16 / 9 if aspect_ratio == "16:9" else 9 / 16
    area = width * height
    out_width = max(32, round(math.sqrt(area * ratio) / 32) * 32)
    out_height = max(32, round(math.sqrt(area / ratio) / 32) * 32)
    return out_width, out_height


class MiniMaxH3I2VAspectFit:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE",),
                "width": ("INT", {"default": 960, "min": 32, "max": 16384, "step": 32}),
                "height": ("INT", {"default": 544, "min": 32, "max": 16384, "step": 32}),
                "aspect_ratio": (["original", "16:9", "9:16"],),
            }
        }

    RETURN_TYPES = ("IMAGE",)
    FUNCTION = "fit"
    CATEGORY = "image/transform/minimax"

    def fit(self, image, width, height, aspect_ratio):
        width, height = _canvas_size(int(width), int(height), aspect_ratio)
        source = image[..., :3]
        source_height, source_width = source.shape[1:3]
        scale = min(1.0, width / source_width, height / source_height)
        resized_width = max(1, round(source_width * scale))
        resized_height = max(1, round(source_height * scale))
        if (resized_width, resized_height) != (source_width, source_height):
            source = comfy.utils.common_upscale(
                source.movedim(-1, 1), resized_width, resized_height, "lanczos", "disabled"
            ).movedim(1, -1)

        canvas = torch.full(
            (source.shape[0], height, width, 3), 0.5, dtype=source.dtype, device=source.device
        )
        left = (width - resized_width) // 2
        top = (height - resized_height) // 2
        canvas[:, top:top + resized_height, left:left + resized_width, :] = source
        return (canvas,)
