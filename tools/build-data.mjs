// Builds data/entities.json, data/geo-hi.json, data/geo-lo.json, data/flags.json
import fs from "fs";
import { createRequire } from "module";
import { feature, merge } from "topojson-client";
import { topology } from "topojson-server";
import { presimplify, simplify, quantile, filter, filterWeight } from "topojson-simplify";
import { geoArea, geoCentroid } from "d3-geo";
const require = createRequire(import.meta.url);
const wc = require("world-countries");

fs.mkdirSync("data", { recursive: true });

// ---------- Entities ----------
const REGION = (c) => {
  if (c.region === "Americas") return c.subregion === "South America" ? "sa" : "na";
  return { Europe: "eu", Asia: "as", Africa: "af", Oceania: "oc", Antarctic: "an" }[c.region];
};

// Brazilian Portuguese names (overrides) + extra aliases
const BR = {
  ALA: ["Ilhas Åland", "Aland", "Alândia"], ARM: ["Armênia"], AZE: ["Azerbaijão", "Azerbeijão"],
  BLR: ["Bielorrússia", "Belarus"], BWA: ["Botsuana", "Botswana"], CUW: ["Curaçao", "Curacao", "Curação"],
  CXR: ["Ilha Christmas", "Ilha do Natal"], CYM: ["Ilhas Cayman", "Ilhas Caimã", "Ilhas Caimão"],
  CZE: ["Tchéquia", "República Tcheca", "Chéquia", "Chequia"], EST: ["Estônia"], FRO: ["Ilhas Faroé", "Ilhas Feroe", "Faroe"],
  GRL: ["Groenlândia"], IRN: ["Irã", "Irão"], KEN: ["Quênia"], LVA: ["Letônia"], MCO: ["Mônaco"],
  MDG: ["Madagascar"], MKD: ["Macedônia do Norte", "Macedônia"], MUS: ["Maurício", "Ilhas Maurício", "Maurícia"],
  NCL: ["Nova Caledônia"], NLD: ["Países Baixos", "Holanda"], PER: ["Peru"], PNG: ["Papua-Nova Guiné", "Papua Nova Guiné"],
  POL: ["Polônia"], ROU: ["Romênia"], SVN: ["Eslovênia"], SWZ: ["Essuatíni", "Eswatini", "Suazilândia"],
  SXM: ["Sint Maarten", "São Martinho (Países Baixos)", "São Martinho holandês"],
  MAF: ["São Martinho", "Saint-Martin", "São Martinho (França)", "São Martinho francês"],
  SYC: ["Seychelles", "Seicheles"], TTO: ["Trinidad e Tobago", "Trindade e Tobago"], TWN: ["Taiwan", "Formosa"],
  VAT: ["Vaticano", "Cidade do Vaticano", "Santa Sé"], VCT: ["São Vicente e Granadinas"],
  VGB: ["Ilhas Virgens Britânicas"], VIR: ["Ilhas Virgens Americanas", "Ilhas Virgens dos Estados Unidos"],
  VNM: ["Vietnã", "Vietname"], YEM: ["Iêmen", "Iémen"], ZWE: ["Zimbábue", "Zimbabwe"],
  COG: ["República do Congo", "Congo", "Congo-Brazzaville"], COD: ["República Democrática do Congo", "RDC", "RD Congo", "Congo-Kinshasa"],
  USA: ["Estados Unidos", "EUA", "Estados Unidos da América", "USA"], ARE: ["Emirados Árabes Unidos", "Emirados Árabes", "EAU"],
  GBR: ["Reino Unido", "Grã-Bretanha"], MNP: ["Ilhas Marianas do Norte", "Marianas Setentrionais"], FSM: ["Micronésia"],
  CIV: ["Costa do Marfim"], MMR: ["Mianmar", "Myanmar", "Birmânia"], TLS: ["Timor-Leste", "Timor Leste"],
  SHN: ["Santa Helena", "Santa Helena, Ascensão e Tristão da Cunha"], KOR: ["Coreia do Sul"], PRK: ["Coreia do Norte"],
  UNK: ["Kosovo"], BEN: ["Benin", "Benim"], BHR: ["Bahrein", "Barein"], SGS: ["Ilhas Geórgia do Sul e Sandwich do Sul", "Geórgia do Sul"],
  CPV: ["Cabo Verde"], QAT: ["Catar", "Qatar"], KAZ: ["Cazaquistão"], TJK: ["Tadjiquistão", "Tajiquistão"],
  GNQ: ["Guiné Equatorial"], GNB: ["Guiné-Bissau"], DMA: ["Dominica"], BES: ["Países Baixos Caribenhos", "Caribe Neerlandês", "Bonaire"],
  BIH: ["Bósnia e Herzegovina", "Bósnia"], PSE: ["Palestina", "Estado da Palestina"], ESH: ["Saara Ocidental"],
  KNA: ["São Cristóvão e Névis", "São Cristóvão e Nevis"], STP: ["São Tomé e Príncipe"], LCA: ["Santa Lúcia"],
  SPM: ["Saint-Pierre e Miquelon", "São Pedro e Miquelão"], WLF: ["Wallis e Futuna"], IOT: ["Território Britânico do Oceano Índico"],
  ATF: ["Terras Austrais e Antárticas Francesas", "Terras Austrais Francesas"], UMI: ["Ilhas Menores Distantes dos Estados Unidos"],
  CCK: ["Ilhas Cocos", "Ilhas Cocos (Keeling)"], TCA: ["Ilhas Turks e Caicos", "Turks e Caicos"], FLK: ["Ilhas Malvinas", "Malvinas", "Ilhas Falkland"],
  CAF: ["República Centro-Africana"], DOM: ["República Dominicana"], IMN: ["Ilha de Man"], SJM: ["Svalbard e Jan Mayen", "Svalbard"],
};

