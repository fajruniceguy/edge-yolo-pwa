"""Generate the PWA icon set into web/public/ (run from the repo root: python tools/make_icons.py).

One artwork, drawn once on a 512-unit canvas and rendered two ways: favicon.svg and the PNGs.
The artwork is shelf rows with detection-green boxes on the app's blue. Everything that matters sits inside
the central 288x288 square, which is inside the 80%-diameter safe circle of a maskable icon, so the same
drawing serves as 'any' and 'maskable'. Needs Pillow (installed with ultralytics).
"""
import os

from PIL import Image, ImageDraw

BG = "#1d4ed8"
BOX_FILL = "#ffffff"
BOX_STROKE = "#22c55e"
SHELF = "#ffffff"
OUT = os.path.join("web", "public")

X0, CELL = 112, 96  # content square starts at 112, three 96-unit columns/rows (112..400)
HEIGHTS = [[64, 76, 52], [72, 56, 76], [60, 72, 64]]  # box heights per row/column
BOX_W, BOX_INSET, STROKE, RADIUS = 76, 10, 6, 8
SHELF_X1, SHELF_X2, SHELF_T = 116, 396, 6


def shapes():
    """Yield ('shelf', x1, y, x2, thickness) and ('box', x1, y1, x2, y2) in 512-unit coordinates."""
    for r in range(3):
        shelf_y = X0 + CELL * (r + 1) - 4
        yield ("shelf", SHELF_X1, shelf_y, SHELF_X2, SHELF_T)
        for c in range(3):
            x1 = X0 + c * CELL + BOX_INSET
            bottom = shelf_y - 2 - SHELF_T // 2
            yield ("box", x1, bottom - HEIGHTS[r][c], x1 + BOX_W, bottom)


def svg() -> str:
    parts = [
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="Stock Counter">',
        f'<rect width="512" height="512" rx="96" fill="{BG}"/>',
    ]
    for s in shapes():
        if s[0] == "shelf":
            _, x1, y, x2, t = s
            parts.append(f'<rect x="{x1}" y="{y - t // 2}" width="{x2 - x1}" height="{t}" rx="3" fill="{SHELF}"/>')
        else:
            _, x1, y1, x2, y2 = s
            parts.append(
                f'<rect x="{x1}" y="{y1}" width="{x2 - x1}" height="{y2 - y1}" rx="{RADIUS}" '
                f'fill="{BOX_FILL}" stroke="{BOX_STROKE}" stroke-width="{STROKE}"/>'
            )
    parts.append("</svg>")
    return "\n".join(parts) + "\n"


def png(size: int, rounded: bool) -> Image.Image:
    ss = 4  # supersample for anti-aliasing
    k = size * ss / 512
    img = Image.new("RGBA", (size * ss, size * ss), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if rounded:
        d.rounded_rectangle([0, 0, size * ss - 1, size * ss - 1], radius=96 * k, fill=BG)
    else:
        d.rectangle([0, 0, size * ss, size * ss], fill=BG)  # full-bleed, opaque
    for s in shapes():
        if s[0] == "shelf":
            _, x1, y, x2, t = s
            d.rounded_rectangle([x1 * k, (y - t // 2) * k, x2 * k, (y + t // 2) * k], radius=3 * k, fill=SHELF)
        else:
            _, x1, y1, x2, y2 = s
            # stroke is centred on the edge in SVG; inset the PIL outline by half a stroke to match
            d.rounded_rectangle([x1 * k, y1 * k, x2 * k, y2 * k], radius=RADIUS * k, fill=BOX_FILL, outline=BOX_STROKE, width=round(STROKE * k))
    return img.resize((size, size), Image.LANCZOS)


def main():
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, "favicon.svg"), "w", encoding="utf-8", newline="\n") as f:
        f.write(svg())
    # 'any' icons keep the rounded plate; maskable and apple-touch are full-bleed and opaque
    png(192, rounded=True).save(os.path.join(OUT, "icon-192.png"), optimize=True)
    png(512, rounded=True).save(os.path.join(OUT, "icon-512.png"), optimize=True)
    png(512, rounded=False).convert("RGB").save(os.path.join(OUT, "icon-maskable-512.png"), optimize=True)
    png(180, rounded=False).convert("RGB").save(os.path.join(OUT, "apple-touch-icon.png"), optimize=True)
    for n in ("favicon.svg", "icon-192.png", "icon-512.png", "icon-maskable-512.png", "apple-touch-icon.png"):
        p = os.path.join(OUT, n)
        print(f"{n:24s} {os.path.getsize(p):>7,} bytes")


if __name__ == "__main__":
    main()
