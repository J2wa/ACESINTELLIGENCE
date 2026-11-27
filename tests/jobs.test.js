import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { handleJobs, parseCareersHtml } from '../lib/jobs.js';

const ORIGIN = 'https://careers.acesintelligence.xyz';

test('handleJobs rejects non-GET/HEAD methods', async () => {
  const res = await handleJobs(new Request('https://acesintelligence.xyz/api/jobs', { method: 'POST' }));
  assert.equal(res.status, 405);
  assert.equal(res.headers.get('allow'), 'GET, HEAD');
});

test('handleJobs proxies and normalizes JSON from the j2work /api/jobs endpoint', async () => {
  let requestedUrl = '';
  const fetchImpl = async (url) => {
    requestedUrl = url;
    return Response.json({
      careersUrl: `${ORIGIN}/careers`,
      count: 2,
      jobs: [
        {
          id: 'multimodal-annotator',
          title: 'Multimodal Data Annotator',
          department: 'Data Annotation',
          roleType: 'Annotation',
          workSetting: 'Project-Basis',
          location: 'Philippines',
          remote: true,
          headerImageUrl: '/api/job-images/11111111-1111-1111-1111-111111111111.jpg',
          hourlyRatePhpCents: 25050,
          hourlyRateUsdCents: 500,
          summary: 'Review and annotate video, image, and audio content.',
          createdAt: '2026-11-20T00:00:00.000Z',
          url: `${ORIGIN}/careers/jobs/multimodal-annotator`,
        },
        {
          id: 'bad-url-role',
          title: 'AI Model Evaluator',
          department: 'Model Evaluation',
          roleType: 'Evaluation',
          workSetting: 'Part-Time',
          location: 'Philippines',
          remote: true,
          hourlyRatePhpCents: null,
          hourlyRateUsdCents: 800,
          summary: 'Assess AI responses.',
          url: 'https://evil.example/phish',
        },
      ],
    });
  };

  const res = await handleJobs(new Request('https://acesintelligence.xyz/api/jobs'), {
    env: {},
    fetchImpl,
  });
  assert.equal(res.status, 200);
  assert.equal(requestedUrl, `${ORIGIN}/api/jobs`);
  assert.match(res.headers.get('cache-control') || '', /s-maxage=60/);

  const body = await res.json();
  assert.equal(body.source, 'api');
  assert.equal(body.careersUrl, `${ORIGIN}/careers`);
  assert.equal(body.count, 2);
  assert.equal(
    body.jobs[0].headerImageUrl,
    `${ORIGIN}/api/job-images/11111111-1111-1111-1111-111111111111.jpg`,
  );
  assert.equal(body.jobs[0].hourlyRatePhpCents, 25050);
  assert.equal(body.jobs[0].url, `${ORIGIN}/careers/jobs/multimodal-annotator`);
  assert.equal(
    body.jobs[1].url,
    `${ORIGIN}/careers/jobs/bad-url-role`,
    'External job URLs are replaced with the canonical careers portal listing URL',
  );
});