const ents = wc.map((c) => {
  const br = BR[c.cca3];
  const name = br ? br[0] : c.translations.por.common;
  const aliases = new Set([...(br || []), c.translations.por.common, c.translations.por.official, c.name.common, c.name.official, ...(c.altSpellings || [])]);
  aliases.delete(name);
  return {
    id: c.cca3, n: name, a: [...aliases].filter((s) => s && s.length > 1),
    c2: c.cca2, f: c.flag, r: REGION(c), ll: [c.latlng[1], c.latlng[0]], area: c.area,
  };
});

const EXTRA = [
  { id: "BIR", n: "Bir Tawil", a: ["Bir Tauil"], c2: null, f: "🏳️", r: "af", ll: [33.75, 21.87], area: 2060 },
  { id: "SCB", n: "Recife de Scarborough", a: ["Recife de Masinloc", "Scarborough", "Masinloc", "Huangyan", "Ilha Huangyan", "Banco de Scarborough"], c2: null, f: "🏳️", r: "as", ll: [117.76, 15.15], area: 1 },
  { id: "AKR", n: "Acrotíri", a: ["Akrotiri", "Acrotíri e Deceleia", "Akrotiri e Dhekelia", "Base de Akrotiri"], c2: "GB", f: "🇬🇧", r: "eu", ll: [32.95, 34.6], area: 123 },
  { id: "CLP", n: "Ilha de Clipperton", a: ["Clipperton", "Ilha Clipperton"], c2: "FR", f: "🇫🇷", r: "na", ll: [-109.22, 10.3], area: 6 },
  { id: "BJN", n: "Bajo Nuevo", a: ["Ilha Baixo Novo", "Baixo Novo", "Banco Bajo Nuevo", "Bajo Nuevo Bank"], c2: null, f: "🏳️", r: "na", ll: [-78.65, 15.85], area: 1 },
];
ents.push(...EXTRA);
{
  const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const primary = new Map(ents.map((e) => [norm(e.n), e.id]));
  for (const e of ents) e.a = e.a.filter((a) => { const p = primary.get(norm(a)); return !p || p === e.id; });
}

