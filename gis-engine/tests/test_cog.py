"""The minimal COG reader against GeoTIFFs written by tifffile in the Copernicus layout (tiled, DEFLATE, floating-point
predictor, PixelIsArea or PixelIsPoint). Skipped when tifffile / imagecodecs are not installed (they are test-only)."""
import io

import numpy as np
import pytest

tifffile = pytest.importorskip("tifffile")
pytest.importorskip("imagecodecs")

from terrain.cog import COG, bytes_reader, glo30_tile_name, glo30_url  # noqa: E402

LON0, LAT0, STEP = 82.0, 17.0, 1 / 3600


def make(raster_type=1, predictor=3, compression="deflate", byteorder="<"):
    yy, xx = np.mgrid[0:600, 0:520]
    data = (5 + 0.01 * xx + 0.02 * yy + np.sin(xx / 7.0)).astype(np.float32)
    buf = io.BytesIO()
    geokeys = (1, 1, 0, 2, 1024, 0, 1, 2, 1025, 0, 1, raster_type)
    extratags = [(33550, 12, 3, (STEP, STEP, 0.0)), (33922, 12, 6, (0.0, 0.0, 0.0, LON0, LAT0, 0.0)), (34735, 3, len(geokeys), geokeys),
                 (42113, 2, 0, "-32767.0")]
    tifffile.imwrite(buf, data, tile=(256, 256), compression=compression, predictor=predictor, extratags=extratags, byteorder=byteorder)
    return data, buf.getvalue()


@pytest.mark.parametrize("raster_type,predictor,compression,byteorder", [(1, 3, "deflate", "<"), (2, 3, "deflate", "<"), (1, 1, None, "<"), (1, 3, "deflate", ">")])
def test_reads_pixels_and_interpolates(raster_type, predictor, compression, byteorder):
    data, buf = make(raster_type, predictor, compression, byteorder)
    c = COG(bytes_reader(buf))
    assert (c.width, c.height) == (520, 600)
    for col, row in [(0, 0), (255, 255), (256, 256), (519, 599), (300, 10)]:
        assert c.pixel(col, row) == pytest.approx(float(data[row, col]), abs=1e-6)
    half = 0.5 if raster_type == 1 else 0.0
    # the centre of pixel (col 300, row 10) reads back exactly, and a point between four centres is their bilinear mix
    lon = LON0 + (300 + half) * STEP; lat = LAT0 - (10 + half) * STEP
    assert c.sample(lon, lat) == pytest.approx(float(data[10, 300]), abs=1e-5)
    v = c.sample(lon + 0.5 * STEP, lat - 0.5 * STEP)
    assert v == pytest.approx(float(data[10:12, 300:302].mean()), abs=1e-5)


def test_only_needed_tiles_are_read():
    _, buf = make()
    reads = []
    c = COG(lambda o, n: (reads.append(n), buf[o:o + n])[1])
    before = sum(reads)
    c.sample(LON0 + 10 * STEP, LAT0 - 10 * STEP)
    assert 0 < sum(reads) - before < len(buf) / 3


def test_tile_names():
    assert glo30_tile_name(16.95, 82.24) == "Copernicus_DSM_COG_10_N16_00_E082_00_DEM"
    assert glo30_url(16.95, 82.24).endswith("/Copernicus_DSM_COG_10_N16_00_E082_00_DEM/Copernicus_DSM_COG_10_N16_00_E082_00_DEM.tif")
