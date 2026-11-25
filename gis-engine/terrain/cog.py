"""Minimal reader for single-band float32 Cloud-Optimised GeoTIFFs (such as Copernicus GLO-30 on AWS).

It reads only the tiles that cover the requested points, with HTTP range requests, so the pilot needs a few MB instead
of the whole 1 x 1 degree tile. Standard library + NumPy only. Supports classic little/big-endian TIFF, tiled layout,
no / DEFLATE compression and predictor 1 (none) or 3 (floating point), which is what Copernicus DEM COGs use.
"""
from __future__ import annotations

import struct
import urllib.request
import zlib
from typing import Callable

import numpy as np

# Copernicus DEM GLO-30 (DSM, 1 arc-second), public bucket on AWS (no account needed)
GLO30_BASE = "https://copernicus-dem-30m.s3.eu-central-1.amazonaws.com"
GLO30_BASE_FALLBACK = "https://copernicus-dem-30m.s3.amazonaws.com"

Reader = Callable[[int, int], bytes]   # (offset, length) -> bytes


def glo30_tile_name(lat: float, lon: float) -> str:
    la, lo = int(np.floor(lat)), int(np.floor(lon))
    ns, ew = ("N" if la >= 0 else "S"), ("E" if lo >= 0 else "W")
    return f"Copernicus_DSM_COG_10_{ns}{abs(la):02d}_00_{ew}{abs(lo):03d}_00_DEM"


def glo30_url(lat: float, lon: float, base: str = GLO30_BASE) -> str:
    name = glo30_tile_name(lat, lon)
    return f"{base}/{name}/{name}.tif"


def http_reader(url: str, timeout: float = 60.0) -> Reader:
    def read(offset: int, length: int) -> bytes:
        req = urllib.request.Request(url, headers={"Range": f"bytes={offset}-{offset + length - 1}", "User-Agent": "prithvi-ai/1.0"})
        with urllib.request.urlopen(req, timeout=timeout) as r:  # noqa: S310 (fixed https URL)
            data = r.read()
            if r.status == 200 and len(data) > length:   # server ignored the range: slice it ourselves
                data = data[offset:offset + length]
        if len(data) != length:
            raise IOError(f"short read from {url}: wanted {length} bytes at {offset}, got {len(data)}")
        return data
    return read


def bytes_reader(buf: bytes) -> Reader:
    return lambda offset, length: buf[offset:offset + length]


TYPES = {1: (1, "B"), 2: (1, "c"), 3: (2, "H"), 4: (4, "I"), 5: (8, "II"), 6: (1, "b"), 8: (2, "h"), 9: (4, "i"),
         11: (4, "f"), 12: (8, "d"), 16: (8, "Q")}


