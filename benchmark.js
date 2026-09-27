/* ============================================================================
   benchmark.js — Global Solar Atlas (GSA) benchmark support.
   Values are only used when a benchmark is supplied/matched. The built-in
   Musiri reference comes from the GSA PDF supplied with this project.
   ============================================================================ */
window.SolarApp = window.SolarApp || {};

SolarApp.Benchmark = (function () {
  const REFERENCES = [
    {
      id: "musiri-2026-08-12",
      name: "Musiri reference site",
      lat: 10.961742,
      lon: 78.440714,
      pvoutSpecific: 1594.8,
      ghi: 2019.2,
      dni: 1417.3,
      dif: 954.4,
      gtiOpt: 2053.3,
      optimumTilt: 12,
      temperature: 28.2,
      elevationM: 98,
      source: "Global Solar Atlas / Solargis benchmark (user-supplied PDF, 12 Aug 2026)"
    }
  ];

  function haversineKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function findReference(lat, lon, maxDistanceKm = 2) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    let best = null;
    REFERENCES.forEach(ref => {
      const distanceKm = haversineKm(lat, lon, ref.lat, ref.lon);
      if (!best || distanceKm < best.distanceKm) best = { ...ref, distanceKm };
    });
    return best && best.distanceKm <= maxDistanceKm ? best : null;
  }

  function normalize(input) {
    if (!input) return null;
    const out = {
      source: String(input.source || "Global Solar Atlas / Solargis"),
      lat: Number(input.lat), lon: Number(input.lon),
      pvoutSpecific: Number(input.pvoutSpecific),
      ghi: Number(input.ghi), dni: Number(input.dni), dif: Number(input.dif),
      gtiOpt: Number(input.gtiOpt), optimumTilt: Number(input.optimumTilt),
      temperature: Number(input.temperature), elevationM: Number(input.elevationM),
    };
    return Number.isFinite(out.pvoutSpecific) && out.pvoutSpecific > 0 ? out : null;
  }

  function compare(msrSpecificYield, capacityKW, benchmark) {
    const b = normalize(benchmark);
    if (!b || !Number.isFinite(msrSpecificYield) || msrSpecificYield <= 0) return null;
    const msrAnnual = Number.isFinite(capacityKW) && capacityKW > 0 ? msrSpecificYield * capacityKW : null;
    const gsaAnnual = Number.isFinite(capacityKW) && capacityKW > 0 ? b.pvoutSpecific * capacityKW : null;
    const deltaPct = ((msrSpecificYield - b.pvoutSpecific) / b.pvoutSpecific) * 100;
    return {
      benchmarkSpecificYield: b.pvoutSpecific,
      msrSpecificYield,
      deltaPct,
      agreementPct: Math.max(0, 100 - Math.abs(deltaPct)),
      msrAnnual,
      gsaAnnual,
      annualDeltaKWh: msrAnnual != null && gsaAnnual != null ? msrAnnual - gsaAnnual : null
    };
  }

  return { findReference, normalize, compare, REFERENCES };
})();
