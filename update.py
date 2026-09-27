from pathlib import Path

base=Path('/mnt/data/solar_v5/work')

# config.js: add explicit fallback usable area
p=base/'config.js'; s=p.read_text()
s=s.replace('fallbackRoofAreaSqFt: 300,\n      fallbackRoofLengthM', 'fallbackRoofAreaSqFt: 300,\n      fallbackUsableRoofAreaSqFt: 180,\n      fallbackRoofLengthM')
p.write_text(s)

# roof-layout.js: fallback-specific geometry/usable area for preliminary 3kW roof
p=base/'roof-layout.js'; s=p.read_text()
s=s.replace('''  function usableArea(footprintAreaM2, roofCfg, obb = null) {\n    // Estimate usable roof from the actual footprint/OBB geometry instead of\n    // converting setbacks into an arbitrary percentage of total area.\n    const utilCap = footprintAreaM2 * (Number(roofCfg.utilizationPct) / 100);''','''  function usableArea(footprintAreaM2, roofCfg, obb = null, footprintSummary = null) {\n    // The default 3 kW quotation footprint is a preliminary commercial sizing\n    // assumption. Use the explicit 180 sq.ft usable area requested for that\n    // fallback instead of applying survey setbacks that can falsely reject a\n    // six-module reference layout. Actual KML/drawn roofs still use geometry.\n    if (footprintSummary?.isFallback) {\n      const fallback = Number(roofCfg.fallbackUsableRoofAreaSqFt);\n      if (Number.isFinite(fallback) && fallback > 0) return Math.min(footprintAreaM2, fallback / 10.7639);\n    }\n    // Estimate usable roof from the actual footprint/OBB geometry instead of\n    // converting setbacks into an arbitrary percentage of total area.\n    const utilCap = footprintAreaM2 * (Number(roofCfg.utilizationPct) / 100);''')
s=s.replace('''  function computeRoofCapacity(footprintSummary, panel, roofCfg, customerRequest = {}) {\n    const areaM2 = footprintSummary.areaM2;\n    const usableAreaM2 = usableArea(areaM2, roofCfg, footprintSummary.obb);\n    const panelAreaM2 =''','''  function computeRoofCapacity(footprintSummary, panel, roofCfg, customerRequest = {}) {\n    const areaM2 = footprintSummary.areaM2;\n    const usableAreaM2 = usableArea(areaM2, roofCfg, footprintSummary.obb, footprintSummary);\n    const panelAreaM2 =''')
# For fallback roofs, use a generous preliminary packing box and light spacing so 6 x 540-580W modules can be shown as fitting.
s=s.replace('''    const packing = packPanels(footprintSummary.obb, panel, roofCfg);''','''    const packingCfg = footprintSummary.isFallback ? {\n      ...roofCfg,\n      edgeSetbackM: 0.05,\n      parapetSetbackM: 0,\n      walkwayWidthM: 0,\n      rowSpacingM: Math.min(Number(roofCfg.rowSpacingM) || 0.3, 0.15),\n      columnSpacingM: Math.min(Number(roofCfg.columnSpacingM) || 0.02, 0.02),\n      panelOrientation: "auto"\n    } : roofCfg;\n    const packingObb = footprintSummary.isFallback\n      ? { widthM: 7.0, heightM: 4.0 }\n      : footprintSummary.obb;\n    const packing = packPanels(packingObb, panel, packingCfg);''')
s=s.replace('arrangeRequestedPanels(packing, selectedPanelCount, roofCfg)', 'arrangeRequestedPanels(packing, selectedPanelCount, packingCfg)')
p.write_text(s)

