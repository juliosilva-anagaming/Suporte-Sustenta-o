/* =========================================================
   painel-sla.js (COMPLETO)
   Caminho:
   SustentaHub Ana Gaming/assests/js/painel-sla.js
   ========================================================= */

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.innerText = value;
}

function getBrandClass(brandRaw) {
  const b = (brandRaw || "").toString().trim().toLowerCase();
  if (!b) return "";
  if (b.includes("incidente")) return "brand-incidente";
  if (b.includes("a7kbetbr")) return "brand-a7k";
  if (b.includes("cassinobetbr")) return "brand-cassino";
  if (b.includes("verabetbr")) return "brand-vera";
  return "";
}

/* ---------- “Atualizado há...” ---------- */
let lastSuccessfulUpdateAt = null;
let updatedTickerStarted = false;

function humanizeElapsed(ms) {
  const sec = Math.max(0, Math.floor(ms / 1000));
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

function startUpdatedTicker() {
  if (updatedTickerStarted) return;
  updatedTickerStarted = true;

  setInterval(() => {
    const el = document.getElementById("m-updated-bottom");
    if (!el) return;

    if (!lastSuccessfulUpdateAt) {
      setText("m-updated-bottom", "Atualizado há --");
      return;
    }
    setText("m-updated-bottom", `Atualizado há ${humanizeElapsed(Date.now() - lastSuccessfulUpdateAt)}`);
  }, 1000);
}

/* ---------- Render da tabela ---------- */
function renderTabela(linhas) {
  const tb = document.getElementById("corpo-tabela");
  if (!tb) return;

  if (!Array.isArray(linhas) || linhas.length === 0) {
    tb.innerHTML = `<tr><td colspan="8" class="loading">Nenhum chamado aberto hoje.</td></tr>`;
    return;
  }

  tb.innerHTML = linhas.map((l) => {
    const cdtHtml = l?.cdt?.url
      ? `<a href="${l.cdt.url}" target="_blank" rel="noopener" class="link-cdt">${l.cdt.texto}</a>`
      : (l?.cdt?.texto || "");

    const statusStr = l?.status || "";
    const statusClass = statusStr.includes("FRAUDADOR") ? "txt-critico" : "";

    const verifStr = l?.verificacao || "";
    const verifHtml = verifStr ? `<span class="txt-verif">${verifStr}</span>` : "";

    const brand = l?.casa_2 || "";
    const brandClass = getBrandClass(brand);

    const responsavel = l?.responsavel || "";

    return `
      <tr>
        <td class="${brandClass}" style="font-weight:900;">${brand}</td>
        <td style="font-weight:900;">${l?.id || ""}</td>
        <td>${cdtHtml}</td>
        <td style="font-weight:800;">${l?.jogo || ""}</td>
        <td class="resumo-cell">${l?.resumo || ""}</td>
        <td class="${statusClass}" style="font-weight:900;">${statusStr}</td>
        <td style="font-weight:900;">${responsavel}</td>
        <td style="font-weight:900;">${verifHtml}</td>
      </tr>
    `;
  }).join("");
}

/* ---------- Atualização do Painel (Apps Script JSONP) ---------- */
async function atualizarPainel() {
  try {
    const url = window.APP_CONFIG?.SLA_ENDPOINT;
    if (!url) {
      console.warn("Defina APP_CONFIG.SLA_ENDPOINT em assests/js/config.js");
      return;
    }

    const d = await fetchPainelDadosJsonp(url);

    if (d?.erro) {
      console.error(d.erro);
      renderTabela([]);
      return;
    }

    setText("m-aguard", d?.contadores?.aguardando ?? 0);
    setText("m-atend",  d?.contadores?.atendimento ?? 0);
    setText("m-fraud",  d?.contadores?.fraudadores ?? 0);
    setText("m-poss",   d?.contadores?.possiveis ?? 0);
    setText("m-verif",  d?.contadores?.verificacao ?? 0);

    setText("m-total-cdt", d?.metricas?.total_cdt_geral ?? 0);
    setText("m-total-incidente", d?.metricas?.total_incidente_geral ?? 0);

    setText("m-avg-cdt", d?.metricas?.tempo_medio_cdt_texto || "--");
    setText("m-avg-incidente", d?.metricas?.tempo_medio_incidente_texto || "--");

    const iso = d?.metricas?.atualizadoEm;
    if (iso) {
      const t = new Date(iso).getTime();
      lastSuccessfulUpdateAt = !isNaN(t) ? t : Date.now();
    } else {
      lastSuccessfulUpdateAt = Date.now();
    }
    startUpdatedTicker();

    renderTabela(d?.linhas);

  } catch (err) {
    console.error(err);
  }
}

/* ---------- Tabs ---------- */
function initTabs() {
  const tabPainel = document.getElementById("tab-painel");
  const tabLooker = document.getElementById("tab-looker");

  const viewPainel = document.getElementById("view-painel");
  const viewLooker = document.getElementById("view-looker");

  function showPainel() {
    tabPainel?.classList.add("is-active");
    tabLooker?.classList.remove("is-active");
    viewPainel?.classList.add("is-visible");
    viewLooker?.classList.remove("is-visible");
  }

  function showLooker() {
    tabLooker?.classList.add("is-active");
    tabPainel?.classList.remove("is-active");
    viewLooker?.classList.add("is-visible");
    viewPainel?.classList.remove("is-visible");
  }

  tabPainel?.addEventListener("click", showPainel);
  tabLooker?.addEventListener("click", showLooker);
}

/* ---------- Boot ---------- */
document.addEventListener("DOMContentLoaded", () => {
  initTabs();
  atualizarPainel();

  const refresh = window.APP_CONFIG?.REFRESH_MS ?? 600000;
  setInterval(atualizarPainel, refresh);
});
