const DEFAULT_CAREERS_ORIGIN = 'https://careers.acesintelligence.xyz';

function resolveOrigin(env = process.env) {
  const raw = (env.CAREERS_SITE_URL || DEFAULT_CAREERS_ORIGIN).trim();
  try {
    const parsed = new URL(raw);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.origin;
    }
  } catch {}
  return DEFAULT_CAREERS_ORIGIN;
}

function decodeHtml(text) {
  return String(text || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/gi, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\s+/g, ' ')
    .trim();
}

function stripTags(html) {
  return decodeHtml(String(html || '').replace(/<[^>]+>/g, ' '));
}

function parseRateCents(text, symbol) {
  const escaped = symbol === '$' ? '\\$' : symbol;
  const match = new RegExp(`${escaped}\\s*([\\d,]+(?:\\.\\d{1,2})?)\\s*\\/\\s*hr`, 'i').exec(text);
  if (!match) return null;
  const amount = Number(match[1].replace(/,/g, ''));
  return Number.isFinite(amount) && amount >= 0 ? Math.round(amount * 100) : null;
}

function safeImageUrl(value, origin) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const trimmed = value.trim();
  if (trimmed.startsWith('/')) return `${origin}${trimmed}`;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') return parsed.toString();
  } catch {}
  return null;
}

function safeJobUrl(value, id, origin) {
  const fallback = `${origin}/careers/jobs/${encodeURIComponent(id)}`;
  if (typeof value !== 'string' || !value.trim()) return fallback;
  try {
    const parsed = new URL(value, origin);
    if (parsed.origin === origin && parsed.pathname.startsWith('/careers/jobs/')) {
      return parsed.toString();
    }
  } catch {}
  return fallback;
}

export function normalizeJob(raw, origin = DEFAULT_CAREERS_ORIGIN) {
  if (!raw || typeof raw !== 'object') return null;
  const id = typeof raw.id === 'string' ? raw.id.trim() : '';
  const title = typeof raw.title === 'string' ? raw.title.trim() : '';
  if (!id || !title) return null;
  const phpCents = Number.isInteger(raw.hourlyRatePhpCents) && raw.hourlyRatePhpCents >= 0 ? raw.hourlyRatePhpCents : null;
  const usdCents = Number.isInteger(raw.hourlyRateUsdCents) && raw.hourlyRateUsdCents >= 0 ? raw.hourlyRateUsdCents : null;
  return {
    id,
    title,
    department: typeof raw.department === 'string' ? raw.department.trim() : '',
    roleType: typeof raw.roleType === 'string' ? raw.roleType.trim() : '',
    workSetting: typeof raw.workSetting === 'string' ? raw.workSetting.trim() : '',
    location: typeof raw.location === 'string' ? raw.location.trim() : '',
    remote: Boolean(raw.remote),
    headerImageUrl: safeImageUrl(raw.headerImageUrl, origin),
    hourlyRatePhpCents: phpCents,
    hourlyRateUsdCents: usdCents,
    summary: typeof raw.summary === 'string' ? raw.summary.trim() : '',
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : null,
    url: safeJobUrl(raw.url, id, origin),
  };
}

export function parseCareersHtml(html, origin = DEFAULT_CAREERS_ORIGIN) {
  const jobs = [];
  const rowPattern = /<li\b[^>]*class="[^"]*\brole-row\b[^"]*"[^>]*>([\s\S]*?)<\/li>/gi;
  let rowMatch;
  while ((rowMatch = rowPattern.exec(html)) !== null) {
    const block = rowMatch[1];
    const linkMatch = /<a\b[^>]*href="\/careers\/jobs\/([^"?#]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(block);
    if (!linkMatch) continue;
    const id = decodeURIComponent(linkMatch[1]).trim();
    const title = stripTags(linkMatch[2]);
    if (!id || !title) continue;

    const metaBlock = /<div\b[^>]*class="[^"]*\bjob-meta\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i.exec(block)?.[1] || '';
    const spans = [...metaBlock.matchAll(/<span\b[^>]*>([\s\S]*?)<\/span>/gi)].map((m) => stripTags(m[1])).filter(Boolean);
    const department = spans[0] || '';
    const rawLocation = spans[1] || '';
    const remote = /\bremote\b/i.test(rawLocation);
    const location = rawLocation.replace(/\s*\(remote\)\s*/i, '').trim() || rawLocation;
    const roleType = spans[2] || '';
    const workSetting = spans[3] || spans[2] || '';

    const payBlock = /<div\b[^>]*class="[^"]*\brole-pay\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i.exec(block)?.[1] || '';
    const payText = stripTags(payBlock);

    jobs.push(
      normalizeJob(
        {
          id,
          title,
          department,
          roleType,
          workSetting,
          location,
          remote,
          hourlyRatePhpCents: parseRateCents(payText, '₱'),
          hourlyRateUsdCents: parseRateCents(payText, '$'),
          summary: '',
          url: `${origin}/careers/jobs/${encodeURIComponent(id)}`,
        },
        origin,
      ),
    );
  }
  return jobs.filter(Boolean);
}

export async function handleJobs(request, { env = process.env, fetchImpl = fetch } = {}) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD', 'Cache-Control': 'no-store' } });
  }
  const origin = resolveOrigin(env);
  const careersUrl = `${origin}/careers`;
  const cacheHeaders = { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' };

  try {
    const apiResponse = await fetchImpl(`${origin}/api/jobs`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    if (apiResponse.ok && apiResponse.headers.get('content-type')?.includes('application/json')) {
      const data = await apiResponse.json();
      if (Array.isArray(data?.jobs)) {
        const jobs = data.jobs.map((job) => normalizeJob(job, origin)).filter(Boolean);
        return Response.json(
          { careersUrl, count: jobs.length, jobs, source: 'api' },
          { headers: cacheHeaders },
        );
      }
    }
    if (apiResponse.status === 404 || apiResponse.status === 405) {
      const htmlResponse = await fetchImpl(careersUrl, {
        headers: { Accept: 'text/html' },
        signal: AbortSignal.timeout(8000),
      });
      if (htmlResponse.ok) {
        const html = await htmlResponse.text();
        const jobs = parseCareersHtml(html, origin);
        return Response.json(
          { careersUrl, count: jobs.length, jobs, source: 'html' },
          { headers: cacheHeaders },
        );
      }
    }
  } catch (error) {
    console.error('aces_jobs_fetch_failed', error?.name || 'Error');
  }

  return Response.json(
    {
      error: 'Live job listings are temporarily unavailable.',
      careersUrl,
      count: 0,
      jobs: [],
    },
    { status: 503, headers: { 'Cache-Control': 'no-store' } },
  );
}
