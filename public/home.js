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

  function select(index, focus = false) {
    tabs.forEach((tab, position) => {
      const selected = position === index;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      const panel = panels[position];
      panel.hidden = !selected;
      panel.classList.toggle('is-entering', selected);
    });

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

  const updateOrientation = () => {
    tablist.setAttribute('aria-orientation', mobile.matches ? 'horizontal' : 'vertical');
  };
  mobile.addEventListener('change', updateOrientation);
  updateOrientation();
  panels.slice(1).forEach((panel) => { panel.hidden = true; });
  tabsRoot.classList.add('is-interactive');
  tablist.hidden = false;
})();
