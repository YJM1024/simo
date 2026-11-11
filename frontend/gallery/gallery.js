(() => {
  const dialog = document.getElementById('g-dialog');
  document.querySelectorAll('[data-dialog]').forEach(btn => btn.addEventListener('click', () => { dialog.hidden = false; }));
  document.querySelectorAll('[data-close]').forEach(btn => btn.addEventListener('click', () => { dialog.hidden = true; }));
  dialog.addEventListener('click', e => { if (e.target === dialog) dialog.hidden = true; });

  const pop = document.getElementById('g-perm');
  document.querySelectorAll('[data-popover]').forEach(btn => btn.addEventListener('click', () => { pop.hidden = !pop.hidden; }));
  document.addEventListener('click', e => { if (!pop.hidden && !pop.contains(e.target)) pop.hidden = true; });

  const toast = document.getElementById('g-toast');
  let timer = 0;
  document.querySelectorAll('[data-toast]').forEach(btn => btn.addEventListener('click', () => {
    toast.hidden = false;
    clearTimeout(timer);
    timer = setTimeout(() => { toast.hidden = true; }, 2200);
  }));

  const links = [...document.querySelectorAll('.g-nav a')];
  links.forEach(a => a.addEventListener('click', () => {
    links.forEach(x => x.classList.remove('is-active'));
    a.classList.add('is-active');
  }));
  // 滚动时高亮左侧导航
  const sections = [...document.querySelectorAll('.g-section')];
  const linkFor = (id) => document.querySelector('.g-nav a[href="#' + id + '"]');
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const link = linkFor(entry.target.id);
      if (!link) return;
      links.forEach((x) => x.classList.remove('is-active'));
      link.classList.add('is-active');
    });
  }, { rootMargin: '-20% 0px -70% 0px', threshold: 0 });
  sections.forEach((s) => io.observe(s));
})();
