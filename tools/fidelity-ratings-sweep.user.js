// ==UserScript==
// @name         StockRank — Fidelity Ratings/Sentiment Sweep
// @namespace    stockrank
// @version      0.1.0
// @description  Capture the Fidelity opinion-detail request from your own session, replay it across a ticker list, and download a CSV of ESS + StarMine accuracy/sentiment for the StockRank overlay. No credentials are stored; tokens are read live from your session at run time.
// @match        https://digital.fidelity.com/prgw/digital/research/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

/*
 * HOW IT WORKS
 *  1. Installs a fetch/XHR hook BEFORE the page loads, so it can see the
 *     opinion-detail POST the dashboard makes for whatever symbol you view.
 *  2. From that one real request it learns: the URL, the JSON body shape,
 *     and the two CSRF tokens (x-csrf-token, x-xsrf-token). Nothing is
 *     persisted; the template lives in memory for this tab only.
 *  3. You paste your ticker list and click Sweep. It replays the request
 *     per symbol (throttled), parses the response, and downloads a CSV.
 *
 * USAGE
 *  - Open any symbol's Ratings & Sentiment page (e.g. .../ratings-sentiment?symbol=NEM).
 *    The panel turns green once it captures the request template.
 *  - Paste tickers (comma / space / newline separated) and click "Sweep".
 *  - A CSV downloads when done. Re-run anytime; reload to re-capture if a
 *    request 403s (session/token expired).
 */

