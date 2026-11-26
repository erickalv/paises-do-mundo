"""Cutting regions for the historical pieces of today's countries.

A region built from admin-1 provinces has an outer edge that only roughly follows the
country's border, so cutting with it would leave the piece with a slightly different border
than the neighbouring country (and then no border line is drawn there). Each region is
therefore grown outwards by 0.25 deg and the country's other provinces are removed again:
the cut follows the internal province line exactly and the outer border comes from the country.
"""
import json
from shapely.geometry import shape, box, mapping, Polygon
from shapely.ops import unary_union
from shapely.geometry import MultiPoint
import shapely

A1 = json.load(open("dl/admin1.geojson"))["features"]
geo = {}
for f in A1:
    p = f["properties"]
    geo.setdefault(p["adm0_a3"], []).append((p["iso_3166_2"], shape(f["geometry"]).buffer(0)))

REGIONS = {
    "DEU~E": ("DEU", ["DE-MV", "DE-BB", "DE-BE", "DE-SN", "DE-ST", "DE-TH"], [(12.6, 50.15, 16, 55.5), (11.7, 53.1, 16, 55.5)]),
    "YEM~S": ("YEM", ["YE-AD", "YE-LA", "YE-AB", "YE-SH", "YE-HD", "YE-MR", "YE-DA"], [(48, 10, 56, 20), (43.9, 11, 46, 13.0), (45.0, 11, 48, 13.6)]),
    "IDN~P": ("IDN", ["ID-PA", "ID-PB"], []),
    "MYS~B": ("MYS", ["MY-12", "MY-13", "MY-15"], [(109, 0.5, 120, 8)]),
    "TZA~Z": ("TZA", ["TZ-06", "TZ-07", "TZ-10", "TZ-11", "TZ-15"], []),
    "IND~SK": ("IND", ["IN-SK"], []),
    "IND~GA": ("IND", ["IN-GA"], []),
    "CAN~NL": ("CAN", ["CA-NL"], []),
    "JPN~O": ("JPN", ["JP-47"], []),
}

out = {}
for key, (a3, codes, boxes) in REGIONS.items():
    mine = [g for c, g in geo[a3] if c in codes]
    others = unary_union([g for c, g in geo[a3] if c not in codes])
    reg = unary_union(mine + [box(*b) for b in boxes])
    zone = reg.buffer(0.25, join_style=2)
    # space around the region goes to whichever of region / other provinces is closer (Voronoi of boundary points)
    def bpts(g, clip):
        b = shapely.segmentize(g.boundary, 0.01).intersection(clip)
        return [p for p in shapely.get_coordinates(b)]
    pr = bpts(reg, zone.buffer(0.3)); po = bpts(others, zone.buffer(0.3))
    cells = shapely.voronoi_polygons(MultiPoint(pr + po), extend_to=zone.buffer(1).envelope)
    cell_of = {}
    tree = shapely.STRtree(list(cells.geoms))
    own = []
    import numpy as np
    pts = shapely.points(np.array(pr))
    idx = tree.query(pts, predicate="intersects")
    mine_cells = unary_union([cells.geoms[j] for j in set(idx[1].tolist())])
    grown = unary_union([reg, mine_cells.intersection(zone)]).difference(others)
    # keep only parts that touch the original region (no stray bits between other provinces)
    parts = [g for g in getattr(grown, "geoms", [grown]) if g.intersects(reg.buffer(1e-6))]
    g = unary_union(parts)
    polys = [p for p in getattr(g, "geoms", [g]) if isinstance(p, Polygon)]
    out[key] = [[list(map(list, p.exterior.coords))] + [list(map(list, r.coords)) for r in p.interiors] for p in polys]
    print(key, len(polys), round(g.area, 3), round(reg.area, 3))
json.dump(out, open("data/split_regions.json", "w"))
