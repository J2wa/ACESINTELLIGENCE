(function () {
  'use strict';

  const DEFAULT_CAREERS_BASE = 'https://careers.acesintelligence.xyz';
  const ROLE_LABELS = {
    'Full-Time': 'Full-time',
    'Part-Time': 'Part-time',
    'Project-Basis': 'Project-based',
    'Project-Based': 'Project-based',
  };

  const container = document.getElementById('jobs-container');
  const statusEl = document.getElementById('roles-status');
  const openCountEl = document.getElementById('stat-open-count');
  const deptCountEl = document.getElementById('stat-departments');
  const controlsEl = document.getElementById('careers-controls');
  const searchInput = document.getElementById('careers-search');
  const deptSelect = document.getElementById('careers-department');
  const settingSelect = document.getElementById('careers-setting');
  const clearBtn = document.getElementById('careers-clear');
  const portalLinks = document.querySelectorAll('[data-careers-portal-link]');

  if (!container) return;

  let allJobs = [];
  let careersUrl = `${DEFAULT_CAREERS_BASE}/careers`;

  function formatLabel(label) {
    if (!label) return '';
    if (Object.prototype.hasOwnProperty.call(ROLE_LABELS, label)) return ROLE_LABELS[label];
    return label.replace(/\b[A-Z][a-z]+\b/g, (word, index) => (index === 0 ? word : word.toLowerCase()));
  }

  function formatLocation(location, remote) {
    const clean = (location || '').trim();
    if (!clean) return remote ? 'Remote' : '';
    if (remote && !/\bremote\b/i.test(clean)) return `${clean} (Remote)`;
    return clean;
  }

  function formatRate(cents) {
    return (cents / 100).toLocaleString('en-US', {
      minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
      maximumFractionDigits: 2,
    });
  }

  function safeHref(url, fallback) {
    try {
      const parsed = new URL(url, DEFAULT_CAREERS_BASE);
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') return parsed.toString();
    } catch {}
    return fallback;
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function renderLoading() {
    container.textContent = '';
    const box = el('div', 'jobs-state is-loading');

    const spinner = document.createElement('aces-logo');
    spinner.setAttribute('size', '72');
    spinner.setAttribute('wordmark', 'hide');
    spinner.setAttribute('loading', '');
    spinner.setAttribute('aria-hidden', 'true');
    box.appendChild(spinner);

    box.appendChild(el('p', null, 'Loading current available roles from ACES Careers…'));

    const skelList = el('ul', 'jobs-skeleton-list');
    skelList.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 3; i++) {
      const row = el('li', 'jobs-skeleton-row');
      const bars = el('div', 'skeleton-bars');
      bars.appendChild(el('div', 'skeleton-bar title'));
      bars.appendChild(el('div', 'skeleton-bar meta'));
      row.appendChild(bars);
      row.appendChild(el('div', 'skeleton-bar cta'));
      skelList.appendChild(row);
    }
    box.appendChild(skelList);
    container.appendChild(box);
  }

  function renderEmpty(filtered) {
    container.textContent = '';
    const box = el('div', 'jobs-state');
    if (filtered) {
      box.appendChild(el('h3', null, 'No roles match your current filters.'));
      box.appendChild(el('p', null, 'Try clearing your search or selecting another department or work setting.'));
      const actions = el('div', 'jobs-state-actions');
      const reset = el('button', 'btn', 'Clear all filters');
      reset.type = 'button';
      reset.addEventListener('click', resetFilters);
      actions.appendChild(reset);
      box.appendChild(actions);
    } else {
      box.appendChild(el('h3', null, 'No open roles are listed right now.'));
      box.appendChild(
        el(
          'p',
          null,
          'New specialist positions open regularly as AI evaluation and data annotation projects launch. Create your profile on ACES Careers to be ready when roles open.',
        ),
      );
      const actions = el('div', 'jobs-state-actions');
      const signup = el('a', 'btn');
      signup.href = `${DEFAULT_CAREERS_BASE}/signup`;
      signup.append('Create a profile on ACES Careers ');
      const arrow = el('span', null, '↗');
      arrow.setAttribute('aria-hidden', 'true');
      signup.appendChild(arrow);
      actions.appendChild(signup);

      const board = el('a', 'text-link', 'Visit ACES Careers ↗');
      board.href = careersUrl;
      actions.appendChild(board);
      box.appendChild(actions);
    }
    container.appendChild(box);
  }

  function renderError() {
    container.textContent = '';
    if (statusEl) statusEl.textContent = 'View live openings on ACES Careers';
    if (openCountEl) openCountEl.textContent = 'View portal';
    if (deptCountEl) deptCountEl.textContent = 'Multiple domains';

    const box = el('div', 'jobs-state');
    box.appendChild(el('h3', null, 'View current openings on ACES Careers'));
    box.appendChild(
      el(
        'p',
        null,
        'We couldn’t fetch the live job feed right now. You can browse all active openings and submit your application directly on our careers portal.',
      ),
    );
    const actions = el('div', 'jobs-state-actions');

    const visit = el('a', 'btn');
    visit.href = careersUrl;
    visit.append('Open ACES Careers ');
    const arrow = el('span', null, '↗');
    arrow.setAttribute('aria-hidden', 'true');
    visit.appendChild(arrow);
    actions.appendChild(visit);

    const retry = el('button', 'careers-clear-btn', 'Try again');
    retry.type = 'button';
    retry.addEventListener('click', loadJobs);
    actions.appendChild(retry);

    box.appendChild(actions);
    container.appendChild(box);
  }

  function buildJobRow(job) {
    const listingUrl = safeHref(job.url, `${DEFAULT_CAREERS_BASE}/careers/jobs/${encodeURIComponent(job.id)}`);
    const li = el('li', 'job-row');

    const main = el('div', 'job-main');
    if (job.headerImageUrl) {
      const img = document.createElement('img');
      img.className = 'job-thumb';
      img.src = job.headerImageUrl;
      img.alt = '';
      img.loading = 'lazy';
      img.decoding = 'async';
      img.addEventListener('error', () => img.remove(), { once: true });
      main.appendChild(img);
    }

    const info = el('div', 'job-info');
    const deptLabel = formatLabel(job.department);
    const settingLabel = formatLabel(job.workSetting);
    const roleLabel = formatLabel(job.roleType);
    const locationLabel = formatLocation(job.location, job.remote);

    if (deptLabel || settingLabel) {
      const kicker = el('div', 'job-kicker');
      if (deptLabel) kicker.appendChild(el('span', null, deptLabel));
      if (deptLabel && settingLabel) {
        const sep = el('span', 'job-kicker-sep', '/');
        sep.setAttribute('aria-hidden', 'true');
        kicker.appendChild(sep);
      }
      if (settingLabel) kicker.appendChild(el('span', null, settingLabel));
      info.appendChild(kicker);
    }

    const titleEl = el('h3', 'job-title');
    const titleLink = el('a', null, job.title);
    titleLink.href = listingUrl;
    titleEl.appendChild(titleLink);
    info.appendChild(titleEl);

    if (job.summary) {
      info.appendChild(el('p', 'job-summary', job.summary));
    }

    const metaItems = [];
    if (locationLabel) metaItems.push(locationLabel);
    if (roleLabel) metaItems.push(roleLabel);
    if (settingLabel && settingLabel !== roleLabel) metaItems.push(settingLabel);

    if (metaItems.length) {
      const meta = el('div', 'job-meta');
      metaItems.forEach((item) => meta.appendChild(el('span', 'job-meta-item', item)));
      info.appendChild(meta);
    }

    main.appendChild(info);
    li.appendChild(main);

    const rateBox = el('div', 'job-rate');
    const phpRate = typeof job.hourlyRatePhpCents === 'number' ? `₱${formatRate(job.hourlyRatePhpCents)}/hr` : null;
    const usdRate = typeof job.hourlyRateUsdCents === 'number' ? `$${formatRate(job.hourlyRateUsdCents)}/hr` : null;
    if (phpRate || usdRate) {
      rateBox.appendChild(el('strong', null, phpRate || usdRate));
      if (phpRate && usdRate) rateBox.appendChild(el('span', null, usdRate));
    } else {
      rateBox.appendChild(el('span', 'job-rate-muted', 'See listing for details'));
    }
    li.appendChild(rateBox);

    const actions = el('div', 'job-actions');
    const applyBtn = el('a', 'btn job-apply-btn');
    applyBtn.href = listingUrl;
    applyBtn.setAttribute('aria-label', `Apply for ${job.title} on ACES Careers`);
    applyBtn.append('Apply ');
    const arrow = el('span', null, '↗');
    arrow.setAttribute('aria-hidden', 'true');
    applyBtn.appendChild(arrow);
    actions.appendChild(applyBtn);
    li.appendChild(actions);

    return li;
  }

  function populateFilters(jobs) {
    if (!controlsEl || !deptSelect || !settingSelect) return;
    const departments = [...new Set(jobs.map((j) => j.department).filter(Boolean))].sort();
    const settings = [...new Set(jobs.map((j) => j.workSetting).filter(Boolean))].sort();

    deptSelect.textContent = '';
    deptSelect.appendChild(el('option', null, 'All departments')).value = '';
    departments.forEach((dept) => {
      const opt = el('option', null, formatLabel(dept));
      opt.value = dept;
      deptSelect.appendChild(opt);
    });

    settingSelect.textContent = '';
    settingSelect.appendChild(el('option', null, 'All work settings')).value = '';
    settings.forEach((setting) => {
      const opt = el('option', null, formatLabel(setting));
      opt.value = setting;
      settingSelect.appendChild(opt);
    });

    controlsEl.hidden = jobs.length < 2;
  }

  function updateSummary(jobs) {
    const deptCount = new Set(jobs.map((j) => j.department).filter(Boolean)).size;
    if (openCountEl) {
      openCountEl.textContent = jobs.length === 1 ? '1 open role' : `${jobs.length} open roles`;
    }
    if (deptCountEl) {
      deptCountEl.textContent =
        deptCount === 0
          ? '—'
          : deptCount === 1
            ? formatLabel(jobs.find((j) => j.department).department)
            : `${deptCount} departments`;
    }
  }

  function renderFiltered() {
    const query = (searchInput?.value || '').trim().toLowerCase();
    const dept = deptSelect?.value || '';
    const setting = settingSelect?.value || '';
    const hasFilter = Boolean(query || dept || setting);

    if (clearBtn) clearBtn.hidden = !hasFilter;

    const filtered = allJobs.filter((job) => {
      if (dept && job.department !== dept) return false;
      if (setting && job.workSetting !== setting) return false;
      if (query) {
        const haystack = [job.title, job.summary, job.department, job.roleType, job.workSetting, job.location]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });

    if (statusEl) {
      if (!allJobs.length) {
        statusEl.textContent = '0 open roles';
      } else if (hasFilter) {
        statusEl.textContent = `Showing ${filtered.length} of ${allJobs.length} open ${allJobs.length === 1 ? 'role' : 'roles'}`;
      } else {
        statusEl.textContent = `${allJobs.length} open ${allJobs.length === 1 ? 'role' : 'roles'} · synced with ACES Careers`;
      }
    }

    if (!filtered.length) {
      renderEmpty(hasFilter);
      return;
    }

    container.textContent = '';
    const list = el('ul', 'jobs-list');
    list.setAttribute('role', 'list');
    filtered.forEach((job) => list.appendChild(buildJobRow(job)));
    container.appendChild(list);
  }

  function resetFilters() {
    if (searchInput) searchInput.value = '';
    if (deptSelect) deptSelect.value = '';
    if (settingSelect) settingSelect.value = '';
    renderFiltered();
  }

  async function fetchFeed() {
    const endpoints = ['/api/jobs', `${DEFAULT_CAREERS_BASE}/api/jobs`];
    let lastError = null;
    for (const endpoint of endpoints) {
      try {
        const response = await fetch(endpoint, { headers: { Accept: 'application/json' } });
        if (!response.ok) {
          lastError = new Error(`HTTP ${response.status}`);
          continue;
        }
        const data = await response.json();
        if (Array.isArray(data?.jobs)) return data;
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError || new Error('Jobs feed unavailable');
  }

  async function loadJobs() {
    renderLoading();
    if (controlsEl) controlsEl.hidden = true;
    if (statusEl) statusEl.textContent = 'Syncing open roles…';
    try {
      const data = await fetchFeed();
      if (typeof data.careersUrl === 'string' && data.careersUrl) {
        careersUrl = safeHref(data.careersUrl, `${DEFAULT_CAREERS_BASE}/careers`);
        portalLinks.forEach((link) => {
          link.href = careersUrl;
        });
      }
      allJobs = data.jobs;
      updateSummary(allJobs);
      populateFilters(allJobs);
      renderFiltered();
    } catch {
      renderError();
    }
  }

  searchInput?.addEventListener('input', renderFiltered);
  deptSelect?.addEventListener('change', renderFiltered);
  settingSelect?.addEventListener('change', renderFiltered);
  clearBtn?.addEventListener('click', resetFilters);

  loadJobs();
})();
