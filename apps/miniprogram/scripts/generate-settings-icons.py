"""Original line icons for the mini-program settings panels."""
from pathlib import Path
from PIL import Image, ImageDraw

OUTPUT = Path(__file__).resolve().parents[1] / "src" / "static" / "ui"
OUTPUT.mkdir(parents=True, exist_ok=True)
SCALE = 12
COLOR = "#507b55"
for name in ("status", "leaf", "shield", "cloud", "data"):
    image = Image.new("RGBA", (24 * SCALE, 24 * SCALE))
    pen = ImageDraw.Draw(image)
    def line(points):
        pen.line([(round(x*SCALE), round(y*SCALE)) for x, y in points], fill=COLOR, width=round(1.6*SCALE), joint="curve")
    def arc(bounds, start, end):
        pen.arc(tuple(round(v*SCALE) for v in bounds), start, end, fill=COLOR, width=round(1.6*SCALE))
    if name == "status":
        line([(5, 5), (19, 5), (19, 21), (5, 21), (5, 5)])
        line([(8, 3), (16, 3), (16, 7), (8, 7), (8, 3)])
        line([(8, 12), (10, 14), (15, 10)])
        line([(8, 17), (16, 17)])
    elif name == "leaf":
        arc((4, 3, 21, 20), 10, 170)
        arc((3, 2, 21, 20), 95, 275)
        line([(19, 3), (21, 2), (21, 8)])
        line([(3, 21), (11, 13), (16, 8)])
        line([(7, 16), (7, 11)])
    elif name == "shield":
        line([(12, 3), (20, 6), (19, 15), (16, 19), (12, 22), (8, 19), (5, 15), (4, 6), (12, 3)])
        line([(8, 12), (11, 15), (16, 10)])
    elif name == "cloud":
        arc((3, 9, 12, 18), 90, 280)
        arc((7, 4, 18, 15), 175, 355)
        arc((15, 9, 23, 18), 270, 90)
        line([(7, 18), (19, 18)])
    else:
        for x, y in ((4, 4), (13, 4), (4, 13), (13, 13)):
            pen.rounded_rectangle((x*SCALE,y*SCALE,(x+6)*SCALE,(y+6)*SCALE),radius=SCALE,outline=COLOR,width=round(1.5*SCALE))
    image.resize((72, 72), Image.Resampling.LANCZOS).save(OUTPUT / f"{name}.png", optimize=True)