class COG:
    def __init__(self, read: Reader):
        self.read = read
        head = read(0, 8)
        self.e = {b"II": "<", b"MM": ">"}.get(head[:2])
        if self.e is None or struct.unpack(self.e + "H", head[2:4])[0] != 42:
            raise ValueError("not a classic TIFF (BigTIFF is not supported)")
        ifd = struct.unpack(self.e + "I", head[4:8])[0]
        n = struct.unpack(self.e + "H", read(ifd, 2))[0]
        raw = read(ifd + 2, 12 * n)
        self.tags: dict[int, tuple] = {}
        for k in range(n):
            tag, typ, cnt = struct.unpack(self.e + "HHI", raw[12 * k:12 * k + 8])
            size, fmt = TYPES.get(typ, (1, "B"))
            nbytes = size * cnt
            val = raw[12 * k + 8:12 * k + 12]
            data = val[:nbytes] if nbytes <= 4 else read(struct.unpack(self.e + "I", val)[0], nbytes)
            if fmt == "c":
                self.tags[tag] = (data.split(b"\0")[0].decode("latin-1"),)
            elif fmt == "II":
                self.tags[tag] = struct.unpack(self.e + "I" * (2 * cnt), data)
            else:
                self.tags[tag] = struct.unpack(self.e + fmt * cnt, data)
        t = self.tags
        self.width, self.height = t[256][0], t[257][0]
        if 322 not in t:
            raise ValueError("only tiled TIFFs are supported")
        self.tw, self.th = t[322][0], t[323][0]
        self.offsets, self.counts = t[324], t[325]
        self.compression = t.get(259, (1,))[0]
        self.predictor = t.get(317, (1,))[0]
        bps, fmtc = t.get(258, (32,))[0], t.get(339, (3,))[0]
        if (bps, fmtc) != (32, 3) or t.get(277, (1,))[0] != 1:
            raise ValueError("only single-band float32 rasters are supported")
        if self.compression not in (1, 8, 32946):
            raise ValueError(f"unsupported compression {self.compression}")
        if self.predictor not in (1, 3):
            raise ValueError(f"unsupported predictor {self.predictor}")
        sx, sy = t[33550][0], t[33550][1]
        ti, tj, _, x0, y0, _ = t[33922][:6]
        # GTRasterTypeGeoKey (1025): 1 = PixelIsArea (default), 2 = PixelIsPoint
        keys = t.get(34735, ())
        raster_type = 1
        for k in range(4, len(keys), 4):
            if keys[k] == 1025:
                raster_type = keys[k + 3]
        # lon/lat of the CENTRE of pixel (col 0, row 0)
        half = 0.5 if raster_type == 1 else 0.0
        self.lon0 = x0 + (half - ti) * sx
        self.lat0 = y0 - (half - tj) * sy
        self.sx, self.sy = sx, sy
        self.nodata = float(t[42113][0]) if 42113 in t and t[42113][0].strip() else None
        self.tiles_x = (self.width + self.tw - 1) // self.tw
        self._cache: dict[int, np.ndarray] = {}

    def tile(self, k: int) -> np.ndarray:
        if k in self._cache:
            return self._cache[k]
        data = self.read(self.offsets[k], self.counts[k])
        if self.compression in (8, 32946):
            data = zlib.decompress(data)
        if self.predictor == 3:
            b = np.frombuffer(data, dtype=np.uint8).reshape(self.th, 4 * self.tw)
            b = np.cumsum(b, axis=1, dtype=np.uint8)                      # undo byte-wise horizontal differencing
            b = b.reshape(self.th, 4, self.tw).transpose(0, 2, 1)         # byte planes -> per-sample bytes (big-endian)
            arr = np.ascontiguousarray(b).view(">f4").reshape(self.th, self.tw).astype(np.float64)
        else:
            arr = np.frombuffer(data, dtype=self.e + "f4").reshape(self.th, self.tw).astype(np.float64)
        self._cache[k] = arr
        return arr

    def pixel(self, col: int, row: int) -> float:
        col = min(max(col, 0), self.width - 1); row = min(max(row, 0), self.height - 1)
        t = self.tile((row // self.th) * self.tiles_x + col // self.tw)
        return float(t[row % self.th, col % self.tw])

    def sample(self, lon: float, lat: float) -> float:
        """Bilinear value at lon/lat (between pixel centres)."""
        fx = (lon - self.lon0) / self.sx
        fy = (self.lat0 - lat) / self.sy
        c0, r0 = int(np.floor(fx)), int(np.floor(fy))
        ax, ay = fx - c0, fy - r0
        v = [[self.pixel(c0 + dc, r0 + dr) for dc in (0, 1)] for dr in (0, 1)]
        vals = [v[0][0], v[0][1], v[1][0], v[1][1]]
        if self.nodata is not None and any(x == self.nodata for x in vals):
            raise ValueError(f"no-data at {lat:.5f}, {lon:.5f}")
        return (v[0][0] * (1 - ax) * (1 - ay) + v[0][1] * ax * (1 - ay) + v[1][0] * (1 - ax) * ay + v[1][1] * ax * ay)
