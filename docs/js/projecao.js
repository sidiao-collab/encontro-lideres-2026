/* Tela de projeção (16:9). Somente leitura: não há controles, credenciais de moderador nem justificativas. */
(function () {
  'use strict';
  var h = EL.h, app = document.getElementById('app');
  var CH = 'el26:projecao';
  var estado = null, sonda = null, semConexao = false, chaveTela = '';

  // A credencial chega no fragmento (#sala=...&t=...), que não é enviado a servidores, e sai da barra de endereços.
  var frag = new URLSearchParams(location.hash.replace(/^#/, ''));
  var sessao = EL.guarda.ler(CH);
  if (frag.get('sala') && frag.get('t')) {
    sessao = { sala: frag.get('sala').toUpperCase(), token: frag.get('t') };
    EL.guarda.gravar(CH, sessao);
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* segue */ }
  }

  function nomeInst(v) { return EL.INST[v] ? EL.INST[v].nome : v; }
  function tela(corpo, e) {
    EL.limpar(app);
    var rodape = e ? h('footer', { class: 'tela-rodape' },
      h('span', null, 'Entre pelo celular: ', h('strong', { text: e.sala }), ' · ', EL.enderecoEquipe(e.sala).replace(/^https?:\/\//, '')),
      h('span', { role: 'status', text: semConexao ? 'Sem conexão — reconectando…' : e.totalEquipes + (e.totalEquipes === 1 ? ' equipe na sala' : ' equipes na sala') })) : h('footer', { class: 'tela-rodape' });
    app.appendChild(h('div', { class: 'tela' },
      h('header', { class: 'tela-topo' }, h('div', { class: 'evento' }, 'Encontro de Líderes 2026', h('small', { text: e && e.etapa ? EL.NOMES_ETAPA[e.etapa.id] : 'Projeção' })), EL.marcas()),
      h('main', { class: 'tela-corpo' }, corpo), rodape));
    ajustar();
  }
  /** Se o conteúdo não couber na área útil (texto editado mais longo), reduz a fonte aos poucos. */
  function ajustar() {
    var c = app.querySelector('.tela-corpo'); if (!c) return;
    var escala = 1; c.style.fontSize = '';
    while (c.scrollHeight > c.clientHeight + 1 && escala > 0.6) { escala -= 0.04; c.style.fontSize = escala + 'em'; }
  }
  window.addEventListener('resize', ajustar);
  function aviso(titulo, texto) { tela([h('h1', { text: titulo }), h('p', { text: texto })], null); }

  function entrada(e, grande) {
    var link = EL.enderecoEquipe(e.sala), svg = EL.qr(link);
    return h('div', { class: 'entrada-qr' }, svg, h('p', { class: 'rotulo-etapa', text: 'Código da sala' }), h('p', { class: 'codigo-sala', text: e.sala }), h('p', { class: 'link', text: link.replace(/^https?:\/\//, '') }));
  }

  function slide(e) {
    var s = e.slides[e.slide];
    if (s.tipo === 'capa') return h('div', { class: 'capa' },
      h('div', null, h('p', { class: 'rotulo-etapa', text: 'UNIFASAM e FACULDADE INTEGRA' }), h('h1', { text: s.titulo }), h('p', { text: s.texto }),
        EL.cfg.marcasProvisorias ? h('p', { class: 'provisoria', style: 'font-size:.7em', text: 'Aplicação provisória das marcas, sujeita à aprovação da Comunicação.' }) : null,
        h('p', { class: 'contador', role: 'status', text: e.totalEquipes ? 'Equipes na sala: ' + e.totalEquipes : 'Aponte a câmera para o QR code ou digite o código.' }),
        h('ul', { class: 'chips', 'aria-label': 'Equipes que já entraram' }, e.equipes.map(function (n) { return h('li', { text: n }); }))),
      entrada(e));
    if (s.tipo === 'instituicao') return [h('p', null, EL.etiqueta(s.instituicao)), h('h1', { text: s.titulo }), h('ul', { class: 'pontos-slide' }, s.pontos.map(function (p) { return h('li', { text: p }); })), h('p', { class: 'referencia', style: 'margin-top:1.2em;font-size:.72em', text: 'Fonte: ' + s.referencia })];
    return [h('h1', { text: s.titulo }), h('div', null, s.marcos.map(function (m) {
      return h('div', { class: 'marco' }, h('div', null, EL.etiqueta(m.instituicao), h('br'), h('span', { class: 'selo ' + (m.situacao === 'documentado' ? 'certo' : 'neutro'), style: 'margin-top:.4em', text: m.situacao === 'documentado' ? '✓ Documentado' : 'Previsto — aguarda evidência' })),
        h('div', null, h('p', { text: m.fato }), h('p', { class: 'porque', text: 'Por que importa: ' + m.importancia }), h('p', { class: 'referencia', style: 'font-size:.72em', text: m.referencia })));
    }))];
  }

  function enunciado(r) {
    if (r.tipo === 'associacao') return h('div', { class: 'duas-colunas' }, r.itens.map(function (it, k) { return h('div', { class: 'caixa' }, h('p', { class: 'enunciado' }, h('span', { class: 'num', text: String(k + 1) }), it.enunciado)); }));
    if (r.tipo === 'ordenacao') return h('div', { class: 'duas-colunas' }, r.itens.map(function (it) { return h('div', { class: 'caixa' }, h('p', { class: 'enunciado', text: it.texto })); }));
    if (r.tipo === 'decisao') return [h('p', { style: 'font-size:.9em', text: r.caso }), h('p', { class: 'regra', style: 'font-size:.72em', text: r.criterio }), h('p', { class: 'enunciado', text: r.pergunta }),
      h('div', { class: 'duas-colunas' }, r.opcoes.map(function (o) { return h('div', { class: 'caixa' }, h('p', null, h('strong', { text: o.id.toUpperCase() + ') ' }), o.texto)); }))];
    // Quiz: só os enunciados; as alternativas ficam no celular de cada equipe.
    return [h('div', { class: 'duas-colunas' }, r.questoes.map(function (q, k) { return h('div', { class: 'caixa' }, h('p', { class: 'enunciado' }, h('span', { class: 'num', text: String(k + 1) }), q.enunciado)); })),
      h('p', { class: 'apoio', style: 'font-size:.7em;margin-top:1vh', text: 'As alternativas estão no celular da equipe. Lembrem da Ajuda 50:50 e da Carta Dobro.' })];
  }

  function acertos(g) { return h('p', { class: 'contador', text: g.total ? g.acertos + ' de ' + g.total + (g.total === 1 ? ' equipe acertou' : ' equipes acertaram') : 'Nenhuma resposta recebida' }); }
  function devolutiva(e) {
    var r = e.rodada, dv = e.devolutiva, k = e.item || 0;
    if (r.tipo === 'associacao') { var it = r.itens[k], g = dv.itens[k];
      return [h('p', { class: 'rotulo-etapa', text: 'Devolutiva · item ' + (k + 1) + ' de ' + r.itens.length }), h('h2', { text: it.enunciado }),
        h('p', null, 'Resposta: ', EL.etiqueta(g.gabarito)), h('p', { text: g.comentario }), acertos(g), h('p', { class: 'referencia', style: 'font-size:.72em', text: 'Fonte: ' + g.referencia })]; }
    if (r.tipo === 'ordenacao') return [h('p', { class: 'rotulo-etapa', text: 'Devolutiva · ordem correta' }),
      h('ol', { class: 'linha-tempo' }, dv.itens.map(function (g) { return h('li', null, h('span', { class: 'ano', text: g.ano }), g.instituicao ? EL.etiqueta(g.instituicao) : h('span'), h('span', null, g.texto, h('span', { class: 'referencia', style: 'display:block;font-size:.72em', text: g.detalhe + ' ' + g.referencia }))); })),
      h('p', { style: 'margin-top:1.2vh;font-size:.85em', text: dv.comentario })];
    if (r.tipo === 'decisao') return [h('p', { class: 'rotulo-etapa', text: 'Devolutiva · critério aplicado' }), h('p', { class: 'regra', style: 'font-size:.7em', text: r.criterio }),
      h('div', { class: 'duas-colunas' }, r.opcoes.map(function (o, i) { var g = dv.opcoes[i];
        return h('div', { class: 'caixa' + (g.pontos === 100 ? ' destaque' : '') }, h('p', null, h('strong', { text: o.id.toUpperCase() + ') ' + g.pontos + ' pontos' })), h('p', { text: o.texto }), h('p', null, h('em', { text: g.analise })), h('p', { class: 'referencia', text: g.escolhas + (g.escolhas === 1 ? ' equipe escolheu' : ' equipes escolheram') })); })),
      h('p', { style: 'margin-top:1.2vh;font-size:.8em', text: dv.comentario }), h('p', { class: 'referencia', style: 'font-size:.72em', text: 'Fonte: ' + dv.referencia })];
    var q = r.questoes[k], gq = dv.questoes[k];
    return [h('p', { class: 'rotulo-etapa', text: 'Devolutiva · questão ' + (k + 1) + ' de ' + r.questoes.length }), h('h2', { text: q.enunciado }),
      h('ol', { type: 'A', style: 'font-size:.85em;display:grid;gap:.4em' }, q.opcoes.map(function (o) { return h('li', { style: o.id === gq.correta ? 'font-weight:700' : 'color:var(--tinta-2)' }, o.texto, o.id === gq.correta ? h('span', { class: 'selo certo', style: 'margin-left:.6em', text: '✓ Resposta correta' }) : null); })),
      h('p', { style: 'font-size:.85em', text: gq.comentario }), acertos(gq), h('p', { class: 'referencia', style: 'font-size:.72em', text: 'Fonte: ' + gq.referencia })];
  }

  function seta(v) { return v === null || v === undefined ? h('span', { class: 'apoio', text: '—' }) : v > 0 ? h('span', { class: 'sobe', text: '▲ ' + v }) : v < 0 ? h('span', { class: 'desce', text: '▼ ' + (-v) }) : h('span', { class: 'apoio', text: '= manteve' }); }
  function selos(l, nomes) { return l.selos && l.selos.length ? l.selos.map(function (s) { return h('span', { class: 'selo conquista', style: 'margin-right:.4em', text: '★ ' + nomes[s] }); }) : null; }
  function telaParcial(e) {
    var linhas = e.parcial.slice(0, 10);
    return [h('h1', { class: 'titulo-menor', text: 'Placar parcial' }), h('p', { class: 'apoio', style: 'font-size:.7em', text: 'Depois de: ' + e.rodada.titulo }),
      h('table', { class: 'placar' }, h('caption', { class: 'oculto-visual', text: 'Placar parcial das equipes' }),
        h('thead', null, h('tr', null, h('th', { scope: 'col', text: 'Posição' }), h('th', { scope: 'col', text: 'Equipe' }), h('th', { scope: 'col', class: 'n', text: 'Nesta rodada' }), h('th', { scope: 'col', class: 'n', text: 'Total' }), h('th', { scope: 'col', text: 'Movimento' }))),
        h('tbody', null, linhas.map(function (l) { return h('tr', null, h('td', { class: 'pos', text: EL.posicao(l.posicao) }), h('td', { text: l.nome }), h('td', { class: 'n', text: '+' + l.ganho }), h('td', { class: 'n' }, h('strong', { text: String(l.total) })), h('td', null, seta(l.variacao))); }))),
      e.parcial.length > 10 ? h('p', { class: 'apoio', style: 'font-size:.72em;margin-top:1vh', text: 'Dez primeiras posições; cada equipe vê a sua no celular.' }) : null];
  }
  function telaDesempate(e) {
    var dz = e.desempate;
    if (dz.fase === 'aberta') return [h('p', { class: 'rotulo-etapa', text: 'Desempate no pódio' }), h('h1', { text: dz.pergunta }), h('p', { text: dz.instrucao }),
      h('p', { class: 'contador', role: 'status', text: 'Respondem: ' + dz.equipes.join(', ') + ' · Palpites recebidos: ' + dz.recebidos + ' de ' + dz.equipes.length })];
    return [h('p', { class: 'rotulo-etapa', text: 'Resultado do desempate' }), h('h1', { class: 'titulo-menor', text: dz.pergunta }),
      h('p', null, h('span', { class: 'pontos-grandes', text: String(dz.resposta) })), h('p', { style: 'font-size:.85em', text: dz.comentario }),
      h('ul', { class: 'chips' }, dz.palpites.map(function (x) { return h('li', { text: x.nome + ': ' + (x.palpite === null ? 'sem palpite' : x.palpite) }); })),
      h('p', { class: 'referencia', style: 'font-size:.72em;margin-top:1vh', text: 'Fonte: ' + dz.referencia })];
  }
  function telaPlacar(e) {
    if (e.desempate && (e.desempate.fase === 'aberta' || e.placar.length === 0)) return telaDesempate(e);
    if (!e.placar.length) return [h('p', { class: 'rotulo-etapa', text: 'Placar final' }), h('h1', { text: 'Quem levou o Encontro de Líderes 2026?' }), h('p', { text: 'O placar será revelado do último ao primeiro lugar.' }),
      h('p', { class: 'apoio', text: e.placarTotal + (e.placarTotal === 1 ? ' equipe' : ' equipes') + ' · até 100 pontos por rodada, mais os bônus da Carta Dobro' })];
    var linhas = e.placarCompleto ? e.placar.slice(0, 10) : e.placar.slice(0, 8);
    return [h('h1', { class: e.placarCompleto ? null : 'titulo-menor', text: e.placarCompleto ? 'Placar final' : 'Placar final · revelando' }), h('table', { class: 'placar' }, h('caption', { class: 'oculto-visual', text: 'Classificação final das equipes' }),
      h('thead', null, h('tr', null, h('th', { scope: 'col', text: 'Posição' }), h('th', { scope: 'col', text: 'Equipe' }), e.rodadas.map(function (x, k) { return h('th', { scope: 'col', class: 'n', text: 'R' + (k + 1) }); }), h('th', { scope: 'col', class: 'n', text: 'Total' }), h('th', { scope: 'col', text: 'Selos' }))),
      h('tbody', null, linhas.map(function (l) { return h('tr', null, h('td', { class: 'pos', text: EL.posicao(l.posicao) }), h('td', { text: l.nome }), e.rodadas.map(function (x) { return h('td', { class: 'n', text: String(l.porRodada[x.id] || 0) }); }), h('td', { class: 'n' }, h('strong', { text: String(l.total) })), h('td', null, selos(l, e.nomesSelos))); }))),
      h('p', { class: 'apoio', style: 'font-size:.72em;margin-top:1vh', text: (e.placarCompleto ? (e.placar.length > 10 ? 'Dez primeiras posições; cada equipe vê a sua no celular. ' : '') : 'Faltam ' + (e.placarTotal - e.placar.length) + ' de ' + e.placarTotal + '. ') + 'Equipes com a mesma pontuação dividem a posição.' })];
  }

  function desenhar(forcar) {
    var e = estado; if (!e) return;
    var chave = e.rev + '|' + semConexao;
    if (!forcar && chave === chaveTela) return; chaveTela = chave;
    var id = e.etapa.id, fase = e.etapa.fase, r = e.rodada, corpo;
    if (id === 'abertura') corpo = slide(e);
    else if (r && fase === 'preparo') corpo = [h('p', { class: 'rotulo-etapa', text: EL.NOMES_ETAPA[id] + ' · ' + r.duracaoMin + ' minutos' }), h('h1', { text: r.titulo }), h('p', { style: 'max-width:40em', text: r.instrucao }), h('p', { class: 'regra', text: r.regraPontuacao }), h('p', { class: 'apoio', text: 'Uma resposta por equipe. Discutam, cheguem a um consenso e enviem pelo celular.' })];
    else if (r && (fase === 'aberta' || fase === 'encerrada')) corpo = [h('h1', { class: 'titulo-menor', text: r.titulo }), fase === 'aberta' ? h('p', { class: 'apoio', style: 'font-size:.75em', text: r.instrucao }) : null, enunciado(r),
      h('p', { class: 'contador', role: 'status', text: (fase === 'encerrada' ? 'Envios encerrados · ' : '') + 'Respostas recebidas: ' + e.respostasRecebidas + ' de ' + e.totalEquipes })];
    else if (r && fase === 'revelada') corpo = e.parcial ? telaParcial(e) : [h('h1', { class: 'titulo-menor', style: 'font-size:1.1em;color:var(--tinta-2)', text: r.titulo }), devolutiva(e)];
    else if (id === 'placar') corpo = telaPlacar(e);
    else corpo = [h('p', { class: 'rotulo-etapa', text: 'Para conversar' }), h('h1', { class: 'pergunta-final', text: e.fechamento.pergunta }), h('p', { style: 'margin-top:1em', text: e.fechamento.apoio })];
    tela(corpo, e);
  }

  if (!sessao || !sessao.token) { aviso('Projeção sem sala', 'Abra esta tela pelo botão “Abrir projeção” no painel do moderador.'); return; }
  aviso('Conectando…', 'Buscando a sala ' + sessao.sala + '.');
  sonda = EL.sondar(function () { return EL.api('GET', '/api/salas/' + sessao.sala + '/estado', { token: sessao.token }); },
    function (d) { var voltou = semConexao; semConexao = false; estado = d; desenhar(voltou); },
    function (e) {
      if (e.status === 401 || e.status === 404) { sonda.parar(); EL.guarda.apagar(CH); return aviso('Esta sala não está mais disponível', 'A sala expirou ou o servidor foi reiniciado. Abra a projeção novamente pelo painel do moderador.'); }
      if (!semConexao) { semConexao = true; if (estado) desenhar(true); }
    }, 1500);
})();
