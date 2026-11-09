const form=document.getElementById('aces-form');
if(form){
 const status=document.getElementById('form-status'),button=form.querySelector('button[type=submit]');
 const original=button.innerHTML;let submissionId=crypto.randomUUID(),started=false;
 const kind=form.dataset.kind;
 const analytics=(event)=>window.acesTrack?.(event,kind);
 const other=document.getElementById('other-expertise');
 function expertise(){if(other){const selected=form.elements.specialty.value==='Other';other.hidden=!selected;form.elements.otherExpertise.required=selected;}}
 expertise();form.elements.specialty?.addEventListener('change',expertise);
 form.addEventListener('input',()=>{submissionId=crypto.randomUUID();if(!started){started=true;analytics('form_start');}});
 function show(message,error=false){status.textContent=message;status.className='status '+(error?'error':'success');status.setAttribute('role',error?'alert':'status');status.focus();}
 form.addEventListener('submit',async event=>{
  event.preventDefault();if(!form.reportValidity())return;
  const file=form.elements.resume?.files[0];
  if(file&&(!/\.pdf$/i.test(file.name)||file.size>3*1024*1024||!file.size)){show('Please upload a PDF résumé no larger than 3 MB.',true);return;}
  const data=new FormData(form);data.set('submissionId',submissionId);
  button.disabled=true;button.textContent='Sending…';form.setAttribute('aria-busy','true');status.textContent='Sending your details…';
  try{
   const response=await fetch('/api/submit',{method:'POST',headers:{Accept:'application/json'},body:data,signal:AbortSignal.timeout(25000)});
   const result=await response.json();if(!response.ok||!result.ok)throw new Error(result.error||'We could not confirm receipt. Please try again.');
   show(`${result.message} Reference: ${result.reference}`);analytics('form_submit');form.reset();expertise();submissionId=crypto.randomUUID();started=false;
  }catch(error){show(error.name==='TimeoutError'||error.name==='TypeError'?'Connection interrupted. Your entries are still here. Retry to check receipt using the same reference.':error.message,true);}
  finally{button.disabled=false;button.innerHTML=original;form.removeAttribute('aria-busy');}
 });
 if(form.elements.service&&new URLSearchParams(location.search).get('service')==='ai-agent')form.elements.service.value='AI Agent VA & digital employee';
}
