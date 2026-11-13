/* Utilidades compartilhadas pelas telas de equipe, moderador e projeção. */
(function () {
  'use strict';
  var cfg = window.ENCONTRO_CONFIG || {};
  var apiBase = String(cfg.apiBase || '').replace(/\/$/, '');

  /** Cria elementos sem innerHTML (nomes de equipe e justificativas são texto de terceiros). */
  function h(tag, attrs) {
    var el = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    });
    for (var i = 2; i < arguments.length; i++) acrescentar(el, arguments[i]);
    return el;
  }
  function acrescentar(el, filho) {
    if (filho === null || filho === undefined || filho === false) return;
    if (Array.isArray(filho)) return filho.forEach(function (f) { acrescentar(el, f); });
    el.appendChild(typeof filho === 'string' || typeof filho === 'number' ? document.createTextNode(String(filho)) : filho);
  }
  function limpar(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }

  /** Chamada à API. Rejeita com { rede:true } em falha de conexão ou { status, codigo, mensagem }. */
  function api(metodo, caminho, opcoes) {
    opcoes = opcoes || {};
    var controle = new AbortController();
    var limite = setTimeout(function () { controle.abort(); }, opcoes.limiteMs || 8000);
    var cabecalhos = {};
    if (opcoes.corpo) cabecalhos['Content-Type'] = 'application/json';
    if (opcoes.token) cabecalhos.Authorization = 'Bearer ' + opcoes.token;
    return fetch(apiBase + caminho, { method: metodo, headers: cabecalhos, body: opcoes.corpo ? JSON.stringify(opcoes.corpo) : undefined, signal: controle.signal, cache: 'no-store' })
      .then(function (r) {
        return r.text().then(function (t) {
          var j = null; try { j = JSON.parse(t); } catch (e) { /* resposta não-JSON */ }
          if (!r.ok) throw { status: r.status, codigo: (j && j.erro) || 'erro', mensagem: (j && j.mensagem) || 'O servidor respondeu com erro (' + r.status + ').' };
          if (j === null) throw { rede: true, mensagem: 'Resposta inesperada do servidor. Confira o endereço da API em config.js.' };
          return j;
        });
      }, function () { throw { rede: true, mensagem: 'Sem conexão com o servidor.' }; })
      .finally(function () { clearTimeout(limite); });
  }

  /** Armazenamento local com proteção: em alguns contextos o navegador bloqueia o acesso. */
  var memoria = {};
  var guarda = {
    ler: function (k) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return memoria[k] || null; } },
    gravar: function (k, v) { memoria[k] = v; try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* segue em memória */ } },
    apagar: function (k) { delete memoria[k]; try { localStorage.removeItem(k); } catch (e) { /* nada */ } }
  };

  /** Consulta periódica do estado; avisa quando a conexão cai e quando volta. */
  function sondar(buscar, aoReceber, aoFalhar, intervaloMs) {
    var ativo = true, falhas = 0, temporizador = null;
    function ciclo() {
      if (!ativo) return;
      buscar().then(function (d) { falhas = 0; if (ativo) aoReceber(d); }, function (e) { falhas++; if (ativo) aoFalhar(e, falhas); })
        .then(function () { if (ativo) temporizador = setTimeout(ciclo, falhas ? Math.min(6000, intervaloMs * (1 + falhas)) : intervaloMs); });
    }
    ciclo();
    document.addEventListener('visibilitychange', function () { if (ativo && !document.hidden) { clearTimeout(temporizador); ciclo(); } });
    return { parar: function () { ativo = false; clearTimeout(temporizador); }, agora: function () { clearTimeout(temporizador); ciclo(); } };
  }

  var INST = {
    unifasam: { nome: 'UNIFASAM', arquivo: 'assets/marcas/unifasam-pdi.png', alt: 'UNIFASAM — Centro Universitário' },
    integra: { nome: 'FACULDADE INTEGRA', arquivo: 'assets/marcas/integra-pdi.png', alt: 'INTEGRA — Faculdades Integradas da América do Sul' },
    ambas: { nome: 'Ambas' }
  };
  function etiqueta(inst) { return h('span', { class: 'inst ' + inst, text: INST[inst] ? INST[inst].nome : inst }); }

  /** As duas marcas, lado a lado, em cartões iguais. Se a imagem falhar, entra o nome em texto. */
  function marcas() {
    var caixa = h('div', { class: 'marcas' });
    ['unifasam', 'integra'].forEach(function (id) {
      var fig = h('figure', { class: 'marca' });
      var img = h('img', { src: INST[id].arquivo, alt: INST[id].alt });
      img.addEventListener('error', function () { limpar(fig).appendChild(h('span', { class: 'texto-marca', text: INST[id].nome })); });
      fig.appendChild(img); caixa.appendChild(fig);
    });
    return caixa;
  }
  function notaProvisoria() {
    return cfg.marcasProvisorias ? h('p', { class: 'provisoria', text: 'Aplicação provisória das marcas, sujeita à aprovação da Comunicação.' }) : null;
  }

  /** QR code em SVG (biblioteca local em vendor/qrcode.js). Devolve null se indisponível. */
  function qr(texto) {
    try {
      var q = window.qrcode(0, 'M'); q.addData(texto); q.make();
      var n = q.getModuleCount(), borda = 3, t = n + borda * 2, d = '';
      for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) if (q.isDark(r, c)) d += 'M' + (c + borda) + ' ' + (r + borda) + 'h1v1h-1z';
      var ns = 'http://www.w3.org/2000/svg';
      var svg = document.createElementNS(ns, 'svg');
      svg.setAttribute('viewBox', '0 0 ' + t + ' ' + t); svg.setAttribute('role', 'img');
      svg.setAttribute('aria-label', 'QR code para entrar na sala'); svg.setAttribute('shape-rendering', 'crispEdges');
      var fundo = document.createElementNS(ns, 'rect'); fundo.setAttribute('width', t); fundo.setAttribute('height', t); fundo.setAttribute('fill', '#fff');
      var p = document.createElementNS(ns, 'path'); p.setAttribute('d', d); p.setAttribute('fill', '#000');
      svg.appendChild(fundo); svg.appendChild(p);
      return svg;
    } catch (e) { return null; }
  }

  function enderecoEquipe(sala) { return new URL('equipe.html?sala=' + encodeURIComponent(sala), location.href).href; }
  function hora(ms) { try { return new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } }
  function posicao(n) { return n + 'º'; }
  var NOMES_ETAPA = { abertura: 'Painel de abertura', r1: 'Rodada 1', r2: 'Rodada 2', r3: 'Rodada 3', r4: 'Rodada 4', placar: 'Placar final', fechamento: 'Fechamento' };

  window.EL = { h: h, limpar: limpar, api: api, guarda: guarda, sondar: sondar, INST: INST, etiqueta: etiqueta, marcas: marcas, notaProvisoria: notaProvisoria, qr: qr, enderecoEquipe: enderecoEquipe, hora: hora, posicao: posicao, NOMES_ETAPA: NOMES_ETAPA, cfg: cfg };
})();
