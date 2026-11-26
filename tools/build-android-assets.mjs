// Converts the web data into assets for the native Android app.
// Output (android/app/src/main/assets):
//   globe.bin      triangulated land on the unit sphere + border segments with their two neighbouring pieces
//   pieces.json    piece index -> {id, owner}
//   entities.json  countries/territories (+ sr: area in steradians, b: bounds)
//   history.json   political units per year
//   flags/x_<code>.png, flags/h_<key>.png
import fs from "fs";
import { execFileSync } from "child_process";
import earcut from "earcut";
import { feature } from "topojson-client";
import { geoArea, geoBounds, geoInterpolate, geoDistance } from "d3-geo";
import polylabel from "polylabel";
import { ROWS, MODERN_FROM } from "./hist-modern.mjs";
import { buildSnapshots, buildEras } from "./hist-old.mjs";

const OUT = process.argv[2] || "/home/claude/paises-do-mundo/android/app/src/main/assets";
fs.mkdirSync(OUT + "/flags", { recursive: true });

const topo = JSON.parse(fs.readFileSync("data/android/geo-hi.json", "utf8"));
const ents = JSON.parse(fs.readFileSync("data/android/entities.json", "utf8"));
const byId = new Map(ents.map((e) => [e.id, e]));
const ownerOf = (id) => (id && id.includes("~") ? id.split("~")[0] : id);
const geoms = topo.objects.c.geometries;

// ---------- pieces ----------
const pieces = geoms.map((g) => ({ id: g.id || g.properties?.name, owner: byId.has(ownerOf(g.id)) ? ownerOf(g.id) : null }));
// virtual pieces for entities with no shape (drawn only as dots)
const withShape = new Set(pieces.map((p) => p.owner).filter(Boolean));
for (const e of ents) if (!withShape.has(e.id)) pieces.push({ id: e.id, owner: e.id, virtual: true });
if (pieces.length > 65000) throw new Error("too many pieces");

const toXYZ = ([lon, lat]) => {
  const l = (lon * Math.PI) / 180, p = (lat * Math.PI) / 180;
  return [Math.cos(p) * Math.sin(l), Math.sin(p), Math.cos(p) * Math.cos(l)];
};

// ---------- land triangles ----------
const pos = [], pidx = [], idx = [];
const MAXE = 3.0; // degrees: split triangles with longer edges so they follow the curve of the sphere
let vmap = new Map(); // shared vertices within one piece
function vert(v, pi) {
  const key = v[0].toFixed(5) + "," + v[1].toFixed(5);
  let k = vmap.get(key);
  if (k === undefined) { k = pos.length / 3; pos.push(...toXYZ(v)); pidx.push(pi); vmap.set(key, k); }
  return k;
}
function addTri(a, b, c, pi, depth = 0) {
  const d = (u, v) => Math.hypot(u[0] - v[0], u[1] - v[1]);
  const ab = d(a, b), bc = d(b, c), ca = d(c, a);
  const m = Math.max(ab, bc, ca);
  if (m > MAXE && depth < 14) {
    const mid = (u, v) => [(u[0] + v[0]) / 2, (u[1] + v[1]) / 2];
    if (m === ab) { const x = mid(a, b); addTri(a, x, c, pi, depth + 1); addTri(x, b, c, pi, depth + 1); }
    else if (m === bc) { const x = mid(b, c); addTri(a, b, x, pi, depth + 1); addTri(a, x, c, pi, depth + 1); }
    else { const x = mid(c, a); addTri(a, b, x, pi, depth + 1); addTri(x, b, c, pi, depth + 1); }
    return;
  }
  idx.push(vert(a, pi), vert(b, pi), vert(c, pi));
}
geoms.forEach((g, pi) => {
  vmap = new Map();
  const f = feature(topo, g);
  const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.type === "MultiPolygon" ? f.geometry.coordinates : [];
  for (const poly of polys) {
    const flat = [], holes = [];
    poly.forEach((ring, k) => {
      if (k) holes.push(flat.length / 2);
      // ring is closed: drop the repeated last point; unwrap longitudes across the 180° meridian
      const pts = [];
      let prev = null, shift = 0;
      for (let i = 0; i < ring.length - 1; i++) {
        let [x, y] = ring[i];
        if (prev !== null) { const d = x + shift - prev; if (d > 180) shift -= 360; else if (d < -180) shift += 360; }
        x += shift; pts.push([x, y]); prev = x;
      }
      // a ring that goes all the way around (Antarctica) is closed through the pole
      const span = pts[pts.length - 1][0] - pts[0][0];
      const closing = ring[0][0] + 0 - (ring[ring.length - 2][0]);
      if (Math.abs(pts[pts.length - 1][0] + (((ring[0][0] - ring[ring.length - 2][0]) + 540) % 360 - 180) - pts[0][0]) > 180) {
        const pole = pts.reduce((sum, p) => sum + p[1], 0) < 0 ? -90 : 90;
        const xe = pts[pts.length - 1][0] + (((ring[0][0] - ring[ring.length - 2][0]) + 540) % 360 - 180);
        pts.push([xe, pole], [pts[0][0], pole]);
      }
      for (const [x, y] of pts) flat.push(x, y);
    });
    const tri = earcut(flat, holes, 2);
    for (let i = 0; i < tri.length; i += 3) {
      const P = (j) => [flat[2 * tri[i + j]], flat[2 * tri[i + j] + 1]];
      addTri(P(0), P(1), P(2), pi);
    }
  }
});

