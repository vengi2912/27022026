/* ==========================================================================
   roof-layout.js — roof area, geometric panel packing and customer-requested
   system sizing. Panel surface area, array layout area and usable roof area
   are intentionally kept as separate engineering quantities.
   ========================================================================== */
window.SolarApp = window.SolarApp || {};

SolarApp.RoofLayout = (function () {
  function usableArea(footprintAreaM2, roofCfg, obb = null, footprintSummary = null) {
    // The default 3 kW quotation footprint is a preliminary commercial sizing
    // assumption. Use the explicit 180 sq.ft usable area requested for that
    // fallback instead of applying survey setbacks that can falsely reject a
    // six-module reference layout. Actual KML/drawn roofs still use geometry.
    if (footprintSummary?.isFallback) {
      const fallback = Number(roofCfg.fallbackUsableRoofAreaSqFt);
      if (Number.isFinite(fallback) && fallback > 0) return Math.min(footprintAreaM2, fallback / 10.7639);
    }
    // Estimate usable roof from the actual footprint/OBB geometry instead of
    // converting setbacks into an arbitrary percentage of total area.
    const utilCap = footprintAreaM2 * (Number(roofCfg.utilizationPct) / 100);
    if (!obb || !Number.isFinite(obb.widthM) || !Number.isFinite(obb.heightM)) return Math.max(0, utilCap);
    const grossBoxArea = Math.max(0.0001, obb.widthM * obb.heightM);
    const shapeFactor = Math.min(1, Math.max(0.25, footprintAreaM2 / grossBoxArea));
    const inset = Math.max(0, Number(roofCfg.edgeSetbackM) || 0) +
                  Math.max(0, Number(roofCfg.parapetSetbackM) || 0) +
                  Math.max(0, Number(roofCfg.walkwayWidthM) || 0);
    const insetW = Math.max(0, obb.widthM - 2 * inset);
    const insetH = Math.max(0, obb.heightM - 2 * inset);
    const geometricUsable = insetW * insetH * shapeFactor;
    return Math.max(0, Math.min(utilCap, geometricUsable));
  }

  function packPanels(obb, panel, roofCfg) {
    const requested = roofCfg.panelOrientation === "landscape" ? ["landscape"] :
      roofCfg.panelOrientation === "portrait" ? ["portrait"] : ["portrait", "landscape"];
    const candidates = requested.map(orientation => {
      const panelW = orientation === "portrait" ? panel.widthMM / 1000 : panel.lengthMM / 1000;
      const panelH = orientation === "portrait" ? panel.lengthMM / 1000 : panel.widthMM / 1000;
      const inset = Math.max(0, roofCfg.edgeSetbackM) + Math.max(0, roofCfg.parapetSetbackM) + Math.max(0, roofCfg.walkwayWidthM);
      const usableW = Math.max(0, obb.widthM - 2 * inset);
      const usableH = Math.max(0, obb.heightM - 2 * inset);
      const colPitch = panelW + Math.max(0, roofCfg.columnSpacingM);
      const rowPitch = panelH + Math.max(0, roofCfg.rowSpacingM);
      const cols = Math.max(0, Math.floor((usableW + roofCfg.columnSpacingM) / colPitch));
      const rows = Math.max(0, Math.floor((usableH + roofCfg.rowSpacingM) / rowPitch));
      const panelCount = rows * cols;
      return {
        orientation, panelW, panelH, rows, cols, panelCount,
        usedAreaM2: panelCount * panelW * panelH,
        layoutAreaM2: cols && rows ? (cols * panelW + Math.max(0, cols - 1) * roofCfg.columnSpacingM) *
          (rows * panelH + Math.max(0, rows - 1) * roofCfg.rowSpacingM) : 0,
        capacityKW: panelCount * panel.wattage / 1000,
        insetM: inset, usableW, usableH, approximate: true
      };
    });
    return candidates.sort((a,b) => b.panelCount - a.panelCount || a.layoutAreaM2 - b.layoutAreaM2)[0];
  }

  // Find a rectangular row/column arrangement for exactly n panels.
  function arrangeRequestedPanels(maxPacking, requestedCount, roofCfg) {
    const n = Math.max(0, Math.floor(requestedCount));
    if (!n) return { fits: true, rows: 0, cols: 0, panelCount: 0, layoutAreaM2: 0 };
    if (n > maxPacking.panelCount) return { fits: false, rows: 0, cols: 0, panelCount: 0, layoutAreaM2: Infinity };

    let best = null;
    for (let rows = 1; rows <= maxPacking.rows; rows++) {
      const cols = Math.ceil(n / rows);
      if (cols > maxPacking.cols) continue;
      const layoutW = cols * maxPacking.panelW + Math.max(0, cols - 1) * roofCfg.columnSpacingM;
      const layoutH = rows * maxPacking.panelH + Math.max(0, rows - 1) * roofCfg.rowSpacingM;
      const area = layoutW * layoutH;
      const unused = rows * cols - n;
      const score = [unused, area];
      if (!best || score[0] < best.score[0] || (score[0] === best.score[0] && score[1] < best.score[1])) {
        best = { rows, cols, panelCount: n, layoutAreaM2: area, layoutW, layoutH, score };
      }
    }
    return best ? { ...best, fits: true, orientation: maxPacking.orientation, panelW: maxPacking.panelW, panelH: maxPacking.panelH } : { fits: false, rows: 0, cols: 0, panelCount: 0, layoutAreaM2: Infinity };
  }

  function computeRoofCapacity(footprintSummary, panel, roofCfg, customerRequest = {}) {
    const areaM2 = footprintSummary.areaM2;
    const usableAreaM2 = usableArea(areaM2, roofCfg, footprintSummary.obb, footprintSummary);
    const panelAreaM2 = (panel.lengthMM / 1000) * (panel.widthMM / 1000);
    const simplePanelCount = Math.floor(usableAreaM2 / panelAreaM2);
    const packingCfg = footprintSummary.isFallback ? {
      ...roofCfg,
      edgeSetbackM: 0.05,
      parapetSetbackM: 0,
      walkwayWidthM: 0,
      rowSpacingM: Math.min(Number(roofCfg.rowSpacingM) || 0.3, 0.15),
      columnSpacingM: Math.min(Number(roofCfg.columnSpacingM) || 0.02, 0.02),
      panelOrientation: "auto"
    } : roofCfg;
    const packingObb = footprintSummary.isFallback
      ? { widthM: 7.0, heightM: 4.0 }
      : footprintSummary.obb;
    const packing = packPanels(packingObb, panel, packingCfg);
    const finalPanelCount = Math.min(simplePanelCount, packing.panelCount);
    const finalCapacityKW = finalPanelCount * panel.wattage / 1000;

    const mode = customerRequest.mode || "auto";
    const requestedKW = Number(customerRequest.requestedKW);
    let selectedPanelCount = finalPanelCount;
    let selectedCapacityKW = finalCapacityKW;
    let selectedLayout = { ...packing, panelCount: finalPanelCount, layoutAreaM2: packing.layoutAreaM2 };
    let fitStatus = "AUTO / MAXIMUM CAPACITY";

    if (mode === "customer" && Number.isFinite(requestedKW) && requestedKW > 0) {
      selectedPanelCount = Math.ceil((requestedKW * 1000) / panel.wattage);
      selectedCapacityKW = selectedPanelCount * panel.wattage / 1000;
      selectedLayout = arrangeRequestedPanels(packing, selectedPanelCount, packingCfg);
      const fitsGeometry = !!selectedLayout.fits;
      const fitsArea = selectedLayout.layoutAreaM2 <= usableAreaM2 + 1e-9;
      const fits = fitsGeometry && fitsArea;
      fitStatus = fits ? "FITS ON USABLE ROOF" : "DOES NOT FIT ON USABLE ROOF";
    }

    const selectedSurfaceAreaM2 = selectedPanelCount * panelAreaM2;
    const selectedLayoutAreaM2 = Number.isFinite(selectedLayout.layoutAreaM2) ? selectedLayout.layoutAreaM2 : Infinity;
    const remainingUsableAreaM2 = Math.max(0, usableAreaM2 - (Number.isFinite(selectedLayoutAreaM2) ? selectedLayoutAreaM2 : usableAreaM2));

    return {
      footprintAreaM2: areaM2, usableAreaM2, simplePanelCount, packing,
      finalPanelCount, finalCapacityKW,
      usedAreaM2: finalPanelCount * panelAreaM2,
      remainingAreaM2: Math.max(0, usableAreaM2 - (packing.layoutAreaM2 || 0)),
      panel, panelAreaM2,
      customerMode: mode === "customer", requestedCapacityKW: mode === "customer" ? requestedKW : null,
      selectedPanelCount, selectedCapacityKW, selectedSurfaceAreaM2,
      selectedLayoutAreaM2, remainingUsableAreaM2, fitStatus, selectedLayout
    };
  }

  return { usableArea, packPanels, arrangeRequestedPanels, computeRoofCapacity };
})();
