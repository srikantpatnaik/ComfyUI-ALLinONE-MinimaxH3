"""Small capability probe for the optional native H3 Motion Context path."""

import torch


def native_motion_context_status():
    status = {
        "packed_layout_available": False,
        "ref_aware_arbitrary_guides": False,
        "guide_audio_segment": False,
    }
    try:
        from comfy.ldm.minimax import model as minimax_model

        layout_cls = getattr(minimax_model, "PackedLayout", None)
        if layout_cls is None:
            return status
        status["packed_layout_available"] = True
        keyframe = {
            "resolved_frame_index": 3,
            "latent": torch.zeros((1, 24, 1, 2, 2)),
            "audio_latent": torch.zeros((1, 32, 2, 2)),
        }
        layout = layout_cls(
            7, 7, 2, 2, 16,
            keyframes=[keyframe],
            refs=[{"kind": "image", "latent_h": 2, "latent_w": 2}],
        )
        expected = 8.0 + float(minimax_model.FRAME_RESCALE) * 3.0
        for start, end, kind in layout.segments:
            values = layout.position_ids[start:end, 0]
            if kind == "cond":
                status["ref_aware_arbitrary_guides"] = bool(torch.allclose(
                    values,
                    torch.full_like(values, expected),
                    atol=1e-9,
                    rtol=0.0,
                ))
            elif kind == "cond_audio":
                status["guide_audio_segment"] = bool(torch.allclose(
                    values[:2],
                    torch.tensor([expected, expected + 1.0], dtype=values.dtype),
                    atol=1e-9,
                    rtol=0.0,
                ))
    except Exception as exc:
        status["packed_layout_error"] = repr(exc)
    status["available"] = (
        status["ref_aware_arbitrary_guides"]
        and status["guide_audio_segment"]
    )
    return status
