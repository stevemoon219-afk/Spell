/* recognizer.js — $1 Unistroke Recognizer (Wobbrock, Wilson & Li, UIST 2007).
 *
 * Compact, dependency-free gesture matching. Given a drawn path (array of
 * {x,y} points) it finds the closest stored spell template and a 0–1 score.
 * Scale-, position- and (within ±45°) rotation-tolerant, so a spell drawn a
 * bit bigger/smaller/tilted than its sample still matches.
 *
 * Multi-stroke glyphs (e.g. a star) are supported by concatenating the
 * strokes into one point list before matching — good enough for casting.
 */
(function (global) {
  "use strict";

  const NUM_POINTS = 64;
  const SQUARE = 250;
  const ORIGIN = { x: 0, y: 0 };
  const DIAGONAL = Math.sqrt(SQUARE * SQUARE + SQUARE * SQUARE);
  const HALF_DIAGONAL = 0.5 * DIAGONAL;
  const ANGLE_RANGE = deg2rad(45);
  const ANGLE_PRECISION = deg2rad(2);
  const PHI = 0.5 * (-1 + Math.sqrt(5));

  function deg2rad(d) { return (d * Math.PI) / 180; }
  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

  function pathLength(pts) {
    let d = 0;
    for (let i = 1; i < pts.length; i++) d += dist(pts[i - 1], pts[i]);
    return d;
  }

  function centroid(pts) {
    let x = 0, y = 0;
    for (const p of pts) { x += p.x; y += p.y; }
    return { x: x / pts.length, y: y / pts.length };
  }

  function resample(points, n) {
    const pts = points.slice();
    const I = pathLength(pts) / (n - 1);
    let D = 0;
    const out = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const d = dist(pts[i - 1], pts[i]);
      if (D + d >= I) {
        const t = (I - D) / d;
        const q = {
          x: pts[i - 1].x + t * (pts[i].x - pts[i - 1].x),
          y: pts[i - 1].y + t * (pts[i].y - pts[i - 1].y)
        };
        out.push(q);
        pts.splice(i, 0, q);
        D = 0;
      } else {
        D += d;
      }
    }
    while (out.length < n) out.push(pts[pts.length - 1]);
    return out;
  }

  function indicativeAngle(pts) {
    const c = centroid(pts);
    return Math.atan2(c.y - pts[0].y, c.x - pts[0].x);
  }

  function rotateBy(pts, rad) {
    const c = centroid(pts);
    const cos = Math.cos(rad), sin = Math.sin(rad);
    return pts.map((p) => ({
      x: (p.x - c.x) * cos - (p.y - c.y) * sin + c.x,
      y: (p.x - c.x) * sin + (p.y - c.y) * cos + c.y
    }));
  }

  function boundingBox(pts) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of pts) {
      minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
    }
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }

  function scaleTo(pts, size) {
    const b = boundingBox(pts);
    return pts.map((p) => ({
      x: p.x * (size / (b.w || 1)),
      y: p.y * (size / (b.h || 1))
    }));
  }

  function translateTo(pts, pt) {
    const c = centroid(pts);
    return pts.map((p) => ({ x: p.x + pt.x - c.x, y: p.y + pt.y - c.y }));
  }

  // Normalize a raw path into a comparable unistroke template.
  function normalize(rawPoints) {
    let pts = rawPoints.slice();
    pts = resample(pts, NUM_POINTS);
    pts = rotateBy(pts, -indicativeAngle(pts));
    pts = scaleTo(pts, SQUARE);
    pts = translateTo(pts, ORIGIN);
    return pts;
  }

  function pathDistance(a, b) {
    let d = 0;
    for (let i = 0; i < a.length; i++) d += dist(a[i], b[i]);
    return d / a.length;
  }

  function distanceAtAngle(pts, template, rad) {
    return pathDistance(rotateBy(pts, rad), template);
  }

  function distanceAtBestAngle(pts, template) {
    let a = -ANGLE_RANGE, b = ANGLE_RANGE;
    let x1 = PHI * a + (1 - PHI) * b;
    let f1 = distanceAtAngle(pts, template, x1);
    let x2 = (1 - PHI) * a + PHI * b;
    let f2 = distanceAtAngle(pts, template, x2);
    while (Math.abs(b - a) > ANGLE_PRECISION) {
      if (f1 < f2) { b = x2; x2 = x1; f2 = f1; x1 = PHI * a + (1 - PHI) * b; f1 = distanceAtAngle(pts, template, x1); }
      else { a = x1; x1 = x2; f1 = f2; x2 = (1 - PHI) * a + PHI * b; f2 = distanceAtAngle(pts, template, x2); }
    }
    return Math.min(f1, f2);
  }

  /**
   * Recognize a drawn path against a list of spells.
   * @param {{x,y}[]} points  raw drawn points
   * @param {Array} spells    each must have .gesture (raw points) and .id/.name
   * @returns {{spell, score}|null}
   */
  function recognize(points, spells) {
    if (!points || points.length < 8) return null;
    const candidate = normalize(points);
    let best = null, bestDist = Infinity;
    for (const s of spells) {
      if (!s.gesture || s.gesture.length < 4) continue;
      const tpl = s._tpl || (s._tpl = normalize(s.gesture));
      const d = distanceAtBestAngle(candidate, tpl);
      if (d < bestDist) { bestDist = d; best = s; }
    }
    if (!best) return null;
    const score = Math.max(0, 1 - bestDist / HALF_DIAGONAL);
    return { spell: best, score };
  }

  // Invalidate a spell's cached template after its gesture is re-recorded.
  function clearTemplate(spell) { if (spell) delete spell._tpl; }

  global.Recognizer = { recognize, normalize, clearTemplate };
})(window);
