// Aggregate first-party events only. Never send field values, queries or identifiers.
window.acesTrack=(event,context)=>{
 if(!window.ACES_ANALYTICS_ENABLED||navigator.doNotTrack==='1'||navigator.globalPrivacyControl)return;
 if(!['cta_click','form_start','form_submit'].includes(event))return;
 fetch('/api/events',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({event,context}),keepalive:true}).catch(()=>{});
};
document.addEventListener('click',e=>{const a=e.target.closest('a');if(a&&(/\/inquiry(?:[?#]|$)/.test(a.getAttribute('href')||'')||a.dataset.cta))window.acesTrack('cta_click',a.getAttribute('href')?.includes('ai-agent')?'agents':'enterprise');});
