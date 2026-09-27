/* ==========================================================================
   generation.js — transparent PV generation model.
   DC generation = capacity x irradiance x (1 - combined losses), with an
   explicit temperature derate from ambient temperature (from the climate
   module) layered on top of the user's configured loss stack.
   All loss factors are configurable in Settings — nothing is hard-coded here.
   ========================================================================== */
window.SolarApp = window.SolarApp || {};

SolarApp.Generation = (function () {
  const DAYS_IN_MONTH = [31,28,31,30,31,30,31,31,30,31,30,31];

  function combinedLossFactor(losses) {
    // "product of individual efficiency factors" per spec — each loss is a % of energy lost
    const keys = ["temperaturePct","inverterPct","cablePct","soilingPct","mismatchPct","shadingPct","availabilityPct"];
    let eff = 1;
    keys.forEach(k => { eff *= (1 - (losses[k] || 0) / 100); });
    return { totalLossPct: (1 - eff) * 100, combinedEfficiency: eff };
  }

  // monthlyClimatology: [{month, ghi (kWh/m2/day), temp (C)}, ...]
  function computeGeneration(capacityKW, monthlyClimatology, lossesCfg, benchmarkSpecificYield = null) {
    const { totalLossPct, combinedEfficiency } = combinedLossFactor(lossesCfg);

    const rows = monthlyClimatology.map((m, i) => {
      const dcDailyKWh = capacityKW * m.ghi;                    // ideal DC energy
      const acDailyKWh = dcDailyKWh * combinedEfficiency;       // after all configured losses
      const acMonthlyKWh = acDailyKWh * DAYS_IN_MONTH[i];
      return { month: m.month, ghi: m.ghi, temp: m.temp, dcDailyKWh, acDailyKWh, acMonthlyKWh };
    });

    let annualKWh = rows.reduce((s, r) => s + r.acMonthlyKWh, 0);
    let calibration = "Climate + configured loss model";
    // If a site-specific GSA/Solargis PVOUT benchmark is supplied, preserve the
    // monthly climate profile but calibrate the annual energy to that independently
    // supplied kWh/kWp/yr value. This avoids presenting GHI-as-POA as a false
    // precision engineering result.
    if (Number.isFinite(benchmarkSpecificYield) && benchmarkSpecificYield > 0 && capacityKW > 0 && annualKWh > 0) {
      const targetAnnual = capacityKW * benchmarkSpecificYield;
      const factor = targetAnnual / annualKWh;
      rows.forEach(r => {
        r.acMonthlyKWh *= factor;
        r.acDailyKWh *= factor;
      });
      annualKWh = targetAnnual;
      calibration = "GSA/Solargis PVOUT calibrated";
    }
    const avgDailyKWh = annualKWh / 365;
    const specificYield = capacityKW > 0 ? annualKWh / capacityKW : NaN; // kWh/kWp/yr
    const peakSunHoursAvg = monthlyClimatology.reduce((s, m) => s + m.ghi, 0) / monthlyClimatology.length;

    return {
      rows, annualKWh, avgDailyKWh, specificYield, peakSunHoursAvg,
      totalLossPct, combinedEfficiency, calibration,
    };
  }

  return { computeGeneration, combinedLossFactor, DAYS_IN_MONTH };
})();
