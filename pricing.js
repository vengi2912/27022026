/* ==========================================================================
   pricing.js — turns a sized system (capacity + panels + optional battery)
   into a full bill-of-materials cost, then into savings/payback. Every price
   comes from Config (Settings) — nothing is hard-coded here.
   ========================================================================== */
window.SolarApp = window.SolarApp || {};

SolarApp.Pricing = (function () {

  function panelsCost(panelCount, panel) {
    return panelCount * panel.pricePerPanel;
  }

  function bomCost(capacityKW, bomCfg) {
    const capacityW = capacityKW * 1000;
    const items = [
      { item: "Mounting Structure", qty: `${capacityW.toFixed(0)} Wp`, unitPrice: bomCfg.mountingStructurePerWp, total: capacityW * bomCfg.mountingStructurePerWp },
      { item: "DC Cable", qty: `${capacityKW.toFixed(2)} kW`, unitPrice: bomCfg.dcCablePerKW, total: capacityKW * bomCfg.dcCablePerKW },
      { item: "AC Cable", qty: `${capacityKW.toFixed(2)} kW`, unitPrice: bomCfg.acCablePerKW, total: capacityKW * bomCfg.acCablePerKW },
      { item: "DCDB", qty: 1, unitPrice: bomCfg.dcdbFlat, total: bomCfg.dcdbFlat },
      { item: "ACDB", qty: 1, unitPrice: bomCfg.acdbFlat, total: bomCfg.acdbFlat },
      { item: "Earthing", qty: 1, unitPrice: bomCfg.earthingFlat, total: bomCfg.earthingFlat },
      { item: "Lightning Arrester", qty: 1, unitPrice: bomCfg.lightningArresterFlat, total: bomCfg.lightningArresterFlat },
      { item: "MC4 Connectors", qty: `${capacityKW.toFixed(2)} kW`, unitPrice: bomCfg.mc4ConnectorsPerKW, total: capacityKW * bomCfg.mc4ConnectorsPerKW },
      { item: "Civil Work", qty: `${capacityKW.toFixed(2)} kW`, unitPrice: bomCfg.civilWorkPerKW, total: capacityKW * bomCfg.civilWorkPerKW },
      { item: "Other Charges", qty: `${capacityKW.toFixed(2)} kW`, unitPrice: bomCfg.otherChargesPerKW, total: capacityKW * bomCfg.otherChargesPerKW },
    ];
    const total = items.reduce((s, r) => s + r.total, 0);
    return { items, total };
  }

  function installationCost(equipmentCost, installCfg) {
    const base = installCfg.method === "fixed"
      ? installCfg.fixedAmount
      : equipmentCost * (installCfg.percentageOfEquipment / 100);
    return { method: installCfg.method, amount: base, transportation: installCfg.transportationFlat };
  }

  function amcCost(capacityKW, isBatterySystem, amcCfg) {
    const perYearPerKW = isBatterySystem ? amcCfg.hybridOffGridPerYearPerKW : amcCfg.onGridPerYearPerKW;
    const perYear = perYearPerKW * capacityKW;
    return { perYear, fiveYear: perYear * 5, tenYear: perYear * 10 };
  }

  // GST on solar EPC is commonly split — a lower rate on the panel/module share
  // of project cost, a higher rate on the rest (structure, inverter, labour, BOS).
  // Returns { amount, effectivePct, breakdown } so the quotation can show its work.
  function computeGST(preTaxTotal, gstCfg) {
    if (!gstCfg || gstCfg.mode !== "split") {
      const pct = (gstCfg && gstCfg.flatPct) || 0;
      return { amount: preTaxTotal * (pct / 100), effectivePct: pct, breakdown: null };
    }
    const lowShare = preTaxTotal * (gstCfg.splitLowSharePct / 100);
    const highShare = preTaxTotal - lowShare;
    const lowTax = lowShare * (gstCfg.splitLowRatePct / 100);
    const highTax = highShare * (gstCfg.splitHighRatePct / 100);
    const amount = lowTax + highTax;
    return {
      amount,
      effectivePct: preTaxTotal > 0 ? (amount / preTaxTotal) * 100 : 0,
      breakdown: {
        lowSharePct: gstCfg.splitLowSharePct, lowRatePct: gstCfg.splitLowRatePct, lowShare, lowTax,
        highSharePct: 100 - gstCfg.splitLowSharePct, highRatePct: gstCfg.splitHighRatePct, highShare, highTax,
      },
    };
  }

  // Full quotation cost build for one system type.
  // opts: { capacityKW, panelCount, panel, inverter, battery(optional), batteryUnits(optional) }
  function buildSystemCost(opts, cfg) {
    const panelsTotal = panelsCost(opts.panelCount, opts.panel);
    const inverterTotal = opts.inverter.price;
    const batteryTotal = opts.battery ? opts.battery.price * (opts.batteryUnits || 1) : 0;
    const bom = bomCost(opts.capacityKW, cfg.bomPricing);

    const equipmentCost = panelsTotal + inverterTotal + batteryTotal + bom.total;
    const install = installationCost(equipmentCost, cfg.installation);
    const preTaxTotal = equipmentCost + install.amount + install.transportation;
    const gst = computeGST(preTaxTotal, cfg.gst);
    const finalPrice = preTaxTotal + gst.amount;

    const amc = amcCost(opts.capacityKW, !!opts.battery, cfg.amc);

    const lineItems = [
      { item: `Solar Panels (${opts.panel.manufacturer} ${opts.panel.model} x ${opts.panelCount})`, qty: opts.panelCount, unitPrice: opts.panel.pricePerPanel, total: panelsTotal },
      { item: `Inverter (${opts.inverter.manufacturer} ${opts.inverter.model})`, qty: 1, unitPrice: opts.inverter.price, total: inverterTotal },
      ...(opts.battery ? [{ item: `Battery (${opts.battery.manufacturer} ${opts.battery.model} x ${opts.batteryUnits || 1})`, qty: opts.batteryUnits || 1, unitPrice: opts.battery.price, total: batteryTotal }] : []),
      ...bom.items,
      { item: "Installation", qty: 1, unitPrice: install.amount, total: install.amount },
      { item: "Transportation", qty: 1, unitPrice: install.transportation, total: install.transportation },
    ];

    return {
      lineItems, equipmentCost, install, preTaxTotal,
      gstAmount: gst.amount, gstPct: gst.effectivePct, gstBreakdown: gst.breakdown,
      finalPrice, amc,
    };
  }

  // Savings/payback from generated solar units and a fixed valuation rate.
  // User requirement: annual generated units × ₹/unit = annual savings.
  // If subsidy is supplied and configured, payback uses the customer's net investment.
  function savingsAndPayback(annualGenerationKWh, annualConsumptionKWh, tariffCfg, systemFinalPrice, subsidyAmount = 0, paybackCfg = {}) {
    const rate = Number.isFinite(Number(paybackCfg.energyValuePerUnit))
      ? Number(paybackCfg.energyValuePerUnit)
      : (Number.isFinite(Number(tariffCfg?.paybackRatePerUnit)) ? Number(tariffCfg.paybackRatePerUnit) : 4.70);

    const generatedKWh = Math.max(0, Number(annualGenerationKWh) || 0);
    const annualSavings = generatedKWh * rate;
    const grossInvestment = Math.max(0, Number(systemFinalPrice) || 0);
    const subsidy = Math.max(0, Number(subsidyAmount) || 0);
    const useNet = paybackCfg.useNetInvestmentAfterSubsidy !== false;
    const netInvestment = Math.max(0, grossInvestment - (useNet ? subsidy : 0));
    const paybackYears = annualSavings > 0 ? netInvestment / annualSavings : null;

    return {
      generatedKWh,
      offsetKWh: generatedKWh,
      energyValuePerUnit: rate,
      annualSavings,
      currentAnnualCost: (Number(annualConsumptionKWh) || 0) * rate,
      grossInvestment,
      subsidyApplied: useNet ? subsidy : 0,
      netInvestment,
      paybackBasis: useNet ? "Net investment after subsidy" : "Gross system investment",
      paybackYears,
    };
  }


  // Energy-charge estimate using the configured domestic slab table.
  // This is an estimate only; fixed charges, rebates, taxes and utility settlement rules
  // are intentionally not fabricated here.
  function billFromUnits(monthlyUnits, tariffCfg) {
    const units = Math.max(0, Number(monthlyUnits) || 0);
    if (!units) return 0;
    const slabs = Array.isArray(tariffCfg?.slabsPerUnit) ? tariffCfg.slabsPerUnit : [];
    let remaining = units, consumed = 0, cost = 0;
    for (const slab of slabs) {
      const cap = Number(slab.uptoUnits);
      const rate = Math.max(0, Number(slab.rate) || 0);
      if (!Number.isFinite(cap)) {
        cost += remaining * rate; consumed += remaining; remaining = 0; break;
      }
      const band = Math.max(0, cap - consumed);
      const take = Math.min(remaining, band);
      if (take > 0) { cost += take * rate; consumed += take; remaining -= take; }
      if (remaining <= 0) break;
    }
    if (remaining > 0) cost += remaining * (Number(tariffCfg?.flatRateFallback) || 0);
    cost += Math.max(0, Number(tariffCfg?.fixedChargePerMonth) || 0);
    cost += Math.max(0, Number(tariffCfg?.demandCharge) || 0);
    return cost;
  }

  // Estimate an electricity energy charge for a bi-monthly period. The slab
  // thresholds are scaled by the billing period (e.g. a 100-unit monthly
  // threshold becomes 200 units for a 2-month bill). This is a reference
  // energy-charge model; actual TNEB bills can include fixed charges, rebates,
  // subsidies and other settlement rules, so entered bill amounts remain the
  // preferred baseline for ROI when available.
  function billFromBimonthUnits(bimonthUnits, tariffCfg) {
    const units = Math.max(0, Number(bimonthUnits) || 0);
    if (!units) return 0;
    const periodMonths = 2;
    const slabs = Array.isArray(tariffCfg?.slabsPerUnit) ? tariffCfg.slabsPerUnit : [];
    let remaining = units, consumed = 0, cost = 0;
    for (const slab of slabs) {
      const monthlyCap = Number(slab.uptoUnits);
      const rate = Math.max(0, Number(slab.rate) || 0);
      if (!Number.isFinite(monthlyCap)) {
        cost += remaining * rate; remaining = 0; break;
      }
      const band = Math.max(0, monthlyCap * periodMonths - consumed);
      const take = Math.min(remaining, band);
      if (take > 0) { cost += take * rate; consumed += take; remaining -= take; }
      if (remaining <= 0) break;
    }
    if (remaining > 0) cost += remaining * (Number(tariffCfg?.flatRateFallback) || 0);
    cost += Math.max(0, Number(tariffCfg?.fixedChargePerMonth) || 0) * periodMonths;
    cost += Math.max(0, Number(tariffCfg?.demandCharge) || 0);
    return cost;
  }

  function billComparison(monthlyRows, tariffCfg, exportRate=0) {
    const rows = (monthlyRows || []).map(r => {
      const currentUnits = Math.max(0, Number(r.load) || 0);
      const deficitUnits = Math.max(0, Number(r.deficit) || 0);
      const surplusUnits = Math.max(0, Number(r.surplus) || 0);
      const currentBill = billFromUnits(currentUnits, tariffCfg);
      const energyBillAfterSolar = billFromUnits(deficitUnits, tariffCfg);
      const exportCredit = surplusUnits * Math.max(0, Number(exportRate) || 0);
      const postSolarBill = Math.max(0, energyBillAfterSolar - exportCredit);
      return { ...r, currentBill, energyBillAfterSolar, exportCredit, postSolarBill, monthlySavings: Math.max(0, currentBill - postSolarBill) };
    });
    const sum=(k)=>rows.reduce((a,r)=>a+(Number(r[k])||0),0);
    return {
      rows,
      currentAnnualBill: sum('currentBill'),
      postSolarAnnualBill: sum('postSolarBill'),
      annualSavings: sum('monthlySavings'),
      averageCurrentMonthlyBill: rows.length ? sum('currentBill')/rows.length : 0,
      averagePostSolarMonthlyBill: rows.length ? sum('postSolarBill')/rows.length : 0,
    };
  }

  // Approximate blended rate from the slab table for a given annual consumption
  // (spread evenly across 12 months) — for a quick estimate, not a bill simulator.
  function effectiveAverageRate(tariffCfg, annualConsumptionKWh) {
    const monthlyUnits = annualConsumptionKWh / 12;
    let remaining = monthlyUnits, cost = 0, lastCap = 0;
    for (const slab of tariffCfg.slabsPerUnit) {
      const slabUnits = Math.min(remaining, slab.uptoUnits - lastCap);
      if (slabUnits <= 0) { lastCap = slab.uptoUnits; continue; }
      cost += slabUnits * slab.rate;
      remaining -= slabUnits;
      lastCap = slab.uptoUnits;
      if (remaining <= 0) break;
    }
    if (monthlyUnits <= 0) return tariffCfg.flatRateFallback;
    return cost / monthlyUnits;
  }

  return { panelsCost, bomCost, installationCost, amcCost, buildSystemCost, savingsAndPayback, effectiveAverageRate, billFromUnits, billFromBimonthUnits, billComparison };
})();