test('handleJobs falls back to parsing j2work /careers HTML when /api/jobs is not yet deployed', async () => {
  const sampleHtml = `
    <ul class="role-list" role="list">
      <li class="role-row"><h2><a href="/careers/jobs/broken%zz">Malformed listing</a></h2></li>
      <li class="role-row">
        <div class="role-row-details">
          <h2><a href="/careers/jobs/multimodal-annotator">Multimodal Data &amp; Video Annotator</a></h2>
          <div class="job-meta">
            <span>Data annotation</span>
            <span>Philippines (Remote)</span>
            <span>Annotation</span>
            <span>Project-based</span>
          </div>
        </div>
        <div class="role-pay"><strong>₱250.50/hr</strong><span>$5/hr</span></div>
        <a href="/careers/jobs/multimodal-annotator">Apply</a>
      </li>
      <li class="role-row">
        <div class="role-row-details">
          <h2><a href="/careers/jobs/qa-specialist">Multimodal QA Specialist</a></h2>
          <div class="job-meta">
            <span>Quality &amp; operations</span>
            <span>Manila</span>
            <span>Full-time</span>
          </div>
        </div>
        <div class="role-pay"><span>Rate not listed</span></div>
      </li>
    </ul>
  `;

  const fetchImpl = async (url) => {
    if (url.endsWith('/api/jobs')) return new Response('Not Found', { status: 404 });
    return new Response(sampleHtml, { status: 200, headers: { 'Content-Type': 'text/html' } });
  };

  const res = await handleJobs(new Request('https://acesintelligence.xyz/api/jobs'), {
    env: {},
    fetchImpl,
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.source, 'html');
  assert.equal(body.count, 2);

  assert.deepEqual(body.jobs[0], {
    id: 'multimodal-annotator',
    title: 'Multimodal Data & Video Annotator',
    department: 'Data annotation',
    roleType: 'Annotation',
    workSetting: 'Project-based',
    location: 'Philippines',
    remote: true,
    headerImageUrl: null,
    hourlyRatePhpCents: 25050,
    hourlyRateUsdCents: 500,
    summary: '',
    createdAt: null,
    url: `${ORIGIN}/careers/jobs/multimodal-annotator`,
  });

  assert.equal(body.jobs[1].title, 'Multimodal QA Specialist');
  assert.equal(body.jobs[1].department, 'Quality & operations');
  assert.equal(body.jobs[1].remote, false);
  assert.equal(body.jobs[1].hourlyRatePhpCents, null);
  assert.equal(body.jobs[1].hourlyRateUsdCents, null);
  assert.equal(body.jobs[1].url, `${ORIGIN}/careers/jobs/qa-specialist`);
});

test('parseCareersHtml returns empty array when no roles are open', () => {
  const html = '<p class="empty-roles">No open roles right now.</p>';
  assert.deepEqual(parseCareersHtml(html, ORIGIN), []);
});

test('handleJobs can distinguish an empty board from an unavailable board', async () => {
  const request = new Request('https://acesintelligence.xyz/api/jobs');
  const fetchBoard = (html) => async (url) => url.endsWith('/api/jobs')
    ? new Response(null, { status: 503 })
    : new Response(html);
  const empty = await handleJobs(request, {
    env: {},
    fetchImpl: fetchBoard('<p class="empty-roles">No open roles right now.</p>'),
  });
  assert.equal(empty.status, 200);
  assert.deepEqual(await empty.json(), {
    careersUrl: `${ORIGIN}/careers`,
    count: 0,
    jobs: [],
    source: 'html',
  });

  const unavailable = await handleJobs(request, { env: {}, fetchImpl: fetchBoard('<h1>Maintenance</h1>') });
  assert.equal(unavailable.status, 503);
});

test('handleJobs returns 503 with careersUrl fallback when upstream is unreachable', async () => {
  const res = await handleJobs(new Request('https://acesintelligence.xyz/api/jobs'), {
    env: {},
    fetchImpl: async () => {
      throw new Error('ECONNREFUSED');
    },
  });
  assert.equal(res.status, 503);
  const body = await res.json();
  assert.equal(body.careersUrl, `${ORIGIN}/careers`);
  assert.deepEqual(body.jobs, []);
});

test('all ACES Intelligence HTML pages use the new vector logo and favicon', () => {
  const pages = ['index.html', 'careers.html', 'inquiry.html', 'agents.html', 'team-login.html'];
  for (const page of pages) {
    const html = readFileSync(new URL(`../public/${page}`, import.meta.url), 'utf8');
    assert.match(html, /<link rel="icon" href="\/favicon\.svg" type="image\/svg\+xml">/, `${page} includes favicon.svg`);
    assert.match(html, /<script src="\/aces-logo\.js" defer><\/script>/, `${page} loads aces-logo.js`);
    assert.match(html, /<aces-logo\b[^>]*class="aces-logo-mark"/, `${page} uses interactive header logo`);
    assert.match(html, /<aces-logo\b[^>]*class="aces-logo-footer"/, `${page} uses interactive footer logo`);
    assert.doesNotMatch(html, /class="aces-mark"/, `${page} no longer uses placeholder A. mark`);
  }
});
