const form = document.getElementById('aces-form');
const status = document.getElementById('form-status');
const button = form.querySelector('button[type=submit]');
const originalButton = button.innerHTML;
let submissionId = crypto.randomUUID();
let startedAt = Date.now();
document.getElementById('year').textContent = new Date().getFullYear();
form.addEventListener('input', () => { submissionId = crypto.randomUUID(); });
function show(message, type) {
  status.textContent = message;
  status.className = `status ${type}`;
  status.focus();
}
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  const file = form.elements.resume?.files[0];
  if (file && (!/\.pdf$/i.test(file.name) || file.size > 3 * 1024 * 1024 || !file.size)) {
    show('Please upload a PDF résumé no larger than 3 MB.', 'error');
    return;
  }
  const data = new FormData(form);
  // Preserve project interest in the existing application details email field.
  if (form.dataset.kind === 'application' && data.getAll('projects').includes('Multimodal data annotation')) {
    const expertise = String(data.get('specialty') || '').trim();
    data.set('specialty', 'Project: Multimodal data annotation' + (expertise ? '; Expertise: ' + expertise : ''));
  }
  data.set('submissionId', submissionId);
  data.set('startedAt', String(startedAt));
  button.disabled = true;
  button.textContent = 'Sending…';
  status.textContent = 'Sending your details securely…';
  status.className = 'status';
  try {
    const response = await fetch('/api/submit', { method: 'POST', body: data });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'We couldn’t send your submission. Please try again shortly.');
    show(form.dataset.kind === 'application' ? 'Thank you. Your application and résumé have been sent to ACES. The team will contact you if there’s a suitable opportunity.' : 'Thank you. Your inquiry has been sent to ACES. The team can reply to the email address you provided.', 'success');
    form.reset();
    submissionId = crypto.randomUUID();
    startedAt = Date.now();
  } catch (error) {
    show(error.message === 'Failed to fetch' ? 'Connection interrupted. Your entries are still here. Please retry; duplicate sends are prevented.' : error.message, 'error');
  } finally {
    button.disabled = false;
    button.innerHTML = originalButton;
  }
});

if(form.elements.service && new URLSearchParams(location.search).get("service")==="ai-agent") form.elements.service.value="AI Agent VA & digital employee";
