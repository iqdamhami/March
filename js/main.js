/* ========================================
   MARCH EOI Cycle II - Main JavaScript
======================================== */

document.addEventListener('DOMContentLoaded', () => {
  // Mobile Menu Toggle + Overlay
  const menuToggle = document.querySelector('.menu-toggle');
  const nav = document.querySelector('.nav');

  let overlay = document.querySelector('.nav-overlay');
  if (!overlay && nav) {
    overlay = document.createElement('div');
    overlay.className = 'nav-overlay';
    document.body.appendChild(overlay);
  }

  function closeMenu() {
    if (!nav || !menuToggle) return;
    nav.classList.remove('open');
    menuToggle.classList.remove('active');
    document.body.classList.remove('nav-open');
    if (overlay) overlay.classList.remove('show');
    menuToggle.querySelectorAll('span').forEach((s) => {
      s.style.transform = '';
      s.style.opacity = '';
    });
  }

  function openMenu() {
    if (!nav || !menuToggle) return;
    nav.classList.add('open');
    menuToggle.classList.add('active');
    document.body.classList.add('nav-open');
    if (overlay) overlay.classList.add('show');
    const spans = menuToggle.querySelectorAll('span');
    if (spans.length >= 3) {
      spans[0].style.transform = 'rotate(45deg) translate(5px, 5px)';
      spans[1].style.opacity = '0';
      spans[2].style.transform = 'rotate(-45deg) translate(5px, -5px)';
    }
  }

  if (menuToggle && nav) {
    menuToggle.addEventListener('click', () => {
      if (nav.classList.contains('open')) closeMenu();
      else openMenu();
    });
    if (overlay) overlay.addEventListener('click', closeMenu);
    nav.querySelectorAll('.nav-link').forEach((link) => {
      link.addEventListener('click', closeMenu);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeMenu();
    });
  }

  // Countdown Timer - Deadline: Thursday 31 December 2026 23:59:59 (local)
  const countdownEl = document.getElementById('countdown');
  if (countdownEl) {
    // December 31, 2026 23:59:59
    const deadline = new Date('2026-12-31T23:59:59').getTime();
    
    function updateCountdown() {
      const now = new Date().getTime();
      const distance = deadline - now;
      
      if (distance < 0) {
        countdownEl.innerHTML = '<div class="countdown-item" style="min-width:auto;padding:1rem 1.5rem"><span class="countdown-number" style="font-size:1.2rem">انتهى الموعد</span></div>';
        return;
      }
      
      const days = Math.floor(distance / (1000 * 60 * 60 * 24));
      const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((distance % (1000 * 60)) / 1000);
      
      document.getElementById('days').textContent = String(days).padStart(2, '0');
      document.getElementById('hours').textContent = String(hours).padStart(2, '0');
      document.getElementById('minutes').textContent = String(minutes).padStart(2, '0');
      document.getElementById('seconds').textContent = String(seconds).padStart(2, '0');
    }
    
    updateCountdown();
    setInterval(updateCountdown, 1000);
  }

  // FAQ Accordion
  document.querySelectorAll('.faq-question').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = btn.parentElement;
      const answer = item.querySelector('.faq-answer');
      const isActive = item.classList.contains('active');
      
      // Close all
      document.querySelectorAll('.faq-item').forEach(i => {
        i.classList.remove('active');
        i.querySelector('.faq-answer').style.maxHeight = null;
      });
      
      // Open clicked if it was closed
      if (!isActive) {
        item.classList.add('active');
        answer.style.maxHeight = answer.scrollHeight + 'px';
      }
    });
  });

  // Smooth scroll for anchor links
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
      const target = document.querySelector(this.getAttribute('href'));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  // Simple form validation feedback (contact / apply)
  const forms = document.querySelectorAll('form[data-validate]');
  forms.forEach(form => {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      let valid = true;
      
      form.querySelectorAll('[required]').forEach(field => {
        if (!field.value.trim()) {
          valid = false;
          field.style.borderColor = '#EF4444';
        } else {
          field.style.borderColor = '';
        }
      });
      
      if (valid) {
        // Show success message
        const successMsg = form.querySelector('.form-success') || document.createElement('div');
        successMsg.className = 'alert alert-info form-success';
        successMsg.innerHTML = '<strong>✓ تم الإرسال بنجاح!</strong> شكراً لتواصلك معنا. سنرد عليك قريباً.';
        form.prepend(successMsg);
        form.reset();
        
        setTimeout(() => successMsg.remove(), 5000);
      }
    });
  });

  // ----- شريط المستخدم (بدون تكرار) -----
  (function updateAuthHeader() {
    const actions = document.querySelector('.header-actions');
    if (!actions) return;

    let user = null;
    try {
      user = JSON.parse(localStorage.getItem('march_user') || 'null');
    } catch (_) {
      user = null;
    }
    const token = localStorage.getItem('march_token');
    const loggedIn = !!(token && user);

    const inPages = /\/pages\//.test(location.pathname) || /pages[\\/][^/]+\.html$/i.test(location.href);
    const base = inPages ? '' : 'pages/';

    // تنظيف روابط الحساب المكررة من القائمة الجانبية
    const nav = document.querySelector('.nav');
    const isAdminPage =
      document.body.classList.contains('admin-page') ||
      /admin\.html/i.test(location.pathname) ||
      /admin\.html/i.test(location.href);
    if (nav) {
      nav.querySelectorAll('a.nav-link').forEach((a) => {
        const href = (a.getAttribute('href') || '');
        const text = (a.textContent || '').trim();
        // صفحة الإدارة: إزالة كل روابط التصفح العامة
        if (isAdminPage) {
          a.remove();
          return;
        }
        if (
          a.hasAttribute('data-auth-nav') ||
          /dashboard\.html/i.test(href) ||
          /admin\.html/i.test(href) ||
          text === 'تسجيل الخروج' ||
          text === 'خروج' ||
          text === 'لوحة التحكم' ||
          text === 'لوحتي' ||
          text === 'الإدارة'
        ) {
          a.remove();
        }
      });
    }

    const toggle = actions.querySelector('.menu-toggle');
    Array.from(actions.children).forEach((el) => {
      if (el !== toggle) el.remove();
    });

    const frag = document.createDocumentFragment();

    if (loggedIn) {
      const name = document.createElement('span');
      name.className = 'user-chip';
      name.style.cssText =
        'font-size:0.85rem;font-weight:600;color:var(--primary-dark,#0A4D68);max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
      name.title = user.email || '';
      name.textContent = user.full_name || user.email || 'حسابي';
      frag.appendChild(name);

      // زر لوحتي: في كل الصفحات ما عدا صفحة الإدارة
      if (!isAdminPage) {
        const dash = document.createElement('a');
        dash.href = base + 'dashboard.html';
        dash.className = 'btn btn-outline btn-sm';
        dash.textContent = 'لوحتي';
        frag.appendChild(dash);
      }

      if (user.role === 'admin') {
        const adm = document.createElement('a');
        adm.href = base + 'admin.html';
        adm.className = 'btn btn-outline btn-sm';
        adm.textContent = 'الإدارة';
        frag.appendChild(adm);
      }

      const out = document.createElement('button');
      out.type = 'button';
      out.className = 'btn btn-primary btn-sm';
      out.textContent = 'خروج';
      out.addEventListener('click', () => {
        localStorage.removeItem('march_token');
        localStorage.removeItem('march_user');
        if (typeof AuthAPI !== 'undefined' && AuthAPI.clearSession) AuthAPI.clearSession();
        window.location.href = base + 'login.html';
      });
      frag.appendChild(out);
    } else {
      const login = document.createElement('a');
      login.href = base + 'login.html';
      login.className = 'btn btn-outline btn-sm';
      login.textContent = 'دخول';
      frag.appendChild(login);

      const apply = document.createElement('a');
      apply.href = base + 'apply.html';
      apply.className = 'btn btn-primary btn-sm';
      apply.textContent = 'قدّم الآن';
      frag.appendChild(apply);
    }

    if (toggle) actions.insertBefore(frag, toggle);
    else actions.appendChild(frag);
  })();
});
