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

  // 4. Admin Image Compression & Optimization (prevents 413 Payload Too Large on Vercel)
  function setupImageCompressor(inputElement, statusElement, formElement) {
    if (!inputElement) return;

    const MAX_WIDTH = 1280;
    const MAX_HEIGHT = 1280;
    const JPEG_QUALITY = 0.82;
    const MAX_RAW_BYTES = 4.2 * 1024 * 1024; // 4.2 MB safe ceiling for Vercel 4.5 MB serverless payload

    inputElement.addEventListener('change', async function () {
      const file = this.files && this.files[0];
      if (!file) {
        if (statusElement) statusElement.style.display = 'none';
        return;
      }

      // If file is SVG, it cannot be processed by canvas and is typically small
      if (file.type === 'image/svg+xml') {
        if (file.size > MAX_RAW_BYTES) {
          alert('SVG file exceeds the 4 MB upload limit. Please use an SVG file under 4 MB.');
          this.value = '';
          if (statusElement) statusElement.style.display = 'none';
        }
        return;
      }

      if (!file.type.startsWith('image/')) {
        if (file.size > MAX_RAW_BYTES) {
          alert('The selected file exceeds 4 MB and is not a compressible image format. Please select an image under 4 MB.');
          this.value = '';
          if (statusElement) statusElement.style.display = 'none';
        }
        return;
      }

      if (statusElement) {
        statusElement.style.display = 'block';
        statusElement.innerHTML = `
          <div style="font-size: 0.85rem; color: #2563eb; display: flex; align-items: center; gap: 0.5rem; padding: 0.35rem 0;">
            <span style="width: 14px; height: 14px; border: 2px solid #cbd5e1; border-top-color: #2563eb; border-radius: 50%; display: inline-block; animation: slowSpin 0.8s linear infinite;"></span>
            <span>Optimizing image for fast upload...</span>
          </div>
        `;
      }

      try {
        const originalBytes = file.size;
        const originalText = originalBytes > 1024 * 1024 
          ? (originalBytes / (1024 * 1024)).toFixed(2) + ' MB' 
          : Math.round(originalBytes / 1024) + ' KB';

        const img = new Image();
        const objectUrl = URL.createObjectURL(file);

        await new Promise((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error('Failed to load image'));
          img.src = objectUrl;
        });

        let width = img.naturalWidth || img.width;
        let height = img.naturalHeight || img.height;

        if (width > MAX_WIDTH || height > MAX_HEIGHT) {
          if (width > height) {
            height = Math.round((height * MAX_WIDTH) / width);
            width = MAX_WIDTH;
          } else {
            width = Math.round((width * MAX_HEIGHT) / height);
            height = MAX_HEIGHT;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        URL.revokeObjectURL(objectUrl);

        const blob = await new Promise((resolve) => {
          canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY);
        });

        if (!blob) throw new Error('Blob generation failed');

        const compressedBytes = blob.size;
        const compressedText = compressedBytes > 1024 * 1024 
          ? (compressedBytes / (1024 * 1024)).toFixed(2) + ' MB' 
          : Math.round(compressedBytes / 1024) + ' KB';

        const baseName = file.name.replace(/\.[^/.]+$/, '');
        const newFile = new File([blob], `${baseName}.jpg`, {
          type: 'image/jpeg',
          lastModified: Date.now()
        });

        if (window.DataTransfer) {
          const dt = new DataTransfer();
          dt.items.add(newFile);
          inputElement.files = dt.files;
        }

        const savedPercent = Math.max(0, Math.round((1 - compressedBytes / originalBytes) * 100));

        if (statusElement) {
          statusElement.style.display = 'block';
          statusElement.innerHTML = `
            <div style="font-size: 0.85rem; background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 6px; padding: 0.5rem 0.75rem; color: #065f46; display: flex; align-items: center; gap: 0.5rem;">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>
              <div>
                <strong>Image optimized:</strong> ${originalText} → <strong>${compressedText}</strong> (${savedPercent}% reduction). Safe for instant upload.
              </div>
            </div>
          `;
        }
      } catch (err) {
        console.warn('Image optimization skipped:', err);
        if (file.size > MAX_RAW_BYTES) {
          alert('The selected image is larger than 4 MB and could not be compressed. Please choose a smaller photo.');
          inputElement.value = '';
          if (statusElement) statusElement.style.display = 'none';
        }
      }
    });

    if (formElement && !formElement._hasCompressorSubmitHandler) {
      formElement._hasCompressorSubmitHandler = true;
      formElement.addEventListener('submit', function () {
        const submitBtn = formElement.querySelector('button[type="submit"]');
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.style.opacity = '0.75';
          submitBtn.innerHTML = `
            <span style="display: inline-flex; align-items: center; gap: 0.5rem;">
              <span style="width: 14px; height: 14px; border: 2px solid currentColor; border-top-color: transparent; border-radius: 50%; display: inline-block; animation: slowSpin 0.8s linear infinite;"></span>
              Uploading...
            </span>
          `;
        }
      });
    }
  }

  const spareForm = document.getElementById('spareForm') || document.querySelector('form[action*="/spares"]');
  const spareImageInput = document.getElementById('imageFile');
  const spareStatus = document.getElementById('imageOptimizationStatus');
  if (spareImageInput && spareForm) {
    setupImageCompressor(spareImageInput, spareStatus, spareForm);
  }

  const companyForm = document.getElementById('companyForm') || document.querySelector('form[action*="/settings"]');
  const logoFileInput = document.getElementById('logoFile');
  const logoStatus = document.getElementById('logoOptimizationStatus');
  if (logoFileInput && companyForm) {
    setupImageCompressor(logoFileInput, logoStatus, companyForm);
  }
});