// ---------- border segments (each arc knows the pieces on both sides) ----------
const arcUse = new Map();
geoms.forEach((g, pi) => {
  const walk = (a) => { if (Array.isArray(a)) a.forEach(walk); else { const k = a < 0 ? ~a : a; if (!arcUse.has(k)) arcUse.set(k, []); arcUse.get(k).push(pi); } };
  walk(g.arcs || []);
});
const seg = []; // ax ay az bx by bz pa pb
for (const [k, users] of arcUse) {
  if (users.length < 2) continue; // coastline
  const [pa, pb] = users;
  if (pa === pb) continue;
  const line = feature(topo, { type: "LineString", arcs: [k] }).geometry.coordinates;
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i], b = line[i + 1];
    const n = Math.max(1, Math.ceil((geoDistance(a, b) * 180) / Math.PI / 1.0));
    const it = geoInterpolate(a, b);
    let prev = a;
    for (let s = 1; s <= n; s++) {
      const cur = s === n ? b : it(s / n);
      seg.push(...toXYZ(prev), ...toXYZ(cur), pa, pb);
      prev = cur;
    }
  }
}

// ---------- write globe.bin ----------
const V = pos.length / 3, I = idx.length, S = seg.length / 8;
const size = 16 + V * 12 + V * 2 + (V % 2 ? 2 : 0) + I * 4 + S * (24 + 4);
const buf = Buffer.alloc(size);
let o = 0;
buf.write("GLB1", o); o += 4;
buf.writeUInt32LE(V, o); o += 4; buf.writeUInt32LE(I, o); o += 4; buf.writeUInt32LE(S, o); o += 4;
for (const v of pos) { buf.writeFloatLE(v, o); o += 4; }
for (const p of pidx) { buf.writeUInt16LE(p, o); o += 2; }
if (V % 2) o += 2;
for (const i of idx) { buf.writeUInt32LE(i, o); o += 4; }
for (let s = 0; s < S; s++) {
  for (let j = 0; j < 6; j++) { buf.writeFloatLE(seg[s * 8 + j], o); o += 4; }
  buf.writeUInt16LE(seg[s * 8 + 6], o); o += 2; buf.writeUInt16LE(seg[s * 8 + 7], o); o += 2;
}
if (o !== size) throw new Error("size mismatch " + o + " " + size);
fs.writeFileSync(OUT + "/globe.bin", buf);
console.log("globe.bin", (size / 1048576).toFixed(2), "MB; vertices", V, "triangles", I / 3, "border segments", S);

