const menu=document.querySelector('.aces-menu'),nav=document.querySelector('.aces-navigation');
if(menu&&nav){
 function closeMenu(){menu.setAttribute('aria-expanded','false');nav.classList.remove('is-open');}
 menu.addEventListener('click',()=>{const open=menu.getAttribute('aria-expanded')!=='true';menu.setAttribute('aria-expanded',String(open));nav.classList.toggle('is-open',open);});
 nav.querySelectorAll('a').forEach(a=>a.addEventListener('click',closeMenu));
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&nav.classList.contains('is-open')){closeMenu();menu.focus();}});
 document.addEventListener('click',e=>{if(!e.target.closest('.aces-header'))closeMenu();});
}
const year=document.getElementById('year');if(year)year.textContent=new Date().getFullYear();
