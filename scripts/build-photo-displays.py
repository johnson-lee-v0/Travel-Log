#!/usr/bin/env python3
"""Build responsive display photos and an intrinsic-size manifest.

The source of truth remains ``data.js``. The script finds every locally
referenced full photo, applies its EXIF orientation, writes aspect-preserving
WebP derivatives, and records the display-correct source dimensions.

Run from anywhere:

    python3 scripts/build-photo-displays.py

Pillow is the only dependency. Outputs are deterministic in path and ordering;
existing files at those paths are replaced atomically.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import tempfile
from pathlib import Path, PurePosixPath
from typing import Iterable

from PIL import Image, ImageOps


REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
JAPAN_PHOTO_RE = re.compile(r"\bjapanPhoto\(\s*(['\"])(?P<path>[^'\"]+)\1")
FULL_PHOTO_RE = re.compile(r"\bfull\s*:\s*(['\"])(?P<url>[^'\"]+)\1")


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--root",
        type=Path,
        default=REPOSITORY_ROOT,
        help="Travel Log repository root (default: inferred from this script)",
    )
    parser.add_argument(
        "--widths",
        type=int,
        nargs="+",
        default=[640, 960],
        help="Output widths in pixels (default: 640 960)",
    )
    parser.add_argument(
        "--quality",
        type=int,
        default=78,
        help="WebP lossy quality from 0 to 100 (default: 78)",
    )
    parser.add_argument(
        "--expected-count",
        type=int,
        help="Fail unless this many unique photo references are found",
    )
    return parser.parse_args()


def normalize_photo_url(url: str) -> str:
    """Return the local URL form used by the runtime size lookup."""
    normalized = url.strip().replace("\\", "/")
    if normalized.startswith("./"):
        normalized = normalized[2:]
    path = PurePosixPath(normalized)
    if path.is_absolute() or ".." in path.parts:
        raise ValueError(f"Unsafe photo URL: {url}")
    if not path.parts or path.parts[0] != "trip_images":
        raise ValueError(f"Photo URL is outside trip_images: {url}")
    if "previews" in path.parts or "display" in path.parts:
        raise ValueError(f"Expected a full-photo URL, got: {url}")
    return f"./{path.as_posix()}"


def referenced_photo_urls(data_file: Path) -> list[str]:
    source = data_file.read_text(encoding="utf-8")
    urls: list[str] = []

    for match in JAPAN_PHOTO_RE.finditer(source):
        photo_path = match.group("path")
        urls.append(f"./trip_images/Japan_2026/{photo_path}.webp")

    for match in FULL_PHOTO_RE.finditer(source):
        urls.append(match.group("url"))

    return sorted({normalize_photo_url(url) for url in urls})


def output_path(root: Path, url: str, width: int) -> Path:
    source_relative = PurePosixPath(url.removeprefix("./")).relative_to("trip_images")
    display_relative = source_relative.with_suffix(".webp")
    return root / "trip_images" / "display" / str(width) / Path(*display_relative.parts)


def display_mode(image: Image.Image) -> Image.Image:
    if image.mode in {"RGB", "RGBA"}:
        return image
    if image.mode in {"LA", "P"} and "transparency" in image.info:
        return image.convert("RGBA")
    return image.convert("RGB")


def save_webp_atomically(
    image: Image.Image,
    destination: Path,
    *,
    quality: int,
    icc_profile: bytes | None,
) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary_name: str | None = None
    try:
        with tempfile.NamedTemporaryFile(
            dir=destination.parent,
            prefix=f".{destination.name}.",
            suffix=".tmp",
            delete=False,
        ) as temporary:
            temporary_name = temporary.name

        save_options: dict[str, object] = {
            "format": "WEBP",
            "quality": quality,
            "method": 6,
        }
        if icc_profile:
            save_options["icc_profile"] = icc_profile
        image.save(temporary_name, **save_options)
        Path(temporary_name).replace(destination)
        temporary_name = None
    finally:
        if temporary_name:
            Path(temporary_name).unlink(missing_ok=True)


def build_photo(
    root: Path,
    url: str,
    widths: Iterable[int],
    quality: int,
) -> tuple[int, int]:
    source_path = root / url.removeprefix("./")
    if not source_path.is_file():
        raise FileNotFoundError(f"Referenced photo is missing: {url}")

    with Image.open(source_path) as opened:
        opened.load()
        icc_profile = opened.info.get("icc_profile")
        oriented = display_mode(ImageOps.exif_transpose(opened))
        source_width, source_height = oriented.size

        for target_width in widths:
            if target_width > source_width:
                raise ValueError(
                    f"{url} is only {source_width}px wide; cannot create a true "
                    f"{target_width}w candidate"
                )
            target_height = max(1, round(source_height * target_width / source_width))
            resized = oriented.resize(
                (target_width, target_height),
                Image.Resampling.LANCZOS,
                reducing_gap=3.0,
            )
            save_webp_atomically(
                resized,
                output_path(root, url, target_width),
                quality=quality,
                icc_profile=icc_profile,
            )
            resized.close()

        if oriented is not opened:
            oriented.close()

    return source_width, source_height


def write_size_manifest(root: Path, dimensions: dict[str, tuple[int, int]]) -> Path:
    manifest_path = root / "trip_images" / "photo-sizes.js"
    entries = {
        url: {"width": width, "height": height}
        for url, (width, height) in sorted(dimensions.items())
    }
    serialized = json.dumps(entries, ensure_ascii=False, indent=2)
    contents = (
        "// Generated by scripts/build-photo-displays.py. Do not edit by hand.\n"
        f"window.TRAVEL_LOG_PHOTO_SIZES = Object.freeze({serialized});\n"
    )
    manifest_path.write_text(contents, encoding="utf-8")
    return manifest_path


def directory_size(path: Path) -> tuple[int, int]:
    files = list(path.rglob("*.webp"))
    return len(files), sum(file.stat().st_size for file in files)


def main() -> int:
    arguments = parse_arguments()
    root = arguments.root.resolve()
    widths = sorted(set(arguments.widths))

    if not widths or any(width <= 0 for width in widths):
        raise ValueError("Every output width must be a positive integer")
    if not 0 <= arguments.quality <= 100:
        raise ValueError("WebP quality must be between 0 and 100")

    urls = referenced_photo_urls(root / "data.js")
    if arguments.expected_count is not None and len(urls) != arguments.expected_count:
        raise ValueError(
            f"Expected {arguments.expected_count} unique photos, found {len(urls)}"
        )

    dimensions: dict[str, tuple[int, int]] = {}
    for index, url in enumerate(urls, start=1):
        dimensions[url] = build_photo(root, url, widths, arguments.quality)
        print(f"[{index:03d}/{len(urls):03d}] {url}")

    manifest_path = write_size_manifest(root, dimensions)
    print(f"Wrote {manifest_path.relative_to(root)} with {len(dimensions)} entries")
    for width in widths:
        count, byte_count = directory_size(root / "trip_images" / "display" / str(width))
        print(f"{width}w: {count} files, {byte_count / (1024 * 1024):.2f} MiB")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (FileNotFoundError, ValueError, OSError) as error:
        print(f"error: {error}", file=sys.stderr)
        raise SystemExit(1)