// ---------- label points: pole of inaccessibility of the largest polygon ----------
function unwrapRing(ring) {
  const out = []; let shift = 0, prev = null;
  for (const [x0, y] of ring) { let x = x0 + shift; if (prev !== null) { if (x - prev > 180) { shift -= 360; x -= 360; } else if (x - prev < -180) { shift += 360; x += 360; } } out.push([x, y]); prev = x; }
  return out;
}
const sphA = (poly) => { const a = geoArea({ type: "Polygon", coordinates: poly }); return a > 2 * Math.PI ? 4 * Math.PI - a : a; };
function labelPoint(features) {
  let best = null, bestA = -1;
  for (const f of features) {
    const ps = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.type === "MultiPolygon" ? f.geometry.coordinates : [];
    for (const p of ps) { const a = sphA(p); if (a > bestA) { bestA = a; best = p; } }
  }
  if (!best) return null;
  const pt = polylabel(best.map(unwrapRing), 0.02);
  return [+(((pt[0] + 540) % 360) - 180).toFixed(3), +pt[1].toFixed(3)];
}
const allFeats = feature(topo, topo.objects.c).features;
const featById = new Map(allFeats.map((f) => [f.id, f]));

// ---------- entities (+ area and bounds) ----------
const fc = feature(topo, topo.objects.c);
const featsOf = new Map();
fc.features.forEach((f) => { const o2 = ownerOf(f.id); if (byId.has(o2)) { if (!featsOf.has(o2)) featsOf.set(o2, []); featsOf.get(o2).push(f); } });
const outEnts = ents.map((e) => {
  const fs_ = featsOf.get(e.id);
  const col = fs_ ? { type: "FeatureCollection", features: fs_ } : null;
  const b = col ? geoBounds(col).flat().map((v) => +v.toFixed(3)) : null;
  const ll = fs_ ? labelPoint(fs_) || e.ll : e.ll;
  return { id: e.id, n: e.n, a: e.a.filter((s) => !/^[A-Z]{2}$/.test(s)), c2: e.c2, r: e.r, ll, area: e.area, dot: e.dot, sr: col ? +geoArea(col).toPrecision(5) : 0, b };
});
fs.writeFileSync(OUT + "/entities.json", JSON.stringify(outEnts));
fs.writeFileSync(OUT + "/pieces.json", JSON.stringify(pieces.map((p) => [p.id, p.owner])));
// ---------- history ----------
const pieceSet = new Set(pieces.map((p) => p.id));
for (let y = MODERN_FROM; y <= 2026; y++) {
  const seen = new Map();
  for (const u of ROWS) if (u[3] <= y && y <= u[4]) for (const m of u[5]) {
    if (seen.has(m)) throw new Error(`${y}: ${m} in ${seen.get(m)} and ${u[0]}`);
    seen.set(m, u[0]);
  }
}
const rows = ROWS.map((u) => {
  for (const m of u[5]) if (!pieceSet.has(m)) throw new Error("unknown member " + m + " in " + u[0]);
  let ll = u[6];
  if (!ll) {
    const fsx = u[5].map((m) => featById.get(m)).filter(Boolean);
    ll = labelPoint(fsx) || outEnts.find((e) => e.id === ownerOf(u[5][0])).ll;
  }
  return [u[0], u[1], u[2], u[3], u[4], u[5], ll];
});
const snaps = buildSnapshots(OUT);
const eras = buildEras(snaps);
const flagRefs = new Set([...rows.map((r) => r[2]), ...eras.flatMap((e) => e.u.map((u) => u[1]))]);
fs.writeFileSync(OUT + "/history.json", JSON.stringify({ from: 1800, to: 2026, modernFrom: MODERN_FROM, units: rows, snaps: snaps.map((s) => ({ y: s.sy, n: s.units.length })), eras }));

// ---------- flags as PNG ----------
const tmp = "/tmp/flag.svg";
const render = (svg, file) => { fs.writeFileSync(tmp, svg); execFileSync("rsvg-convert", ["-w", "72", "-h", "54", "-o", file, tmp]); };
const flags = JSON.parse(fs.readFileSync("data/flags.json", "utf8"));
for (const [k, svg] of Object.entries(flags)) render(svg, `${OUT}/flags/x_${k}.png`);
const hflags = JSON.parse(fs.readFileSync("data/flags-hist.json", "utf8"));
for (const [k, svg] of Object.entries(hflags)) render(svg, `${OUT}/flags/h_${k}.png`);
console.log("flags", Object.keys(flags).length + Object.keys(hflags).length);
const missingFlags = [...flagRefs].filter((r) => r !== "blank" && !(r.startsWith("x:") ? flags[r.slice(2)] : hflags[r.slice(2)]));
if (missingFlags.length) console.warn("MISSING FLAGS:", missingFlags.join(" "));
