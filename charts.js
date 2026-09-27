/* ==========================================================================
   charts.js — thin Chart.js wrapper for the monthly generation chart.
   ========================================================================== */
window.SolarApp = window.SolarApp || {};

SolarApp.Charts = (function () {
  let generationChart;

  function renderGenerationChart(canvasId, rows) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    if (generationChart) generationChart.destroy();
    generationChart = new Chart(ctx, {
      type: "bar",
      data: {
        labels: rows.map(r => r.month),
        datasets: [{ label: "Monthly Generation (kWh)", data: rows.map(r => Math.round(r.acMonthlyKWh)), backgroundColor: "#E8A33D", borderRadius: 4 }],
      },
      options: {
        plugins: { legend: { labels: { color: "#EAF0F6" } } },
        scales: {
          x: { ticks: { color: "#8A97AC" }, grid: { color: "#233047" } },
          y: { ticks: { color: "#8A97AC" }, grid: { color: "#233047" } },
        },
      },
    });
  }

  return { renderGenerationChart };
})();
