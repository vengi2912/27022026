/* ==========================================================================
   quotation.js — orchestrates geo + climate + roof-layout + generation +
   sizing + pricing into three full quotations (on-grid / hybrid / off-grid)
   and a comparison table, plus validation warnings for unrealistic inputs.
   ========================================================================== */
window.SolarApp = window.SolarApp || {};

SolarApp.Quotation = (function () {

  function buildOnGrid(ctx) {
    const { roofCapacity, cfg, consumption } = ctx;
    const capacityKW = roofCapacity.customerMode ? roofCapacity.selectedCapacityKW : ctx.recommendedKW;
    const panelCount = roofCapacity.customerMode ? roofCapacity.selectedPanelCount : Math.ceil(capacityKW * 1000 / roofCapacity.panel.wattage);
    const inverter = pickInverter(cfg.inverters, "on-grid", capacityKW);
    const generation = SolarApp.Generation.computeGeneration(capacityKW, ctx.monthlyClimatology, cfg.losses);
    const cost = SolarApp.Pricing.buildSystemCost({ capacityKW, panelCount, panel: roofCapacity.panel, inverter }, cfg);
    const subsidy = cfg.subsidy.enabled ? SolarApp.Config.subsidyForCapacity(capacityKW) : 0;
    const savings = SolarApp.Pricing.savingsAndPayback(generation.annualKWh, consumption.annual, cfg.tariff, cost.finalPrice, subsidy, cfg.payback);
    return { type: "On-Grid", capacityKW, panelCount, inverter, cost, subsidy, savings, generation, battery: null, backupHours: 0 };
  }

  function buildHybrid(ctx) {
    const { roofCapacity, cfg, consumption, criticalLoadKW, backupHours } = ctx;
    const capacityKW = roofCapacity.customerMode ? roofCapacity.selectedCapacityKW : ctx.recommendedKW;
    const panelCount = roofCapacity.customerMode ? roofCapacity.selectedPanelCount : Math.ceil(capacityKW * 1000 / roofCapacity.panel.wattage);
    const inverter = pickInverter(cfg.inverters, "hybrid", capacityKW);
    const battery = cfg.batteries.find(b => b.id === cfg.defaultBatteryId) || cfg.batteries[0];
    const batterySizing = SolarApp.Sizing.sizeBattery(criticalLoadKW, backupHours, battery, cfg.battery.systemLossPct);
    const generation = SolarApp.Generation.computeGeneration(capacityKW, ctx.monthlyClimatology, cfg.losses);
    const cost = SolarApp.Pricing.buildSystemCost({
      capacityKW, panelCount, panel: roofCapacity.panel, inverter, battery, batteryUnits: batterySizing.unitsNeeded,
    }, cfg);
    const subsidy = cfg.subsidy.enabled ? SolarApp.Config.subsidyForCapacity(capacityKW) : 0;
    const savings = SolarApp.Pricing.savingsAndPayback(generation.annualKWh, consumption.annual, cfg.tariff, cost.finalPrice, subsidy, cfg.payback);
    return { type: "Hybrid", capacityKW, panelCount, inverter, cost, subsidy, savings, generation, battery, batterySizing, backupHours, loadType: ctx.loadType, bessSimulation: ctx.bessSimulation, gridIndependencePct: ctx.bessSimulation?.gridIndependencePct ?? null };
  }

  function buildOffGrid(ctx) {
    const { cfg, consumption, criticalLoadKW, backupHours } = ctx;
    const battery = cfg.batteries.find(b => b.id === cfg.defaultBatteryId) || cfg.batteries[0];
    const dailyEnergyKWh = consumption.avgMonthly / 30 || criticalLoadKW * 6;
    const autonomyDays = Math.max(0.5, backupHours / 24);
    // Off-grid still uses the requested backup window for the battery; solar capacity
    // is sized against the full daily energy requirement because there is no grid import.
    const roughPeakSun = ctx.monthlyClimatology.reduce((s, m) => s + m.ghi, 0) / ctx.monthlyClimatology.length;
    const offgrid = SolarApp.Sizing.sizeOffGrid(dailyEnergyKWh, autonomyDays, battery, cfg.battery.systemLossPct, roughPeakSun);
    let capacityKW = Math.max(0.5, roundHalf(offgrid.requiredSolarKW || criticalLoadKW * 1.3));
    const panel = ctx.roofCapacity.panel;
    let panelCount = Math.ceil(capacityKW * 1000 / panel.wattage);
    if (ctx.roofCapacity.customerMode) { capacityKW = ctx.roofCapacity.selectedCapacityKW; panelCount = ctx.roofCapacity.selectedPanelCount; }
    const inverter = pickInverter(cfg.inverters, "off-grid", capacityKW);
    const generation = SolarApp.Generation.computeGeneration(capacityKW, ctx.monthlyClimatology, cfg.losses);
    const cost = SolarApp.Pricing.buildSystemCost({
      capacityKW, panelCount, panel, inverter, battery, batteryUnits: offgrid.batterySizing.unitsNeeded,
    }, cfg);
    const subsidy = cfg.subsidy.enabled ? SolarApp.Config.subsidyForCapacity(capacityKW) : 0;
    // Off-grid payback is shown as a comparable avoided-energy estimate only.
    const savings = SolarApp.Pricing.savingsAndPayback(generation.annualKWh, consumption.annual, cfg.tariff, cost.finalPrice, subsidy, cfg.payback);
    return { type: "Off-Grid", capacityKW, panelCount, inverter, cost, subsidy, savings, generation, battery, batterySizing: offgrid.batterySizing, backupHours, loadType: ctx.loadType, bessSimulation: ctx.bessSimulation, autonomyPct: ctx.bessSimulation?.autonomyPct ?? null };
  }

  function roundHalf(v) { return Math.round(v * 2) / 2; }

  function pickInverter(inverters, type, capacityKW) {
    const candidates = inverters.filter(i => i.type === type);
    if (candidates.length === 0) return inverters[0];
    // smallest inverter whose capacity >= system capacity; else the largest available
    const sorted = [...candidates].sort((a, b) => a.capacityKW - b.capacityKW);
    return sorted.find(i => i.capacityKW >= capacityKW) || sorted[sorted.length - 1];
  }

  function buildComparison(onGrid, hybrid, offGrid) {
    return [
      { param: "Solar Capacity", onGrid: `${onGrid.capacityKW.toFixed(2)} kWp`, hybrid: `${hybrid.capacityKW.toFixed(2)} kWp`, offGrid: `${offGrid.capacityKW.toFixed(2)} kWp` },
      { param: "Battery", onGrid: "No", hybrid: `${hybrid.batterySizing.unitsNeeded} x ${hybrid.battery.model} (${hybrid.batterySizing.totalNameplateKWh.toFixed(1)} kWh)`, offGrid: `${offGrid.batterySizing.unitsNeeded} x ${offGrid.battery.model} (${offGrid.batterySizing.totalNameplateKWh.toFixed(1)} kWh)` },
      { param: "Backup", onGrid: "No", hybrid: `${hybrid.backupHours} hrs`, offGrid: `${offGrid.backupHours} hrs (full autonomy)` },
      { param: "Grid Independence / Autonomy", onGrid: "Grid-tied", hybrid: Number.isFinite(hybrid.gridIndependencePct) ? `${hybrid.gridIndependencePct.toFixed(1)}%` : "—", offGrid: Number.isFinite(offGrid.autonomyPct) ? `${offGrid.autonomyPct.toFixed(1)}% served load` : "—" },
      { param: "Annual Generation (est.)", onGrid: `${Math.round(onGrid.generation.annualKWh).toLocaleString("en-IN")} kWh`, hybrid: `${Math.round(hybrid.generation.annualKWh).toLocaleString("en-IN")} kWh`, offGrid: `${Math.round(offGrid.generation.annualKWh).toLocaleString("en-IN")} kWh` },
      { param: "System Cost (incl. GST)", onGrid: fmtINR(onGrid.cost.finalPrice), hybrid: fmtINR(hybrid.cost.finalPrice), offGrid: fmtINR(offGrid.cost.finalPrice) },
      { param: "AMC (per year)", onGrid: fmtINR(onGrid.cost.amc.perYear), hybrid: fmtINR(hybrid.cost.amc.perYear), offGrid: fmtINR(offGrid.cost.amc.perYear) },
      { param: "Payback Energy Value", onGrid: `₹${onGrid.savings.energyValuePerUnit.toFixed(2)}/unit`, hybrid: `₹${hybrid.savings.energyValuePerUnit.toFixed(2)}/unit`, offGrid: `₹${offGrid.savings.energyValuePerUnit.toFixed(2)}/unit` },
      { param: "Generated Units Used for Payback", onGrid: `${Math.round(onGrid.savings.generatedKWh).toLocaleString("en-IN")} kWh/yr`, hybrid: `${Math.round(hybrid.savings.generatedKWh).toLocaleString("en-IN")} kWh/yr`, offGrid: `${Math.round(offGrid.savings.generatedKWh).toLocaleString("en-IN")} kWh/yr` },
      { param: "Gross System Cost", onGrid: fmtINR(onGrid.savings.grossInvestment), hybrid: fmtINR(hybrid.savings.grossInvestment), offGrid: fmtINR(offGrid.savings.grossInvestment) },
      { param: "Subsidy Applied to Payback", onGrid: fmtINR(onGrid.savings.subsidyApplied), hybrid: fmtINR(hybrid.savings.subsidyApplied), offGrid: fmtINR(offGrid.savings.subsidyApplied) },
      { param: "Net Investment for Payback", onGrid: fmtINR(onGrid.savings.netInvestment), hybrid: fmtINR(hybrid.savings.netInvestment), offGrid: fmtINR(offGrid.savings.netInvestment) },
      { param: "Estimated Annual Savings", onGrid: fmtINR(onGrid.savings.annualSavings), hybrid: fmtINR(hybrid.savings.annualSavings), offGrid: fmtINR(offGrid.savings.annualSavings) },
      { param: "Payback Period", onGrid: fmtYears(onGrid.savings.paybackYears), hybrid: fmtYears(hybrid.savings.paybackYears), offGrid: fmtYears(offGrid.savings.paybackYears) },
    ];
  }

  function fmtINR(n) { return Number.isFinite(n) ? "₹" + Math.round(n).toLocaleString("en-IN") : "—"; }
  function fmtYears(n) { return Number.isFinite(n) ? n.toFixed(1) + " yrs" : "—"; }

  // ---- Validation warnings ----
  function validate(ctx) {
    const warnings = [];
    if (ctx.roofCapacity.footprintAreaM2 < 10) warnings.push("⚠ Roof area is very small (<10 m²) — double-check the uploaded footprint.");
    if (ctx.recommendedKW > ctx.roofCapacity.finalCapacityKW + 0.01) warnings.push("⚠ Recommended system exceeds the roof's physical panel capacity.");
    if (ctx.criticalLoadKW && ctx.backupHours && ctx.criticalLoadKW > ctx.recommendedKW * 2) warnings.push("⚠ Critical load seems large relative to the recommended solar capacity — inverter may be undersized.");
    if (ctx.generation && ctx.consumption && ctx.generation.annualKWh > ctx.consumption.annual * 1.6) warnings.push("⚠ Estimated generation exceeds consumption by an unusually large margin — confirm consumption figures and export/net-metering limits.");
    warnings.push("⚠ Preliminary estimate — physical site survey and structural verification required.");
    warnings.push("⚠ Actual generation may vary due to shading, weather, soiling, and system losses.");
    warnings.push("⚠ Utility (TANGEDCO) approval requirements may change — verify net-metering rules before committing.");
    return warnings;
  }


  // -------------------------------------------------------------------------
  // Modern Solar + BESS proposal PDF. Kept here because quotation.js is the
  // application-level quotation orchestrator; the legacy pdf.js renderer remains
  // available as a fallback.
  function generateProposalPDF(project) {
    if (!window.jspdf?.jsPDF) throw new Error("jsPDF is not loaded.");
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
    const NAVY = [24, 43, 73], GREEN = [39, 174, 96], LIGHT = [244, 247, 249], TEXT = [35, 43, 52], MUTED = [105, 115, 125];
    const W = 210, H = 297, M = 14;
    const cfg = project.cfg || SolarApp.Config.get();
    const selectedName = project.recommendedSystemType || (project.systemType === "hybrid" ? "Hybrid" : project.systemType === "off-grid" ? "Off-Grid" : "On-Grid");
    const selected = selectedName === "Hybrid" ? project.hybrid : selectedName === "Off-Grid" ? project.offGrid : project.onGrid;
    const bess = selected?.batterySizing;
    const isBess = selectedName !== "On-Grid" && !!bess;
    const customer = project.customer || {};
    const money = n => Number.isFinite(Number(n)) ? "₹" + Math.round(Number(n)).toLocaleString("en-IN") : "₹0";
    const text = (s, x, y, size=9, color=TEXT, style="normal") => { doc.setFont("helvetica", style); doc.setFontSize(size); doc.setTextColor(...color); doc.text(String(s ?? ""), x, y); };
    const wrapped = (s, x, y, width, size=9, color=TEXT, style="normal", gap=4.4) => { doc.setFont("helvetica", style); doc.setFontSize(size); doc.setTextColor(...color); const lines=doc.splitTextToSize(String(s ?? ""),width); doc.text(lines,x,y); return y+lines.length*gap; };
    const header = (title, page) => { doc.setFillColor(...NAVY); doc.rect(0,0,W,22,"F"); text(cfg.company.name || "Solar EPC", M, 9, 12, [255,255,255], "bold"); text(title, M, 17, 8, [220,230,240]); text(`Proposal ${project.quotationNumber || "—"} · ${page}`, W-M, 12, 8, [255,255,255], "bold"); };
    const section = (title,y) => { doc.setFillColor(...NAVY); doc.roundedRect(M,y,W-2*M,8,1.5,1.5,"F"); text(title,M+3,y+5.5,10,[255,255,255],"bold"); return y+13; };
    const table = (head, body, y, widths) => { if(typeof doc.autoTable !== "function") return y; doc.autoTable({startY:y,margin:{left:M,right:M},head:[head],body,theme:"grid",styles:{font:"helvetica",fontSize:8,cellPadding:2.5,overflow:"linebreak",valign:"middle",textColor:TEXT},headStyles:{fillColor:NAVY,textColor:[255,255,255],fontStyle:"bold"},alternateRowStyles:{fillColor:LIGHT},columnStyles:(widths||[]).reduce((o,w,i)=>(o[i]={cellWidth:w},o),{})}); return doc.lastAutoTable?.finalY || y; };
    const footer = () => { const total=doc.internal.getNumberOfPages(); for(let i=1;i<=total;i++){doc.setPage(i);doc.setDrawColor(220,225,230);doc.line(M,H-11,W-M,H-11);text(cfg.company.name||"Solar EPC",M,H-6,7.5,MUTED);text(`Page ${i} / ${total}`,W-M,H-6,7.5,MUTED,"normal");} };

    // Page 1 — executive header / customer / selected system
    doc.setFillColor(...NAVY); doc.rect(0,0,W,H,"F");
    doc.setFillColor(...GREEN); doc.roundedRect(M,38,W-2*M,42,4,4,"F");
    text("SOLAR + BESS PROPOSAL",M+8,51,18,[255,255,255],"bold");
    text(selectedName.toUpperCase(),M+8,61,10,[225,255,235],"bold");
    text(`Proposal ID: ${project.quotationNumber || "—"}`,M+8,70,8,[240,255,245]);
    text(customer.name || "Customer",M,105,20,[255,255,255],"bold");
    wrapped([customer.address,customer.city,customer.district].filter(Boolean).join(", "),M,113,W-2*M,9,[215,225,235]);
    const cards=[["Solar Plant",`${Number(selected?.capacityKW||0).toFixed(2)} kWp`],["Annual Generation",`${Math.round(selected?.generation?.annualKWh||0).toLocaleString("en-IN")} kWh`],["Investment",money(selected?.cost?.finalPrice)],["Payback",Number.isFinite(selected?.savings?.paybackYears)?selected.savings.paybackYears.toFixed(1)+" yrs":"—"]];
    cards.forEach((c,i)=>{const x=M+(i%2)*91,y=145+Math.floor(i/2)*38;doc.setFillColor(255,255,255);doc.roundedRect(x,y,84,30,3,3,"F");text(c[0],x+5,y+9,7,MUTED);text(c[1],x+5,y+20,12,NAVY,"bold");});
    text("Prepared for",M,232,8,[180,195,210]); text(project.date || new Date().toISOString().slice(0,10),M,240,10,[255,255,255],"bold");
    wrapped("Preliminary EPC proposal. Final engineering, structural verification, electrical design and utility approval remain subject to site conditions and applicable rules.",M,260,W-2*M,8,[190,205,220]);

    // Page 2 — system + BESS
    doc.addPage(); header("SYSTEM SPECIFICATION",2); let y=32;
    y=section("SOLAR SYSTEM",y);
    y=table(["Specification","Value"],[
      ["Solar Plant Size",`${Number(selected?.capacityKW||0).toFixed(2)} kWp`],
      ["Panel Reference",`${selected?.panel?.manufacturer||project.roofCapacity?.panel?.manufacturer||"—"} ${selected?.panel?.model||project.roofCapacity?.panel?.model||"—"} × ${selected?.panelCount||0}`],
      ["Inverter",`${selected?.inverter?.manufacturer||"—"} ${selected?.inverter?.model||"—"}`],
      ["Annual Solar Generation",`${Math.round(selected?.generation?.annualKWh||0).toLocaleString("en-IN")} kWh`],
      ["Resource / Yield",`${Number(selected?.generation?.specificYield||0).toFixed(0)} kWh/kWp/yr`],
    ],y,[58,124]); y+=8;
    if(isBess){
      y=section("BESS SPECIFICATION",y);
      y=table(["Specification","Value"],[
        ["Battery Chemistry",bess.battery?.chemistry || "LiFePO4"],
        ["Battery Pack",`${bess.packCount||bess.unitsNeeded} × ${bess.battery?.model||"5.12 kWh 48V/100Ah class pack"}`],
        ["Total Storage",`${Number(bess.totalNameplateKWh||0).toFixed(2)} kWh`],
        ["Usable Capacity",`${Number(bess.totalUsableKWh||0).toFixed(2)} kWh`],
        ["Backup Requirement",`${Number(project.bess?.backupHours||selected?.backupHours||0).toFixed(0)} hours · ${project.bess?.loadType || selected?.loadType || "Essential Household Load"}`],
        ["Estimated Backup Duration",`${Number(bess.estimatedBackupHours||0).toFixed(1)} hours at ${Number(bess.criticalLoadKW||0).toFixed(2)} kW`],
        ["Warranty Reference",`${bess.battery?.warrantyYears || 10} years — confirm final manufacturer terms`],
        ["Grid Independence",Number.isFinite(selected?.gridIndependencePct)?selected.gridIndependencePct.toFixed(1)+"%":"—"],
      ],y,[58,124]);
    }

    // Page 3 — energy + financials
    doc.addPage(); header("ENERGY & FINANCIALS",3); y=32;
    y=section("ENERGY BALANCE",y);
    const sim=selected?.bessSimulation || project.bess?.simulation;
    const energyRows = sim ? [
      ["Daily Load",`${Number((sim.totalLoadKWh||0)).toFixed(1)} kWh`],
      ["Daily Solar",`${Number((sim.totalSolarKWh||0)).toFixed(1)} kWh`],
      ["Direct Solar",`${Number((sim.directSolarKWh||0)).toFixed(1)} kWh`],
      ["Battery Charge",`${Number((sim.batteryChargeKWh||0)).toFixed(1)} kWh`],
      ["Battery Discharge",`${Number((sim.batteryDischargeKWh||0)).toFixed(1)} kWh`],
      ["Grid Import",`${Number((sim.gridImportKWh||0)).toFixed(1)} kWh`],
      [selectedName === "Off-Grid" ? "Autonomy" : "Grid Independence",`${Number(selectedName === "Off-Grid" ? sim.autonomyPct : sim.gridIndependencePct || 0).toFixed(1)}%`],
    ] : [["System Mode","On-Grid — BESS simulation not applicable"]];
    y=table(["Metric","Result"],energyRows,y,[58,124]); y+=8;
    y=section("FINANCIAL BREAKDOWN",y);
    const items=selected?.cost?.lineItems||[];
    y=table(["Item","Qty","Amount"],items.map(i=>[i.item,String(i.qty),money(i.total)]),y,[105,20,57]); y+=4;
    y=table(["Financial Metric","Value"],[
      ["Gross System Cost",money(selected?.cost?.finalPrice)],
      ["Subsidy Deduction",money(selected?.subsidy||0)],
      ["Net Investment",money(selected?.savings?.netInvestment ?? Math.max(0,(selected?.cost?.finalPrice||0)-(selected?.subsidy||0)))],
      ["Estimated Monthly Bill Savings",money((selected?.savings?.annualSavings||0)/12)],
      ["Payback Period",Number.isFinite(selected?.savings?.paybackYears)?selected.savings.paybackYears.toFixed(1)+" years":"—"],
    ],y,[105,77]);

    // Page 4 — scope, CTA, sign-off
    doc.addPage(); header("COMMERCIAL SUMMARY",4); y=32;
    y=section("PROJECT SUMMARY",y);
    y=wrapped(`Customer: ${customer.name||"—"}\nService No.: ${customer.ebBillNumber||customer.utilityBill?.consumerNumber||"—"}\nLocation: ${[customer.city,customer.district].filter(Boolean).join(", ")||"—"}\nSystem: ${selectedName} · ${Number(selected?.capacityKW||0).toFixed(2)} kWp`,M,y,W-2*M,9);
    y+=5;
    y=section("PROPOSAL NOTES",y);
    y=wrapped("• Battery sizing is based on the selected backup duration, critical-load profile, LiFePO4 DoD/efficiency assumptions and modular pack sizing.\n• The 24-hour simulation is an engineering estimate using a representative residential profile unless measured interval data is supplied.\n• Tariff, fixed charges, export credit, subsidy, GST and manufacturer warranty terms must be verified before contract issuance.",M,y,W-2*M,8.5);
    y+=8;
    doc.setFillColor(...GREEN); doc.roundedRect(M,y,W-2*M,52,4,4,"F");
    text("READY TO MOVE TO SITE SURVEY?",M+8,y+14,13,[255,255,255],"bold");
    wrapped("We can proceed with detailed roof verification, electrical single-line design, BESS integration review and final commercial offer.",M+8,y+23,W-2*M-16,9,[235,255,242]);
    text("For site survey / order confirmation",M+8,y+39,8,[215,240,222]);
    text(cfg.company.phone || "Contact details in company profile",M+8,y+47,9,[255,255,255],"bold");
    y+=66;
    text("Customer Acceptance",M,y,10,NAVY,"bold"); text("Authorized Signatory",W/2+10,y,10,NAVY,"bold");
    doc.setDrawColor(150,160,170); doc.line(M,y+22,88,y+22); doc.line(W/2+10,y+22,W-M,y+22);
    text("Name / Signature / Date",M,y+28,7.5,MUTED); text("Name / Signature / Date",W/2+10,y+28,7.5,MUTED);
    footer();
    doc.save(`${project.quotationNumber || "solar-bess-proposal"}.pdf`);
  }

  return { buildOnGrid, buildHybrid, buildOffGrid, buildComparison, validate, fmtINR, fmtYears, generateProposalPDF };
})();
