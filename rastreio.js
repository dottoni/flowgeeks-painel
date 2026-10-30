// Rastreio das páginas de venda da FlowGeeks. Cada página inclui uma linha só:
//   <script src="https://dottoni.github.io/flowgeeks-painel/rastreio.js" defer></script>
// Grava a visita (com o anúncio de origem), a rolagem, o tempo na página, as dúvidas abertas (<details>)
// e o clique em comprar, na função "rastrear" do Supabase. No clique, leva o visitante e a origem
// para o checkout da Hotmart (src e sck), e o webhook liga a venda ao anúncio.
// O visitante é só um ID aleatório: nada de nome, e-mail ou IP.
(() => {
  const RASTREIO = "https://zqolcoakhxabqviquybe.supabase.co/functions/v1/rastrear";

  const guardar = (chave, valor, sessao) => {
    try { (sessao ? sessionStorage : localStorage).setItem(chave, valor); } catch (e) {}
  };
  const ler = (chave, sessao) => {
    try { return (sessao ? sessionStorage : localStorage).getItem(chave); } catch (e) { return null; }
  };
  const novoId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
  const primeiraVisita = !ler("fg_visitante");
  const visitante = ler("fg_visitante") || novoId();
  const sessao = ler("fg_sessao", true) || novoId();
  guardar("fg_visitante", visitante);
  guardar("fg_sessao", sessao, true);

  const params = new URLSearchParams(location.search);
  const CAMPOS_ORIGEM = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
                         "campaign_id", "adset_id", "ad_id", "fbclid"];
  const daUrl = Object.fromEntries(CAMPOS_ORIGEM.filter((c) => params.get(c)).map((c) => [c, params.get(c)]));
  // A última origem paga vale; uma visita direta não apaga a origem anterior.
  if (daUrl.utm_source || daUrl.ad_id || daUrl.fbclid) guardar("fg_origem", JSON.stringify(daUrl));
  let origem = {};
  try { origem = JSON.parse(ler("fg_origem") || "{}"); } catch (e) {}

  const ua = navigator.userAgent;
  const dispositivo = /iPad|Tablet/i.test(ua) ? "tablet" : /Mobi|Android|iPhone/i.test(ua) ? "celular" : "computador";
  const navegador = /Instagram/i.test(ua) ? "instagram" : /FBAN|FBAV/i.test(ua) ? "facebook" :
    /Edg\//.test(ua) ? "edge" : /Chrome\//.test(ua) ? "chrome" : /Safari\//.test(ua) ? "safari" : "outro";

  const enviar = (dados) => {
    const corpo = JSON.stringify({ visitante_id: visitante, sessao_id: sessao, ...dados });
    try {
      if (!navigator.sendBeacon || !navigator.sendBeacon(RASTREIO, new Blob([corpo], { type: "text/plain" }))) {
        fetch(RASTREIO, { method: "POST", body: corpo, keepalive: true, headers: { "content-type": "text/plain" } });
      }
    } catch (e) {}
  };

  enviar({
    tipo: "visita", pagina: location.pathname, url: location.href.slice(0, 500),
    referrer: document.referrer, dispositivo, navegador, largura_tela: innerWidth,
    primeira_visita: primeiraVisita, ...daUrl,
  });

  // ---- rolagem: 25, 50, 75 e 100% da página, uma vez cada ----
  const marcas = [25, 50, 75, 100], enviadas = new Set();
  const rolagem = () => {
    const alto = document.documentElement.scrollHeight - innerHeight;
    const p = alto > 0 ? (scrollY / alto) * 100 : 100;
    for (const m of marcas) if (p >= m - 2 && !enviadas.has(m)) { enviadas.add(m); enviar({ tipo: "rolagem", valor: m }); }
  };
  addEventListener("scroll", rolagem, { passive: true });

  // ---- tempo na página: enviado uma vez, quando a pessoa sai ----
  const entrou = Date.now();
  let tempoEnviado = false;
  const sair = () => {
    if (tempoEnviado) return;
    tempoEnviado = true;
    enviar({ tipo: "tempo_pagina", valor: Math.round((Date.now() - entrou) / 1000) });
  };
  addEventListener("pagehide", sair);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") sair(); });

  // ---- dúvidas: cada <details> aberto ----
  document.addEventListener("toggle", (e) => {
    const d = e.target;
    if (d.tagName === "DETAILS" && d.open) enviar({ tipo: "faq", detalhe: (d.querySelector("summary")?.textContent || "").trim().slice(0, 120) });
  }, true);

  // ---- botões de compra: levam o visitante e a origem para a Hotmart ----
  const limpo = (t) => String(t || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40);
  document.addEventListener("click", (e) => {
    const a = e.target.closest("a[href]");
    if (!a || !/(^|\.)hotmart\.com$/.test(new URL(a.href, location.href).hostname)) return;
    const destino = new URL(a.href);
    destino.searchParams.set("src", visitante);
    destino.searchParams.set("sck", [limpo(origem.utm_source) || "direto", limpo(origem.ad_id)].filter(Boolean).join("-"));
    for (const c of ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"]) {
      if (origem[c]) destino.searchParams.set(c, origem[c]);
    }
    a.href = destino.toString();
    enviar({ tipo: "clique_comprar", valor: Number(a.dataset.preco) || null, detalhe: (a.textContent || "").trim().slice(0, 80) });
  }, true);
})();
