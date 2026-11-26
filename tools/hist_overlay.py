"""Rebuilds each historical map on today's provinces (Natural Earth admin-1).

Every province goes to the historical unit that covers most of it; a province shared by several
units is cut along the historical border. The result is an exact partition of today's land, so the
borders of a year always close, follow the real coastline and never run over the sea.
Output: data/android/frag_<year>.geojson with properties u (unit index, same order as hist-old.mjs;
land no unit covers goes to an extra last unit "_none").
"""
import json, os, sys, time
from shapely.geometry import shape, mapping
from shapely.strtree import STRtree
from shapely.validation import make_valid
from shapely.ops import unary_union
from shapely import prepared

YEARS = [int(a) for a in sys.argv[1:]] or [1600, 1650, 1700, 1715, 1783, 1800, 1815, 1880, 1900, 1914, 1920, 1930, 1938, 1945]

def polys_only(g):
    g = make_valid(g)
    if g.is_empty:
        return None
    if g.geom_type in ("Polygon", "MultiPolygon"):
        return g
    parts = [p for p in getattr(g, "geoms", []) if p.geom_type in ("Polygon", "MultiPolygon")]
    return unary_union(parts) if parts else None

t0 = time.time()
adm = json.load(open("dl/admin1.geojson"))
OVR = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "hist-overrides.json")))
provinces = []
REGION = {}
for f in adm["features"]:
    g = polys_only(shape(f["geometry"]))
    if g is None or g.area <= 0:
        continue
    # islands and other separate parts are assigned one by one
    for part in (g.geoms if g.geom_type == "MultiPolygon" else [g]):
        if part.area > 0:
            pr = f["properties"]
            provinces.append((part, pr["adm0_a3"], pr["iso_3166_2"], pr["region"] or ""))
            REGION[pr["iso_3166_2"]] = pr["adm0_a3"] + "/" + (pr["region"] or "")
print("provinces", len(provinces), round(time.time() - t0, 1), "s", flush=True)

for year in YEARS:
    t1 = time.time()
    hb = json.load(open(f"dl/hb/world_{year}.geojson"))
    keys, key_index, unit_of_feat, geoms = [], {}, [], []
    for i, f in enumerate(hb["features"]):
        raw = f["properties"].get("NAME")
        key = raw if raw and raw.strip() else ("__UKNL" if raw and year == 1815 else f"_null_{i}")
        if key not in key_index:
            key_index[key] = len(keys)
            keys.append(key)
        g = polys_only(shape(f["geometry"])) if f.get("geometry") else None
        if g is None:
            continue
        unit_of_feat.append(key_index[key])
        geoms.append(g)
    tree = STRtree(geoms)
    prep = [prepared.prep(g) for g in geoms]
    out = []
    split_count = 0
    # units the old map lacks: whole provinces of today go to them (hist-overrides.json)
    for o in OVR.get(str(year), []):
        if o["key"] not in key_index:  # a key the map already has just gets more provinces
            key_index[o["key"]] = len(keys)
            keys.append(o["key"])

    def override(a3, iso, region):
        for o in OVR.get(str(year), []):
            if iso in o.get("iso", []) or a3 in o.get("adm0", []) or (a3 + "/" + region) in o.get("region", []):
                return key_index[o["key"]]
        return None
    NONE = len(keys)  # land that no unit of the old map covers
    for A, a3, iso, region in provinces:
        ov = override(a3, iso, region)
        if ov is not None:
            out.append((A, ov, a3, iso))
            continue
        cand = tree.query(A, predicate="intersects")
        if len(cand) == 0:
            out.append((A, NONE, a3, iso))  # not covered by the old map (no owner)
            continue
        whole = next((c for c in cand if prep[c].contains(A)), None)
        if whole is not None:
            out.append((A, unit_of_feat[whole], a3, iso))
            continue
        share = {}
        for c in cand:
            try:
                a = A.intersection(geoms[c]).area
            except Exception:
                continue
            if a > 0:
                u = unit_of_feat[c]
                share[u] = share.get(u, 0.0) + a
        if not share:
            out.append((A, NONE, a3, iso))
            continue
        total = A.area
        order = sorted(share.items(), key=lambda kv: -kv[1])
        big_u = order[0][0]
        # only cut a province for a real share of it, not for slivers left by coarse old coastlines
        minors = [u for u, a in order[1:] if a / total >= 0.08 or a >= 0.3]
        if not minors:
            out.append((A, big_u, a3, iso))
            continue
        split_count += 1
        taken = None
        for u in minors:
            part_geom = unary_union([geoms[c] for c in cand if unit_of_feat[c] == u])
            piece = polys_only(A.intersection(part_geom))
            if piece is None:
                continue
            if taken is not None:
                piece = polys_only(piece.difference(taken))
                if piece is None:
                    continue
            out.append((piece, u, a3, iso))
            taken = piece if taken is None else unary_union([taken, piece])
        rest = polys_only(A.difference(taken)) if taken is not None else A
        if rest is not None:
            out.append((rest, big_u, a3, iso))
    for o in OVR.get(str(year), []):
        if "take" in o:
            t = o["take"]
            src, (x0, y0, x1, y1) = key_index[t["from"]], t.get("bbox", [-180, -90, 180, 90])
            for k, (g, u, a3, iso) in enumerate(out):
                if u != src or ("adm0" in t and a3 not in t["adm0"]) or ("iso" in t and iso not in t["iso"]) or ("region" in t and REGION.get(iso) not in t["region"]):
                    continue
                c = g.representative_point()
                if x0 <= c.x <= x1 and y0 <= c.y <= y1:
                    out[k] = (g, key_index[o["key"]], a3, iso)
    if any(u == NONE for _, u, _, _ in out):
        keys.append("_none")
    feats = [{"type": "Feature", "properties": {"u": u}, "geometry": mapping(g)} for g, u, _, _ in out]
    json.dump({"type": "FeatureCollection", "keys": keys, "features": feats}, open(f"data/android/frag_{year}.geojson", "w"))
    print(year, "units", len(keys), "fragments", len(feats), "split provinces", split_count, round(time.time() - t1, 1), "s", flush=True)
