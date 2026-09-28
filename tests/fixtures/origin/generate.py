"""Generates the image-origin test fixtures (screenshot and camera look-alikes).

Run from the repository root: python3 tests/fixtures/origin/generate.py
Only the standard library is used, so the files are reproducible anywhere.
"""
import struct
import zlib
from pathlib import Path

HERE = Path(__file__).parent


def png(width, height, rgb, text_chunks=()):
    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)

    row = b"\x00" + bytes(rgb) * width
    raw = row * height
    out = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
    for kind, data in text_chunks:
        out += chunk(kind, data)
    return out + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")


# The XMP iOS and macOS embed in screenshots (UserComment = "Screenshot").
APPLE_SCREENSHOT_XMP = (
    '<x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="XMP Core 6.0.0">'
    '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">'
    '<rdf:Description rdf:about="" xmlns:exif="http://ns.adobe.com/exif/1.0/">'
    "<exif:PixelYDimension>2556</exif:PixelYDimension>"
    "<exif:PixelXDimension>1179</exif:PixelXDimension>"
    "<exif:UserComment>Screenshot</exif:UserComment>"
    "</rdf:Description></rdf:RDF></x:xmpmeta>"
).encode()
itxt = b"XML:com.adobe.xmp\x00\x00\x00\x00\x00" + APPLE_SCREENSHOT_XMP

(HERE / "IMG_4120.png").write_bytes(png(1179, 2556, (32, 36, 44), [(b"iTXt", itxt)]))
(HERE / "Screenshot_20260928-101500.png").write_bytes(png(1080, 2400, (230, 232, 236)))
(HERE / "capture.png").write_bytes(png(1920, 1080, (18, 22, 30)))


def camera_exif():
    """Little-endian TIFF with Make, Model and an Exif IFD holding exposure data."""
    make, model = b"Canon\x00", b"Canon EOS R6\x00"
    ifd0_entries, exif_entries = 3, 2
    ifd0 = 8
    exif_ifd = ifd0 + 2 + ifd0_entries * 12 + 4
    data = exif_ifd + 2 + exif_entries * 12 + 4
    make_at, model_at = data, data + len(make)
    exposure_at = model_at + len(model)
    fnumber_at = exposure_at + 8

    def entry(tag, typ, count, value):
        return struct.pack("<HHII", tag, typ, count, value)

    out = b"II*\x00" + struct.pack("<I", ifd0)
    out += struct.pack("<H", ifd0_entries)
    out += entry(0x010F, 2, len(make), make_at)
    out += entry(0x0110, 2, len(model), model_at)
    out += entry(0x8769, 4, 1, exif_ifd)
    out += struct.pack("<I", 0)
    out += struct.pack("<H", exif_entries)
    out += entry(0x829A, 5, 1, exposure_at)  # ExposureTime
    out += entry(0x829D, 5, 1, fnumber_at)  # FNumber
    out += struct.pack("<I", 0)
    out += make + model + struct.pack("<II", 1, 250) + struct.pack("<II", 28, 10)
    return b"Exif\x00\x00" + out


# Reuse a real JPEG's pixels and swap its EXIF for camera details.
source = (HERE.parent / "no_manifest.jpg").read_bytes()
i, segments = 2, []
while source[i] == 0xFF and source[i + 1] not in (0xDA, 0xD9):
    length = struct.unpack(">H", source[i + 2 : i + 4])[0]
    segment = source[i : i + 2 + length]
    if not (source[i + 1] == 0xE1 and segment[4:10] == b"Exif\x00\x00"):
        segments.append(segment)
    i += 2 + length
exif = camera_exif()
app1 = b"\xFF\xE1" + struct.pack(">H", len(exif) + 2) + exif
(HERE / "IMG_1234.jpg").write_bytes(b"\xFF\xD8" + app1 + b"".join(segments) + source[i:])

print("wrote", sorted(p.name for p in HERE.iterdir() if p.suffix != ".py"))
