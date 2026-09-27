/* ==========================================================================
   app.js — wires the step wizard UI to the calculation modules. No pricing,
   sizing, or geometry logic lives here — only DOM plumbing and orchestration.
   ========================================================================== */
window.SolarApp = window.SolarApp || {};

SolarApp.App = (function () {
  const STEPS = [
    { n: 1, label: "Customer" }, { n: 2, label: "Location" }, { n: 3, label: "Roof" },
    { n: 4, label: "Electricity" }, { n: 5, label: "Solar" }, { n: 6, label: "Battery" },
    { n: 7, label: "Pricing" }, { n: 8, label: "Comparison" }, { n: 9, label: "Quotation" },
  ];

  const state = {
    currentStep: 1,
    maxStepReached: 1,
    footprintSummary: null,   // from SolarApp.Geo.summarize()
    roofCapacity: null,       // from SolarApp.RoofLayout.computeRoofCapacity()
    consumption: null,        // from SolarApp.Sizing.consumptionStats()
    climatology: null,        // from SolarApp.Climate.fetchClimatology()
    sizing: null,             // from SolarApp.Sizing.recommendCapacity()
    generation: null,         // from SolarApp.Generation.computeGeneration()
    batteryPreview: null,
    panelRecommendation: null,
    onGrid: null, hybrid: null, offGrid: null, comparison: null, warnings: [],
    quotationNumber: null,
    utilityHistory: [],
    energyBalance: null,
    systemType: "on-grid",
    loadType: "essential",
    backupHours: 4,
    bessSimulation: null,
    solarResourceAPI: null,
  };

  // ---------------- Stepper ----------------
  function renderStepper() {
    const el = document.getElementById("stepper");
    el.innerHTML = STEPS.map(s => {
      const cls = s.n === state.currentStep ? "active" : (s.n < state.maxStepReached || s.n < state.currentStep ? "done" : "");
      return `<button type="button" class="step-pill ${cls}" data-goto="${s.n}"><span class="num">${String(s.n).padStart(2,"0")}</span> ${s.label}</button>`;
    }).join("");
    el.querySelectorAll("[data-goto]").forEach(btn => {
      btn.addEventListener("click", () => goToStep(parseInt(btn.dataset.goto, 10)));
    });
  }

  function goToStep(n) {
    state.currentStep = n;
    state.maxStepReached = Math.max(state.maxStepReached, n);
    document.querySelectorAll(".wizard-step").forEach(sec => {
      sec.classList.toggle("active", parseInt(sec.dataset.step, 10) === n);
    });
    renderStepper();
    window.scrollTo({ top: document.querySelector(".wizard-shell").offsetTop - 10, behavior: "smooth" });
    if (n === 3) syncRoofStepDefaults();
    if (n === 7) syncPricingStepDefaults();
  }

  // ---------------- Init ----------------
  function init() {
    const cfg = SolarApp.Config.get();
    SolarApp.SettingsUI.wireEvents();

    // Quotation number + date default
    state.quotationNumber = SolarApp.Config.nextQuotationNumber();
    document.getElementById("custQuoteNumber").value = state.quotationNumber;
    document.getElementById("finalQuoteNumber").value = state.quotationNumber;
    document.getElementById("custDate").value = new Date().toISOString().slice(0, 10);
    document.getElementById("termsTextarea").value = SolarApp.PDF.DEFAULT_TERMS.join("\n");

    populateSelects(cfg);
    const capSel=document.getElementById("customerCapacityMode"), kwSel=document.getElementById("customerRequestedKW");
    if(capSel) capSel.value="customer"; if(kwSel) kwSel.value=String(cfg.roof?.defaultSystemKW||3);
    renderStepper();
    goToStep(1);

    SolarApp.MapView.init("siteMap");
    SolarApp.MapView.onFootprintDrawn = onFootprintReady;

    wireFootprintUpload();
    wireLocationExtras();
    wireConsumptionStep();
    wireUtilityLookup();
    ["importValueRate","exportValueRate","degradationRate"].forEach(id=>{const el=document.getElementById(id);if(el)el.addEventListener("input",()=>renderEnergyBalance());});
    wireRoofStep();
    wireSolarSystemStep();
    wireSystemSelection();
    wireBatteryStep();
    wirePricingStep();
    wireComparisonStep();
    wireQuotationStep();
  }

  function populateSelects(cfg) {
    const panelSelect = document.getElementById("panelSelect");
    // One professional product selector: every available module is a selectable
    // commercial product. No separate "reference" group is shown to customers.
    panelSelect.innerHTML = cfg.panels.map(p => {
      const power = p.wattageLabel || (p.wattage ? `${p.wattage}W` : "W required");
      const status = (!p.wattage || !p.lengthMM || !p.widthMM || !p.pricePerPanel) ? " · datasheet/price to configure" : "";
      return `<option value="${p.id}">${p.manufacturer} ${p.model} (${power})${status}</option>`;
    }).join("");
    panelSelect.value = cfg.defaultPanelId;

    const batterySelect = document.getElementById("batterySelect");
    batterySelect.innerHTML = cfg.batteries.map(b => `<option value="${b.id}">${b.manufacturer} ${b.model} (${b.capacityKWh}kWh)</option>`).join("");
    batterySelect.value = cfg.defaultBatteryId;
    renderProductCatalogs(cfg);
  }

  function money(v) { return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(v) || 0); }

  function renderProductCatalogs(cfg) {
    const pt = document.getElementById("panelCatalogueTable");
    if (pt) {
      pt.innerHTML = `<thead><tr><th>Brand</th><th>Model</th><th>Capacity</th><th>Size (mm)</th><th>Area</th><th>Quote Price</th><th>Commercial Range</th><th>Warranty</th></tr></thead><tbody>${cfg.panels.map(p => {
        const area = ((Number(p.lengthMM)||0)*(Number(p.widthMM)||0)/1e6);
        const power = p.wattageLabel || (p.wattage ? `${p.wattage} W` : "Data required");
        const size = (p.lengthMM && p.widthMM) ? `${p.lengthMM} × ${p.widthMM}${p.thicknessMM ? ` × ${p.thicknessMM}` : ""}` : "Not supplied";
        const range = (p.priceMin && p.priceMax) ? `${money(p.priceMin)} – ${money(p.priceMax)}` : (p.pricePerPanel ? money(p.pricePerPanel) : "Dealer quote required");
        return `<tr><td>${p.manufacturer}</td><td>${p.model}</td><td>${power}</td><td>${size}</td><td>${area ? area.toFixed(2)+" m²" : "—"}</td><td>${range}</td><td>${p.warrantyYears || "—"} yr</td></tr>`;
      }).join("")}</tbody>`;
    }
    const bt = document.getElementById("batteryCatalogueTable");
    if (bt) {
      bt.innerHTML = `<thead><tr><th>Brand</th><th>Model</th><th>Battery Type</th><th>Voltage</th><th>Capacity</th><th>DoD</th><th>Cycles</th><th>Warranty</th><th>Configured Price</th></tr></thead><tbody>${cfg.batteries.map(b => `<tr><td>${b.manufacturer}</td><td>${b.model}</td><td>${b.chemistry}</td><td>${b.voltage || "—"} V</td><td>${b.capacityKWh} kWh</td><td>${b.dodPct}%</td><td>${b.cycleLife || "—"}</td><td>${b.warrantyYears || "—"} yr</td><td>${money(b.price)}</td></tr>`).join("")}</tbody>`;
    }
    const p = cfg.panels.find(x => x.id === (document.getElementById("panelSelect")?.value)) || cfg.panels[0];
    const b = cfg.batteries.find(x => x.id === (document.getElementById("batterySelect")?.value)) || cfg.batteries[0];
    renderSelectedPanel(p); renderSelectedBattery(b);
    renderEngineeringCommercialSnapshot(cfg, p);
  }

  function renderEngineeringCommercialSnapshot(cfg, p) {
    const el = document.getElementById("engineeringCommercialSnapshot");
    if (!el || !p) return;
    const area = ((Number(p.lengthMM)||0)*(Number(p.widthMM)||0)/1e6);
    const ppwp = p.wattage && p.pricePerPanel ? p.pricePerPanel / p.wattage : 0;
    const areaKwp = p.wattage && area ? area / (p.wattage/1000) : 0;
    const completeness = [p.wattage, p.lengthMM, p.widthMM, p.pricePerPanel].every(v => Number(v) > 0);
    el.innerHTML = `<div class="commercial-snapshot-head"><div><span class="eyebrow">Engineering + Commercial</span><h3>Selected Panel Details</h3></div><span class="status-pill ${completeness ? 'status-ready' : 'status-config'}">${completeness ? 'Ready for Design' : 'Configure Data'}</span></div>
      <div class="snapshot-grid">
        <div><small>Panel Capacity</small><strong>${p.wattageLabel || (p.wattage ? p.wattage+' W' : '—')}</strong></div>
        <div><small>Efficiency</small><strong>${p.efficiencyPct ? p.efficiencyPct+'%' : '—'}</strong></div>
        <div><small>Panel Pricing</small><strong>${p.pricePerPanel ? money(p.pricePerPanel) : '—'}</strong></div>
        <div><small>₹/Wp</small><strong>${ppwp ? money(ppwp) : '—'}</strong></div>
        <div><small>Panel Area</small><strong>${area ? area.toFixed(3)+' m²' : '—'}</strong></div>
        <div><small>Area / kWp</small><strong>${areaKwp ? areaKwp.toFixed(2)+' m²/kWp' : '—'}</strong></div>
        <div><small>Warranty</small><strong>${p.warrantyYears ? p.warrantyYears+' yr' : '—'}</strong></div>
        <div><small>Dimensions</small><strong>${p.lengthMM && p.widthMM ? `${p.lengthMM} × ${p.widthMM} mm` : 'Datasheet required'}</strong></div>
      </div>`;
  }

  function renderSelectedPanel(p) {
    const el = document.getElementById("selectedPanelDetails"); if (!el || !p) return;
    const area = ((Number(p.lengthMM)||0)*(Number(p.widthMM)||0)/1e6);
    const perWp = p.wattage && p.pricePerPanel ? (p.pricePerPanel/p.wattage) : 0;
    const range = (p.priceMin && p.priceMax) ? `${money(p.priceMin)} – ${money(p.priceMax)}` : "Not supplied";
    const power = p.wattageLabel || (p.wattage ? `${p.wattage} W` : "Reference / exact wattage required");
    const size = (p.lengthMM && p.widthMM) ? `${p.lengthMM} × ${p.widthMM}${p.thicknessMM ? ` × ${p.thicknessMM}` : ""} mm` : "Model dimensions not supplied";
    const complete = !!(p.wattage && p.lengthMM && p.widthMM && p.pricePerPanel);
    const dataStatus = complete ? "Technical dimensions + commercial pricing configured" : "Confirm manufacturer datasheet and dealer price before final design / quotation";
    el.innerHTML = `<div class="catalog-title">Selected Panel — ${p.manufacturer} ${p.model}</div><div class="catalog-grid">
      <div class="catalog-kpi"><small>Capacity</small><b>${power}</b></div>
      <div class="catalog-kpi"><small>Physical Size</small><b>${size}</b></div>
      <div class="catalog-kpi"><small>Panel Area</small><b>${area ? area.toFixed(3)+" m²" : "Exact dimensions required"}</b></div>
      <div class="catalog-kpi"><small>Quotation Price</small><b>${p.pricePerPanel ? money(p.pricePerPanel)+(perWp ? ` (${money(perWp)}/Wp)` : "") : "Exact pricing required"}</b></div>
      <div class="catalog-kpi"><small>Reference Price Range</small><b>${range}</b></div>
      <div class="catalog-kpi"><small>Efficiency</small><b>${p.efficiencyPct || "—"}%</b></div>
      <div class="catalog-kpi"><small>Warranty</small><b>${p.warrantyYears || "—"} years</b></div>
      <div class="catalog-kpi"><small>Area / kWp</small><b>${p.wattage && area ? (area/(p.wattage/1000)).toFixed(2)+" m²/kWp" : "—"}</b></div>
    </div><div class="disclaimer" style="margin-top:8px;">${dataStatus}</div>`;
  }

  function renderSelectedBattery(b) {
    const el = document.getElementById("selectedBatteryDetails"); if (!el || !b) return;
    const usable = b.capacityKWh * (b.dodPct/100) * (b.roundtripEffPct/100);
    el.innerHTML = `<div class="catalog-title">Selected Battery — ${b.manufacturer} ${b.model}</div><div class="catalog-grid">
      <div class="catalog-kpi"><small>Battery Type</small><b>${b.chemistry}</b></div>
      <div class="catalog-kpi"><small>Capacity</small><b>${b.capacityKWh} kWh</b></div>
      <div class="catalog-kpi"><small>Voltage</small><b>${b.voltage || "—"} V</b></div>
      <div class="catalog-kpi"><small>Usable Energy per Unit</small><b>${usable.toFixed(2)} kWh</b></div>
      <div class="catalog-kpi"><small>DoD</small><b>${b.dodPct}%</b></div>
      <div class="catalog-kpi"><small>Round-trip Efficiency</small><b>${b.roundtripEffPct || "—"}%</b></div>
      <div class="catalog-kpi"><small>Cycle life</small><b>${b.cycleLife || "—"}</b></div>
      <div class="catalog-kpi"><small>Configured Price</small><b>${money(b.price)}</b></div>
    </div><div class="disclaimer" style="margin-top:8px;">Battery pricing/specifications are editable EPC catalogue values. Confirm dealer/manufacturer pricing before final quotation.</div>`;
  }


  // ---------------- Panel recommendation engine ----------------
  function panelEngineeringScore(row) {
    // Lower is better. Roof fit and complete verified configuration dominate;
    // cost/area/count are tie-breakers rather than a hidden "brand ranking".
    const fitPenalty = row.fit ? 0 : 1e6;
    const configPenalty = row.complete ? 0 : 1e5;
    const countPenalty = row.panelCount * 100;
    const areaPenalty = row.areaM2 * 10;
    const costPenalty = row.totalPanelCost > 0 ? row.totalPanelCost / 100 : 1e4;
    const wpPenalty = row.costPerWp > 0 ? row.costPerWp * 100 : 1e4;
    return fitPenalty + configPenalty + countPenalty + areaPenalty + costPenalty + wpPenalty;
  }

  function calculatePanelOptions(targetKW) {
    const cfg = SolarApp.Config.get();
    const rc = state.footprintSummary;
    if (!rc || !Number.isFinite(targetKW) || targetKW <= 0) return [];
    return cfg.panels.map(p => {
      const complete = Number(p.wattage) > 0 && Number(p.lengthMM) > 0 && Number(p.widthMM) > 0 && Number(p.pricePerPanel) > 0;
      if (!complete) return {
        panel:p, complete:false, fit:false, panelCount:0, actualKW:0, areaM2:0,
        totalPanelCost:0, costPerWp:0, layoutAreaM2:Infinity, reason:"Missing exact wattage, dimensions or configured price"
      };
      const panelCount = Math.ceil(targetKW * 1000 / p.wattage);
      const actualKW = panelCount * p.wattage / 1000;
      const roofCfg = {
        utilizationPct:numVal("utilizationPct"), edgeSetbackM:numVal("edgeSetbackM"),
        parapetSetbackM:numVal("parapetSetbackM"), walkwayWidthM:numVal("walkwayWidthM"),
        rowSpacingM:numVal("rowSpacingM"), columnSpacingM:numVal("columnSpacingM"),
        panelOrientation:document.getElementById("panelOrientation").value
      };
      const candidate = SolarApp.RoofLayout.computeRoofCapacity(rc,p,roofCfg,{mode:"customer",requestedKW:targetKW});
      const fit = candidate.fitStatus === "FITS ON USABLE ROOF";
      const layoutAreaM2 = Number.isFinite(candidate.selectedLayoutAreaM2) ? candidate.selectedLayoutAreaM2 : Infinity;
      const areaM2 = panelCount * p.lengthMM * p.widthMM / 1e6;
      const totalPanelCost = panelCount * p.pricePerPanel;
      const costPerWp = totalPanelCost / (actualKW * 1000);
      return {
        panel:p, complete:true, fit, panelCount, actualKW, areaM2, layoutAreaM2,
        totalPanelCost, costPerWp,
        reason:fit ? "Fits configured roof geometry" : "Does not fit current usable roof geometry"
      };
    }).map(r => ({...r, score:panelEngineeringScore(r)}))
      .sort((a,b) => a.score-b.score || a.costPerWp-b.costPerWp);
  }

  function renderPanelRecommendation(targetKW) {
    const table = document.getElementById("panelRecommendationTable");
    const summary = document.getElementById("panelRecommendationSummary");
    const status = document.getElementById("panelRecommendationStatus");
    if (!table || !summary || !status) return;
    const options = calculatePanelOptions(targetKW);
    state.panelRecommendation = options;
    if (!options.length) {
      status.textContent = "Roof details are required";
      summary.innerHTML = `<div class="disclaimer">Upload/draw the roof and enter a valid system size first.</div>`;
      table.innerHTML = "";
      return;
    }
    const viable = options.filter(o => o.complete && o.fit);
    const rec = viable[0] || options.find(o => o.complete) || options[0];
    if (!rec.complete) {
      status.textContent = "Technical data required";
      summary.innerHTML = `<div class="catalog-title">No fully configured module is currently available for an engineering recommendation.</div>`;
    } else {
      status.textContent = rec.fit ? "Automatic recommendation" : "Check roof fit";
      const fitText = rec.fit ? "Fits the current usable roof" : "No configured module fits this capacity on the current roof";
      summary.innerHTML = `<div class="catalog-title">Recommended Panel ${targetKW.toFixed(1)} kW target</div>
        <div class="catalog-grid">
          <div class="catalog-kpi"><small>Suggested</small><b>${rec.panel.manufacturer} ${rec.panel.model}</b></div>
          <div class="catalog-kpi"><small>Panels</small><b>${rec.panelCount} × ${rec.panel.wattage} W</b></div>
          <div class="catalog-kpi"><small>Actual DC Capacity</small><b>${rec.actualKW.toFixed(2)} kWp</b></div>
          <div class="catalog-kpi"><small>Panel Cost</small><b>${money(rec.totalPanelCost)}</b></div>
          <div class="catalog-kpi"><small>₹/Wp</small><b>${money(rec.costPerWp)}</b></div>
          <div class="catalog-kpi"><small>Roof Status</small><b>${fitText}</b></div>
        </div>
        <div class="disclaimer" style="margin-top:8px;">Selection method: roof fit → complete technical/pricing data → panel count/array area → configured panel cost. If the customer requires a specific brand, the panel can be selected manually.</div>`;
    }
    table.innerHTML = `<thead><tr><th>Use</th><th>Brand / Model</th><th>Capacity</th><th>Panels</th><th>Actual kWp</th><th>Roof</th><th>Array Area</th><th>Panel Cost</th><th>₹/Wp</th><th>Efficiency</th></tr></thead>
      <tbody>${options.map(o => `<tr class="${o===rec?'panel-rec-row':''}">
        <td>${o===rec?'<span class="badge badge-ongrid">Recommendation</span>':'—'}</td>
        <td>${o.panel.manufacturer} ${o.panel.model}</td>
        <td>${o.panel.wattage ? o.panel.wattage+' W' : (o.panel.wattageLabel||'—')}</td>
        <td>${o.panelCount||'—'}</td>
        <td>${o.actualKW ? o.actualKW.toFixed(2) : '—'}</td>
        <td>${o.complete ? (o.fit?'✓ Fits':'✕ Check') : 'Data required'}</td>
        <td>${Number.isFinite(o.layoutAreaM2)?o.layoutAreaM2.toFixed(2)+' m²':'—'}</td>
        <td>${o.totalPanelCost?money(o.totalPanelCost):'—'}</td>
        <td>${o.costPerWp?money(o.costPerWp):'—'}</td>
        <td>${o.panel.efficiencyPct?o.panel.efficiencyPct+'%':'—'}</td>
      </tr>`).join("")}</tbody>`;
  }

  function autoApplyPanelRecommendation(targetKW) {
    const options = calculatePanelOptions(targetKW);
    const rec = options.find(o => o.complete && o.fit) || options.find(o => o.complete);
    if (!rec) return false;
    const select = document.getElementById("panelSelect");
    if (select && select.value !== rec.panel.id) {
      select.value = rec.panel.id;
      renderSelectedPanel(rec.panel);
      renderProductCatalogs(SolarApp.Config.get());
    }
    state.panelRecommendation = options;
    return true;
  }

  function onSettingsSaved() {
    // Re-populate dropdowns in case panel/battery lists changed; keep current selections if still valid.
    const cfg = SolarApp.Config.get();
    const curPanel = document.getElementById("panelSelect").value;
    const curBattery = document.getElementById("batterySelect").value;
    populateSelects(cfg);
    if (cfg.panels.some(p => p.id === curPanel)) document.getElementById("panelSelect").value = curPanel;
    if (cfg.batteries.some(b => b.id === curBattery)) document.getElementById("batterySelect").value = curBattery;
    renderProductCatalogs(cfg);
  }

  // ---------------- Step 2: Manual city search / optional footprint ----------------
  let citySearchTimer = null;
  function wireCityAutocomplete() {
    const input = document.getElementById("custCity");
    const results = document.getElementById("citySearchResults");
    const status = document.getElementById("geocodeStatus");
    if (!input) return;
    const render = (items) => {
      if (!results) return;
      results.innerHTML = items.map((x,i)=>`<button type="button" class="city-result" data-index="${i}"><strong>${SolarApp.Utility.escapeHtml ? SolarApp.Utility.escapeHtml(x.display_name.split(",")[0]) : x.display_name.split(",")[0]}</strong><span>${x.display_name}</span></button>`).join("");
      results.querySelectorAll(".city-result").forEach(btn=>btn.addEventListener("click",()=>{
        const x=items[Number(btn.dataset.index)];
        setVal("custCity", x.address?.city || x.address?.town || x.address?.municipality || x.address?.village || x.display_name.split(",")[0]);
        setVal("lat", Number(x.lat).toFixed(6));
        setVal("lon", Number(x.lon).toFixed(6));
        if (x.address?.state_district) setVal("custDistrict", x.address.state_district);
        if (x.address?.postcode) setVal("custPincode", x.address.postcode);
        if (status) status.textContent=`OpenStreetMap location selected: ${Number(x.lat).toFixed(6)}, ${Number(x.lon).toFixed(6)}.`;
        results.innerHTML="";
        try { SolarApp.MapView.centerOn(Number(x.lat), Number(x.lon), 14); } catch(e) {}
        renderSiteAccuracy();
      }));
    };
    input.addEventListener("input",()=>{
      clearTimeout(citySearchTimer);
      const q=input.value.trim();
      if (results) results.innerHTML="";
      if (q.length<3) { if(status) status.textContent="Type at least 3 characters to search OpenStreetMap."; return; }
      if(status) status.textContent="Searching OpenStreetMap…";
      citySearchTimer=setTimeout(async()=>{
        try {
          const items=await SolarApp.Geo.searchCity(q);
          render(items);
          if(status) status.textContent=items.length?"Select a city from the search results.":"No city found. Try a broader city/town name.";
        } catch(e) { if(status) status.textContent="City search failed. You can enter Latitude/Longitude manually."; }
      },450);
    });
  }

  function ensureLocation() {
    const lat = numVal("lat"), lon = numVal("lon");
    return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
  }

  function createRoofFromDimensions() {
    const L = numVal("roofLengthM"), W = numVal("roofWidthM");
    if (!(L > 0) || !(W > 0)) { alert("Enter roof length and width when no KML is available."); return; }
    if (!ensureLocation()) { alert("Enter a city and select a location result, or enter Latitude and Longitude manually, before creating a dimension-based roof footprint."); return; }
    const lat = numVal("lat"), lon = numVal("lon");
    const R = 6371000;
    const dLat = (W / 2 / R) * 180 / Math.PI;
    const dLon = (L / 2 / (R * Math.cos(lat * Math.PI / 180))) * 180 / Math.PI;
    const poly = [[lon-dLon,lat-dLat],[lon+dLon,lat-dLat],[lon+dLon,lat+dLat],[lon-dLon,lat+dLat],[lon-dLon,lat-dLat]];
    onFootprintReady([poly], `Roof dimensions ${L} × ${W} m`);
  }

  function renderSiteAccuracy() {
    const status=document.getElementById("siteAccuracyStatus"), note=document.getElementById("siteAccuracyNote");
    if(!status || !note) return;
    let score=0, notes=[];
    const lat= numVal("lat"), lon=numVal("lon");
    if(Number.isFinite(lat)&&Number.isFinite(lon)) { score+=25; notes.push("coordinates available"); } else notes.push("exact coordinates missing");
    if(state.footprintSummary) { score+=40; notes.push(state.footprintSummary.isFallback ? "300 sq.ft default roof" : "roof footprint available"); } else if(numVal("roofLengthM")>0&&numVal("roofWidthM")>0) { score+=25; notes.push("dimension-based roof"); } else notes.push("roof footprint optional — 300 sq.ft default available");
    if(val("roofOrientation") && val("roofTilt")) score+=10;
    if(val("shadowObstacles") === "No" && val("treeObstruction") === "No") score+=5; else notes.push("shading inputs should be verified on site");
    if(state.gsaBenchmark?.pvoutSpecific) { score+=20; notes.push("GSA/Solargis PVOUT benchmark available"); } else notes.push("add a GSA/Solargis PVOUT benchmark for stronger generation validation");
    score=Math.min(100,score);
    status.textContent=score>=85?"High":score>=65?"Good":score>=45?"Moderate":"Preliminary";
    note.textContent=`Accuracy readiness: ${score}/100. ${notes.join("; ")}. Exact rooftop coordinates, KML/GeoJSON footprint, measured shading and a site-specific GSA/PVOUT benchmark improve the estimate.`;
  }

  function wireLocationExtras() {
    wireCityAutocomplete();
    ["custCity","custDistrict","lat","lon","roofLengthM","roofWidthM","roofOrientation","roofTilt","shadowObstacles","treeObstruction"].forEach(id=>{
      const el=document.getElementById(id); if(el) el.addEventListener("input",renderSiteAccuracy);
      if(el) el.addEventListener("change",renderSiteAccuracy);
    });
    const createBtn = document.getElementById("createRoofFromDimensionsBtn");
    if (createBtn) createBtn.addEventListener("click", createRoofFromDimensions);
  }

  // ---------------- Step 2: Footprint ----------------
  function wireFootprintUpload() {
    document.getElementById("footprintFile").addEventListener("change", async (e) => {
      const file = e.target.files[0];
      const hint = document.getElementById("footprintHint");
      if (!file) return;
      hint.style.color = ""; hint.textContent = "Reading " + file.name + "…";
      try {
        const polygons = await SolarApp.Geo.readFootprintFile(file);
        onFootprintReady(polygons, file.name);
      } catch (err) {
        hint.style.color = "#E8654B";
        hint.textContent = "Couldn't read " + file.name + ": " + err.message;
      }
    });
  }

  function onFootprintReady(polygons, sourceName) {
    const summary = SolarApp.Geo.summarize(polygons);
    state.footprintSummary = summary;

    document.getElementById("lat").value = summary.centroid.lat.toFixed(6);
    document.getElementById("lon").value = summary.centroid.lon.toFixed(6);

    const hint = document.getElementById("footprintHint");
    hint.style.color = "#3FB8AF";
    hint.textContent = `✓ ${sourceName ? "Loaded from " + sourceName : "Footprint drawn"} — area ${summary.areaM2.toFixed(1)} m² (${summary.areaSqFt.toFixed(0)} sq.ft), perimeter ${summary.perimeterM.toFixed(1)} m`;

    document.getElementById("areaReadout").textContent =
      `Footprint area — ${summary.areaM2.toFixed(1)} m² (${summary.areaSqFt.toFixed(0)} sq ft) · perimeter ${summary.perimeterM.toFixed(1)} m · ${polygons.length} polygon(s)`;

    try { SolarApp.MapView.showFootprint(polygons); } catch (e) { console.warn("Map preview failed:", e); }

    // Step 3 summary cards
    document.getElementById("roofAreaDisplay").textContent = summary.areaM2.toFixed(1) + " m²";
    document.getElementById("roofAreaSqftDisplay").textContent = summary.areaSqFt.toFixed(0) + " sq.ft";
    document.getElementById("perimeterDisplay").textContent = summary.perimeterM.toFixed(1) + " m";
    document.getElementById("roofLatLonDisplay").textContent = `${summary.centroid.lat.toFixed(6)}, ${summary.centroid.lon.toFixed(6)}`;
  }

  // ---------------- Step 3: Roof capacity & layout ----------------
  function syncRoofStepDefaults() {
    const cfg = SolarApp.Config.get();
    setValIfEmpty("utilizationPct", cfg.roof.utilizationPct);
    setValIfEmpty("edgeSetbackM", cfg.roof.edgeSetbackM);
    setValIfEmpty("parapetSetbackM", cfg.roof.parapetSetbackM);
    setValIfEmpty("walkwayWidthM", cfg.roof.walkwayWidthM);
    setValIfEmpty("rowSpacingM", cfg.roof.rowSpacingM);
    setValIfEmpty("columnSpacingM", cfg.roof.columnSpacingM);
  }
  function setValIfEmpty(id, v) { const el = document.getElementById(id); if (el && el.value === "") el.value = v; }

  function getCustomerCapacityRequest() {
    const mode = val("customerCapacityMode") || "auto";
    if (mode !== "customer") return { mode: "auto" };
    const choice = val("customerRequestedKW");
    const requestedKW = choice === "custom" ? numVal("customerCustomKW") : parseFloat(choice);
    return { mode: "customer", requestedKW };
  }

  function renderRoofCapacity(rc) {
    document.getElementById("usableAreaDisplay").textContent = rc.usableAreaM2.toFixed(1) + " m²";
    const lay = rc.customerMode ? rc.selectedLayout : rc.packing;
    document.getElementById("rowsColsDisplay").textContent = `${lay.rows || 0} × ${lay.cols || 0} (${lay.orientation || rc.packing.orientation})`;
    document.getElementById("finalPanelCountDisplay").textContent = (rc.customerMode ? rc.selectedPanelCount : rc.finalPanelCount) + " panels";
    document.getElementById("finalCapacityDisplay").textContent = (rc.customerMode ? rc.selectedCapacityKW : rc.finalCapacityKW).toFixed(2) + " kWp";
    document.getElementById("usedAreaDisplay").textContent = (rc.customerMode ? rc.selectedSurfaceAreaM2 : rc.usedAreaM2).toFixed(2) + " m²";
    document.getElementById("layoutAreaDisplay").textContent = Number.isFinite(rc.customerMode ? rc.selectedLayoutAreaM2 : rc.packing.layoutAreaM2) ? (rc.customerMode ? rc.selectedLayoutAreaM2 : rc.packing.layoutAreaM2).toFixed(2) + " m²" : "Does not fit";
    document.getElementById("remainingAreaDisplay").textContent = (rc.customerMode ? rc.remainingUsableAreaM2 : rc.remainingAreaM2).toFixed(2) + " m²";
    document.getElementById("customerSystemDisplay").textContent = rc.customerMode ? `${rc.requestedCapacityKW.toFixed(1)} kW requested → ${rc.selectedPanelCount} × ${rc.panel.wattage}W = ${rc.selectedCapacityKW.toFixed(2)} kWp` : "Auto recommended";
    renderStructureReference(rc.customerMode ? rc.requestedCapacityKW : rc.finalCapacityKW, rc.panel.wattage);
    renderCustomerSavings();
    document.getElementById("roofFitStatusDisplay").textContent = rc.customerMode ? rc.fitStatus : "AUTO / MAXIMUM CAPACITY";
    document.getElementById("panelGeometryDisplay").textContent = `Panel: ${rc.panel.lengthMM} × ${rc.panel.widthMM} mm (${(rc.panel.lengthMM/1000).toFixed(3)} × ${(rc.panel.widthMM/1000).toFixed(3)} m) · ${rc.panelAreaM2.toFixed(3)} m²/panel · Panel surface area is separate from array layout area.`;
    renderSelectedPanel(rc.panel);
  }


  function createDefaultRoofForSizing() {
    if (state.footprintSummary) return state.footprintSummary;
    const cfg = SolarApp.Config.get();
    const L = Number(cfg.roof?.fallbackRoofLengthM) || 6.096;
    const W = Number(cfg.roof?.fallbackRoofWidthM) || 4.572;
    let lat = numVal("lat"), lon = numVal("lon");
    if (!ensureLocation()) return null;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    const R=6371000, dLat=(W/2/R)*180/Math.PI, dLon=(L/2/(R*Math.cos(lat*Math.PI/180)))*180/Math.PI;
    const poly=[[lon-dLon,lat-dLat],[lon+dLon,lat-dLat],[lon+dLon,lat+dLat],[lon-dLon,lat+dLat],[lon-dLon,lat-dLat]];
    const summary=SolarApp.Geo.summarize([poly]);
    summary.isFallback=true;
    summary.areaM2 = Number(cfg.roof?.fallbackRoofAreaSqFt||300)/10.7639;
    summary.areaSqFt = Number(cfg.roof?.fallbackRoofAreaSqFt||300);
    state.footprintSummary=summary;
    try { SolarApp.MapView.showFootprint([poly]); } catch(e) {}
    const areaEl=document.getElementById("areaReadout"); if(areaEl) areaEl.textContent=`Preliminary default roof: ${summary.areaSqFt.toFixed(0)} sq.ft (${summary.areaM2.toFixed(2)} m²). Replace with actual roof data for final design.`;
    const roofArea=document.getElementById("roofAreaDisplay"); if(roofArea) roofArea.textContent=summary.areaM2.toFixed(1)+" m² (default)";
    renderSiteAccuracy();
    return summary;
  }

  function wireRoofStep() {
    const modeEl = document.getElementById("customerCapacityMode");
    const reqEl = document.getElementById("customerRequestedKW");
    const customWrap = document.getElementById("customerCustomKWWrap");
    const reqWrap = document.getElementById("customerKWWrap");
    modeEl.addEventListener("change", () => {
      const customer = modeEl.value === "customer";
      reqWrap.style.display = customer ? "" : "none";
      customWrap.style.display = customer && reqEl.value === "custom" ? "" : "none";
      const target = customer ? (reqEl.value === "custom" ? numVal("customerCustomKW") : parseFloat(reqEl.value)) : null;
      if (target > 0) renderPanelRecommendation(target);
    });
    reqEl.addEventListener("change", () => {
      customWrap.style.display = reqEl.value === "custom" ? "" : "none";
      const target = reqEl.value === "custom" ? numVal("customerCustomKW") : parseFloat(reqEl.value);
      if (target > 0) renderPanelRecommendation(target);
    });
    document.getElementById("customerCustomKW").addEventListener("input", () => {
      const target = numVal("customerCustomKW"); if (target > 0) renderPanelRecommendation(target);
    });
    document.getElementById("panelSelect").addEventListener("change", () => {
      const cfg = SolarApp.Config.get();
      const p = cfg.panels.find(x => x.id === document.getElementById("panelSelect").value) || cfg.panels[0];
      renderSelectedPanel(p);
      renderProductCatalogs(cfg);
    });

    ["customerCapacityMode","customerRequestedKW","customerCustomKW","panelSelect"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener("change", () => {
        const req = getCustomerCapacityRequest();
        const target = req.mode === "customer" ? req.requestedKW : (state.sizing?.recommendedKW || state.roofCapacity?.finalCapacityKW || 1);
        renderStructureReference(target, SolarApp.Config.get().panels.find(p => p.id === document.getElementById("panelSelect")?.value)?.wattage || 500);
        if (state.footprintSummary) renderPanelRecommendation(target);
      });
    });

    document.getElementById("calcRoofBtn").addEventListener("click", () => {
      if (!state.footprintSummary) { createDefaultRoofForSizing(); }
      if (!state.footprintSummary) { alert("Select a city or enter Latitude/Longitude. The app can then use the 300 sq.ft default roof for preliminary 3 kW sizing."); return; }
      const cfg = SolarApp.Config.get();
      const request = getCustomerCapacityRequest().mode === "auto" ? {mode:"customer", requestedKW:Number(SolarApp.Config.get().roof?.defaultSystemKW||3)} : getCustomerCapacityRequest();
      if (request.mode === "customer") autoApplyPanelRecommendation(request.requestedKW);
      const panel = cfg.panels.find(p => p.id === document.getElementById("panelSelect").value) || cfg.panels[0];
      if (!Number(panel.wattage) || !Number(panel.lengthMM) || !Number(panel.widthMM) || !Number(panel.pricePerPanel)) {
        renderSelectedPanel(panel);
        alert("This selected module needs complete technical and commercial configuration. Open Settings → Panels and enter the exact manufacturer datasheet values and dealer quotation price before calculating roof capacity.");
        return;
      }
      const roofCfg = { utilizationPct: numVal("utilizationPct"), edgeSetbackM: numVal("edgeSetbackM"), parapetSetbackM: numVal("parapetSetbackM"), walkwayWidthM: numVal("walkwayWidthM"), rowSpacingM: numVal("rowSpacingM"), columnSpacingM: numVal("columnSpacingM"), panelOrientation: document.getElementById("panelOrientation").value, fallbackUsableRoofAreaSqFt: Number(cfg.roof?.fallbackUsableRoofAreaSqFt || 180) };
      const rc = SolarApp.RoofLayout.computeRoofCapacity(state.footprintSummary, panel, roofCfg, request);
      state.roofCapacity = rc;
      renderRoofCapacity(rc);
      const panelTarget = rc.customerMode ? rc.requestedCapacityKW : Math.max(0.5, rc.finalCapacityKW);
      renderPanelRecommendation(panelTarget);
      try { SolarApp.MapView.showPanelLayout(state.footprintSummary, rc.customerMode ? { ...rc.packing, ...rc.selectedLayout } : rc.packing); } catch (e) { console.warn("Panel layout overlay failed:", e); }
    });
  }

  // ---------------- Step 4: Electricity consumption ----------------
  function buildBimonthInputs() {
    const host=document.getElementById("bimonth6Inputs");
    if(!host || host.children.length) return;
    const names=["Jan–Feb","Mar–Apr","May–Jun","Jul–Aug","Sep–Oct","Nov–Dec"];
    host.innerHTML=names.map((name,i)=>`<div class="bimonth-card">
      <h4>${name} Bill</h4>
      <div class="mini-grid">
        <label>Bi-monthly Units (kWh)<input type="number" min="0" step="1" class="biUnits" data-index="${i}" placeholder="e.g. 900"></label>
        <label>Bi-monthly Bill (₹)<input type="number" min="0" step="0.01" class="biBill" data-index="${i}" placeholder="e.g. 4500"></label>
      </div>
    </div>`).join("");
    host.querySelectorAll("input").forEach(el=>el.addEventListener("input",()=>updateBimonthSummary()));
  }

  function readBimonthHistory() {
    const units=Array.from(document.querySelectorAll(".biUnits")).map(x=>Math.max(0,Number(x.value)||0));
    const bills=Array.from(document.querySelectorAll(".biBill")).map(x=>Math.max(0,Number(x.value)||0));
    const names=["Jan–Feb","Mar–Apr","May–Jun","Jul–Aug","Sep–Oct","Nov–Dec"];
    const rows=[];
    for(let i=0;i<6;i++) {
      if(units[i]>0 || bills[i]>0) rows.push({period:names[i],units:units[i],billAmount:bills[i],periodMonths:2});
    }
    return rows;
  }

  function updateBimonthSummary() {
    const rows=readBimonthHistory();
    const totalUnits=rows.reduce((s,r)=>s+r.units,0), totalBill=rows.reduce((s,r)=>s+r.billAmount,0);
    const avgUnits=totalUnits/12, avgBill=totalBill/12;
    const set=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v;};
    set("biAnnualUnits",totalUnits?Math.round(totalUnits).toLocaleString("en-IN")+" kWh":"—");
    set("biAvgUnits",totalUnits?Math.round(avgUnits).toLocaleString("en-IN")+" kWh":"—");
    set("biAnnualBill",totalBill?"₹"+Math.round(totalBill).toLocaleString("en-IN"):"—");
    set("biAvgBill",totalBill?"₹"+Math.round(avgBill).toLocaleString("en-IN"):"—");
  }

  function wireConsumptionStep() {
    const modeSelect = document.getElementById("consumptionMode");
    const monthly12Block = document.getElementById("monthly12Block");
    const bimonth6Block = document.getElementById("bimonth6Block");
    const MONTHS = SolarApp.Climate.MONTHS;

    buildBimonthInputs();
    const ebA = document.getElementById("ebBillNumber");
    const ebB = document.getElementById("ebBillNumberStep4");
    if (ebA && ebB) {
      ebA.addEventListener("input", () => { ebB.value = ebA.value; });
      ebB.addEventListener("input", () => { ebA.value = ebB.value; });
    }

    modeSelect.addEventListener("change", () => {
      const isMonthly = modeSelect.value === "monthly12";
      const isBi = modeSelect.value === "bimonth6";
      document.getElementById("avgConsumptionBlock").style.display = (isMonthly||isBi) ? "none" : "grid";
      monthly12Block.style.display = isMonthly ? "grid" : "none";
      bimonth6Block.style.display = isBi ? "block" : "none";
      if (isMonthly && monthly12Block.children.length === 0) {
        monthly12Block.innerHTML = MONTHS.map(m => `<label>${m} (kWh) <input type="number" class="monthlyUnitInput" value="750"></label>`).join("");
      }
      if(isBi) updateBimonthSummary();
    });

    document.getElementById("calcConsumptionBtn").addEventListener("click", () => {
      const cfg = SolarApp.Config.get();
      let consumptionInput;
      if (modeSelect.value === "monthly12") {
        const vals = Array.from(document.querySelectorAll(".monthlyUnitInput")).map(i => parseFloat(i.value) || 0);
        consumptionInput = { monthly: vals };
      } else if (modeSelect.value === "bimonth6") {
        const raw=readBimonthHistory();
        if(raw.length!==6){
          alert("Please enter all 6 TNEB bi-monthly bills (units and/or bill amount) for a complete 12-month analysis.");
          return;
        }
        // Each bi-monthly bill is split equally into two monthly equivalents for solar sizing.
        const vals=[]; raw.forEach(r=>{vals.push(r.units/2,r.units/2);});
        consumptionInput = { monthly: vals };
        state.utilityHistory=SolarApp.Utility.normalizeHistory(raw);
        renderUtilityHistory(state.utilityHistory);
      } else {
        const imported=importedMonthlyStats(state.utilityHistory);
        if(imported.avgUnits!==null && imported.avgUnits>0) {
          consumptionInput = { monthlyUnits: imported.avgUnits };
        } else {
          setImportedCalculationStatus("Upload a readable TNEB bill","No electricity units are available yet. Manual consumption entry is disabled; the app will not guess missing units.");
          alert("Please upload a readable TNEB/TNPDCL bill. Electricity consumption is calculated only from units/readings extracted from the bill.");
          return;
        }
      }
      const stats = SolarApp.Sizing.consumptionStats(consumptionInput);
      state.consumption = stats;
      state.consumptionSource = modeSelect.value;

      document.getElementById("consAnnualDisplay").textContent = Math.round(stats.annual).toLocaleString("en-IN") + " kWh";
      document.getElementById("consAvgDisplay").textContent = Math.round(stats.avgMonthly).toLocaleString("en-IN") + " kWh";
      document.getElementById("consPeakDisplay").textContent = Math.round(stats.peakMonthly).toLocaleString("en-IN") + " kWh";
      document.getElementById("consMinDisplay").textContent = Math.round(stats.minMonthly).toLocaleString("en-IN") + " kWh";

      const avgRate = SolarApp.Pricing.effectiveAverageRate(cfg.tariff, stats.annual);
      const paybackRate = Number(cfg.payback?.energyValuePerUnit) || 4.70;
      const billText = Number(document.getElementById("currentBillInput").value)||0;
      const imported=importedMonthlyStats(state.utilityHistory);
      const actualAvg = imported.avgBill!==null ? imported.avgBill : billText;
      const actualBill = imported.complete12 ? actualAvg*12 : actualAvg*12;
      const billLabel = imported.complete12 ? `12-month imported bill total: ₹${Math.round(actualBill).toLocaleString("en-IN")} (average ₹${Math.round(actualAvg).toLocaleString("en-IN")}/month).` : (actualAvg ? `Imported bill monthly equivalent: ₹${Math.round(actualAvg).toLocaleString("en-IN")}/month (annualised for preliminary ROI; more bills improve accuracy).` : "");
      document.getElementById("tariffInfoDisplay").textContent =
        `TNEB 2026 reference slab model: ₹${avgRate.toFixed(2)}/unit blended estimate. ` +
        billLabel + ` Payback valuation: ₹${paybackRate.toFixed(2)}/generated unit.`;
    });
  }

  // ---------------- TNEB / TNPDCL bill import ----------------
  function importedMonthlyStats(rows){
    const rs=Array.isArray(rows)?rows:[];
    const unitRows=rs.filter(r=>Number.isFinite(Number(r.monthlyUnits)));
    const billRows=rs.filter(r=>Number.isFinite(Number(r.monthlyBill)));
    const totalMonths=rs.reduce((a,r)=>a+Math.max(1,Number(r.periodMonths)||1),0);
    const weightedUnits=unitRows.reduce((a,r)=>a+Number(r.rawUnits||0),0);
    const weightedBill=billRows.reduce((a,r)=>a+Number(r.rawBill||0),0);
    return {
      records:rs.length,totalMonths,
      avgUnits:unitRows.length?weightedUnits/Math.max(1,totalMonths):null,
      avgBill:billRows.length?weightedBill/Math.max(1,totalMonths):null,
      minUnits:unitRows.length?Math.min(...unitRows.map(r=>Number(r.monthlyUnits))):null,
      maxUnits:unitRows.length?Math.max(...unitRows.map(r=>Number(r.monthlyUnits))):null,
      minBill:billRows.length?Math.min(...billRows.map(r=>Number(r.monthlyBill))):null,
      maxBill:billRows.length?Math.max(...billRows.map(r=>Number(r.monthlyBill))):null,
      complete12:totalMonths>=12
    };
  }

  function renderUtilityHistory(history) {
    state.utilityHistory=Array.isArray(history)?history:[];
    const rows=state.utilityHistory;
    const body=document.getElementById("utilityHistoryTableBody");
    const status=document.getElementById("utilityHistoryStatus");
    const st=importedMonthlyStats(rows);
    const set=(id,text)=>{const e=document.getElementById(id);if(e)e.textContent=text;};
    const n=x=>Number.isFinite(Number(x))?Math.round(Number(x)).toLocaleString("en-IN"):"—";
    set("utilityAvgUnits",st.avgUnits!==null?n(st.avgUnits)+" kWh":"—");
    set("utilityMinUnits",st.minUnits!==null?n(st.minUnits)+" kWh":"—");
    set("utilityMaxUnits",st.maxUnits!==null?n(st.maxUnits)+" kWh":"—");
    set("utilityAvgBill",st.avgBill!==null?"₹"+n(st.avgBill):"—");
    set("utilityMinBill",st.minBill!==null?"₹"+n(st.minBill):"—");
    set("utilityMaxBill",st.maxBill!==null?"₹"+n(st.maxBill):"—");
    if(body) body.innerHTML=rows.length?rows.map(r=>`<tr><td>${SolarApp.Utility.escapeHtml(r.period||"")}</td><td>${Number.isFinite(Number(r.rawUnits))?n(r.rawUnits):"—"}</td><td>${Number.isFinite(Number(r.monthlyUnits))?n(r.monthlyUnits):"—"}</td><td>${Number.isFinite(Number(r.rawBill))?"₹"+n(r.rawBill):"—"}</td><td>${Number.isFinite(Number(r.monthlyBill))?"₹"+n(r.monthlyBill):"—"}</td></tr>`).join(""):"<tr><td colspan=5>No imported bill history.</td></tr>";
    if(status) status.textContent=rows.length?`${rows.length} bill${rows.length>1?'s':''} imported · ${st.totalMonths} month${st.totalMonths!==1?'s':''} covered`:"Waiting for bill import";
    const note=document.getElementById("utilityHistoryNote");
    if(note) note.textContent=st.complete12
      ? "12 months of imported billing periods are available. The annual and monthly consumption values below are based on the imported history."
      : rows.length
        ? `${st.totalMonths} month${st.totalMonths!==1?'s':''} of bill history imported. The calculation below uses the imported monthly equivalent and annualises it for preliminary solar sizing; add more bills in Step 1 for a true 12-month actual history.`
        : "Upload a TNEB bill in Step 1. The app will not invent missing billing history.";
    return st;
  }

  function setImportedCalculationStatus(message, detail){
    const a=document.getElementById("consumptionSourceStatus"), b=document.getElementById("consumptionSourceDetail");
    if(a)a.textContent=message||"Upload a TNEB bill in Step 1";
    if(b)b.textContent=detail||"The app will calculate monthly-equivalent units and bill amount directly from the imported bill.";
  }

  function fillImportedCustomer(d){
    const fill=(id,v,force=false)=>{const e=document.getElementById(id);if(e&&v!==undefined&&v!==null&&v!==""&&(force||!e.value))e.value=v;};
    fill("tnebConsumerNumber",d.consumerNumber,true); fill("ebBillNumber",d.consumerNumber,true); fill("ebBillNumberStep4",d.consumerNumber,true);
    fill("utilityConsumerName",d.name,true); fill("custName",d.name,true); fill("custAddress",d.address,true); fill("custCity",d.city,true); fill("custDistrict",d.district,true); fill("custPincode",d.pincode,true);
    fill("utilityTariffCategory",d.tariffCategory,true); fill("utilitySanctionedLoad",d.sanctionedLoadKW,true); fill("utilityConnectedLoad",d.connectedLoadKW,true);
    fill("utilityLatestUnits",d.units,true); fill("utilityLatestBill",d.billAmount,true); fill("utilityBillDate",d.billDate,true); fill("utilityDueDate",d.dueDate,true);
    fill("utilityMeterNumber",d.meterNumber,true); fill("utilityBillingCycle",d.billingCycle,true); fill("utilityBillingPeriod",d.billingPeriod,true);
    // Sanctioned load on the bill is the best available utility load value; use it for the site survey only when present.
    if(Number(d.sanctionedLoadKW)>0){const e=document.getElementById("sanctionedLoad");if(e)e.value=d.sanctionedLoadKW;}
    if(d.periodStart && !document.getElementById("custDate")?.value){const e=document.getElementById("custDate");if(e)e.value=new Date().toISOString().slice(0,10);}
  }

  function wireUtilityLookup() {
    const parseBtn=document.getElementById("parseTnebBillBtn"), clearBtn=document.getElementById("clearTnebBillBtn"), fileInput=document.getElementById("tnebBillFile");
    let busy=false;
    async function importFile(file){
      if(!file||busy)return;
      const status=document.getElementById("utilityLookupStatus"), note=document.getElementById("tnebFetchNote"), progress=document.getElementById("tnebBillParseProgress"), title=document.getElementById("billUploadTitle");
      busy=true; if(parseBtn)parseBtn.disabled=true; if(status)status.textContent="Reading bill…"; if(progress)progress.textContent="Extracting customer and electricity details…";
      try{
        const parser = (window.TNEBBillParser && typeof window.TNEBBillParser.parseFile === "function")
          ? window.TNEBBillParser
          : (window.SolarApp && window.SolarApp.BillParser && typeof window.SolarApp.BillParser.parseFile === "function" ? window.SolarApp.BillParser : null);
        if(!parser) throw new Error("The TNEB bill reader is not loaded. Refresh the page once and try again.");
        const d=await parser.parseFile(file);
        if(d.units===null || !Number.isFinite(Number(d.units)) || Number(d.units)<=0) throw new Error((d.warnings&&d.warnings[0])||"Energy units could not be read from this bill. Upload a clearer bill PDF/image.");
        const months=Math.max(1,Number(d.periodMonths)||1);
        const monthlyUnits=Number(d.units)/months, monthlyBill=Number(d.billAmount||0)/months;
        fillImportedCustomer(d);
        const normalized={period:d.billingPeriod||d.billDate||file.name,rawUnits:Number(d.units),rawBill:Number(d.billAmount||0),monthlyUnits,monthlyBill,periodMonths:months,sourceFile:file.name,billDate:d.billDate,consumerNumber:d.consumerNumber};
        const existing=Array.isArray(state.utilityHistory)?state.utilityHistory:[];
        const key=r=>`${String(r.consumerNumber||"")}|${String(r.period||"")}|${Number(r.rawUnits||0)}|${Number(r.rawBill||0)}`;
        const dedup=existing.filter(r=>key(r)!==key(normalized)); state.utilityHistory=[...dedup,normalized];
        renderUtilityHistory(state.utilityHistory);
        const avg=importedMonthlyStats(state.utilityHistory);
        document.getElementById("avgMonthlyUnits").value=Math.round(avg.avgUnits*100)/100;
        document.getElementById("currentBillInput").value=Math.round((avg.avgBill||0)*100)/100;
        document.getElementById("consumptionMode").value="average";
        const summary=document.getElementById("importedBillSummary");
        if(summary){
          summary.hidden=false;
          const esc=SolarApp.Utility.escapeHtml;
          const kv=(label,value)=>`<div><small>${esc(label)}</small><strong>${esc(value===null||value===undefined||value===""?"—":String(value))}</strong></div>`;
          summary.innerHTML=`<div class="bill-summary-head"><strong>TNPDCL bill imported</strong><span>${d.confidence||0}% field confidence</span></div>
            <div class="bill-summary-grid">${[
              kv("Consumer / Service No.",d.consumerNumber),kv("Consumer Name",d.name),kv("Tariff",d.tariffCategory),kv("Meter No.",d.meterNumber),
              kv("Billing Cycle",d.billingCycle),kv("Billing Period",d.billingPeriod),kv("Units Consumed",`${d.units} kWh`),kv("Bill Amount",`₹${Number(d.billAmount||0).toLocaleString("en-IN")}`),
              kv("Previous Reading",d.previousReading),kv("Final Reading",d.currentReading),kv("Sanctioned Load",d.sanctionedLoadKW?`${d.sanctionedLoadKW} kW`:"—"),kv("Due Date",d.dueDate),
              kv("Invoice No.",d.invoiceNumber),kv("Phase",d.phase),kv("Supply Type",d.supplyType),kv("Solar RTS",d.solarRTS)
            ].join("")}</div>
            <p class="readout-line">${esc((d.warnings||[]).join(" ")||"Details were extracted from the original TNPDCL bill. Electricity consumption is calculated from the bill's Consumption/reading table; the app does not derive units from the bill amount.")}</p>`;
        }
        if(title)title.textContent="Bill imported — upload another";
        if(status)status.textContent="Bill imported & calculated";
        if(progress)progress.textContent=`Read ${d.extractedTextLength||0} characters · ${months===2?'2-month':'monthly'} bill`;
        if(note)note.textContent=state.utilityHistory.length>=6?"Bill history updated. Six bi-monthly records cover a full 12-month period.":"No TNEB username/password is required. Add the remaining bills here to build a true 12-month history.";
        setImportedCalculationStatus(
          state.utilityHistory.length>=6?"12-month bill history ready":"Electricity consumption calculated from imported bill",
          `${Math.round(avg.avgUnits).toLocaleString("en-IN")} kWh/month equivalent · ${avg.avgBill!==null?"₹"+Math.round(avg.avgBill).toLocaleString("en-IN")+"/month bill equivalent":"bill amount not available"}`
        );
        // Run the same calculation path used by the wizard button, without requiring any manual entry.
        const calc=document.getElementById("calcConsumptionBtn"); if(calc)calc.click();
      }catch(e){
        if(status)status.textContent="Bill read failed";
        if(progress)progress.textContent=`Bill read failed: ${e.message||"unknown error"}`;
        if(note)note.textContent=`${e.message||"The bill could not be read."} Manual consumption entry is not required.`;
        setImportedCalculationStatus("Waiting for a readable TNEB bill","The app will calculate consumption automatically after units are successfully extracted.");
      }finally{busy=false;if(parseBtn)parseBtn.disabled=false;}
    }
    if(fileInput)fileInput.addEventListener("change",()=>{const f=fileInput.files?.[0];if(f)importFile(f);});
    if(parseBtn)parseBtn.addEventListener("click",()=>{const f=fileInput?.files?.[0];if(f)importFile(f);else {const note=document.getElementById("tnebFetchNote");if(note)note.textContent="Choose a TNEB/TNPDCL bill first.";}});
    if(clearBtn)clearBtn.addEventListener("click",()=>{
      if(fileInput)fileInput.value="";
      const s=document.getElementById("importedBillSummary");if(s)s.hidden=true;
      const p=document.getElementById("tnebBillParseProgress");if(p)p.textContent="No bill selected.";
      const st=document.getElementById("utilityLookupStatus");if(st)st.textContent="Ready";
      const title=document.getElementById("billUploadTitle");if(title)title.textContent="Choose TNEB Bill";
      state.utilityHistory=[];
      renderUtilityHistory([]);
      ["custName","custAddress","custCity","custDistrict","custPincode","ebBillNumber","tnebConsumerNumber","utilityConsumerName","utilityTariffCategory","utilitySanctionedLoad","utilityConnectedLoad","utilityLatestUnits","utilityLatestBill","utilityBillDate","utilityDueDate","utilityMeterNumber","utilityBillingCycle","utilityBillingPeriod","avgMonthlyUnits","currentBillInput"].forEach(id=>{const e=document.getElementById(id);if(e)e.value="";});
      setImportedCalculationStatus("Upload a TNEB bill in Step 1","The app will calculate monthly-equivalent units and bill amount directly from the imported bill.");
    });
  }

  function applyBalanceEconomicsToSystems() {
    if(!state.energyBalance) return;
    const cfg=SolarApp.Config.get();
    const importRate=Number(document.getElementById("importValueRate")?.value)||Number(cfg.payback?.energyValuePerUnit)||4.70;
    const exportRate=Number(document.getElementById("exportValueRate")?.value)||importRate;
    const degradation=Number(document.getElementById("degradationRate")?.value)||0.5;
    [state.onGrid,state.hybrid,state.offGrid].filter(Boolean).forEach(sys=>{
      const eco=SolarApp.EnergyBalance.economics(state.energyBalance,Number(sys.cost?.finalPrice||0),Number(sys.subsidy||0),importRate,exportRate,degradation);
      sys.savings={...(sys.savings||{}), generatedKWh:Number(sys.generation?.annualKWh||state.energyBalance.totalSolar), energyValuePerUnit:importRate, annualSavings:eco.firstYearSavings, selfConsumptionSavings:eco.annualOffset, exportCredit:eco.annualExportCredit, netInvestment:eco.netInvestment, paybackYears:eco.paybackYears};
    });
  }

  function renderEnergyBalance() {
    const gen=state.generation, cons=state.consumption;
    if(!gen||!cons||!SolarApp.EnergyBalance)return;
    const balance=SolarApp.EnergyBalance.monthlyBalance(cons.monthly,gen.rows);
    state.energyBalance=balance;
    const cfg=SolarApp.Config.get();
    const importRate=Number(document.getElementById("importValueRate")?.value)||Number(cfg.payback?.energyValuePerUnit)||4.70;
    const exportRate=Number(document.getElementById("exportValueRate")?.value)||importRate;
    const degradation=Number(document.getElementById("degradationRate")?.value)||0.5;
    const sys=state.onGrid||state.hybrid||state.offGrid;
    const investment=Number(sys?.cost?.finalPrice||0), subsidy=Number(sys?.subsidy||0);
    const eco=SolarApp.EnergyBalance.economics(balance,investment,subsidy,importRate,exportRate,degradation);
    let billCmp=SolarApp.Pricing.billComparison(balance.rows,cfg.tariff,exportRate);
    // When six real bi-monthly TNEB bills are entered/fetched, use those actual
    // bill amounts for the current-bill baseline (2-month amount / 2 per month).
    // Post-solar cost is still calculated from the configured 2026 reference slab model.
    const h=Array.isArray(state.utilityHistory)?state.utilityHistory.filter(r=>Number.isFinite(Number(r.rawBill))):[];
    if(h.length) {
      const actualRows=[];
      if(h.length>=6 && h.slice(0,6).every(r=>Number(r.periodMonths||1)===2)) {
        h.slice(0,6).forEach((r,i)=>{
          const a=balance.rows[i*2], b=balance.rows[i*2+1];
          const actualMonthlyBill=Number(r.rawBill)/2;
          [a,b].forEach(m=>actualRows.push({...m,currentBill:actualMonthlyBill}));
        });
      } else {
        const avgImportedBill=h.reduce((a,r)=>a+(Number(r.monthlyBill)||0),0)/Math.max(1,h.length);
        balance.rows.forEach(m=>actualRows.push({...m,currentBill:avgImportedBill}));
      }
      actualRows.forEach(m=>{
        const postSolar=SolarApp.Pricing.billFromUnits(Math.max(0,Number(m?.deficit||0)),cfg.tariff);
        const exportCredit=Number(m?.surplus||0)*exportRate;
        m.energyBillAfterSolar=postSolar; m.exportCredit=exportCredit;
        m.postSolarBill=Math.max(0,postSolar-exportCredit);
        m.monthlySavings=Math.max(0,Number(m.currentBill||0)-m.postSolarBill);
      });
      const sum=k=>actualRows.reduce((a,r)=>a+(Number(r[k])||0),0);
      billCmp={rows:actualRows,currentAnnualBill:sum('currentBill'),postSolarAnnualBill:sum('postSolarBill'),annualSavings:sum('monthlySavings'),averageCurrentMonthlyBill:sum('currentBill')/12,averagePostSolarMonthlyBill:sum('postSolarBill')/12};
    }
    state.billComparison=billCmp;
    applyBalanceEconomicsToSystems();
    const set=(id,text)=>{const e=document.getElementById(id);if(e)e.textContent=text;};
    const u=x=>Math.round(x||0).toLocaleString("en-IN");
    const money=x=>"₹"+Math.round(Number(x)||0).toLocaleString("en-IN");
    set("balanceSolarAnnual",u(balance.totalSolar)+" kWh"); set("balanceSelfUse",u(balance.totalSelfUse)+" kWh"); set("balanceSurplus",u(balance.totalSurplus)+" kWh"); set("balanceDeficit",u(balance.totalDeficit)+" kWh"); set("balanceCoverage",balance.solarCoveragePct.toFixed(1)+"%"); set("balancePayback",eco.paybackYears===null?"—":eco.paybackYears.toFixed(1)+" years");
    set("roiCurrentBill",money(billCmp.averageCurrentMonthlyBill)+"/month"); set("roiPostSolarBill",money(billCmp.averagePostSolarMonthlyBill)+"/month"); set("roiMonthlySavings",money(billCmp.averageCurrentMonthlyBill-billCmp.averagePostSolarMonthlyBill)+"/month"); set("roiAnnualSavings",money(billCmp.annualSavings)+"/year"); set("roiNetInvestment",money(Math.max(0,investment-subsidy))); set("roiPayback",billCmp.annualSavings>0?((Math.max(0,investment-subsidy)/billCmp.annualSavings).toFixed(1)+" years"):"—");
    const body=document.getElementById("energyBalanceTableBody");
    if(body)body.innerHTML=billCmp.rows.map(r=>`<tr><td>${r.month}</td><td>${u(r.load)}</td><td>${u(r.solar)}</td><td>${u(r.selfUse)}</td><td>${u(r.surplus)}</td><td>${u(r.deficit)}</td><td>${money(r.currentBill)}</td><td>${money(r.postSolarBill)}</td><td>${money(r.monthlySavings)}</td></tr>`).join("");
    return {...eco,billComparison:billCmp};
  }

  // ---------------- Step 5: Solar system sizing + generation ----------------
  function wireSolarSystemStep() {
    document.getElementById("fetchClimateBtn").addEventListener("click", async () => {
      const statusEl = document.getElementById("climateStatus");
      if (!state.roofCapacity) { createDefaultRoofForSizing(); if (state.footprintSummary) document.getElementById("calcRoofBtn")?.click(); }
      if (!state.roofCapacity) { statusEl.textContent = "Calculate roof capacity in Step 3 first."; return; }
      if (!state.consumption) { statusEl.textContent = "Calculate electricity consumption in Step 4 first."; return; }

      if (!ensureLocation()) { statusEl.textContent = "Enter valid Latitude and Longitude, or use City Reference Coordinates first."; return; }
      const lat = numVal("lat"), lon = numVal("lon");
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat)>90 || Math.abs(lon)>180) { statusEl.textContent = "Valid site Latitude/Longitude are required."; return; }

      statusEl.textContent = "Loading solar resource data (NASA POWER → Open-Meteo → PVGIS)…";
      try {
        const clim = await SolarApp.Climate.fetchClimatology(lat, lon);
        state.climatology = clim;
        try {
          state.solarResourceAPI = await SolarApp.API.fetchPVGIS(lat, lon, 1, 14, Number(val("roofTilt")) || 10, 0);
        } catch (apiErr) {
          state.solarResourceAPI = null;
          console.warn("PVGIS PV output unavailable; climate chain remains active:", apiErr);
        }

        // Auto-match the supplied GSA benchmark only when the current location is
        // within 2 km of the reference coordinate. Other locations can be entered
        // manually in the GSA Benchmark panel below.
        const matchedGsa = SolarApp.Benchmark.findReference(lat, lon, 2);
        if (matchedGsa) {
          state.gsaBenchmark = matchedGsa;
          populateGsaFields(matchedGsa);
        } else {
          state.gsaBenchmark = readGsaFields();
        }
        renderGsaComparison();

        const cfg = SolarApp.Config.get();
        // Use the GSA PVOUT as the sizing benchmark when available; otherwise use
        // the transparent MSR engineering yield from the selected climate source.
        const roughGen = SolarApp.Generation.computeGeneration(state.roofCapacity.finalCapacityKW || 1, clim.monthly, cfg.losses, state.gsaBenchmark?.pvoutSpecific);
        const sizingYield = state.gsaBenchmark?.pvoutSpecific > 0 ? state.gsaBenchmark.pvoutSpecific : roughGen.specificYield;
        const sizing = SolarApp.Sizing.recommendCapacity(state.roofCapacity.finalCapacityKW, state.consumption, sizingYield);
        state.sizing = sizing;

        const overrideEl = document.getElementById("recommendedKWOverride");
        const customerCapacity = state.roofCapacity.customerMode ? state.roofCapacity.selectedCapacityKW : null;
        const recommendedKW = customerCapacity || (overrideEl.value !== "" ? parseFloat(overrideEl.value) : sizing.recommendedKW);
        overrideEl.value = recommendedKW;

        const generation = SolarApp.Generation.computeGeneration(recommendedKW, clim.monthly, cfg.losses, state.gsaBenchmark?.pvoutSpecific);
        state.generation = generation;

        document.getElementById("sizingRoofMax").textContent = sizing.roofMaxKW.toFixed(2) + " kWp";
        document.getElementById("sizingConsBased").textContent = sizing.consumptionBasedKW.toFixed(2) + " kWp";
        document.getElementById("sizingRecommended").textContent = recommendedKW.toFixed(2) + " kWp";
        document.getElementById("sizingLimitedBy").textContent = sizing.limitedBy === "roof" ? "Roof capacity" : "Consumption";
        document.getElementById("dataSourceDisplay").value = clim.source;

        document.getElementById("annualGenDisplay").textContent = Math.round(generation.annualKWh).toLocaleString("en-IN") + " kWh";
        document.getElementById("specificYieldDisplay").textContent = generation.specificYield.toFixed(0) + " kWh/kWp/yr";
        document.getElementById("peakSunDisplay").textContent = generation.peakSunHoursAvg.toFixed(2) + " hrs/day";
        document.getElementById("lossPctDisplay").textContent = generation.totalLossPct.toFixed(1) + "%";

        SolarApp.Charts.renderGenerationChart("genChart", generation.rows);
        renderBessEngine();
        renderEnergyBalance();
        renderGsaComparison();
        renderAccuracyPanel();
        const gsaNote = state.gsaBenchmark ? ` GSA benchmark: ${state.gsaBenchmark.pvoutSpecific.toFixed(1)} kWh/kWp/yr.` : " No GSA benchmark supplied.";
        statusEl.textContent = `Done — data source: ${clim.source}.${gsaNote}`;
      } catch (err) {
        statusEl.textContent = "Error: " + err.message + ". If this persists, your network may be blocking these APIs.";
      }
    });

    document.getElementById("recommendedKWOverride").addEventListener("change", () => {
      if (!state.climatology) return;
      const cfg = SolarApp.Config.get();
      const kw = parseFloat(document.getElementById("recommendedKWOverride").value);
      if (!Number.isFinite(kw) || kw <= 0) return;
      state.generation = SolarApp.Generation.computeGeneration(kw, state.climatology.monthly, cfg.losses, state.gsaBenchmark?.pvoutSpecific);
      document.getElementById("annualGenDisplay").textContent = Math.round(state.generation.annualKWh).toLocaleString("en-IN") + " kWh";
      document.getElementById("specificYieldDisplay").textContent = state.generation.specificYield.toFixed(0) + " kWh/kWp/yr";
      SolarApp.Charts.renderGenerationChart("genChart", state.generation.rows);
    renderEnergyBalance();
      renderGsaComparison();
      renderAccuracyPanel();
    });

    ["gsaPvout","gsaGhi","gsaDni","gsaDif","gsaGtiOpt","gsaTilt","gsaTemp","gsaElevation","gsaSource"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener("change", () => {
        state.gsaBenchmark = readGsaFields();
        refreshGenerationFromBenchmark();
        renderGsaComparison();
        renderAccuracyPanel();
      });
    });
    document.getElementById("loadGsaReferenceBtn").addEventListener("click", () => {
      const latNow = numVal("lat"), lonNow = numVal("lon");
      const ref = SolarApp.Benchmark.findReference(latNow, lonNow, 2);
      if (!ref) {
        document.getElementById("gsaStatus").textContent = "No built-in GSA reference is within 2 km of this site. Enter the values from the customer's GSA PDF.";
        return;
      }
      state.gsaBenchmark = ref;
      populateGsaFields(ref);
      refreshGenerationFromBenchmark();
      renderGsaComparison();
      renderAccuracyPanel();
    });
    document.getElementById("clearGsaBenchmarkBtn").addEventListener("click", () => {
      state.gsaBenchmark = null;
      ["gsaPvout","gsaGhi","gsaDni","gsaDif","gsaGtiOpt","gsaTilt","gsaTemp","gsaElevation","gsaSource"].forEach(id => { const el = document.getElementById(id); if (el) el.value = ""; });
      refreshGenerationFromBenchmark();
      renderGsaComparison();
      renderAccuracyPanel();
    });
  }



  function refreshGenerationFromBenchmark() {
    if (!state.climatology) return;
    const cfg = SolarApp.Config.get();
    const kw = parseFloat(document.getElementById("recommendedKWOverride").value) || state.sizing?.recommendedKW || state.roofCapacity?.finalCapacityKW;
    if (!Number.isFinite(kw) || kw <= 0) return;
    state.generation = SolarApp.Generation.computeGeneration(kw, state.climatology.monthly, cfg.losses, state.gsaBenchmark?.pvoutSpecific);
    document.getElementById("annualGenDisplay").textContent = Math.round(state.generation.annualKWh).toLocaleString("en-IN") + " kWh";
    document.getElementById("specificYieldDisplay").textContent = state.generation.specificYield.toFixed(0) + " kWh/kWp/yr";
    SolarApp.Charts.renderGenerationChart("genChart", state.generation.rows);
    renderEnergyBalance();
  }

  function renderAccuracyPanel() {
    const panel = document.getElementById("accuracyPanel");
    if (!panel) return;
    const status = document.getElementById("accuracyStatus");
    const resource = document.getElementById("accuracyResource");
    const gen = document.getElementById("accuracyGeneration");
    const roof = document.getElementById("accuracyRoof");
    const bench = document.getElementById("accuracyBenchmark");
    const notes = document.getElementById("accuracyNotes");
    const b = state.gsaBenchmark;
    resource.textContent = state.climatology?.source || "Not loaded";
    gen.textContent = state.generation?.calibration || "Climate model";
    roof.textContent = state.footprintSummary ? "Footprint + OBB packing" : "Not available";
    if (b && state.generation) {
      const delta = ((state.generation.specificYield - b.pvoutSpecific) / b.pvoutSpecific) * 100;
      bench.textContent = `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}% vs GSA`;
    } else bench.textContent = "No external benchmark";
    const complete = !!(state.gsaBenchmark && state.climatology && state.roofCapacity?.packing);
    status.textContent = complete ? "BENCHMARKED" : "PRELIMINARY";
    status.className = `status-pill ${complete ? "status-ready" : "status-config"}`;
    notes.textContent = complete
      ? "Annual generation is calibrated to the supplied GSA/Solargis PVOUT while preserving the monthly climate profile. Roof packing remains an engineering approximation; final structural, shading and electrical checks require site survey."
      : "For higher confidence, load a site-specific GSA/Solargis PVOUT benchmark. The roof calculation uses footprint geometry and an oriented bounding-box packing approximation, so it is not a construction drawing.";
  }

  function populateGsaFields(b) {
    if (!b) return;
    setVal("gsaPvout", b.pvoutSpecific); setVal("gsaGhi", b.ghi); setVal("gsaDni", b.dni);
    setVal("gsaDif", b.dif); setVal("gsaGtiOpt", b.gtiOpt); setVal("gsaTilt", b.optimumTilt);
    setVal("gsaTemp", b.temperature); setVal("gsaElevation", b.elevationM); setVal("gsaSource", b.source);
  }

  function readGsaFields() {
    const pvout = numVal("gsaPvout");
    if (!Number.isFinite(pvout) || pvout <= 0) return null;
    return SolarApp.Benchmark.normalize({
      pvoutSpecific: pvout, ghi: numVal("gsaGhi"), dni: numVal("gsaDni"), dif: numVal("gsaDif"),
      gtiOpt: numVal("gsaGtiOpt"), optimumTilt: numVal("gsaTilt"), temperature: numVal("gsaTemp"),
      elevationM: numVal("gsaElevation"), source: val("gsaSource") || "Global Solar Atlas / Solargis"
    });
  }

  function renderGsaComparison() {
    const b = state.gsaBenchmark || readGsaFields();
    const yieldEl = document.getElementById("gsaYieldDisplay");
    const deltaEl = document.getElementById("gsaDeltaDisplay");
    const agreementEl = document.getElementById("gsaAgreementDisplay");
    const annualEl = document.getElementById("gsaAnnualDisplay");
    const statusEl = document.getElementById("gsaStatus");
    if (!yieldEl) return;
    if (!b) {
      yieldEl.textContent = deltaEl.textContent = agreementEl.textContent = annualEl.textContent = "—";
      statusEl.textContent = "No GSA benchmark loaded. Add the GSA PVOUT value to enable benchmark comparison.";
      return;
    }
    state.gsaBenchmark = b;
    const capacityKW = parseFloat(document.getElementById("recommendedKWOverride").value) || (state.sizing?.recommendedKW || 0);
    yieldEl.textContent = b.pvoutSpecific.toFixed(1) + " kWh/kWp/yr";
    if (state.generation) {
      const cmp = SolarApp.Benchmark.compare(state.generation.specificYield, capacityKW, b);
      deltaEl.textContent = `${cmp.deltaPct >= 0 ? "+" : ""}${cmp.deltaPct.toFixed(2)}%`;
      agreementEl.textContent = cmp.agreementPct.toFixed(2) + "%";
      annualEl.textContent = capacityKW > 0 ? Math.round(cmp.gsaAnnual).toLocaleString("en-IN") + " kWh" : "—";
      statusEl.textContent = `${b.source}. MSR engineering yield ${state.generation.specificYield.toFixed(1)} vs GSA ${b.pvoutSpecific.toFixed(1)} kWh/kWp/yr.`;
    } else {
      deltaEl.textContent = agreementEl.textContent = annualEl.textContent = "—";
      statusEl.textContent = b.source;
    }
  }

  // ---------------- System type + BESS engine ----------------
  function wireSystemSelection() {
    const typeEl = document.getElementById("systemType");
    const hoursEl = document.getElementById("desiredBackupHours");
    const loadEl = document.getElementById("loadType");
    const sync = () => {
      state.systemType = typeEl?.value || "on-grid";
      state.backupHours = Number(hoursEl?.value) || 4;
      state.loadType = loadEl?.value || "essential";
      const bessBox = document.getElementById("bessInputs");
      if (bessBox) bessBox.hidden = state.systemType === "on-grid";
      renderBessEngine();
      const finalSelect = document.getElementById("recommendedSystemSelect");
      if (finalSelect) {
        finalSelect.value = state.systemType === "hybrid" ? "Hybrid" : state.systemType === "off-grid" ? "Off-Grid" : "On-Grid";
        renderQuotationCustomerSummary();
      }
    };
    [typeEl, hoursEl, loadEl].forEach(el => { if (el) { el.addEventListener("input", sync); el.addEventListener("change", sync); } });
    sync();
  }

  function buildDefault24HourProfiles(dailyLoadKWh, dailySolarKWh) {
    const loadShape = [0.030,0.025,0.023,0.022,0.022,0.028,0.038,0.050,0.047,0.040,0.035,0.034,0.035,0.036,0.038,0.042,0.050,0.062,0.075,0.090,0.095,0.085,0.060,0.043];
    const solarShape = [0,0,0,0,0,0.01,0.035,0.075,0.11,0.13,0.14,0.14,0.135,0.13,0.12,0.105,0.08,0.045,0.015,0,0,0,0,0];
    const normalise = arr => { const sum=arr.reduce((a,b)=>a+b,0); return arr.map(v=>sum? v/sum:0); };
    return { load: normalise(loadShape).map(v=>v*Math.max(0,dailyLoadKWh)), solar: normalise(solarShape).map(v=>v*Math.max(0,dailySolarKWh)) };
  }

  function renderBessEngine() {
    const resultBox = document.getElementById("bessResults");
    if (!resultBox) return;
    if (state.systemType === "on-grid") {
      resultBox.innerHTML = `<div class="bess-empty">On-Grid selected — no battery storage is included.</div>`;
      state.bessSimulation = null;
      return;
    }
    const cfg = SolarApp.Config.get();
    const battery = cfg.batteries.find(b => b.id === document.getElementById("batterySelect")?.value) || cfg.batteries[0];
    const dailyLoad = Number(state.consumption?.avgMonthly || 0) / 30;
    const loadInfo = SolarApp.Sizing.deriveCriticalLoad(dailyLoad, state.loadType);
    const criticalEl = document.getElementById("criticalLoadKW");
    if (criticalEl) criticalEl.value = loadInfo.criticalLoadKW.toFixed(2);
    const hours = Number(state.backupHours) || 4;
    const backupEl = document.getElementById("backupHours");
    if (backupEl) backupEl.value = hours;
    const sizing = SolarApp.Sizing.sizeBattery(loadInfo.criticalLoadKW, hours, battery, cfg.battery.systemLossPct);
    state.batteryPreview = sizing;
    const solarDaily = Number(state.generation?.avgDailyKWh || 0);
    const profiles = buildDefault24HourProfiles(dailyLoad, solarDaily);
    const sim = SolarApp.EnergyBalance.simulate24Hour({
      loadProfile: profiles.load,
      solarProfile: profiles.solar,
      batteryCapacityKWh: sizing.totalNameplateKWh,
      batteryUsableKWh: sizing.totalUsableKWh,
      initialSocPct: 50,
      chargeEfficiencyPct: Math.sqrt(sizing.roundtripEffPct),
      dischargeEfficiencyPct: Math.sqrt(sizing.roundtripEffPct),
      gridAvailable: state.systemType !== "off-grid",
    });
    state.bessSimulation = sim;
    const autonomy = state.systemType === "off-grid" ? sim.autonomyPct : sim.gridIndependencePct;
    const labels = [
      ["Battery Pack Count", `${sizing.packCount} × ${battery.model}`],
      ["Total Storage Capacity", `${sizing.totalNameplateKWh.toFixed(2)} kWh`],
      ["Usable Capacity", `${sizing.totalUsableKWh.toFixed(2)} kWh`],
      ["Estimated Backup Duration", `${sizing.estimatedBackupHours.toFixed(1)} hours @ ${loadInfo.criticalLoadKW.toFixed(2)} kW`],
      [state.systemType === "off-grid" ? "Autonomy Score" : "Grid Independence", `${autonomy.toFixed(1)}%`],
      ["Daily Load Assumption", `${dailyLoad.toFixed(1)} kWh/day`],
    ];
    resultBox.innerHTML = `<div class="bess-results-grid">${labels.map(([l,v])=>`<div class="bess-result-card"><small>${l}</small><b>${v}</b></div>`).join("")}</div><p class="disclaimer">BESS simulation uses a representative 24-hour load/solar profile. Replace it with measured interval data for final engineering. ${state.systemType === "off-grid" ? "Grid is unavailable in this simulation; unmet load is reported as an autonomy limitation." : "Hybrid simulation follows Solar → Load → Battery → Grid Export, then Battery → Grid Import."}</p>`;
    ["battRawEnergy","battUnitsNeeded","battNameplate","battUsable"].forEach(id=>{});
    const raw = document.getElementById("battRawEnergy"); if(raw) raw.textContent = sizing.backupEnergyKWh.toFixed(2)+" kWh";
    const units = document.getElementById("battUnitsNeeded"); if(units) units.textContent = sizing.packCount+" × "+battery.model;
    const nameplate = document.getElementById("battNameplate"); if(nameplate) nameplate.textContent = sizing.totalNameplateKWh.toFixed(2)+" kWh";
    const usable = document.getElementById("battUsable"); if(usable) usable.textContent = sizing.totalUsableKWh.toFixed(2)+" kWh";
  }

  // ---------------- Step 6: Battery preview ----------------
  function wireBatteryStep() {
    document.getElementById("batterySelect").addEventListener("change", () => {
      const cfg = SolarApp.Config.get();
      const b = cfg.batteries.find(x => x.id === document.getElementById("batterySelect").value) || cfg.batteries[0];
      renderSelectedBattery(b);
      renderProductCatalogs(cfg);
      renderBessEngine();
    });
    document.getElementById("calcBatteryBtn").addEventListener("click", renderBessEngine);
    ["criticalLoadKW","backupHours"].forEach(id => document.getElementById(id)?.addEventListener("input", () => {
      if (id === "backupHours") { state.backupHours = numVal(id) || 4; const h=document.getElementById("desiredBackupHours"); if(h) h.value=String(Math.round(state.backupHours)); }
      renderBessEngine();
    }));
  }

  // ---------------- Step 7: Pricing preview ----------------
  function syncPricingStepDefaults() {
    const cfg = SolarApp.Config.get();
    document.getElementById("installMethodQuote").value = cfg.installation.method;
    document.getElementById("installValueQuote").value = cfg.installation.method === "fixed" ? cfg.installation.fixedAmount : cfg.installation.percentageOfEquipment;
    document.getElementById("transportQuote").value = cfg.installation.transportationFlat;
    // Left blank by default: leave the Settings-configured GST (split or flat) in effect for this
    // quote unless the user explicitly types an override number below.
    document.getElementById("gstPctQuote").value = "";
    document.getElementById("gstPctQuote").placeholder = cfg.gst.mode === "split"
      ? `Settings: split (${cfg.gst.splitLowSharePct}% @ ${cfg.gst.splitLowRatePct}% + ${100 - cfg.gst.splitLowSharePct}% @ ${cfg.gst.splitHighRatePct}%)`
      : `Settings: flat ${cfg.gst.flatPct}%`;
  }

  function wirePricingStep() {
    document.getElementById("previewBomBtn").addEventListener("click", () => {
      if (!state.roofCapacity || !state.generation) {
        alert("Complete Step 3 (Roof) and Step 5 (Solar System) first.");
        return;
      }
      const cfg = quoteScopedConfig();
      const capacityKW = parseFloat(document.getElementById("recommendedKWOverride").value) || state.sizing.recommendedKW;
      const panel = state.roofCapacity.panel;
      const panelCount = state.roofCapacity.customerMode ? state.roofCapacity.selectedPanelCount : Math.ceil(capacityKW * 1000 / panel.wattage);
      const inverter = pickOnGridInverter(cfg, capacityKW);
      const cost = SolarApp.Pricing.buildSystemCost({ capacityKW, panelCount, panel, inverter }, cfg);

      const table = document.getElementById("bomPreviewTable");
      table.innerHTML = "<thead><tr><th>Item</th><th>Qty</th><th>Unit Price</th><th>Total</th></tr></thead><tbody>" +
        cost.lineItems.map(li => `<tr><td>${li.item}</td><td>${li.qty}</td><td>₹${fmtNum(li.unitPrice)}</td><td>₹${fmtNum(li.total)}</td></tr>`).join("") +
        `<tr><td colspan="3" style="text-align:right;font-weight:700;">Equipment + BOM</td><td style="font-weight:700;">₹${fmtNum(cost.equipmentCost)}</td></tr>` +
        `<tr><td colspan="3" style="text-align:right;">Installation + Transport</td><td>₹${fmtNum(cost.install.amount + cost.install.transportation)}</td></tr>` +
        `<tr><td colspan="3" style="text-align:right;">GST (${cost.gstPct}%)</td><td>₹${fmtNum(cost.gstAmount)}</td></tr>` +
        `<tr><td colspan="3" style="text-align:right;font-weight:700;color:var(--gold);">TOTAL</td><td style="font-weight:700;color:var(--gold);">₹${fmtNum(cost.finalPrice)}</td></tr></tbody>`;
    });
  }

  function pickOnGridInverter(cfg, capacityKW) {
    const candidates = cfg.inverters.filter(i => i.type === "on-grid");
    const sorted = [...candidates].sort((a, b) => a.capacityKW - b.capacityKW);
    return sorted.find(i => i.capacityKW >= capacityKW) || sorted[sorted.length - 1] || cfg.inverters[0];
  }

  function fmtNum(n) { return Number.isFinite(n) ? Math.round(n).toLocaleString("en-IN") : "-"; }

  // Builds a Config clone with the Step-7 per-quotation overrides (install method/value, transport, GST) applied.
  // Uses structuredClone (not JSON round-trip) so Infinity in tariff/subsidy slabs survives the clone.
  function quoteScopedConfig() {
    const cfg = structuredClone(SolarApp.Config.get());
    const method = document.getElementById("installMethodQuote").value;
    const value = parseFloat(document.getElementById("installValueQuote").value);
    if (Number.isFinite(value)) {
      cfg.installation.method = method;
      if (method === "fixed") cfg.installation.fixedAmount = value; else cfg.installation.percentageOfEquipment = value;
    }
    const transport = parseFloat(document.getElementById("transportQuote").value);
    if (Number.isFinite(transport)) cfg.installation.transportationFlat = transport;
    const gstOverride = parseFloat(document.getElementById("gstPctQuote").value);
    if (Number.isFinite(gstOverride)) cfg.gst = { mode: "flat", flatPct: gstOverride };
    return cfg;
  }

  // ---------------- Step 8: Comparison ----------------
  function wireComparisonStep() {
    document.getElementById("buildQuotationsBtn").addEventListener("click", () => {
      if (!state.roofCapacity || !state.climatology || !state.consumption || !state.sizing) {
        alert("Complete Steps 3–5 (Roof, Electricity, Solar) first.");
        return;
      }
      const cfg = quoteScopedConfig();
      const recommendedKW = state.roofCapacity.customerMode ? state.roofCapacity.selectedCapacityKW : (parseFloat(document.getElementById("recommendedKWOverride").value) || state.sizing.recommendedKW);
      const criticalLoadKW = numVal("criticalLoadKW") || 2;
      const backupHours = numVal("backupHours") || 6;

      const ctx = {
        roofCapacity: state.roofCapacity,
        cfg,
        consumption: state.consumption,
        monthlyClimatology: state.climatology.monthly,
        recommendedKW,
        criticalLoadKW,
        backupHours,
        systemType: state.systemType,
        loadType: state.loadType,
        bessSimulation: state.bessSimulation,
      };

      state.onGrid = SolarApp.Quotation.buildOnGrid(ctx);
      state.hybrid = SolarApp.Quotation.buildHybrid(ctx);
      state.offGrid = SolarApp.Quotation.buildOffGrid(ctx);
      state.comparison = SolarApp.Quotation.buildComparison(state.onGrid, state.hybrid, state.offGrid);
      state.warnings = SolarApp.Quotation.validate({ ...ctx, generation: state.onGrid.generation });

      renderComparisonTable();
      renderEnergyBalance();
      renderWarnings();
      renderCustomerSavings();
      renderQuotationCustomerSummary();
    });
  }

  function renderComparisonTable() {
    const wrap = document.getElementById("comparisonWrap");
    const recommended = pickRecommendedType();
    const colKey = recommended === "On-Grid" ? "onGrid" : recommended === "Hybrid" ? "hybrid" : "offGrid";
    const cls = (key) => key === colKey ? "recommended" : "";
    wrap.innerHTML = `<table class="db-table comparison-table">
      <thead><tr><th>Parameter</th><th class="${cls('onGrid')}">On-Grid</th><th class="${cls('hybrid')}">Hybrid</th><th class="${cls('offGrid')}">Off-Grid</th></tr></thead>
      <tbody>${state.comparison.map(r => `<tr><td>${r.param}</td><td class="${cls('onGrid')}">${r.onGrid}</td><td class="${cls('hybrid')}">${r.hybrid}</td><td class="${cls('offGrid')}">${r.offGrid}</td></tr>`).join("")}</tbody>
    </table>
    <p class="disclaimer" style="margin-top:10px;">★ Recommended: <b>${recommended}</b> — auto-suggested from roof capacity, consumption pattern and payback; change the final selection in Step 9 if the customer prefers otherwise.</p>`;
    document.getElementById("recommendedSystemSelect").value = recommended;
  }

  function pickRecommendedType() {
    const explicit = state.systemType === "hybrid" ? "Hybrid" : state.systemType === "off-grid" ? "Off-Grid" : "On-Grid";
    if (state.systemType) return explicit;
    const options = [state.onGrid, state.hybrid, state.offGrid].filter(Boolean);
    const withPayback = options.filter(o => Number.isFinite(o.savings.paybackYears));
    if (withPayback.length === 0) return "On-Grid";
    const best = withPayback.reduce((a, b) => (a.savings.paybackYears <= b.savings.paybackYears ? a : b));
    return best.type;
  }

  function renderWarnings() {
    const box = document.getElementById("warningsBox");
    box.innerHTML = state.warnings.map(w => `<div class="warning-line">${w}</div>`).join("");
  }

  // ---------------- Step 9: Final quotation / PDF / save-load ----------------
  function wireQuotationStep() {
    const finalSystem = document.getElementById("recommendedSystemSelect");
    if (finalSystem) finalSystem.addEventListener("change", () => { renderQuotationCustomerSummary(); renderEnergyBalance(); });

    document.getElementById("downloadPdfBtn").addEventListener("click", () => {
      if (!state.onGrid || !state.hybrid || !state.offGrid) {
        alert("Build all three solar proposals in Step 8 first.");
        return;
      }
      const project = assembleProject();
      try {
        (SolarApp.Quotation.generateProposalPDF || SolarApp.PDF.generateQuotationPDF)(project);
      } catch (err) {
        alert("Couldn't generate the PDF: " + err.message);
        console.error(err);
      }
    });

    document.getElementById("saveProjectBtn").addEventListener("click", () => {
      const project = assembleProject();
      SolarApp.Storage.saveProject(project.quotationNumber, project);
      renderSavedProjects();
      alert("Saved: " + project.quotationNumber);
    });

    document.getElementById("exportProjectBtn").addEventListener("click", () => {
      const project = assembleProject();
      SolarApp.Storage.exportProjectFile(project, project.quotationNumber + ".json");
    });

    document.getElementById("importProjectFile").addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const project = await SolarApp.Storage.importProjectFile(file);
        loadProjectIntoWizard(project);
        alert("Project loaded: " + (project.quotationNumber || file.name));
      } catch (err) {
        alert("Couldn't import project: " + err.message);
      }
    });

    renderSavedProjects();
  }

  function renderSavedProjects() {
    const all = SolarApp.Storage.listProjects();
    const ids = Object.keys(all);
    const el = document.getElementById("savedProjectsList");
    if (ids.length === 0) { el.innerHTML = `<p class="disclaimer">No saved projects yet.</p>`; return; }
    el.innerHTML = "<p class='disclaimer'>Saved projects (this browser only):</p>" + ids.map(id => `
      <div class="saved-project-row">
        <span>${id} <span style="color:var(--muted);">— ${new Date(all[id].savedAt).toLocaleString()}</span></span>
        <span>
          <button type="button" data-load="${id}">Load</button>
          <button type="button" data-del="${id}">Delete</button>
        </span>
      </div>`).join("");
    el.querySelectorAll("[data-load]").forEach(b => b.addEventListener("click", () => loadProjectIntoWizard(SolarApp.Storage.loadProject(b.dataset.load))));
    el.querySelectorAll("[data-del]").forEach(b => b.addEventListener("click", () => { SolarApp.Storage.deleteProject(b.dataset.del); renderSavedProjects(); }));
  }

  function calculateAccuracyScore() {
    let score=0;
    if(ensureLocation()) score+=25;
    if(state.footprintSummary) score += state.footprintSummary.isFallback ? 15 : 40; else if(numVal("roofLengthM")>0 && numVal("roofWidthM")>0) score+=25;
    if(Number.isFinite(numVal("roofTilt"))) score+=5;
    if(val("roofOrientation")) score+=5;
    if(state.gsaBenchmark?.pvoutSpecific) score+=20;
    const utilityUnits=Number(val("utilityLatestUnits"));
    if(Number.isFinite(utilityUnits)&&utilityUnits>0) score+=5;
    return Math.min(100,score);
  }

  function assembleProject() {
    const cfg = quoteScopedConfig();
    const quotationNumber = document.getElementById("finalQuoteNumber").value || state.quotationNumber;
    return {
      quotationNumber,
      date: document.getElementById("custDate").value,
      cfg,
      customer: {
        name: val("custName"), mobile: val("custMobile"), email: val("custEmail"),
        address: val("custAddress"), city: val("custCity"), village: val("custVillage"), district: val("custDistrict"), pincode: val("custPincode"),
        ebBillNumber: val("ebBillNumber") || val("ebBillNumberStep4"),
        utilityBill: {
          consumerNumber: val("tnebConsumerNumber"), consumerName: val("utilityConsumerName"), tariffCategory: val("utilityTariffCategory"),
          sanctionedLoadKW: val("utilitySanctionedLoad"), connectedLoadKW: val("utilityConnectedLoad"),
          latestUnits: val("utilityLatestUnits"), latestBillAmount: val("utilityLatestBill"), billDate: val("utilityBillDate"), dueDate: val("utilityDueDate"), billingPeriod: val("utilityBillingPeriod"),
          meterNumber: val("utilityMeterNumber"), billingCycle: val("utilityBillingCycle"), history: state.utilityHistory
        },
      },
      siteSurvey: {
        orientation: val("roofOrientation"), tilt: val("roofTilt"), roofType: val("roofType"),
        parapetHeight: val("parapetHeight"), shadowObstacles: val("shadowObstacles"), treeObstruction: val("treeObstruction"),
        nearbyBuildings: val("nearbyBuildings"), electricalConnection: val("electricalConnection"),
        phase: val("connectionPhase"), sanctionedLoad: val("sanctionedLoad"), notes: val("siteNotes"),
      },
      lat: val("lat"), lon: val("lon"),
      locationMethod: (state.footprintSummary?.isFallback ? "300 sq.ft default rooftop" : (state.footprintSummary ? "KML/KMZ/map" : "manual city / coordinates")),
      accuracyScore: calculateAccuracyScore(),
      roofDimensions: { lengthM: val("roofLengthM"), widthM: val("roofWidthM") },
      footprintSummary: state.footprintSummary,
      roofCapacity: state.roofCapacity,
      consumption: state.consumption,
      sizing: { ...state.sizing, recommendedKW: state.roofCapacity?.customerMode ? state.roofCapacity.selectedCapacityKW : (parseFloat(document.getElementById("recommendedKWOverride").value) || state.sizing.recommendedKW) },
      dataSource: state.climatology ? state.climatology.source : "",
      gsaBenchmark: state.gsaBenchmark || readGsaFields(),
      generationSummary: state.generation,
      energyBalance: state.energyBalance,
      systemType: state.systemType,
      bess: { loadType: state.loadType, backupHours: state.backupHours, batterySizing: state.batteryPreview, simulation: state.bessSimulation },
      solarResourceAPI: state.solarResourceAPI,
      billComparison: state.billComparison,
      roi: (() => { const bc=state.billComparison||{}; const selected=state.onGrid||state.hybrid||state.offGrid; const gross=Number(selected?.cost?.finalPrice||0); const subsidy=Number(selected?.subsidy||0); const net=Math.max(0,gross-subsidy); const annual=Number(bc.annualSavings||0); return { currentAnnualBill:Number(bc.currentAnnualBill||0), postSolarAnnualBill:Number(bc.postSolarAnnualBill||0), annualSavings:annual, netInvestment:net, paybackYears:annual>0?net/annual:null, subsidy, grossInvestment:gross }; })(),
      chartDataUrl: getChartImageDataUrl(),
      onGrid: state.onGrid, hybrid: state.hybrid, offGrid: state.offGrid,
      comparison: state.comparison, warnings: state.warnings,
      recommendedSystemType: document.getElementById("recommendedSystemSelect").value,
      terms: (document.getElementById("termsTextarea").value || "").split("\n").filter(Boolean),
    };
  }

  // Reuses the real Chart.js canvas from Step 5 as a PNG for the PDF, so the
  // report shows the actual chart the user saw rather than a redrawn one.
  function getChartImageDataUrl() {
    try {
      const canvas = document.getElementById("genChart");
      if (!canvas || !canvas.width || !canvas.height) return null;
      return canvas.toDataURL("image/png");
    } catch (e) {
      console.warn("Chart image capture failed (PDF will skip the chart):", e);
      return null;
    }
  }

  function loadProjectIntoWizard(project) {
    if (!project) { alert("Project not found."); return; }
    setVal("custName", project.customer?.name); setVal("custMobile", project.customer?.mobile);
    setVal("custEmail", project.customer?.email); setVal("custAddress", project.customer?.address);
    setVal("custCity", project.customer?.city); setVal("custVillage", project.customer?.village); setVal("custDistrict", project.customer?.district);
    setVal("custPincode", project.customer?.pincode); setVal("ebBillNumber", project.customer?.ebBillNumber); setVal("ebBillNumberStep4", project.customer?.ebBillNumber); setVal("custQuoteNumber", project.quotationNumber);
    if(project.customer?.utilityBill) { state.utilityHistory=SolarApp.Utility.normalizeHistory(project.customer.utilityBill.history||[]); SolarApp.Utility.setFields(project.customer.utilityBill); renderUtilityHistory(state.utilityHistory); }
    setVal("finalQuoteNumber", project.quotationNumber); setVal("custDate", project.date);
    setVal("lat", project.lat); setVal("lon", project.lon); setVal("roofLengthM", project.roofDimensions?.lengthM); setVal("roofWidthM", project.roofDimensions?.widthM);

    if (project.energyBalance) state.energyBalance=project.energyBalance;
    state.systemType = project.systemType || (project.recommendedSystemType === "Hybrid" ? "hybrid" : project.recommendedSystemType === "Off-Grid" ? "off-grid" : "on-grid");
    state.loadType = project.bess?.loadType || "essential";
    state.backupHours = Number(project.bess?.backupHours || 4);
    setVal("systemType", state.systemType); setVal("loadType", state.loadType); setVal("desiredBackupHours", state.backupHours);
    if (project.bess?.batterySizing) state.batteryPreview = project.bess.batterySizing;
    if (project.bess?.simulation) state.bessSimulation = project.bess.simulation;

    if (project.footprintSummary) {
      state.footprintSummary = project.footprintSummary;
      try { SolarApp.MapView.showFootprint(project.footprintSummary.polygons); } catch (e) {}
      document.getElementById("areaReadout").textContent = `Loaded from saved project — area ${project.footprintSummary.areaM2.toFixed(1)} m²`;
      document.getElementById("roofAreaDisplay").textContent = project.footprintSummary.areaM2.toFixed(1) + " m²";
    }
    if (project.roofCapacity) {
      state.roofCapacity = project.roofCapacity;
      document.getElementById("finalCapacityDisplay").textContent = project.roofCapacity.finalCapacityKW.toFixed(2) + " kWp";
      try { renderRoofCapacity(project.roofCapacity); } catch (e) {}
    }
    if (project.consumption) state.consumption = project.consumption;
    if (project.gsaBenchmark) { state.gsaBenchmark = project.gsaBenchmark; populateGsaFields(project.gsaBenchmark); renderGsaComparison(); }
    if (project.sizing) {
      state.sizing = project.sizing;
      document.getElementById("recommendedKWOverride").value = project.sizing.recommendedKW;
    }
    if (project.onGrid) { state.onGrid = project.onGrid; state.hybrid = project.hybrid; state.offGrid = project.offGrid; state.comparison = project.comparison; state.warnings = project.warnings; renderComparisonTable(); renderWarnings(); }
    if (project.terms) document.getElementById("termsTextarea").value = project.terms.join("\n");
    if (project.recommendedSystemType) document.getElementById("recommendedSystemSelect").value = project.recommendedSystemType;
    renderBessEngine();
    goToStep(1);
    renderSiteAccuracy();
  }

  function renderStructureReference(requestedKW, wattage) {
    const title = document.getElementById("structureReferenceTitle");
    const visual = document.getElementById("structureReferenceVisual");
    const note = document.getElementById("structureReferenceNote");
    if (!title || !visual) return;
    const kw = Math.max(0.1, Number(requestedKW) || 1);
    const w = Math.max(1, Number(wattage) || 500);
    const count = Math.max(1, Math.ceil(kw * 1000 / w));
    const shown = Math.min(count, 12);
    title.textContent = `${kw.toFixed(1)} kW — reference mounting layout`;
    const cols = kw <= 1.1 ? 2 : kw <= 2.1 ? 2 : 3;
    const rows = Math.ceil(shown / cols);
    const pw = 92, ph = 48, gap = 12, pad = 28;
    const width = pad*2 + cols*pw + (cols-1)*gap;
    const height = pad*2 + rows*ph + (rows-1)*gap + 34;
    let panels = "";
    for (let i=0;i<shown;i++) {
      const r=Math.floor(i/cols), c=i%cols, x=pad+c*(pw+gap), y=pad+r*(ph+gap);
      panels += `<g><rect x="${x}" y="${y}" width="${pw}" height="${ph}" rx="4" class="ref-panel"/><path d="M${x+10} ${y+ph-8} L${x+pw/2} ${y+10} L${x+pw-10} ${y+ph-8}" class="ref-grid"/><line x1="${x+pw/2}" y1="${y+10}" x2="${x+pw/2}" y2="${y+ph-8}" class="ref-grid"/></g>`;
    }
    visual.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${kw.toFixed(1)} kW solar panel structure reference"><rect x="0" y="0" width="${width}" height="${height}" rx="14" class="ref-roof"/>${panels}<path d="M${width*0.18} ${height-20} L${width*0.5} ${height-2} L${width*0.82} ${height-20}" class="ref-rail"/><text x="${width/2}" y="${height-8}" text-anchor="middle" class="ref-text">${count} panel${count>1?'s':''} · ${w}W module reference</text></svg>`;
    note.textContent = count > shown
      ? `Total ${count} panels may be required. the first ${shown} panels are shown above as a reference. final structure spacing must be confirmed by site survey.`
      : `Total ${count} × ${w}W panel reference layout. This is for quotation/customer understanding only; it is not a structural design.`;
  }

  function renderCustomerSavings() {
    const el = document.getElementById("customerSavingsCard");
    if (!el) return;
    const sys = state.onGrid || state.hybrid || state.offGrid;
    const gen = state.generation;
    const cfg = SolarApp.Config.get();
    if (!sys && !gen) {
      el.innerHTML = `<div class="savings-head"><span class="eyebrow">Customer Benefit</span><h3>How Solar Can Reduce Your EB Cost</h3></div><div class="equation-grid"><div>Annual Generation<br><b>Solar Capacity × site-specific yield</b></div><div>Annual Savings<br><b>Generated units × ₹/unit</b></div><div>Payback<br><b>Net Investment ÷ Annual Savings</b></div></div>`;
      return;
    }
    const annualKWh = Number(gen?.annualKWh || sys?.generation?.annualKWh || 0);
    const rate = Number(sys?.savings?.energyValuePerUnit || cfg.payback?.energyValuePerUnit || 4.70);
    const annualSavings = Number(sys?.savings?.annualSavings || annualKWh * rate);
    const investment = Number(sys?.cost?.finalPrice || 0);
    const subsidy = Number(sys?.subsidy || 0);
    const net = Number(sys?.savings?.netInvestment ?? Math.max(0, investment - subsidy));
    const payback = Number(sys?.savings?.paybackYears || (annualSavings > 0 ? net / annualSavings : 0));
    const monthly = annualSavings / 12;
    const co2 = annualKWh * 0.70;
    el.innerHTML = `<div class="savings-head"><span class="eyebrow">Customer Benefit</span><h3>Solar Savings — Simple Calculation</h3></div><div class="savings-kpis"><div><small>Annual Solar Generation</small><b>${Math.round(annualKWh).toLocaleString("en-IN")} units</b></div><div><small>Estimated Annual Savings</small><b>₹${Math.round(annualSavings).toLocaleString("en-IN")}</b></div><div><small>Monthly Average Savings</small><b>₹${Math.round(monthly).toLocaleString("en-IN")}</b></div><div><small>Payback</small><b>${payback ? payback.toFixed(1)+" years" : "—"}</b></div></div><div class="equation-grid"><div>Annual Savings = <b>Annual Generation × ₹${rate.toFixed(2)}/units</b></div><div>Net Investment = <b>Quotation amount − applicable subsidy</b></div><div>Payback = <b>Net Investment ÷ Annual Savings</b></div><div>Approx. CO₂ avoided = <b>${Math.round(co2).toLocaleString("en-IN")} kg/year</b></div></div><p class="disclaimer">These are estimated calculations. tariff slabs, export/import settlement, shading, system degradation, financing and utility rules can change actual savings.</p>`;
  }

  function renderQuotationCustomerSummary() {
    const el = document.getElementById("quotationCustomerSummary");
    if (!el) return;
    const sys = document.getElementById("recommendedSystemSelect")?.value === "Hybrid" ? state.hybrid : document.getElementById("recommendedSystemSelect")?.value === "Off-Grid" ? state.offGrid : state.onGrid;
    const gen = sys?.generation || state.generation;
    const annual = Number(gen?.annualKWh || 0), rate = Number(sys?.savings?.energyValuePerUnit || SolarApp.Config.get().payback?.energyValuePerUnit || 4.70);
    const saving = Number(sys?.savings?.annualSavings || annual * rate), cost = Number(sys?.cost?.finalPrice || 0), subsidy = Number(sys?.subsidy || 0), net = Number(sys?.savings?.netInvestment ?? Math.max(0,cost-subsidy));
    const payback = Number(sys?.savings?.paybackYears || (saving ? net/saving : 0));
    el.innerHTML = `<div class="savings-head"><span class="eyebrow">CUSTOMER SUMMARY</span><h3>Key customer figures in this quotation</h3></div><div class="savings-kpis"><div><small>System</small><b>${sys?.type || "—"} · ${sys ? sys.capacityKW.toFixed(2) : "—"} kWp</b></div><div><small>Annual Generation</small><b>${annual ? Math.round(annual).toLocaleString("en-IN")+" kWh" : "—"}</b></div><div><small>Annual Savings Value</small><b>${saving ? "₹"+Math.round(saving).toLocaleString("en-IN") : "—"}</b></div><div><small>Payback</small><b>${payback ? payback.toFixed(1)+" years" : "—"}</b></div></div>`;
  }

  // ---------------- Small helpers ----------------
  function numVal(id) { return parseFloat(document.getElementById(id).value); }
  function val(id) { const el = document.getElementById(id); return el ? el.value : ""; }
  function setVal(id, v) { const el = document.getElementById(id); if (el && v !== undefined && v !== null) el.value = v; }

  document.addEventListener("DOMContentLoaded", () => {
    try {
      init();
    } catch (err) {
      // A blank page with no explanation is the worst failure mode — if setup
      // throws (a missing script, a bad CDN load, a DOM mismatch), show it.
      console.error("App failed to start:", err);
      const banner = document.createElement("div");
      banner.style.cssText = "position:fixed;top:0;left:0;right:0;z-index:9999;background:#4a1414;color:#ffb4b4;padding:14px 16px;font:14px/1.5 sans-serif;border-bottom:2px solid #E8654B;";
      banner.innerHTML = `<b>The app failed to load.</b><br>Error: ${(err && err.message) || err}` +
        `<br>Check that every file (index.html, style.css, and all the .js files) was uploaded to the same folder in your repository — open your browser's Console (⋮ menu → More tools → Developer tools) for the full technical error.`;
      document.body.prepend(banner);
    }
  });

  return { goToStep, onSettingsSaved };
})();
