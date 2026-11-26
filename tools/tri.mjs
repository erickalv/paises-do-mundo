// Triangulation of lon/lat polygons for drawing on the unit sphere.
import earcut from "earcut";
const MAXE = 3.0; // degrees: split triangles with longer edges so they follow the curve of the sphere
function addTri(a, b, c, emit, maxe, depth = 0) {
  const d = (u, v) => Math.hypot(u[0] - v[0], u[1] - v[1]);
  const ab = d(a, b), bc = d(b, c), ca = d(c, a);
  const m = Math.max(ab, bc, ca);
  if (m > maxe && depth < 14) {
    const mid = (u, v) => [(u[0] + v[0]) / 2, (u[1] + v[1]) / 2];
    if (m === ab) { const x = mid(a, b); addTri(a, x, c, emit, maxe, depth + 1); addTri(x, b, c, emit, maxe, depth + 1); }
    else if (m === bc) { const x = mid(b, c); addTri(a, b, x, emit, maxe, depth + 1); addTri(a, x, c, emit, maxe, depth + 1); }
    else { const x = mid(c, a); addTri(a, b, x, emit, maxe, depth + 1); addTri(x, b, c, emit, maxe, depth + 1); }
    return;
  }
  emit(a, b, c);
}
/** polys: array of polygons (rings of [lon, lat], closed). emit(a, b, c) gets each triangle. */
export function triangulate(polys, emit, maxe = MAXE) {
  for (const poly of polys) {
    const flat = [], holes = [];
    poly.forEach((ring, k) => {
      if (ring.length < 4) return;
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
      if (Math.abs(pts[pts.length - 1][0] + (((ring[0][0] - ring[ring.length - 2][0]) + 540) % 360 - 180) - pts[0][0]) > 180) {
        const pole = pts.reduce((sum, p) => sum + p[1], 0) < 0 ? -90 : 90;
        const xe = pts[pts.length - 1][0] + (((ring[0][0] - ring[ring.length - 2][0]) + 540) % 360 - 180);
        pts.push([xe, pole], [pts[0][0], pole]);
      }
      for (const [x, y] of pts) flat.push(x, y);
    });
    if (flat.length < 6) continue;
    const tri = earcut(flat, holes, 2);
    for (let i = 0; i < tri.length; i += 3) {
      const P = (j) => [flat[2 * tri[i + j]], flat[2 * tri[i + j] + 1]];
      addTri(P(0), P(1), P(2), emit, maxe);
    }
  }
}
export const polysOf = (geom) => (!geom ? [] : geom.type === "Polygon" ? [geom.coordinates] : geom.type === "MultiPolygon" ? geom.coordinates : []);
