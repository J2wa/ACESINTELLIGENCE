export const TZ = 'Asia/Manila';
export const STATUSES = ['PENDING', 'APPROVED', 'RETURNED', 'SKIPPED (NO CHANGES)'];
export function parseDuration(value) {
  if (typeof value !== 'string' || !/^\d{1,5}:[0-5]\d:[0-5]\d$/.test(value)) throw new Error('Use h:mm:ss, for example 0:04:32.');
  const [h,m,s] = value.split(':').map(Number); return h*3600+m*60+s;
}
export function duration(seconds=0) { const s=Math.max(0,Math.round(seconds)); return `${Math.floor(s/3600)}:${String(Math.floor(s/60)%60).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`; }
export function day(ms=Date.now()) { return new Date(ms+28800000).toISOString().slice(0,10); }
export function midnight(date) { if(!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Invalid date'); const ms=Date.parse(date+'T00:00:00+08:00'); if(!Number.isFinite(ms)||day(ms)!==date)throw new Error('Invalid date'); return ms; }
export function weekStart(date=day()) { const d=new Date(midnight(date)+28800000); d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));return d.toISOString().slice(0,10); }
export function addDays(date,n) { return day(midnight(date)+n*86400000); }
export function overlaps(a,b) { return a.start_ms < (b.end_ms??Infinity) && b.start_ms < (a.end_ms??Infinity); }
export function duplicateKey(project,account,video) { return JSON.stringify([project,account,video]); }
export function duplicateEntry(entries,project,account,video,except) {return entries.find(e=>e.id!==except && duplicateKey(e.project_id,e.account_id,e.video_id)===duplicateKey(project,account,video));}
export function splitDays(start,end) {const out=[];for(let cursor=start;cursor<end;){const date=day(cursor),stop=Math.min(end,midnight(addDays(date,1)));out.push({date,seconds:(stop-cursor)/1000});cursor=stop;}return out;}
export function hours(seconds) {return (seconds/3600).toFixed(1);}
export function csv(rows) {return '\uFEFF'+rows.map(row=>row.map(v=>'"'+String(v??'').replace(/^[=+@\-\t\r]/,"'$&").replaceAll('"','""')+'"').join(',')).join('\r\n');}
const xml=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g,'');
// Minimal standards-compliant XLSX: every string is an inline string, never a formula.
export function xlsx(sheets) {
 const enc=new TextEncoder(), files={}; const letters=n=>{let s='';for(n++;n;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s;};
 files['[Content_Types].xml']='<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'+sheets.map((_,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')+'</Types>';
 files['_rels/.rels']='<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';
 files['xl/workbook.xml']='<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'+sheets.map((s,i)=>`<sheet name="${xml(s.name)}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('')+'</sheets></workbook>';
 files['xl/_rels/workbook.xml.rels']='<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+sheets.map((_,i)=>`<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('')+'</Relationships>';
 sheets.forEach((s,i)=>{files[`xl/worksheets/sheet${i+1}.xml`]='<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" state="frozen"/></sheetView></sheetViews><sheetData>'+s.rows.map((row,r)=>`<row r="${r+1}">`+row.map((v,c)=>typeof v==='number'?`<c r="${letters(c)}${r+1}"><v>${v}</v></c>`:`<c r="${letters(c)}${r+1}" t="inlineStr"><is><t xml:space="preserve">${xml(v)}</t></is></c>`).join('')+'</row>').join('')+'</sheetData></worksheet>';});
 const parts=[],central=[];let offset=0;const u16=(a,v)=>{a.push(v&255,(v>>>8)&255);},u32=(a,v)=>{u16(a,v);u16(a,v>>>16);};
 for(const [path,text]of Object.entries(files)){const name=enc.encode(path),data=enc.encode(text);let crc=0xffffffff;for(const b of data){crc^=b;for(let i=0;i<8;i++)crc=(crc>>>1)^(0xedb88320&-(crc&1));}crc=(crc^0xffffffff)>>>0;const h=[];u32(h,0x04034b50);u16(h,20);u16(h,0);u16(h,0);u16(h,0);u16(h,33);u32(h,crc);u32(h,data.length);u32(h,data.length);u16(h,name.length);u16(h,0);parts.push(Uint8Array.from(h),name,data);const c=[];u32(c,0x02014b50);u16(c,20);u16(c,20);u16(c,0);u16(c,0);u16(c,0);u16(c,33);u32(c,crc);u32(c,data.length);u32(c,data.length);u16(c,name.length);u16(c,0);u16(c,0);u16(c,0);u16(c,0);u32(c,0);u32(c,offset);central.push(Uint8Array.from(c),name);offset+=h.length+name.length+data.length;}
 const size=central.reduce((a,p)=>a+p.length,0),e=[];u32(e,0x06054b50);u16(e,0);u16(e,0);u16(e,sheets.length+4);u16(e,sheets.length+4);u32(e,size);u32(e,offset);u16(e,0);const all=[...parts,...central,Uint8Array.from(e)],out=new Uint8Array(offset+size+e.length);let p=0;for(const a of all){out.set(a,p);p+=a.length;}return out;
}

// Task minutes are a daily total. Fit them into available slots for the legacy
// interval-based timesheet; these slots are not employee-reported clock times.
export function allocateTaskTime(date, minutes, entries, now = Date.now()) {
  const start = midnight(date), end = Math.min(start + 86400000, now);
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 1440)
    throw new Error('Enter whole minutes between 0 and 1440.');
  if (!minutes) return [];
  if (start >= now) throw new Error('Choose today or an earlier task date.');
  const occupied = entries.map(t => ({ start_ms: Math.max(start, t.start_ms), end_ms: Math.min(end, t.end_ms ?? end) }))
    .filter(t => t.start_ms < t.end_ms).sort((a,b) => a.start_ms - b.start_ms);
  const gaps = [];
  let cursor = start;
  for (const t of occupied) {
    if (t.start_ms > cursor) gaps.push({ start_ms: cursor, end_ms: t.start_ms });
    cursor = Math.max(cursor, t.end_ms);
  }
  if (cursor < end) gaps.push({ start_ms: cursor, end_ms: end });
  let remaining = minutes * 60000;
  const result = [];
  for (const gap of gaps.reverse()) {
    const amount = Math.min(remaining, gap.end_ms - gap.start_ms);
    if (amount) result.push({ start_ms: gap.end_ms - amount, end_ms: gap.end_ms });
    remaining -= amount;
    if (!remaining) break;
  }
  if (remaining) throw new Error('Not enough unlogged time on this date. Check the minutes, existing entries, or running timer.');
  return result.reverse();
}

export const PAY_BASES = { TASK: 'Per task', VIDEO_HOUR: 'Per video hour', WORKING_HOUR: 'Per working hour' };
export function hoursSignature(task, times) {
 return JSON.stringify([task.id, task.date, task.user_id, task.project_id,
  times.filter(t=>t.task_id===task.id).sort((a,b)=>a.id.localeCompare(b.id)).map(t=>[t.id,t.start_ms,t.end_ms,t.rate_cents,t.project_id,t.user_id])]);
}
export function taskHours(task, times, review, sheets = []) {
 const linked=times.filter(t=>t.task_id===task.id), signature=hoursSignature(task,times);
 const seconds=linked.reduce((n,t)=>n+(t.end_ms===null?0:(t.end_ms-t.start_ms)/1000),0);
 return {...task,spent_seconds:seconds,hours_signature:signature,
  hours_status:linked.some(t=>t.end_ms===null)?'RUNNING':!seconds?'NO HOURS':review?.signature===signature?review.status:!review&&linked.every(t=>t.end_ms!==null&&splitDays(t.start_ms,t.end_ms).every(d=>sheets.some(s=>s.user_id===t.user_id&&s.week_start===weekStart(d.date)&&s.status==='APPROVED')))?'APPROVED':'PENDING'};
}
// Each row has one captured pay basis, so video/task pay never also earns working-hour pay.
export function payrollRows(data, filters = {}) {
 const rows=[], from=filters.from||'1970-01-01', to=filters.to||'2100-01-01';
 const selected=(t,date)=>date>=from&&date<=to&&(!filters.project||filters.project===t.project_id)&&(!filters.employee||filters.employee===t.user_id)&&(!filters.account||filters.account===t.account_id)&&(!filters.status||filters.status===t.status);
 for (const t of data.tasks) {
  const basis=t.pay_basis||'WORKING_HOUR';
  if(basis==='WORKING_HOUR'||!selected(t,t.date)||t.status==='SKIPPED (NO CHANGES)') continue;
  const units=basis==='TASK'?1:t.duration_seconds/3600, cents=Math.round(units*t.rate_cents);
  rows.push({paid_invoice_id:t.paid_invoice_id??null,date:t.date,user_id:t.user_id,project_id:t.project_id,task_id:t.id,pay_basis:basis,units,rate_cents:t.rate_cents,cents,approved_cents:t.status==='APPROVED'?cents:0,status:t.status});
 }
 for (const t of data.times) {
  const task=data.tasks.find(x=>x.id===t.task_id), basis=t.pay_basis||'WORKING_HOUR';
  if(basis!=='WORKING_HOUR'||!t.end_ms) continue;
  for(const d of splitDays(t.start_ms,t.end_ms)) {
   if(!selected({...t,account_id:task?.account_id,status:task?.status},d.date))continue;
   const approved=task?task.hours_status==='APPROVED':data.sheets.some(s=>s.user_id===t.user_id&&s.week_start===weekStart(d.date)&&s.status==='APPROVED');
   const units=d.seconds/3600, cents=Math.round(units*t.rate_cents);
   rows.push({paid_invoice_id:task?.paid_invoice_id??t.paid_invoice_id??null,time_entry_id:t.id,date:d.date,user_id:t.user_id,project_id:t.project_id,task_id:t.task_id,pay_basis:basis,units,rate_cents:t.rate_cents,cents,approved_cents:approved?cents:0,status:approved?'APPROVED':task?.hours_status||'PENDING'});
  }
 }
 return rows;
}
