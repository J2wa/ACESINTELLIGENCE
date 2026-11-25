import { createHash } from 'node:crypto';
const RECIPIENT = 'acesintelligenceph@gmail.com';
const MAX_FILE = 3 * 1024 * 1024;
const MAX_BODY = MAX_FILE + 64 * 1024;
const json = (body, status = 200) => Response.json(body, {status, headers: {'Cache-Control': 'no-store'}});
class Invalid extends Error {}
function field(data, key, max, min = 0) {
  const value = data.get(key);
  if (value !== null && typeof value !== 'string') throw new Invalid('Please check the form fields.');
  const text = (value || '').trim();
  if (text.length < min || text.length > max || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text)) throw new Invalid(`Please check your ${key}.`);
  return text;
}
export async function handleSubmission(request, {env = process.env, send = fetch} = {}) {
  if (request.method !== 'POST') return new Response(null, {status:405, headers:{Allow:'POST','Cache-Control':'no-store'}});
  const origins = new Set(['https://acesintelligence.xyz', 'https://aces-intelligence.vercel.app', 'https://aces-intelligence-aces-intelligence.vercel.app']);
  for (const host of [env.VERCEL_URL, env.VERCEL_PROJECT_PRODUCTION_URL]) if (host) origins.add(`https://${host}`);
  if (!origins.has(request.headers.get('origin'))) return json({error:'Please submit this form from the ACES website.'},403);
  if (!request.headers.get('content-type')?.startsWith('multipart/form-data')) return json({error:'Please use the website form.'},415);
  if (Number(request.headers.get('content-length')) > MAX_BODY) return json({error:'Please upload a PDF no larger than 3 MB.'},413);
  try {
    // Bound actual bytes as well as Content-Length; files remain private and in memory.
    const reader = request.body?.getReader();
    if (!reader) throw new Invalid('The form was empty.');
    const chunks = []; let size = 0;
    while (true) {
      const {done,value} = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY) { await reader.cancel(); return json({error:'Please upload a PDF no larger than 3 MB.'},413); }
      chunks.push(value);
    }
    const data = await new Response(Buffer.concat(chunks), {headers:{'Content-Type':request.headers.get('content-type')}}).formData();
    if (field(data,'website',300)) throw new Invalid('Unable to submit this form.');
    const started = Number(field(data,'startedAt',20,1));
    if (!Number.isFinite(started) || Date.now() - started < 2000 || Date.now() - started > 86400000) throw new Invalid('Please take a moment to review your details, then send again. Refresh this page if it has been open for over a day.');
    const id = field(data,'submissionId',36,36);
    if (!/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id)) throw new Invalid('Please refresh the page and try again.');
    const kind = field(data,'kind',20,1);
    if (!['inquiry','application'].includes(kind)) throw new Invalid('Please choose a valid form.');
    const name = field(data,'name',120,2);
    const email = field(data,'email',254,3);
    if (!/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(email)) throw new Invalid('Please enter a valid email address.');
    if (field(data,'consent',3) !== 'yes') throw new Invalid('Please agree to the submission notice.');
    let text = `New ACES ${kind}\n\nFull name: ${name}\nEmail: ${email}\n`;
    let attachments;
    if (kind === 'application') {
      const phone = field(data,'phone',35,7);
      if (!/^[+\d\s().-]+$/.test(phone) || phone.replace(/\D/g,'').length < 7) throw new Invalid('Please enter a valid phone number.');
      text += `Phone: ${phone}\nExpertise: ${field(data,'specialty',150) || 'Not specified'}\n`;
      const file = data.get('resume');
      if (!file || typeof file === 'string' || !file.size || file.size > MAX_FILE || !/\.pdf$/i.test(file.name)) throw new Invalid('Please attach a PDF résumé no larger than 3 MB.');
      const bytes = Buffer.from(await file.arrayBuffer());
      if (!bytes.subarray(0,5).equals(Buffer.from('%PDF-')) || !bytes.subarray(-2048).includes(Buffer.from('%%EOF'))) throw new Invalid('The résumé does not appear to be a valid PDF. Please export it as PDF and try again.');
      // Use a fixed attachment name, never a visitor-controlled path or URL.
      attachments = [{filename:'resume.pdf',content:bytes.toString('base64')}];
    } else {
      text += `Company: ${field(data,'company',150) || 'Not specified'}\nService: ${field(data,'service',150,2)}\n\nProject details:\n${field(data,'message',5000,20)}\n`;
    }
    text += '\nThe submitter agreed to send these details to ACES for a response or application review.\nSent from the ACES Intelligence website.';
    const key = env.connect_RESEND_API_KEY || env.RESEND_API_KEY;
    const domain = (env.connect_RESEND_EMAIL_DOMAIN || env.RESEND_EMAIL_DOMAIN || '').trim();
    if (!key || !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(domain)) {
      console.error('aces_email_configuration_missing');
      return json({error:'Sending is temporarily unavailable. Please try again later or email acesintelligenceph@gmail.com.'},503);
    }
    const payload = {from:`ACES Intelligence <forms@${domain}>`,to:[RECIPIENT],reply_to:email,subject:kind === 'application' ? 'ACES — New career application' : 'ACES — New project inquiry',text,...(attachments ? {attachments} : {})};
    const digest = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    const response = await send('https://api.resend.com/emails', {method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json','Idempotency-Key':`aces/${id}/${digest}`},body:JSON.stringify(payload),signal:AbortSignal.timeout(20000)});
    const result = await response.json().catch(()=>({}));
    if (!response.ok || !result.id) {
      // Log only provider status/code; never applicant data, attachments, or credentials.
      const reason = /domain.*not verified|verify.*domain|domain is not verified/i.test(result.message || '') ? 'sender_domain_unverified' : /only send testing emails|testing.*email|own email address/i.test(result.message || '') ? 'test_recipient_restriction' : /API key.*invalid|invalid.*API key/i.test(result.message || '') ? 'invalid_api_key' : 'other_provider_rejection';
      console.error('aces_email_rejected', response.status, String(result.name || 'unknown').slice(0,80), reason, 'sender_domain', domain);
      return json({error:'We couldn’t send your submission. Your entries are still here. Please try again later or email acesintelligenceph@gmail.com.'},502);
    }
    return json({ok:true});
  } catch (error) {
    if (error instanceof Invalid) return json({error:error.message},400);
    if (error instanceof TypeError && /formdata|multipart/i.test(error.message)) return json({error:'The form could not be read. Please try again.'},400);
    console.error('aces_submission_failed', error?.name || 'Error');
    return json({error:'We couldn’t confirm sending. Please retry; duplicate sends are prevented.'},502);
  }
}