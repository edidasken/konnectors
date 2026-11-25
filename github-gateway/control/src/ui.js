/**
 * HTML for the MCP control plane. Never embeds secrets.
 * Self-contained styles (separate Node process — not SERVER /server.css).
 */

/**
 * @param {object} opts
 * @param {boolean} opts.signedIn
 * @param {string} [opts.who]
 * @param {object[]} [opts.servers]
 * @param {string} [opts.flash]
 * @param {string} [opts.error]
 */
export function renderPage(opts) {
  const {signedIn, who, servers = [], flash, error} = opts;
  if (!signedIn) {
    return layout('Sign in', loginBody({flash, error}));
  }
  return layout('MCP control', dashboardBody({who, servers, flash, error}));
}

function layout(title, body) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · MCP control</title>
<style>
:root {
  --bg: #14110f;
  --panel: #1e1916;
  --ink: #f3ece4;
  --muted: #a89a8c;
  --accent: #831d16;
  --ok: #2f6b3a;
  --bad: #8a3030;
  --line: #3a322c;
  --chip: #2a241f;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif;
  background: radial-gradient(1200px 600px at 10% -10%, #2a1814, transparent),
              radial-gradient(900px 500px at 100% 0%, #1a2420, transparent),
              var(--bg);
  color: var(--ink);
  min-height: 100vh;
}
header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid var(--line);
  background: color-mix(in srgb, var(--panel) 88%, transparent);
  backdrop-filter: blur(10px);
  position: sticky;
  top: 0;
}
header h1 {
  margin: 0;
  font-size: 1.15rem;
  letter-spacing: 0.02em;
}
header .who { color: var(--muted); font-size: 0.9rem; }
main { max-width: 920px; margin: 0 auto; padding: 1.25rem; }
.card {
  background: color-mix(in srgb, var(--panel) 92%, transparent);
  border: 1px solid var(--line);
  border-radius: 1.1rem;
  padding: 1.1rem 1.2rem;
  margin-bottom: 1rem;
}
.card h2 { margin: 0 0 0.35rem; font-size: 1.2rem; }
.card .desc { color: var(--muted); margin: 0 0 0.9rem; line-height: 1.45; }
.row { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; }
.chip {
  display: inline-block;
  background: var(--chip);
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 0.2rem 0.65rem;
  font-size: 0.8rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.state-running { color: #9ddea8; }
.state-stopped { color: #e0a0a0; }
.state-unhealthy { color: #e0c48a; }
label { display: block; margin: 0.5rem 0 0.25rem; color: var(--muted); font-size: 0.85rem; }
input[type=password], input[type=text] {
  width: 100%;
  max-width: 28rem;
  padding: 0.55rem 0.7rem;
  border-radius: 0.6rem;
  border: 1px solid var(--line);
  background: #100e0c;
  color: var(--ink);
}
button, .btn {
  appearance: none;
  border: 1px solid var(--line);
  background: var(--accent);
  color: #fff;
  border-radius: 999px;
  padding: 0.4rem 0.95rem;
  font: inherit;
  cursor: pointer;
}
button.secondary { background: transparent; color: var(--ink); }
button:disabled { opacity: 0.5; cursor: not-allowed; }
.flash { background: #243528; border: 1px solid #355640; padding: 0.6rem 0.8rem; border-radius: 0.7rem; margin-bottom: 1rem; }
.error { background: #3a1c1c; border: 1px solid #6a3030; padding: 0.6rem 0.8rem; border-radius: 0.7rem; margin-bottom: 1rem; }
.meta { font-size: 0.85rem; color: var(--muted); margin-top: 0.75rem; }
.meta strong { color: var(--ink); font-weight: 600; }
ul.errors { margin: 0.4rem 0 0; padding-left: 1.1rem; color: var(--muted); font-size: 0.85rem; }
.footer-note { color: var(--muted); font-size: 0.8rem; margin-top: 1.5rem; }
</style>
</head>
<body>
${body}
</body>
</html>`;
}

function loginBody({flash, error}) {
  return `<header><h1>MCP control</h1></header>
<main>
  <div class="card" style="max-width:28rem;margin:2rem auto;">
    <h2>Sign in</h2>
    <p class="desc">Tailscale-only operator page. Unauthenticated requests are rejected.</p>
    ${flash ? `<div class="flash">${esc(flash)}</div>` : ''}
    ${error ? `<div class="error">${esc(error)}</div>` : ''}
    <form method="post" action="/login">
      <label for="password">Password</label>
      <input id="password" name="password" type="password" autocomplete="current-password" required>
      <p style="margin-top:1rem"><button type="submit">Sign in</button></p>
    </form>
  </div>
  <p class="footer-note">Secrets (GitHub PAT, client API keys, session values) are never shown on this page.</p>
</main>`;
}

function dashboardBody({who, servers, flash, error}) {
  const cards = servers.map(serverCard).join('\n');
  return `<header>
  <h1>MCP control</h1>
  <div class="row">
    <span class="who">${esc(who || 'operator')}</span>
    <form method="post" action="/logout" style="margin:0"><button class="secondary" type="submit">Sign out</button></form>
  </div>
</header>
<main>
  ${flash ? `<div class="flash">${esc(flash)}</div>` : ''}
  ${error ? `<div class="error">${esc(error)}</div>` : ''}
  ${cards || '<p class="desc">No managed servers in the registry.</p>'}
  <p class="footer-note">Register another MCP server by adding a [[managed_servers]] block to the registry file. Secrets are never displayed — only configured/not-configured flags.</p>
</main>`;
}

function serverCard(s) {
  const st = s.status || {};
  const stateClass =
    st.state === 'running' ? 'state-running' : st.state === 'unhealthy' ? 'state-unhealthy' : 'state-stopped';
  const tools = (s.tools || []).map((t) => `<span class="chip">${esc(t)}</span>`).join(' ');
  const repos = (s.allowed_repositories || [])
    .map((r) => `<span class="chip">${esc(r)}</span>`)
    .join(' ');
  const last = st.last_call
    ? `${esc(st.last_call.ts || '')} · ${esc(st.last_call.tool || '')} · ${esc(st.last_call.outcome || '')}`
    : 'none yet';
  const errors = (st.recent_errors || [])
    .map(
      (e) =>
        `<li>${esc(e.ts || '')} · ${esc(e.tool || '')} · ${esc(e.error_class || e.outcome || '')}${e.error ? ` — ${esc(e.error)}` : ''}</li>`,
    )
    .join('');
  const on = st.state === 'running' || st.state === 'unhealthy';
  return `<section class="card" data-server="${esc(s.id)}">
  <div class="row" style="justify-content:space-between">
    <h2>${esc(s.display_name)}</h2>
    <span class="${stateClass}">${esc(st.state || 'unknown')}</span>
  </div>
  <p class="desc">${esc(s.description || '')}</p>
  <div class="row" style="margin-bottom:0.6rem">${tools || '<span class="chip">no tools listed</span>'}</div>
  <div class="row" style="margin-bottom:0.8rem">${repos || '<span class="chip">no allowlist listed</span>'}</div>
  <form method="post" action="/toggle" class="row">
    <input type="hidden" name="id" value="${esc(s.id)}">
    <input type="hidden" name="desired" value="${on ? 'off' : 'on'}">
    <button type="submit">${on ? 'Turn off' : 'Turn on'}</button>
  </form>
  <div class="meta">
    <div><strong>Last call:</strong> ${last}</div>
    <div><strong>GitHub token:</strong> ${s.secrets?.github_token_configured ? 'configured' : 'not configured'}</div>
    <div><strong>Client keys:</strong> ${s.secrets?.client_keys_configured ? 'configured' : 'not configured'}</div>
    <div><strong>Unit:</strong> ${esc(s.unit || '')}</div>
    ${errors ? `<div><strong>Recent errors:</strong><ul class="errors">${errors}</ul></div>` : '<div><strong>Recent errors:</strong> none in recent audit</div>'}
  </div>
</section>`;
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
