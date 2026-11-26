// History 1800–1945 from the historical-basemaps snapshots + yearly events.
// Writes <OUT>/hist/s<year>.bin (border segments between the snapshot's units) and returns the eras.
import fs from "fs";
import { topology } from "topojson-server";
import { presimplify, simplify, quantile } from "topojson-simplify";
import { feature } from "topojson-client";
import { geoArea, geoInterpolate, geoDistance } from "d3-geo";
import polylabel from "polylabel";
import { translate, flagFor, ownerFor } from "./hist-names.mjs";
import { triangulate, polysOf } from "./tri.mjs";

export const SNAPS = [
  [1600, 1600, 1649], [1650, 1650, 1699], [1700, 1700, 1714], [1715, 1715, 1782], [1783, 1783, 1799],
  [1800, 1800, 1814], [1815, 1815, 1879], [1880, 1880, 1899], [1900, 1900, 1913], [1914, 1914, 1919],
  [1920, 1920, 1929], [1930, 1930, 1937], [1938, 1938, 1944], [1945, 1945, 1945],
];

const GERMAN_NORTH = ["Prussia", "Hanover", "Saxony", "Mecklenburg-Schwerin", "Mecklenburg-Strelitz", "Oldenburg", "Brunswick", "Thuringia", "Holstein", "Schleswig", "Nassau",
  "Electoral Hesse", "Anhalt", "Lippe-Detmold", "Waldeck", "Schaumburg-Lippe", "Hamburg", "Bremen", "Lübeck", "Cuxhaven", "Wetzlar", "Hohenzollern"];
const GERMAN_SOUTH = ["Bavaria", "Württemberg", "Baden", "Grand Duchy of Hesse", "Palatinate"];
const ITALY = ["Kingdom of Sardinia", "Tuscany", "Kingdom of the Two Sicilies", "Parma", "Modena", "Lucca", "Massa", "Pontremoli", "Fivizzano", "Lombardy"];

