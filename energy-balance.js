/**
 * energy-balance.js — monthly and 24-hour solar/BESS simulation.
 * Priority: Solar -> Load -> Battery Charge -> Grid Export.
 * Deficit: Battery Discharge -> Grid Import (or unmet load during outage).
 */
window.SolarApp = window.SolarApp || {};

SolarApp.EnergyBalance = (function () {
  const HOURS = 24;

  function numberArray(values, fallback = 0) {
    if (!Array.isArray(values) || values.length !== HOURS) return Array(HOURS).fill(fallback);
    return values.map(v => Math.max(0, Number(v) || 0));
  }

  function simulate24Hour({
    loadProfile,
    solarProfile,
    batteryCapacityKWh = 0,
    batteryUsableKWh = batteryCapacityKWh,
    initialSocPct = 50,
    chargeEfficiencyPct = 97,
    dischargeEfficiencyPct = 97,
    gridAvailable = true,
  } = {}) {
    const load = numberArray(loadProfile);
    const solar = numberArray(solarProfile);
    const usableCapacity = Math.max(0, Number(batteryUsableKWh) || 0);
    const chargeEff = Math.max(0.5, Math.min(1, (Number(chargeEfficiencyPct) || 97) / 100));
    const dischargeEff = Math.max(0.5, Math.min(1, (Number(dischargeEfficiencyPct) || 97) / 100));
    let stored = usableCapacity * Math.max(0, Math.min(100, Number(initialSocPct) || 0)) / 100;

    const rows = [];
    for (let h = 0; h < HOURS; h++) {
      const l = load[h], s = solar[h];
      const directSolar = Math.min(l, s);
      let remainingSolar = Math.max(0, s - directSolar);
      let remainingLoad = Math.max(0, l - directSolar);
      const batteryCharge = Math.min(remainingSolar, Math.max(0, (usableCapacity - stored) / chargeEff));
      stored += batteryCharge * chargeEff;
      remainingSolar -= batteryCharge;
      const gridExport = remainingSolar;

      const batteryDischarge = Math.min(remainingLoad, stored * dischargeEff);
      stored -= batteryDischarge / dischargeEff;
      remainingLoad -= batteryDischarge;
      const gridImport = gridAvailable ? remainingLoad : 0;
      const unmetLoad = gridAvailable ? 0 : remainingLoad;

      rows.push({
        hour: h,
        loadKWh: l,
        solarKWh: s,
        directSolarKWh: directSolar,
        batteryChargeKWh: batteryCharge,
        batteryDischargeKWh: batteryDischarge,
        gridExportKWh: gridExport,
        gridImportKWh: gridImport,
        unmetLoadKWh: unmetLoad,
        socKWh: stored,
        socPct: usableCapacity > 0 ? stored / usableCapacity * 100 : 0,
      });
    }

    const sum = key => rows.reduce((s, r) => s + (Number(r[key]) || 0), 0);
    const totalLoad = sum("loadKWh");
    const gridImport = sum("gridImportKWh");
    const unmetLoad = sum("unmetLoadKWh");
    const servedLoad = Math.max(0, totalLoad - unmetLoad);
    return {
      rows,
      totalLoadKWh: totalLoad,
      totalSolarKWh: sum("solarKWh"),
      directSolarKWh: sum("directSolarKWh"),
      batteryChargeKWh: sum("batteryChargeKWh"),
      batteryDischargeKWh: sum("batteryDischargeKWh"),
      gridExportKWh: sum("gridExportKWh"),
      gridImportKWh: gridImport,
      unmetLoadKWh: unmetLoad,
      servedLoadKWh: servedLoad,
      gridIndependencePct: totalLoad > 0 ? Math.max(0, (1 - gridImport / totalLoad) * 100) : 0,
      autonomyPct: totalLoad > 0 ? servedLoad / totalLoad * 100 : 0,
      finalSocKWh: rows[23]?.socKWh || 0,
      finalSocPct: rows[23]?.socPct || 0,
    };
  }

  function monthlyBalance(consumptionMonthly, generationRows) {
    const loads = Array.isArray(consumptionMonthly) ? consumptionMonthly : Array(12).fill(Number(consumptionMonthly) || 0);
    const rows = (generationRows || []).map((g, i) => {
      const load = Math.max(0, Number(loads[i] || 0));
      const solar = Math.max(0, Number(g.acMonthlyKWh || 0));
      const selfUse = Math.min(load, solar);
      const surplus = Math.max(0, solar - load);
      const deficit = Math.max(0, load - solar);
      return { month: g.month, load, solar, selfUse, surplus, deficit, solarCoveragePct: load > 0 ? selfUse / load * 100 : 0 };
    });
    const totalLoad = rows.reduce((s, r) => s + r.load, 0);
    const totalSolar = rows.reduce((s, r) => s + r.solar, 0);
    const totalSelfUse = rows.reduce((s, r) => s + r.selfUse, 0);
    const totalSurplus = rows.reduce((s, r) => s + r.surplus, 0);
    const totalDeficit = rows.reduce((s, r) => s + r.deficit, 0);
    return {
      rows, totalLoad, totalSolar, totalSelfUse, totalSurplus, totalDeficit,
      solarCoveragePct: totalLoad > 0 ? totalSelfUse / totalLoad * 100 : 0,
      solarUtilizationPct: totalSolar > 0 ? totalSelfUse / totalSolar * 100 : 0,
    };
  }

  function economics(balance, investment, subsidy, importValuePerUnit, exportValuePerUnit, degradationPct = 0.5) {
    const importRate = Math.max(0, Number(importValuePerUnit) || 0);
    const exportRate = Math.max(0, Number(exportValuePerUnit) || 0);
    const annualOffset = balance.totalSelfUse * importRate;
    const annualExportCredit = balance.totalSurplus * exportRate;
    const firstYearSavings = annualOffset + annualExportCredit;
    const netInvestment = Math.max(0, (Number(investment) || 0) - (Number(subsidy) || 0));
    let cumulative = 0, paybackYears = null;
    for (let y = 1; y <= 25; y++) {
      const yearFactor = Math.pow(1 - Math.max(0, degradationPct) / 100, y - 1);
      const yearSavings = firstYearSavings * yearFactor;
      cumulative += yearSavings;
      if (paybackYears === null && cumulative >= netInvestment) {
        const prev = cumulative - yearSavings;
        const fraction = yearSavings > 0 ? Math.max(0, (netInvestment - prev) / yearSavings) : 0;
        paybackYears = (y - 1) + fraction;
      }
    }
    return { importRate, exportRate, annualOffset, annualExportCredit, firstYearSavings, netInvestment, paybackYears };
  }

  return { simulate24Hour, monthlyBalance, economics };
})();
