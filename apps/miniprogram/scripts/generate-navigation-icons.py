"""Draw the small, original line icons used by the native WeChat tab bar."""
from pathlib import Path
from math import cos, sin, pi
from PIL import Image, ImageDraw

OUTPUT = Path(__file__).resolve().parents[1] / "src" / "static" / "nav"
OUTPUT.mkdir(parents=True, exist_ok=True)
SCALE = 12

def draw_icon(name, color):
    image = Image.new("RGBA", (24 * SCALE, 24 * SCALE))
    pen = ImageDraw.Draw(image)
    def line(points):
        pen.line([(int(x * SCALE), int(y * SCALE)) for x, y in points], fill=color, width=round(1.5 * SCALE), joint="curve")
    def ellipse(bounds):
        pen.ellipse(tuple(round(v * SCALE) for v in bounds), outline=color, width=round(1.5 * SCALE))
    if name == "home":
        line([(3, 10), (12, 3), (21, 10)])
        line([(5, 9), (5, 21), (10, 21), (10, 15), (14, 15), (14, 21), (19, 21), (19, 9)])
    elif name == "books":
        line([(12, 5), (12, 21)])
        line([(12, 6), (8, 4), (3, 4), (3, 18), (8, 18), (12, 21), (16, 18), (21, 18), (21, 4), (16, 4), (12, 6)])
        line([(6, 8), (8, 8), (9, 9)])
        line([(15, 9), (16, 8), (18, 8)])
    elif name == "review":
        pen.arc((4*SCALE, 4*SCALE, 20*SCALE, 20*SCALE), 205, 355, fill=color, width=round(1.5*SCALE))
        pen.arc((4*SCALE, 4*SCALE, 20*SCALE, 20*SCALE), 25, 175, fill=color, width=round(1.5*SCALE))
        line([(16, 7), (20, 11), (21, 6)])
        line([(8, 17), (4, 13), (3, 18)])
        line([(9, 12), (11, 14), (15, 10)])
    else:
        points = []
        for i in range(32):
            angle = 2 * pi * i / 32
            radius = 9 if i % 4 in (1, 2) else 7.1
            points.append((12 + radius * cos(angle), 12 + radius * sin(angle)))
        line(points + [points[0]])
        ellipse((8.5, 8.5, 15.5, 15.5))
    return image.resize((81, 81), Image.Resampling.LANCZOS)

for name in ("home", "books", "review", "settings"):
    for suffix, color in (("", "#6b796d"), ("-selected", "#315944")):
        draw_icon(name, color).save(OUTPUT / f"{name}{suffix}.png", optimize=True)
