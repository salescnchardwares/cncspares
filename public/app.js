/**
 * CNC Spares & Hardware - Main Client-side Interactions
 * Mobile drawer, live catalog search/filter, quantity steppers
 */

document.addEventListener('DOMContentLoaded', () => {
  // 1. Mobile Menu Drawer Toggle
  const menuToggle = document.getElementById('menuToggle');
  const mobileDrawer = document.getElementById('mobileDrawer');

  if (menuToggle && mobileDrawer) {
    menuToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = mobileDrawer.classList.toggle('open');
      menuToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      
      // Toggle hamburger icon between 3 bars and X
      const svg = menuToggle.querySelector('svg');
      if (svg) {
        if (isOpen) {
          svg.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>';
        } else {
          svg.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/>';
        }
      }
    });

    // Close when clicking outside drawer
    document.addEventListener('click', (e) => {
      if (mobileDrawer.classList.contains('open') && !mobileDrawer.contains(e.target) && !menuToggle.contains(e.target)) {
        mobileDrawer.classList.remove('open');
        menuToggle.setAttribute('aria-expanded', 'false');
        const svg = menuToggle.querySelector('svg');
        if (svg) {
          svg.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/>';
        }
      }
    });

    // Close on any link click in mobile drawer
    const drawerLinks = mobileDrawer.querySelectorAll('a');
    drawerLinks.forEach((link) => {
      link.addEventListener('click', () => {
        mobileDrawer.classList.remove('open');
        menuToggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

  // 2. Product Catalog Live Search & Category Filtering
  const searchInput = document.getElementById('catalogSearch');
  const categoryPills = document.querySelectorAll('.category-pill');
  const spareCards = document.querySelectorAll('.grid .spare-card');
  const emptyState = document.getElementById('emptyCatalogState');

  if (searchInput || categoryPills.length > 0) {
    let currentCategory = 'all';
    let currentSearchTerm = '';

    function filterSpares() {
      let visibleCount = 0;

      spareCards.forEach((card) => {
        const title = (card.querySelector('h3')?.textContent || '').toLowerCase();
        const details = (card.querySelector('p')?.textContent || '').toLowerCase();
        const category = (card.dataset.category || card.querySelector('.badge')?.textContent || '').toLowerCase().trim();

        const matchesSearch = !currentSearchTerm || title.includes(currentSearchTerm) || details.includes(currentSearchTerm);
        const matchesCategory = currentCategory === 'all' || category === currentCategory || category.includes(currentCategory);

        if (matchesSearch && matchesCategory) {
          card.classList.remove('hidden');
          visibleCount++;
        } else {
          card.classList.add('hidden');
        }
      });

      if (emptyState) {
        if (visibleCount === 0) {
          emptyState.classList.remove('hidden');
        } else {
          emptyState.classList.add('hidden');
        }
      }
    }

    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        currentSearchTerm = e.target.value.toLowerCase().trim();
        filterSpares();
      });
    }

    categoryPills.forEach((pill) => {
      pill.addEventListener('click', () => {
        categoryPills.forEach((p) => p.classList.remove('active'));
        pill.classList.add('active');
        currentCategory = (pill.dataset.category || 'all').toLowerCase().trim();
        filterSpares();
      });
    });
  }

  // 3. Quantity Steppers
  const stepperWrappers = document.querySelectorAll('.quantity-stepper');
  stepperWrappers.forEach((wrapper) => {
    const input = wrapper.querySelector('input[type="number"]');
    const minusBtn = wrapper.querySelector('.stepper-minus');
    const plusBtn = wrapper.querySelector('.stepper-plus');

    if (input && minusBtn && plusBtn) {
      minusBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const current = parseInt(input.value, 10) || 1;
        const min = parseInt(input.min, 10) || 1;
        if (current > min) {
          input.value = current - 1;
        }
      });

      plusBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const current = parseInt(input.value, 10) || 1;
        input.value = current + 1;
      });
    }
  });
});