// Events: applied to every year >= y inside the snapshot's period. Situation on 31 December.
// r: rename {key: name}, f: flag {key: flag}, m: merge [newName, flag, [keys]] (keys may be earlier merges' first key)
const KONGO = { "Congo": "Reino do Congo" };
export const EVENTS = {
  1600: [
    { y: 1600, r: { ...KONGO, "Portugal": "Portugal (União Ibérica)" } },
    { y: 1640, r: { "Portugal": "Portugal" } },
  ],
  1650: [{ y: 1650, r: KONGO }],
  1700: [
    { y: 1700, r: KONGO },
    { y: 1707, m: ["Reino da Grã-Bretanha", "h:gb1707", ["England and Ireland", "Scotland"]] },
  ],
  1715: [
    { y: 1715, r: KONGO },
    { y: 1721, r: { "Tsardom of Muscovy": "Império Russo" } },
    { y: 1776, r: { "British American colonies": "Estados Unidos" }, f: { "British American colonies": "x:us" } },
  ],
  1783: [{ y: 1783, r: KONGO }],
  1800: [
    { y: 1800, r: { "Paraguay": "Intendência do Paraguai" } },
  ],
  1815: [
    { y: 1815, r: { "Canada": "América do Norte Britânica", "Viceroyalty of Brazil": "Reino do Brasil (unido a Portugal)", "Paraguay": "Paraguai" }, f: { "Canada": "x:gb", "Paraguay": "x:py" } },
    { y: 1816, r: { "United Provinces of the Río de la Plata": "Províncias Unidas do Rio da Prata" }, f: { "United Provinces of the Río de la Plata": "x:ar" } },
    { y: 1819, r: { "Viceroyalty of New Granada": "Grã-Colômbia" }, f: { "Viceroyalty of New Granada": "x:co" } },
    { y: 1821, r: { "Viceroyalty of New Spain": "Império Mexicano", "Viceroyalty of Peru": "Peru" }, f: { "Viceroyalty of New Spain": "x:mx", "Viceroyalty of Peru": "x:pe" } },
    { y: 1822, r: { "Viceroyalty of Brazil": "Império do Brasil" }, f: { "Viceroyalty of Brazil": "h:br_emp" } },
    { y: 1824, r: { "Viceroyalty of New Spain": "México" } },
    { y: 1831, r: { "Viceroyalty of New Granada": "Nova Granada, Venezuela e Equador" }, f: { "Viceroyalty of New Granada": "blank" } },
    { y: 1846, m: ["Império Austríaco", "h:at_hab", ["Austrian Empire", "Republic of Kraków"]] },
    { y: 1861, m: ["Reino da Itália", "h:it_sav", ITALY] },
    { y: 1866, m: ["Reino da Itália", "h:it_sav", ["Kingdom of Sardinia", "Venetia"]] },
    { y: 1867, r: { "Austrian Empire": "Áustria-Hungria", "Canada": "Canadá" }, f: { "Canada": "h:ca_red" } },
    { y: 1867, m: ["Confederação da Alemanha do Norte", "h:de_emp", GERMAN_NORTH] },
    { y: 1870, m: ["Reino da Itália", "h:it_sav", ["Kingdom of Sardinia", "Papal States"]] },
    { y: 1871, m: ["Império Alemão", "h:de_emp", ["Prussia", ...GERMAN_SOUTH]] },
    { y: 1818, m: ["Cia. Britânica das Índias Orientais", "x:gb", ["British East India Company", "Maratha Confederacy"]] },
    { y: 1826, m: ["Cia. Britânica das Índias Orientais", "x:gb", ["British East India Company", "Assam"]] },
    { y: 1856, m: ["Cia. Britânica das Índias Orientais", "x:gb", ["British East India Company", "Oudh"]] },
    { y: 1858, r: { "British East India Company": "Índia Britânica" } },
  ],
  1880: [
    { y: 1880, r: { "Kingdom of Brazil": "Império do Brasil" } },
    { y: 1889, r: { "Kingdom of Brazil": "Brasil" } },
    { y: 1894, r: { "Kingdom of Hawaii": "República do Havaí" } },
    { y: 1898, r: { "Kingdom of Hawaii": "Havaí (EUA)" }, f: { "Kingdom of Hawaii": "x:us" } },
    { y: 1899, r: { "Philippines": "Filipinas (EUA)" } },
  ],
  1900: [
    { y: 1900, r: { "Philippines": "Filipinas (EUA)", "Kingdom of Hawaii": "Havaí (EUA)" }, f: { "Philippines": "x:us", "Kingdom of Hawaii": "x:us", "Kingdom of Brazil": "x:br" } },
    { y: 1902, r: { "Transvaal": "Colônia do Transvaal", "Orange Free State": "Colônia do Rio Orange" }, f: { "Transvaal": "x:gb", "Orange Free State": "x:gb" } },
    { y: 1905, r: { "Sweden–Norway": "Suécia e Noruega" } },
    { y: 1908, r: { "Bosnia-Herzegovina": "Bósnia e Herzegovina (Áustria-Hungria)" }, f: { "Bosnia-Herzegovina": "h:at_hab" } },
    { y: 1910, r: { "Korea": "Coreia (Japão)" }, f: { "Korea": "x:jp" } },
    { y: 1910, m: ["União Sul-Africana", "h:za_old", ["Cape Colony", "Natal", "Transvaal", "Orange Free State"]] },
    { y: 1912, r: { "Manchu Empire": "República da China", "Morocco": "Marrocos (protetorado francês)" }, f: { "Manchu Empire": "h:cn_5", "Morocco": "x:fr" } },
  ],
  1914: [
    { y: 1917, r: { "Grand Duchy of Finland": "Finlândia" }, f: { "Grand Duchy of Finland": "x:fi" } },
    { y: 1918, r: { "Russian Empire": "Rússia Soviética", "Austro-Hungarian Empire": "Áustria-Hungria (em dissolução)" }, f: { "Russian Empire": "h:su" } },
    { y: 1919, r: { "German Empire": "Alemanha (República de Weimar)" }, f: { "German Empire": "x:de" } },
  ],
  1920: [
    { y: 1920, f: { "Mandatory Palestine (GB)": "x:gb" } },
    { y: 1922, r: { "Egypt": "Reino do Egito" }, f: { "Egypt": "h:eg_k" } },
    { y: 1922, m: ["União Soviética", "h:su", ["USSR", "Ukraine", "Georgia", "Armenia", "Azerbaijan", "Far Eastern SSR", "White Russia", "South Russia"]] },
    { y: 1923, r: { "Ottoman Sultanate": "Turquia" } },
    { y: 1926, r: { "Hejaz": "Reino de Hejaz e Négede" }, f: { "Hejaz": "x:sa" } },
    { y: 1928, r: { "Chinese Warlords": "República da China" }, f: { "Chinese Warlords": "x:tw" } },
  ],
  1930: [
    { y: 1930, m: ["União Soviética", "h:su", ["White Russia", "Azerbaijan", "Armenia", "Georgia"]] },
    { y: 1932, r: { "Mesopotamia (GB)": "Reino do Iraque", "Manchuria": "Manchukuo (Japão)" }, f: { "Mesopotamia (GB)": "h:iq_k", "Manchuria": "h:manchukuo" } },
    { y: 1932, r: { "Hejaz": "Arábia Saudita" }, f: { "Hejaz": "x:sa" } },
    { y: 1930, r: { "Chinese Warlords": "República da China" }, f: { "Chinese Warlords": "x:tw" } },
    { y: 1935, r: { "Iran": "Irã" } },
    { y: 1936, r: { "Ethiopia": "Etiópia (ocupada pela Itália)" }, f: { "Ethiopia": "h:it_sav" } },
  ],
  1938: [
    { y: 1938, f: { "Cambodia": "x:fr", "Cochin China": "x:fr", "Israel": "x:gb" } },
    { y: 1938, m: ["Índia Britânica", "x:gb", ["British Raj", "India"]] },
    { y: 1938, m: ["União Soviética", "h:su", ["USSR", "Armenia"]] },
    { y: 1939, r: { "Albania": "Albânia (ocupada pela Itália)", "Czechoslovakia": "Boêmia-Morávia e Eslováquia (domínio alemão)", "Poland": "Polônia (ocupada)" }, f: { "Albania": "h:it_sav", "Czechoslovakia": "h:de_emp", "Poland": "blank" } },
    { y: 1940, r: { "France": "França (ocupada / Vichy)" } },
    { y: 1940, m: ["União Soviética", "h:su", ["USSR", "Estonia", "Latvia", "Lithuania"]] },
    { y: 1941, r: { "Ethiopia (Italy)": "Império da Etiópia" }, f: { "Ethiopia (Italy)": "h:eth_emp" } },
  ],
  1945: [
    { y: 1945, f: { "Israel": "x:gb" }, r: { "Burma": "Birmânia (britânica)" } },
    { y: 1945, f: { "Burma": "x:gb" } },
    { y: 1945, m: ["Índia Britânica", "x:gb", ["India", "Pakistan", "Bangladesh"]] },
    // revisão 1945 (situação em 31/dez/1945)
    { y: 1945, r: { "Egypt": "Reino do Egito", "Ethiopia": "Império da Etiópia", "Manchuria": "Manchúria (ocupação soviética)", "Somalia": "Somália (adm. britânica)",
      "Saar Protectorate": "Sarre (ocupação francesa)", "Rhodesia": "Rodésia do Sul", "Guyana": "Guiana Britânica", "Dutch Guinea": "Nova Guiné Holandesa",
      "Papua New Guinea": "Papua e Nova Guiné (Austrália)", "American Samoa": "Samoa Americana", "Samoa": "Samoa Ocidental (tutela da Nova Zelândia)",
      "Tonga": "Tonga (protetorado britânico)", "Wallis and Futuna Islands": "Wallis e Futuna", "Turks and Caicos Islands": "Ilhas Turks e Caicos",
      "United States Virgin Islands": "Ilhas Virgens Americanas", "Netherlands Antilles": "Curaçao e dependências", "Rapa Nui": "Rapa Nui (Chile)", "Bhutan": "Butão" },
      f: { "Egypt": "h:eg_k", "Ethiopia": "h:eth_emp", "Manchuria": "h:su", "Somalia": "x:gb", "Yugoslavia": "h:yu_sfr", "Japan (USA)": "x:jp", "Xinjiang": "x:tw",
      "Papua New Guinea": "x:au", "American Samoa": "h:us48", "Samoa": "x:nz", "Niue": "x:nz", "Tonga": "x:to", "Wallis and Futuna Islands": "x:fr",
      "Turks and Caicos Islands": "x:gb", "Dominica": "x:gb", "Saint Lucia": "x:gb", "Antigua and Barbuda": "x:gb", "Saint Vincent and the Grenadines": "x:gb",
      "Grenada": "x:gb", "Saint Kitts and Nevis": "x:gb", "Montserrat": "x:gb", "Anguilla": "x:gb", "Netherlands Antilles": "x:nl", "Saint Martin": "x:fr",
      "Saint Barthelemy": "x:fr", "Rapa Nui": "x:cl", "Bhutan": "blank", "Brunei": "h:bn06" } },
    { y: 1945, m: ["China", "x:tw", ["China", "Taiwan"]] }, // Taiwan entregue à República da China em 25/out/1945
    { y: 1945, m: ["Nigéria", "x:gb", ["Nigeria", "Benin"]] }, // o Reino do Benim foi anexado em 1897
  ],
};

