function html(res, status, content) {
  res.status(status);
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.send(content);
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    html(res, 405, "<h1>Method Not Allowed</h1>");
    return;
  }

  html(
    res,
    200,
    `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Sessions Loyalty Card Studio</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;700&family=Fraunces:opsz,wght@9..144,600&display=swap');
    :root {
      --ink: #0f172a;
      --muted: #475569;
      --panel: #ffffff;
      --line: #d8e3ef;
      --brand: #0f766e;
      --accent: #ea580c;
      --bg-a: #e0f2fe;
      --bg-b: #fff7ed;
      --ok: #166534;
      --bad: #b91c1c;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: 'Space Grotesk', ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;
      color: var(--ink);
      background:
        radial-gradient(circle at 8% 12%, var(--bg-a), transparent 38%),
        radial-gradient(circle at 92% 88%, var(--bg-b), transparent 44%),
        #f8fafc;
      min-height: 100vh;
    }
    .shell {
      width: min(1120px, calc(100% - 32px));
      margin: 24px auto 48px;
      display: grid;
      gap: 16px;
    }
    .hero {
      background: linear-gradient(140deg, #082f49 0%, #0f766e 45%, #ea580c 100%);
      color: #fff;
      border-radius: 18px;
      padding: 22px;
      box-shadow: 0 15px 40px rgba(2, 6, 23, .2);
    }
    .hero h1 {
      margin: 0 0 8px;
      font-family: 'Fraunces', Georgia, serif;
      font-size: clamp(28px, 4vw, 44px);
      line-height: 1.05;
      letter-spacing: .2px;
    }
    .hero p { margin: 0; max-width: 860px; opacity: .95; }

    .grid {
      display: grid;
      gap: 16px;
      grid-template-columns: 1.2fr .8fr;
    }
    .card {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 16px;
      padding: 16px;
      box-shadow: 0 8px 26px rgba(15, 23, 42, .05);
    }
    h2 { margin: 0 0 10px; font-size: 20px; }
    .hint { margin: 0 0 14px; color: var(--muted); font-size: 14px; }
    .form-grid { display: grid; gap: 10px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .form-grid .full { grid-column: 1 / -1; }
    label { font-size: 13px; color: var(--muted); display: block; margin-bottom: 5px; }
    input, textarea {
      width: 100%;
      border: 1px solid #cbd5e1;
      border-radius: 10px;
      font: inherit;
      padding: 10px 12px;
      background: #fff;
      color: var(--ink);
    }
    textarea { min-height: 78px; resize: vertical; }
    .actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 12px; }
    button, .btn {
      border: 0;
      border-radius: 10px;
      padding: 10px 14px;
      font: inherit;
      font-weight: 700;
      cursor: pointer;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    .btn-primary { background: var(--brand); color: #fff; }
    .btn-secondary { background: #e2e8f0; color: #0f172a; }
    .btn-danger { background: #fef2f2; color: #991b1b; }

    .result { display: none; margin-top: 14px; border-top: 1px dashed #cbd5e1; padding-top: 14px; }
    .result.visible { display: block; }
    .kpis { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin-bottom: 12px; }
    .kpi { border: 1px solid #e2e8f0; border-radius: 10px; padding: 9px; background: #f8fafc; }
    .kpi .k { color: var(--muted); font-size: 12px; }
    .kpi .v { font-size: 18px; font-weight: 700; }

    .wallet-links { display: grid; gap: 8px; margin: 10px 0; }
    .wallet-links a { color: #0369a1; word-break: break-all; }
    .qr-box { margin-top: 10px; display: inline-flex; border: 1px solid #e2e8f0; border-radius: 12px; padding: 10px; background: #fff; }
    .qr-box img { width: 220px; height: 220px; }

    .status { margin-top: 10px; padding: 10px 12px; border-radius: 10px; font-size: 14px; display: none; }
    .status.ok { display: block; background: #ecfdf3; color: var(--ok); border: 1px solid #bbf7d0; }
    .status.bad { display: block; background: #fef2f2; color: var(--bad); border: 1px solid #fecaca; }

    .preview {
      border-radius: 14px;
      border: 1px solid #dbeafe;
      padding: 14px;
      background: linear-gradient(130deg, #0f172a, #334155 60%, #475569);
      color: #fff;
      min-height: 190px;
      position: relative;
      overflow: hidden;
    }
    .preview::after {
      content: "";
      position: absolute;
      width: 220px;
      height: 220px;
      right: -70px;
      top: -60px;
      border-radius: 50%;
      background: rgba(255,255,255,.12);
    }
    .preview .brand { font-weight: 700; font-size: 23px; position: relative; z-index: 1; }
    .preview .text { margin-top: 8px; color: rgba(255,255,255,.92); position: relative; z-index: 1; }
    .preview .pill {
      margin-top: 16px;
      display: inline-block;
      background: rgba(255,255,255,.18);
      border: 1px solid rgba(255,255,255,.4);
      padding: 6px 10px;
      border-radius: 999px;
      font-size: 12px;
      position: relative;
      z-index: 1;
    }

    .footer { color: #64748b; font-size: 12px; text-align: center; }

    @media (max-width: 920px) {
      .grid { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <main class="shell">
    <section class="hero">
      <h1>Sessions Loyalty Card Studio</h1>
      <p>Create a loyalty card from phone number, open Apple/Google Wallet links, show a QR code instantly, and configure venue branding (logo + text + colors) from one page.</p>
    </section>

    <section class="grid">
      <article class="card">
        <h2>Create Loyalty Card</h2>
        <p class="hint">Use this for front-of-house signup. It creates/fetches the customer and returns wallet links + QR.</p>

        <form id="issueForm">
          <div class="form-grid">
            <div>
              <label for="phone">Phone</label>
              <input id="phone" name="phone" value="+447700900000" required />
            </div>
            <div>
              <label for="venue">Venue ID</label>
              <input id="venue" name="venue" value="venue_test" required />
            </div>
            <div>
              <label for="device">Device ID</label>
              <input id="device" name="device" value="kiosk_web" />
            </div>
            <div>
              <label for="email">Email (optional send)</label>
              <input id="email" name="email" placeholder="customer@email.com" />
            </div>
          </div>
          <div class="actions">
            <button class="btn-primary" type="submit">Issue Loyalty Card</button>
            <button class="btn-secondary" type="button" id="copyWalletLink">Copy Wallet Link</button>
            <button class="btn-secondary" type="button" id="sendEmail">Send by Email</button>
          </div>
        </form>

        <div class="status" id="issueStatus"></div>

        <section class="result" id="issueResult">
          <div class="kpis">
            <div class="kpi"><div class="k">Customer</div><div class="v" id="kCustomer">-</div></div>
            <div class="kpi"><div class="k">Points</div><div class="v" id="kPoints">0</div></div>
            <div class="kpi"><div class="k">Rewards</div><div class="v" id="kRewards">0</div></div>
          </div>

          <div class="wallet-links">
            <a id="walletUrl" href="#" target="_blank" rel="noreferrer">Open Loyalty Card</a>
            <a id="appleUrl" href="#" target="_blank" rel="noreferrer">Add to Apple Wallet</a>
            <a id="googleUrl" href="#" target="_blank" rel="noreferrer">Add to Google Wallet</a>
          </div>

          <div class="qr-box">
            <img id="qrImage" alt="Wallet QR Code" src="" />
          </div>
        </section>
      </article>

      <article class="card">
        <h2>Card Branding</h2>
        <p class="hint">Set venue-specific name, text, logo, and colors used by the wallet landing page.</p>

        <form id="brandingForm">
          <div class="form-grid">
            <div class="full">
              <label for="bVenue">Venue ID</label>
              <input id="bVenue" name="bVenue" value="venue_test" required />
            </div>
            <div class="full">
              <label for="adminKey">Admin key (required to save)</label>
              <input id="adminKey" name="adminKey" type="password" placeholder="x-admin-key" />
            </div>
            <div>
              <label for="brandName">Brand name</label>
              <input id="brandName" name="brandName" value="Sessions Rewards" />
            </div>
            <div>
              <label for="logoUrl">Logo URL</label>
              <input id="logoUrl" name="logoUrl" placeholder="https://.../logo.png" />
            </div>
            <div>
              <label for="primaryColor">Primary color</label>
              <input id="primaryColor" name="primaryColor" value="#182230" />
            </div>
            <div>
              <label for="accentColor">Accent color</label>
              <input id="accentColor" name="accentColor" value="#0f766e" />
            </div>
            <div class="full">
              <label for="supportEmail">Support email</label>
              <input id="supportEmail" name="supportEmail" placeholder="support@sessions.market" />
            </div>
            <div class="full">
              <label for="heroText">Card text</label>
              <textarea id="heroText" name="heroText">Scan in kiosk to earn points and redeem rewards.</textarea>
            </div>
          </div>
          <div class="actions">
            <button class="btn-secondary" type="button" id="loadBranding">Load</button>
            <button class="btn-primary" type="submit">Save Branding</button>
          </div>
        </form>

        <div class="status" id="brandingStatus"></div>

        <div class="preview" id="cardPreview">
          <div class="brand" id="pBrand">Sessions Rewards</div>
          <div class="text" id="pText">Scan in kiosk to earn points and redeem rewards.</div>
          <div class="pill" id="pVenue">venue_test</div>
        </div>
      </article>
    </section>

    <p class="footer">Kiosk scan endpoint remains <code>/loyalty/resolve-customer-from-pass-token</code>. Membership/Stripe is optional and independent from loyalty card issuance.</p>
  </main>

  <script>
    const state = {
      issued: null,
    };

    function setStatus(el, ok, message) {
      el.className = 'status ' + (ok ? 'ok' : 'bad');
      el.textContent = message;
    }

    function applyPreview() {
      const brand = document.getElementById('brandName').value || 'Sessions Rewards';
      const text = document.getElementById('heroText').value || 'Scan in kiosk to earn points and redeem rewards.';
      const venue = document.getElementById('bVenue').value || 'venue';
      const primary = document.getElementById('primaryColor').value || '#182230';
      const accent = document.getElementById('accentColor').value || '#0f766e';

      document.getElementById('pBrand').textContent = brand;
      document.getElementById('pText').textContent = text;
      document.getElementById('pVenue').textContent = venue;
      document.getElementById('cardPreview').style.background = 'linear-gradient(130deg, ' + primary + ', ' + accent + ')';
    }

    async function issueCard(e) {
      e.preventDefault();
      const issueStatus = document.getElementById('issueStatus');
      const resultBox = document.getElementById('issueResult');
      resultBox.classList.remove('visible');

      const payload = {
        phone_raw: document.getElementById('phone').value,
        venue_id: document.getElementById('venue').value,
        device_id: document.getElementById('device').value,
      };

      try {
        const response = await fetch('/api/issue-card', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        });

        const data = await response.json();
        if (!response.ok) {
          setStatus(issueStatus, false, data.error || 'Failed to issue loyalty card');
          return;
        }

        state.issued = data;

        document.getElementById('kCustomer').textContent = (data.customer_id || '-').slice(0, 8);
        document.getElementById('kPoints').textContent = String(data.points_balance || 0);
        document.getElementById('kRewards').textContent = String(data.rewards_balance || 0);

        const walletLink = document.getElementById('walletUrl');
        walletLink.href = data.wallet_url;
        walletLink.textContent = data.wallet_url;

        const appleLink = document.getElementById('appleUrl');
        appleLink.href = data.apple_wallet_url;
        appleLink.textContent = data.apple_wallet_url;

        const googleLink = document.getElementById('googleUrl');
        googleLink.href = data.google_wallet_url;
        googleLink.textContent = data.google_wallet_url;

        document.getElementById('qrImage').src = data.qr_image_url;

        setStatus(issueStatus, true, 'Loyalty card created. Share wallet link or QR code.');
        resultBox.classList.add('visible');
      } catch (error) {
        setStatus(issueStatus, false, error.message || 'Network error');
      }
    }

    async function sendEmail() {
      const issueStatus = document.getElementById('issueStatus');
      if (!state.issued) {
        setStatus(issueStatus, false, 'Create a loyalty card first.');
        return;
      }

      const email = document.getElementById('email').value.trim();
      if (!email) {
        setStatus(issueStatus, false, 'Enter an email before sending.');
        return;
      }

      try {
        const response = await fetch('/api/send-wallet-link', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            email,
            venue_id: state.issued.venue_id,
            wallet_url: state.issued.wallet_url,
            apple_wallet_url: state.issued.apple_wallet_url,
            google_wallet_url: state.issued.google_wallet_url,
          }),
        });

        const data = await response.json();
        if (!response.ok) {
          setStatus(issueStatus, false, data.message || data.error || 'Email send failed');
          return;
        }

        setStatus(issueStatus, true, 'Wallet link sent by email.');
      } catch (error) {
        setStatus(issueStatus, false, error.message || 'Email send failed');
      }
    }

    async function loadBranding() {
      const status = document.getElementById('brandingStatus');
      const venueId = document.getElementById('bVenue').value;
      if (!venueId) {
        setStatus(status, false, 'Venue ID is required.');
        return;
      }

      try {
        const response = await fetch('/api/card-branding?venue_id=' + encodeURIComponent(venueId));
        const data = await response.json();
        if (!response.ok) {
          setStatus(status, false, data.error || 'Load failed');
          return;
        }

        const b = data.branding || {};
        document.getElementById('brandName').value = b.brand_name || 'Sessions Rewards';
        document.getElementById('heroText').value = b.hero_text || 'Scan in kiosk to earn points and redeem rewards.';
        document.getElementById('primaryColor').value = b.primary_color || '#182230';
        document.getElementById('accentColor').value = b.accent_color || '#0f766e';
        document.getElementById('logoUrl').value = b.logo_url || '';
        document.getElementById('supportEmail').value = b.support_email || '';
        applyPreview();
        setStatus(status, true, 'Branding loaded.');
      } catch (error) {
        setStatus(status, false, error.message || 'Load failed');
      }
    }

    async function saveBranding(e) {
      e.preventDefault();
      const status = document.getElementById('brandingStatus');

      const payload = {
        venue_id: document.getElementById('bVenue').value,
        admin_key: document.getElementById('adminKey').value,
        brand_name: document.getElementById('brandName').value,
        hero_text: document.getElementById('heroText').value,
        primary_color: document.getElementById('primaryColor').value,
        accent_color: document.getElementById('accentColor').value,
        logo_url: document.getElementById('logoUrl').value,
        support_email: document.getElementById('supportEmail').value,
      };

      try {
        const response = await fetch('/api/card-branding', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        });

        const data = await response.json();
        if (!response.ok) {
          setStatus(status, false, data.error || data.message || 'Save failed');
          return;
        }

        applyPreview();
        setStatus(status, true, 'Branding saved for venue.');
      } catch (error) {
        setStatus(status, false, error.message || 'Save failed');
      }
    }

    document.getElementById('issueForm').addEventListener('submit', issueCard);
    document.getElementById('sendEmail').addEventListener('click', sendEmail);
    document.getElementById('copyWalletLink').addEventListener('click', async () => {
      const issueStatus = document.getElementById('issueStatus');
      if (!state.issued?.wallet_url) {
        setStatus(issueStatus, false, 'Create a loyalty card first.');
        return;
      }
      try {
        await navigator.clipboard.writeText(state.issued.wallet_url);
        setStatus(issueStatus, true, 'Wallet link copied.');
      } catch (error) {
        setStatus(issueStatus, false, error.message || 'Clipboard not available.');
      }
    });

    document.getElementById('loadBranding').addEventListener('click', loadBranding);
    document.getElementById('brandingForm').addEventListener('submit', saveBranding);

    ['brandName', 'heroText', 'primaryColor', 'accentColor', 'bVenue'].forEach((id) => {
      document.getElementById(id).addEventListener('input', applyPreview);
    });

    applyPreview();
    loadBranding();
  </script>
</body>
</html>`,
  );
}
