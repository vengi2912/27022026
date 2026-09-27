/* ==========================================================================
   pdf.js — builds a professional, infographic-style multi-page quotation PDF:
   cover page, company profile, Global-Solar-Atlas-style site analysis,
   Groena-style itemised quotation with subsidy, full BOM, On-Grid/Hybrid/
   Off-Grid comparison, terms/payment/bank details, why-choose-us + quality
   standards, warranty/notes, and a back cover.

   Uses jspdf-autotable for clean bordered tables when available, with a
   manual fallback so the PDF never breaks if that CDN library fails to load.
   ========================================================================== */
window.SolarApp = window.SolarApp || {};

SolarApp.PDF = (function () {

  const PAGE_W = 210, PAGE_H = 297, MARGIN = 14;
  const NAVY = [17, 24, 39];       // dark section-bar / cover background
  const GREEN = [27, 67, 50];      // primary brand green
  const GOLD = [200, 145, 45];     // accent
  const TEAL = [42, 130, 122];     // accent
  const LIGHT_TINT = [235, 244, 239];
  const MUTED = [110, 118, 128];

  // PDF-local currency formatter. The web app has its own `money()` helper,
  // but pdf.js must not depend on app.js load order.
  function money(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "₹0";
    return new Intl.NumberFormat("en-IN", {
      style: "currency", currency: "INR", maximumFractionDigits: 0
    }).format(n);
  }

  function generateQuotationPDF(project) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
    const cfg = project.cfg || SolarApp.Config.get();

    // Deliberately fixed at five executive pages. The page builders below are
    // compact and use selected data only, avoiding the previous catalogue/
    // comparison/repetition that expanded the quotation to 10+ pages.
    buildExecutiveCoverPage(doc, project, cfg);
    doc.addPage(); buildExecutiveSiteRoiPage(doc, project, cfg);
    doc.addPage(); buildExecutiveBomPage(doc, project, cfg);
    doc.addPage(); buildExecutiveTermsPage(doc, project, cfg);
    doc.addPage(); buildExecutiveProfilePage(doc, project, cfg);

    stampFooters(doc, cfg);
    doc.save(`${project.quotationNumber}.pdf`);
  }

  // ---------------------------------------------------------------- helpers
  function safeAutoTable(doc, opts) {
    if (typeof doc.autoTable === "function") {
      opts.styles = Object.assign({ font: "helvetica", fontSize: 8.2, cellPadding: 2.4, overflow: "linebreak", valign: "middle", lineColor: [215, 220, 225], lineWidth: 0.2 }, opts.styles || {});
      opts.headStyles = Object.assign({ font: "helvetica", fontStyle: "bold", valign: "middle", cellPadding: 2.6 }, opts.headStyles || {});
      opts.bodyStyles = Object.assign({ font: "helvetica", valign: "middle", cellPadding: 2.4 }, opts.bodyStyles || {});
      doc.autoTable(opts);
      return doc.lastAutoTable ? doc.lastAutoTable.finalY : (opts.startY || 20);
    }
    return manualTable(doc, opts);
  }

  // Minimal fallback table renderer (used only if the autoTable CDN failed to load)
  function manualTable(doc, opts) {
    let y = opts.startY || 20;
    const head = (opts.head && opts.head[0]) || [];
    const body = opts.body || [];
    const usableW = PAGE_W - MARGIN * 2;
    const colW = usableW / Math.max(1, head.length || (body[0] || []).length);
    doc.setFillColor(...NAVY); doc.rect(MARGIN, y, usableW, 7, "F");
    doc.setTextColor(255, 255, 255); doc.setFontSize(8.5); doc.setFont(undefined, "bold");
    head.forEach((h, i) => doc.text(String(h), MARGIN + i * colW + 2, y + 5));
    y += 9;
    doc.setFont(undefined, "normal"); doc.setFontSize(8.5); doc.setTextColor(20, 20, 20);
    body.forEach((row, ri) => {
      if (y > PAGE_H - 20) { doc.addPage(); y = 20; }
      if (ri % 2 === 1) { doc.setFillColor(...LIGHT_TINT); doc.rect(MARGIN, y - 4.5, usableW, 6.5, "F"); }
      row.forEach((cell, ci) => {
        const lines = doc.splitTextToSize(String(cell), colW - 3);
        doc.text(lines, MARGIN + ci * colW + 2, y);
      });
      y += 6.5;
    });
    return y;
  }

  function sectionBar(doc, text, y) {
    doc.setFillColor(...NAVY);
    doc.rect(MARGIN, y, PAGE_W - MARGIN * 2, 8, "F");
    doc.setDrawColor(...GOLD); doc.setLineWidth(0.8);
    doc.line(MARGIN, y + 8, MARGIN + 26, y + 8);
    doc.setTextColor(255, 255, 255); doc.setFontSize(11.5); doc.setFont(undefined, "bold");
    doc.text(text, MARGIN + 3, y + 5.6);
    doc.setTextColor(20, 20, 20); doc.setFont(undefined, "normal");
    return y + 14;
  }

  function pageHeader(doc, cfg, pageTitle) {
    let y = 14;
    if (cfg.company.logoDataUrl) {
      try { doc.addImage(cfg.company.logoDataUrl, "PNG", MARGIN, y - 6, 22, 14, undefined, "FAST"); } catch (e) {}
    }
    doc.setFontSize(13); doc.setFont(undefined, "bold"); doc.setTextColor(...GREEN);
    doc.text(cfg.company.name, cfg.company.logoDataUrl ? MARGIN + 26 : MARGIN, y);
    doc.setFontSize(8); doc.setFont(undefined, "normal"); doc.setTextColor(...MUTED);
    doc.text(cfg.company.tagline || "", cfg.company.logoDataUrl ? MARGIN + 26 : MARGIN, y + 4.5);
    doc.setFontSize(9); doc.setTextColor(...GOLD); doc.setFont(undefined, "bold");
    doc.text(pageTitle, PAGE_W - MARGIN, y, { align: "right" });
    doc.setDrawColor(220, 220, 220); doc.setLineWidth(0.3);
    doc.line(MARGIN, y + 8, PAGE_W - MARGIN, y + 8);
    doc.setTextColor(20, 20, 20); doc.setFont(undefined, "normal");
    return y + 15;
  }

  function bulletList(doc, items, x, y, opts = {}) {
    const width = opts.width || (PAGE_W - MARGIN * 2 - (x - MARGIN));
    doc.setFontSize(opts.size || 9.5);
    (items || []).forEach(item => {
      doc.setTextColor(...(opts.dotColor || TEAL));
      doc.circle(x + 1, y - 1.3, 1, "F");
      doc.setTextColor(30, 30, 30);
      const lines = doc.splitTextToSize(String(item), width - 6);
      doc.text(lines, x + 5, y);
      y += lines.length * 4.6 + 1.5;
    });
    return y;
  }

  function statBadge(doc, x, y, w, h, value, label) {
    doc.setDrawColor(...GOLD); doc.setLineWidth(0.5);
    doc.roundedRect(x, y, w, h, 2, 2, "S");
    doc.setFontSize(16); doc.setFont(undefined, "bold"); doc.setTextColor(...GREEN);
    doc.text(String(value), x + w / 2, y + h / 2 - 1, { align: "center" });
    doc.setFontSize(7.5); doc.setFont(undefined, "normal"); doc.setTextColor(...MUTED);
    doc.text(label, x + w / 2, y + h / 2 + 6, { align: "center" });
  }

  function stampFooters(doc, cfg) {
    const total = doc.internal.getNumberOfPages();
    for (let i = 1; i <= total; i++) {
      doc.setPage(i);
      doc.setDrawColor(225, 225, 225); doc.setLineWidth(0.2);
      doc.line(MARGIN, PAGE_H - 12, PAGE_W - MARGIN, PAGE_H - 12);
      doc.setFontSize(7.5); doc.setTextColor(...MUTED); doc.setFont(undefined, "normal");
      doc.text(cfg.company.name, MARGIN, PAGE_H - 7);
      doc.text(`Page ${i} / ${total}`, PAGE_W - MARGIN, PAGE_H - 7, { align: "right" });
    }
  }

  function fmtNum(n) { return Number.isFinite(n) ? Math.round(n).toLocaleString("en-IN") : "-"; }
  function fmtINR(n) { return SolarApp.Quotation.fmtINR(n); }

  // ---------------------------------------------------------------- Page 1: Cover
  function buildCoverPage(doc, project, cfg) {
    doc.setFillColor(...NAVY);
    doc.rect(0, 0, PAGE_W, PAGE_H, "F");

    doc.setFillColor(...GOLD);
    doc.rect(0, 30, 60, 26, "F");
    doc.setTextColor(...NAVY); doc.setFontSize(9); doc.setFont(undefined, "bold");
    doc.text("Quotation", 6, 40);
    doc.setFontSize(15);
    doc.text("Solar", 6, 48);
    doc.text("Project", 6, 54.5);

    if (cfg.company.logoDataUrl) {
      try { doc.addImage(cfg.company.logoDataUrl, "PNG", PAGE_W / 2 - 30, 110, 60, 34, undefined, "FAST"); } catch (e) { drawWordmark(); }
    } else {
      drawWordmark();
    }
    function drawWordmark() {
      doc.setTextColor(255, 255, 255); doc.setFontSize(26); doc.setFont(undefined, "bold");
      doc.text(cfg.company.name, PAGE_W / 2, 128, { align: "center" });
      doc.setFontSize(10); doc.setFont(undefined, "normal"); doc.setTextColor(...GOLD);
      doc.text((cfg.company.tagline || "").toUpperCase(), PAGE_W / 2, 136, { align: "center" });
    }

    doc.setDrawColor(...GOLD); doc.setLineWidth(0.6);
    doc.line(PAGE_W / 2 - 30, 150, PAGE_W / 2 + 30, 150);

    doc.setFontSize(10); doc.setTextColor(220, 220, 220); doc.setFont(undefined, "normal");
    doc.text("Prepared for", PAGE_W / 2, 210, { align: "center" });
    doc.setFontSize(16); doc.setFont(undefined, "bold"); doc.setTextColor(255, 255, 255);
    doc.text(project.customer.name || "Customer", PAGE_W / 2, 219, { align: "center" });
    doc.setFontSize(9.5); doc.setFont(undefined, "normal"); doc.setTextColor(200, 200, 200);
    const loc = [project.customer.village, project.customer.district].filter(Boolean).join(", ");
    if (loc) doc.text(loc, PAGE_W / 2, 226, { align: "center" });

    doc.setFontSize(9); doc.setTextColor(...GOLD);
    doc.text(`Quotation No: ${project.quotationNumber}`, PAGE_W / 2, 250, { align: "center" });
    doc.setTextColor(200, 200, 200);
    doc.text(`Date: ${project.date}`, PAGE_W / 2, 256, { align: "center" });

    doc.setFontSize(8); doc.setTextColor(160, 160, 160);
    doc.text(`${cfg.company.address}  |  ${cfg.company.phone}`, PAGE_W / 2, 280, { align: "center" });
  }

  // ---------------------------------------------------------------- Page 2: Company profile
  function buildCompanyProfilePage(doc, cfg) {
    let y = pageHeader(doc, cfg, "ABOUT US");
    y = sectionBar(doc, "WHO WE ARE", y);
    const introLines = doc.splitTextToSize(cfg.company.intro || "", PAGE_W - MARGIN * 2);
    doc.setFontSize(9.5); doc.text(introLines, MARGIN, y);
    y += introLines.length * 4.6 + 8;

    y = sectionBar(doc, "WHAT WE DO", y);
    y = bulletList(doc, cfg.company.services, MARGIN, y);
    y += 6;

    const s = cfg.company.stats;
    const badges = [
      [s.projectsDone, "Projects Done"], [s.happyClients, "Happy Clients"],
      [s.mwInstalled, "MW Installed"], [s.yearsInBusiness, "Years in Business"],
    ].filter(([v]) => v > 0);
    if (badges.length > 0) {
      y = sectionBar(doc, "OUR TRACK RECORD", y);
      const bw = (PAGE_W - MARGIN * 2 - (badges.length - 1) * 6) / badges.length;
      badges.forEach(([v, label], i) => {
        statBadge(doc, MARGIN + i * (bw + 6), y, bw, 22, (i < 2 ? v + "+" : v), label);
      });
      y += 30;
    }

    y = sectionBar(doc, "WHY CHOOSE " + cfg.company.name.toUpperCase(), y);
    bulletList(doc, cfg.company.whyChooseUs, MARGIN, y, { dotColor: GOLD });
  }

  // ---------------------------------------------------------------- Page 3: Site analysis
  function buildSiteAnalysisPage(doc, project, cfg) {
    let y = pageHeader(doc, cfg, "SITE ANALYSIS");
    y = sectionBar(doc, "SITE INFORMATION", y);

    const rc = project.roofCapacity;
    const siteRows = [
      ["Location Coordinates", `${project.lat}, ${project.lon}`],
      ["Address", [project.customer.address, project.customer.village, project.customer.district, project.customer.pincode].filter(Boolean).join(", ") || "-"],
      ["Roof Footprint Area", `${rc.footprintAreaM2.toFixed(1)} m²  (${(rc.footprintAreaM2 * 10.7639).toFixed(0)} sq.ft)`],
      ["Usable Roof Area", `${rc.usableAreaM2.toFixed(1)} m²  (after setbacks &amp; walkways)`.replace("&amp;", "&")],
      ["Roof Maximum Capacity", `${rc.finalCapacityKW.toFixed(2)} kWp  (${rc.finalPanelCount} panels, ${rc.packing.rows}×${rc.packing.cols} ${rc.packing.orientation})`],
      ["Customer Selected Capacity", rc.customerMode ? `${rc.requestedCapacityKW.toFixed(2)} kW` : "Auto recommended"],
      ["Recommended Panel Layout", rc.customerMode ? `${rc.selectedPanelCount} × ${rc.panel.wattage}W = ${rc.selectedCapacityKW.toFixed(2)} kWp` : `${rc.finalPanelCount} × ${rc.panel.wattage}W = ${rc.finalCapacityKW.toFixed(2)} kWp`],
      ["Panel Dimensions", `${rc.panel.lengthMM} × ${rc.panel.widthMM} mm (${rc.panelAreaM2.toFixed(3)} m²/panel)`],
      ["Panel Area", `${(rc.customerMode ? rc.selectedSurfaceAreaM2 : rc.usedAreaM2).toFixed(2)} m²`],
      ["Total Panel Array Area", Number.isFinite(rc.customerMode ? rc.selectedLayoutAreaM2 : rc.packing.layoutAreaM2) ? `${(rc.customerMode ? rc.selectedLayoutAreaM2 : rc.packing.layoutAreaM2).toFixed(2)} m²` : "Does not fit"],
      ["Remaining Usable Roof Area", `${(rc.customerMode ? rc.remainingUsableAreaM2 : rc.remainingAreaM2).toFixed(2)} m²`],
      ["Roof Fit Status", rc.customerMode ? rc.fitStatus : "AUTO / MAXIMUM CAPACITY"],
      ["Solar Resource Data Source", project.dataSource || "-"],
      ["Estimation Accuracy Readiness", Number.isFinite(project.accuracyScore) ? `${project.accuracyScore}/100` : "Not calculated"],
    ];
    if (project.customer?.utilityBill) {
      const u = project.customer.utilityBill;
      if (u.consumerName) siteRows.push(["Utility Consumer Name", u.consumerName]);
      if (u.tariffCategory) siteRows.push(["Utility Tariff", u.tariffCategory]);
      if (u.sanctionedLoadKW) siteRows.push(["Utility Sanctioned Load", `${u.sanctionedLoadKW} kW`]);
      if (u.connectedLoadKW) siteRows.push(["Utility Connected Load", `${u.connectedLoadKW} kW`]);
      if (u.latestUnits) siteRows.push(["Latest Bill Units", `${u.latestUnits} kWh`]);
      if (u.latestBillAmount) siteRows.push(["Latest Bill Amount", `₹${Number(u.latestBillAmount).toLocaleString("en-IN")}`]);
      if (u.billDate) siteRows.push(["Latest Bill Date", u.billDate]);
      if (u.meterNumber) siteRows.push(["Meter Number", u.meterNumber]);
      const h = Array.isArray(u.history) ? u.history : [];
      const hu = h.filter(r => Number.isFinite(Number(r.monthlyUnits))).map(r => Number(r.monthlyUnits));
      const hb = h.filter(r => Number.isFinite(Number(r.monthlyBill))).map(r => Number(r.monthlyBill));
      if (hu.length) {
        siteRows.push(["Average Monthly Units", `${Math.round(hu.reduce((a,b)=>a+b,0)/hu.length).toLocaleString("en-IN")} kWh`]);
        siteRows.push(["Minimum Monthly Units", `${Math.round(Math.min(...hu)).toLocaleString("en-IN")} kWh`]);
        siteRows.push(["Maximum Monthly Units", `${Math.round(Math.max(...hu)).toLocaleString("en-IN")} kWh`]);
      }
      if (hb.length) {
        siteRows.push(["Average Monthly Bill", `₹${Math.round(hb.reduce((a,b)=>a+b,0)/hb.length).toLocaleString("en-IN")}`]);
        siteRows.push(["Minimum Monthly Bill", `₹${Math.round(Math.min(...hb)).toLocaleString("en-IN")}`]);
        siteRows.push(["Maximum Monthly Bill", `₹${Math.round(Math.max(...hb)).toLocaleString("en-IN")}`]);
      }
    }
    if (project.generationSummary) {
      siteRows.push(["Average Peak Sun Hours", `${project.generationSummary.peakSunHoursAvg.toFixed(2)} hrs/day`]);
      siteRows.push(["Estimated Annual Generation", `${fmtNum(project.generationSummary.annualKWh)} kWh (at recommended ${project.sizing.recommendedKW.toFixed(2)} kWp)`]);
      siteRows.push(["Specific Yield", `${project.generationSummary.specificYield.toFixed(0)} kWh/kWp/yr`]);
    }

    y = safeAutoTable(doc, {
      startY: y, margin: { left: MARGIN, right: MARGIN }, theme: "grid",
      head: [["Parameter", "Value"]], body: siteRows,
      headStyles: { fillColor: NAVY, textColor: 255, fontSize: 8.5 },
      bodyStyles: { fontSize: 8.5 }, alternateRowStyles: { fillColor: LIGHT_TINT },
      columnStyles: { 0: { cellWidth: 55, fontStyle: "bold" } },
    }) + 8;

    if (project.chartDataUrl) {
      y = sectionBar(doc, "Monthly Solar Generation (Estimate)", y);
      try {
        doc.addImage(project.chartDataUrl, "PNG", MARGIN, y, PAGE_W - MARGIN * 2, 70, undefined, "FAST");
        y += 76;
      } catch (e) { /* chart image unavailable — skip silently */ }
    }

    if (project.roi) {
      y = sectionBar(doc, "CUSTOMER ROI & BILL COMPARISON", y);
      const r=project.roi;
      const roiRows=[
        ["Monthly electricity bill", fmtINR((r.currentAnnualBill||0)/12), fmtINR((r.postSolarAnnualBill||0)/12), fmtINR((r.annualSavings||0)/12)],
        ["Yearly electricity bill", fmtINR(r.currentAnnualBill), fmtINR(r.postSolarAnnualBill), fmtINR(r.annualSavings)],
        ["10-Year cumulative bill (simple, before tariff escalation)", fmtINR((r.currentAnnualBill||0)*10), fmtINR((r.postSolarAnnualBill||0)*10), fmtINR((r.annualSavings||0)*10)],
      ];
      y=safeAutoTable(doc,{startY:y,margin:{left:MARGIN,right:MARGIN},theme:"grid",head:[["Item","Without Solar","With Solar","Savings"]],body:roiRows,headStyles:{fillColor:NAVY,textColor:255,fontSize:8},bodyStyles:{fontSize:7.8},columnStyles:{0:{cellWidth:72}}})+5;
      const pay=r.paybackYears;
      const roiText=`Gross system cost ${fmtINR(r.grossInvestment)} · government subsidy ${fmtINR(r.subsidy)} · net customer investment ${fmtINR(r.netInvestment)} · estimated payback ${Number.isFinite(pay)?pay.toFixed(1)+" years":"—"}.`;
      doc.setFontSize(8); doc.setFont(undefined,"bold"); doc.text(roiText,MARGIN,y,{maxWidth:PAGE_W-MARGIN*2}); doc.setFont(undefined,"normal"); y+=8;
    }

    if (project.energyBalance?.rows?.length) {
      y = sectionBar(doc, "MONTHLY SOLAR vs GRID BALANCE", y);
      const bRows = project.energyBalance.rows.map(r => [r.month, fmtNum(r.load), fmtNum(r.solar), fmtNum(r.selfUse), fmtNum(r.surplus), fmtNum(r.deficit)]);
      y = safeAutoTable(doc, {
        startY:y, margin:{left:MARGIN,right:MARGIN}, theme:"grid",
        head:[["Month","Load kWh","Solar kWh","Solar Used","Surplus to Grid","Grid Deficit"]], body:bRows,
        headStyles:{fillColor:NAVY,textColor:255,fontSize:7.5}, bodyStyles:{fontSize:7.2},
      }) + 5;
      const eb=project.energyBalance;
      const ecoText=`Annual solar ${fmtNum(eb.totalSolar)} kWh · customer self-use ${fmtNum(eb.totalSelfUse)} kWh · surplus export ${fmtNum(eb.totalSurplus)} kWh · grid deficit/import ${fmtNum(eb.totalDeficit)} kWh · solar coverage ${Number(eb.solarCoveragePct||0).toFixed(1)}%.`;
      doc.setFontSize(8); doc.setFont(undefined,"bold"); doc.text(ecoText,MARGIN,y,{maxWidth:PAGE_W-MARGIN*2}); doc.setFont(undefined,"normal"); y+=8;
    }

    doc.setFontSize(8); doc.setFont(undefined, "italic"); doc.setTextColor(...MUTED);
    const note = "Solar resource figures are estimated from public satellite/reanalysis climate data for the given coordinates, not from an on-site pyranometer measurement. Estimated Generation — subject to physical site survey.";
    const noteLines = doc.splitTextToSize(note, PAGE_W - MARGIN * 2);
    doc.text(noteLines, MARGIN, y + 4);
    doc.setFont(undefined, "normal"); doc.setTextColor(20, 20, 20);
  }

  // ---------------------------------------------------------------- Page 4: Solar resource benchmark
  function buildSolarBenchmarkPage(doc, project, cfg) {
    let y = pageHeader(doc, cfg, "SOLAR RESOURCE BENCHMARK");
    y = sectionBar(doc, "GLOBAL SOLAR ATLAS / SOLARGIS BENCHMARK", y);

    const b = project.gsaBenchmark;
    if (!b || !Number.isFinite(Number(b.pvoutSpecific))) {
      doc.setFontSize(10); doc.setTextColor(...MUTED);
      doc.text("No GSA/Solargis benchmark was supplied for this project.", MARGIN, y);
      return;
    }

    const msrYield = project.generationSummary?.specificYield;
    const capacityKW = project.sizing?.recommendedKW;
    const cmp = Number.isFinite(msrYield) ? SolarApp.Benchmark.compare(msrYield, capacityKW, b) : null;

    const benchmarkRows = [
      ["Benchmark coordinates", `${Number(b.lat).toFixed(6)}, ${Number(b.lon).toFixed(6)}`],
      ["PVOUT specific", `${Number(b.pvoutSpecific).toFixed(1)} kWh/kWp/year`],
      ["GHI", Number.isFinite(Number(b.ghi)) ? `${Number(b.ghi).toFixed(1)} kWh/m²/year` : "-"],
      ["DNI", Number.isFinite(Number(b.dni)) ? `${Number(b.dni).toFixed(1)} kWh/m²/year` : "-"],
      ["Diffuse irradiation (DIF)", Number.isFinite(Number(b.dif)) ? `${Number(b.dif).toFixed(1)} kWh/m²/year` : "-"],
      ["GTI at optimum angle", Number.isFinite(Number(b.gtiOpt)) ? `${Number(b.gtiOpt).toFixed(1)} kWh/m²/year` : "-"],
      ["Optimum PV tilt", Number.isFinite(Number(b.optimumTilt)) ? `${Number(b.optimumTilt).toFixed(1)}°` : "-"],
      ["Air temperature", Number.isFinite(Number(b.temperature)) ? `${Number(b.temperature).toFixed(1)} °C` : "-"],
      ["Terrain elevation", Number.isFinite(Number(b.elevationM)) ? `${Number(b.elevationM).toFixed(0)} m` : "-"],
    ];
    y = safeAutoTable(doc, {
      startY: y, margin: { left: MARGIN, right: MARGIN }, theme: "grid",
      head: [["GSA Parameter", "Benchmark Value"]], body: benchmarkRows,
      headStyles: { fillColor: NAVY, textColor: 255, fontSize: 8.5 },
      bodyStyles: { fontSize: 8.5 }, alternateRowStyles: { fillColor: LIGHT_TINT },
      columnStyles: { 0: { cellWidth: 75, fontStyle: "bold" }, 1: { cellWidth: 115 } },
    }) + 8;

    if (cmp) {
      y = sectionBar(doc, "MSR vs GSA Comparison", y);
      const comparisonRows = [
        ["Recommended system", `${capacityKW.toFixed(2)} kWp`],
        ["MSR engineering specific yield", `${msrYield.toFixed(1)} kWh/kWp/year`],
        ["GSA benchmark specific yield", `${cmp.benchmarkSpecificYield.toFixed(1)} kWh/kWp/year`],
        ["Difference", `${cmp.deltaPct >= 0 ? "+" : ""}${cmp.deltaPct.toFixed(2)}%`],
        ["Benchmark agreement", `${cmp.agreementPct.toFixed(2)}%`],
        ["MSR estimated annual generation", `${fmtNum(cmp.msrAnnual)} kWh`],
        ["GSA benchmark annual generation", `${fmtNum(cmp.gsaAnnual)} kWh`],
        ["Annual generation difference", `${cmp.annualDeltaKWh >= 0 ? "+" : ""}${fmtNum(cmp.annualDeltaKWh)} kWh`],
      ];
      y = safeAutoTable(doc, {
        startY: y, margin: { left: MARGIN, right: MARGIN }, theme: "grid",
        head: [["Comparison", "Result"]], body: comparisonRows,
        headStyles: { fillColor: TEAL, textColor: 255, fontSize: 8.5 },
        bodyStyles: { fontSize: 8.5 }, alternateRowStyles: { fillColor: LIGHT_TINT },
        columnStyles: { 0: { cellWidth: 75, fontStyle: "bold" }, 1: { cellWidth: 115 } },
      }) + 8;
    }

    doc.setFontSize(8); doc.setFont(undefined, "italic"); doc.setTextColor(...MUTED);
    const note = "GSA/Solargis values are presented as an external benchmark from the supplied Global Solar Atlas report. They are not represented as a site-measured value and are not silently combined with the MSR loss model.";
    doc.text(doc.splitTextToSize(note, PAGE_W - MARGIN * 2), MARGIN, y);
    doc.setFont(undefined, "normal"); doc.setTextColor(20, 20, 20);
  }

  // ---------------------------------------------------------------- Page 5: Quotation
  function buildQuotationPage(doc, project, cfg) {
    let y = pageHeader(doc, cfg, "Quotation");

    doc.setFontSize(16); doc.setFont(undefined, "bold"); doc.setTextColor(...GREEN);
    doc.text("Quotation", MARGIN, y); y += 8;
    doc.setFont(undefined, "normal"); doc.setTextColor(20, 20, 20);

    // Client details + proposal meta, two columns
    doc.setFontSize(9);
    doc.setFont(undefined, "bold"); doc.text("Customer Details", MARGIN, y);
    doc.text("Quotation DETAILS", PAGE_W / 2 + 5, y);
    y += 5.5; doc.setFont(undefined, "normal");
    const c = project.customer;
    const validity = addDays(project.date, cfg.quotationMeta.proposalValidityDays);
    const leftLines = [c.name || "-", c.address || "", [c.city, c.village, c.district].filter(Boolean).join(", "), c.pincode || "", c.ebBillNumber ? "EB Bill Number: " + c.ebBillNumber : "", c.mobile ? "Phone: " + c.mobile : ""].filter(Boolean);
    const rightLines = [`Date : ${project.date}`, `Quotation Number : ${project.quotationNumber}`, `Validity Period : ${validity}`];
    const maxLines = Math.max(leftLines.length, rightLines.length);
    for (let i = 0; i < maxLines; i++) {
      if (leftLines[i]) doc.text(leftLines[i], MARGIN, y);
      if (rightLines[i]) doc.text(rightLines[i], PAGE_W / 2 + 5, y);
      y += 5;
    }
    y += 4;

    doc.setFontSize(9.5);
    doc.text(`Dear ${c.name || "Sir / Madam"},`, MARGIN, y); y += 5.5;
    const thankyou = "Thank you for your enquiry for a solar power system. Please find our quotation details below:";
    const tyLines = doc.splitTextToSize(thankyou, PAGE_W - MARGIN * 2);
    doc.text(tyLines, MARGIN, y); y += tyLines.length * 4.6 + 4;

    // Recommended system quotation block (Groena style)
    const recType = project.recommendedSystemType || "On-Grid";
    const sys = recType === "Hybrid" ? project.hybrid : recType === "Off-Grid" ? project.offGrid : project.onGrid;
    const subsidyAmt = cfg.subsidy.enabled ? SolarApp.Config.subsidyForCapacity(sys.capacityKW) : 0;
    const afterSubsidy = sys.cost.finalPrice - subsidyAmt;

    const qBody = [[
      `Solar ${sys.type} Power Plant — ${sys.capacityKW.toFixed(2)} kWp` + (project.roofCapacity?.customerMode ? `\nCustomer requested: ${project.roofCapacity.requestedCapacityKW.toFixed(2)} kW` : "") + (subsidyAmt > 0 ? "\n(PM Surya Ghar Government Subsidy Scheme)" : ""),
      "1", fmtINR(sys.cost.finalPrice), fmtINR(sys.cost.finalPrice),
    ]];
    if (subsidyAmt > 0) qBody.push(["Government Subsidy", "", "", fmtINR(subsidyAmt)]);
    qBody.push(["Net Investment" + (subsidyAmt > 0 ? " after Government Subsidy" : ""), "", "", fmtINR(afterSubsidy)]);

    y = safeAutoTable(doc, {
      startY: y, margin: { left: MARGIN, right: MARGIN }, theme: "grid",
      head: [["Description", "Qty", "Price", "Total"]], body: qBody,
      headStyles: { fillColor: NAVY, textColor: 255, fontSize: 9 },
      bodyStyles: { fontSize: 9 },
      columnStyles: { 0: { cellWidth: 100 }, 1: { cellWidth: 15, halign: "center" }, 2: { cellWidth: 35, halign: "right" }, 3: { cellWidth: 32, halign: "right" } },
      didParseCell: (data) => {
        if (data.row.index === qBody.length - 1) { data.cell.styles.fontStyle = "bold"; data.cell.styles.fillColor = LIGHT_TINT; }
      },
    }) + 8;

    if (cfg.subsidy.enabled && subsidyAmt > 0 && cfg.subsidy.note) {
      doc.setFontSize(7.8); doc.setFont(undefined, "italic"); doc.setTextColor(...MUTED);
      const sLines = doc.splitTextToSize(cfg.subsidy.note, PAGE_W - MARGIN * 2);
      doc.text(sLines, MARGIN, y); y += sLines.length * 4 + 5;
      doc.setFont(undefined, "normal"); doc.setTextColor(20, 20, 20);
    }

    // GST note — mirrors how this is usually stated on a real solar EPC quotation
    // (a short line, not a separate tax line item, since the price above is tax-inclusive).
    doc.setFontSize(8.5); doc.setFont(undefined, "bold");
    doc.text("Tax: " + gstNoteText(cfg.gst), MARGIN, y);
    doc.setFont(undefined, "normal");
    y += 7;

    // Payback summary — generated units × configured ₹/unit valuation.
    const pay = sys.savings || {};
    const payRows = [
      ["Annual Solar Generation", `${Math.round(pay.generatedKWh || sys.generation.annualKWh).toLocaleString("en-IN")} kWh/year`],
      ["Customer Self-Consumption Savings", fmtINR(pay.selfConsumptionSavings || 0)],
      ["Surplus Export Credit", fmtINR(pay.exportCredit || 0)],
      ["Payback Energy Value", `₹${Number(pay.energyValuePerUnit || cfg.payback?.energyValuePerUnit || 4.70).toFixed(2)} / unit`],
      ["Annual Energy Savings", fmtINR(pay.annualSavings || 0)],
      ["Net Investment for Payback", fmtINR(pay.netInvestment ?? (afterSubsidy))],
      ["Estimated Payback Period", Number.isFinite(pay.paybackYears) ? pay.paybackYears.toFixed(1) + " years" : "—"],
    ];
    y = sectionBar(doc, "PAYBACK & ENERGY SAVINGS", y);
    y = safeAutoTable(doc, {
      startY: y, margin: { left: MARGIN, right: MARGIN }, theme: "grid",
      head: [["Parameter", "Value"]], body: payRows,
      headStyles: { fillColor: NAVY, textColor: 255, fontSize: 8.5 },
      bodyStyles: { fontSize: 8.5 },
      columnStyles: { 0: { cellWidth: 95, fontStyle: "bold" }, 1: { cellWidth: 72, halign: "right" } },
    }) + 6;

    doc.setFontSize(7.8); doc.setTextColor(...MUTED);
    doc.text("Payback method: customer self-consumption × import/bill-offset value + surplus export × export-credit value. Panel degradation is included in the multi-year payback estimate. Actual utility settlement can differ.", MARGIN, y, { maxWidth: PAGE_W - MARGIN * 2 });
    doc.setTextColor(20, 20, 20);
    y += 8;

    doc.setFontSize(9); doc.setFont(undefined, "bold");
    doc.text(`This quotation is for the ${recType} configuration, recommended for this site. See the Comparison page for On-Grid, Hybrid, and Off-Grid options side by side.`, MARGIN, y, { maxWidth: PAGE_W - MARGIN * 2 });
    doc.setFont(undefined, "normal");
  }

  function addDays(dateStr, days) {
    try {
      const d = new Date(dateStr);
      d.setDate(d.getDate() + (days || 10));
      return d.toISOString().slice(0, 10);
    } catch (e) { return "-"; }
  }

  function gstNoteText(gstCfg) {
    if (gstCfg && gstCfg.mode === "split") {
      return `Prices are tax-inclusive (GST ${gstCfg.splitLowRatePct}% on ${gstCfg.splitLowSharePct}% of project cost + GST ${gstCfg.splitHighRatePct}% on the remaining ${100 - gstCfg.splitLowSharePct}%).`;
    }
    return `Prices are tax-inclusive (GST ${gstCfg ? gstCfg.flatPct : 0}%).`;
  }

  // ---------------------------------------------------------------- Panel selection / roof layout
  function buildPanelLayoutPage(doc, project, cfg) {
    let y = pageHeader(doc, cfg, "PANEL & ROOF LAYOUT");
    y = sectionBar(doc, "Selected Panel & Roof Capacity", y);

    const rc = project.roofCapacity || {};
    const p = rc.panel || {};
    const requested = rc.customerMode && Number.isFinite(rc.requestedCapacityKW) ? `${rc.requestedCapacityKW.toFixed(2)} kW` : "Auto recommended";
    const actual = rc.customerMode ? rc.selectedCapacityKW : rc.finalCapacityKW;
    const count = rc.customerMode ? rc.selectedPanelCount : rc.finalPanelCount;
    const panelArea = rc.panelAreaM2 || 0;
    const surface = rc.customerMode ? rc.selectedSurfaceAreaM2 : rc.usedAreaM2;
    const layout = rc.customerMode ? rc.selectedLayoutAreaM2 : rc.packing?.layoutAreaM2;
    const remaining = rc.customerMode ? rc.remainingUsableAreaM2 : rc.remainingAreaM2;

    const summary = [
      ["Customer requested capacity", requested],
      ["Selected panel", `${p.manufacturer || "-"} ${p.model || "-"}`],
      ["Panel rating", p.wattage ? `${p.wattage} W` : (p.wattageLabel || "-" )],
      ["Panel dimensions", (p.lengthMM && p.widthMM) ? `${p.lengthMM} × ${p.widthMM}${p.thicknessMM ? ` × ${p.thicknessMM}` : ""} mm` : "Exact model dimensions not supplied"],
      ["Panel area", panelArea ? `${panelArea.toFixed(3)} m² / panel` : "-"],
      ["Number of panels", `${count || 0} Nos.`],
      ["Actual DC capacity", Number.isFinite(actual) ? `${actual.toFixed(2)} kWp` : "-"],
      ["Panel surface area", Number.isFinite(surface) ? `${surface.toFixed(2)} m²` : "-"],
      ["Total array layout area", Number.isFinite(layout) ? `${layout.toFixed(2)} m²` : "Does not fit"],
      ["Usable roof area", Number.isFinite(rc.usableAreaM2) ? `${rc.usableAreaM2.toFixed(2)} m²` : "-"],
      ["Remaining usable roof area", Number.isFinite(remaining) ? `${remaining.toFixed(2)} m²` : "-"],
      ["Roof fit status", rc.customerMode ? (rc.fitStatus || "-") : "AUTO / MAXIMUM CAPACITY"],
    ];
    y = safeAutoTable(doc, {
      startY:y, margin:{left:MARGIN,right:MARGIN}, theme:"grid", head:[["Parameter","Value"]], body:summary,
      headStyles:{fillColor:NAVY,textColor:255,fontSize:8.5}, bodyStyles:{fontSize:8.2},
      columnStyles:{0:{cellWidth:72,fontStyle:"bold",halign:"left"},1:{cellWidth:110,halign:"left"}},
    }) + 8;

    y = sectionBar(doc, "Roof Area Calculation", y);
    const accounting = [
      ["Gross roof / footprint area", Number.isFinite(rc.footprintAreaM2) ? `${rc.footprintAreaM2.toFixed(2)} m²` : "-"],
      ["Usable solar roof area", Number.isFinite(rc.usableAreaM2) ? `${rc.usableAreaM2.toFixed(2)} m²` : "-"],
      ["Panel surface area", Number.isFinite(surface) ? `${surface.toFixed(2)} m²` : "-"],
      ["Array layout area (panel + spacing)", Number.isFinite(layout) ? `${layout.toFixed(2)} m²` : "-"],
      ["Remaining usable roof area", Number.isFinite(remaining) ? `${remaining.toFixed(2)} m²` : "-"],
    ];
    y = safeAutoTable(doc, {
      startY:y, margin:{left:MARGIN,right:MARGIN}, theme:"grid", head:[["Roof calculation","Area"]], body:accounting,
      headStyles:{fillColor:NAVY,textColor:255,fontSize:8.5}, bodyStyles:{fontSize:8.2},
      columnStyles:{0:{cellWidth:125,fontStyle:"bold",halign:"left"},1:{cellWidth:57,halign:"right"}},
    }) + 8;

    // Customer-facing mounting structure reference illustration.
    y = sectionBar(doc, "ROOF MOUNTING REFERENCE", y);
    const refKW = Number.isFinite(actual) ? actual : 1;
    const refCount = Math.max(1, Number(count) || Math.ceil(refKW * 1000 / Math.max(1, Number(p.wattage)||500)));
    const cols = refKW <= 1.1 ? 2 : refKW <= 2.1 ? 2 : 3;
    const show = Math.min(refCount, 9), rows = Math.ceil(show / cols);
    const x0=MARGIN+12, y0=y+5, pw=38, ph=19, gx=7, gy=8;
    for(let i=0;i<show;i++){
      const r=Math.floor(i/cols), c=i%cols, x=x0+c*(pw+gx), yy=y0+r*(ph+gy);
      doc.setFillColor(33,72,96); doc.setDrawColor(...TEAL); doc.roundedRect(x,yy,pw,ph,1.5,1.5,"FD");
      doc.setDrawColor(170,210,215); doc.line(x+5,yy+ph-4,x+pw/2,yy+4); doc.line(x+pw/2,yy+4,x+pw-5,yy+ph-4); doc.line(x+pw/2,yy+4,x+pw/2,yy+ph-4);
    }
    doc.setDrawColor(...GOLD); doc.setLineWidth(1.1); doc.line(x0, y0+rows*(ph+gy)-2, x0+cols*(pw+gx)-gx, y0+rows*(ph+gy)-2);
    doc.setFontSize(8); doc.setTextColor(...MUTED);
    doc.text(`${refKW.toFixed(2)} kWp · ${refCount} Panels · ${p.wattage || "—"}W module reference`, MARGIN, y0+rows*(ph+gy)+8);
    y = y0+rows*(ph+gy)+14;

    doc.setFontSize(7.6); doc.setTextColor(...MUTED);
    doc.text("Engineering convention: panel surface area is not treated as array layout area. Array layout includes configured row/column spacing and roof setbacks. Final installation dimensions are subject to site survey.", MARGIN, PAGE_H - 28, {maxWidth:PAGE_W-MARGIN*2});
    doc.setTextColor(20,20,20);
  }

  // ---------------------------------------------------------------- Panel catalogue
  function buildPanelCataloguePage(doc, project, cfg) {
    let y = pageHeader(doc, cfg, "Solar PANEL PRODUCT CATALOGUE");
    y = sectionBar(doc, "Selectable Panels — Technical + Commercial", y);
    const rows = (cfg.panels || []).map(p => {
      const area = ((Number(p.lengthMM)||0)*(Number(p.widthMM)||0)/1e6);
      const power = p.wattageLabel || (p.wattage ? `${p.wattage} W` : "Configure");
      const size = (p.lengthMM && p.widthMM) ? `${p.lengthMM} × ${p.widthMM}${p.thicknessMM ? ` × ${p.thicknessMM}` : ""} mm` : "Datasheet required";
      const ppwp = p.wattage && p.pricePerPanel ? fmtINR(p.pricePerPanel/p.wattage) : "—";
      const price = p.pricePerPanel ? fmtINR(p.pricePerPanel) : "Configure";
      return [p.manufacturer, p.model, power, size, area ? `${area.toFixed(2)} m²` : "—", p.efficiencyPct ? `${p.efficiencyPct}%` : "—", price, ppwp, p.warrantyYears ? `${p.warrantyYears} yr` : "—"];
    });
    safeAutoTable(doc, {
      startY:y, margin:{left:MARGIN,right:MARGIN}, theme:"grid",
      head:[["Brand","Model","Power","Module Size","Area","Eff.","Quote / Panel","₹/Wp","Warranty"]], body:rows,
      headStyles:{fillColor:NAVY,textColor:255,fontSize:7.1}, bodyStyles:{fontSize:6.7,cellPadding:2.1, valign:"middle"},
      columnStyles:{0:{cellWidth:22},1:{cellWidth:38},2:{cellWidth:18,halign:"center"},3:{cellWidth:31,halign:"center"},4:{cellWidth:16,halign:"right"},5:{cellWidth:14,halign:"center"},6:{cellWidth:23,halign:"right"},7:{cellWidth:16,halign:"right"},8:{cellWidth:16,halign:"center"}},
    });
    let fy = (doc.lastAutoTable?.finalY || y) + 8;
    y = sectionBar(doc, "Selected Panel — Commercial & Engineering Summary", fy);
    const p = project?.roofCapacity?.panel || cfg.panels?.[0];
    if (p) {
      const area = ((Number(p.lengthMM)||0)*(Number(p.widthMM)||0)/1e6);
      const ppwp = p.wattage && p.pricePerPanel ? p.pricePerPanel/p.wattage : 0;
      const detailRows = [
        ["Manufacturer / Model", `${p.manufacturer} ${p.model}`],
        ["Module Power", p.wattageLabel || (p.wattage ? `${p.wattage} W` : "Configure exact module wattage")],
        ["Dimensions", p.lengthMM && p.widthMM ? `${p.lengthMM} × ${p.widthMM} × ${p.thicknessMM || "—"} mm` : "Enter exact manufacturer datasheet"],
        ["Module Area", area ? `${area.toFixed(3)} m²` : "—"],
        ["Efficiency", p.efficiencyPct ? `${p.efficiencyPct}%` : "—"],
        ["Quote Price / Module", p.pricePerPanel ? fmtINR(p.pricePerPanel) : "Enter dealer quote"],
        ["₹/Wp", ppwp ? money(ppwp) : "—"],
        ["Warranty", p.warrantyYears ? `${p.warrantyYears} years` : "—"],
      ];
      safeAutoTable(doc,{startY:y,margin:{left:MARGIN,right:MARGIN},theme:"grid",head:[["Parameter","Value"]],body:detailRows,headStyles:{fillColor:NAVY,textColor:255,fontSize:8.2},bodyStyles:{fontSize:7.8,cellPadding:2.4,valign:"middle"},columnStyles:{0:{cellWidth:68,fontStyle:"bold",halign:"left"},1:{cellWidth:114,halign:"left"}}});
    }
  }

  // ---------------------------------------------------------------- Page 5: BOM
  function buildBOMPage(doc, project, cfg) {
    let y = pageHeader(doc, cfg, "Bill of Materials");
    y = sectionBar(doc, "Bill of Materials & Specifications", y);

    const recType = project.recommendedSystemType || "On-Grid";
    const sys = recType === "Hybrid" ? project.hybrid : recType === "Off-Grid" ? project.offGrid : project.onGrid;
    const panel = project.roofCapacity.panel;

    const rows = sys.cost.lineItems.map(li => [li.item, String(li.qty), remarksFor(li, panel, sys)]);
    rows.push(["Project Management, Installation & Commissioning", "-", "Company Scope"]);
    rows.push(["Civil Work for Structures (if concrete blocks needed)", "-", "As agreed on site survey"]);
    rows.push(["Net-Metering / DISCOM Documentation Follow-ups", "-", "Company Scope (utility charges are customer scope)"]);

    safeAutoTable(doc, {
      startY: y, margin: { left: MARGIN, right: MARGIN }, theme: "grid",
      head: [["Description", "Qty", "Remarks"]], body: rows,
      headStyles: { fillColor: NAVY, textColor: 255, fontSize: 8.5 },
      bodyStyles: { fontSize: 8, valign: "middle" }, alternateRowStyles: { fillColor: LIGHT_TINT },
      columnStyles: { 0: { cellWidth: 58, halign: "left" }, 1: { cellWidth: 18, halign: "center" }, 2: { cellWidth: 106, halign: "left" } },
    });
  }

  function remarksFor(li, panel, sys) {
    const item = li.item.toLowerCase();
    if (item.includes("panel")) {
      const dim = panel.lengthMM && panel.widthMM ? `${panel.lengthMM} × ${panel.widthMM}${panel.thicknessMM ? ` × ${panel.thicknessMM}` : ""} mm` : "Exact dimensions not supplied";
      const area = panel.lengthMM && panel.widthMM ? ((panel.lengthMM*panel.widthMM)/1e6).toFixed(3) + " m²/panel" : "Area not supplied";
      const price = panel.pricePerPanel ? ` | Quote ₹${Math.round(panel.pricePerPanel).toLocaleString("en-IN")}/panel` : " | Price not supplied";
      return `${panel.manufacturer} ${panel.model} | ${panel.wattage || panel.wattageLabel || "-"} | ${dim} | ${area} | ${panel.efficiencyPct || "-"}% | ${panel.warrantyYears || "-"}-yr warranty${price}`;
    }
    if (item.includes("inverter")) return `${sys.inverter.manufacturer} ${sys.inverter.model}, ${sys.inverter.capacityKW}kW, ${sys.inverter.efficiencyPct}% efficiency, ${sys.inverter.warrantyYears}-yr warranty`;
    if (item.includes("battery") && sys.battery) return `${sys.battery.manufacturer} ${sys.battery.model}, ${sys.battery.chemistry}, ${sys.battery.capacityKWh}kWh, ${sys.battery.warrantyYears}-yr warranty`;
    return "As per site requirement";
  }

  // ---------------------------------------------------------------- Page 6: Comparison
  function buildComparisonPage(doc, project, cfg) {
    let y = pageHeader(doc, cfg, "Solar System Comparison");
    y = sectionBar(doc, "ON-GRID  vs  HYBRID  vs  OFF-GRID", y);

    const comp = project.comparison;
    const recType = project.recommendedSystemType || "On-Grid";
    const body = comp.map(r => [r.param, r.onGrid, r.hybrid, r.offGrid]);

    y = safeAutoTable(doc, {
      startY: y, margin: { left: MARGIN, right: MARGIN }, theme: "grid",
      head: [["Parameter", "On-Grid", "Hybrid", "Off-Grid"]], body,
      headStyles: { fillColor: NAVY, textColor: 255, fontSize: 8.5, halign: "center" },
      bodyStyles: { fontSize: 8, halign: "center" },
      columnStyles: { 0: { halign: "left", fontStyle: "bold", cellWidth: 55 } },
      didParseCell: (data) => {
        const colIdx = data.column.index;
        const recCol = recType === "On-Grid" ? 1 : recType === "Hybrid" ? 2 : 3;
        if (colIdx === recCol) { data.cell.styles.fillColor = [255, 245, 225]; data.cell.styles.textColor = [140, 95, 15]; data.cell.styles.fontStyle = "bold"; }
      },
    }) + 8;

    doc.setFillColor(...GOLD); doc.roundedRect(MARGIN, y, PAGE_W - MARGIN * 2, 12, 2, 2, "F");
    doc.setTextColor(...NAVY); doc.setFontSize(10); doc.setFont(undefined, "bold");
    doc.text(`★ Recommended for this site: ${recType}`, MARGIN + 4, y + 7.5);
    doc.setTextColor(20, 20, 20); doc.setFont(undefined, "normal");
    y += 18;

    doc.setFontSize(8.3); doc.setTextColor(...MUTED);
    doc.text("The recommendation is generated from roof capacity, electricity consumption and payback calculations; final selection remains with the customer.", MARGIN, y);
    y += 5;
    const rate = Number(cfg.payback?.energyValuePerUnit || 4.70);
    doc.text(`Payback formula: Annual generated units × ₹${rate.toFixed(2)} = annual energy savings; payback uses net investment after applicable subsidy.`, MARGIN, y, { maxWidth: PAGE_W - MARGIN * 2 });
    doc.setTextColor(20, 20, 20);
  }

  // ---------------------------------------------------------------- Page 7: Terms/Payment/Bank
  function buildTermsPaymentBankPage(doc, project, cfg) {
    let y = pageHeader(doc, cfg, "Terms & Payment");

    y = sectionBar(doc, "GENERAL TERMS & CONDITIONS", y);
    y = bulletList(doc, project.terms && project.terms.length ? project.terms : DEFAULT_TERMS, MARGIN, y);
    y += 6;

    y = sectionBar(doc, "Payment Terms", y);
    y = bulletList(doc, cfg.quotationMeta.paymentMilestones, MARGIN, y, { dotColor: GOLD });
    y += 6;

    if (cfg.company.bank.bankName || cfg.company.bank.accountNumber) {
      y = sectionBar(doc, "Bank Details", y);
      const b = cfg.company.bank;
      safeAutoTable(doc, {
        startY: y, margin: { left: MARGIN, right: MARGIN }, theme: "plain",
        body: [
          ["Bank Name", b.bankName || "-"], ["Account Name", b.accountName || "-"],
          ["Account No", b.accountNumber || "-"], ["IFSC Code", b.ifsc || "-"],
        ],
        bodyStyles: { fontSize: 9.5 }, columnStyles: { 0: { fontStyle: "bold", cellWidth: 45 } },
      });
    }
  }

  // ---------------------------------------------------------------- Page 8: Why choose us
  function buildWhyChooseUsPage(doc, cfg) {
    let y = pageHeader(doc, cfg, "Why Choose Us");
    y = sectionBar(doc, "WHY CHOOSE " + cfg.company.name.toUpperCase(), y);
    y = bulletList(doc, cfg.company.whyChooseUs, MARGIN, y, { dotColor: GOLD }) + 6;

    y = sectionBar(doc, "Customer Installation Support", y);
    y = bulletList(doc, cfg.company.installationSupport, MARGIN, y) + 6;

    if (cfg.company.qualityStandards && cfg.company.qualityStandards.length) {
      y = sectionBar(doc, "Product Quality Standards", y);
      safeAutoTable(doc, {
        startY: y, margin: { left: MARGIN, right: MARGIN }, theme: "grid",
        head: [["Product", "Quality Standard"]],
        body: cfg.company.qualityStandards.map(q => [q.product, q.standard]),
        headStyles: { fillColor: NAVY, textColor: 255, fontSize: 8.5 },
        bodyStyles: { fontSize: 8 }, alternateRowStyles: { fillColor: LIGHT_TINT },
        columnStyles: { 0: { cellWidth: 45, fontStyle: "bold" } },
      });
    }
  }

  // ---------------------------------------------------------------- Page 9: Warranty + notes
  function buildWarrantyNotesPage(doc, project, cfg) {
    let y = pageHeader(doc, cfg, "Warranty & Notes");
    const rc = project.roofCapacity;

    y = sectionBar(doc, "WARRANTY", y);
    y = bulletList(doc, [
      `Solar Panels: ${rc.panel.warrantyYears}-year performance warranty (manufacturer)`,
      `Inverter: manufacturer warranty (typically 5–10 years, see BOM page)`,
      `Installation Workmanship: 1 year from the date of commissioning`,
    ], MARGIN, y) + 6;

    if (project.warnings && project.warnings.length) {
      y = sectionBar(doc, "IMPORTANT NOTES", y);
      doc.setTextColor(160, 90, 20);
      y = bulletList(doc, project.warnings, MARGIN, y, { dotColor: [220, 140, 30] }) + 4;
      doc.setTextColor(20, 20, 20);
    }

    y = sectionBar(doc, "DISCLAIMER", y);
    doc.setFontSize(9); doc.setFont(undefined, "italic"); doc.setTextColor(...MUTED);
    const notice = "This is a preliminary quotation based on available site information (satellite imagery / user-supplied footprint and public solar-resource data). Final system design, generation, and pricing are subject to physical site survey, structural verification, electrical inspection, and applicable utility requirements. Panel layout is a geometric approximation, not a certified structural drawing.";
    const noticeLines = doc.splitTextToSize(notice, PAGE_W - MARGIN * 2);
    doc.text(noticeLines, MARGIN, y);
    doc.setFont(undefined, "normal"); doc.setTextColor(20, 20, 20);
  }

  // ---------------------------------------------------------------- Page 10: Back cover
  function buildBackCoverPage(doc, cfg) {
    doc.setFillColor(...NAVY);
    doc.rect(0, 0, PAGE_W, PAGE_H, "F");

    if (cfg.company.logoDataUrl) {
      try { doc.addImage(cfg.company.logoDataUrl, "PNG", PAGE_W / 2 - 30, 60, 60, 34, undefined, "FAST"); } catch (e) {}
    }
    doc.setFontSize(20); doc.setFont(undefined, "bold"); doc.setTextColor(255, 255, 255);
    doc.text(cfg.company.name, PAGE_W / 2, 110, { align: "center" });
    doc.setFontSize(10); doc.setFont(undefined, "normal"); doc.setTextColor(...GOLD);
    doc.text((cfg.company.tagline || "").toUpperCase(), PAGE_W / 2, 118, { align: "center" });

    doc.setDrawColor(...GOLD); doc.line(PAGE_W / 2 - 25, 130, PAGE_W / 2 + 25, 130);

    doc.setFontSize(9.5); doc.setTextColor(220, 220, 220);
    const lines = [cfg.company.address, cfg.company.phone, cfg.company.email, cfg.company.website].filter(Boolean);
    let y = 150;
    lines.forEach(l => { doc.text(l, PAGE_W / 2, y, { align: "center" }); y += 6; });

    doc.setFontSize(9); doc.setTextColor(...GOLD);
    doc.text("Thank you for considering solar with us.", PAGE_W / 2, PAGE_H - 30, { align: "center" });
  }


  // ========================================================================
  // Executive 5-page quotation builders
  // ========================================================================
  function pageTitle(doc, cfg, title, subtitle) {
    doc.setFillColor(...NAVY); doc.rect(0, 0, PAGE_W, 22, "F");
    if (cfg.company.logoDataUrl) { try { doc.addImage(cfg.company.logoDataUrl, "PNG", MARGIN, 4, 16, 12, undefined, "FAST"); } catch(e) {} }
    doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.setTextColor(255,255,255);
    doc.text(cfg.company.name || "Solar EPC", cfg.company.logoDataUrl ? MARGIN+21 : MARGIN, 9);
    doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(220,225,225);
    doc.text(cfg.company.tagline || "Solar Rooftop Proposal", cfg.company.logoDataUrl ? MARGIN+21 : MARGIN, 14);
    doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(...GOLD);
    const titleLines=doc.splitTextToSize(String(title||""),72);
    doc.text(titleLines, PAGE_W-MARGIN, 8, {align:"right"});
    doc.setFont("helvetica", "normal"); doc.setFontSize(6.5); doc.setTextColor(220,225,225);
    const subLines=doc.splitTextToSize(String(subtitle||""),72);
    doc.text(subLines, PAGE_W-MARGIN, 14, {align:"right"});
    doc.setTextColor(20,20,20);
    return 30;
  }

  function compactTable(doc, head, body, y, widths, fontSize=7.6) {
    const usableW=PAGE_W-MARGIN*2;
    const raw=widths.map(Number);
    const total=raw.reduce((a,b)=>a+(Number.isFinite(b)?b:0),0)||usableW;
    const scale=usableW/total;
    const fixed=raw.map(w=>Number.isFinite(w)?w*scale:usableW/raw.length);
    return safeAutoTable(doc, {
      startY:y, margin:{left:MARGIN,right:MARGIN}, theme:"grid", tableWidth:usableW,
      head:[head], body:body,
      styles:{fontSize, cellPadding:1.8, overflow:"linebreak", valign:"middle", lineWidth:.2},
      headStyles:{fillColor:NAVY,textColor:255,fontSize:fontSize,cellPadding:2,halign:"left"},
      bodyStyles:{fontSize,cellPadding:1.8,overflow:"linebreak"}, alternateRowStyles:{fillColor:LIGHT_TINT},
      columnStyles:Object.fromEntries(fixed.map((w,i)=>[i,{cellWidth:w}]))
    });
  }

  function kpiCard(doc,x,y,w,h,label,value,accent=GREEN) {
    doc.setFillColor(248,250,249); doc.setDrawColor(220,226,223); doc.roundedRect(x,y,w,h,2.5,2.5,"FD");
    doc.setFont("helvetica","normal"); doc.setFontSize(6.6); doc.setTextColor(...MUTED);
    doc.text(doc.splitTextToSize(String(label),w-6),x+3,y+5);
    const text=String(value??"—"); let fs=12; if(text.length>15)fs=10.5; if(text.length>20)fs=9; if(text.length>25)fs=8;
    doc.setFont("helvetica","bold"); doc.setFontSize(fs); doc.setTextColor(...accent);
    doc.text(doc.splitTextToSize(text,w-6),x+3,y+14);
    doc.setFont("helvetica","normal"); doc.setTextColor(20,20,20);
  }

  function getSelectedSystem(project) {
    const t = project.recommendedSystemType || "On-Grid";
    return t === "Hybrid" ? project.hybrid : t === "Off-Grid" ? project.offGrid : project.onGrid;
  }

  function buildExecutiveCoverPage(doc, project, cfg) {
    doc.setFillColor(...NAVY); doc.rect(0,0,PAGE_W,PAGE_H,"F");
    doc.setFillColor(...GOLD); doc.rect(0,0,PAGE_W,9,"F");
    if (cfg.company.logoDataUrl) { try { doc.addImage(cfg.company.logoDataUrl,"PNG",MARGIN,24,28,18,undefined,"FAST"); } catch(e) {} }
    doc.setFont("helvetica","bold"); doc.setTextColor(255,255,255); doc.setFontSize(24);
    doc.text("SOLAR ROOFTOP PROPOSAL",MARGIN,58);
    doc.setFontSize(11); doc.setTextColor(...GOLD); doc.text(cfg.company.name || "Solar EPC",MARGIN,66);
    doc.setFont("helvetica","normal"); doc.setFontSize(8.5); doc.setTextColor(215,220,220);
    doc.text("Executive quotation · site-specific preliminary estimate",MARGIN,73);

    const c=project.customer||{}, sys=getSelectedSystem(project)||{};
    const subsidy=Number(sys.subsidy||0), gross=Number(sys.cost?.finalPrice||0), net=Math.max(0,gross-subsidy);
    const loc=[c.city,c.village,c.district].filter(Boolean).join(", ") || "—";
    const y=94;
    doc.setFillColor(255,255,255); doc.roundedRect(MARGIN,y,PAGE_W-MARGIN*2,62,4,4,"F");
    doc.setTextColor(...GREEN); doc.setFont("helvetica","bold"); doc.setFontSize(12); doc.text("CLIENT & PROPOSAL DETAILS",MARGIN+6,y+9);
    const left=[["Customer",c.name||"Customer"],["Location",loc],["TNEB Consumer No.",c.ebBillNumber||"-"],["Quotation No.",project.quotationNumber||"-"],["Proposal Date",project.date||"-"]];
    let yy=y+17; doc.setFontSize(7.8);
    left.forEach(([k,v])=>{doc.setFont("helvetica","bold");doc.setTextColor(...MUTED);doc.text(k,MARGIN+6,yy);doc.setFont("helvetica","normal");doc.setTextColor(25,25,25);doc.text(String(v),MARGIN+43,yy);yy+=7;});
    doc.setFont("helvetica","bold"); doc.setTextColor(...GREEN); doc.setFontSize(10); doc.text("RECOMMENDED SYSTEM",PAGE_W/2+8,y+17);
    doc.setFontSize(18); doc.text(`${sys.capacityKW ? sys.capacityKW.toFixed(2) : "—"} kWp`,PAGE_W/2+8,y+30);
    doc.setFontSize(8.5); doc.setTextColor(35,35,35); doc.text(doc.splitTextToSize(`${sys.type||"On-Grid"} rooftop solar`,62),PAGE_W/2+8,y+37);
    doc.setFontSize(7.5); doc.setTextColor(...MUTED); doc.text(doc.splitTextToSize(`${project.roofCapacity?.selectedPanelCount||project.roofCapacity?.finalPanelCount||"—"} panels · ${project.roofCapacity?.panel?.wattage||"—"} W/module`,62),PAGE_W/2+8,y+44);

    doc.setTextColor(255,255,255); doc.setFont("helvetica","bold"); doc.setFontSize(10); doc.text("PRICE & SUBSIDY SUMMARY",MARGIN,175);
    const bw=(PAGE_W-MARGIN*2-8)/3;
    kpiCard(doc,MARGIN,183,bw,30,"SYSTEM PRICE",fmtINR(gross),GREEN);
    kpiCard(doc,MARGIN+bw+4,183,bw,30,"GOVERNMENT SUBSIDY",fmtINR(subsidy),GOLD);
    kpiCard(doc,MARGIN+2*(bw+4),183,bw,30,"NET CUSTOMER INVESTMENT",fmtINR(net),[16,185,129]);
    doc.setTextColor(210,215,215); doc.setFont("helvetica","normal"); doc.setFontSize(7.5);
    const note=cfg.subsidy?.note || "Applicable subsidy is subject to current government/DISCOM eligibility and approval.";
    doc.text(doc.splitTextToSize(note,PAGE_W-MARGIN*2),MARGIN,225);
    doc.setTextColor(...GOLD); doc.setFont("helvetica","bold"); doc.setFontSize(9); doc.text("Prepared for customer review and site-survey confirmation",MARGIN,PAGE_H-24);
    doc.setFont("helvetica","normal"); doc.setFontSize(7.5); doc.setTextColor(180,185,185); doc.text(`${cfg.company.address||""} · ${cfg.company.phone||""} · ${cfg.company.email||""}`,MARGIN,PAGE_H-16);
  }

  function buildExecutiveSiteRoiPage(doc, project, cfg) {
    let y=pageTitle(doc,cfg,"SITE ANALYSIS & ROI","Site information, energy balance and investment recovery");
    const rc=project.roofCapacity||{}, c=project.customer||{}, bc=project.billComparison||{}, eb=project.energyBalance||{};
    const sys=getSelectedSystem(project)||{}; const roi=project.roi||{};
    const rows=[
      ["City / Location",[c.city,c.village,c.district].filter(Boolean).join(", ")||"—", "Coordinates",`${project.lat||"—"}, ${project.lon||"—"}`],
      ["Gross Roof Area",Number.isFinite(rc.footprintAreaM2)?`${rc.footprintAreaM2.toFixed(2)} m² (${(rc.footprintAreaM2*10.7639).toFixed(0)} sq.ft)`:"—","Usable Roof Area",Number.isFinite(rc.usableAreaM2)?`${rc.usableAreaM2.toFixed(2)} m² (${(rc.usableAreaM2*10.7639).toFixed(0)} sq.ft)`:"—"],
      ["Panel Layout",`${rc.selectedPanelCount||rc.finalPanelCount||0} × ${rc.panel?.wattage||"—"} W`,`Roof Fit`,rc.customerMode?(rc.fitStatus||"—"):"Preliminary / auto"],
      ["Annual Solar Generation",`${Math.round(sys.generation?.annualKWh||project.generationSummary?.annualKWh||0).toLocaleString("en-IN")} kWh`,"Solar Coverage",eb.solarCoveragePct!=null?`${Number(eb.solarCoveragePct).toFixed(1)}%`:"—"]
    ];
    y=compactTable(doc,["Site Parameter","Value","Site Parameter","Value"],rows,y,[36,55,36,55],7.2)+6;
    const net=Math.max(0,Number(sys.cost?.finalPrice||0)-Number(sys.subsidy||0));
    const annualSavings=Number(bc.annualSavings||roi.annualSavings||0);
    const payback=annualSavings>0?net/annualSavings:roi.paybackYears;
    const kW=sys.capacityKW||project.roofCapacity?.selectedCapacityKW||3;
    const avgBill=Number(bc.averageCurrentMonthlyBill||0), postBill=Number(bc.averagePostSolarMonthlyBill||0);
    const cards=[
      ["Current Avg. Bill",fmtINR(avgBill)+" / month",GREEN],
      ["Post-Solar Avg. Bill",fmtINR(postBill)+" / month",TEAL],
      ["Monthly Savings",fmtINR(Math.max(0,avgBill-postBill)),GOLD],
      ["Payback",Number.isFinite(payback)?`${payback.toFixed(1)} years`:"—",GREEN]
    ];
    const cw=(PAGE_W-MARGIN*2-9)/4; cards.forEach((a,i)=>kpiCard(doc,MARGIN+i*(cw+3),y,cw,27,a[0],a[1],a[2])); y+=34;
    y=sectionBar(doc,"MONTHLY ENERGY & BILL BALANCE",y);
    const mrows=(bc.rows||eb.rows||[]).map(r=>[r.month||"—",fmtNum(r.load),fmtNum(r.solar),fmtNum(r.selfUse),fmtNum(r.surplus),fmtNum(r.deficit),fmtINR(r.currentBill),fmtINR(r.postSolarBill),fmtINR(r.monthlySavings)]);
    if(mrows.length) y=compactTable(doc,["Month","Usage kWh","Solar kWh","Solar Used","Surplus","Deficit","Current Bill","Post-Solar","Savings"],mrows,y,[15,19,19,19,19,19,24,24,24],5.8)+5;
    else { doc.setFontSize(8);doc.setTextColor(...MUTED);doc.text("Monthly bill history is not available. Use the manual average consumption/bill inputs for a preliminary ROI.",MARGIN,y); y+=10; }
    const surplus=Number(eb.totalSurplus||0), deficit=Number(eb.totalDeficit||0);
    doc.setFontSize(7.2);doc.setTextColor(...MUTED);doc.text(`Annual solar: ${fmtNum(eb.totalSolar)} kWh · Self-consumed: ${fmtNum(eb.totalSelfUse)} kWh · Surplus export: ${fmtNum(surplus)} kWh · Grid deficit: ${fmtNum(deficit)} kWh · Net investment: ${fmtINR(net)} · Estimated annual savings: ${fmtINR(annualSavings)}.`,MARGIN,y,{maxWidth:PAGE_W-MARGIN*2});
  }

  function buildExecutiveBomPage(doc, project, cfg) {
    let y=pageTitle(doc,cfg,"SELECTED BOM & TECHNICAL SPECIFICATIONS","Only the selected system components are shown");
    const sys=getSelectedSystem(project)||{}, rc=project.roofCapacity||{}, panel=rc.panel||{};
    const lineItems=Array.isArray(sys.cost?.lineItems)?sys.cost.lineItems:[];
    const rows=lineItems.map(li=>[li.item,String(li.qty??"—"),fmtINR(li.unitPrice),fmtINR(li.total),remarksFor(li,panel,sys)]);
    y=sectionBar(doc,"SELECTED BILL OF MATERIALS",y);
    y=compactTable(doc,["Component","Qty","Unit","Total","Selected Specification"],rows,y,[49,15,26,28,64],6.7)+7;
    y=sectionBar(doc,"TECHNICAL SPECIFICATIONS",y);
    const tech=[
      ["System",`${sys.type||"On-Grid"} · ${Number(sys.capacityKW||0).toFixed(2)} kWp`],
      ["Solar Module",`${panel.manufacturer||"—"} ${panel.model||"—"} · ${panel.wattage||panel.wattageLabel||"—"} W · ${panel.efficiencyPct||"—"}%`],
      ["Module Dimensions",panel.lengthMM&&panel.widthMM?`${panel.lengthMM} × ${panel.widthMM} × ${panel.thicknessMM||"—"} mm`:"Datasheet confirmation required"],
      ["Panel Quantity",`${rc.selectedPanelCount||rc.finalPanelCount||0} Nos. · Approx. ${Number(rc.selectedSurfaceAreaM2||rc.usedAreaM2||0).toFixed(2)} m² surface area`],
      ["Inverter",sys.inverter?`${sys.inverter.manufacturer} ${sys.inverter.model} · ${sys.inverter.capacityKW} kW · ${sys.inverter.warrantyYears||"—"}-yr warranty`:"—"],
      ["Battery",sys.battery?`${sys.battery.manufacturer} ${sys.battery.model} · ${sys.battery.capacityKWh} kWh · ${sys.battery.warrantyYears||"—"}-yr warranty`:"Not applicable for selected system"],
      ["Structure", "Hot-dip galvanized rooftop mounting structure; final section/anchoring subject to structural/site survey"],
      ["Generation",`${Math.round(sys.generation?.annualKWh||0).toLocaleString("en-IN")} kWh/year estimated; weather, shading and losses can change actual output`]
    ];
    y=compactTable(doc,["Specification","Selected Design"],tech,y,[55,127],7.2)+7;
    doc.setFillColor(255,248,232);doc.roundedRect(MARGIN,y,PAGE_W-MARGIN*2,20,2,2,"F");doc.setFont("helvetica","bold");doc.setFontSize(8);doc.setTextColor(120,85,25);doc.text("ROOF DESIGN NOTE",MARGIN+4,y+6);doc.setFont("helvetica","normal");doc.setFontSize(7.2);doc.text(doc.splitTextToSize("For the default 3 kW preliminary case, gross roof area is 300 sq.ft and usable roof area is assigned as 180 sq.ft to represent a clean six-module reference layout. Replace this assumption with measured/KML roof data before final engineering.",PAGE_W-MARGIN*2-8),MARGIN+4,y+12);
  }

  function buildExecutiveTermsPage(doc, project, cfg) {
    let y=pageTitle(doc,cfg,"TERMS, PAYMENT & BANK","Commercial conditions and payment information");
    y=sectionBar(doc,"TERMS & CONDITIONS",y);
    y=bulletList(doc,(project.terms&&project.terms.length?project.terms:DEFAULT_TERMS),MARGIN,y,{size:7.0,width:PAGE_W-MARGIN*2})+4;
    y=sectionBar(doc,"PAYMENT TERMS",y);
    y=bulletList(doc,cfg.quotationMeta?.paymentMilestones||[],MARGIN,y,{size:7.0,width:PAGE_W-MARGIN*2,dotColor:GOLD})+4;
    y=sectionBar(doc,"BANK DETAILS",y);
    const b=cfg.company.bank||{};
    y=compactTable(doc,["Bank Field","Details"],[["Bank Name",b.bankName||"—"],["Account Name",b.accountName||"—"],["Account Number",b.accountNumber||"—"],["IFSC Code",b.ifsc||"—"]],y,[45,137],7.6)+6;
    y=sectionBar(doc,"COMMERCIAL NOTES",y);
    const notes=[
      `Quotation validity: ${cfg.quotationMeta?.proposalValidityDays||10} days.`,
      cfg.subsidy?.note||"Applicable subsidy is subject to current government scheme eligibility and approval.",
      "Net-metering/DISCOM approval, utility charges and government processing are subject to prevailing rules and customer eligibility.",
      "Final price and scope are confirmed after site survey, structural verification and electrical inspection."
    ];
    bulletList(doc,notes,MARGIN,y,{size:7.0,width:PAGE_W-MARGIN*2,dotColor:TEAL});
  }

  function buildExecutiveProfilePage(doc, project, cfg) {
    let y=pageTitle(doc,cfg,"COMPANY, INSTALLATION & WARRANTY","Service profile, commissioning checklist and warranty summary");
    y=sectionBar(doc,"COMPANY PROFILE",y);
    doc.setFont("helvetica","bold");doc.setFontSize(11);doc.setTextColor(...GREEN);doc.text(cfg.company.name||"Solar EPC",MARGIN,y);y+=6;
    doc.setFont("helvetica","normal");doc.setFontSize(7.7);doc.setTextColor(35,35,35);
    const intro=cfg.company.intro||"End-to-end rooftop solar EPC services from site survey and system design through installation and after-sales support.";
    const lines=doc.splitTextToSize(intro,PAGE_W-MARGIN*2);doc.text(lines,MARGIN,y);y+=lines.length*4+4;
    y=sectionBar(doc,"INSTALLATION CHECKLIST",y);
    const checklist=(cfg.company.installationSupport||[]).slice(0,6).map(x=>"□ "+x);
    y=bulletList(doc,checklist,MARGIN,y,{size:7.6})+4;
    y=sectionBar(doc,"WARRANTY INFORMATION",y);
    const rc=project.roofCapacity||{}, sys=getSelectedSystem(project)||{};
    const warr=[
      [`Solar Panels`,rc.panel?.warrantyYears?`${rc.panel.warrantyYears}-year manufacturer warranty/performance coverage`:`Manufacturer warranty as per selected module datasheet`],
      [`Inverter`,sys.inverter?.warrantyYears?`${sys.inverter.warrantyYears}-year manufacturer warranty`:`As per selected inverter manufacturer`],
      [`Installation Workmanship`,"1 year from commissioning, subject to stated terms"],
      [`Structure / BOS`,"As per component manufacturer and EPC workmanship terms"],
    ];
    y=compactTable(doc,["Item","Warranty / Coverage"],warr,y,[55,127],7.4)+6;
    y=sectionBar(doc,"QUALITY & FINAL DESIGN NOTE",y);
    const standards=(cfg.company.qualityStandards||[]).slice(0,4).map(q=>`${q.product}: ${q.standard}`);
    y=bulletList(doc,standards,MARGIN,y,{size:7.2,dotColor:GOLD})+3;
    doc.setFont("helvetica","italic");doc.setFontSize(7);doc.setTextColor(...MUTED);
    doc.text(doc.splitTextToSize("This quotation is a preliminary commercial/technical estimate. Final module layout, structural members, electrical protection, generation, savings and utility approvals must be verified through a physical site survey and applicable DISCOM requirements before installation.",PAGE_W-MARGIN*2),MARGIN,y);
    doc.setFont("helvetica","normal");
  }

  const DEFAULT_TERMS = [
    "Prices shown in the quotation are inclusive of the stated GST.",
    "Warranty starts from the date of Solar System commissioning.",
    "Equipment cannot be returned or exchanged after installation.",
    "Project completion period will be agreed based on site survey, material availability and site conditions.",
    "Applicable government subsidy is paid directly to the customer bank account by the government; processing time is subject to DISCOM/MNRE rules.",
    "Net-metering approval and DISCOM charges are the customer responsibility unless separately agreed.",
  ];

  return { generateQuotationPDF, DEFAULT_TERMS };
})();
