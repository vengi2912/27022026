/* ==========================================================================
   geo.js — reads building footprints (KML, KMZ, GeoJSON), and does the pure
   geometry: projected area, perimeter, centroid, bounding-box orientation.
   No DOM/map code here — map.js consumes this module's output.
   ========================================================================== */
window.SolarApp = window.SolarApp || {};

SolarApp.Geo = (function () {

  // ---- File reading (KML / KMZ / GeoJSON) -> array of polygons [[lon,lat],...] ----

  async function readFootprintFile(file) {
    const name = file.name.toLowerCase();
    if (name.endsWith(".kmz")) {
      return await parseKMZ(file);
    }
    if (name.endsWith(".geojson") || name.endsWith(".json")) {
      const text = await file.text();
      return parseGeoJSON(text);
    }
    if (name.endsWith(".kml")) {
      const text = await file.text();
      return parseKML(text);
    }
    if (name.endsWith(".zip")) {
      throw new Error("Shapefile (.zip) isn't supported yet — please convert to GeoJSON or KML first (e.g. via mapshaper.org or QGIS) and upload that instead");
    }
    throw new Error("Unsupported file type — please upload .kml, .kmz, or .geojson");
  }

  async function parseKMZ(file) {
    if (typeof JSZip === "undefined") {
      throw new Error("KMZ support library failed to load — check your internet connection and reload the page");
    }
    const buffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(buffer);
    const kmlEntryName = Object.keys(zip.files).find(n => n.toLowerCase().endsWith(".kml"));
    if (!kmlEntryName) throw new Error("This .kmz file doesn't contain a .kml document inside it");
    const text = await zip.files[kmlEntryName].async("string");
    return parseKML(text);
  }

  function parseKML(text) {
    const xml = new DOMParser().parseFromString(text, "text/xml");
    if (xml.getElementsByTagName("parsererror").length > 0) {
      throw new Error("This file isn't valid KML/XML (it may be corrupted)");
    }
    const coordEls = xml.getElementsByTagName("coordinates");
    const polygons = [];
    for (const el of coordEls) {
      const raw = el.textContent.trim();
      if (!raw) continue;
      const pts = raw.split(/\s+/).map(triplet => {
        const [lon, lat] = triplet.split(",").map(Number);
        return [lon, lat];
      }).filter(p => Number.isFinite(p[0]) && Number.isFinite(p[1]));
      if (pts.length >= 3) polygons.push(pts);
    }
    if (polygons.length === 0) {
      throw new Error("No polygon/shape found — in Google Earth, use the Polygon tool (not a Point/Placemark pin) to outline the roof");
    }
    return polygons;
  }

  function parseGeoJSON(text) {
    let gj;
    try { gj = JSON.parse(text); }
    catch (e) { throw new Error("This file isn't valid JSON/GeoJSON"); }

    const polygons = [];
    function extractGeom(geom) {
      if (!geom) return;
      if (geom.type === "Polygon") {
        // first ring only (outer boundary)
        if (geom.coordinates && geom.coordinates[0]) polygons.push(geom.coordinates[0].map(([lon, lat]) => [lon, lat]));
      } else if (geom.type === "MultiPolygon") {
        geom.coordinates.forEach(poly => { if (poly[0]) polygons.push(poly[0].map(([lon, lat]) => [lon, lat])); });
      }
    }
    if (gj.type === "FeatureCollection") {
      (gj.features || []).forEach(f => extractGeom(f.geometry));
    } else if (gj.type === "Feature") {
      extractGeom(gj.geometry);
    } else if (gj.type === "Polygon" || gj.type === "MultiPolygon") {
      extractGeom(gj);
    }
    if (polygons.length === 0) throw new Error("No Polygon/MultiPolygon geometry found in this GeoJSON");
    return polygons;
  }

  // ---- Pure geometry helpers (all input points are [lon, lat]) ----

  function toLocalXY(pts) {
    const lat0 = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    const R = 6371000;
    return pts.map(([lon, lat]) => [
      (lon - pts[0][0]) * Math.PI / 180 * R * Math.cos(lat0 * Math.PI / 180),
      (lat - lat0) * Math.PI / 180 * R,
    ]);
  }

  function polygonAreaM2(pts) {
    const xy = toLocalXY(pts);
    let area = 0;
    for (let i = 0; i < xy.length; i++) {
      const [x1, y1] = xy[i];
      const [x2, y2] = xy[(i + 1) % xy.length];
      area += x1 * y2 - x2 * y1;
    }
    return Math.abs(area / 2);
  }

  function polygonPerimeterM(pts) {
    const xy = toLocalXY(pts);
    let perim = 0;
    for (let i = 0; i < xy.length; i++) {
      const [x1, y1] = xy[i];
      const [x2, y2] = xy[(i + 1) % xy.length];
      perim += Math.hypot(x2 - x1, y2 - y1);
    }
    return perim;
  }

  function polygonCentroid(pts) {
    let sumLat = 0, sumLon = 0;
    pts.forEach(([lon, lat]) => { sumLat += lat; sumLon += lon; });
    return { lat: sumLat / pts.length, lon: sumLon / pts.length };
  }

  function footprintCentroid(polygons) {
    let wLat = 0, wLon = 0, wSum = 0;
    polygons.forEach(p => {
      const c = polygonCentroid(p);
      const a = polygonAreaM2(p) || 1;
      wLat += c.lat * a; wLon += c.lon * a; wSum += a;
    });
    return { lat: wLat / wSum, lon: wLon / wSum };
  }

  // Oriented bounding box in local metres, using the longest edge as the X axis —
  // used both for the simple rectangular panel-packing approximation and for
  // drawing an approximate panel-layout grid on the map.
  function orientedBoundingBox(pts) {
    const refLon = pts[0][0];
    const refLat = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    const xy = toLocalXY(pts);
    let bestAngle = 0, bestArea = Infinity, best = null;
    // try each edge's angle (rotating-calipers-lite — good enough for building footprints)
    for (let i = 0; i < xy.length; i++) {
      const [x1, y1] = xy[i];
      const [x2, y2] = xy[(i + 1) % xy.length];
      const angle = Math.atan2(y2 - y1, x2 - x1);
      const cos = Math.cos(-angle), sin = Math.sin(-angle);
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      xy.forEach(([x, y]) => {
        const rx = x * cos - y * sin;
        const ry = x * sin + y * cos;
        minX = Math.min(minX, rx); maxX = Math.max(maxX, rx);
        minY = Math.min(minY, ry); maxY = Math.max(maxY, ry);
      });
      const w = maxX - minX, h = maxY - minY;
      const area = w * h;
      if (area < bestArea) {
        bestArea = area; bestAngle = angle;
        best = { widthM: w, heightM: h, minX, minY, angle, refLon, refLat };
      }
    }
    return best;
  }

  function summarize(polygons) {
    const areaM2 = polygons.reduce((s, p) => s + polygonAreaM2(p), 0);
    const perimeterM = polygons.reduce((s, p) => s + polygonPerimeterM(p), 0);
    const centroid = footprintCentroid(polygons);
    const obb = orientedBoundingBox(polygons.reduce((a, p) => a.concat(p), [])); // combined for multi-polygon rough box
    return {
      polygons,
      areaM2, areaSqFt: areaM2 * 10.7639,
      perimeterM,
      centroid,
      obb,
    };
  }

  let geocodeCache = new Map();
  async function searchCity(query) {
    const q=String(query||"").trim();
    if(q.length<3) return [];
    const key=q.toLowerCase();
    if(geocodeCache.has(key)) return geocodeCache.get(key);
    const url="https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=5&countrycodes=in&accept-language=en&q="+encodeURIComponent(q);
    const res=await fetch(url,{headers:{"Accept":"application/json"}});
    if(!res.ok) throw new Error("OpenStreetMap Nominatim HTTP "+res.status);
    const data=await res.json();
    geocodeCache.set(key,data);
    return data;
  }

  return { searchCity, readFootprintFile, parseKML, parseKMZ, parseGeoJSON, polygonAreaM2, polygonPerimeterM, footprintCentroid, orientedBoundingBox, summarize };
})();