(function () {
  'use strict';

  // ---- captured request template (memory only) ------------------------------
  let template = null; // { url, body, capturedSymbol, csrf, xsrf }

  function cookie(name) {
    const m = document.cookie.match('(?:^|; )' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '=([^;]*)');
    return m ? decodeURIComponent(m[1]) : null;
  }

  function symbolFromUrl(u) {
    try { return new URL(u, location.href).searchParams.get('symbol'); } catch { return null; }
  }

  function maybeCapture(url, headers, body) {
    if (template || !/\/opinion-detail\b/.test(url || '')) return;
    const h = {};
    // headers may be a Headers instance, a plain object, or array of pairs
    if (headers) {
      if (typeof headers.forEach === 'function' && !Array.isArray(headers)) headers.forEach((v, k) => (h[k.toLowerCase()] = v));
      else if (Array.isArray(headers)) headers.forEach(([k, v]) => (h[k.toLowerCase()] = v));
      else for (const k in headers) h[k.toLowerCase()] = headers[k];
    }
    const csrf = h['x-csrf-token'] || null;
    const xsrf = h['x-xsrf-token'] || cookie('XSRF-TOKEN');
    template = {
      url,
      body: typeof body === 'string' ? body : null,
      capturedSymbol: symbolFromUrl(location.href) || symbolFromBody(body),
      csrf, xsrf,
    };
    paint();
    log('Captured request template (symbol ' + template.capturedSymbol + ').');
  }

  function symbolFromBody(body) {
    try {
      const o = JSON.parse(body);
      let found = null;
      JSON.stringify(o, (k, v) => { if (!found && typeof v === 'string' && /^[A-Z.]{1,6}$/.test(v)) found = v; return v; });
      return found;
    } catch { return null; }
  }

  // ---- hook fetch + XHR (document-start, before app code runs) ---------------
  const origFetch = window.fetch;
  window.fetch = function (input, init) {
    try {
      const url = typeof input === 'string' ? input : (input && input.url);
      const method = ((init && init.method) || (input && input.method) || 'GET').toUpperCase();
      if (method === 'POST') maybeCapture(url, init && init.headers, init && init.body);
    } catch {}
    return origFetch.apply(this, arguments);
  };

  const XO = XMLHttpRequest.prototype.open;
  const XS = XMLHttpRequest.prototype.send;
  const XH = XMLHttpRequest.prototype.setRequestHeader;
  XMLHttpRequest.prototype.open = function (m, u) { this.__m = (m || '').toUpperCase(); this.__u = u; return XO.apply(this, arguments); };
  XMLHttpRequest.prototype.setRequestHeader = function (k, v) { (this.__h = this.__h || {})[k.toLowerCase()] = v; return XH.apply(this, arguments); };
  XMLHttpRequest.prototype.send = function (b) {
    try { if (this.__m === 'POST') maybeCapture(this.__u, this.__h, b); } catch {}
    return XS.apply(this, arguments);
  };

  // ---- parser (validated against NEM = Trading Central/98/Sell) --------------
  function extractOpinion(opinionData, symbol) {
    const d = opinionData && opinionData[symbol];
    if (!d) return null;
    const firms = Array.isArray(d.firmOpinions) ? d.firmOpinions : [];
    const independents = firms
      .filter(f => f.independentFlag && f.starmineSectorScore && f.starmineSectorScore !== 'N/A')
      .map(f => ({ firm: f.firmName, score: Number(f.starmineSectorScore), rating: f.currentNormalizedRating }))
      .filter(f => Number.isFinite(f.score) && f.rating && f.rating !== '--')
      .sort((a, b) => b.score - a.score);
    const top = independents[0] || null;
    const c = d.contributingAnalystOpinionsCounts || {};
    return {
      symbol,
      essScore: d.essScore != null ? d.essScore : '',
      essRating: d.essCurrentRating || '',
      asOfDate: d.asOfDate || '',
      consensusBuy: (c.buy || 0) + (c.outperform || 0),
      consensusNeutral: c.neutral || 0,
      consensusSell: (c.sell || 0) + (c.underperform || 0),
      mostAccurateFirm: top ? top.firm : '',
      mostAccurateScore: top ? top.score : '',
      mostAccurateRating: top ? top.rating : '',
      independentCount: independents.length,
    };
  }

  // swap the captured symbol for the target symbol in the JSON body
  function buildBody(target) {
    const cap = template.capturedSymbol;
    if (!template.body) return template.body;
    try {
      const swap = (v) => {
        if (typeof v === 'string') return v === cap ? target : v;
        if (Array.isArray(v)) return v.map(swap);
        if (v && typeof v === 'object') { const o = {}; for (const k in v) o[k] = swap(v[k]); return o; }
        return v;
      };
      return JSON.stringify(swap(JSON.parse(template.body)));
    } catch {
      return cap ? template.body.split(cap).join(target) : template.body;
    }
  }

  async function fetchOne(symbol) {
    const res = await origFetch(template.url, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'content-type': 'application/json',
        'accept': 'application/json,text/html',
        'x-csrf-token': template.csrf || '',
        'x-xsrf-token': cookie('XSRF-TOKEN') || template.xsrf || '', // refresh from live cookie
      },
      body: buildBody(symbol),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const json = await res.json();
    const od = json.opinionData || {};
    // response key may differ in case; find it
    const key = od[symbol] ? symbol : Object.keys(od).find(k => k.toUpperCase() === symbol.toUpperCase());
    const row = extractOpinion(od, key);
    if (!row) throw new Error('no opinionData for ' + symbol);
    row.symbol = symbol;
    return row;
  }

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  const COLS = ['symbol', 'essScore', 'essRating', 'asOfDate', 'consensusBuy', 'consensusNeutral',
    'consensusSell', 'mostAccurateFirm', 'mostAccurateScore', 'mostAccurateRating', 'independentCount'];

  function toCsv(rows) {
    const esc = (v) => { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    return [COLS.join(',')].concat(rows.map(r => COLS.map(c => esc(r[c])).join(','))).join('\n');
  }

  function download(text) {
    const blob = new Blob([text], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'fidelity-ratings-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  async function sweep(symbols) {
    if (!template) { alert('No request captured yet. Open any symbol\'s Ratings & Sentiment page first.'); return; }
    const rows = [], errs = [];
    for (let i = 0; i < symbols.length; i++) {
      const s = symbols[i];
      log('[' + (i + 1) + '/' + symbols.length + '] ' + s + ' …');
      try { rows.push(await fetchOne(s)); }
      catch (e) { errs.push(s + ': ' + e.message); log('  ✗ ' + s + ' — ' + e.message); }
      await sleep(420); // throttle, be gentle with bot protection
    }
    if (rows.length) download(toCsv(rows));
    log('Done. ' + rows.length + ' ok, ' + errs.length + ' failed.' + (errs.length ? ' Failures:\n' + errs.join('\n') : ''));
    if (errs.length && rows.length === 0) alert('All requests failed — reload the page to refresh your session/tokens, then try again.');
  }

  // ---- minimal UI ------------------------------------------------------------
  let panel, logEl;
  function paint() {
    if (!panel) return;
    panel.style.borderColor = template ? '#2e7d32' : '#b71c1c';
    panel.querySelector('#srk-status').textContent = template
      ? 'Template captured ✓ (' + template.capturedSymbol + ')'
      : 'Waiting — open any symbol\'s Ratings & Sentiment page';
  }
  function log(msg) { if (logEl) logEl.textContent = msg; }

  function mountUI() {
    if (panel || !document.body) return;
    panel = document.createElement('div');
    panel.style.cssText = 'position:fixed;right:14px;bottom:14px;z-index:999999;width:300px;background:#fff;border:2px solid #b71c1c;border-radius:8px;padding:10px;font:12px/1.4 Arial;box-shadow:0 4px 16px rgba(0,0,0,.25)';
    panel.innerHTML =
      '<div style="font-weight:bold;margin-bottom:4px">StockRank ratings sweep</div>' +
      '<div id="srk-status" style="margin-bottom:6px"></div>' +
      '<textarea id="srk-tickers" placeholder="NEM, ADBE, QCOM …" style="width:100%;height:60px;box-sizing:border-box;margin-bottom:6px"></textarea>' +
      '<button id="srk-run" style="width:100%;padding:6px;cursor:pointer">Sweep → CSV</button>' +
      '<div id="srk-log" style="margin-top:6px;white-space:pre-wrap;max-height:120px;overflow:auto;color:#333"></div>';
    document.body.appendChild(panel);
    logEl = panel.querySelector('#srk-log');
    const ta = panel.querySelector('#srk-tickers');
    ta.value = localStorage.getItem('srk-tickers') || '';
    panel.querySelector('#srk-run').onclick = () => {
      const syms = [...new Set((ta.value.toUpperCase().match(/[A-Z.]{1,6}/g) || []))];
      localStorage.setItem('srk-tickers', ta.value);
      if (!syms.length) { alert('Paste some tickers first.'); return; }
      sweep(syms);
    };
    paint();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountUI);
  else mountUI();
})();