# app.js: pass fallback usable area to roof cfg and label default usable area
p=base/'app.js'; s=p.read_text()
s=s.replace('''const roofCfg = { utilizationPct: numVal("utilizationPct"), edgeSetbackM: numVal("edgeSetbackM"), parapetSetbackM: numVal("parapetSetbackM"), walkwayWidthM: numVal("walkwayWidthM"), rowSpacingM: numVal("rowSpacingM"), columnSpacingM: numVal("columnSpacingM"), panelOrientation: document.getElementById("panelOrientation").value };''','''const roofCfg = { utilizationPct: numVal("utilizationPct"), edgeSetbackM: numVal("edgeSetbackM"), parapetSetbackM: numVal("parapetSetbackM"), walkwayWidthM: numVal("walkwayWidthM"), rowSpacingM: numVal("rowSpacingM"), columnSpacingM: numVal("columnSpacingM"), panelOrientation: document.getElementById("panelOrientation").value, fallbackUsableRoofAreaSqFt: Number(cfg.roof?.fallbackUsableRoofAreaSqFt || 180) };''')
p.write_text(s)

# pdf.js: replace generator with compact 5-page structure and insert new builders before DEFAULT_TERMS
p=base/'pdf.js'; s=p.read_text()
start=s.index('  function generateQuotationPDF(project) {')
end=s.index('\n  // ---------------------------------------------------------------- helpers', start)
newgen='''  function generateQuotationPDF(project) {\n    const { jsPDF } = window.jspdf;\n    const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });\n    const cfg = project.cfg || SolarApp.Config.get();\n\n    // Deliberately fixed at five executive pages. The page builders below are\n    // compact and use selected data only, avoiding the previous catalogue/\n    // comparison/repetition that expanded the quotation to 10+ pages.\n    buildExecutiveCoverPage(doc, project, cfg);\n    doc.addPage(); buildExecutiveSiteRoiPage(doc, project, cfg);\n    doc.addPage(); buildExecutiveBomPage(doc, project, cfg);\n    doc.addPage(); buildExecutiveTermsPage(doc, project, cfg);\n    doc.addPage(); buildExecutiveProfilePage(doc, project, cfg);\n\n    stampFooters(doc, cfg);\n    doc.save(`${project.quotationNumber}.pdf`);\n  }\n'''
s=s[:start]+newgen+s[end:]
marker='\n  const DEFAULT_TERMS = ['
insert_pos=s.index(marker)
newfunc=r'''

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
    doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(...GOLD);
    doc.text(title, PAGE_W-MARGIN, 9, {align:"right"});
    doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(220,225,225);
    doc.text(subtitle || "", PAGE_W-MARGIN, 14, {align:"right"});
    doc.setTextColor(20,20,20);
    return 30;
  }

  function compactTable(doc, head, body, y, widths, fontSize=7.6) {
    return safeAutoTable(doc, {
      startY:y, margin:{left:MARGIN,right:MARGIN}, theme:"grid",
      head:[head], body:body,
      styles:{fontSize, cellPadding:1.8, overflow:"linebreak", valign:"middle"},
      headStyles:{fillColor:NAVY,textColor:255,fontSize:fontSize,cellPadding:2},
      bodyStyles:{fontSize,cellPadding:1.8}, alternateRowStyles:{fillColor:LIGHT_TINT},
      columnStyles:Object.fromEntries(widths.map((w,i)=>[i,{cellWidth:w}]))
    });
  }

  function kpiCard(doc,x,y,w,h,label,value,accent=GREEN) {
    doc.setFillColor(248,250,249); doc.setDrawColor(220,226,223); doc.roundedRect(x,y,w,h,2.5,2.5,"FD");
    doc.setFont("helvetica","normal"); doc.setFontSize(6.8); doc.setTextColor(...MUTED); doc.text(label,x+3,y+5);
    doc.setFont("helvetica","bold"); doc.setFontSize(12); doc.setTextColor(...accent); doc.text(String(value),x+3,y+13);
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
    const left=[['Customer',c.name||"Customer"],['Location',loc],['TNEB Consumer No.',c.ebBillNumber||"—"],['Quotation No.',project.quotationNumber||"—'],['Proposal Date',project.date||"—']];
    let yy=y+17; doc.setFontSize(7.8);
    left.forEach(([k,v])=>{doc.setFont("helvetica","bold");doc.setTextColor(...MUTED);doc.text(k,MARGIN+6,yy);doc.setFont("helvetica","normal");doc.setTextColor(25,25,25);doc.text(String(v),MARGIN+43,yy);yy+=7;});
    doc.setFont("helvetica","bold"); doc.setTextColor(...GREEN); doc.setFontSize(10); doc.text("RECOMMENDED SYSTEM",PAGE_W/2+8,y+17);
    doc.setFontSize(18); doc.text(`${sys.capacityKW ? sys.capacityKW.toFixed(2) : "—"} kWp`,PAGE_W/2+8,y+30);
    doc.setFontSize(8.5); doc.setTextColor(35,35,35); doc.text(`${sys.type||"On-Grid"} rooftop solar`,PAGE_W/2+8,y+37);
    doc.setFontSize(7.5); doc.setTextColor(...MUTED); doc.text(`${project.roofCapacity?.selectedPanelCount||project.roofCapacity?.finalPanelCount||"—"} panels · ${project.roofCapacity?.panel?.wattage||"—"} W/module`,PAGE_W/2+8,y+44);

    doc.setTextColor(255,255,255); doc.setFont("helvetica","bold"); doc.setFontSize(10); doc.text("PRICE & SUBSIDY SUMMARY",MARGIN,175);
    const bw=(PAGE_W-MARGIN*2-8)/3;
    kpiCard(doc,MARGIN,183,bw,30,"SYSTEM PRICE",fmtINR(gross),[255,255,255]);
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
      ["Annual Solar Generation",`${Math.round(sys.generation?.annualKWh||project.generationSummary?.annualKWh||0).toLocaleString("en-IN")} kWh`,`Solar Coverage",eb.solarCoveragePct!=null?`${Number(eb.solarCoveragePct).toFixed(1)}%`:"—"]
    ];
    y=compactTable(doc,["Site Parameter","Value","Site Parameter","Value"],rows,y,[38,55,38,55],7.2)+6;
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
    if(mrows.length) y=compactTable(doc,["Month","Usage kWh","Solar kWh","Solar Used","Surplus","Deficit","Current Bill","Post-Solar","Savings"],mrows,y,[18,18,18,18,18,18,22,22,22],6.3)+5;
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
    y=bulletList(doc,(project.terms&&project.terms.length?project.terms:DEFAULT_TERMS),MARGIN,y,{size:7.5})+4;
    y=sectionBar(doc,"PAYMENT TERMS",y);
    y=bulletList(doc,cfg.quotationMeta?.paymentMilestones||[],MARGIN,y,{size:7.5,dotColor:GOLD})+4;
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
    bulletList(doc,notes,MARGIN,y,{size:7.5,dotColor:TEAL});
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
'''
s=s[:insert_pos]+newfunc+s[insert_pos:]
p.write_text(s)

# style.css: add optional quotation-preview/print-safe styles for any HTML preview using the same executive sections.
p=base/'style.css'; s=p.read_text()
s += '''\n\n/* Executive quotation preview / print helpers (PDF itself is rendered by jsPDF). */\n.quotation-executive-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;}\n.quotation-kpi{padding:14px;border:1px solid #dce4df;border-radius:12px;background:linear-gradient(145deg,#fff,#f5faf7);}\n.quotation-kpi .label{font-size:.72rem;color:#6e7680;text-transform:uppercase;letter-spacing:.05em;}\n.quotation-kpi .value{display:block;margin-top:5px;font-size:1.15rem;font-weight:800;color:#1b4332;}\n.quotation-page-section{break-inside:avoid;page-break-inside:avoid;margin-bottom:12px;}\n@media print{.quotation-page-section{break-inside:avoid;page-break-inside:avoid}.quotation-executive-grid{grid-template-columns:repeat(4,1fr)}}\n@media(max-width:700px){.quotation-executive-grid{grid-template-columns:repeat(2,minmax(0,1fr));}}\n'''
p.write_text(s)
