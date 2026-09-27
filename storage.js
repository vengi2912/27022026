/* ==========================================================================
   storage.js — project persistence. A "project" is the full wizard state
   (customer, site, roof, consumption, system choices) so a salesperson can
   save mid-quotation and resume later, or export/import as JSON.
   ========================================================================== */
window.SolarApp = window.SolarApp || {};

SolarApp.Storage = (function () {
  const LIST_KEY = "musiriSolar.projects.v1";

  function listProjects() {
    try { return JSON.parse(localStorage.getItem(LIST_KEY) || "{}"); }
    catch (e) { return {}; }
  }

  function saveProject(id, projectState) {
    const all = listProjects();
    all[id] = { ...projectState, savedAt: new Date().toISOString() };
    localStorage.setItem(LIST_KEY, JSON.stringify(all));
    return all[id];
  }

  function loadProject(id) {
    const all = listProjects();
    return all[id] || null;
  }

  function deleteProject(id) {
    const all = listProjects();
    delete all[id];
    localStorage.setItem(LIST_KEY, JSON.stringify(all));
  }

  function exportProjectFile(projectState, filename) {
    const blob = new Blob([JSON.stringify(projectState, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename || "solar-quotation-project.json";
    a.click();
  }

  async function importProjectFile(file) {
    const text = await file.text();
    try { return JSON.parse(text); }
    catch (e) { throw new Error("This file isn't valid JSON"); }
  }

  return { listProjects, saveProject, loadProject, deleteProject, exportProjectFile, importProjectFile };
})();
