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

  // In-flight request management to prevent race conditions
  let activeRateAbortController = null;
  let latestRateRequestId = 0;

  // App State
  const state = {
    currencies: [],
    currencyMap: new Map(),
    fromCurrency: 'USD',
    toCurrency: 'INR',
    lastEditedField: 'from', // 'from' or 'to'
    currentRate: null, // null when rate is unavailable/failed
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

  // Number sanitization & parsing utilities
  function sanitizeAmountInput(val) {
    if (typeof val !== 'string') val = String(val == null ? '' : val);
    // Replace comma with dot
    let cleaned = val.replace(/,/g, '.').replace(/[^0-9.]/g, '');
    const parts = cleaned.split('.');
    if (parts.length > 2) {
      cleaned = parts[0] + '.' + parts.slice(1).join('');
    }
    return cleaned;
  }

  function parseAmount(val) {
    const cleaned = sanitizeAmountInput(val);
    if (!cleaned || cleaned === '.') return null;
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
  }

  function formatConvertedValue(val) {
    if (val === null || val === undefined || isNaN(val)) return '';
    if (val === 0) return '0';

    // Very small decimal amounts (< 0.0001) - format with up to 8 decimal places without scientific notation
    if (Math.abs(val) < 0.0001) {
      const fixed = val.toFixed(8);
      return fixed.replace(/\.?0+$/, '');
    }
    // Small decimal amounts (< 0.01)
    if (Math.abs(val) < 0.01) {
      const fixed = val.toFixed(6);
      return fixed.replace(/\.?0+$/, '');
    }
    // Moderate to standard amounts (< 1,000,000)
    if (Math.abs(val) < 1000000) {
      return val.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 4,
        useGrouping: false
      });
    }
    // Very large amounts - keep clean non-exponential string with standard 2 decimal places
    return val.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
      useGrouping: false
    });
  }

  function formatRateNumber(rate) {
    if (typeof rate !== 'number' || isNaN(rate)) return '0.00';
    if (rate >= 1000) {
      return rate.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
    }
    if (rate < 0.00001) {
      return rate.toFixed(8).replace(/\.?0+$/, '');
    }
    if (rate < 0.0001) {
      return rate.toFixed(6).replace(/\.?0+$/, '');
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
      if (typeof item === 'object' && item && item.iso_code) {
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

  // Rate Fetching & Calculation with AbortController and request IDs
  async function fetchExchangeRate() {
    // Abort any ongoing in-flight rate request
    if (activeRateAbortController) {
      activeRateAbortController.abort();
    }
    activeRateAbortController = new AbortController();
    const currentRequestId = ++latestRateRequestId;
    const signal = activeRateAbortController.signal;

    const base = state.fromCurrency.toUpperCase();
    const quote = state.toCurrency.toUpperCase();

    // 1. Same currency case
    if (base === quote) {
      state.currentRate = 1.0;
      state.rateDate = new Date().toISOString().split('T')[0];
      state.isRateCached = false;
      state.isLoadingRate = false;
      DOM.rateSpinner.classList.remove('active');
      hideBanner();
      renderRateDisplay({ isSame: true });
      recalculateAmount();
      return;
    }

    state.isLoadingRate = true;
    DOM.rateSpinner.classList.add('active');
    DOM.rateSummaryText.textContent = `Fetching ${base} to ${quote} rate...`;

    const cacheKey = `${CACHE_KEY_RATES_PREFIX}${base}_${quote}`;
    const cachedRateEntry = storage.get(cacheKey);

    try {
      const response = await fetch(`${API_BASE}/v2/rate/${base}/${quote}`, { signal });

      // If a newer request has started, discard this response
      if (currentRequestId !== latestRateRequestId) {
        return;
      }

      if (!response.ok) {
        let errMsg = `API error ${response.status}`;
        try {
          const errData = await response.json();
          if (errData && errData.message) {
            errMsg = errData.message;
          }
        } catch (_) {}
        throw new Error(errMsg);
      }

      const data = await response.json();
      if (currentRequestId !== latestRateRequestId) {
        return;
      }

      if (typeof data.rate === 'number') {
        state.currentRate = data.rate;
        state.rateDate = data.date || new Date().toISOString().split('T')[0];
        state.isRateCached = false;

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
        state.isLoadingRate = false;
        DOM.rateSpinner.classList.remove('active');
        renderRateDisplay({ isSame: false });
        recalculateAmount();
      } else {
        throw new Error('Malformed rate response from Frankfurter API');
      }
    } catch (err) {
      // If aborted because of newer request, silently exit
      if (err.name === 'AbortError' || currentRequestId !== latestRateRequestId) {
        return;
      }

      console.warn(`Could not fetch fresh rate for ${base}/${quote}:`, err.message);

      // Check cache fallback
      if (cachedRateEntry && typeof cachedRateEntry.rate === 'number') {
        state.currentRate = cachedRateEntry.rate;
        state.rateDate = cachedRateEntry.date || 'Historical';
        state.isRateCached = true;
        showBanner('warning', `Network offline or API busy. Displaying cached reference rate from ${state.rateDate}.`);
        state.isLoadingRate = false;
        DOM.rateSpinner.classList.remove('active');
        renderRateDisplay({ isSame: false });
        recalculateAmount();
      } else {
        // Critical requirement 2: Clear previous rate so application cannot calculate with an incorrect currency pair
        state.currentRate = null;
        state.isRateCached = false;
        state.isLoadingRate = false;
        DOM.rateSpinner.classList.remove('active');

        // Clear dependent calculated amount
        if (state.lastEditedField === 'from') {
          DOM.toAmountInput.value = '';
        } else {
          DOM.fromAmountInput.value = '';
        }

        const friendlyMsg = err.message && err.message.toLowerCase().includes('invalid currency')
          ? `Exchange rate not available for pair ${base} / ${quote}. Please select a different currency.`
          : `Unable to load rate for ${base} / ${quote}. ${err.message}. Please check your connection or choose another currency.`;

        showBanner('error', friendlyMsg);
        DOM.rateSummaryText.textContent = `Exchange rate unavailable (${base}/${quote})`;
        DOM.inverseRateText.textContent = 'Inverse rate unavailable';
        DOM.rateSourceBadge.textContent = 'Unavailable';
        DOM.rateSourceBadge.className = 'rate-source-badge badge-cached';
        DOM.rateDateText.textContent = 'No reference rate found for this pair';
      }
    }
  }

  function renderRateDisplay({ isSame }) {
    const base = state.fromCurrency.toUpperCase();
    const quote = state.toCurrency.toUpperCase();
    const rate = state.currentRate;

    if (rate === null) {
      DOM.rateSummaryText.textContent = `Exchange rate unavailable (${base}/${quote})`;
      DOM.inverseRateText.textContent = 'Inverse rate unavailable';
      DOM.rateSourceBadge.textContent = 'Unavailable';
      DOM.rateSourceBadge.className = 'rate-source-badge badge-cached';
      DOM.rateDateText.textContent = 'No reference rate found for this pair';
      return;
    }

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
      // Production requirement 5: "Latest Reference Rate"
      DOM.rateSourceBadge.textContent = 'Latest Reference Rate';
      DOM.rateSourceBadge.className = 'rate-source-badge';
      DOM.rateDateText.textContent = `Official Frankfurter reference date: ${state.rateDate}`;
    }
  }

  // Live Recalculation
  function recalculateAmount() {
    if (state.currentRate === null) {
      // Clear output field if no rate is active
      if (state.lastEditedField === 'from') {
        DOM.toAmountInput.value = '';
      } else {
        DOM.fromAmountInput.value = '';
      }
      return;
    }

    if (state.lastEditedField === 'from') {
      const fromVal = DOM.fromAmountInput.value.trim();
      if (fromVal === '') {
        DOM.toAmountInput.value = '';
        return;
      }
      const num = parseAmount(fromVal);
      if (num === null) {
        DOM.toAmountInput.value = '';
        return;
      }
      const converted = num * state.currentRate;
      DOM.toAmountInput.value = formatConvertedValue(converted);
    } else {
      const toVal = DOM.toAmountInput.value.trim();
      if (toVal === '') {
        DOM.fromAmountInput.value = '';
        return;
      }
      const num = parseAmount(toVal);
      if (num === null) {
        DOM.fromAmountInput.value = '';
        return;
      }
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

  // Production requirement 4: Safe DOM element creation without innerHTML
  function renderModalCurrencyList() {
    const list = filterModalCurrencies(state.modalSearchQuery);
    state.filteredModalCurrencies = list;
    DOM.currencyListContainer.textContent = ''; // clear safely

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

      // Left column
      const leftCol = document.createElement('div');
      leftCol.className = 'currency-item-left';

      const codeSpan = document.createElement('span');
      codeSpan.className = 'currency-item-code';
      codeSpan.textContent = item.code;
      leftCol.appendChild(codeSpan);

      const infoDiv = document.createElement('div');
      infoDiv.className = 'currency-item-info';

      const nameSpan = document.createElement('span');
      nameSpan.className = 'currency-item-name';
      nameSpan.textContent = item.name;
      infoDiv.appendChild(nameSpan);

      const typeSpan = document.createElement('span');
      typeSpan.className = 'currency-item-type';
      typeSpan.textContent = item.type;
      infoDiv.appendChild(typeSpan);

      leftCol.appendChild(infoDiv);
      itemEl.appendChild(leftCol);

      // Right column
      const rightCol = document.createElement('div');
      rightCol.className = 'currency-item-right';

      if (item.symbol) {
        const symbolSpan = document.createElement('span');
        symbolSpan.className = 'currency-item-symbol';
        symbolSpan.textContent = item.symbol;
        rightCol.appendChild(symbolSpan);
      }

      if (isSelected) {
        const checkSpan = document.createElement('span');
        checkSpan.className = 'currency-item-check';
        checkSpan.setAttribute('aria-hidden', 'true');
        checkSpan.textContent = '✓';
        rightCol.appendChild(checkSpan);
      }

      itemEl.appendChild(rightCol);

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