const R2D = 180 / Math.PI;
const toXYZ = ([lon, lat]) => {
  const l = lon / R2D, p = lat / R2D;
  return [Math.cos(p) * Math.sin(l), Math.sin(p), Math.cos(p) * Math.cos(l)];
};
function unwrapRing(ring) {
  const out = []; let shift = 0, prev = null;
  for (const [x0, y] of ring) { let x = x0 + shift; if (prev !== null) { if (x - prev > 180) { shift -= 360; x -= 360; } else if (x - prev < -180) { shift += 360; x += 360; } } out.push([x, y]); prev = x; }
  return out;
}
const sphArea = (poly) => { let a = geoArea({ type: "Polygon", coordinates: poly }); return a > 2 * Math.PI ? 4 * Math.PI - a : a; };

export function buildSnapshots(OUT) {
  fs.mkdirSync(OUT + "/hist", { recursive: true });
  const out = [];
  for (const [sy, p0, p1] of SNAPS) {
    const g = JSON.parse(fs.readFileSync(`dl/hb/world_${sy}.geojson`, "utf8"));
    const keys = [], keyIndex = new Map(), subj = [], polys = [];
    g.features.forEach((f, i) => {
      const raw = f.properties.NAME;
      const key = raw && raw.trim() ? raw : (raw && sy === 1815 ? "__UKNL" : "_null_" + i);
      if (!keyIndex.has(key)) { keyIndex.set(key, keys.length); keys.push(key); subj.push(f.properties.SUBJECTO || ""); polys.push([]); }
      f.id = i; f.properties._u = keyIndex.get(key);
      const geom = f.geometry;
      const ps = !geom ? [] : geom.type === "Polygon" ? [geom.coordinates] : geom.type === "MultiPolygon" ? geom.coordinates : [];
      for (const p of ps) polys[f.properties._u].push(p);
    });
    // unit facts: area and a label point inside the largest polygon
    const units = keys.map((k, u) => {
      let sr = 0, best = null, bestA = -1;
      for (const p of polys[u]) { const a = sphArea(p); sr += a; if (a > bestA) { bestA = a; best = p; } }
      let ll = [0, 0];
      if (best) {
        const rings = best.map(unwrapRing);
        const pt = polylabel(rings, 0.05);
        ll = [((pt[0] + 540) % 360) - 180, pt[1]];
      }
      return { key: k, subj: subj[u], sr, ll };
    });
    // border segments between different units, from the map rebuilt on today's provinces (hist_overlay.py)
    const frag = JSON.parse(fs.readFileSync(`data/android/frag_${sy}.geojson`, "utf8"));
    if (frag.keys.length === keys.length + 1 && frag.keys[keys.length] === "_none") {
      keys.push("_none"); units.push({ key: "_none", subj: "", sr: 0, ll: [0, 0] });
    }
    if (frag.keys.length !== keys.length || frag.keys.some((k, i) => k !== keys[i])) throw new Error("unit order differs in " + sy);
    const landSr = new Array(keys.length).fill(0);
    for (const f of frag.features) { const a = geoArea(f); landSr[f.properties.u] += Math.min(a, 4 * Math.PI - a); }
    units.forEach((u, i) => { u.sr = landSr[i]; });
    let t = topology({ c: frag }, 1e6);
    t = presimplify(t);
    t = simplify(t, quantile(t, 0.2));
    const geoms = t.objects.c.geometries;
    const use = new Map();
    geoms.forEach((gm) => {
      const u = gm.properties.u;
      const walk = (a) => { if (Array.isArray(a)) a.forEach(walk); else { const k = a < 0 ? ~a : a; if (!use.has(k)) use.set(k, new Set()); use.get(k).add(u); } };
      walk(gm.arcs || []);
    });
    const seg = [];
    for (const [k, us] of use) {
      if (us.size !== 2) continue;
      const [ua, ub] = [...us];
      const line = feature(t, { type: "LineString", arcs: [k] }).geometry.coordinates;
      for (let i = 0; i < line.length - 1; i++) {
        const a = line[i], b = line[i + 1];
        const d = geoDistance(a, b);
        if (d > 0.5) continue; // skip broken long jumps
        const n = Math.max(1, Math.ceil((d * R2D) / 1.0));
        const it = geoInterpolate(a, b);
        let prev = a;
        for (let s = 1; s <= n; s++) { const cur = s === n ? b : it(s / n); seg.push(...toXYZ(prev), ...toXYZ(cur), ua, ub); prev = cur; }
      }
    }
    // fill shapes (fill_overlay.py) for highlighting a tapped unit and finding what was tapped.
    // Vertices are lon/lat in 1/100 degree (int16); triangles come in chunks of one unit with 16-bit indices.
    {
      const fill = JSON.parse(fs.readFileSync(`data/android/fill_${sy}.geojson`, "utf8"));
      const V = [], I = [], chunks = [];
      for (const f of fill.features) {
        let ch = null, vm = null;
        const open = () => { ch = { u: f.properties.u, vb: V.length / 2, ib: I.length, n: 0, nv: 0 }; chunks.push(ch); vm = new Map(); };
        open();
        const v = (p) => {
          const x = Math.round(p[0] * 100), y = Math.round(p[1] * 100), k = x * 100000 + y;
          let i = vm.get(k);
          if (i === undefined) { i = ch.nv++; V.push(x, y); vm.set(k, i); }
          return i;
        };
        triangulate(polysOf(f.geometry), (a, b, c) => {
          if (ch.nv > 65000) open();
          const t = [v(a), v(b), v(c)];
          if (t[0] === t[1] || t[1] === t[2] || t[0] === t[2]) return;
          I.push(...t); ch.n += 3;
        }, 8);
      }
      const nv = V.length / 2, ni = I.length, nc = chunks.length;
      for (const x of V) if (Math.abs(x) > 32767) throw new Error("fill coordinate out of range");
      const fb = Buffer.alloc(16 + nc * 16 + nv * 4 + ni * 2);
      fb.write("FIL2", 0); fb.writeUInt32LE(nv, 4); fb.writeUInt32LE(ni, 8); fb.writeUInt32LE(nc, 12);
      let q = 16;
      for (const c of chunks) { fb.writeUInt32LE(c.u, q); fb.writeUInt32LE(c.vb, q + 4); fb.writeUInt32LE(c.ib, q + 8); fb.writeUInt32LE(c.n, q + 12); q += 16; }
      for (const x of V) { fb.writeInt16LE(x, q); q += 2; }
      for (const x of I) { fb.writeUInt16LE(x, q); q += 2; }
      fs.writeFileSync(`${OUT}/hist/f${sy}.bin`, fb);
      console.log("  fill", sy, "vertices", nv, "triangles", ni / 3, "chunks", nc, (fb.length / 1048576).toFixed(2), "MB");
    }
    const S = seg.length / 8;
    const buf = Buffer.alloc(8 + S * 28);
    buf.write("SEG1", 0); buf.writeUInt32LE(S, 4);
    let o = 8;
    for (let s = 0; s < S; s++) {
      for (let j = 0; j < 6; j++) { buf.writeFloatLE(seg[s * 8 + j], o); o += 4; }
      buf.writeUInt16LE(seg[s * 8 + 6], o); o += 2; buf.writeUInt16LE(seg[s * 8 + 7], o); o += 2;
    }
    fs.writeFileSync(`${OUT}/hist/s${sy}.bin`, buf);
    out.push({ sy, p0, p1, units, S });
    console.log("snapshot", sy, "units", units.length, "segments", S);
  }
  return out;
}

