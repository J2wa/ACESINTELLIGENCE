const button=document.getElementById('google-login'),status=document.getElementById('login-status');
const ready=await fetch('/api/auth-status').then(r=>r.json()).catch(()=>({configured:false}));
if(ready.configured){button.disabled=false;status.textContent='Use your authorized company Google account.';}else{status.textContent='Google sign-in is being configured. Team access will be available soon.';}
if(new URLSearchParams(location.search).has('error'))status.textContent='Sign-in was not completed. Please use an authorized company account and try again.';
button.addEventListener('click',async()=>{
 button.disabled=true;
 try{
 const r=await fetch('/api/auth/csrf');if(!r.ok)throw Error();const {csrfToken}=await r.json();
 const form=document.createElement('form');form.method='POST';form.action='/api/auth/signin/google';
 for(const [name,value]of Object.entries({csrfToken,callbackUrl:'https://workplace.acesintelligence.xyz'})){const input=document.createElement('input');input.type='hidden';input.name=name;input.value=value;form.append(input);}document.body.append(form);form.submit();
 }catch{status.textContent='Sign-in is temporarily unavailable. Please try again later.';button.disabled=false;}
});
