"""Fill shapes of the historical units, used to highlight a tapped unit in yellow.

Each unit (all its fragments from hist_overlay.py) is simplified and grown 0.1 deg into the sea.
The app only paints the fill where the globe has land, so the extra sea margin never shows; it just
makes sure the simplified outline still covers the whole coast.
Output: data/android/fill_<year>.geojson with properties u (unit index).
"""
import json, sys, time
from shapely.geometry import shape, mapping
from shapely.strtree import STRtree
from shapely.ops import unary_union
from shapely.validation import make_valid
import shapely

YEARS = [int(a) for a in sys.argv[1:]] or [1600, 1650, 1700, 1715, 1783, 1800, 1815, 1880, 1900, 1914, 1920, 1930, 1938, 1945]
GROW, TOL = 0.1, 0.02

def polys(g):
    g = make_valid(g)
    parts = [p for p in getattr(g, "geoms", [g]) if p.geom_type in ("Polygon", "MultiPolygon")]
    return unary_union(parts) if parts else None

for year in YEARS:
    t0 = time.time()
    fc = json.load(open(f"data/android/frag_{year}.geojson"))
    frags = [(shape(f["geometry"]), f["properties"]["u"]) for f in fc["features"]]
    geoms = [g for g, _ in frags]
    tree = STRtree(geoms)
    by_unit = {}
    for g, u in frags:
        by_unit.setdefault(u, []).append(g)
    out = []
    for u, gs in by_unit.items():
        own = polys(unary_union(gs).simplify(TOL, preserve_topology=True))
        if own is None:
            continue
        # the sea margin only needs to be roughly right: few points
        grown = own.buffer(GROW, quad_segs=1).simplify(GROW * 0.4)
        near = tree.query(grown, predicate="intersects")
        others = unary_union([geoms[i] for i in near if frags[i][1] != u]).simplify(TOL, preserve_topology=True).buffer(0)
        sea = grown.difference(others) if not others.is_empty else grown
        fill = polys(unary_union([sea, own]).simplify(TOL, preserve_topology=True))
        if fill is None or fill.is_empty:
            continue
        out.append({"type": "Feature", "properties": {"u": u}, "geometry": mapping(fill)})
    json.dump({"type": "FeatureCollection", "features": out}, open(f"data/android/fill_{year}.geojson", "w"))
    nv = sum(len(shapely.get_coordinates(shape(f["geometry"]))) for f in out)
    print(year, "units", len(out), "points", nv, round(time.time() - t0, 1), "s", flush=True)