// ---------- Geometry ----------
const t10 = JSON.parse(fs.readFileSync("node_modules/world-atlas/countries-10m.json", "utf8"));
const geoms = t10.objects.countries.geometries;
const byNum = new Map(wc.map((c) => [c.ccn3, c.cca3]));
const byName = (n) => geoms.filter((g) => g.properties.name === n);

const NAMED = { "Kosovo": "UNK", "Akrotiri": "AKR", "Clipperton I.": "CLP", "Bajo Nuevo Bank": "BJN", "Scarborough Reef": "SCB" };
const ANDROID = !!process.env.ANDROID;
const MERGE = { "Somaliland": "SOM", "N. Cyprus": "CYP", "Cyprus U.N. Buffer Zone": "CYP", "Baikonur": "KAZ" };
if (ANDROID) { delete MERGE["Somaliland"]; NAMED["Somaliland"] = "SOM~N"; }

// group geometries per entity id
const groups = new Map(); // id -> [geom]
const neutral = [];
for (const g of geoms) {
  let id = g.id && byNum.get(g.id);
  const nm = g.properties.name;
  if (!id && NAMED[nm]) id = NAMED[nm];
  if (!id && MERGE[nm]) id = MERGE[nm];
  if (!id && nm === "Indian Ocean Ter.") { id = "__IOT"; }
  if (!id) { neutral.push(g); continue; }
  if (!groups.has(id)) groups.set(id, []);
  groups.get(id).push(g);
}

const features = [];
const polysOf = (geom) => (geom.type === "Polygon" ? [geom.coordinates] : geom.type === "MultiPolygon" ? geom.coordinates : []);
const ringCentroid = (poly) => geoCentroid({ type: "Polygon", coordinates: poly });

// split rules: from parent, polygons whose centroid passes test go to child id
const SPLITS = {
  FRA: [["GUF", ([x, y]) => x < -50 && x > -55 && y > 1 && y < 6.5], ["GLP", ([x, y]) => x > -62 && x < -60.9 && y > 15.8 && y < 16.6],
        ["MTQ", ([x, y]) => x > -61.3 && x < -60.7 && y > 14.3 && y < 15], ["REU", ([x, y]) => x > 55 && x < 56 && y < -20.7 && y > -21.5],
        ["MYT", ([x, y]) => x > 44.9 && x < 45.4 && y < -12.5 && y > -13.1]],
  NOR: [["SJM", ([x, y]) => y > 74 || (x < -5 && y > 70)], ["BVT", ([x, y]) => y < -50]],
  NLD: [["BES", ([x, y]) => y < 20]],
  NZL: [["TKL", ([x, y]) => y > -10 && y < -8 && x < -170]],
  __IOT: [["CXR", ([x, y]) => x > 105], ["CCK", ([x, y]) => x < 100]],
  // Crimeia (polígono próprio no mapa): parte da Ucrânia em 1991–2013, disputada desde 2014 (História)
  RUS: [["RUS~CR", ([x, y]) => x > 32 && x < 36.7 && y > 44 && y < 46.3]],
};

