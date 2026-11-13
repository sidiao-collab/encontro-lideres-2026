/*
 * Modo de contingência: funciona sem servidor e sem internet (pode ser aberto direto do arquivo).
 * Projeta o painel e as rodadas; as equipes respondem em papel e o moderador lança os pontos à mão.
 * Não contém gabarito: ele está no roteiro impresso do moderador.
 */
(function () {
  'use strict';
  var h = EL.h, app = document.getElementById('app'), D = window.CONTINGENCIA_DADOS;
  var CH = 'el26:contingencia';
  var salvo = EL.guarda.ler(CH) || { passo: 0, equipes: [] };
  if (!D) { app.appendChild(h('p', { style: 'padding:16px', text: 'Dados de contingência não encontrados. Rode "npm run contingencia" e publique de novo.' })); return; }

  var passos = D.slides.map(function (s, k) { return { tipo: 'slide', slide: s, rotulo: 'Painel ' + (k + 1) + '/' + D.slides.length }; });
  D.rodadas.forEach(function (r, k) {
    if (r.tipo === 'quiz' && r.questoes.length > 3) { // alternativas precisam caber na tela: três questões por vez
      for (var i = 0; i < r.questoes.length; i += 3) passos.push({ tipo: 'rodada', rodada: r, de: i, ate: i + 3, rotulo: 'Rodada ' + (k + 1) + ' · questões ' + (i + 1) + ' a ' + Math.min(i + 3, r.questoes.length) });
    } else passos.push({ tipo: 'rodada', rodada: r, rotulo: 'Rodada ' + (k + 1) });
  });
  if (D.desempate) passos.push({ tipo: 'desempate', rotulo: 'Desempate (só se houver empate no pódio)' });
  passos.push({ tipo: 'placar', rotulo: 'Placar manual' }); passos.push({ tipo: 'fechamento', rotulo: 'Fechamento' });
  if (salvo.passo >= passos.length) salvo.passo = 0;
  function gravar() { EL.guarda.gravar(CH, salvo); }

  function classificar() {
    var linhas = salvo.equipes.map(function (e, i) { return { i: i, nome: e.nome || 'Equipe ' + (i + 1), total: e.pontos.reduce(function (a, b) { return a + (Number(b) || 0); }, 0) }; });
    linhas.sort(function (a, b) { return b.total - a.total || a.nome.localeCompare(b.nome, 'pt-BR'); });
    var pos = 0, ant = null; linhas.forEach(function (l, k) { if (l.total !== ant) { pos = k + 1; ant = l.total; } l.posicao = pos; });
    return linhas;
  }

  function corpoSlide(s) {
    if (s.tipo === 'capa') return [h('p', { class: 'rotulo-etapa', text: 'UNIFASAM e FACULDADE INTEGRA' }), h('h1', { text: s.titulo }), h('p', { text: 'Modo de contingência: as equipes respondem em papel e o moderador registra os pontos.' })];
    if (s.tipo === 'instituicao') return [h('p', null, EL.etiqueta(s.instituicao)), h('h1', { text: s.titulo }), h('ul', { class: 'pontos-slide' }, s.pontos.map(function (p) { return h('li', { text: p }); })), h('p', { class: 'referencia', style: 'margin-top:1.2em;font-size:.6em', text: 'Fonte: ' + s.referencia })];
    return [h('h1', { text: s.titulo }), h('div', null, s.marcos.map(function (m) {
      return h('div', { class: 'marco' }, h('div', null, EL.etiqueta(m.instituicao), h('br'), h('span', { class: 'selo ' + (m.situacao === 'documentado' ? 'certo' : 'neutro'), style: 'margin-top:.4em', text: m.situacao === 'documentado' ? '✓ Documentado' : 'Previsto — aguarda evidência' })),
        h('div', null, h('p', { text: m.fato }), h('p', { class: 'porque', text: 'Por que importa: ' + m.importancia })));
    }))];
  }
  function corpoRodada(r, de, ate) {
    var topo = [h('p', { class: 'rotulo-etapa', text: r.duracaoMin + ' minutos · resposta em papel, uma por equipe' }), h('h1', { class: 'titulo-menor', text: r.titulo }), h('p', { class: 'apoio', style: 'font-size:.72em', text: r.instrucao.replace(/, usando os botões Subir e Descer/, '').replace(/A equipe pode usar a Ajuda 50:50[^.]*\./, 'No papel, cada equipe pode marcar uma questão com a Carta Dobro; não há Ajuda 50:50.') + ' ' + r.regraPontuacao })];
    if (r.tipo === 'associacao') return topo.concat(h('div', { class: 'duas-colunas' }, r.itens.map(function (it, k) { return h('div', { class: 'caixa' }, h('p', { class: 'enunciado' }, h('span', { class: 'num', text: String(k + 1) }), it.enunciado)); })));
    if (r.tipo === 'ordenacao') return topo.concat(h('div', { class: 'duas-colunas' }, r.itens.map(function (it, k) { return h('div', { class: 'caixa' }, h('p', { class: 'enunciado' }, h('span', { class: 'num', text: 'ABCDEFG'.charAt(k) }), it.texto)); })));
    if (r.tipo === 'decisao') return topo.concat([h('p', { style: 'font-size:.9em', text: r.caso }), h('p', { class: 'regra', style: 'font-size:.72em', text: r.criterio }), h('p', { class: 'enunciado', text: r.pergunta }),
      h('div', { class: 'duas-colunas' }, r.opcoes.map(function (o) { return h('div', { class: 'caixa' }, h('p', null, h('strong', { text: o.id.toUpperCase() + ') ' }), o.texto)); }))]);
    var parte = r.questoes.slice(de || 0, ate || r.questoes.length);
    return topo.concat(h('div', { style: 'display:grid;grid-template-columns:repeat(' + parte.length + ',1fr);gap:1.2vw' }, parte.map(function (q, k) { return h('div', { class: 'caixa' }, h('p', { class: 'enunciado' }, h('span', { class: 'num', text: String((de || 0) + k + 1) }), q.enunciado), h('ol', { type: 'A' }, q.opcoes.map(function (o) { return h('li', { text: o.texto }); }))); })));
  }
  function corpoPlacar() {
    var tabela = h('table', { class: 'placar manual' }, h('caption', { class: 'oculto-visual', text: 'Lançamento manual de pontos por equipe e rodada' }),
      h('thead', null, h('tr', null, h('th', { scope: 'col', text: 'Pos.' }), h('th', { scope: 'col', text: 'Equipe' }), D.rodadas.map(function (r, k) { return h('th', { scope: 'col', class: 'n', title: r.titulo, text: 'R' + (k + 1) }); }), h('th', { scope: 'col', class: 'n', text: 'Total' }), h('th', { scope: 'col' }, h('span', { class: 'oculto-visual', text: 'Remover' })))),
      h('tbody', null, classificar().map(function (l) {
        var e = salvo.equipes[l.i];
        return h('tr', null, h('td', { class: 'pos', text: EL.posicao(l.posicao) }),
          h('td', null, h('input', { type: 'text', value: e.nome, maxlength: '24', 'aria-label': 'Nome da equipe ' + (l.i + 1), onchange: function () { e.nome = this.value; gravar(); desenhar(); } })),
          D.rodadas.map(function (r, k) { return h('td', { class: 'n' }, h('input', { type: 'number', min: '0', max: '120', step: '1', inputmode: 'numeric', value: e.pontos[k] === null ? '' : e.pontos[k], 'aria-label': 'Pontos de ' + (e.nome || 'equipe ' + (l.i + 1)) + ' na rodada ' + (k + 1), onchange: function () { var v = Math.max(0, Math.min(120, Number(this.value) || 0)); e.pontos[k] = this.value === '' ? null : v; gravar(); desenhar(); } })); }),
          h('td', { class: 'n' }, h('strong', { text: String(l.total) })),
          h('td', null, h('button', { class: 'botao discreto', type: 'button', 'aria-label': 'Remover ' + (e.nome || 'equipe'), text: 'Remover', onclick: function () { if (!this.getAttribute('data-ok')) { this.setAttribute('data-ok', '1'); this.textContent = 'Confirmar'; return; } salvo.equipes.splice(l.i, 1); gravar(); desenhar(); } })));
      })));
    return [h('h1', { text: 'Placar final' }), salvo.equipes.length ? tabela : h('p', { text: 'Adicione as equipes para lançar os pontos.' }),
      h('div', { class: 'linha-botoes manual', style: 'margin-top:1.4vh' }, h('button', { class: 'botao secundario', type: 'button', text: '+ Adicionar equipe', onclick: function () { salvo.equipes.push({ nome: '', pontos: D.rodadas.map(function () { return null; }) }); gravar(); desenhar(); } })),
      h('p', { class: 'apoio', style: 'font-size:.6em;margin-top:1vh', text: 'Pontos por rodada conforme o gabarito impresso (até 100, mais o bônus da Carta Dobro). Os lançamentos ficam salvos neste navegador. Equipes com a mesma pontuação dividem a posição.' })];
  }

  function ir(n) { salvo.passo = Math.max(0, Math.min(passos.length - 1, n)); gravar(); desenhar(); window.scrollTo(0, 0); }
  function desenhar() {
    var p = passos[salvo.passo], corpo;
    if (p.tipo === 'slide') corpo = corpoSlide(p.slide);
    else if (p.tipo === 'rodada') corpo = corpoRodada(p.rodada, p.de, p.ate);
    else if (p.tipo === 'desempate') corpo = [h('p', { class: 'rotulo-etapa', text: 'Desempate · só para equipes empatadas no pódio' }), h('h1', { text: D.desempate.pergunta }), h('p', { text: D.desempate.instrucao + ' Cada equipe escreve o palpite em uma folha.' })];
    else if (p.tipo === 'placar') corpo = corpoPlacar();
    else corpo = [h('p', { class: 'rotulo-etapa', text: 'Para conversar' }), h('h1', { class: 'pergunta-final', text: D.fechamento.pergunta }), h('p', { style: 'margin-top:1em', text: D.fechamento.apoio })];
    EL.limpar(app);
    app.appendChild(h('div', { class: 'tela cont' },
      h('header', { class: 'tela-topo' }, h('div', { class: 'evento' }, D.evento.titulo, h('small', { text: p.rotulo + ' · contingência' })), EL.marcas()),
      h('main', { class: 'tela-corpo' }, corpo), h('footer', { class: 'tela-rodape' }, h('span', { text: 'Modo de contingência — sem conexão com o servidor' }), h('span', { text: 'Banco de perguntas ' + D.versao }))));
    app.appendChild(h('nav', { class: 'cont-barra', 'aria-label': 'Navegação da contingência' },
      h('button', { class: 'botao secundario', type: 'button', disabled: salvo.passo === 0, text: '← Anterior', onclick: function () { ir(salvo.passo - 1); } }),
      h('span', { role: 'status', text: (salvo.passo + 1) + ' de ' + passos.length + ' · ' + p.rotulo }),
      h('button', { class: 'botao', type: 'button', disabled: salvo.passo === passos.length - 1, text: 'Próximo →', onclick: function () { ir(salvo.passo + 1); } })));
  }
  document.addEventListener('keydown', function (ev) {
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(ev.target.tagName)) return;
    if (ev.key === 'ArrowRight' || ev.key === 'PageDown') { ev.preventDefault(); ir(salvo.passo + 1); }
    if (ev.key === 'ArrowLeft' || ev.key === 'PageUp') { ev.preventDefault(); ir(salvo.passo - 1); }
  });
  desenhar();
})();
