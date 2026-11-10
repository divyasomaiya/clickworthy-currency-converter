# Clickworthy Currency Converter

**Brand:** Clickworthy by DTC

A clean, modern, lightweight, and production-ready multi-currency converter web application. Inspired by the simplicity and usability of Google Currency Converter and Wise, while presenting an original, high-contrast visual identity.

---

## 1. Project Overview

**Clickworthy Currency Converter** delivers instant, bi-directional currency conversions across 200+ global currencies, commodities, and digital assets. It runs entirely on client-side web standards (HTML5, CSS3, vanilla JavaScript) with zero build overhead, no frameworks, no database, and no server-side requirements.

The application communicates with the open [Frankfurter API](https://frankfurter.dev/) to fetch official daily reference rates published by central banks, automatically caches rates in the browser for reliable offline resilience, and features an accessible, responsive user interface.

---

## 2. Features

- **Default Conversion Pair:** Automatically loads USD (United States Dollar) to INR (Indian Rupee) on initial visit.
- **Bi-directional Live Calculation:** Two editable amount fields allowing conversions in either direction. Changing the source field recalculates the recipient amount; changing the recipient field back-calculates the source amount.
- **Race-Condition Protection:** Utilizes an `AbortController` and sequential request identifiers so that rapid currency selections or swap operations cleanly cancel older in-flight requests and never get overwritten by stale asynchronous responses.
- **Fail-Safe Rate Handling:** When a conversion rate fetch fails and no cached rate exists, the previous rate is cleared to prevent calculations based on incorrect currency pairs.
- **Searchable Currency Pickers:** Modal currency selectors featuring quick-filtering by ISO currency code or full currency name, equipped with arrow-key keyboard navigation and mouse selection. Currencies are rendered safely using standard DOM element creation (`textContent`).
- **Instant Currency Swap:** One-click swap button to effortlessly invert the source and target currencies and refresh rates.
- **1:1 Identical Currency Conversion:** Selecting the same currency on both sides instantly produces a 1:1 conversion factor without unneeded network requests.
- **Reference Rate & Date Display:** Prominently displays the active exchange rate (e.g., `1 USD = 93.84 INR`), reciprocal inverse rate (`1 INR = 0.0107 USD`), and the publication date of the central bank reference observation with a "Latest Reference Rate" status.
- **Numerical Edge Case Handling:** Robust support for commas and periods as decimal separators, zero values, tiny fractional amounts (< 0.0001 without scientific notation truncation), very large amounts, and quick amount preset buttons (`10`, `100`, `1,000`, `5,000`).
- **Offline & Cache Resilience:** Automatically caches successfully fetched exchange rates and currency lists in browser `localStorage`. When the network is offline or the API encounters downtime, the app serves cached rates with an unambiguous visual badge ("Cached Reference Rate") and notification banner.
- **Contextual Error Handling:** Clear error notifications when currency pairs cannot be converted or are unsupported by central banks, with loading spinner indicators during active queries.
- **Modern, Accessible UI:** Built with semantic HTML5, high-contrast visible focus indicators (`:focus-visible`), ARIA dialog attributes, and full responsiveness across mobile, tablet, and desktop screens.

---

## 3. Tech Stack

- **Markup:** Semantic HTML5 (`index.html`)
- **Styling:** Vanilla CSS3 with CSS Custom Properties, Flexbox, and CSS Grid (`css/style.css`)
- **Scripting:** Vanilla JavaScript ES6+ with asynchronous `fetch` API, `AbortController`, and `localStorage` (`js/app.js`, `js/currencies-fallback.js`)
- **Data Provider:** [Frankfurter API](https://frankfurter.dev/) (v2 Open Exchange Rate REST API)
- **Dependencies:** None. Zero third-party npm packages, build tools, or bundlers required at runtime.

---

## 4. Exchange-Rate API

- **Provider:** [Frankfurter API](https://frankfurter.dev/)
- **Endpoints Used:**
  - `GET https://api.frankfurter.dev/v2/currencies`: Fetches supported currency codes, names, symbols, and asset types.
  - `GET https://api.frankfurter.dev/v2/rate/{base}/{quote}`: Fetches the reference mid-market rate between any currency pair along with the observation date.
- **Update Frequency:** Central banks and official institutions publish reference rates once or a few times each business day (typically around 16:00 CET for ECB feeds). Rates are updated daily on business days.
- **Limitations:** Free and open access without API keys. Requests are rate-limited to avoid abuse. Daily reference rates are not guaranteed live execution prices.
- **Fallback Behavior:**
  - If the initial currencies endpoint is slow or unreachable, the application falls back immediately to a bundled dataset in `js/currencies-fallback.js` (200 currencies).
  - If a rate query fails due to network disconnection or API interruption, the app attempts to load the last successful rate from `localStorage` and alerts the user with a "Cached Reference Rate" badge. If no cache exists, previous rates are safely reset.

---

## 5. Getting Started

### Prerequisites

All you need is any modern web browser (Chrome, Firefox, Safari, Edge) or an optional static file server.

### Local Development

1. **Clone the repository:**
   ```bash
   git clone https://github.com/divyasomaiya/clickworthy-currency-converter.git
   cd clickworthy-currency-converter
   ```

2. **Open directly in browser:**
   Double-click `index.html` or open it with your browser:
   ```bash
   open index.html
   ```

3. **Or run with a lightweight local server (recommended):**
   Using Python 3:
   ```bash
   python3 -m http.server 8080
   ```
   Using Node.js `npx`:
   ```bash
   npx serve .
   ```
   Open [http://localhost:8080](http://localhost:8080) in your web browser.

---

## 6. Project Structure

```
├── index.html               # Main HTML markup, structure, and accessible dialogs
├── css/
│   └── style.css            # Custom responsive stylesheet, themes, animations & layout
├── js/
│   ├── app.js               # Application logic, API integration, DOM binding, AbortController & cache management
│   └── currencies-fallback.js # Bundled fallback currency metadata (200 currencies)
└── README.md                # Project documentation and deployment guides
```

---

## 7. Cloudflare Pages Deployment

Deploying Clickworthy Currency Converter to **Cloudflare Pages** is instantaneous because the project requires zero build steps:

1. Log in to the [Cloudflare Dashboard](https://dash.cloudflare.com/) and navigate to **Workers & Pages**.
2. Click **Create Application** > **Pages** > **Connect to Git**.
3. Select your GitHub repository.
4. Set up the build configuration:
   - **Project Name:** `clickworthy-currency-converter` (or custom)
   - **Production Branch:** `main` (or your chosen branch)
   - **Framework Preset:** `None`
   - **Build Command:** *(leave empty)*
   - **Build Output Directory:** `/` (root directory)
5. Click **Save and Deploy**. Cloudflare Pages will serve your website globally on its high-speed edge CDN within seconds.

---

## 8. GitHub Pages Compatibility

Deploying to **GitHub Pages**:

1. Push your repository to GitHub.
2. In the GitHub repository, click the **Settings** tab.
3. In the left sidebar, click **Pages** (under the "Code and automation" section).
4. Under **Build and deployment**:
   - **Source:** Deploy from a branch
   - **Branch:** Select `main` (or default branch) and folder `/ (root)`
5. Click **Save**.
6. GitHub will publish your site at `https://<username>.github.io/<repository-name>/`.

---

## 9. Testing & Quality Checklist

Before shipping, run through the following manual verification checklist:

- [x] **Default Pair Loading:** Opens with USD in the base field and INR in the quote field.
- [x] **Bi-directional Editing:** Changing USD recalculates INR; changing INR recalculates USD.
- [x] **Currency Swapping:** Clicking the swap button exchanges base and quote currencies and triggers an immediate recalculation.
- [x] **Race Condition Resistance:** Rapid switching of currencies and swap triggers AbortController without stale overrides.
- [x] **Fail-Safe Rate Clearing:** When rate requests fail without cached data, prior rates and dependent values are safely cleared.
- [x] **Search & Selection:** Opening the currency modal, typing a code (e.g. `EUR`) or name (e.g. `Yen`), and selecting updates the currency and rate safely via DOM APIs.
- [x] **Identical Currency (1:1):** Converting USD to USD or EUR to EUR reflects a 1:1 rate without making API requests.
- [x] **Numeric Inputs:** Validated handling of commas (`25,5`), decimals (`25.5`), leading periods (`.5`), zero (`0`), tiny fractions, empty strings, and large numbers (`1,000,000`).
- [x] **Offline / Cache Fallback:** Displays cached rates and a badge when network connectivity is lost.
- [x] **Error Handling:** Shows clear notifications when currency pairs cannot be converted.
- [x] **Responsive Layouts:** Tested across mobile screens (375px), tablets (768px), and desktop viewports (1280px+).
- [x] **Console Errors:** Verified clean console with 0 uncaught exceptions.

---

## 10. Limitations & Disclaimers

- **Latest Reference Rates Only:** All exchange rates displayed are daily official mid-market reference rates compiled from central banks and official institutions.
- **Not Real-time Trading Quotes:** Rates are not real-time live trading, foreign-exchange dealing, or execution prices. Rates should not be used for high-frequency or speculative financial transactions.
- **Market Holidays:** Central banks do not publish rates on weekends or recognized public holidays; on those days, the most recent preceding business day's rate is returned.

---

## 11. Credits

- **Brand & Concept:** Clickworthy by DTC
- **Data Source:** [Frankfurter Exchange Rate API](https://frankfurter.dev/)