/** For every year 1800–1945: units after events; consecutive identical years are grouped into eras. */
export function buildEras(snaps) {
  const eras = [];
  const missing = new Set();
  snaps.forEach((sn, si) => {
    const evs = (EVENTS[sn.sy] || []).slice().sort((a, b) => a.y - b.y);
    for (const e of evs) {
      for (const k of Object.keys(e.r || {}).concat(Object.keys(e.f || {}))) if (!sn.units.some((u) => u.key === k)) missing.add(sn.sy + ":" + k);
      if (e.m) for (const k of e.m[2]) if (!sn.units.some((u) => u.key === k)) missing.add(sn.sy + ":" + k);
    }
    let last = null;
    for (let y = sn.p0; y <= sn.p1; y++) {
      const idx = new Map(sn.units.map((u, i) => [u.key, i]));
      const unitOf = sn.units.map((_, i) => i);            // snapshot unit -> group root
      const name = sn.units.map((u) => (u.key.startsWith("_null_") || u.key === "_none" ? null : u.key === "__UKNL" ? "Reino Unido dos Países Baixos" : translate(u.key)));
      const flag = sn.units.map((u) => (u.key === "__UKNL" ? "x:nl" : flagFor(u.key, u.subj, y)));
      const root = (i) => { while (unitOf[i] !== i) i = unitOf[i]; return i; };
      for (const e of evs) {
        if (e.y > y) continue;
        for (const [k, v] of Object.entries(e.r || {})) if (idx.has(k)) name[root(idx.get(k))] = v;
        for (const [k, v] of Object.entries(e.f || {})) if (idx.has(k)) flag[root(idx.get(k))] = v;
        if (e.m) {
          const present = e.m[2].filter((k) => idx.has(k)).map((k) => root(idx.get(k)));
          if (!present.length) continue;
          const r0 = present[0];
          for (const r of present) unitOf[r] = r0;
          unitOf[r0] = r0;
          name[r0] = e.m[0]; flag[r0] = e.m[1];
        }
      }
      // collapse to era units
      const roots = [...new Set(sn.units.map((_, i) => root(i)))];
      const code = new Map(roots.map((r, k) => [r, k]));
      const units = roots.map((r) => {
        const members = sn.units.map((_, i) => i).filter((i) => root(i) === r);
        const big = members.reduce((a, b) => (sn.units[b].sr > sn.units[a].sr ? b : a));
        const sr = members.reduce((s, i) => s + sn.units[i].sr, 0);
        const ll = sn.units[big].ll.map((v) => +v.toFixed(2));
        return [name[r], flag[r], ll[0], ll[1], +sr.toPrecision(4), name[r] ? ownerFor(sn.units[r].key, name[r], flag[r], y) : null];
      });
      const map = sn.units.map((_, i) => code.get(root(i)));
      const sig = JSON.stringify([units, map]);
      if (last && last.sig === sig) { last.era.y1 = y; continue; }
      const era = { y0: y, y1: y, s: si, u: units, m: map };
      eras.push(era);
      last = { sig, era };
    }
  });
  if (missing.size) console.warn("event keys not found:", [...missing].join(", "));
  console.log("eras", eras.length);
  return eras;
}
