/* ==========================================================================
   map.js — all Leaflet interaction lives here: base layers (street/satellite),
   drawing/editing the footprint polygon, and drawing an approximate panel-
   layout grid on top of it once a system is sized.
   ========================================================================== */
window.SolarApp = window.SolarApp || {};

SolarApp.MapView = (function () {
  let map, drawnItems, drawControl, panelLayer, streetLayer, satelliteLayer;

  function init(containerId) {
    map = L.map(containerId, { zoomControl: true, attributionControl: true }).setView([10.85, 78.55], 12); // Musiri/Trichy area default

    streetLayer = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 21, attribution: "© OpenStreetMap" });
    satelliteLayer = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxZoom: 20, attribution: "© Esri World Imagery" });
    streetLayer.addTo(map);

    drawnItems = new L.FeatureGroup();
    map.addLayer(drawnItems);
    panelLayer = new L.FeatureGroup();
    map.addLayer(panelLayer);

    if (typeof L.Control.Draw !== "undefined") {
      drawControl = new L.Control.Draw({
        edit: { featureGroup: drawnItems },
        draw: {
          polygon: { shapeOptions: { color: "#E8A33D", weight: 2 } },
          polyline: false, circle: false, circlemarker: false, rectangle: false, marker: false,
        },
      });
      map.addControl(drawControl);

      map.on(L.Draw.Event.CREATED, (e) => {
        drawnItems.clearLayers();
        drawnItems.addLayer(e.layer);
        const latlngs = e.layer.getLatLngs()[0].map(ll => [ll.lng, ll.lat]);
        if (SolarApp.MapView.onFootprintDrawn) SolarApp.MapView.onFootprintDrawn([latlngs]);
      });
      map.on(L.Draw.Event.EDITED, (e) => {
        const polys = [];
        e.layers.eachLayer(layer => polys.push(layer.getLatLngs()[0].map(ll => [ll.lng, ll.lat])));
        if (SolarApp.MapView.onFootprintDrawn) SolarApp.MapView.onFootprintDrawn(polys);
      });
    }

    L.control.layers({ "Street": streetLayer, "Satellite": satelliteLayer }, {}, { position: "topright" }).addTo(map);

    return map;
  }

  function showFootprint(polygons) {
    drawnItems.clearLayers();
    polygons.forEach(pts => {
      const latlngs = pts.map(([lon, lat]) => [lat, lon]);
      L.polygon(latlngs, { color: "#E8A33D", weight: 2, fillColor: "#3FB8AF", fillOpacity: 0.25 }).addTo(drawnItems);
    });
    try {
      const bounds = drawnItems.getBounds();
      if (bounds.isValid()) map.fitBounds(bounds, { padding: [20, 20] });
    } catch (e) { console.warn("Map fitBounds failed:", e); }
  }

  // Approximate panel-layout grid drawn inside the oriented bounding box.
  // This is explicitly an approximation (see roof-layout.js) — not a precise
  // per-panel geo-referenced layout for irregular roofs.
  function showPanelLayout(footprintSummary, packing) {
    panelLayer.clearLayers();
    if (!packing || packing.rows === 0 || packing.cols === 0) return;

    const obb = footprintSummary.obb;
    const R = 6371000;
    // Use the EXACT same reference point geo.js used to build the OBB, so the
    // overlay lines up with the polygon/area calculation (not an approximation
    // derived from a different reference like the area-weighted centroid).
    const refLon = obb.refLon, refLat = obb.refLat;

    function localToLatLon(x, y) {
      const cos = Math.cos(obb.angle), sin = Math.sin(obb.angle);
      const worldX = x * cos - y * sin;
      const worldY = x * sin + y * cos;
      const lon = refLon + (worldX / (R * Math.cos(refLat * Math.PI / 180))) * 180 / Math.PI;
      const lat = refLat + (worldY / R) * 180 / Math.PI;
      return [lat, lon];
    }

    const startX = obb.minX + packing.insetM;
    const startY = obb.minY + packing.insetM;

    for (let r = 0; r < packing.rows; r++) {
      for (let c = 0; c < packing.cols; c++) {
        const x0 = startX + c * (packing.panelW + 0.02);
        const y0 = startY + r * (packing.panelH + 0.02);
        const corners = [
          localToLatLon(x0, y0),
          localToLatLon(x0 + packing.panelW, y0),
          localToLatLon(x0 + packing.panelW, y0 + packing.panelH),
          localToLatLon(x0, y0 + packing.panelH),
        ];
        L.polygon(corners, { color: "#40916C", weight: 0.6, fillColor: "#95D5B2", fillOpacity: 0.55 }).addTo(panelLayer);
      }
    }
  }

  function clearPanelLayout() { if (panelLayer) panelLayer.clearLayers(); }

  function getMap() { return map; }
  function centerOn(lat, lon, zoom=14) { if (map && Number.isFinite(Number(lat)) && Number.isFinite(Number(lon))) map.setView([Number(lat), Number(lon)], zoom); }

  return { init, showFootprint, showPanelLayout, clearPanelLayout, getMap, centerOn, onFootprintDrawn: null };
})();
