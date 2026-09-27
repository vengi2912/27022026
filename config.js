/* ==========================================================================
   config.js — all editable defaults live here. Nothing else in the app
   should hard-code a price, a panel spec, or a tariff number: everything
   reads from window.SolarApp.Config (which is loaded from localStorage on
   top of these defaults, so the user's edits in Settings persist).
   ========================================================================== */
window.SolarApp = window.SolarApp || {};

SolarApp.Config = (function () {

  const DEFAULTS = {
    company: {
      name: "Vengateshwara Energy System",
      tagline: "Energy For A Brighter Tomorrow",
      address: "Musiri, Tiruchirappalli District, Tamil Nadu",
      phone: "+91 00000 00000",
      email: "info@vengateshwaraenergy.example",
      website: "www.vengateshwaraenergy.example",
      gstin: "",
      logoDataUrl: "", // filled from Settings (base64 image), optional
      quotationPrefix: "VES-SOLAR",
      yearsExperience: 0, // honest default — fill in Settings with your real number

      intro: "We are a solar EPC company providing end-to-end rooftop solar solutions — from site survey and system design to installation, subsidy paperwork, and after-sales service. Edit this introduction in Settings → Company Profile to describe your business.",

      services: [
        "Solar Rooftop Power Plants",
        "Solar On-Grid Systems",
        "Solar Hybrid Systems",
        "Solar Off-Grid Systems",
      ],

      whyChooseUs: [
        "Transparent, itemised pricing — no hidden costs",
        "Subsidy and net-metering paperwork support",
        "Only ALMM-listed, certified panels and inverters",
        "Dedicated after-sales service",
      ],

      installationSupport: [
        "Free site survey",
        "System design and engineering",
        "Subsidy & DISCOM paperwork assistance",
        "Bank loan assistance",
      ],

      // Honest defaults — all 0 until you enter your real numbers in Settings.
      // The PDF only shows a stat badge if its value is greater than 0.
      stats: { projectsDone: 0, happyClients: 0, mwInstalled: 0, yearsInBusiness: 0 },

      qualityStandards: [
        { product: "Solar Panels", standard: "IS & IEC certified; DCR & ALMM approved for subsidy-eligible projects" },
        { product: "Inverters", standard: "Built-in surge protection, low-startup voltage, overvoltage & short-circuit protection" },
        { product: "Mounting Structures", standard: "Hot-dip galvanized, wind-load rated to local standards" },
        { product: "Cables", standard: "UV- and fire-resistant copper cabling, DC and AC" },
        { product: "Earthing", standard: "Copper-bonded earthing with chemical earthing compound" },
      ],

      bank: { bankName: "", accountName: "", accountNumber: "", ifsc: "" },
    },

    utility: {
      billImportMode: "client-side-bill-upload",
      note: "TNEB/TNPDCL data is read from the customer-supplied bill in the browser. No portal username/password is required."
    },

    quotationMeta: {
      proposalValidityDays: 10,
      paymentMilestones: [
        "70% of the contract price as advance along with Purchase Order",
        "25% of the contract price on installation of the system",
        "5% of the contract price on net-meter installation",
      ],
    },

    // Central subsidy slabs (illustrative — PM Surya Ghar-style; verify current amounts before quoting)
    subsidy: {
      enabled: true,
      note: "PM Surya Ghar Muft Bijli Yojana — central subsidy amount shown is illustrative; confirm the current scheme amount before quoting.",
      slabsByKW: [
        { uptoKW: 1, amount: 30000 },
        { uptoKW: 2, amount: 60000 },
        { uptoKW: Infinity, amount: 78000 },
      ],
    },

    // ---- Panel database (ALMM-style entries; user edits freely) ----
    panels: [
      { id: "p540", manufacturer: "Waaree", model: "540W Mono PERC", wattage: 540, lengthMM: 2278, widthMM: 1134, thicknessMM: 30, efficiencyPct: 20.9, warrantyYears: 25, pricePerPanel: 12500, priceMin: 11880, priceMax: 15120, sourceNote: "Brand reference: ₹22–₹28/W; quotation price is editable." },
      { id: "p550", manufacturer: "Adani Solar", model: "550W Mono PERC", wattage: 550, lengthMM: 2278, widthMM: 1134, thicknessMM: 30, efficiencyPct: 21.2, warrantyYears: 25, pricePerPanel: 12800, priceMin: 12100, priceMax: 15400, sourceNote: "Brand reference: ₹22–₹28/W; quotation price is editable." },
      { id: "p575", manufacturer: "Tata Power Solar", model: "575W Mono PERC", wattage: 575, lengthMM: 2384, widthMM: 1303, thicknessMM: 30, efficiencyPct: 21.5, warrantyYears: 25, pricePerPanel: 14500, priceMin: 13800, priceMax: 17250, sourceNote: "Reference range based on Tata ₹24–₹30/W; exact 575W availability/dimensions must be confirmed from manufacturer datasheet." },
      { id: "p600", manufacturer: "Vikram Solar", model: "600W TOPCon", wattage: 600, lengthMM: 2465, widthMM: 1134, thicknessMM: 30, efficiencyPct: 22.0, warrantyYears: 30, pricePerPanel: 16500, priceMin: 16800, priceMax: 21000, sourceNote: "Reference technology range: TOPCon ₹28–₹35/W; exact model/dimensions must be confirmed." },
      // All 10 source-listed VES 2026 reference models are selectable in the list.
      // Where the source does not supply exact model geometry/price, those fields stay blank
      // and the app asks the user to configure the exact manufacturer datasheet values before roof calculation.
      { id:"ref-navitas-mono", manufacturer:"Navitas", model:"Mono-PERC Half-Cut Bifacial", wattage:null, wattageLabel:"480–500W", lengthMM:0, widthMM:0, thicknessMM:0, efficiencyPct:21.06, warrantyYears:25, pricePerPanel:0, priceMin:0, priceMax:0, referenceOnly:true, sourceNote:"Source: 480–500W; exact model dimensions and exact dealer price not supplied. Configure exact datasheet values before roof geometry/quotation." },
      { id:"ref-navisol-400", manufacturer:"Navitas", model:"Navisol 72-Cell", wattage:400, wattageLabel:"400W", lengthMM:0, widthMM:0, thicknessMM:0, efficiencyPct:20.15, warrantyYears:25, pricePerPanel:0, priceMin:0, priceMax:0, referenceOnly:true, sourceNote:"Source: 400W. Exact model dimensions/price not supplied. The guide gives a typical 400W size separately; confirm manufacturer datasheet before geometry." },
      { id:"ref-premier-p", manufacturer:"Premier Energies", model:"P-type Bifacial", wattage:null, wattageLabel:"Variable", lengthMM:0, widthMM:0, thicknessMM:0, efficiencyPct:21, warrantyYears:30, pricePerPanel:0, priceMin:0, priceMax:0, referenceOnly:true, sourceNote:"Source: variable wattage, 21%+ efficiency. Exact model wattage, dimensions and price not supplied." },
      { id:"ref-renew-560", manufacturer:"ReNew", model:"560Wp Bifacial", wattage:560, wattageLabel:"560W", lengthMM:0, widthMM:0, thicknessMM:0, efficiencyPct:21.68, warrantyYears:30, pricePerPanel:0, priceMin:0, priceMax:0, referenceOnly:true, sourceNote:"Source: 560W. Exact model dimensions and price not supplied." },
      { id:"ref-navitas-topcon", manufacturer:"Navitas", model:"N-type TOPCon Half-Cut", wattage:null, wattageLabel:"Variable", lengthMM:0, widthMM:0, thicknessMM:0, efficiencyPct:22, warrantyYears:25, pricePerPanel:0, priceMin:0, priceMax:0, referenceOnly:true, sourceNote:"Source: variable wattage, >22% efficiency. Exact model wattage, dimensions and price not supplied." },
      { id:"ref-goldi-gs10", manufacturer:"Goldi Solar", model:"GS10-M156-WF", wattage:null, wattageLabel:"Variable", lengthMM:0, widthMM:0, thicknessMM:0, efficiencyPct:21.5, warrantyYears:25, pricePerPanel:0, priceMin:0, priceMax:0, referenceOnly:true, sourceNote:"Source: variable wattage, 21.5% efficiency. Exact model wattage, dimensions and price not supplied." },
      { id:"ref-vikram-paradea", manufacturer:"Vikram Solar", model:"Paradea Bifacial", wattage:null, wattageLabel:"590–615W", lengthMM:0, widthMM:0, thicknessMM:0, efficiencyPct:21.73, warrantyYears:30, pricePerPanel:0, priceMin:0, priceMax:0, referenceOnly:true, sourceNote:"Source: 590–615W. Exact model dimensions and exact dealer price not supplied." },
      { id:"ref-jakson-helia", manufacturer:"Jakson Solar", model:"Helia-Plus Bifacial", wattage:null, wattageLabel:"490–510W", lengthMM:0, widthMM:0, thicknessMM:0, efficiencyPct:21.5, warrantyYears:30, pricePerPanel:0, priceMin:0, priceMax:0, referenceOnly:true, sourceNote:"Source: 490–510W. Exact model dimensions and exact dealer price not supplied." },
      { id:"ref-panasonic-evervolt", manufacturer:"Panasonic", model:"EVERVOLT H-Series", wattage:null, wattageLabel:"400–410W", lengthMM:0, widthMM:0, thicknessMM:0, efficiencyPct:21.9, warrantyYears:25, pricePerPanel:0, priceMin:0, priceMax:0, referenceOnly:true, sourceNote:"Source: 400–410W, 21.6–22.2%. Exact model dimensions/price not supplied." },
      { id:"ref-waaree-aditya", manufacturer:"Waaree Energies", model:"Aditya Series", wattage:null, wattageLabel:"325–350W", lengthMM:0, widthMM:0, thicknessMM:0, efficiencyPct:16.765, warrantyYears:25, pricePerPanel:0, priceMin:0, priceMax:0, referenceOnly:true, sourceNote:"Source: 325–350W, 16.14–17.39%. Exact model dimensions/price not supplied." },
    ],
    defaultPanelId: "p550",

    // ---- Inverter database ----
    inverters: [
      { id: "inv-og-3k", manufacturer: "Growatt", model: "MIN 3000TL-X", type: "on-grid", capacityKW: 3, efficiencyPct: 97.6, warrantyYears: 10, price: 28000 },
      { id: "inv-og-5k", manufacturer: "Growatt", model: "MIN 5000TL-X", type: "on-grid", capacityKW: 5, efficiencyPct: 98.0, warrantyYears: 10, price: 42000 },
      { id: "inv-og-10k", manufacturer: "Growatt", model: "MID 10KTL3-X", type: "on-grid", capacityKW: 10, efficiencyPct: 98.2, warrantyYears: 10, price: 78000 },
      { id: "inv-hy-5k", manufacturer: "Luminous", model: "Hybrid NXG+ 5kVA", type: "hybrid", capacityKW: 5, efficiencyPct: 96.5, warrantyYears: 5, price: 95000 },
      { id: "inv-hy-8k", manufacturer: "Growatt", model: "SPH 8000", type: "hybrid", capacityKW: 8, efficiencyPct: 97.0, warrantyYears: 5, price: 140000 },
      { id: "inv-og-off-3k", manufacturer: "Microtek", model: "Off-Grid 3kVA", type: "off-grid", capacityKW: 3, efficiencyPct: 92.0, warrantyYears: 3, price: 32000 },
      { id: "inv-og-off-5k", manufacturer: "Microtek", model: "Off-Grid 5kVA", type: "off-grid", capacityKW: 5, efficiencyPct: 92.5, warrantyYears: 3, price: 55000 },
    ],

    // ---- Battery database ----
    batteries: [
      { id: "b-lfp-5", manufacturer: "Luminous", model: "LiFePO4 5.12kWh", chemistry: "LiFePO4", voltage: 51.2, capacityKWh: 5.12, dodPct: 90, roundtripEffPct: 95, cycleLife: 6000, warrantyYears: 10, price: 145000 },
      { id: "b-lfp-10", manufacturer: "Luminous", model: "LiFePO4 10.24kWh", chemistry: "LiFePO4", voltage: 51.2, capacityKWh: 10.24, dodPct: 90, roundtripEffPct: 95, cycleLife: 6000, warrantyYears: 10, price: 275000 },
      { id: "b-lead-3", manufacturer: "Exide", model: "Tubular Lead-Acid 150Ah", chemistry: "Lead-Acid", voltage: 12, capacityKWh: 1.8, dodPct: 50, roundtripEffPct: 80, cycleLife: 1500, warrantyYears: 3, price: 18000 },
    ],
    defaultBatteryId: "b-lfp-5",

    // Reference catalogue shown in the application. Battery prices are quotation defaults
    // and are editable because the supplied 2026 reference PDFs do not contain a battery price list.
    // Source-derived reference panel catalogue. These are NOT silently treated as exact
    // engineering models when the source gives only a wattage range or brand-level pricing.
    // Exact dimensions and dealer price must be entered in the editable Panels database
    // before using a reference entry for final roof geometry/quotation.
    referencePanelCatalogue: [
      {id:"ref-navitas-mono", brand:"Navitas", model:"Mono-PERC Half-Cut Bifacial", technology:"Mono-PERC / Bifacial", wattageLabel:"480–500W", efficiencyLabel:"21.06%", warranty:"12 yr product / 25 yr performance", priceRangePerW:"Not supplied for this exact model", sizeNote:"Exact model dimensions not supplied; use manufacturer datasheet", source:"VES Solar Technical Reference, 2026"},
      {id:"ref-navisol-400", brand:"Navitas", model:"Navisol 72-Cell", technology:"Mono / 72-Cell", wattageLabel:"400W", efficiencyLabel:"20.15%", warranty:"10 yr product / 25 yr performance", priceRangePerW:"Not supplied for this exact model", sizeNote:"Typical 400W source size: 1722 × 1133 × 30 mm", source:"VES Solar Technical Reference, 2026"},
      {id:"ref-premier-p", brand:"Premier Energies", model:"P-type Bifacial", technology:"P-type Bifacial", wattageLabel:"Variable", efficiencyLabel:"21%+", warranty:"12 yr product / 30 yr performance", priceRangePerW:"Not supplied for this exact model", sizeNote:"Exact model dimensions not supplied", source:"VES Solar Technical Reference, 2026"},
      {id:"ref-renew-560", brand:"ReNew", model:"560Wp Bifacial", technology:"Bifacial / Half-cut", wattageLabel:"560W", efficiencyLabel:"21.68%", warranty:"12 yr product / 30 yr performance", priceRangePerW:"Not supplied for this exact model", sizeNote:"Exact model dimensions not supplied; typical 580W source size is 2280 × 1134 × 30 mm", source:"VES Solar Technical Reference, 2026"},
      {id:"ref-navitas-topcon", brand:"Navitas", model:"N-type TOPCon Half-Cut", technology:"N-type TOPCon", wattageLabel:"Variable", efficiencyLabel:">22%", warranty:"10 yr product / 25 yr performance", priceRangePerW:"Not supplied for this exact model", sizeNote:"Exact model dimensions not supplied", source:"VES Solar Technical Reference, 2026"},
      {id:"ref-goldi-gs10", brand:"Goldi Solar", model:"GS10-M156-WF", technology:"Mono", wattageLabel:"Variable", efficiencyLabel:"21.5%", warranty:"12 yr product / 25 yr performance", priceRangePerW:"Not supplied for this exact model", sizeNote:"Exact model dimensions not supplied", source:"VES Solar Technical Reference + market brand reference"},
      {id:"ref-vikram-paradea", brand:"Vikram Solar", model:"Paradea Bifacial", technology:"Bifacial", wattageLabel:"590–615W", efficiencyLabel:"21.73%", warranty:"12 yr product / 30 yr performance", priceRangePerW:"₹23–₹29/Wp", sizeNote:"Exact model dimensions not supplied", source:"VES Solar Technical Reference + market brand reference"},
      {id:"ref-jakson-helia", brand:"Jakson Solar", model:"Helia-Plus Bifacial", technology:"Bifacial", wattageLabel:"490–510W", efficiencyLabel:"21.50%", warranty:"12 yr product / 30 yr performance", priceRangePerW:"Not supplied in market PDF", sizeNote:"Exact model dimensions not supplied", source:"VES Solar Technical Reference, 2026"},
      {id:"ref-panasonic-evervolt", brand:"Panasonic", model:"EVERVOLT H-Series", technology:"Half-cut", wattageLabel:"400–410W", efficiencyLabel:"21.6–22.2%", warranty:"25 yr full warranty", priceRangePerW:"Not supplied in market PDF", sizeNote:"Exact model dimensions not supplied; typical 400W source size: 1722 × 1133 × 30 mm", source:"VES Solar Technical Reference, 2026"},
      {id:"ref-waaree-aditya", brand:"Waaree Energies", model:"Aditya Series", technology:"Mono", wattageLabel:"325–350W", efficiencyLabel:"16.14–17.39%", warranty:"10 yr product / 25 yr performance", priceRangePerW:"₹22–₹28/Wp", sizeNote:"Exact model dimensions not supplied", source:"VES Solar Technical Reference + market brand reference"}
    ],
    marketPanelBrands: [
      {brand:"Tata Power Solar", technology:"Mono PERC, Bifacial", wattageRange:"400–540W", pricePerW:"₹24–₹30/W", warranty:"25 years performance"},
      {brand:"Adani Solar", technology:"Mono PERC, Bifacial, TOPCon", wattageRange:"440–585W", pricePerW:"₹22–₹28/W", warranty:"25–30 years performance"},
      {brand:"Vikram Solar", technology:"Mono PERC, Bifacial", wattageRange:"400–545W", pricePerW:"₹23–₹29/W", warranty:"25 years performance"},
      {brand:"Waaree Energies", technology:"Mono PERC, Bifacial, TOPCon", wattageRange:"440–600W", pricePerW:"₹22–₹28/W", warranty:"25–30 years performance"},
      {brand:"Renewsys", technology:"Mono PERC, Bifacial", wattageRange:"400–540W", pricePerW:"₹22–₹27/W", warranty:"25 years"},
      {brand:"Loom Solar", technology:"Mono PERC", wattageRange:"440–550W", pricePerW:"₹24–₹30/W", warranty:"25 years performance"},
      {brand:"Luminous (Schneider)", technology:"Mono PERC", wattageRange:"400–545W", pricePerW:"₹25–₹31/W", warranty:"25 years performance"},
      {brand:"Havells Solar", technology:"Mono PERC", wattageRange:"440–540W", pricePerW:"₹25–₹30/W", warranty:"25 years performance"},
      {brand:"Microtek Solar", technology:"Mono PERC", wattageRange:"400–540W", pricePerW:"₹22–₹27/W", warranty:"25 years performance"},
      {brand:"Patanjali Solar", technology:"Mono PERC", wattageRange:"400–540W", pricePerW:"₹20–₹25/W", warranty:"25 years performance"},
      {brand:"Jinko Solar", technology:"Mono PERC, TOPCon, Tiger Neo", wattageRange:"Not supplied", pricePerW:"₹20–₹26/W", warranty:"Not supplied"},
      {brand:"LONGi Green Energy", technology:"Mono PERC, HiMO series", wattageRange:"Not supplied", pricePerW:"₹20–₹25/W", warranty:"Not supplied"},
      {brand:"Canadian Solar", technology:"Mono PERC, Bifacial, HiKu", wattageRange:"Not supplied", pricePerW:"₹22–₹28/W", warranty:"Not supplied"},
      {brand:"JA Solar", technology:"Mono PERC, Bifacial", wattageRange:"Not supplied", pricePerW:"₹20–₹26/W", warranty:"Not supplied"},
      {brand:"REC Group", technology:"HJT, Alpha series", wattageRange:"Not supplied", pricePerW:"₹35–₹42/W", warranty:"Not supplied"}
    ],

    productCatalogue: {
      panelSource: "Venkateshwara Energy System Solar Technical Reference 2026 + Solar Panel Price List India 2026",
      batterySource: "Configured EPC quotation catalogue — verify current dealer/manufacturer quote",
      notes: [
        "Panel price ranges are reference market ranges; final purchase price must be confirmed with authorised dealer.",
        "Panel dimensions used for roof geometry must be confirmed against the exact manufacturer datasheet before installation.",
        "Battery models/prices are editable EPC defaults; the supplied reference documents did not provide a battery price table."
      ]
    },

    // ---- BOM component pricing (per-Wp or flat, user editable) ----
    bomPricing: {
      mountingStructurePerWp: 4.5,      // ₹ per Wp of DC capacity
      dcCablePerKW: 900,                // ₹ per kW
      acCablePerKW: 700,                // ₹ per kW
      dcdbFlat: 3500,
      acdbFlat: 3500,
      earthingFlat: 6000,
      lightningArresterFlat: 4500,
      mc4ConnectorsPerKW: 350,
      civilWorkPerKW: 1200,
      otherChargesPerKW: 500,
    },

    installation: {
      method: "percentage",     // "percentage" | "fixed"
      percentageOfEquipment: 8, // %
      fixedAmount: 25000,       // ₹
      transportationFlat: 6000,
    },

    amc: {
      onGridPerYearPerKW: 800,
      hybridOffGridPerYearPerKW: 1400,   // includes battery inspection/backup test
    },

    // GST as commonly billed on solar EPC in India: a lower rate on the panel/module
    // portion of the cost and a higher rate on the balance-of-system/services portion.
    // Defaults below mirror a real market quotation (5% on ~70% of project cost,
    // 18% on the remaining ~30%) — EDIT the split and rates to your CA's guidance,
    // or switch mode to "flat" to use a single blended percentage instead.
    gst: {
      mode: "split",       // "split" | "flat"
      splitLowSharePct: 70,  // % of project cost taxed at the lower rate (typically the panels)
      splitLowRatePct: 5,
      splitHighRatePct: 18,  // remaining share taxed at this rate (structure, inverter, labour, BOS)
      flatPct: 13.8,          // used only when mode = "flat"
    },

    tariff: {
      version: "TNEB / TNPDCL LT Domestic — 2026 reference model (verify against current tariff order/bill)",
      asOf: "2026-09",
      slabsPerUnit: [
        { uptoUnits: 100, rate: 0 },
        { uptoUnits: 200, rate: 2.35 },
        { uptoUnits: 400, rate: 4.7 },
        { uptoUnits: Infinity, rate: 6.35 },
      ],
      flatRateFallback: 6.35, // used for quick estimates when slab calc isn't needed
      fixedChargePerMonth: 0, // configurable; keep 0 until the applicable bill/tariff order is verified
      demandCharge: 0,
    },

    // ---- Payback valuation ----
    // Payback is intentionally based on generated solar units × the configured
    // value of one avoided/imported unit, not on the customer's slab-average bill rate.
    payback: {
      energyValuePerUnit: 4.70,
      basis: "gross_generation", // generated units are valued at the configured ₹/unit
      useNetInvestmentAfterSubsidy: true,
    },

    // ---- Roof / usable-area defaults ----
    roof: {
      defaultSystemKW: 3,
      fallbackRoofAreaSqFt: 300,
      fallbackUsableRoofAreaSqFt: 180,
      fallbackRoofLengthM: 6.096,
      fallbackRoofWidthM: 4.572,
      utilizationPct: 65,      // fallback flat factor if geometric packing isn't used
      edgeSetbackM: 0.5,
      parapetSetbackM: 1.0,
      walkwayWidthM: 0.6,
      rowSpacingM: 0.3,
      columnSpacingM: 0.02,
      panelOrientation: "portrait", // "portrait" | "landscape"
    },

    // ---- PV system losses (each a fractional derate, editable) ----
    losses: {
      temperaturePct: 6,
      inverterPct: 3,
      cablePct: 2,
      soilingPct: 3,
      mismatchPct: 2,
      shadingPct: 3,
      availabilityPct: 2,
    },

    battery: {
      dodOverridePct: null, // null = use battery DB value
      systemLossPct: 8,     // additional losses in hybrid/off-grid battery loop
    },
  };

  const STORAGE_KEY = "musiriSolar.config.v1";

  function load() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return normalizeTariffInfinity(structuredClone(DEFAULTS));
      const parsed = JSON.parse(saved);
      // shallow-merge so new default fields introduced by app updates aren't lost
      return normalizeTariffInfinity(deepMerge(structuredClone(DEFAULTS), parsed));
    } catch (e) {
      console.warn("Config load failed, using defaults:", e);
      return normalizeTariffInfinity(structuredClone(DEFAULTS));
    }
  }

  // JSON has no Infinity — JSON.stringify silently turns it into null when the
  // config is persisted to localStorage. Both the tariff's "unbounded last slab"
  // and the subsidy's "highest slab" use Infinity as a sentinel, so every load
  // restores null/undefined back to Infinity in both places.
  function normalizeTariffInfinity(cfg) {
    if (cfg && cfg.tariff && Array.isArray(cfg.tariff.slabsPerUnit)) {
      cfg.tariff.slabsPerUnit = cfg.tariff.slabsPerUnit.map(slab => ({
        ...slab,
        uptoUnits: (slab.uptoUnits === null || slab.uptoUnits === undefined) ? Infinity : slab.uptoUnits,
      }));
    }
    if (cfg && cfg.subsidy && Array.isArray(cfg.subsidy.slabsByKW)) {
      cfg.subsidy.slabsByKW = cfg.subsidy.slabsByKW.map(slab => ({
        ...slab,
        uptoKW: (slab.uptoKW === null || slab.uptoKW === undefined) ? Infinity : slab.uptoKW,
      }));
    }
    return cfg;
  }

  function deepMerge(base, override) {
    for (const k in override) {
      if (override[k] && typeof override[k] === "object" && !Array.isArray(override[k]) && base[k]) {
        base[k] = deepMerge(base[k], override[k]);
      } else {
        base[k] = override[k];
      }
    }
    return base;
  }

  let current = load();

  function get() { return current; }
  function save(newConfig) {
    current = newConfig;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  }
  function resetToDefaults() {
    current = normalizeTariffInfinity(structuredClone(DEFAULTS));
    localStorage.removeItem(STORAGE_KEY);
    return current;
  }
  function nextQuotationNumber() {
    const year = new Date().getFullYear();
    const counterKey = "musiriSolar.quoteCounter." + year;
    let n = parseInt(localStorage.getItem(counterKey) || "0", 10) + 1;
    localStorage.setItem(counterKey, String(n));
    return `${current.company.quotationPrefix}-${year}-${String(n).padStart(4, "0")}`;
  }

  // Looks up the subsidy amount for a given system capacity from the configured
  // slabs (smallest slab whose uptoKW >= capacityKW; falls back to the highest slab).
  function subsidyForCapacity(capacityKW) {
    const s = current.subsidy;
    if (!s || !s.enabled || !Array.isArray(s.slabsByKW) || s.slabsByKW.length === 0) return 0;
    const sorted = [...s.slabsByKW].sort((a, b) => a.uptoKW - b.uptoKW);
    const match = sorted.find(slab => capacityKW <= slab.uptoKW);
    return (match || sorted[sorted.length - 1]).amount;
  }

  return { get, save, resetToDefaults, nextQuotationNumber, subsidyForCapacity, DEFAULTS };
})();
