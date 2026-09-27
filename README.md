# Musiri Solar Quotation & Site Analysis

A professional, offline-capable Solar Site Analysis + System Sizing + Quotation Generator built for a solar EPC business in **Musiri, Tiruchirappalli, Tamil Nadu**. Runs entirely in the browser — no backend, no server, no build step, no API keys.

This is an upgrade of an earlier single-page rooftop solar estimator. The upgrade **kept and reused** everything that already worked well (KML/KMZ parsing, area/centroid math, the 3-source climate-data fallback chain) and **added** a full 9-step quotation workflow: customer intake → site & footprint → roof capacity & panel layout → electricity consumption → solar system sizing → battery sizing → pricing → On-Grid/Hybrid/Off-Grid comparison → final PDF quotation.

## What's new vs. the earlier estimator

| Area | Earlier version | This upgrade |
|---|---|---|
| Footprint input | KML, KMZ | KML, KMZ, **+ GeoJSON** (Shapefile ZIP intentionally not supported — see Limitations) |
| Panel count | `usable area ÷ panel area` | Same cross-check, **plus** real rows×columns rectangular packing inside the roof's oriented bounding box |
| Roof area | Flat 65% utilization factor | Configurable edge/parapet setback, walkway width, row/column spacing — editable per quotation |
| Panels/inverters/batteries | Fixed defaults in code | **Fully editable databases** in Settings (add/edit/delete rows) |
| Pricing | Two numbers ($/W, tariff) | **Full BOM** (structure, cabling, DCDB/ACDB, earthing, lightning arrester, MC4, civil work), configurable installation (%, or fixed), transport, GST, AMC |
| System types | One (on-grid only) | **On-Grid, Hybrid, Off-Grid** — sized, priced, and compared side-by-side, with an auto-recommendation |
| Output | Feasibility PDF | **Professional quotation PDF** — company header/logo, customer details, site analysis, all 3 proposals with itemised BOM, comparison table, warranty, terms, quotation number |
| Data persistence | None | Save/Load/Export/Import project as JSON (localStorage + file) |
| Site survey | Not present | Orientation, tilt, roof type, parapet height, shading/tree obstruction, connection type, phase, sanctioned load, notes |

## Architecture

