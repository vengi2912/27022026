/* TNEB/TNPDCL bill parser — client-side, no username/password.
 * Handles text PDFs and image bills. Uses label-aware extraction, date-range
 * detection, meter-reading fallback, and field confidence so the app never
 * silently turns an unreadable field into zero.
 */
(function(){
  const U=window.SolarApp=window.SolarApp||{};
  const Parser={};
  U.BillParser=Parser;
  // Stable global alias so cached/older app.js files cannot lose the parser namespace.
  window.TNEBBillParser=Parser;
  const clean=s=>String(s||'').replace(/\u00a0/g,' ').replace(/[|¦]+/g,' ').replace(/[ \t]+/g,' ').trim();
  const num=s=>{const m=String(s||'').replace(/,/g,'').match(/-?\d+(?:\.\d+)?/);return m?Number(m[0]):null;};
  const dateRx='\\d{1,2}[\\/-]\\d{1,2}[\\/-]\\d{2,4}';
  function parseDate(s){if(!s)return '';const m=String(s).match(/(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})/);if(!m)return '';let y=Number(m[3]);if(y<100)y+=2000;return `${y}-${String(m[2]).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`;}
  function dateToTime(s){const d=parseDate(s);return d?new Date(d+'T00:00:00').getTime():NaN;}
  function periodFromText(text){
    const m=String(text).match(new RegExp('('+dateRx+')\\s*(?:-|–|—|to)\\s*('+dateRx+')','i'));
    if(!m)return {text:'',start:'',end:'',months:null};
    const start=parseDate(m[1]),end=parseDate(m[2]);
    let months=null;const a=dateToTime(start),b=dateToTime(end);
    if(Number.isFinite(a)&&Number.isFinite(b)){months=Math.max(1,Math.round((b-a)/(1000*60*60*24*30.4375)));if(months<1)months=1;}
    if(months===1 && /(?:bi[- ]?monthly|two\s*months|2\s*months)/i.test(text))months=2;
    return {text:`${m[1]} - ${m[2]}`,start,end,months};
  }
  function findAfterLabel(text, labels, maxChars=120){
    const src=String(text);
    for(const label of labels){
      const re=new RegExp(label+'\\s*(?:[:#=.-]|\\s)*([^\\n]{0,'+maxChars+'})','i');
      const m=src.match(re); if(m&&clean(m[1])) return clean(m[1]);
    }
    return '';
  }
  function findNumberAfterLabel(text, labels, maxChars=120){
    const v=findAfterLabel(text,labels,maxChars); return num(v);
  }
  function firstMatch(text, patterns){for(const p of patterns){const m=text.match(p);if(m)return clean(m[1]||m[0]);}return '';}
  function numberNearLabels(text, labels){
    for(const label of labels){
      const re=new RegExp(label+'[^\\n]{0,90}?([0-9][0-9,]*(?:\\.[0-9]+)?)','i');
      const m=text.match(re); if(m){const n=num(m[1]);if(n!==null)return n;}
    }
    return null;
  }
  function normalizeOCR(text){
    return String(text||'').replace(/\r/g,'\n').replace(/[“”]/g,'"').replace(/[‘’]/g,"'").replace(/[₹]/g,' ₹ ').replace(/[‐‑‒–—]/g,'-').replace(/\u00a0/g,' ');
  }
  function scanLinesForUnits(text){
    const lines=String(text||'').split(/\n+/).map(clean).filter(Boolean);
    const labels=/(?:units?|kwh|energy\s*(?:consumed|consumption)|consumption|billed\s*units?|units?\s*charged|no\.?\s*of\s*units?|unit\s*consumption|மொத்த\s*யூனிட்|யூனிட்)/i;
    const bad=/(?:rate|amount|charge|energy\s*charge|fixed|tax|gst|arrear|arrears|deposit|balance|rupees|₹|rs\.?|sanctioned|connected|load|meter|service|consumer|account|reading\s*date)/i;
    const candidates=[];
    for(const line of lines){
      if(!labels.test(line) || bad.test(line.replace(/(?:units?|kwh|energy\s*(?:consumed|consumption)|consumption|billed\s*units?|units?\s*charged|no\.?\s*of\s*units?)/ig,''))) continue;
      const nums=[...line.matchAll(/(?:^|[^\d])([0-9]{1,7}(?:,[0-9]{3})*(?:\.\d+)?)(?=\s*(?:units?|kwh)?\b)/ig)].map(m=>num(m[1])).filter(n=>Number.isFinite(n));
      nums.filter(n=>n>0&&n<=100000).forEach(n=>candidates.push({n,line}));
    }
    // Prefer explicit billed/consumed-unit wording, then the smallest plausible
    // positive candidate on a units-labelled line. This never uses a bill amount.
    candidates.sort((a,b)=>{
      const score=x=>/(?:billed\s*units?|units?\s*(?:consumed|charged)|energy\s*(?:consumed|consumption)|kwh)/i.test(x.line)?2:1;
      return score(b)-score(a);
    });
    return candidates[0]?.n ?? null;
  }
  function scanLinesForReadings(text){
    const lines=String(text||'').split(/\n+/).map(clean).filter(Boolean);
    let prev=null,curr=null;
    for(const line of lines){
      const ns=[...line.matchAll(/(?:^|[^\d])([0-9]{1,9}(?:,[0-9]{3})*(?:\.\d+)?)(?=$|\D)/g)].map(m=>num(m[1])).filter(n=>Number.isFinite(n));
      if(!ns.length) continue;
      if(/previous|prev(?:ious)?|old|முந்தைய/i.test(line)) prev=ns[0];
      if(/current|present|new|actual|தற்போதைய/i.test(line)) curr=ns[0];
      if(prev!==null&&curr!==null&&curr>=prev) return {prev,curr,units:curr-prev};
    }
    return {prev,curr,units:(prev!==null&&curr!==null&&curr>=prev)?curr-prev:null};
  }
  function extractTNPDCLTable(text){
    const src=normalizeOCR(text);
    // Original TNPDCL layout used by the supplied August-2026 bill:
    // READING | Final Reading | Initial Reading | MF | Consumption [After MF & DT Loss]
    // followed by one numeric row. The 4th numeric value is the billed energy
    // consumption, not the bill amount.
    const m=src.match(/READING\s+([0-9][0-9,]*(?:\.\d+)?)\s+([0-9][0-9,]*(?:\.\d+)?)\s+([0-9][0-9,]*(?:\.\d+)?)\s+([0-9][0-9,]*(?:\.\d+)?)/i);
    if(!m)return null;
    const finalReading=num(m[1]), initialReading=num(m[2]), mf=num(m[3]), consumption=num(m[4]);
    if(!Number.isFinite(finalReading)||!Number.isFinite(initialReading)||!Number.isFinite(consumption))return null;
    return {finalReading,initialReading,mf,consumption};
  }

  function extractTNPDCLFields(text){
    const src=normalizeOCR(text);
    const flat=src.replace(/\n+/g,' ').replace(/[ \t]+/g,' ').trim();
    const service=(flat.match(/Serv(?:i|v)ce\s+Connection\s+Number\s*[:#=.-]?\s*([0-9]{2}(?:-[0-9]{2,4}){2,3})/i)||[])[1]||
      (flat.match(/Connection\s+Number\s*[:#=.-]?\s*([0-9]{2}(?:-[0-9]{2,4}){2,3})/i)||[])[1]||'';

    // TNPDCL places the customer name/address in a left-hand block while
    // tariff/meter/billing fields occupy the right-hand block on the same rows.
    // Capture the name independently so the right-hand fields cannot contaminate it.
    const name=(src.match(/Name\/Address\s*&\s*GST\s+of\s+the\s+Consumer[\s\S]{0,260}?\n\s*([A-Z][A-Z. '-]{2,})\s*\n\s*(?:S\/O|D\/O|W\/O)\b/i)||[])[1]||
      (src.match(/\n\s*([A-Z][A-Z. '-]{2,})\s*\n\s*(?:S\/O|D\/O|W\/O)\b/i)||[])[1]||'';

    const tariff=(flat.match(/Tariff\s+Applied\s+([A-Z0-9-]+)/i)||[])[1]||'';
    const sanctioned=(flat.match(/Sanctioned\s+Load\s+([0-9]+(?:\.\d+)?)\s*kW/i)||[])[1];
    const meter=(flat.match(/Meter\s+No\s*:\s*([0-9A-Z-]+)/i)||[])[1]||'';
    const cycle=(flat.match(/Billing\s+Cycle\s+([A-Za-z-]+)/i)||[])[1]||'';
    const dateNearLabel=(label,look=220)=>{ const i=src.search(new RegExp(label,'i')); if(i<0)return []; const re=new RegExp(dateRx,'g'); const all=[]; let m; while((m=re.exec(src))!==null) all.push({value:m[0],index:m.index}); const near=all.filter(d=>d.index>=i-look&&d.index<=i+look).sort((a,b)=>Math.abs(a.index-i)-Math.abs(b.index-i)); return near.map(d=>d.value); };
    const labelIndex=src.search(/Bill\s+Period/i); let periodMatch=null;
    if(labelIndex>=0){ const re=new RegExp(dateRx,'g'); const before=[],after=[]; let m; while((m=re.exec(src))!==null){ if(m.index<labelIndex && m.index>=labelIndex-300) before.push(m[0]); else if(m.index>labelIndex && m.index<=labelIndex+300) after.push(m[0]); } if(before.length&&after.length) periodMatch={1:before[before.length-1],2:after[0]}; }

    const billAmount=(flat.match(/Bill\s+Amount\s+Rs\.?\s*([0-9][0-9,]*(?:\.\d+)?)/i)||[])[1];
    const invoiceDate=(flat.match(/Invoice\s+No\s*:\s*[^\n]+?\bDate\s*:\s*([0-9]{1,2}[\/-][0-9]{1,2}[\/-][0-9]{2,4})/i)||[])[1]||
      (flat.match(/\bDate\s*:\s*([0-9]{1,2}[\/-][0-9]{1,2}[\/-][0-9]{2,4})/i)||[])[1]||'';
    const dueDates=dateNearLabel('Due\\s+Date',320);
    const dueDate=dueDates[0]||'';

    let address='';
    const nameToken=clean(name);
    if(nameToken){
      const afterName=src.slice(src.indexOf(nameToken)+nameToken.length);
      const beforeState=afterName.split(/\n\s*State\s*:/i)[0]||'';
      address=beforeState.split('\n').map(clean).filter(Boolean)
        .filter(line=>!/(?:Tariff\s+Applied|Sanctioned\s+Load|Phase\b|Invoice\s+Type|CT\/Non-CT|Place\s+of\s+Supply|Meter\s+No|Supply\s+Type|Solar\s+RTS|Reverse\s+Charge|Welding|Billing\s+Cycle|Bill\s+Period|Bill\s+Amount|Due\s+Date|\bREADING\b|\bDATE\b|\bSTATUS\b)/i.test(line))
        .join(', ');
    }
    // A line-based PDF extractor can merge left/right columns. Keep only the
    // recognizable address block when that happens.
    address=address.replace(/\b\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}[-–—]?/g,'').replace(/[^\x20-\x7E,./&'-]+/g,' ').replace(/\s+(?:Meter\s+No|Tariff\s+Applied|Billing\s+Cycle)\b.*$/i,'').replace(/\s+/g,' ').replace(/\s*,\s*/g,', ').replace(/,\s*(?:df|d\s*f)\s*$/i,'').trim();
    const addressParts=address.split(',').map(clean).filter(Boolean);
    const cityCandidates=[...addressParts].reverse().filter(v=>/^[A-Za-z][A-Za-z .'-]{2,}$/.test(v)&&!/(?:S\/O|D\/O|W\/O|Street|Road|State|TAMILNADU|Chennai)/i.test(v));
    const city=cityCandidates[0]||'';
    const invoiceNumber=(flat.match(/Invoice\s+No\s*:\s*([0-9A-Z\/-]+)/i)||[])[1]||'';
    const phase=(flat.match(/Phase\s+([0-9]+\s*phase)/i)||[])[1]||'';
    const invoiceType=(flat.match(/Invoice\s+Type\s+([A-Z]+)/i)||[])[1]||'';
    const supplyType=(flat.match(/Supply\s+Type\s+([A-Za-z]+)/i)||[])[1]||'';
    const solarRTS=(flat.match(/Solar\s+RTS\s+([A-Za-z]+)/i)||[])[1]||'';
    const distribution=(flat.match(/Distribution\s+([A-Za-z0-9 .\/-]+?)(?=\s+Serv(?:i|v)ce\s+Connection|\s+Name\/Address)/i)||[])[1]||'';
    const circle=(flat.match(/Circle\s+([A-Za-z0-9 .\/-]+?)(?=\s+Invoice\s+No|\s+Distribution)/i)||[])[1]||'';
    const section=(flat.match(/Section\s+([A-Za-z0-9 .\/-]+?)(?=\s+GSTN\s+No|\s+Circle)/i)||[])[1]||'';
    const table=extractTNPDCLTable(src);
    return {
      consumerNumber:clean(service), name:clean(name), address:clean(address), city:clean(city), invoiceNumber:clean(invoiceNumber), phase:clean(phase), invoiceType:clean(invoiceType), supplyType:clean(supplyType), solarRTS:clean(solarRTS), distribution:clean(distribution), circle:clean(circle), section:clean(section),
      tariffCategory:clean(tariff), meterNumber:clean(meter),
      sanctionedLoadKW:sanctioned?num(sanctioned):null, connectedLoadKW:null,
      billingCycle:/bi[- ]?monthly/i.test(cycle)?'Bimonthly':clean(cycle),
      billingPeriod:periodMatch?`${periodMatch[1]} - ${periodMatch[2]}`:'',
      periodStart:periodMatch?parseDate(periodMatch[1]):'', periodEnd:periodMatch?parseDate(periodMatch[2]):'',
      billAmount:billAmount?num(billAmount):null, billDate:parseDate(invoiceDate), dueDate:parseDate(dueDate),
      previousReading:table?.initialReading??null, currentReading:table?.finalReading??null,
      units:table?.consumption??null, readingMF:table?.mf??null
    };
  }

  function extract(text, filename){
    text=normalizeOCR(text);
    const tn=extractTNPDCLFields(text);
    const period=periodFromText(text);
    if(tn.billingPeriod && !period.text){ period.text=tn.billingPeriod; period.start=tn.periodStart; period.end=tn.periodEnd; period.months=2; }
    const consumer=tn.consumerNumber||firstMatch(text,[
      /(?:consumer|service|connection)\s*(?:no\.?|number|id)\s*[:#=.-]?\s*([0-9A-Z][0-9A-Z\/-]{5,})/i,
      /(?:consumer\s*no|service\s*no|consumer\s*number)\s*[:#=.-]?\s*([0-9A-Z\/-]{5,})/i
    ]);
    const name=(tn.name||findAfterLabel(text,['(?:consumer|customer)\\s*name','name\\s*of\\s*consumer'],90)).replace(/\s+(?:tariff|category|service|consumer|meter)\b.*$/i,'').trim();
    const address=(tn.address||findAfterLabel(text,['(?:communication|service|billing|correspondence)?\\s*address','address\\s*of\\s*consumer'],180)).replace(/\\s+(?:tariff|category|consumer|service\\s*no|meter)\\b.*$/i,'').trim();
    const pincode=(text.match(/(?:pin(?:code)?|zip)\\s*[:#=.-]?\\s*(\\d{6})/i)||text.match(/\\b(6\\d{5})\\b/))?.[1]||'';
    const city=tn.city||findAfterLabel(text,['city','town'],60).replace(/\\s+(?:district|state|pin(?:code)?)\\b.*$/i,'').trim();
    const district=findAfterLabel(text,['district'],60).replace(/\\s+(?:state|pin(?:code)?)\\b.*$/i,'').trim();
    const tariff=(tn.tariffCategory||findAfterLabel(text,['tariff(?:\\s*category)?','category(?:\\s*of\\s*service)?'],70)).replace(/\s+(?:meter|load|units?|bill|amount)\b.*$/i,'').trim();
    const meter=tn.meterNumber||firstMatch(text,[/(?:meter)\s*(?:no\.?|number|id)\s*[:#=.-]?\s*([0-9A-Z\/-]{3,})/i]);
    let sanctioned=tn.sanctionedLoadKW!==null?tn.sanctionedLoadKW:numberNearLabels(text,['sanctioned\\s*load','sanctioned\\s*load\\s*kw']);
    let connected=tn.connectedLoadKW!==null?tn.connectedLoadKW:numberNearLabels(text,['connected\\s*load','connected\\s*load\\s*kw']);
    if(sanctioned!==null && sanctioned>100) sanctioned=null;
    if(connected!==null && connected>100) connected=null;
    const prev=tn.previousReading!==null?tn.previousReading:numberNearLabels(text,['previous(?:\\s*meter)?(?:\\s*reading)?','prev(?:ious)?\\s*reading','previous\\s*reading']);
    const curr=tn.currentReading!==null?tn.currentReading:numberNearLabels(text,['current(?:\\s*meter)?(?:\\s*reading)?','present(?:\\s*reading)?','current\\s*reading']);
    let units=tn.units!==null?tn.units:numberNearLabels(text,[
      'units?\\s*(?:consumed|consumption)', 'energy\\s*(?:consumed|consumption)',
      'consumption\\s*(?:in\\s*)?(?:units?|kwh)', 'units?\\s*charged',
      '(?:units?|kwh)\\s*consumed', 'total\\s*units?'
    ]);
    if(units===null) units=scanLinesForUnits(text);
    if(units===null){ const rr=scanLinesForReadings(text); if(rr.units!==null){ units=rr.units; if(prev===null) prev=rr.prev; if(curr===null) curr=rr.curr; } }
    if(units===null && prev!==null && curr!==null && curr>=prev) units=curr-prev;
    // Guard against OCR accidentally selecting money/service numbers as units.
    if(units!==null && (units<0 || units>1000000)) units=null;
    let amount=tn.billAmount!==null?tn.billAmount:numberNearLabels(text,[
      'total\\s*(?:current\\s*)?(?:bill|amount)', 'total\\s*amount\\s*payable',
      'amount\\s*payable','net\\s*(?:payable|amount)','current\\s*bill',
      'bill\\s*amount','payable\\s*amount','net\\s*payable\\s*amount'
    ]);
    if(amount===null){ const cm=text.match(/(?:₹|rs\\.?|inr)\\s*([0-9][0-9,]*(?:\\.[0-9]+)?)/i); if(cm) amount=num(cm[1]); }
    const billDateRaw=firstMatch(text,[new RegExp('(?:bill|issue|date\\s*of\\s*bill)\\s*date?\\s*[:#=.-]?\\s*('+dateRx+')','i'),new RegExp('(?:bill\\s*date|issue\\s*date)\\s*[:#=.-]?\\s*('+dateRx+')','i')]);
    const dueRaw=firstMatch(text,[new RegExp('due\\s*date\\s*[:#=.-]?\\s*('+dateRx+')','i')]);
    const billDate=tn.billDate||parseDate(billDateRaw), dueDate=tn.dueDate||parseDate(dueRaw);
    let periodMonths=period.months || (tn.billingCycle==='Bimonthly'?2:0) || (/bi[- ]?monthly|two\s*months|2\s*months/i.test(text)?2:1);
    if(periodMonths>6) periodMonths=2;
    const billingCycle=periodMonths===2?'Bimonthly':(periodMonths===1?'Monthly':'Unknown');
    const fields={consumerNumber:!!consumer,name:!!name,address:!!address,tariffCategory:!!tariff,meterNumber:!!meter,sanctionedLoadKW:sanctioned!==null,connectedLoadKW:connected!==null,units:units!==null,billAmount:amount!==null,billDate:!!billDate,dueDate:!!dueDate,billingPeriod:!!period.text};
    const score=Math.round(Object.values(fields).filter(Boolean).length/Object.keys(fields).length*100);
    const warnings=[];
    if(units===null)warnings.push('Energy units were not confidently detected. Upload a clear bill PDF/image; the app will not guess units from the bill amount.');
    if(amount===null)warnings.push('Bill amount was not confidently detected.');
    if(!consumer)warnings.push('Consumer/service number was not detected.');
    return {
      sourceFile:filename||'',consumerNumber:consumer,name,address,city,district,pincode,invoiceNumber:tn.invoiceNumber||'',phase:tn.phase||'',invoiceType:tn.invoiceType||'',supplyType:tn.supplyType||'',solarRTS:tn.solarRTS||'',distribution:tn.distribution||'',circle:tn.circle||'',section:tn.section||'',tariffCategory:tariff,meterNumber:meter,
      sanctionedLoadKW:sanctioned,connectedLoadKW:connected,units,billAmount:amount,
      billDate,dueDate,billingPeriod:period.text||tn.billingPeriod,billingCycle:tn.billingCycle==='Bimonthly'?'Bimonthly':billingCycle,periodMonths,
      periodStart:period.start,periodEnd:period.end,previousReading:prev,currentReading:curr,
      confidence:score,fieldConfidence:fields,warnings,rawText:text
    };
  }
  function setProgress(msg){const e=document.getElementById('tnebBillParseProgress');if(e)e.textContent=msg;}
  async function pdfText(file){
    if(!window.pdfjsLib)throw new Error('PDF reader is not loaded. Please refresh the page and try again.');
    const buf=await file.arrayBuffer();
    const pdf=await window.pdfjsLib.getDocument({data:buf}).promise;
    let out='';
    for(let i=1;i<=pdf.numPages;i++){
      setProgress(`Reading PDF page ${i} of ${pdf.numPages}…`);
      const page=await pdf.getPage(i); const c=await page.getTextContent();
      // Preserve the visual row structure. TNPDCL bills place the energy
      // consumption values in a table; flattening all PDF text into one line
      // makes it impossible to reliably distinguish readings from consumption.
      const items=(c.items||[]).map(it=>({
        str:String(it.str||''),
        x:Number(it.transform?.[4]||0),
        y:Number(it.transform?.[5]||0),
        w:Number(it.width||0)
      })).filter(it=>it.str.trim());
      items.sort((a,b)=>b.y-a.y || a.x-b.x);
      const rows=[];
      for(const it of items){
        let row=rows.find(r=>Math.abs(r.y-it.y)<=2.2);
        if(!row){row={y:it.y,items:[]};rows.push(row);}
        row.items.push(it);
      }
      rows.sort((a,b)=>b.y-a.y);
      const pageText=rows.map(r=>r.items.sort((a,b)=>a.x-b.x).map(it=>it.str).join(' ').replace(/[ \t]+/g,' ').trim()).filter(Boolean).join('\n');
      out+='\n'+pageText;
    }
    return {text:out,pdf};
  }
  async function ocrImage(source,label='bill image'){
    if(!window.Tesseract)throw new Error('OCR engine is not loaded. Check your internet connection and refresh the page.');
    setProgress(`OCR reading ${label}… 0%`);
    const r=await window.Tesseract.recognize(source,'eng',{
      logger:m=>{const e=document.getElementById('tnebBillParseProgress');if(e&&typeof m.progress==='number')e.textContent=`OCR reading ${label}… ${Math.round(m.progress*100)}%`;}
    });
    return r.data?.text||'';
  }
  async function pdfOCR(pdf){
    let out='';
    const maxPages=Math.min(pdf.numPages,6);
    for(let i=1;i<=maxPages;i++){
      setProgress(`OCR reading PDF page ${i} of ${maxPages}…`);
      const page=await pdf.getPage(i);
      const viewport=page.getViewport({scale:1.7});
      const canvas=document.createElement('canvas');
      canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
      const ctx=canvas.getContext('2d',{willReadFrequently:true});
      await page.render({canvasContext:ctx,viewport}).promise;
      out+='\n'+await ocrImage(canvas,`PDF page ${i}`);
      canvas.width=canvas.height=1;
    }
    return out;
  }
  Parser.parseFile=async function(file){
    if(!file)throw new Error('Select a TNEB/TNPDCL bill PDF or image.');
    const type=file.type||'';
    const isPdf=type==='application/pdf'||/\.pdf$/i.test(file.name);
    let text='';
    let pdf=null;
    if(isPdf){
      const parsed=await pdfText(file); text=parsed.text||''; pdf=parsed.pdf;
      // Many TNPDCL bills are scanned/image-only PDFs. If the PDF has no text,
      // or the text does not contain enough utility fields, render pages and OCR them.
      let quick=extract(text,file.name);
      const needsOCR=!text.trim() || !quick.consumerNumber || quick.units===null || quick.billAmount===null;
      if(needsOCR && pdf){
        const ocr=await pdfOCR(pdf);
        if(ocr.trim()) text=(text+'\n'+ocr).trim();
      }
    }else{
      text=await ocrImage(file,'bill image');
    }
    if(!text.trim())throw new Error('No readable text was found. Upload the original TNEB/TNPDCL PDF or a clear, straight, high-resolution bill image.');
    const result=extract(text,file.name);
    result.extractedTextLength=text.length;
    const missing=[];
    if(!result.consumerNumber)missing.push('consumer/service number');
    if(result.units===null)missing.push('units');
    if(result.billAmount===null)missing.push('bill amount');
    result.missingRequired=missing;
    if(missing.length)result.warnings=[...(result.warnings||[]),`Required bill fields not confidently detected: ${missing.join(', ')}.`];
    return result;
  };
  Parser.extractText=extract;
})();
