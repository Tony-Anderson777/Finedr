"""
Convert logo_source.png into all Tauri icon formats.
- Auto-detects and crops the white border
- Removes white background, keeps the rounded square icon
- Outputs: 32x32, 128x128, 128x128@2x, icon_512, icon.ico
"""
from PIL import Image, ImageDraw
import numpy as np
import os

src_path = r"C:\Users\xande\projects\Finedr-main\logo_source.png.png"
icons_dir = r"C:\Users\xande\projects\Finedr-main\tauri-file-manager\src-tauri\icons"

# ── 1. Load source ──────────────────────────────────────────────────────────
img = Image.open(src_path).convert("RGBA")
print(f"Source size: {img.size}")

# ── 2. Find bounding box of the non-white content ──────────────────────────
arr = np.array(img)
# White background = R>240, G>240, B>240
is_white = (arr[:,:,0] > 240) & (arr[:,:,1] > 240) & (arr[:,:,2] > 240)
non_white_rows = np.where(~is_white.all(axis=1))[0]
non_white_cols = np.where(~is_white.all(axis=0))[0]

if len(non_white_rows) == 0 or len(non_white_cols) == 0:
    print("Could not detect content, using full image.")
    cropped = img
else:
    r0, r1 = non_white_rows[0], non_white_rows[-1]
    c0, c1 = non_white_cols[0], non_white_cols[-1]
    # Add 2px margin
    r0 = max(0, r0 - 2); r1 = min(img.height - 1, r1 + 2)
    c0 = max(0, c0 - 2); c1 = min(img.width  - 1, c1 + 2)
    cropped = img.crop((c0, r0, c1 + 1, r1 + 1))
    print(f"Cropped to: {cropped.size}  (from {c0},{r0} to {c1},{r1})")

# ── 3. Make square (pad shorter side) ───────────────────────────────────────
w, h = cropped.size
side = max(w, h)
square = Image.new("RGBA", (side, side), (0, 0, 0, 0))
square.paste(cropped, ((side - w) // 2, (side - h) // 2))

# ── 4. Remove remaining white background → make transparent ─────────────────
arr2 = np.array(square)
# Pixels that are near-white AND in the "outer" region: make transparent
# Strategy: any pixel with R>230 G>230 B>230 that is NOT inside the rounded rect
# Simpler: replace very-light pixels (the soft glow border) with transparency
# The icon itself has a blue gradient core; white only appears in the letter/glow
# Use: alpha = 0 where pixel is "nearly white background" (low saturation, high value)
r = arr2[:,:,0].astype(float)
g = arr2[:,:,1].astype(float)
b = arr2[:,:,2].astype(float)

# Detect near-white: all channels > 235 and variance < 25 (low colour saturation)
ch_min = np.minimum(np.minimum(r, g), b)
ch_max = np.maximum(np.maximum(r, g), b)
variance = ch_max - ch_min

near_white_bg = (ch_min > 232) & (variance < 28)
arr2[near_white_bg, 3] = 0   # make transparent

# Also smooth the edge: semi-transparent for pixels 220..232
edge_px = (ch_min > 210) & (ch_min <= 232) & (variance < 35)
arr2[edge_px, 3] = ((ch_min[edge_px] - 210) / 22.0 * 200).astype(np.uint8)

clean = Image.fromarray(arr2.astype(np.uint8), "RGBA")
print(f"Background removed. Final size: {clean.size}")

# ── 5. Resize and save all required formats ──────────────────────────────────
os.makedirs(icons_dir, exist_ok=True)

def save(size, filename):
    resized = clean.resize((size, size), Image.LANCZOS)
    path = os.path.join(icons_dir, filename)
    resized.save(path, "PNG")
    print(f"  Saved {filename}  ({size}x{size})")

save(32,  "32x32.png")
save(128, "128x128.png")
save(256, "128x128@2x.png")
save(512, "icon_512.png")

# Preview
preview_path = os.path.join(icons_dir, "icon_preview.png")
clean.resize((512, 512), Image.LANCZOS).save(preview_path, "PNG")
print(f"  Saved icon_preview.png  (512x512)")

# ICO — multi-size Windows icon
ico_path = os.path.join(icons_dir, "icon.ico")
clean.resize((256, 256), Image.LANCZOS).save(
    ico_path, format="ICO",
    sizes=[(s, s) for s in [16, 24, 32, 48, 64, 128, 256]]
)
print(f"  Saved icon.ico  (16/24/32/48/64/128/256)")

print("\nAll icons generated successfully.")
