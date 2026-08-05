// ============ MOBILE NAV TOGGLE ============
const navToggle = document.getElementById('navToggle');
const mainNav = document.getElementById('mainNav');

if (navToggle && mainNav) {
  navToggle.addEventListener('click', () => {
    const isOpen = mainNav.classList.toggle('is-open');
    navToggle.setAttribute('aria-expanded', String(isOpen));
  });

  // Close menu when a link is tapped
  mainNav.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      mainNav.classList.remove('is-open');
      navToggle.setAttribute('aria-expanded', 'false');
    });
  });
}

// ============ HEADER STATE ON SCROLL ============
const header = document.getElementById('siteHeader');

if (header) {
  const onScroll = () => {
    if (window.scrollY > 40) {
      header.style.background = 'rgba(11,11,12,0.92)';
    } else {
      header.style.background = 'rgba(11,11,12,0.72)';
    }
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

// ============ PARTNER CONTACT MODAL ============
const partnerContactBtn = document.getElementById('partnerContactBtn');
const partnerContactModal = document.getElementById('partnerContactModal');

if (partnerContactBtn && partnerContactModal) {
  const openModal = () => {
    partnerContactModal.classList.add('is-open');
    partnerContactModal.setAttribute('aria-hidden', 'false');
  };
  const closeModal = () => {
    partnerContactModal.classList.remove('is-open');
    partnerContactModal.setAttribute('aria-hidden', 'true');
  };

  partnerContactBtn.addEventListener('click', openModal);
  partnerContactModal.querySelectorAll('[data-close-modal]').forEach(el => {
    el.addEventListener('click', closeModal);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });
}