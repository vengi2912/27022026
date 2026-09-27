/* Utility bill helper. Customer-supplied TNEB/TNPDCL bill data is processed in-browser. */
window.SolarApp = window.SolarApp || {};
SolarApp.Utility = (function () {
  const OFFICIAL_PORTAL = 'https://www.tnpdcl.gov.in/';
  function normalizeConsumerNumber(v){ return String(v||'').trim().replace(/\s+/g,''); }
  function num(v){ const n=Number(v); return Number.isFinite(n)?n:null; }

  function normalizeHistory(list){
    if(!Array.isArray(list)) return [];
    return list.map((r,i)=>{
      const months=Math.max(1,num(r.periodMonths ?? r.months ?? 1)||1);
      const units=num(r.units ?? r.kWh ?? r.consumptionUnits ?? r.monthlyUnits);
      const bill=num(r.billAmount ?? r.amount ?? r.bill);
      const monthlyUnits=units===null?(num(r.monthlyUnits)===null?null:num(r.monthlyUnits)):units/months;
      const monthlyBill=bill===null?(num(r.monthlyBill)===null?null:num(r.monthlyBill)):bill/months;
      return {
        period: String(r.period ?? r.billingPeriod ?? r.month ?? `Period ${i+1}`),
        periodMonths: months,
        monthlyUnits, monthlyBill,
        rawUnits: units===null && monthlyUnits!==null ? monthlyUnits*months : units,
        rawBill: bill===null && monthlyBill!==null ? monthlyBill*months : bill
      };
    }).filter(r=>r.monthlyUnits!==null || r.monthlyBill!==null);
  }

  function setFields(d){
    const map={
      tnebConsumerNumber:d.consumerNumber ?? d.consumerNumber,
      utilityConsumerName:d.consumerName ?? d.name,
      utilityTariffCategory:d.tariffCategory ?? d.tariff,
      utilitySanctionedLoad:d.sanctionedLoadKW ?? d.sanctionedLoad,
      utilityConnectedLoad:d.connectedLoadKW ?? d.connectedLoad,
      utilityLatestUnits:d.latestUnits ?? d.units,
      utilityLatestBill:d.latestBillAmount ?? d.billAmount,
      utilityBillDate:d.billDate,
      utilityDueDate:d.dueDate,
      utilityBillingPeriod:d.billingPeriod,
      utilityMeterNumber:d.meterNumber,
      utilityBillingCycle:d.billingCycle
    };
    Object.entries(map).forEach(([id,v])=>{const el=document.getElementById(id);if(el&&v!==undefined&&v!==null)el.value=v;});
    const history=normalizeHistory(d.monthlyHistory ?? d.billHistory ?? d.history ?? d.bills);
    const units=history.length?history.reduce((s,r)=>s+(r.monthlyUnits||0),0)/history.filter(r=>r.monthlyUnits!==null).length:Number(d.latestUnits ?? d.units);
    const load=Number(d.sanctionedLoadKW ?? d.sanctionedLoad);
    const bill=history.length?history.reduce((s,r)=>s+(r.monthlyBill||0),0)/history.filter(r=>r.monthlyBill!==null).length:Number(d.latestBillAmount ?? d.billAmount);
    if(Number.isFinite(units)&&units>0){const el=document.getElementById('avgMonthlyUnits');if(el)el.value=Math.round(units*100)/100;}
    if(Number.isFinite(load)&&load>0){const el=document.getElementById('sanctionedLoad');if(el)el.value=load;}
    if(Number.isFinite(bill)&&bill>0){const el=document.getElementById('currentBillInput');if(el)el.value=Math.round(bill*100)/100;}
    if(d.consumerName){const el=document.getElementById('custName');if(el&&!el.value)el.value=d.consumerName;}
    return history;
  }

  function escapeHtml(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));}

  function importedBillSummary(history){
    const rows=normalizeHistory(history);
    const units=rows.filter(r=>r.monthlyUnits!==null);
    const bills=rows.filter(r=>r.monthlyBill!==null);
    return {
      records:rows.length,
      avgMonthlyUnits:units.length?units.reduce((a,r)=>a+r.monthlyUnits,0)/units.length:null,
      avgMonthlyBill:bills.length?bills.reduce((a,r)=>a+r.monthlyBill,0)/bills.length:null,
      hasFull12Months:rows.reduce((a,r)=>a+(Number(r.periodMonths)||1),0)>=12
    };
  }
  function openOfficialPortal(){window.open(OFFICIAL_PORTAL,'_blank','noopener,noreferrer');}
  return {setFields,normalizeConsumerNumber,normalizeHistory,importedBillSummary,escapeHtml,openOfficialPortal,OFFICIAL_PORTAL};
})();
