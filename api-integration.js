/**
 * api-integration.js — optional external solar-resource + tariff utilities.
 * PVGIS is used for location-based PV output when available; the existing
 * NASA/Open-Meteo/PVGIS climate chain remains the fallback for monthly data.
 */
window.SolarApp = window.SolarApp || {};
SolarApp.API = (function () {
  async function fetchPVGIS(lat, lon, peakPowerKW = 1, lossPct = 14, angle = 10, aspect = 0) {
    const q = new URLSearchParams({ lat, lon, peakpower: peakPowerKW, loss: lossPct, angle, aspect, outputformat: "json" });
    const url = `https://re.jrc.ec.europa.eu/api/v5_2/PVcalc?${q}`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`PVGIS HTTP ${res.status}`);
    const json = await res.json();
    const monthly = json?.outputs?.monthly?.fixed;
    const total = Number(json?.outputs?.totals?.fixed?.E_y);
    if (!Array.isArray(monthly) || !Number.isFinite(total)) throw new Error("PVGIS returned no usable PV output");
    return {
      source: "PVGIS JRC",
      annualKWhPerKWp: total / Math.max(0.001, peakPowerKW),
      annualKWh: total,
      monthly: monthly.map(r => ({ month: Number(r.month), energyKWh: Number(r.E_m) || 0, irradiationKWhM2: Number(r["H(i)_m"]) || 0 })),
      raw: json,
    };
  }

  function calculateBill(units, tariff = {}, periodMonths = 1) {
    const kWh = Math.max(0, Number(units) || 0);
    const months = Math.max(1, Number(periodMonths) || 1);
    const slabs = Array.isArray(tariff.slabsPerUnit) ? tariff.slabsPerUnit : [];
    let remaining = kWh, consumed = 0, energyCharge = 0;
    for (const slab of slabs) {
      const monthlyCap = Number(slab.uptoUnits);
      const rate = Math.max(0, Number(slab.rate) || 0);
      if (!Number.isFinite(monthlyCap)) {
        energyCharge += remaining * rate; remaining = 0; break;
      }
      const band = Math.max(0, monthlyCap * months - consumed);
      const take = Math.min(remaining, band);
      if (take > 0) { energyCharge += take * rate; consumed += take; remaining -= take; }
      if (remaining <= 0) break;
    }
    if (remaining > 0) energyCharge += remaining * (Number(tariff.flatRateFallback) || 0);
    const fixedPerMonth = Math.max(0, Number(tariff.fixedChargePerMonth) || 0);
    const fixedCharge = fixedPerMonth * months;
    const demandCharge = Math.max(0, Number(tariff.demandCharge) || 0);
    const subtotal = energyCharge + fixedCharge + demandCharge;
    return { units: kWh, periodMonths: months, energyCharge, fixedCharge, demandCharge, subtotal, total: subtotal };
  }

  function compareBills({ currentUnits, postSolarUnits, tariff, periodMonths = 1, exportCredit = 0 }) {
    const before = calculateBill(currentUnits, tariff, periodMonths);
    const after = calculateBill(postSolarUnits, tariff, periodMonths);
    const credit = Math.max(0, Number(exportCredit) || 0);
    const postSolarTotal = Math.max(0, after.total - credit);
    return { before, after: { ...after, exportCredit: credit, total: postSolarTotal }, savings: Math.max(0, before.total - postSolarTotal) };
  }

  return { fetchPVGIS, calculateBill, compareBills };
})();
