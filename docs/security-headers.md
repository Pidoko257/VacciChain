# Security Headers

This document describes every HTTP security header configured for the VacciChain stack, the purpose of each header, the exact value in use, and instructions for updating headers when new resources are added.

Headers are applied at two layers:

| Layer | Where configured | Applies to |
|---|---|---|
| **nginx** | `frontend/nginx.conf` | All responses served by the frontend container (HTML, JS, CSS, API proxied responses) |
| **Express** | `backend/src/app.js` (via [Helmet](https://helmetjs.github.io/)) | All responses from the backend API when accessed directly (port 4000) |

In the Docker Compose setup, the browser only talks to nginx (port 3000). nginx proxies `/auth/`, `/vaccination/`, and `/verify/` to the backend, so the nginx headers are the ones the browser actually sees. The Express headers provide defence-in-depth for direct API access and non-Docker deployments.

---

## Headers reference

### 1. Content-Security-Policy (CSP)

**Purpose**
CSP is the primary defence against Cross-Site Scripting (XSS) and data-injection attacks. It tells the browser which sources are allowed to load scripts, styles, images, fonts, and other sub-resources. Any resource not matching the policy is blocked before it executes.

**Configured value**

```
Content-Security-Policy:
  default-src 'self';
  script-src  'self';
  style-src   'self' 'unsafe-inline';
  img-src     'self' data:;
  font-src    'self';
  connect-src 'self' https://horizon-testnet.stellar.org https://horizon.stellar.org
               https://soroban-testnet.stellar.org https://mainnet.sorobanrpc.com;
  frame-ancestors 'none';
  base-uri    'self';
  form-action 'self';
```

**Directive-by-directive justification**

| Directive | Value | Reason |
|---|---|---|
| `default-src` | `'self'` | Catch-all fallback. Any sub-resource type not explicitly listed falls back to same-origin only. |
| `script-src` | `'self'` | All JavaScript is bundled by Vite and served from the same origin. No CDN scripts, no inline `<script>` blocks, no `eval`. |
| `style-src` | `'self' 'unsafe-inline'` | Vite injects critical CSS as inline `<style>` tags during development and in some production builds. `'unsafe-inline'` is required for those injected styles. If you migrate to CSS-in-JS or extract all styles to `.css` files, remove `'unsafe-inline'` and add a nonce or hash instead. |
| `img-src` | `'self' data:` | The UI uses `data:` URIs for SVG icons and placeholder images rendered inline by React components. No external image CDN is used. |
| `font-src` | `'self'` | No external font services (Google Fonts, etc.) are used. All fonts are bundled locally. |
| `connect-src` | `'self'` + Stellar endpoints | The Freighter browser extension and the frontend's `useFreighter` hook make direct XHR/fetch calls to Stellar Horizon and Soroban RPC endpoints for transaction simulation and submission. Both testnet and mainnet URLs are listed so the same build works in both environments. |
| `frame-ancestors` | `'none'` | Prevents the app from being embedded in any `<iframe>`, `<frame>`, or `<object>`. Equivalent to `X-Frame-Options: DENY` but more expressive and not limited to top-level frames. |
| `base-uri` | `'self'` | Prevents attackers from injecting a `<base>` tag that would redirect all relative URLs to an attacker-controlled origin. |
| `form-action` | `'self'` | Restricts where HTML forms can submit. The app uses fetch-based API calls rather than form submissions, but this directive closes the vector entirely. |

---

### 2. X-Frame-Options

**Purpose**
Prevents clickjacking by controlling whether the page can be rendered inside a frame on another origin. This header is understood by older browsers that do not support `frame-ancestors` in CSP.

**Configured value**

```
X-Frame-Options: DENY
```

`DENY` refuses framing from any origin, including the same origin. `SAMEORIGIN` would allow same-origin framing, which is unnecessary for VacciChain — no page in the app is designed to be embedded.

---

### 3. X-Content-Type-Options

**Purpose**
Stops browsers from MIME-sniffing a response away from the declared `Content-Type`. Without this header, a browser might execute a JavaScript file served as `text/plain`, enabling content-injection attacks.

**Configured value**

```
X-Content-Type-Options: nosniff
```

`nosniff` is the only valid value. It instructs the browser to honour the server-declared content type and never guess.

---

### 4. Strict-Transport-Security (HSTS)

**Purpose**
Forces all future connections to the site to use HTTPS, even if the user types `http://` or follows an `http://` link. After the first HTTPS visit, the browser will refuse to make plain-HTTP requests for the duration of `max-age`.

**Configured value**

```
Strict-Transport-Security: max-age=31536000; includeSubDomains
```

| Parameter | Value | Reason |
|---|---|---|
| `max-age` | `31536000` (1 year) | Standard recommendation. The browser caches this policy for one year. |
| `includeSubDomains` | present | Ensures subdomains (e.g. `api.vaccichain.example.com`) are also covered. |
| `preload` | absent | Not included until the domain is submitted to the [HSTS preload list](https://hstspreload.org/). Add `preload` only after the domain is registered there. |

> **Note for local development:** HSTS has no effect over plain HTTP (localhost). It only activates when the response is served over HTTPS. Do not set this header in development environments to avoid locking the browser into HTTPS for `localhost`.

---

### 5. Referrer-Policy

**Purpose**
Controls how much referrer information is included in the `Referer` header when navigating away from the app. Leaking full URLs in the `Referer` header can expose patient wallet addresses or session tokens embedded in query strings.

**Configured value**

```
Referrer-Policy: strict-origin-when-cross-origin
```

| Scenario | What is sent |
|---|---|
| Same-origin navigation | Full URL |
| Cross-origin navigation over HTTPS→HTTPS | Origin only (e.g. `https://vaccichain.example.com`) |
| Cross-origin navigation over HTTPS→HTTP | Nothing (referrer stripped entirely) |

This is the browser default in modern browsers, but setting it explicitly ensures consistent behaviour across all browsers and prevents downgrades.

---

### 6. Permissions-Policy

**Purpose**
Disables browser features that the app does not use. Restricting unused APIs reduces the attack surface if an XSS payload does execute — the attacker cannot access the camera, microphone, geolocation, or payment APIs.

**Configured value**

```
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()
```

| Feature | Value | Reason |
|---|---|---|
| `camera` | `()` (blocked) | Not used by the app. |
| `microphone` | `()` (blocked) | Not used by the app. |
| `geolocation` | `()` (blocked) | Not used by the app. |
| `payment` | `()` (blocked) | Payments are handled on-chain via Stellar, not via the Payment Request API. |
| `usb` | `()` (blocked) | No hardware wallet USB access is required; Freighter handles signing. |

---

### 7. X-XSS-Protection

**Purpose**
Enables the legacy XSS auditor built into older versions of Internet Explorer and early Chrome. Modern browsers have removed this auditor in favour of CSP, but the header is included for compatibility with older clients.

**Configured value**

```
X-XSS-Protection: 1; mode=block
```

`mode=block` instructs the browser to block the page entirely rather than attempt to sanitise and render it when an XSS attack is detected. This header has no effect on modern browsers (Chrome 78+, Firefox, Safari) where the auditor was removed.

---

## Where to configure the headers

### nginx (`frontend/nginx.conf`)

Add a `add_header` directive inside the `server` block. All headers listed above should be present:

```nginx
server {
    listen 80;
    root /usr/share/nginx/html;
    index index.html;

    # Security headers
    add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' https://horizon-testnet.stellar.org https://horizon.stellar.org https://soroban-testnet.stellar.org https://mainnet.sorobanrpc.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self';" always;
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=(), usb=()" always;
    add_header X-XSS-Protection "1; mode=block" always;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /auth/ {
        proxy_pass http://backend:4000;
    }

    location /vaccination/ {
        proxy_pass http://backend:4000;
    }

    location /verify/ {
        proxy_pass http://backend:4000;
    }
}
```

The `always` flag ensures headers are sent on error responses (4xx, 5xx) as well as successful ones.

### Express (`backend/src/app.js`)

Install [Helmet](https://helmetjs.github.io/), which sets all of the above headers automatically:

```bash
npm install helmet
```

Then add it as the first middleware in `app.js`:

```js
const helmet = require('helmet');

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:      ["'self'"],
      scriptSrc:       ["'self'"],
      styleSrc:        ["'self'", "'unsafe-inline'"],
      imgSrc:          ["'self'", "data:"],
      fontSrc:         ["'self'"],
      connectSrc:      [
        "'self'",
        "https://horizon-testnet.stellar.org",
        "https://horizon.stellar.org",
        "https://soroban-testnet.stellar.org",
        "https://mainnet.sorobanrpc.com",
      ],
      frameAncestors:  ["'none'"],
      baseUri:         ["'self'"],
      formAction:      ["'self'"],
    },
  },
  frameguard:           { action: 'deny' },
  noSniff:              true,
  hsts:                 { maxAge: 31536000, includeSubDomains: true },
  referrerPolicy:       { policy: 'strict-origin-when-cross-origin' },
  permittedCrossDomainPolicies: false,
}));
```

---

## Updating headers when new resources are added

### Adding an external script (e.g. an analytics snippet)

1. Add the script's origin to `script-src` in both nginx and Express:
   ```
   script-src 'self' https://cdn.example.com;
   ```
2. If the script is loaded inline (e.g. a `<script>` tag in `index.html`), generate a SHA-256 hash of the exact script content and add it instead of `'unsafe-inline'`:
   ```
   script-src 'self' 'sha256-<base64-hash>';
   ```
   Never add `'unsafe-inline'` to `script-src` — it defeats XSS protection entirely.

### Adding an external stylesheet or font (e.g. Google Fonts)

1. Add the font CDN origin to `style-src` and `font-src`:
   ```
   style-src 'self' https://fonts.googleapis.com;
   font-src  'self' https://fonts.gstatic.com;
   ```

### Adding an external image source (e.g. a vaccine logo CDN)

1. Add the image origin to `img-src`:
   ```
   img-src 'self' data: https://images.example.com;
   ```

### Adding a new Stellar network endpoint

The `connect-src` directive must include every Horizon and Soroban RPC URL the frontend fetches directly. When adding a new network (e.g. Futurenet):

1. Add the new endpoint URL to `connect-src` in both nginx and Express:
   ```
   connect-src 'self' ... https://rpc-futurenet.stellar.org;
   ```

### Adding a new API subdomain

If the backend moves to a subdomain (e.g. `api.vaccichain.example.com`), add it to `connect-src`:
```
connect-src 'self' https://api.vaccichain.example.com ...;
```

### Verifying changes

After updating headers, verify them with:

- **Browser DevTools** → Network tab → select any response → Headers panel
- **[securityheaders.com](https://securityheaders.com)** — paste your public URL for a graded report
- **[Mozilla Observatory](https://observatory.mozilla.org)** — comprehensive scan including CSP analysis

---

## Summary table

| Header | Value | Protects against |
|---|---|---|
| `Content-Security-Policy` | See directives above | XSS, data injection, clickjacking (via `frame-ancestors`) |
| `X-Frame-Options` | `DENY` | Clickjacking (legacy browser fallback) |
| `X-Content-Type-Options` | `nosniff` | MIME-type confusion attacks |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` | SSL stripping, protocol downgrade attacks |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Referrer leakage of sensitive URL parameters |
| `Permissions-Policy` | camera, mic, geo, payment, usb all blocked | Abuse of browser APIs by injected scripts |
| `X-XSS-Protection` | `1; mode=block` | Legacy XSS auditor (IE/old Chrome) |
