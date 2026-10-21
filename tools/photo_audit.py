"""Summarise local phone photos without displaying them (run from the repo root).

    python tools/photo_audit.py                      # tools/fixtures/phone-photos/*
    python tools/photo_audit.py path/to/folder ...

Prints counts only: formats, megapixels, EXIF orientation and make/model, and whether GPS tags are present
(never the coordinates). HEIC/HEIF files are detected by their header; Chrome on Android cannot decode them, so
the browser app cannot read those. File names are printed only for files that need attention (max 5 per group).
"""
import glob
import os
import sys
from collections import Counter

from PIL import Image

EXIF_ORIENTATION, EXIF_MAKE, EXIF_MODEL, EXIF_GPS_IFD = 0x0112, 0x010F, 0x0110, 0x8825
IMAGE_EXT = {".jpg", ".jpeg", ".jfif", ".png", ".webp", ".heic", ".heif"}


def is_heif(path):
    with open(path, "rb") as f:
        head = f.read(16)
    return head[4:8] == b"ftyp" and head[8:12] in (b"heic", b"heix", b"hevc", b"mif1", b"msf1", b"heif")


def audit(folder):
    files = sorted(p for p in glob.glob(os.path.join(folder, "**", "*"), recursive=True) if os.path.splitext(p)[1].lower() in IMAGE_EXT)
    print(f"\n== {folder}: {len(files)} image file(s)")
    if not files:
        return
    ext, orient, devices = Counter(), Counter(), Counter()
    mp, total_bytes, gps, heif, unreadable = [], 0, 0, [], []
    for p in files:
        ext[os.path.splitext(p)[1].lower()] += 1
        total_bytes += os.path.getsize(p)
        if is_heif(p):
            heif.append(p)
            continue
        try:
            with Image.open(p) as im:
                mp.append(im.width * im.height / 1e6)
                ex = im.getexif()
                orient[ex.get(EXIF_ORIENTATION, "none")] += 1
                devices[f"{ex.get(EXIF_MAKE, '?')} {ex.get(EXIF_MODEL, '?')}".strip()] += 1
                if EXIF_GPS_IFD in ex:
                    gps += 1
        except Exception:
            unreadable.append(p)
    print(f"   extensions: {dict(ext)} | total {total_bytes / 1e6:.1f} MB")
    if mp:
        print(f"   megapixels: min {min(mp):.1f}  median {sorted(mp)[len(mp) // 2]:.1f}  max {max(mp):.1f}")
        print(f"   EXIF orientation values: {dict(orient)}  (1 or none = upright; others are rotated by tag only)")
        print(f"   devices (EXIF make/model): {dict(devices)}")
        print(f"   files with GPS location tags: {gps} of {len(mp)}  <- never commit or upload these")
    print(f"   HEIC/HEIF (not decodable by Chrome on Android): {len(heif)}" + (f"  e.g. {[os.path.basename(p) for p in heif[:5]]}" if heif else ""))
    if unreadable:
        print(f"   unreadable: {len(unreadable)}  e.g. {[os.path.basename(p) for p in unreadable[:5]]}")


def main():
    folders = sys.argv[1:] or sorted(glob.glob(os.path.join("tools", "fixtures", "phone-photos", "*")))
    if not folders:
        print("no folders found; put photos in tools/fixtures/phone-photos/<device>/")
    for f in folders:
        audit(f)


if __name__ == "__main__":
    main()
