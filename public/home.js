(() => {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if ('IntersectionObserver' in window && !reduce) {
    const reveals = new IntersectionObserver((entries) => {
      entries.forEach(({ target, isIntersecting }) => {
        if (isIntersecting) {
          target.classList.remove('awaiting-reveal');
          reveals.unobserve(target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px' });

    document.querySelectorAll('.reveal').forEach((element) => {
      element.classList.add('awaiting-reveal');
      reveals.observe(element);
    });
  }

  const steps = document.querySelector('[data-steps]');
  const items = [...steps.querySelectorAll('.step')];
  const showSteps = () => {
    steps.style.setProperty('--p', 1);
    items.forEach((step, index) => {
      if (reduce) step.classList.add('on');
      else setTimeout(() => step.classList.add('on'), 250 + index * 380);
    });
  };

  if ('IntersectionObserver' in window && !reduce) {
    const progress = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        showSteps();
        progress.disconnect();
      }
    }, { threshold: 0.25 });
    progress.observe(steps);
  } else {
    showSteps();
  }

  const tabsRoot = document.querySelector('[data-tabs]');
  const tablist = tabsRoot.querySelector('[role="tablist"]');
  const tabs = [...tablist.querySelectorAll('[role="tab"]')];
  const panels = tabs.map((tab) => document.getElementById(tab.getAttribute('aria-controls')));
  const mobile = window.matchMedia('(max-width: 860px)');

  const AUTO_MS = 5500;
  let activePanelIndex = 0;
  let samplesInView = false;
  let userPaused = reduce;
  let pointerPaused = false;
  let autoTimer = 0;

  const decks = panels.map((panel) => {
    const bar = panel.querySelector('[data-wf-bar]');
    const foot = panel.querySelector('[data-wf-foot]');
    const stage = panel.querySelector('[data-wf-stage]');
    const faces = [...panel.querySelectorAll('[data-wf-face]')];
    const stepBtns = [...panel.querySelectorAll('[data-wf-step]')];
    const prevBtn = panel.querySelector('[data-wf-prev]');
    const nextBtn = panel.querySelector('[data-wf-next]');
    const toggleBtn = panel.querySelector('[data-wf-toggle]');
    const counterEl = panel.querySelector('[data-wf-counter]');
    const nextLink = panel.querySelector('[data-wf-next-link]');
    const progressWrap = panel.querySelector('.wf-progress');

    const state = {
      panel,
      bar,
      foot,
      stage,
      faces,
      stepBtns,
      toggleBtn,
      counterEl,
      nextLink,
      progressWrap,
      current: 0,
      flipTimer: 0,
    };

    function syncMeta(index) {
      const total = faces.length;
      const nextIndex = (index + 1) % total;
      const nextTitle = faces[nextIndex]?.dataset.wfTitle || 'Next step';
      stepBtns.forEach((btn, i) => {
        const selected = i === index;
        btn.setAttribute('aria-selected', String(selected));
        btn.tabIndex = selected ? 0 : -1;
      });
      if (counterEl) counterEl.textContent = `Step ${index + 1} of ${total}`;
      if (nextLink) {
        nextLink.textContent =
          index === total - 1 ? `Restart: ${nextTitle} ↻` : `Next: ${nextTitle} →`;
      }
    }

    function applyFace(index) {
      faces.forEach((face, i) => face.classList.toggle('is-active', i === index));
      state.current = index;
      syncMeta(index);
    }

    function flipTo(targetIndex, direction = 'next', instant = false) {
      const total = faces.length;
      const nextIndex = ((targetIndex % total) + total) % total;
      clearTimeout(state.flipTimer);
      stage.classList.remove(
        'is-flipping-out-next',
        'is-flipping-in-next',
        'is-flipping-out-prev',
        'is-flipping-in-prev',
      );

      if (instant || reduce || nextIndex === state.current) {
        applyFace(nextIndex);
        restartAuto();
        return;
      }

      const outClass = direction === 'prev' ? 'is-flipping-out-prev' : 'is-flipping-out-next';
      const inClass = direction === 'prev' ? 'is-flipping-in-prev' : 'is-flipping-in-next';
      stage.classList.add(outClass);

      state.flipTimer = setTimeout(() => {
        stage.classList.remove(outClass);
        applyFace(nextIndex);
        void stage.offsetWidth;
        stage.classList.add(inClass);
        state.flipTimer = setTimeout(() => {
          stage.classList.remove(inClass);
        }, 300);
        restartAuto();
      }, 185);
    }

    stepBtns.forEach((btn, i) => {
      btn.addEventListener('click', () => {
        if (i === state.current) return;
        flipTo(i, i > state.current ? 'next' : 'prev');
      });
      btn.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowRight') {
          event.preventDefault();
          const dest = (i + 1) % faces.length;
          flipTo(dest, 'next');
          stepBtns[dest].focus();
        } else if (event.key === 'ArrowLeft') {
          event.preventDefault();
          const dest = (i - 1 + faces.length) % faces.length;
          flipTo(dest, 'prev');
          stepBtns[dest].focus();
        }
      });
    });

    prevBtn?.addEventListener('click', () => flipTo(state.current - 1, 'prev'));
    nextBtn?.addEventListener('click', () => flipTo(state.current + 1, 'next'));
    nextLink?.addEventListener('click', () => flipTo(state.current + 1, 'next'));
    toggleBtn?.addEventListener('click', () => {
      userPaused = !userPaused;
      syncPlayButtons();
      restartAuto();
    });

    if (bar) bar.hidden = false;
    if (foot) foot.hidden = false;
    applyFace(0);
    state.flipTo = flipTo;
    return state;
  });

  function syncPlayButtons() {
    decks.forEach((deck) => {
      if (!deck.toggleBtn) return;
      deck.toggleBtn.setAttribute('aria-pressed', String(userPaused));
      deck.toggleBtn.textContent = userPaused ? 'Play' : 'Pause';
      deck.toggleBtn.setAttribute(
        'aria-label',
        userPaused ? 'Resume automatic step flipping' : 'Pause automatic step flipping',
      );
    });
  }

  function stopAuto() {
    clearTimeout(autoTimer);
    autoTimer = 0;
    decks.forEach((deck) => {
      deck.progressWrap?.classList.remove('is-running', 'is-paused');
    });
  }

  function restartAuto() {
    stopAuto();
    const deck = decks[activePanelIndex];
    if (!deck || reduce || userPaused || !samplesInView) return;
    if (pointerPaused) {
      deck.progressWrap?.classList.add('is-running', 'is-paused');
      return;
    }
    if (deck.progressWrap) {
      void deck.progressWrap.offsetWidth;
      deck.progressWrap.classList.add('is-running');
    }
    autoTimer = setTimeout(() => {
      deck.flipTo(deck.current + 1, 'next');
    }, AUTO_MS);
  }

  function select(index, focus = false) {
    activePanelIndex = index;
    tabs.forEach((tab, position) => {
      const selected = position === index;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      const panel = panels[position];
      panel.hidden = !selected;
      panel.classList.toggle('is-entering', selected);
    });
    decks[index]?.flipTo(0, 'next', true);
    if (focus) tabs[index].focus();
  }

  tabs.forEach((tab, index) => {
    const panel = panels[index];
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', tab.id);
    panel.tabIndex = 0;
    tab.addEventListener('click', () => select(index));
    tab.addEventListener('keydown', (event) => {
      const next = mobile.matches ? 'ArrowRight' : 'ArrowDown';
      const previous = mobile.matches ? 'ArrowLeft' : 'ArrowUp';
      let destination;

      switch (event.key) {
        case next:
          destination = (index + 1) % tabs.length;
          break;
        case previous:
          destination = (index - 1 + tabs.length) % tabs.length;
          break;
        case 'Home':
          destination = 0;
          break;
        case 'End':
          destination = tabs.length - 1;
          break;
        default:
          return;
      }

      event.preventDefault();
      select(destination, true);
    });
  });

  const samplesSection = document.getElementById('samples');
  if (samplesSection) {
    samplesSection.addEventListener('pointerenter', () => {
      pointerPaused = true;
      clearTimeout(autoTimer);
      decks[activePanelIndex]?.progressWrap?.classList.add('is-paused');
    });
    samplesSection.addEventListener('pointerleave', () => {
      pointerPaused = false;
      restartAuto();
    });
    samplesSection.addEventListener('focusin', () => {
      pointerPaused = true;
      clearTimeout(autoTimer);
      decks[activePanelIndex]?.progressWrap?.classList.add('is-paused');
    });
    samplesSection.addEventListener('focusout', (event) => {
      if (!samplesSection.contains(event.relatedTarget)) {
        pointerPaused = false;
        restartAuto();
      }
    });

    if ('IntersectionObserver' in window && !reduce) {
      const watchSamples = new IntersectionObserver(
        ([entry]) => {
          samplesInView = entry.isIntersecting;
          if (samplesInView) restartAuto();
          else stopAuto();
        },
        { threshold: 0.25 },
      );
      watchSamples.observe(samplesSection);
    }
  }

  const updateOrientation = () => {
    tablist.setAttribute('aria-orientation', mobile.matches ? 'horizontal' : 'vertical');
  };
  mobile.addEventListener('change', updateOrientation);
  updateOrientation();
  panels.slice(1).forEach((panel) => { panel.hidden = true; });
  tabsRoot.classList.add('is-interactive');
  tablist.hidden = false;
  syncPlayButtons();
})();
