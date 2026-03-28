"""
Finedr logo generator — Apple macOS style
Blue-to-teal gradient rounded square + white FR monogram
"""
from PIL import Image, ImageDraw, ImageFilter
import os

def lerp_color(c1, c2, t):
    return tuple(int(c1[i] + (c2[i] - c1[i]) * t) for i in range(len(c1)))

def make_rounded_mask(S, radius):
    mask = Image.new("L", (S, S), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, S-1, S-1], radius=radius, fill=255)
    return mask

def make_gradient(S):
    col_tl = (28, 112, 242)
    col_tr = ( 0, 200, 215)
    col_bl = (18,  86, 224)
    col_br = ( 0, 158, 178)
    pixels = []
    for y in range(S):
        ty = y / (S - 1)
        for x in range(S):
            tx = x / (S - 1)
            top    = lerp_color(col_tl, col_tr, tx)
            bottom = lerp_color(col_bl, col_br, tx)
            pixels.append(lerp_color(top, bottom, ty) + (255,))
    grad = Image.new("RGBA", (S, S))
    grad.putdata(pixels)
    return grad


def draw_fr(S):
    """
    Draw the FR monogram on a greyscale canvas (255 = letter pixel).

    Design (at 512-base coords):
      • Letter block: x=80..432, y=78..432  (centred in 512)
      • Stem: x=80..134 (W=54)
      • Top bar: y=78..132 (H=54) — same height as stem
        Top bar width matches right edge of arch outer = stem_right + arch_r
      • R arch: D-shape, right half only
        arch_cx = stem_right = 134
        arch top  = 78  (same as top of top bar)
        arch_bot  = 290 (arch height H_a = 212, so arch_r = 106)
        arch right edge = 134 + 106 = 240
        → top bar also ends at 240
      • Middle bar: y=244..290 (H=46) — same bottom as arch_bot=290
        Middle bar width: 80..280
      • R leg: diagonal from (≈236,278) to (≈432,432)
    """
    fr = Image.new("L", (S, S), 0)
    d  = ImageDraw.Draw(fr)
    u  = S / 512.0

    def rr(x, y, w, h, r=0, fill=255):
        d.rounded_rectangle([x*u, y*u, (x+w)*u, (y+h)*u],
                             radius=max(1, r*u), fill=fill)

    def el(x1, y1, x2, y2, fill=255):
        d.ellipse([x1*u, y1*u, x2*u, y2*u], fill=fill)

    def rect(x, y, w, h, fill=255):
        d.rectangle([x*u, y*u, (x+w)*u, (y+h)*u], fill=fill)

    # Key measurements
    sw        = 54     # stroke width
    x0        = 80     # left edge of stem
    stem_x2   = x0 + sw  # = 134, right edge of stem

    top_y     = 78     # top of top bar
    arch_top  = top_y
    arch_bot  = 290
    arch_h    = arch_bot - arch_top   # = 212
    arch_r    = arch_h // 2           # = 106
    arch_cx   = stem_x2               # = 134, left centre of D
    arch_cy   = arch_top + arch_r     # = 78 + 106 = 184

    mid_y     = arch_bot - sw + 4     # = 240  (middle bar, aligns arch bottom)
    mid_bot   = arch_bot              # = 290

    wall      = sw - 2                # ring wall thickness = 52

    # ── STEM (full height) ─────────────────────────────────
    rr(x0, top_y, sw, 432 - top_y, 18)

    # ── TOP BAR — same width as outer arch diameter ────────
    # extends x0 to stem_x2 + arch_r = 134 + 106 = 240
    rr(x0, top_y, arch_r + sw, sw, 14)

    # ── MIDDLE BAR ─────────────────────────────────────────
    rr(x0, mid_y, 200, sw - 4, 12)

    # ── R ARCH — outer D (right half of full circle) ───────
    # Draw full circle, erase left half (to the left of stem_x2)
    el(arch_cx - arch_r, arch_cy - arch_r,
       arch_cx + arch_r, arch_cy + arch_r)
    # Erase left half + a bit extra so the stem stays clean
    rect(0, arch_cy - arch_r - 4,
         arch_cx + 2, arch_r * 2 + 8, fill=0)

    # ── PUNCH HOLE inside arch ──────────────────────────────
    ir = arch_r - wall           # inner radius
    if ir > 2:
        el(arch_cx - ir, arch_cy - ir,
           arch_cx + ir, arch_cy + ir, fill=0)
        # Keep left cap solid by re-erasing left side of inner hole
        rect(0, arch_cy - ir - 2, arch_cx + 2, ir * 2 + 4, fill=0)

    # ── REDRAW pieces that got clipped by arch erase ────────
    rr(x0, top_y, sw, 432 - top_y, 18)  # stem
    rr(x0, top_y, arch_r + sw, sw, 14)   # top bar
    rr(x0, mid_y, 200, sw - 4, 12)       # middle bar

    # ── R DIAGONAL LEG ─────────────────────────────────────
    # From bottom-right of arch (≈ arch_cx + ir * 0.7, arch_cy + ir * 0.7)
    # to bottom-right corner of icon area
    lw = sw - 6   # leg width
    pts = [
        (222, 260),  # top-left  (near arch belly)
        (264, 258),  # top-right
        (434, 430),  # bottom-right
        (388, 432),  # bottom-left
    ]
    d.polygon([(x*u, y*u) for x, y in pts], fill=255)
    # Rounded caps
    el(218, 248, 268, 270)
    el(380, 420, 436, 442)

    # Apply very slight blur to soften edges (anti-alias substitute)
    fr = fr.filter(ImageFilter.GaussianBlur(radius=max(1, int(S * 0.003))))

    # Return white RGBA
    white = Image.new("RGBA", (S, S), (255, 255, 255, 255))
    white.putalpha(fr)
    return white


def make_icon(S=512):
    radius = int(S * 0.22)
    mask = make_rounded_mask(S, radius)

    bg = make_gradient(S)
    bg.putalpha(mask)

    # Specular sheen
    sheen = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(sheen).ellipse(
        [int(S*0.12), int(S*0.04), int(S*0.92), int(S*0.50)],
        fill=(255, 255, 255, 32)
    )
    sheen = sheen.filter(ImageFilter.GaussianBlur(radius=int(S * 0.045)))
    img = Image.alpha_composite(bg, sheen)
    img.putalpha(mask)

    fr = draw_fr(S)
    result = Image.alpha_composite(img, fr)
    final  = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    final.paste(result, (0, 0), mask)
    return final


# ──────────────────────────────────────────────
icons_dir = r"C:\Users\xande\projects\Finedr-main\tauri-file-manager\src-tauri\icons"
os.makedirs(icons_dir, exist_ok=True)

print("Rendering 1024px base...")
base = make_icon(1024)

for fname, sz in [("32x32.png",32),("128x128.png",128),("128x128@2x.png",256),("icon_512.png",512)]:
    base.resize((sz, sz), Image.LANCZOS).save(os.path.join(icons_dir, fname), "PNG")
    print(f"  {fname}")

base.resize((256, 256), Image.LANCZOS).save(
    os.path.join(icons_dir, "icon.ico"), format="ICO",
    sizes=[(s, s) for s in [16, 24, 32, 48, 64, 128, 256]])
print("  icon.ico")

preview = os.path.join(icons_dir, "icon_preview.png")
base.resize((512, 512), Image.LANCZOS).save(preview, "PNG")
print(f"\nPreview: {preview}\nDone.")
