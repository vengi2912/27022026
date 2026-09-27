/* ==========================================================================
   climate.js — free, keyless solar-resource APIs with automatic fallback:
   NASA POWER -> Open-Meteo -> PVGIS. Carried over from the earlier estimator
   (this logic already fixed the NaN/CORS issues found in production).
   ========================================================================== */
window.SolarApp = window.SolarApp || {};

SolarApp.Climate = (function () {
  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  function monthlyIsValid(monthly) {
    return Array.isArray(monthly) && monthly.length === 12 &&
      monthly.every(m => Number.isFinite(m.ghi) && Number.isFinite(m.temp) && m.ghi > 0);
  }

  async function fetchFromNASAPower(lat, lon) {
    const url = `https://power.larc.nasa.gov/api/temporal/climatology/point?parameters=ALLSKY_SFC_SW_DWN,T2M&community=RE&longitude=${lon}&latitude=${lat}&format=JSON`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("NASA POWER HTTP " + res.status);
    const json = await res.json();
    const params = json && json.properties && json.properties.parameter;
    if (!params || !params.ALLSKY_SFC_SW_DWN || !params.T2M) throw new Error("NASA POWER returned an unexpected response shape");
    const ghi = params.ALLSKY_SFC_SW_DWN, temp = params.T2M;
    const monthly = MONTHS.map((m, i) => {
      const key = String(i + 1).padStart(2, "0");
      return { month: m, ghi: ghi[key], temp: temp[key] };
    });
    if (!monthlyIsValid(monthly)) throw new Error("NASA POWER data incomplete for this location");
    return { monthly, source: "NASA POWER (multi-year climatology)" };
  }

  async function fetchFromOpenMeteo(lat, lon) {
    const endYear = 2025, startYear = 2016;
    const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${startYear}-01-01&end_date=${endYear}-12-31&daily=shortwave_radiation_sum,temperature_2m_mean&timezone=auto`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("Open-Meteo HTTP " + res.status);
    const json = await res.json();
    const daily = json && json.daily;
    if (!daily || !daily.time || !daily.shortwave_radiation_sum) throw new Error("Open-Meteo returned an unexpected response shape");

    const sums = Array.from({ length: 12 }, () => ({ ghiTotal: 0, tempTotal: 0, count: 0 }));
    daily.time.forEach((dateStr, i) => {
      const monthIdx = parseInt(dateStr.slice(5, 7), 10) - 1;
      const radMJ = daily.shortwave_radiation_sum[i];
      const t = daily.temperature_2m_mean[i];
      if (Number.isFinite(radMJ) && Number.isFinite(t) && monthIdx >= 0 && monthIdx < 12) {
        sums[monthIdx].ghiTotal += radMJ / 3.6;
        sums[monthIdx].tempTotal += t;
        sums[monthIdx].count++;
      }
    });
    const monthly = MONTHS.map((m, i) => ({
      month: m,
      ghi: sums[i].count ? sums[i].ghiTotal / sums[i].count : NaN,
      temp: sums[i].count ? sums[i].tempTotal / sums[i].count : NaN,
    }));
    if (!monthlyIsValid(monthly)) throw new Error("Open-Meteo data incomplete for this location");
    return { monthly, source: `Open-Meteo (${startYear}–${endYear} daily archive average)` };
  }

  async function fetchFromPVGIS(lat, lon) {
    const url = `https://re.jrc.ec.europa.eu/api/v5_2/MRcalc?lat=${lat}&lon=${lon}&horirrad=1&outputformat=json`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("PVGIS HTTP " + res.status);
    const json = await res.json();
    const rows = json && json.outputs && json.outputs.monthly;
    if (!Array.isArray(rows) || rows.length === 0) throw new Error("PVGIS returned an unexpected response shape");
    const sums = Array.from({ length: 12 }, () => ({ total: 0, count: 0 }));
    rows.forEach(r => {
      const idx = (r.month | 0) - 1;
      const val = r["H(h)_m"];
      if (idx >= 0 && idx < 12 && Number.isFinite(val)) {
        sums[idx].total += val / 3.6;
        sums[idx].count++;
      }
    });
    const monthly = MONTHS.map((m, i) => ({
      month: m,
      ghi: sums[i].count ? sums[i].total / sums[i].count : NaN,
      temp: 25,
    }));
    if (!monthlyIsValid(monthly)) throw new Error("PVGIS data incomplete for this location");
    return { monthly, source: "PVGIS solar atlas (JRC, monthly avg, temp. defaulted to 25°C)" };
  }

  async function fetchClimatology(lat, lon) {
    const attempts = [
      ["NASA POWER", fetchFromNASAPower],
      ["Open-Meteo", fetchFromOpenMeteo],
      ["PVGIS", fetchFromPVGIS],
    ];
    const errors = [];
    for (const [name, fn] of attempts) {
      try { return await fn(lat, lon); }
      catch (err) { errors.push(`${name}: ${err.message}`); }
    }
    throw new Error("All climate data sources failed — " + errors.join(" | "));
  }

  return { fetchClimatology, MONTHS };
})();
