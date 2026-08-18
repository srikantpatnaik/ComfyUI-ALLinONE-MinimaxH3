"""Metadata helpers for H3 output videos.

The H3 node keeps its restore payload in the output container instead of in a
sidecar file.  This keeps a rendered video self-contained when it is copied to
another machine or moved out of ComfyUI's output folder.
"""

import json
import os
import uuid


def _metadata_value(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def embed(path, settings, reference_image=None):
    import av

    extension = os.path.splitext(path)[1] or ".mp4"
    temporary = f"{path}.h3meta-{uuid.uuid4().hex}{extension}"
    try:
        with av.open(path, mode="r") as source:
            suffix = os.path.splitext(path)[1].lower()
            format_name = "mp4" if suffix in {".mp4", ".m4v", ".mov"} else source.format.name.split(",")[0]
            movflags = "use_metadata_tags+faststart" if suffix == ".mp4" else "use_metadata_tags"
            with av.open(temporary, mode="w", format=format_name, options={"movflags": movflags}) as output:
                output.metadata.update(source.metadata)
                output.metadata["h3_settings"] = _metadata_value(settings)
                if reference_image:
                    output.metadata["h3_reference_image"] = str(reference_image)

                stream_map = {}
                for stream in source.streams:
                    if stream.type not in {"video", "audio", "subtitle"} or stream.codec_context is None:
                        continue
                    stream_map[stream] = output.add_stream_from_template(stream, opaque=True)

                for packet in source.demux():
                    if packet.stream not in stream_map or packet.dts is None:
                        continue
                    packet.stream = stream_map[packet.stream]
                    output.mux(packet)
        os.replace(temporary, path)
    except Exception:
        try:
            os.remove(temporary)
        except OSError:
            pass
        raise


def read(path):
    import av

    with av.open(path, mode="r") as container:
        metadata = dict(container.metadata)
    raw_settings = metadata.get("h3_settings", "{}")
    try:
        settings = json.loads(raw_settings)
    except (TypeError, ValueError):
        settings = {}
    return {
        "settings": settings if isinstance(settings, dict) else {},
        "reference_image": metadata.get("h3_reference_image", ""),
    }
