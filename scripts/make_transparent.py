"""
Generate a transparent character PNG from the reference artwork.

The desktop pet only needs the character, so this script bakes the background
removal into an asset once instead of doing a flood fill on every launch.
It mirrors the runtime algorithm (per-row left/right background interpolation
plus a border-seeded flood fill), then adds a soft alpha edge and removes the
blue backdrop colour that bleeds into anti-aliased fur pixels.

Usage: python scripts/make_transparent.py
Output: public/assets/pet.png
"""
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "public" / "assets" / "reference.jpg"
OUTPUT = ROOT / "public" / "assets" / "pet.png"

# The renderer stretches the source into a square 512px sprite. Keep the same
# geometry here so the mouth / eye anchors stay registered with the artwork.
SIZE = 1024
MASK_SIZE = 512
SEED_TOLERANCE = 26
GROW_TOLERANCE = 34

# Pale chest fur is close in colour to the backdrop, so a plain flood fill
# eats holes into the body. Inside this elliptical core only pixels that are
# nearly identical to the backdrop may be removed.
PROTECT_CX, PROTECT_CY = 0.52, 0.66
PROTECT_RX, PROTECT_RY = 0.27, 0.33
PROTECT_TOLERANCE = 16

# The artwork has a horizontal floor reflection below the paws.
FLOOR_CLEAR_FROM = 0.982


def background_distance(rgb: np.ndarray, size: int) -> np.ndarray:
    """Distance from every pixel to the modelled horizontal gradient backdrop."""
    strip = 6
    left = rgb[:, :strip, :].mean(axis=1)
    right = rgb[:, -strip:, :].mean(axis=1)
    t = np.linspace(0.0, 1.0, size, dtype=np.float32)[None, :, None]
    backdrop = left[:, None, :] + (right - left)[:, None, :] * t
    return np.sqrt(((rgb - backdrop) ** 2).sum(axis=2))


def flood_background(dist: np.ndarray, size: int) -> np.ndarray:
    """Mark backdrop pixels reachable from the four image borders."""
    visited = np.zeros((size, size), dtype=bool)
    queue = deque()
    yy, xx = np.mgrid[0:size, 0:size]
    core = ((xx / size - PROTECT_CX) / PROTECT_RX) ** 2 + (
        (yy / size - PROTECT_CY) / PROTECT_RY
    ) ** 2 < 1

    def seed(x: int, y: int) -> None:
        if not visited[y, x] and dist[y, x] < SEED_TOLERANCE:
            visited[y, x] = True
            queue.append((y, x))

    for x in range(size):
        seed(x, 0)
        seed(x, size - 1)
    for y in range(size):
        seed(0, y)
        seed(size - 1, y)

    while queue:
        y, x = queue.popleft()
        for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
            if not (0 <= ny < size and 0 <= nx < size):
                continue
            if visited[ny, nx] or dist[ny, nx] >= GROW_TOLERANCE:
                continue
            if core[ny, nx] and dist[ny, nx] > PROTECT_TOLERANCE:
                continue
            visited[ny, nx] = True
            queue.append((ny, nx))

    return visited


def keep_largest_component(opaque: np.ndarray) -> np.ndarray:
    """Drop isolated raindrops / light specks, keeping only the character."""
    size = opaque.shape[0]
    seen = np.zeros_like(opaque)
    best: list[tuple[int, int]] = []
    for y in range(size):
        for x in range(size):
            if not opaque[y, x] or seen[y, x]:
                continue
            queue = deque([(y, x)])
            seen[y, x] = True
            component: list[tuple[int, int]] = []
            while queue:
                cy, cx = queue.popleft()
                component.append((cy, cx))
                for ny, nx in ((cy - 1, cx), (cy + 1, cx), (cy, cx - 1), (cy, cx + 1)):
                    if 0 <= ny < size and 0 <= nx < size and opaque[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True
                        queue.append((ny, nx))
            if len(component) > len(best):
                best = component
    result = np.zeros_like(opaque)
    for y, x in best:
        result[y, x] = True
    return result


def nearest_foreground(rgb: np.ndarray, opaque: np.ndarray) -> np.ndarray:
    """Fill transparent areas with nearby fur colour to avoid dark fringes."""
    estimate = rgb.copy()
    weight = opaque.astype(np.float32)
    for _ in range(24):
        neighbours = (
            np.roll(estimate, 1, axis=0)
            + np.roll(estimate, -1, axis=0)
            + np.roll(estimate, 1, axis=1)
            + np.roll(estimate, -1, axis=1)
        )
        counts = (
            np.roll(weight, 1, axis=0)
            + np.roll(weight, -1, axis=0)
            + np.roll(weight, 1, axis=1)
            + np.roll(weight, -1, axis=1)
        )
        update = (counts > 0) & (weight < 0.5)
        estimate[update] = neighbours[update] / np.maximum(counts[update, None], 1)
        weight[update] = 1.0
    return estimate


def main() -> None:
    source = Image.open(SOURCE).convert("RGB").resize((SIZE, SIZE), Image.LANCZOS)
    rgb = np.asarray(source).astype(np.float32)

    # Work on a half-resolution distance field: fast, and the resulting alpha
    # is upscaled with a feather so edges stay smooth at full resolution.
    small = np.asarray(source.resize((MASK_SIZE, MASK_SIZE), Image.LANCZOS)).astype(np.float32)
    dist_small = background_distance(small, MASK_SIZE)
    backdrop = flood_background(dist_small, MASK_SIZE)
    subject = keep_largest_component(~backdrop)
    print(f"backdrop ratio: {backdrop.mean():.3f}, subject ratio: {subject.mean():.3f}")

    alpha_small = Image.fromarray(
        np.where(subject, 255, 0).astype(np.uint8), "L"
    ).filter(ImageFilter.GaussianBlur(1.1))
    alpha = np.asarray(
        alpha_small.resize((SIZE, SIZE), Image.LANCZOS)
    ).astype(np.float32)
    alpha = np.clip(alpha, 0, 255)

    # Remove the floor reflection beneath the paws.
    floor = int(SIZE * FLOOR_CLEAR_FROM)
    alpha[floor:, :] = 0
    softness = max(2, int(SIZE * 0.003))
    for row in range(floor - softness, floor):
        alpha[row, :] *= (row - (floor - softness)) / softness

    # Remove the blue background colour that JPEG anti-aliasing left in the
    # semi-transparent fur edge, then seed fully transparent pixels with fur
    # colour so scaling never produces a dark halo.
    strip = 6
    left = rgb[:, :strip, :].mean(axis=1)
    right = rgb[:, -strip:, :].mean(axis=1)
    t = np.linspace(0.0, 1.0, SIZE, dtype=np.float32)[None, :, None]
    bg_colour = left[:, None, :] + (right - left)[:, None, :] * t
    coverage = alpha / 255.0
    decontaminated = np.clip(rgb - (1.0 - coverage[..., None]) * bg_colour, 0, 255)

    fg = nearest_foreground(decontaminated, coverage > 0.98)
    decontaminated = (
        decontaminated * coverage[..., None] + fg * (1.0 - coverage[..., None])
    )

    rgba = np.dstack(
        [np.clip(decontaminated, 0, 255).astype(np.uint8), alpha.astype(np.uint8)]
    )
    result = Image.fromarray(rgba, "RGBA")
    # Keep the full square canvas: the renderer maps every anchor into this
    # exact geometry, so trimming transparent margins would move the face.
    result.save(OUTPUT, optimize=True)
    print(f"saved {OUTPUT} size={result.size} bytes={OUTPUT.stat().st_size}")


if __name__ == "__main__":
    main()
