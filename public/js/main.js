// Mobile nav toggle
const hamburger = document.getElementById('hamburger');
const mobileNav = document.getElementById('mobile-nav');
const iconMenu = document.getElementById('icon-menu');
const iconClose = document.getElementById('icon-close');

hamburger?.addEventListener('click', () => {
  const isOpen = mobileNav.classList.toggle('open');
  hamburger.setAttribute('aria-expanded', isOpen);
  iconMenu.style.display = isOpen ? 'none' : 'block';
  iconClose.style.display = isOpen ? 'block' : 'none';
});

// Close mobile nav on link click
mobileNav?.querySelectorAll('a').forEach(link => {
  link.addEventListener('click', () => {
    mobileNav.classList.remove('open');
    iconMenu.style.display = 'block';
    iconClose.style.display = 'none';
  });
});

// Fade-up on scroll (Intersection Observer)
const fadeEls = document.querySelectorAll('.fade-up');
if (fadeEls.length) {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

  fadeEls.forEach(el => observer.observe(el));
}

// Parallax tilt on hero photo
const heroPhoto = document.querySelector('.hero-photo');
if (heroPhoto) {
  document.addEventListener('mousemove', (e) => {
    const x = (e.clientX / window.innerWidth - 0.5) * 8;
    const y = (e.clientY / window.innerHeight - 0.5) * 8;
    heroPhoto.style.transform = `perspective(600px) rotateY(${x}deg) rotateX(${-y}deg)`;
  });
  document.addEventListener('mouseleave', () => {
    heroPhoto.style.transform = '';
  });
}
