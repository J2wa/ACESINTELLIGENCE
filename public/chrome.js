const header = document.querySelector('.aces-header');
const menu = header.querySelector('.aces-menu');
const nav = header.querySelector('.aces-navigation');

function setMenu(open) {
  menu.setAttribute('aria-expanded', String(open));
  nav.classList.toggle('is-open', open);
}

menu.addEventListener('click', () => setMenu(menu.getAttribute('aria-expanded') !== 'true'));
nav.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => setMenu(false)));
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && nav.classList.contains('is-open')) {
    setMenu(false);
    menu.focus();
  }
});
document.addEventListener('click', (event) => {
  if (!header.contains(event.target)) setMenu(false);
});

function updateHeader() {
  header.classList.toggle('is-scrolled', window.scrollY > 16);
}
window.addEventListener('scroll', updateHeader, { passive: true });
updateHeader();
header.classList.add('is-enhanced');

const year = document.getElementById('year');
if (year) year.textContent = new Date().getFullYear();
