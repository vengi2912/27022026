/**
 * sizing.js — solar + BESS engineering sizing utilities.
 * Browser-compatible ES6 source (global namespace for the existing app).
 * The exported functions are pure and can also be copied into an ES module.
 *
 * @typedef {Object} BatterySpec
 * @property {string} [id]
 * @property {string} [manufacturer]
 * @property {string} model
 * @property {string} [chemistry]
 * @property {number} capacityKWh
 * @property {number} [dodPct]
 * @property {number} [roundtripEffPct]
 * @property {number} [voltage]
 * @property {number} [price]
 * @property {number} [warrantyYears]
 */
window.SolarApp = window.SolarApp || {};

SolarApp.Sizing = (function () {
  const DEFAULT_LFP_DOD = 90;
  const DEFAULT_LFP_RTE = 95;
  const DEFAULT_PACK_KWH = 5.12;

  function finitePositive(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function roundToStep(value, step) {
    return Math.round(value / step) * step;
  }

  function consumptionStats(consumption = {}) {
    let monthly;
    if (Array.isArray(consumption.monthly) && consumption.monthly.length === 12) {
      monthly = consumption.monthly.map(v => Math.max(0, Number(v) || 0));
    } else {
      const avg = Math.max(0, Number(consumption.monthlyUnits) || 0);
      monthly = Array(12).fill(avg);
    }
    const annual = monthly.reduce((s, v) => s + v, 0);
    return {
      monthly,
      annual,
      avgMonthly: annual / 12,
      peakMonthly: Math.max(...monthly),
      minMonthly: Math.min(...monthly),
      avgDailyKWh: annual / 365,
    };
  }

  function recommendCapacity(roofMaxKW, consumption, specificYieldEstimate) {
    const stats = consumptionStats(consumption);
    const syield = finitePositive(specificYieldEstimate, 1450);
    const consumptionBasedKW = stats.annual > 0 ? stats.annual / syield : 3;
    const roofLimit = finitePositive(roofMaxKW, 3);
    const capped = Math.min(roofLimit, consumptionBasedKW);
    const recommendedKW = Math.max(0, roundToStep(capped, 0.5));
    return {
      roofMaxKW: roofLimit,
      consumptionBasedKW,
      recommendedKW,
      limitedBy: roofLimit < consumptionBasedKW ? "roof" : "consumption",
      consumptionStats: stats,
    };
  }

  /**
   * BESS nominal capacity formula requested by the user:
   * Nominal kWh = (Daily Load × Backup Ratio) / (DoD × Efficiency)
   *
   * For a critical-load backup, Daily Load × Backup Ratio is represented by
   * criticalLoadKW × backupHours. This avoids assuming the entire household
   * load is backed up.
   */
  function sizeBattery(criticalLoadKW, backupHours, battery = {}, systemLossPct = 0) {
    const loadKW = finitePositive(criticalLoadKW);
    const hours = finitePositive(backupHours);
    const dodPct = clamp(finitePositive(battery.dodPct, DEFAULT_LFP_DOD), 50, 95);
    const rtePct = clamp(finitePositive(battery.roundtripEffPct, DEFAULT_LFP_RTE), 70, 99);
    const extraLossPct = clamp(Number(systemLossPct) || 0, 0, 25);
    const packKWh = finitePositive(battery.capacityKWh, DEFAULT_PACK_KWH);

    const backupEnergyKWh = loadKW * hours;
    const usableEnergyRequiredKWh = backupEnergyKWh;
    const effectiveEfficiency = (dodPct / 100) * (rtePct / 100) * (1 - extraLossPct / 100);
    const nominalCapacityRequiredKWh = effectiveEfficiency > 0
      ? usableEnergyRequiredKWh / effectiveEfficiency
      : Infinity;
    const packCount = Math.max(1, Math.ceil(nominalCapacityRequiredKWh / packKWh));
    const totalNominalKWh = packCount * packKWh;
    const totalUsableKWh = totalNominalKWh * (dodPct / 100);
    const deliveredBackupKWh = totalUsableKWh * (rtePct / 100) * (1 - extraLossPct / 100);
    const estimatedBackupHours = loadKW > 0 ? deliveredBackupKWh / loadKW : 0;

    return {
      criticalLoadKW: loadKW,
      backupHours: hours,
      backupEnergyKWh,
      backupRatio: hours / 24,
      usableEnergyRequiredKWh,
      dodPct,
      roundtripEffPct: rtePct,
      systemLossPct: extraLossPct,
      effectiveEfficiency,
      nominalCapacityRequiredKWh,
      nameplateNeededKWh: nominalCapacityRequiredKWh,
      unitsNeeded: packCount,
      packCount,
      packCapacityKWh: packKWh,
      totalNameplateKWh: totalNominalKWh,
      totalNominalKWh,
      totalUsableKWh,
      deliveredBackupKWh,
      estimatedBackupHours,
      battery,
    };
  }

  function deriveCriticalLoad(avgDailyKWh, loadType = "essential") {
    const daily = Math.max(0, Number(avgDailyKWh) || 0);
    const factor = String(loadType).toLowerCase().includes("heavy") ? 0.70 : 0.45;
    const avgLoad = daily / 24;
    return {
      loadFactor: factor,
      criticalLoadKW: Math.max(0.5, avgLoad * factor * 2.2),
      estimatedDailyCriticalKWh: daily * factor,
      loadType: String(loadType).toLowerCase().includes("heavy") ? "Heavy Appliance Backup" : "Essential Household Load",
    };
  }

  function sizeOffGrid(dailyEnergyKWh, autonomyDays, battery, systemLossPct, peakSunHoursAvg) {
    const daily = finitePositive(dailyEnergyKWh);
    const days = Math.max(0.5, finitePositive(autonomyDays, 0.5));
    const avgLoadKW = daily / 24;
    const batterySizing = sizeBattery(avgLoadKW, days * 24, battery, systemLossPct);
    const rte = (battery?.roundtripEffPct || DEFAULT_LFP_RTE) / 100;
    const psH = finitePositive(peakSunHoursAvg);
    const requiredSolarKW = psH > 0 ? daily / (psH * rte) : NaN;
    return { batterySizing, requiredSolarKW };
  }

  return {
    consumptionStats,
    recommendCapacity,
    sizeBattery,
    deriveCriticalLoad,
    sizeOffGrid,
    roundToStep,
  };
})();