Deliberately modular — no single "do everything" file (per your requirement #29). **All files sit flat in one folder (no subfolders)** — this is intentional: uploading to GitHub from a phone can't preserve nested folder structure (see "Deploying from mobile" below), so a flat layout avoids that entire class of broken-path bug.

```
musiri-solar/
├── index.html          # 9-step wizard UI + Settings modal
├── style.css            # dashboard styling (dark, gold/teal accents)
├── config.js            # ALL editable defaults: company, panel/inverter/battery DBs,
│                           BOM pricing, installation, AMC, GST, tariff, roof defaults, losses
├── geo.js                # KML/KMZ/GeoJSON parsing; pure geometry (area, perimeter,
│                            centroid, oriented bounding box) — no DOM code
├── climate.js              # NASA POWER → Open-Meteo → PVGIS fallback (reused, proven)
├── roof-layout.js          # usable area + rows×cols panel-packing algorithm
├── generation.js            # PV generation model with 7 configurable loss factors
├── sizing.js                 # roof-capacity-based vs consumption-based sizing; battery sizing
├── pricing.js                 # BOM cost build, installation, AMC, savings/payback
├── quotation.js                 # orchestrates the above into On-Grid/Hybrid/Off-Grid proposals,
│                                    the comparison table, and validation warnings
├── storage.js                    # project save/load/export/import (localStorage + JSON file)
├── pdf.js                          # professional multi-page quotation PDF builder
├── map.js                            # Leaflet: street/satellite layers, draw/edit footprint,
│                                        approximate panel-layout overlay
├── charts.js                           # Chart.js monthly-generation bar chart
├── settings-ui.js                        # renders/reads every editable database into the Settings modal
├── app.js                                  # wizard navigation + wires all the above to the DOM —
│                                              contains NO calculation logic itself; if startup fails
│                                              for any reason, it shows a visible red error banner
│                                              instead of a silent blank page
├── sample-footprint.kml / .kmz    # test files
└── LICENSE
```

Nothing calculates a number using a value that isn't in `SolarApp.Config` — every price, loss factor, setback, and tariff slab is editable from the Settings modal (⚙ top-right) and persists in the browser's localStorage.

## Deploying from mobile (important)

Uploading via a phone's GitHub web UI has one sharp edge: the mobile file picker generally **cannot upload folders**, only individual files. If this app were split across a `js/` subfolder, that subfolder would either get skipped entirely or its files would land flattened at the repo root — either way, every `<script src="js/....js">` reference would 404, JavaScript would never run, and the page would render as a mostly-blank shell (header and static text only, no wizard steps) — exactly the failure this app hit before this fix.

**Because of this, every file in this project is flat with no subfolder.** To deploy:

1. Unzip the download.
2. In your GitHub repo: **Add file → Upload files**.
3. Select **all files at once** (index.html, style.css, every `.js` file, the sample KML/KMZ, LICENSE) from the unzipped folder — do not upload a folder, upload the files.
4. Commit, then enable **Settings → Pages → Deploy from branch → main / (root)**.
5. Open the Pages URL and confirm the 9-step wizard actually appears below the header (not just the title and a line of grey text) — if it doesn't, open your browser's Console (⋮ menu → More tools → Developer tools on desktop Chrome, or connect the phone to a desktop via `chrome://inspect` for mobile Chrome) and check for a red error — the app now also prints a visible red banner at the top of the page itself describing what failed, so no browser dev tools are strictly required to notice something's wrong.

## Running it

No install needed:

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

Or open `index.html` directly in a browser (a local server is still recommended, since some browsers restrict local-file `fetch` for the KML/climate-data calls).

## The 9-step workflow

1. **Customer** — name, mobile, email, address, auto-generated quotation number (`MSR-SOLAR-2026-0001`, editable)
2. **Site** — lat/long (auto-filled from footprint centroid), KML/KMZ/GeoJSON upload or draw-on-map, plus a full Site Survey section (orientation, tilt, roof type, shading, connection details)
3. **Roof** — pick a panel, tune setbacks/spacing, get the real packed panel count, rows×columns, and maximum roof capacity, with an approximate panel-layout overlay on the map
4. **Electricity** — average monthly units, or a full 12-month breakdown; shows annual/peak/minimum and a blended tariff estimate
5. **Solar System** — fetches solar resource data (NASA POWER → Open-Meteo → PVGIS automatic fallback) and recommends a capacity that respects **both** the roof's physical limit and the customer's consumption — never one without the other
6. **Battery** — critical load × backup hours → sized battery bank (units, nameplate, usable capacity), shared basis for both Hybrid and Off-Grid
7. **Pricing** — per-quotation installation method/GST overrides; live BOM preview
8. **Comparison** — builds all three system proposals and a comparison table, with an auto-highlighted recommendation and validation warnings
9. **Quotation** — final quotation number, editable terms, **Download Quotation PDF**, and Save/Export/Import project

## PDF report — combining both reference documents

The quotation PDF now merges the two styles you shared:

- **Global Solar Atlas–style site analysis**: coordinates, address, footprint/roof area, solar resource data source, peak sun hours, specific yield, and the actual monthly-generation chart from Step 5 (captured as an image, not redrawn) — page 3
- **Groena-style branded quotation**: cover page, "Who We Are" / stats / why-choose-us, client details + proposal number/date/validity, itemised quotation table with **PM Surya Ghar subsidy** line (defaults to the real ₹30k/₹60k/₹78k slabs, editable in Settings), full Bill of Materials with remarks per line, payment milestones, bank details, quality-standards table, warranty, and terms — pages 1–2, 4–10

Company branding defaults to **Vengateshwara Energy System** — name, tagline, address, phone, email, logo, bank details, and every stat/list are editable in ⚙ Settings → Company Profile; nothing is hard-coded in the PDF builder itself.

### GST — split model, matching real practice

Solar EPC GST is commonly billed as a lower rate on the panel/module share of cost and a higher rate on the rest (structure, inverter, labour, BOS). The default is **5% on 70% of project cost + 18% on the remaining 30%** (a ~8.9% blended effective rate) — taken directly from a real quotation you shared, not guessed. This is fully editable in Settings → Installation & GST, and can be switched to a single flat percentage instead. The quotation PDF states the GST basis in plain language, the same way the reference quote did ("Tax Included — GST 5% for 70% Project Cost and GST 18% for 30% Project Cost").

### A third bug found and fixed in this pass

The Step-7 "Pricing" per-quotation config clone used `JSON.parse(JSON.stringify(...))`, which — like the earlier localStorage bug — silently turns `Infinity` into `null` (breaking the tariff/subsidy "unlimited last slab"). Replaced with `structuredClone()`, which correctly preserves `Infinity`, and verified no other place in the codebase clones Config unsafely.

## Verification performed
Since this sandbox has no network access (can't reach the real CDN libraries or even a local browser over localhost from the test tool), verification was done at the logic level rather than a live visual walkthrough:

- Every calculation module (`geo`, `roof-layout`, `generation`, `sizing`, `pricing`, `quotation`) was run end-to-end offline in Node with representative data (a ~1,446 m² roof, 750 units/month) — panel packing, sizing, BOM, GST, and On-Grid/Hybrid/Off-Grid comparison all produced consistent, sane numbers (e.g. On-Grid: 5.5 kWp, 10 panels, ₹3.37L, ~8.3-year payback at default settings)
- **Two real bugs found and fixed during this review:**
  1. Several UI icons/symbols (⚙, ☀, →, ₹, etc.) had been written as literal `\uXXXX` text instead of real characters — would have displayed as garbage. Fixed across all files.
  2. The tariff table's "unlimited last slab" uses `Infinity`, which `JSON.stringify` silently turns into `null` when Settings are saved to localStorage — silently breaking the tariff calculation after first save (verified: correct payback ~8.3 years became a wrong ~23.9 years). Fixed and stress-tested across repeated save/reload cycles.
- The PDF generator was run against a mock `jsPDF` that records every call — confirmed it produces 3 pages covering customer details, site analysis, all three system proposals with itemised BOM, the comparison table, warranty, and terms, with no runtime errors
- Every `getElementById()` call across all JS files was cross-checked against actual `index.html` IDs — no mismatches
- GeoJSON parsing (Polygon, MultiPolygon, FeatureCollection, and invalid/empty-input error cases) verified correct

**What this does *not* replace**: an actual visual walkthrough in a browser (checking layout, click targets, responsiveness on a real phone). Please open the app yourself after deploying and click through all 9 steps once before using it with a real customer — if anything looks off, tell me exactly what and I'll fix it.

## Known limitations (stated, not hidden)

- **Panel layout is an approximation.** True panel packing on an arbitrary, possibly-concave roof polygon is a hard computational-geometry problem. This app packs panels into the polygon's *oriented bounding box* (long-edge aligned), inset by your configured setbacks — accurate for typical rectangular-ish roofs, but not a substitute for a site survey on irregular shapes. This is stated in the UI, not just here.
- **Shapefile ZIP is not supported.** The app tells the user to convert to GeoJSON or KML first (e.g. via mapshaper.org or QGIS) rather than silently failing or faking support.
- **Tariff table is illustrative**, clearly labelled as such, and fully editable — verify against the customer's actual TANGEDCO/TNPDCL bill before quoting.
- **No polygon drawing/editing** was verified in a live browser in this pass (Leaflet.draw is wired in `map.js`, but couldn't be visually confirmed here — please test this specifically).
- Site-survey **photos** are not supported — only text notes. Photo upload/storage was scoped out to keep the offline/localStorage architecture simple; flagged here rather than left unmentioned.

## Customizing

Open **⚙ Settings** (top-right) to edit: company name/contact/logo/quotation prefix, panel/inverter/battery databases, BOM component pricing, installation method & GST, tariff slabs, roof defaults, and system loss factors. Nothing requires touching the source code.

## PDF quotation redesign (v2)

The quotation PDF was rebuilt as a 10-page infographic-style document, combining two reference formats: a Global-Solar-Atlas-style site analysis page (site-info table, real monthly-generation chart embedded from Step 5) and a Groena-style quotation/brochure format (cover page, company profile with "Who We Are" / services / track-record stat badges / "Why Choose Us", an itemised quotation with a subsidy line and "actual investment after subsidy," a full Bill of Materials with specs, payment terms, bank details, and a quality-standards table).

Tables use `jspdf-autotable` (added via CDN) for clean bordered rendering, with a manual fallback renderer if that library fails to load, so the PDF never breaks.

Every piece of company-identity content — intro paragraph, services, "why choose us," track-record numbers, quality standards, bank details, payment milestones, subsidy slabs — is editable in **Settings → Company** and **Settings → Profile & PDF**. Track-record stats default to **0** and simply don't render in the PDF until real numbers are entered — nothing is fabricated or borrowed from a reference brochure.

Company name defaults to **Vengateshwara Energy System** — change any of it in Settings.


## GSA / Solargis benchmark upgrade (v2026.08)

The Solar System step now supports an external Global Solar Atlas (GSA / Solargis) benchmark.

- A supplied Musiri reference is auto-matched within 2 km of `10.961742, 78.440714`.
- Benchmark fields include PVOUT specific, GHI, DNI, DIF, GTI at optimum angle, optimum tilt, temperature and elevation.
- The MSR engineering model remains separate and transparent.
- When a GSA PVOUT benchmark is available, consumption-based sizing uses the GSA PVOUT as the sizing reference; the displayed MSR generation remains the engineering-model result.
- The UI reports MSR-vs-GSA percentage difference, agreement percentage, and GSA annual benchmark generation.
- The generated PDF includes a dedicated **Solar Resource Benchmark** page with the supplied GSA values and the annual MSR-vs-GSA comparison.
- For locations without a built-in reference, enter the annual values from the customer's GSA PDF manually.
- The application does not invent monthly GSA PVOUT values when the supplied report does not contain them.


## Payback calculation (updated)
- Default commercial payback valuation: **₹4.70 per generated solar unit**.
- Annual energy savings = **annual generated kWh × ₹4.70** (editable in Settings → Tariff).
- Payback = **net investment after applicable subsidy ÷ annual energy savings**.
- The tariff-slab blended rate is kept separately for bill reference and does not override the payback formula.
- Reports show generated units, valuation rate, annual savings, gross cost, subsidy, net investment and payback years.

## Product Catalogue Upgrade — 2026
The application now exposes a customer-facing panel and battery catalogue in the main workflow, not only in Settings. Panel entries show wattage, physical dimensions, calculated panel area, quotation price, reference price range, efficiency and warranty. Battery entries show chemistry, voltage, capacity, usable energy, DoD, cycle life, warranty and configured price.

Reference note: the supplied 2026 panel guide provides panel dimensions/wattages and the supplied India 2026 price-list provides brand/technology price ranges. Battery model/price data was not present in that supplied price-list, so battery values remain editable EPC quotation defaults and are explicitly marked for verification.

## Latest upgrade — full panel list + PDF alignment (2026-08-17)
- The Step 3 Solar Panel Model selector now contains the 4 configured quotation panels plus all 10 VES 2026 source-listed reference models.
- Reference-only models remain explicitly marked. If exact manufacturer wattage, dimensions, or dealer price are not supplied by the source, the app does not invent them; Settings → Panels is used to enter exact datasheet/quotation values before roof geometry and final quotation.
- The 10 VES source-listed models are also shown in the Panel Catalogue and in the generated PDF.
- PDF tables now use consistent Helvetica typography, line wrapping, vertical alignment, cell padding, and fixed column widths for cleaner quotation/BOM alignment.
- PDF adds a dedicated Panel & Roof Layout page with requested capacity, actual kWp, panel count, panel dimensions, panel surface area, array layout area, usable roof area, remaining usable roof area, and fit status.


## V2 update — September 2026

### Customer-facing improvements
- Modern responsive solar/EPC dashboard styling.
- Customer system size can be selected from 1–5 kW or custom.
- After a system size is selected, the app automatically evaluates every fully configured panel model.
- Panel recommendation checks physical roof fit first, then technical/commercial completeness, panel count/array area and configured panel cost.
- A panel comparison table shows wattage, number of panels, actual kWp, roof fit, array area, panel cost, ₹/Wp and efficiency.
- The suggested module is automatically selected before roof calculation when a viable configured module exists.
- Existing manual panel selection remains available.

### Accuracy improvements
- Roof usable-area calculation now uses the footprint's oriented bounding-box geometry and shape factor instead of converting setbacks into a fixed percentage.
- Auto panel orientation can test portrait and landscape packing and select the higher panel-count geometric arrangement.
- Solar generation can be calibrated to a supplied site-specific GSA/Solargis PVOUT benchmark while retaining the monthly climate profile.
- A new Accuracy & Data Quality panel reports resource source, generation method, roof-geometry method and benchmark deviation.
- The app continues to label roof-panel placement as preliminary engineering visualization, not a construction drawing.

### Important
Exact manufacturer datasheet dimensions, module power, dealer price, roof obstructions/shading, structural capacity, electrical protection and local utility approval must still be verified before issuing a final EPC quotation.

## V4 improvements — City, TNEB history and solar/grid balance

- City entry is manual. Typing a supported city name automatically applies the built-in reference latitude/longitude; no device GPS or automatic geocoder is used.
- Exact site latitude/longitude and KML/KMZ/GeoJSON remain optional accuracy upgrades.
- **Bill-first TNEB/TNPDCL workflow:** upload the customer's PDF/JPG/PNG bill in Step 1. The browser extracts consumer name, consumer/service number, address/location fields when available, tariff, meter/load information, billing period, units, dates and bill amount. No portal username/password is requested.
- The extracted bill becomes a billing-history record. Repeated uploads are de-duplicated. A two-month bill is converted to a monthly equivalent for solar sizing.
- The app does not invent missing 12-month history. Six bi-monthly records are needed for a true 12-month actual history; fewer records are explicitly treated as preliminary annualised estimates.
- If energy units cannot be confidently read, the app stops the calculation rather than replacing the missing value with zero or guessing from the bill amount.
- When 12 monthly-equivalent usage records are returned, they are automatically loaded into the 12-month consumption model.
- Solar vs electricity balance is calculated month by month: solar generation, on-site solar use, surplus export, grid deficit/import and solar coverage.
- Payback uses customer self-consumption value + surplus export credit, with configurable import/export rates and panel degradation.
- The quotation PDF includes utility history statistics and the monthly solar-vs-grid balance.

### Important utility-data limitation
A single uploaded bi-monthly bill cannot provide a factual 12-month history. The app uses the bill's printed units and amount, converts the two-month record to monthly equivalents, and annualises that value only for preliminary solar sizing when the remaining bills are not yet uploaded. Add the remaining bills to replace the annualised estimate with actual 12-month history.


## V8 TNEB bi-monthly analysis
- Six bi-monthly TNEB records represent one full 12-month period.
- Each record stores the actual printed units and bill amount; `periodMonths: 2` converts them to monthly equivalents.
- ROI uses the actual entered/fetched bill amount as the current-cost baseline.
- Post-solar energy charges use the configurable 2026 reference slab model on each two-month deficit; fixed charges, rebates, subsidy settlement and export rules are not fabricated.
- The default tariff values remain editable because an authoritative live tariff-order lookup was not available during this build. Verify them against the customer's current TNEB/TNPDCL bill or tariff order before issuing a final quotation.


## V13 changes
- TNEB/TNPDCL bill is the primary source for customer and electricity data.
- Manual electricity-consumption entry is disabled.
- PDF text extraction falls back to rendered-page OCR for scanned bills.
- Unit detection now handles explicit billed/consumed-unit labels, KWh labels, OCR line layouts, and previous/current meter-reading differences. It never derives units from the bill amount.
- Six bimonthly records cover a full 12-month actual history; fewer records are annualised as a preliminary estimate.
- Parser and app script cache versions bumped to V13.

## V15 — TNPDCL Original Bill Parser + Solar + BESS

The bill parser is tuned to the supplied TNPDCL invoice format. It reads the Energy Consumption table (Final Reading, Initial Reading, MF, Consumption), the service connection number, consumer name/address, tariff, sanctioned load, meter, billing cycle/period, bill amount, invoice date and due date. For the supplied bill the extracted consumption is 410 kWh from 23027 − 22617 with MF 1; the ₹1,003 bill amount is not used to guess units.

## V14 — Solar + BESS

The application now supports three system architectures:
- On-Grid (Solar Only)
- Hybrid (Solar + BESS)
- Off-Grid (Full Autonomy)

BESS sizing uses the engineering relationship:
`Nominal Capacity = (Critical Daily Load × Backup Ratio) / (DoD × Efficiency)`
with configurable battery specifications. The default LiFePO4 catalogue is 90% DoD and 95% round-trip efficiency. Standard modular pack sizing is supported, including 5.12 kWh class packs.

The 24-hour simulator follows:
`Direct Solar -> Load -> Battery Charge -> Grid Export`
and for deficits:
`Battery Discharge -> Grid Import`.

PVGIS is an optional location-based generation benchmark. Existing NASA POWER/Open-Meteo/PVGIS climate fallback logic remains active. Tariff calculations support configurable slab rates plus optional fixed/demand charges; verify utility-specific values before issuing a final quotation.