for (const [id, gs] of groups) {
  const geom = gs.length === 1 ? feature(t10, gs[0]).geometry : merge(t10, gs);
  const split = SPLITS[id];
  if (!split) { features.push({ type: "Feature", id, properties: {}, geometry: geom }); continue; }
  const buckets = new Map();
  for (const poly of polysOf(geom)) {
    const c = ringCentroid(poly);
    const hit = split.find(([, test]) => test(c));
    const k = hit ? hit[0] : id;
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(poly);
  }
  for (const [k, polys] of buckets) {
    if (k.startsWith("__")) { console.warn("unassigned part of", id); continue; }
    features.push({ type: "Feature", id: k, properties: {}, geometry: { type: "MultiPolygon", coordinates: polys } });
  }
}
// ---------- historical splits (pieces of today's countries) ----------
{
  const polyclip = await import("polyclip-ts");
  const admin1 = JSON.parse(fs.readFileSync("dl/admin1.geojson", "utf8")).features;
  const coordsOf = (g) => (g.type === "Polygon" ? [g.coordinates] : g.coordinates);
  const unionOf = (list) => polyclip.union(...list.map((g) => coordsOf(g)));
  const box = (x0, y0, x1, y1) => [[[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]]];
  const rewind = (mp) => mp.map((poly) => {
    const a = geoArea({ type: "Polygon", coordinates: poly });
    return a > 2 * Math.PI ? poly.map((r) => r.slice().reverse()) : poly;
  });
  function restorePoints(mp, pools) {
    const CELL = 0.25, grid = new Map(), pts = [];
    const key = (i, j) => i * 100000 + j;
    for (const g of pools) for (const poly of g) for (const ring of poly) for (const p of ring) {
      const k = key(Math.floor(p[0] / CELL), Math.floor(p[1] / CELL));
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k).push(pts.length); pts.push(p);
    }
    const near = (x0, y0, x1, y1, f) => {
      for (let i = Math.floor(Math.min(x0, x1) / CELL) - 1; i <= Math.floor(Math.max(x0, x1) / CELL) + 1; i++)
        for (let j = Math.floor(Math.min(y0, y1) / CELL) - 1; j <= Math.floor(Math.max(y0, y1) / CELL) + 1; j++) {
          const l = grid.get(key(i, j)); if (l) for (const n of l) f(pts[n]);
        }
    };
    const TOL = 1e-5;
    const snap = (p) => {
      let best = p, bd = TOL;
      near(p[0], p[1], p[0], p[1], (q) => { const d = Math.hypot(q[0] - p[0], q[1] - p[1]); if (d < bd || (d === 0 && best === p)) { bd = d; best = q; } });
      return [best[0], best[1]];
    };
    return mp.map((poly) => poly.map((ring) => {
      const r = ring.map(snap), out = [];
      for (let i = 0; i < r.length - 1; i++) {
        const a = r[i], b = r[i + 1];
        out.push(a);
        const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy;
        if (L2 === 0) continue;
        const L = Math.sqrt(L2), seen = new Set(), add = [];
        near(a[0], a[1], b[0], b[1], (q) => {
          const t = ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / L2;
          if (t <= 1e-9 || t >= 1 - 1e-9) return;
          if (Math.abs((q[0] - a[0]) * dy - (q[1] - a[1]) * dx) / L > TOL) return;
          const k = q[0] + "," + q[1];
          if (seen.has(k)) return;
          seen.add(k); add.push([t, q]);
        });
        add.sort((u, v) => u[0] - v[0]);
        for (const [, q] of add) out.push([q[0], q[1]]);
      }
      out.push(out[0].slice());
      return out;
    }));
  }
  const GROWN = fs.existsSync("data/split_regions.json") ? JSON.parse(fs.readFileSync("data/split_regions.json", "utf8")) : {};
  function split(id, pieceId, region) {
    if (GROWN[pieceId]) region = GROWN[pieceId];
    const i = features.findIndex((f) => f.id === id);
    const base = coordsOf(features[i].geometry);
    const orig = new Set(base.map((poly) => poly[0][0].join(",")));
    // drop slivers left where the cutting region and the border almost coincide (keep real small islands)
    const clean = (mp) => rewind(mp).filter((poly) => orig.has(poly[0][0].join(",")) || geoArea({ type: "Polygon", coordinates: poly }) > 3e-7);
    let piece = clean(polyclip.intersection(base, region));
    let rest = clean(polyclip.difference(base, region));
    // polyclip drops points that lie on a straight line and may nudge others; neighbours keep them,
    // so shared borders would stop being shared arcs (no border drawn). Put every point back.
    const pool = [base, piece, rest];
    piece = restorePoints(piece, pool); rest = restorePoints(rest, pool);
    features[i] = { type: "Feature", id, properties: {}, geometry: { type: "MultiPolygon", coordinates: rest } };
    features.push({ type: "Feature", id: pieceId, properties: {}, geometry: { type: "MultiPolygon", coordinates: piece } });
    console.log("split", id, "->", pieceId, "parts", rest.length, piece.length);
  }
  const a1 = (codes) => admin1.filter((f) => codes.includes(f.properties.iso_3166_2)).map((f) => f.geometry);
  // East Germany (GDR): today's eastern states incl. Berlin; boxes absorb outer-coast/border slivers
  const gdr = polyclip.union(unionOf(a1(["DE-MV", "DE-BB", "DE-BE", "DE-SN", "DE-ST", "DE-TH"])), box(12.6, 50.15, 16, 55.5), box(11.7, 53.1, 16, 55.5));
  split("DEU", "DEU~E", gdr);
  // South Yemen (PDRY): approximated with today's southern governorates
  const pdry = polyclip.union(unionOf(a1(["YE-AD", "YE-LA", "YE-AB", "YE-SH", "YE-HD", "YE-MR", "YE-DA"])), box(48, 10, 56, 20), box(43.9, 11, 46, 13.0), box(45.0, 11, 48, 13.6));
  split("YEM", "YEM~S", pdry);
  // Panama Canal Zone (US, until 1979): ~8 km either side of the canal
  const line = [[-79.95, 9.42], [-79.92, 9.27], [-79.82, 9.18], [-79.70, 9.12], [-79.61, 9.02], [-79.57, 8.95], [-79.52, 8.86]];
  const w = 0.075, left = [], right = [];
  line.forEach((p, k) => {
    const a = line[Math.max(0, k - 1)], b = line[Math.min(line.length - 1, k + 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
    left.push([p[0] - (dy / L) * w, p[1] + (dx / L) * w]);
    right.push([p[0] + (dy / L) * w, p[1] - (dx / L) * w]);
  });
  const ring = [...left, ...right.reverse()]; ring.push(ring[0]);
  split("PAN", "PAN~CZ", [[ring]]);
  if (ANDROID) {
    const reg = (codes, ...boxes) => polyclip.union(unionOf(a1(codes)), ...boxes);
    split("VNM", "VNM~S", box(100, 5, 112, 17.0));
    split("IDN", "IDN~P", unionOf(a1(["ID-PA", "ID-PB"])));
    split("MYS", "MYS~B", reg(["MY-12", "MY-13", "MY-15"], box(109, 0.5, 120, 8)));
    split("TZA", "TZA~Z", unionOf(a1(["TZ-06", "TZ-07", "TZ-10", "TZ-11", "TZ-15"])));
    split("PSE", "PSE~G", box(34.0, 31.0, 34.62, 31.7));
    split("IND", "IND~SK", unionOf(a1(["IN-SK"])));
    split("IND", "IND~GA", unionOf(a1(["IN-GA"])));
    split("CAN", "CAN~NL", unionOf(a1(["CA-NL"])));
    split("JPN", "JPN~O", unionOf(a1(["JP-47"])));
    const sinai = [[[32.31, 31.7], [32.31, 31.25], [32.33, 30.6], [32.42, 30.3], [32.55, 29.97], [32.7, 29.6], [33.2, 28.8], [33.6, 28.1], [34.2, 27.6], [34.5, 27.3], [36, 27.3], [36, 31.7], [32.31, 31.7]]];
    split("EGY", "EGY~S", [sinai]);
  }
}

neutral.forEach((g, i) => features.push({ type: "Feature", id: "_" + i, properties: { name: g.properties.name }, geometry: feature(t10, g).geometry }));

const entIds = new Set(ents.map((e) => e.id));
const withGeom = new Set(features.map((f) => f.id));
console.log("entities", ents.length, "with geometry", ents.filter((e) => withGeom.has(e.id)).length);
console.log("no geometry:", ents.filter((e) => !withGeom.has(e.id)).map((e) => e.id).join(" "));
console.log("features not entities:", features.filter((f) => !entIds.has(f.id)).map((f) => f.properties.name || f.id).join(", "));

// dot flag: small or missing geometry
for (const e of ents) {
  const f = features.find((x) => x.id === e.id);
  const km2 = f ? geoArea(f) * 6371 * 6371 : 0;
  e.dot = !f || km2 < 2500 ? 1 : 0;
  if (f && e.id.length === 3 && ["GUF", "GLP", "MTQ", "REU", "MYT", "SJM", "BES", "CXR", "CCK", "BVT", "TKL"].includes(e.id)) {
    // use the geometry's own centroid for split territories
    e.ll = geoCentroid(f).map((v) => +v.toFixed(2));
  }
  e.ll = e.ll.map((v) => +(+v).toFixed(2));
}
// better label points for some big/odd shapes
const LL = { USA: [-98.5, 39.5], CAN: [-105, 58], RUS: [96, 62], FRA: [2.4, 46.6], NOR: [9, 61.5], NLD: [5.6, 52.2], AUS: [134, -25], CHL: [-71, -34], NZL: [172.5, -42], KIR: [-157.4, 1.9], FJI: [178.1, -17.8], UMI: [-160, 5], DNK: [9.3, 56] };
for (const e of ents) if (LL[e.id]) e.ll = LL[e.id];

fs.writeFileSync(ANDROID ? "data/android/entities.json" : "data/entities.json", JSON.stringify(ents));

// ---------- Topologies ----------
const fc = { type: "FeatureCollection", features };
if (process.env.DUMP) fs.writeFileSync(process.env.DUMP, JSON.stringify(fc));
function build(minWeightQ, keepQ, quant) {
  let t = topology({ c: fc }, 1e6);
  t = presimplify(t);
  const minW = quantile(t, minWeightQ);
  t = filter(t, filterWeight(t, minW));
  t = simplify(t, quantile(t, keepQ));
  // quantize on output
  const out = JSON.parse(JSON.stringify(t));
  return out;
}
import { quantize } from "topojson-client";
function emit(file, q1, q2, qz, keepSmall) {
  let t = topology({ c: fc });
  t = presimplify(t);
  if (keepSmall) {
    // keep every point of small countries and islands (< 30 000 km² of land)
    for (const g of t.objects.c.geometries) {
      const e = ents.find((x) => x.id === (g.id && g.id.includes("~") ? g.id.split("~")[0] : g.id));
      if (!e || !(e.area < 30000)) continue;
      const walk = (a) => { if (Array.isArray(a)) a.forEach(walk); else { const k = a < 0 ? ~a : a; for (const p of t.arcs[k]) p[2] = Infinity; } };
      walk(g.arcs || []);
    }
  }
  if (q1 > 0) t = filter(t, filterWeight(t, q1));
  t = simplify(t, quantile(t, q2));
  t = quantize(t, qz);
  // drop presimplify weights (third coordinate) to shrink
  t.arcs = t.arcs.map((a) => a.map((p) => [p[0], p[1]]));
  const s = JSON.stringify(t);
  fs.writeFileSync(file, s);
  console.log(file, Math.round(s.length / 1024), "KB");
}
if (ANDROID) {
  fs.mkdirSync("data/android", { recursive: true });
  emit("data/android/geo-hi.json", 0.0, 0.16, 1e6, true);
} else {
  emit("data/geo-hi.json", 0.0, 0.12, 1e5);
  emit("data/geo-lo.json", 0.02, 0.03, 1e4);
}

// ---------- Flags ----------
const flags = {};
for (const e of ents) {
  if (!e.c2) continue;
  const code = e.c2.toLowerCase();
  if (flags[code]) continue;
  flags[code] = fs.readFileSync(`node_modules/flag-icons/flags/4x3/${code}.svg`, "utf8");
}
if (!ANDROID) fs.writeFileSync("data/flags-raw.json", JSON.stringify(flags));
console.log("flags", Object.keys(flags).length);
