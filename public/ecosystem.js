/* ==========================================================================
   ACES Intelligence — Interactive Ecosystem Explorer & Fluid Motion Engine
   ========================================================================== */

(function () {
  'use strict';

  const prefersReducedMotion =
    window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer =
    window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  /* ---------- 1. Scroll Progress Hairline ---------- */
  const scrollProgress = document.getElementById('scrollProgress');
  if (scrollProgress) {
    let ticking = false;
    const updateProgress = () => {
      ticking = false;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      const ratio = docHeight > 0 ? Math.min(1, Math.max(0, window.scrollY / docHeight)) : 0;
      scrollProgress.style.transform = `scaleX(${ratio.toFixed(4)})`;
    };
    window.addEventListener(
      'scroll',
      () => {
        if (!ticking) {
          ticking = true;
          requestAnimationFrame(updateProgress);
        }
      },
      { passive: true },
    );
    updateProgress();
  }

  /* ---------- 2. Cursor-Reactive Hero Light Field ---------- */
  const hero = document.querySelector('[data-hero-glow]');
  if (hero && finePointer && !prefersReducedMotion) {
    let rafId = 0;
    let gx = 72;
    let gy = 22;
    hero.addEventListener(
      'pointermove',
      (e) => {
        const rect = hero.getBoundingClientRect();
        gx = ((e.clientX - rect.left) / rect.width) * 100;
        gy = ((e.clientY - rect.top) / rect.height) * 100;
        if (!rafId) {
          rafId = requestAnimationFrame(() => {
            rafId = 0;
            hero.style.setProperty('--mx', `${gx.toFixed(1)}%`);
            hero.style.setProperty('--my', `${gy.toFixed(1)}%`);
          });
        }
      },
      { passive: true },
    );
  }

  /* ---------- 3. Interactive Ecosystem Hub-and-Spoke Explorer ---------- */
  const SITES = [
    {
      name: 'ACES Business',
      domain: 'business.acesintelligence.xyz',
      summary: 'Operational websites, booking platforms, retail POS, payroll & wholesale B2B systems.',
      outcomeLabel: 'Live Interactive Samples',
      outcomeText: 'Explore storefront-to-dashboard demos built for real daily operations.',
      href: 'https://business.acesintelligence.xyz',
      cta: 'Visit ACES Business ↗',
    },
    {
      name: 'ACES Agents',
      domain: 'agents.acesintelligence.xyz',
      summary: 'Hire practical AI employees tailored to daily workflows with your choice of AI provider.',
      outcomeLabel: 'Interactive Studio & 6 Agents',
      outcomeText: 'Test booking, quotes, order resolution, stock reorders, shifts & campaigns live.',
      href: 'https://agents.acesintelligence.xyz',
      cta: 'Visit ACES Agents ↗',
    },
    {
      name: 'ACES Careers',
      domain: 'careers.acesintelligence.xyz',
      summary: 'Remote specialist openings across AI annotation, model evaluation, QA & engineering.',
      outcomeLabel: 'Live Role Board & Talent Pool',
      outcomeText: 'Apply in one click with transparent PHP & USD rates or join our specialist bench.',
      href: 'https://careers.acesintelligence.xyz',
      cta: 'Visit ACES Careers ↗',
    },
  ];

  const explorer = document.getElementById('ecoExplorer');
  const stage = document.getElementById('ecoStage');
  const tabs = document.querySelectorAll('[data-eco-idx]');
  const progressBar = document.getElementById('ecoProgressBar');
  const toggleBtn = document.getElementById('ecoTogglePlay');
  const launchBtn = document.getElementById('ecoLaunchBtn');

  if (explorer && stage && tabs.length) {
    let activeIdx = 0;
    let isPlaying = !prefersReducedMotion;
    let isHovering = false;
    let elapsed = 0;
    const DURATION = 4600;
    let lastTick = performance.now();

    function applySite(idx, animate) {
      activeIdx = (idx + SITES.length) % SITES.length;
      const site = SITES[activeIdx];
      elapsed = 0;

      tabs.forEach((tab) => {
        const match = Number(tab.getAttribute('data-eco-idx')) === activeIdx;
        tab.classList.toggle('is-active', match);
        tab.setAttribute('aria-selected', String(match));
      });

      const paint = () => {
        document.getElementById('ecoNodeName').textContent = site.name;
        document.getElementById('ecoNodeDomain').textContent = site.domain;
        document.getElementById('ecoNodeSummary').textContent = site.summary;
        document.getElementById('ecoOutcomeLabel').textContent = site.outcomeLabel;
        document.getElementById('ecoOutcomeText').textContent = site.outcomeText;
        launchBtn.href = site.href;
        launchBtn.textContent = site.cta;
      };

      if (animate && !prefersReducedMotion) {
        stage.classList.add('is-switching');
        setTimeout(() => {
          paint();
          stage.classList.remove('is-switching');
        }, 150);
      } else {
        paint();
      }
    }

    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        applySite(Number(tab.getAttribute('data-eco-idx')), true);
      });
    });

    explorer.addEventListener('pointerenter', () => {
      isHovering = true;
    });
    explorer.addEventListener('pointerleave', () => {
      isHovering = false;
    });

    if (toggleBtn) {
      toggleBtn.textContent = isPlaying ? 'Pause' : 'Play';
      toggleBtn.addEventListener('click', () => {
        isPlaying = !isPlaying;
        toggleBtn.textContent = isPlaying ? 'Pause' : 'Play';
        toggleBtn.setAttribute('aria-label', isPlaying ? 'Pause auto-cycle' : 'Play auto-cycle');
        lastTick = performance.now();
      });
    }

    function loop(now) {
      const dt = Math.min(100, now - lastTick);
      lastTick = now;
      if (isPlaying && !isHovering && !document.hidden) {
        elapsed += dt;
        if (elapsed >= DURATION) {
          applySite(activeIdx + 1, true);
        }
      }
      if (progressBar) {
        const pct = isPlaying ? Math.min(100, (elapsed / DURATION) * 100) : 0;
        progressBar.style.width = `${pct.toFixed(1)}%`;
      }
      requestAnimationFrame(loop);
    }

    applySite(0, false);
    if (!prefersReducedMotion) {
      requestAnimationFrame(loop);
    }
  }

  /* ---------- 4. Sliding-Pill Category Filter ---------- */
  const filterWrap = document.getElementById('ecoFilters');
  const filterSlider = document.getElementById('ecoFilterSlider');
  const filterBtns = document.querySelectorAll('.eco-filter-btn');
  const siteCards = document.querySelectorAll('#ecoGrid .site-card');

  function positionSlider(btn) {
    if (!filterSlider || !btn || !filterWrap) return;
    filterSlider.style.width = `${btn.offsetWidth}px`;
    filterSlider.style.transform = `translateX(${btn.offsetLeft}px)`;
  }

  if (filterWrap && filterBtns.length) {
    const initial = filterWrap.querySelector('.eco-filter-btn.is-active') || filterBtns[0];
    requestAnimationFrame(() => positionSlider(initial));
    window.addEventListener('resize', () => {
      const current = filterWrap.querySelector('.eco-filter-btn.is-active');
      if (current) positionSlider(current);
    });

    filterBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const cat = btn.getAttribute('data-eco-filter');
        filterBtns.forEach((b) => {
          const active = b === btn;
          b.classList.toggle('is-active', active);
          b.setAttribute('aria-selected', String(active));
        });
        positionSlider(btn);

        siteCards.forEach((card, i) => {
          const cardCat = card.getAttribute('data-eco-cat') || '';
          const show = cat === 'all' || cardCat === cat;
          card.classList.toggle('is-filtered-out', !show);
          if (show && !prefersReducedMotion) {
            card.classList.remove('is-filtering-in');
            void card.offsetWidth;
            card.style.animationDelay = `${i * 55}ms`;
            card.classList.add('is-filtering-in');
          }
        });
      });
    });
  }

  /* ---------- 5. Staggered Scroll Reveals ---------- */
  const revealEls = document.querySelectorAll('[data-reveal]');
  if (revealEls.length && !prefersReducedMotion && 'IntersectionObserver' in window) {
    document.documentElement.classList.add('js-motion');
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const el = entry.target;
            const delay = el.getAttribute('data-delay') || '0';
            el.style.transitionDelay = `${delay}ms`;
            el.classList.add('is-revealed');
            io.unobserve(el);
          }
        });
      },
      { threshold: 0.1, rootMargin: '0px 0px -24px 0px' },
    );
    revealEls.forEach((el) => io.observe(el));
  } else {
    revealEls.forEach((el) => el.classList.add('is-revealed'));
  }

  /* ---------- 6. Desktop 3D Micro-Tilt & Magnetic CTAs ---------- */
  if (finePointer && !prefersReducedMotion) {
    document.querySelectorAll('[data-tilt]').forEach((card) => {
      card.addEventListener('pointermove', (e) => {
        const r = card.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width;
        const y = (e.clientY - r.top) / r.height;
        const rx = (0.5 - y) * 5;
        const ry = (x - 0.5) * 6;
        card.style.setProperty('--cx', `${(x * 100).toFixed(1)}%`);
        card.style.setProperty('--cy', `${(y * 100).toFixed(1)}%`);
        card.style.transform = `perspective(900px) translateY(-4px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg)`;
      });
      card.addEventListener('pointerleave', () => {
        card.style.transform = '';
      });
    });

    document.querySelectorAll('[data-magnetic]').forEach((btn) => {
      btn.addEventListener('pointermove', (e) => {
        const r = btn.getBoundingClientRect();
        const dx = ((e.clientX - (r.left + r.width / 2)) / (r.width / 2)) * 4;
        const dy = ((e.clientY - (r.top + r.height / 2)) / (r.height / 2)) * 3;
        btn.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)`;
      });
      btn.addEventListener('pointerleave', () => {
        btn.style.transform = '';
      });
    });
  }
})();
