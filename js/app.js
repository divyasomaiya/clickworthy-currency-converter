/**
 * Clickworthy Currency Converter - Core Logic
 * Brand: Clickworthy by DTC
 * Open Frankfurter Reference Rate API (v2)
 */

(function () {
  'use strict';

  // API Config
  const API_BASE = 'https://api.frankfurter.dev';
  const CACHE_KEY_CURRENCIES = 'clickworthy_currencies_v2';
  const CACHE_KEY_RATES_PREFIX = 'clickworthy_rate_';
  const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours cache validity for daily reference rates

  // App State
  const state = {
    currencies: [],
    currencyMap: new Map(),
    fromCurrency: 'USD',
    toCurrency: 'INR',
    lastEditedField: 'from', // 'from' or 'to'
    currentRate: 1,
    rateDate: '',
    isRateCached: false,
    activeModalTarget: 'from', // 'from' or 'to'
    modalSearchQuery: '',
    selectedModalIndex: -1,
    filteredModalCurrencies: [],
    isLoadingRate: false
  };

  // DOM Elements
  const DOM = {
    fromAmountInput: document.getElementById('fromAmountInput'),
    toAmountInput: document.getElementById('toAmountInput'),
    fromCurrencyBtn: document.getElementById('fromCurrencyBtn'),
    toCurrencyBtn: document.getElementById('toCurrencyBtn'),
    fromCodeLabel: document.getElementById('fromCodeLabel'),
    toCodeLabel: document.getElementById('toCodeLabel'),
    fromNameLabel: document.getElementById('fromNameLabel'),
    toNameLabel: document.getElementById('toNameLabel'),
    fromCurrencyTag: document.getElementById('fromCurrencyTag'),
    toCurrencyTag: document.getElementById('toCurrencyTag'),
    swapButton: document.getElementById('swapButton'),
    rateSummaryText: document.getElementById('rateSummaryText'),
    rateSpinner: document.getElementById('rateSpinner'),
    rateSourceBadge: document.getElementById('rateSourceBadge'),
    inverseRateText: document.getElementById('inverseRateText'),
    rateDateText: document.getElementById('rateDateText'),
    statusBanner: document.getElementById('statusBanner'),
    statusIcon: document.getElementById('statusIcon'),
    statusMessage: document.getElementById('statusMessage'),
    statusDismiss: document.getElementById('statusDismiss'),
    presetButtons: document.querySelectorAll('.preset-btn'),
    currencyModal: document.getElementById('currencyModal'),
    modalTitle: document.getElementById('modalTitle'),
    modalCloseBtn: document.getElementById('modalCloseBtn'),
    modalCancelBtn: document.getElementById('modalCancelBtn'),
    currencySearchInput: document.getElementById('currencySearchInput'),
    searchClearBtn: document.getElementById('searchClearBtn'),
    currencyListContainer: document.getElementById('currencyListContainer'),
    currencyCountText: document.getElementById('currencyCountText')
  };

  // Safe localStorage helper
  const storage = {
    get: function (key) {
      try {
        const item = localStorage.getItem(key);
        return item ? JSON.parse(item) : null;
      } catch (e) {
        console.warn('localStorage read error:', e);
        return null;
      }
    },
    set: function (key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch (e) {
        console.warn('localStorage write error:', e);
      }
    }
  };

  // Number formatting utilities
  function sanitizeAmountInput(val) {
    if (typeof val !== 'string') val = String(val || '');
    // Replace comma with decimal dot, remove multiple dots and illegal chars
    let cleaned = val.replace(/,/g, '.').replace(/[^0-9.]/g, '');
    const parts = cleaned.split('.');
    if (parts.length > 2) {
      cleaned = parts[0] + '.' + parts.slice(1).join('');
    }
    return cleaned;
  }

  function parseAmount(val) {
    const cleaned = sanitizeAmountInput(val);
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : num;
  }

  function formatConvertedValue(val) {
    if (val === 0) return '0';
    if (isNaN(val)) return '0.00';

    // For very small numbers, display more precision up to 6 decimals
    if (Math.abs(val) < 0.0001) {
      return val.toFixed(6).replace(/\.?0+$/, '');
    }
    if (Math.abs(val) < 0.01) {
      return val.toFixed(4).replace(/\.?0+$/, '');
    }
    // Standard currency rounding: 2 or 4 decimal places
    const formatted = val.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
      useGrouping: false
    });
    return formatted;
  }

  function formatRateNumber(rate) {
    if (typeof rate !== 'number' || isNaN(rate)) return '0.00';
    if (rate >= 1000) {
      return rate.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
    }
    if (rate < 0.0001) {
      return rate.toFixed(6);
    }
    if (rate < 1) {
      return rate.toFixed(4);
    }
    return rate.toFixed(4).replace(/0+$/, '').replace(/\.$/, '.00');
  }

  // Show status / alert banner
  function showBanner(type, message) {
    DOM.statusBanner.className = `status-banner status-${type}`;
    if (type === 'error') {
      DOM.statusIcon.textContent = '⚠️';
    } else if (type === 'warning') {
      DOM.statusIcon.textContent = 'ℹ️';
    } else {
      DOM.statusIcon.textContent = '✓';
    }
    DOM.statusMessage.textContent = message;
    DOM.statusBanner.hidden = false;
  }

  function hideBanner() {
    DOM.statusBanner.hidden = true;
  }

  // Currency Data Loading
  async function loadCurrencies() {
    let rawList = null;

    // 1. Try localStorage
    const cached = storage.get(CACHE_KEY_CURRENCIES);
    if (cached && cached.data && Array.isArray(cached.data)) {
      rawList = cached.data;
    }

    // 2. Fetch fresh currencies in background or fallback
    try {
      const response = await fetch(`${API_BASE}/v2/currencies`);
      if (response.ok) {
        const fresh = await response.json();
        if (Array.isArray(fresh) && fresh.length > 0) {
          rawList = fresh;
          storage.set(CACHE_KEY_CURRENCIES, {
            data: fresh,
            timestamp: Date.now()
          });
        }
      }
    } catch (err) {
      console.warn('Network error loading currencies list, using cache/fallback', err);
    }

    // 3. Bundled fallback if still empty
    if (!rawList && window.FALLBACK_CURRENCIES && Array.isArray(window.FALLBACK_CURRENCIES)) {
      rawList = window.FALLBACK_CURRENCIES;
    }

    if (!rawList) {
      rawList = [
        { iso_code: 'USD', name: 'United States Dollar', symbol: '$' },
        { iso_code: 'INR', name: 'Indian Rupee', symbol: '₹' },
        { iso_code: 'EUR', name: 'Euro', symbol: '€' },
        { iso_code: 'GBP', name: 'British Pound', symbol: '£' }
      ];
    }

    // Process & sort
    state.currencies = rawList.map(item => {
      // Frankfurter v2 items: { iso_code: 'USD', name: 'United States Dollar', symbol: '$', type: 'currency' }
      // Frankfurter v1 format fallback: if object is { USD: "United States Dollar" }
      if (typeof item === 'object' && item.iso_code) {
        return {
          code: item.iso_code.toUpperCase(),
          name: item.name || item.iso_code,
          symbol: item.symbol || '',
          type: item.type || 'currency'
        };
      }
      return null;
    }).filter(Boolean);

    // Dedup and sort
    const seen = new Set();
    state.currencies = state.currencies.filter(c => {
      if (seen.has(c.code)) return false;
      seen.add(c.code);
      return true;
    });

    // Sort alphabetically by code
    state.currencies.sort((a, b) => a.code.localeCompare(b.code));

    // Populate lookup map
    state.currencyMap.clear();
    state.currencies.forEach(c => state.currencyMap.set(c.code, c));

    updateCurrencyLabels();
  }

  function getCurrencyDetails(code) {
    code = (code || '').toUpperCase();
    return state.currencyMap.get(code) || {
      code: code,
      name: code,
      symbol: '',
      type: 'currency'
    };
  }

  function updateCurrencyLabels() {
    const fromInfo = getCurrencyDetails(state.fromCurrency);
    const toInfo = getCurrencyDetails(state.toCurrency);

    DOM.fromCodeLabel.textContent = fromInfo.code;
    DOM.fromNameLabel.textContent = fromInfo.name;
    DOM.fromCurrencyTag.textContent = fromInfo.code;
    DOM.fromCurrencyBtn.setAttribute(
      'aria-label',
      `Select source currency. Currently ${fromInfo.code} - ${fromInfo.name}`
    );

    DOM.toCodeLabel.textContent = toInfo.code;
    DOM.toNameLabel.textContent = toInfo.name;
    DOM.toCurrencyTag.textContent = toInfo.code;
    DOM.toCurrencyBtn.setAttribute(
      'aria-label',
      `Select target currency. Currently ${toInfo.code} - ${toInfo.name}`
    );
  }

  // Rate Fetching & Calculation
  async function fetchExchangeRate() {
    const base = state.fromCurrency.toUpperCase();
    const quote = state.toCurrency.toUpperCase();

    // 1. Same currency case
    if (base === quote) {
      state.currentRate = 1.0;
      state.rateDate = new Date().toISOString().split('T')[0];
      state.isRateCached = false;
      state.isLoadingRate = false;
      renderRateDisplay({ isSame: true });
      recalculateAmount();
      return;
    }

    state.isLoadingRate = true;
    DOM.rateSpinner.classList.add('active');
    DOM.rateSummaryText.textContent = `Fetching ${base} to ${quote} rate...`;

    const cacheKey = `${CACHE_KEY_RATES_PREFIX}${base}_${quote}`;
    const cachedRateEntry = storage.get(cacheKey);

    let freshRateObtained = false;

    try {
      const response = await fetch(`${API_BASE}/v2/rate/${base}/${quote}`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `API error ${response.status}: Failed to get rate`);
      }

      const data = await response.json();
      if (typeof data.rate === 'number') {
        state.currentRate = data.rate;
        state.rateDate = data.date || new Date().toISOString().split('T')[0];
        state.isRateCached = false;
        freshRateObtained = true;

        // Save to cache
        storage.set(cacheKey, {
          rate: data.rate,
          date: state.rateDate,
          timestamp: Date.now()
        });

        // Also cache inverse
        const inverseKey = `${CACHE_KEY_RATES_PREFIX}${quote}_${base}`;
        if (data.rate > 0) {
          storage.set(inverseKey, {
            rate: 1 / data.rate,
            date: state.rateDate,
            timestamp: Date.now()
          });
        }

        hideBanner();
      } else {
        throw new Error('Malformed rate response from Frankfurter API');
      }
    } catch (err) {
      console.warn(`Could not fetch fresh rate for ${base}/${quote}:`, err.message);

      // Check cache fallback
      if (cachedRateEntry && typeof cachedRateEntry.rate === 'number') {
        state.currentRate = cachedRateEntry.rate;
        state.rateDate = cachedRateEntry.date || 'Historical';
        state.isRateCached = true;
        showBanner('warning', `Network offline or API busy. Displaying cached reference rate from ${state.rateDate}.`);
      } else {
        // Fallback calculation: if base is EUR or reverse
        showBanner('error', `Unable to load rate for ${base}/${quote}. ${err.message}. Please check connection or choose another currency.`);
        DOM.rateSummaryText.textContent = `Exchange rate unavailable (${base}/${quote})`;
        DOM.inverseRateText.textContent = 'Inverse rate unavailable';
        DOM.rateSourceBadge.textContent = 'Error';
        DOM.rateSourceBadge.className = 'rate-source-badge badge-cached';
        state.isLoadingRate = false;
        DOM.rateSpinner.classList.remove('active');
        return;
      }
    }

    state.isLoadingRate = false;
    DOM.rateSpinner.classList.remove('active');
    renderRateDisplay({ isSame: false });
    recalculateAmount();
  }

  function renderRateDisplay({ isSame }) {
    const base = state.fromCurrency.toUpperCase();
    const quote = state.toCurrency.toUpperCase();
    const rate = state.currentRate;

    if (isSame) {
      DOM.rateSummaryText.textContent = `1 ${base} = 1.0000 ${quote}`;
      DOM.inverseRateText.textContent = `1 ${quote} = 1.0000 ${base}`;
      DOM.rateSourceBadge.textContent = 'Identical Currency';
      DOM.rateSourceBadge.className = 'rate-source-badge badge-same';
      DOM.rateDateText.textContent = 'Conversion factor is 1:1 for identical currencies';
      return;
    }

    DOM.rateSummaryText.textContent = `1 ${base} = ${formatRateNumber(rate)} ${quote}`;

    if (rate > 0) {
      const inverse = 1 / rate;
      DOM.inverseRateText.textContent = `1 ${quote} = ${formatRateNumber(inverse)} ${base}`;
    } else {
      DOM.inverseRateText.textContent = 'Inverse rate unavailable';
    }

    if (state.isRateCached) {
      DOM.rateSourceBadge.textContent = 'Cached Reference Rate';
      DOM.rateSourceBadge.className = 'rate-source-badge badge-cached';
      DOM.rateDateText.textContent = `Cached rate date: ${state.rateDate} (Offline fallback)`;
    } else {
      DOM.rateSourceBadge.textContent = 'Live Reference Rate';
      DOM.rateSourceBadge.className = 'rate-source-badge';
      DOM.rateDateText.textContent = `Official Frankfurter reference date: ${state.rateDate}`;
    }
  }

  // Live Recalculation
  function recalculateAmount() {
    if (state.lastEditedField === 'from') {
      const fromVal = DOM.fromAmountInput.value.trim();
      if (fromVal === '') {
        DOM.toAmountInput.value = '';
        return;
      }
      const num = parseAmount(fromVal);
      const converted = num * state.currentRate;
      DOM.toAmountInput.value = formatConvertedValue(converted);
    } else {
      const toVal = DOM.toAmountInput.value.trim();
      if (toVal === '') {
        DOM.fromAmountInput.value = '';
        return;
      }
      const num = parseAmount(toVal);
      const converted = state.currentRate > 0 ? num / state.currentRate : 0;
      DOM.fromAmountInput.value = formatConvertedValue(converted);
    }
  }

  // Swap Currencies
  function swapCurrencies() {
    const prevFrom = state.fromCurrency;
    state.fromCurrency = state.toCurrency;
    state.toCurrency = prevFrom;

    updateCurrencyLabels();
    fetchExchangeRate();
  }

  // Currency Selection Modal Logic
  function openModal(target) {
    state.activeModalTarget = target;
    const currentCode = target === 'from' ? state.fromCurrency : state.toCurrency;
    DOM.modalTitle.textContent = target === 'from' ? 'Select Send Currency' : 'Select Recipient Currency';
    DOM.currencySearchInput.value = '';
    DOM.searchClearBtn.hidden = true;
    state.modalSearchQuery = '';
    state.selectedModalIndex = -1;

    DOM.currencyModal.hidden = false;
    document.body.style.overflow = 'hidden';

    renderModalCurrencyList();

    // Auto-focus search input
    setTimeout(() => {
      DOM.currencySearchInput.focus();
      // Scroll active item into view
      const activeEl = DOM.currencyListContainer.querySelector('.is-selected');
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'center' });
      }
    }, 50);
  }

  function closeModal() {
    DOM.currencyModal.hidden = true;
    document.body.style.overflow = '';
    // Restore focus to trigger
    if (state.activeModalTarget === 'from') {
      DOM.fromCurrencyBtn.focus();
    } else {
      DOM.toCurrencyBtn.focus();
    }
  }

  function filterModalCurrencies(query) {
    query = (query || '').trim().toLowerCase();
    if (!query) {
      return state.currencies;
    }
    return state.currencies.filter(c => {
      return c.code.toLowerCase().includes(query) ||
             c.name.toLowerCase().includes(query);
    });
  }

  function renderModalCurrencyList() {
    const list = filterModalCurrencies(state.modalSearchQuery);
    state.filteredModalCurrencies = list;
    DOM.currencyListContainer.innerHTML = '';

    const currentSelectedCode = state.activeModalTarget === 'from'
      ? state.fromCurrency
      : state.toCurrency;

    DOM.currencyCountText.textContent = `${list.length} currencies available`;

    if (list.length === 0) {
      const emptyDiv = document.createElement('div');
      emptyDiv.className = 'no-results-state';
      emptyDiv.textContent = `No currencies matching "${state.modalSearchQuery}"`;
      DOM.currencyListContainer.appendChild(emptyDiv);
      return;
    }

    const fragment = document.createDocumentFragment();

    list.forEach((item, index) => {
      const isSelected = item.code === currentSelectedCode;
      const isHighlighted = index === state.selectedModalIndex;

      const itemEl = document.createElement('div');
      itemEl.className = `currency-list-item ${isSelected ? 'is-selected' : ''} ${isHighlighted ? 'is-highlighted' : ''}`;
      itemEl.setAttribute('role', 'option');
      itemEl.setAttribute('aria-selected', isSelected ? 'true' : 'false');
      itemEl.dataset.code = item.code;
      itemEl.dataset.index = index;

      itemEl.innerHTML = `
        <div class="currency-item-left">
          <span class="currency-item-code">${item.code}</span>
          <div class="currency-item-info">
            <span class="currency-item-name">${item.name}</span>
            <span class="currency-item-type">${item.type}</span>
          </div>
        </div>
        <div class="currency-item-right">
          ${item.symbol ? `<span class="currency-item-symbol">${item.symbol}</span>` : ''}
          ${isSelected ? `<span class="currency-item-check" aria-hidden="true">✓</span>` : ''}
        </div>
      `;

      itemEl.addEventListener('click', () => {
        selectCurrency(item.code);
      });

      fragment.appendChild(itemEl);
    });

    DOM.currencyListContainer.appendChild(fragment);
  }

  function selectCurrency(code) {
    if (state.activeModalTarget === 'from') {
      state.fromCurrency = code;
    } else {
      state.toCurrency = code;
    }
    updateCurrencyLabels();
    closeModal();
    fetchExchangeRate();
  }

  // Event Listeners Setup
  function initEventListeners() {
    // Input handling - "from"
    DOM.fromAmountInput.addEventListener('input', (e) => {
      state.lastEditedField = 'from';
      // Basic sanitization on input
      const sanitized = sanitizeAmountInput(e.target.value);
      if (sanitized !== e.target.value) {
        e.target.value = sanitized;
      }
      recalculateAmount();
    });

    // Input handling - "to"
    DOM.toAmountInput.addEventListener('input', (e) => {
      state.lastEditedField = 'to';
      const sanitized = sanitizeAmountInput(e.target.value);
      if (sanitized !== e.target.value) {
        e.target.value = sanitized;
      }
      recalculateAmount();
    });

    // Swap button
    DOM.swapButton.addEventListener('click', () => {
      swapCurrencies();
    });

    // Presets
    DOM.presetButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const val = btn.dataset.preset;
        state.lastEditedField = 'from';
        DOM.fromAmountInput.value = val;
        recalculateAmount();
        DOM.fromAmountInput.focus();
      });
    });

    // Modal open buttons
    DOM.fromCurrencyBtn.addEventListener('click', () => openModal('from'));
    DOM.toCurrencyBtn.addEventListener('click', () => openModal('to'));

    // Modal close actions
    DOM.modalCloseBtn.addEventListener('click', closeModal);
    DOM.modalCancelBtn.addEventListener('click', closeModal);

    // Modal backdrop click
    DOM.currencyModal.addEventListener('click', (e) => {
      if (e.target === DOM.currencyModal) {
        closeModal();
      }
    });

    // Search input typing
    DOM.currencySearchInput.addEventListener('input', (e) => {
      state.modalSearchQuery = e.target.value;
      DOM.searchClearBtn.hidden = !state.modalSearchQuery;
      state.selectedModalIndex = -1;
      renderModalCurrencyList();
    });

    // Search clear button
    DOM.searchClearBtn.addEventListener('click', () => {
      DOM.currencySearchInput.value = '';
      state.modalSearchQuery = '';
      DOM.searchClearBtn.hidden = true;
      state.selectedModalIndex = -1;
      renderModalCurrencyList();
      DOM.currencySearchInput.focus();
    });

    // Modal keyboard navigation (Search Input)
    DOM.currencySearchInput.addEventListener('keydown', (e) => {
      const items = state.filteredModalCurrencies;
      if (items.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        state.selectedModalIndex = Math.min(state.selectedModalIndex + 1, items.length - 1);
        updateModalHighlight();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        state.selectedModalIndex = Math.max(state.selectedModalIndex - 1, 0);
        updateModalHighlight();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const chosen = items[state.selectedModalIndex >= 0 ? state.selectedModalIndex : 0];
        if (chosen) {
          selectCurrency(chosen.code);
        }
      }
    });

    // Global keyboard listener for modal ESC
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !DOM.currencyModal.hidden) {
        closeModal();
      }
    });

    // Banner dismiss
    DOM.statusDismiss.addEventListener('click', hideBanner);
  }

  function updateModalHighlight() {
    const listItems = DOM.currencyListContainer.querySelectorAll('.currency-list-item');
    listItems.forEach((el, idx) => {
      if (idx === state.selectedModalIndex) {
        el.classList.add('is-highlighted');
        el.scrollIntoView({ block: 'nearest' });
      } else {
        el.classList.remove('is-highlighted');
      }
    });
  }

  // App Initialization
  async function init() {
    initEventListeners();
    await loadCurrencies();
    await fetchExchangeRate();
  }

  // Run on DOM load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
