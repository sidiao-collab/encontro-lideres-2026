/* Tela da equipe (celular). Um aparelho por equipe; uma resposta consolidada por rodada. */
(function () {
  'use strict';
  var h = EL.h, app = document.getElementById('app');
  var CH_SESSAO = 'el26:equipe', CH_APARELHO = 'el26:aparelho', CH_RASCUNHO = 'el26:rascunho';
  var sessao = EL.guarda.ler(CH_SESSAO);          // { sala, token, nome }
  var rascunhos = EL.guarda.ler(CH_RASCUNHO) || {}; // por rodada, sobrevive à recarga
  var estado = null, sonda = null, chaveTela = '', semConexao = false, enviando = false, erroEnvio = null, confirmando = false;

  function aparelho() {
    var c = EL.guarda.ler(CH_APARELHO);
    if (!c) { c = 'ap-' + Math.random().toString(36).slice(2) + Date.now().toString(36); EL.guarda.gravar(CH_APARELHO, c); }
    return c;
  }
  function moldura(conteudo) {
    EL.limpar(app);
    if (semConexao) app.appendChild(h('div', { class: 'faixa-conexao', role: 'status', text: 'Sem conexão. Tentando reconectar… Suas marcações estão guardadas neste aparelho.' }));
    var topo = h('header', { class: 'topo' },
      h('div', { class: 'evento' }, 'Encontro de Líderes 2026', h('small', { text: sessao ? 'Equipe ' + sessao.nome + ' · sala ' + sessao.sala : 'UNIFASAM e FACULDADE INTEGRA' })));
    app.appendChild(h('main', { class: 'pagina' }, topo, conteudo));
  }

  // ---------- entrada ----------
  function telaEntrada(mensagem, tipo) {
    var parametros = new URLSearchParams(location.search);
    var codigo = h('input', { id: 'codigo', class: 'codigo', type: 'text', name: 'codigo', maxlength: '5', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', required: true, 'aria-describedby': 'dica-codigo', value: (parametros.get('sala') || '').toUpperCase().slice(0, 5) });
    var nome = h('input', { id: 'nome', type: 'text', name: 'nome', maxlength: '24', autocomplete: 'off', required: true, 'aria-describedby': 'dica-nome' });
    var caixaMsg = h('div', { role: 'alert' });
    if (mensagem) caixaMsg.appendChild(h('p', { class: 'aviso ' + (tipo || 'erro'), text: mensagem }));
    var botao = h('button', { class: 'botao bloco', type: 'submit', text: 'Entrar na sala' });
    var form = h('form', { novalidate: true, onsubmit: function (ev) {
      ev.preventDefault();
      var c = codigo.value.trim().toUpperCase(), n = nome.value.replace(/\s+/g, ' ').trim();
      EL.limpar(caixaMsg);
      if (c.length !== 5) { caixaMsg.appendChild(h('p', { class: 'aviso erro', text: 'Digite o código de 5 caracteres mostrado na tela.' })); codigo.focus(); return; }
      if (n.length < 2) { caixaMsg.appendChild(h('p', { class: 'aviso erro', text: 'Escolha um nome de equipe com pelo menos 2 caracteres.' })); nome.focus(); return; }
      botao.disabled = true; botao.textContent = 'Entrando…';
      EL.api('POST', '/api/salas/' + encodeURIComponent(c) + '/equipes', { corpo: { nome: n, chave: aparelho() } }).then(function (r) {
        sessao = { sala: r.sala, token: r.tokenEquipe, nome: r.nome };
        EL.guarda.gravar(CH_SESSAO, sessao); rascunhos = {}; EL.guarda.apagar(CH_RASCUNHO);
        iniciar();
      }, function (e) {
        botao.disabled = false; botao.textContent = 'Entrar na sala';
        caixaMsg.appendChild(h('p', { class: 'aviso erro', text: e.rede ? 'Não foi possível conectar. Verifique a internet e toque em “Entrar na sala” de novo.' : e.mensagem }));
      });
    } },
      h('div', { class: 'campo' }, h('label', { for: 'codigo', text: 'Código da sala' }), h('p', { class: 'dica', id: 'dica-codigo', text: 'Cinco caracteres mostrados na tela de projeção.' }), codigo),
      h('div', { class: 'campo' }, h('label', { for: 'nome', text: 'Nome da equipe' }), h('p', { class: 'dica', id: 'dica-nome', text: 'Nome curto, até 24 caracteres. Não use nomes de pessoas.' }), nome),
      caixaMsg, botao);
    moldura([EL.marcas(), EL.notaProvisoria(), h('section', { class: 'cartao', style: 'margin-top:16px' }, h('h1', { text: 'Entrar com a equipe' }), h('p', { class: 'apoio', text: 'Um celular por equipe. Nenhum dado pessoal é pedido.' }), form)]);
    (codigo.value ? nome : codigo).focus();
  }

  function sairParaEntrada(mensagem, tipo) {
    if (sonda) sonda.parar();
    sessao = null; estado = null; chaveTela = ''; EL.guarda.apagar(CH_SESSAO); EL.guarda.apagar(CH_RASCUNHO); rascunhos = {};
    telaEntrada(mensagem, tipo);
  }
  function telaExpirada() {
    if (sonda) sonda.parar();
    moldura(h('section', { class: 'cartao' }, h('h1', { text: 'Esta sala não está mais disponível' }),
      h('p', { text: 'A sala expirou ou o servidor foi reiniciado. Peça o novo código ao moderador.' }),
      h('button', { class: 'botao bloco', type: 'button', text: 'Voltar à entrada', onclick: function () { sairParaEntrada(); } })));
  }

  // ---------- rascunho ----------
  function rascunho(id, padrao) { if (!rascunhos[id]) rascunhos[id] = padrao; return rascunhos[id]; }
  function salvarRascunho() { EL.guarda.gravar(CH_RASCUNHO, rascunhos); }

  // ---------- formulários por tipo ----------
  function grupoRadio(nome, legenda, opcoes, valor, aoMudar, classe) {
    return h('fieldset', null, h('legend', null, legenda),
      h('div', { class: 'opcoes ' + (classe || '') }, opcoes.map(function (o) {
        return h('label', { class: 'opcao' }, h('input', { type: 'radio', name: nome, value: o.id, checked: valor === o.id, onchange: function () { aoMudar(o.id); } }), h('span', { text: o.texto }));
      })));
  }
  function formAssociacao(r) {
    var d = rascunho(r.id, { itens: {} });
    var ops = [{ id: 'unifasam', texto: 'UNIFASAM' }, { id: 'integra', texto: 'FACULDADE INTEGRA' }, { id: 'ambas', texto: 'Ambas' }];
    return { nos: r.itens.map(function (it, k) {
      return grupoRadio('a-' + it.id, [h('span', { class: 'num', text: String(k + 1) }), it.enunciado], ops, d.itens[it.id], function (v) { d.itens[it.id] = v; salvarRascunho(); }, 'tres');
    }), pronto: function () { return r.itens.every(function (it) { return d.itens[it.id]; }) ? null : 'Marque uma opção em cada enunciado antes de enviar.'; }, resposta: function () { return { itens: d.itens }; } };
  }
  function formOrdenacao(r) {
    var ids = r.itens.map(function (i) { return i.id; });
    var d = rascunho(r.id, { ordem: ids.slice() });
    if (d.ordem.length !== ids.length || !d.ordem.every(function (i) { return ids.indexOf(i) >= 0; })) d.ordem = ids.slice();
    var lista = h('ol', { class: 'ordenar', 'aria-label': 'Acontecimentos, do mais antigo ao mais recente' });
    var vivo = h('p', { class: 'oculto-visual', 'aria-live': 'polite' });
    function desenhar(focoId, direcao) {
      EL.limpar(lista);
      d.ordem.forEach(function (id, k) {
        var it = r.itens.filter(function (x) { return x.id === id; })[0];
        var subir = h('button', { class: 'botao secundario', type: 'button', disabled: k === 0, 'aria-label': 'Subir: ' + it.texto, 'data-id': id, 'data-dir': 'subir', text: '↑ Subir', onclick: function () { mover(k, -1, id, 'subir'); } });
        var descer = h('button', { class: 'botao secundario', type: 'button', disabled: k === d.ordem.length - 1, 'aria-label': 'Descer: ' + it.texto, 'data-id': id, 'data-dir': 'descer', text: '↓ Descer', onclick: function () { mover(k, 1, id, 'descer'); } });
        lista.appendChild(h('li', null, h('span', { class: 'num', text: String(k + 1) }), h('span', { text: it.texto }), h('div', { class: 'mover' }, subir, descer)));
      });
      if (focoId) {
        var alvo = lista.querySelector('button[data-id="' + focoId + '"][data-dir="' + direcao + '"]:not([disabled])') || lista.querySelector('button[data-id="' + focoId + '"]:not([disabled])');
        if (alvo) alvo.focus();
      }
    }
    function mover(k, delta, id, direcao) {
      var j = k + delta; if (j < 0 || j >= d.ordem.length) return;
      var t = d.ordem[k]; d.ordem[k] = d.ordem[j]; d.ordem[j] = t; salvarRascunho();
      desenhar(id, direcao); vivo.textContent = 'Movido para a posição ' + (j + 1) + ' de ' + d.ordem.length + '.';
    }
    desenhar();
    return { nos: [h('p', { class: 'enunciado', text: 'Mais antigo no topo, mais recente embaixo.' }), lista, vivo], pronto: function () { return null; }, resposta: function () { return { ordem: d.ordem }; } };
  }
  function formDecisao(r) {
    var d = rascunho(r.id, { opcao: null, justificativa: '' });
    var contador = h('p', { class: 'dica', id: 'cont-just', 'aria-live': 'off', text: d.justificativa.length + ' de 300 caracteres' });
    var area = h('textarea', { id: 'justificativa', maxlength: '300', 'aria-describedby': 'dica-just cont-just', oninput: function () { d.justificativa = area.value; contador.textContent = area.value.length + ' de 300 caracteres'; salvarRascunho(); } });
    area.value = d.justificativa;
    return { nos: [
      h('p', { text: r.caso }), h('p', { class: 'regra', text: r.criterio }),
      grupoRadio('decisao', r.pergunta, r.opcoes.map(function (o) { return { id: o.id, texto: o.id.toUpperCase() + ') ' + o.texto }; }), d.opcao, function (v) { d.opcao = v; salvarRascunho(); }),
      h('div', { class: 'campo' }, h('label', { for: 'justificativa', text: 'Justificativa da equipe' }), h('p', { class: 'dica', id: 'dica-just', text: 'Uma ou duas frases. Não vale pontos; o moderador pode pedir que a equipe comente.' }), area, contador)
    ], pronto: function () { if (!d.opcao) return 'Escolha uma das três ações.'; if (d.justificativa.trim().length < 10) return 'Escreva uma justificativa curta (pelo menos 10 caracteres).'; return null; }, resposta: function () { return { opcao: d.opcao, justificativa: d.justificativa }; } };
  }
  function formQuiz(r) {
    var d = rascunho(r.id, { respostas: {} });
    return { nos: r.questoes.map(function (q, k) {
      return grupoRadio('q-' + q.id, [h('span', { class: 'num', text: String(k + 1) }), q.enunciado], q.opcoes.map(function (o) { return { id: o.id, texto: o.id.toUpperCase() + ') ' + o.texto }; }), d.respostas[q.id], function (v) { d.respostas[q.id] = v; salvarRascunho(); });
    }), pronto: function () { return r.questoes.every(function (q) { return d.respostas[q.id]; }) ? null : 'Responda a todas as questões antes de enviar.'; }, resposta: function () { return { respostas: d.respostas }; } };
  }
  var FORMS = { associacao: formAssociacao, ordenacao: formOrdenacao, decisao: formDecisao, quiz: formQuiz };

  function enviar(r, resposta) {
    enviando = true; erroEnvio = null; desenhar(true);
    EL.api('POST', '/api/salas/' + sessao.sala + '/respostas', { token: sessao.token, corpo: { rodada: r.id, resposta: resposta } }).then(function () {
      enviando = false; confirmando = false; if (sonda) sonda.agora();
    }, function (e) {
      enviando = false;
      if (e.status === 401 || e.status === 404) return telaExpirada();
      erroEnvio = e.rede ? 'O envio não chegou ao servidor. Sua resposta continua guardada neste aparelho: toque em “Tentar de novo”.' : e.mensagem;
      if (e.status === 409) confirmando = false;
      desenhar(true); if (sonda) sonda.agora();
    });
  }

  // ---------- resumo e devolutiva ----------
  function nomeInst(v) { return EL.INST[v] ? EL.INST[v].nome : v; }
  function resumoResposta(r, resp) {
    if (r.tipo === 'associacao') return h('ol', null, r.itens.map(function (it) { return h('li', null, it.enunciado + ' — ', h('strong', { text: nomeInst(resp.itens[it.id]) })); }));
    if (r.tipo === 'ordenacao') return h('ol', null, resp.ordem.map(function (id) { var it = r.itens.filter(function (x) { return x.id === id; })[0]; return h('li', { text: it ? it.texto : id }); }));
    if (r.tipo === 'decisao') { var o = r.opcoes.filter(function (x) { return x.id === resp.opcao; })[0]; return [h('p', null, h('strong', { text: 'Ação ' + resp.opcao.toUpperCase() + ': ' }), o ? o.texto : ''), h('p', { class: 'justificativa', text: resp.justificativa })]; }
    return h('ol', null, r.questoes.map(function (q) { var o = q.opcoes.filter(function (x) { return x.id === resp.respostas[q.id]; })[0]; return h('li', null, q.enunciado + ' — ', h('strong', { text: o ? o.id.toUpperCase() + ') ' + o.texto : '' })); }));
  }
  function selo(certo) { return h('span', { class: 'selo ' + (certo ? 'certo' : 'errado'), text: certo ? '✓ Acertou' : '✗ Não acertou' }); }
  function devolutiva(r, dv, resp) {
    if (r.tipo === 'associacao') return r.itens.map(function (it, k) {
      var g = dv.itens[k], minha = resp ? resp.itens[it.id] : null;
      return h('div', { class: 'devolutiva-item' }, h('p', { class: 'enunciado', text: (k + 1) + '. ' + it.enunciado }),
        h('p', null, 'Resposta: ', EL.etiqueta(g.gabarito), ' ', resp ? selo(minha === g.gabarito) : null, resp && minha !== g.gabarito ? h('span', { class: 'apoio', text: ' Sua equipe marcou ' + nomeInst(minha) + '.' }) : null),
        h('p', { text: g.comentario }), h('p', { class: 'referencia', text: 'Fonte: ' + g.referencia }));
    });
    if (r.tipo === 'ordenacao') return [h('ol', { class: 'ordenar' }, dv.itens.map(function (g, k) {
      var certo = resp && resp.ordem[k] === g.id;
      return h('li', null, h('span', { class: 'num', text: String(k + 1) }), h('div', null, h('strong', { text: g.ano + ' · ' }), g.texto, ' ', EL.etiqueta(g.instituicao), ' ', resp ? selo(certo) : null, h('p', { class: 'referencia', text: g.detalhe + ' Fonte: ' + g.referencia })));
    })), h('p', { text: dv.comentario })];
    if (r.tipo === 'decisao') return [r.opcoes.map(function (o, k) {
      var g = dv.opcoes[k];
      return h('div', { class: 'devolutiva-item' }, h('p', { class: 'enunciado' }, o.id.toUpperCase() + ') ' + o.texto, resp && resp.opcao === o.id ? h('span', { class: 'selo neutro', text: 'Escolha da equipe' }) : null),
        h('p', null, h('strong', { text: g.pontos + ' pontos. ' }), g.analise));
    }), h('p', { text: dv.comentario }), h('p', { class: 'referencia', text: 'Fonte: ' + dv.referencia })];
    return r.questoes.map(function (q, k) {
      var g = dv.questoes[k], minha = resp ? resp.respostas[q.id] : null;
      var correta = q.opcoes.filter(function (o) { return o.id === g.correta; })[0];
      return h('div', { class: 'devolutiva-item' }, h('p', { class: 'enunciado', text: (k + 1) + '. ' + q.enunciado }),
        h('p', null, h('strong', { text: 'Resposta: ' + g.correta.toUpperCase() + ') ' }), correta.texto, ' ', resp ? selo(minha === g.correta) : null),
        h('p', { text: g.comentario }), h('p', { class: 'referencia', text: 'Fonte: ' + g.referencia }));
    });
  }

  // ---------- telas por etapa ----------
  function desenhar(forcar) {
    var e = estado; if (!e) return;
    var r = e.rodada, fase = e.etapa.fase, minha = e.minha || {};
    var chave = [e.etapa.id, fase, minha.enviada, fase === 'revelada' || e.placar ? e.rev : ''].join('|');
    if (!forcar && chave === chaveTela) return;
    if (chave !== chaveTela) { confirmando = false; if (!enviando) erroEnvio = null; }
    chaveTela = chave;
    var nos = [];
    var rotulo = h('p', { class: 'rotulo-etapa', text: EL.NOMES_ETAPA[e.etapa.id] + (r ? ' · ' + r.duracaoMin + ' min' : '') });

    if (e.etapa.id === 'abertura') {
      nos.push(h('section', { class: 'cartao' }, rotulo, h('h1', { text: 'Equipe ' + e.equipe.nome + ' está na sala' }),
        h('p', { class: 'aviso ok', role: 'status', text: '✓ Entrada confirmada. ' + e.totalEquipes + (e.totalEquipes === 1 ? ' equipe conectada.' : ' equipes conectadas.') }),
        h('p', { text: 'Acompanhem o painel na tela. A primeira rodada aparece aqui assim que o moderador abrir.' }),
        h('p', { class: 'apoio', text: 'Mantenham esta página aberta. Se o celular bloquear, basta voltar a ela.' })));
    } else if (r && fase === 'preparo') {
      nos.push(h('section', { class: 'cartao' }, rotulo, h('h1', { text: r.titulo }), h('p', { text: r.instrucao }), h('p', { class: 'regra', text: r.regraPontuacao }),
        h('p', { class: 'aviso atencao', role: 'status', text: 'Aguardem: o moderador vai abrir a rodada.' })));
    } else if (r && fase === 'aberta' && !minha.enviada) {
      var f = FORMS[r.tipo](r);
      var msg = h('div', { role: 'alert' });
      if (erroEnvio) msg.appendChild(h('p', { class: 'aviso erro', text: erroEnvio }));
      var acoes;
      if (enviando) acoes = h('button', { class: 'botao bloco', type: 'button', disabled: true, text: 'Enviando…' });
      else if (confirmando) acoes = h('div', null, h('p', { class: 'aviso atencao', text: 'Depois de enviar, a resposta da equipe não pode ser alterada.' }),
        h('div', { class: 'linha-botoes' }, h('button', { class: 'botao', type: 'button', id: 'confirmar', text: erroEnvio ? 'Tentar de novo' : 'Confirmar envio', onclick: function () { enviar(r, f.resposta()); } }),
          h('button', { class: 'botao secundario', type: 'button', text: 'Revisar', onclick: function () { confirmando = false; erroEnvio = null; desenhar(true); } })));
      else acoes = h('button', { class: 'botao bloco', type: 'button', text: 'Enviar resposta da equipe', onclick: function () {
        var p = f.pronto(); EL.limpar(msg);
        if (p) { msg.appendChild(h('p', { class: 'aviso erro', text: p })); return; }
        confirmando = true; desenhar(true); var b = document.getElementById('confirmar'); if (b) b.focus();
      } });
      nos.push(h('section', { class: 'cartao' }, rotulo, h('h1', { text: r.titulo }), h('p', { text: r.instrucao }), h('p', { class: 'regra', text: r.regraPontuacao }), f.nos, msg, acoes));
    } else if (r && (fase === 'aberta' || fase === 'encerrada')) {
      nos.push(h('section', { class: 'cartao' }, rotulo, h('h1', { text: r.titulo }),
        minha.enviada ? h('p', { class: 'aviso ok', role: 'status', text: '✓ Resposta recebida às ' + EL.hora(minha.recebidaEm) + '. Ela não pode mais ser alterada.' })
          : h('p', { class: 'aviso atencao', role: 'status', text: 'Envios encerrados. Sua equipe não enviou resposta nesta rodada.' }),
        h('p', { class: 'apoio', text: fase === 'aberta' ? 'Aguardem as outras equipes. A devolutiva vem em seguida.' : 'Aguardem a devolutiva na tela.' }),
        minha.enviada ? [h('h2', { text: 'O que a equipe enviou' }), resumoResposta(r, minha.resposta)] : null));
    } else if (r && fase === 'revelada') {
      nos.push(h('section', { class: 'cartao' }, rotulo, h('h1', { text: r.titulo }),
        h('p', null, h('span', { class: 'pontos-grandes', text: String(minha.pontos || 0) }), ' de 100 pontos nesta rodada'),
        minha.enviada ? null : h('p', { class: 'aviso atencao', text: 'Sua equipe não enviou resposta nesta rodada.' }),
        h('p', { class: 'apoio', text: 'Total acumulado: ' + e.meusPontos + ' pontos.' })));
      nos.push(h('section', { class: 'cartao' }, h('h2', { text: 'Devolutiva' }), devolutiva(r, e.devolutiva, minha.enviada ? minha.resposta : null)));
    } else if (e.placar) {
      var eu = e.placar.filter(function (l) { return l.voce; })[0];
      nos.push(h('section', { class: 'cartao' }, rotulo, h('h1', { text: e.etapa.id === 'fechamento' ? 'Para conversar' : 'Placar final' }),
        e.fechamento ? [h('p', { class: 'pergunta-final', style: 'font-size:1.5rem', text: e.fechamento.pergunta }), h('p', { class: 'apoio', text: e.fechamento.apoio })] : null,
        eu ? h('p', { role: 'status' }, 'Sua equipe ficou em ', h('strong', { text: EL.posicao(eu.posicao) + ' lugar' }), ' com ', h('strong', { text: eu.total + ' pontos' }), '.') : null,
        h('table', { class: 'placar' }, h('caption', { class: 'oculto-visual', text: 'Classificação final' }),
          h('thead', null, h('tr', null, h('th', { scope: 'col', text: 'Posição' }), h('th', { scope: 'col', text: 'Equipe' }), h('th', { scope: 'col', class: 'n', text: 'Pontos' }))),
          h('tbody', null, e.placar.map(function (l) { return h('tr', { class: l.voce ? 'voce' : null }, h('td', { class: 'pos', text: EL.posicao(l.posicao) }), h('td', { text: l.nome + (l.voce ? ' (sua equipe)' : '') }), h('td', { class: 'n', text: String(l.total) })); }))),
        h('p', { class: 'apoio', text: 'Equipes com a mesma pontuação dividem a posição.' })));
    }
    nos.push(h('p', { style: 'text-align:center' }, h('button', { class: 'botao discreto', type: 'button', text: 'Sair e entrar como outra equipe', onclick: function () {
      var b = this; if (b.getAttribute('data-ok')) return sairParaEntrada('Você saiu da sala neste aparelho.', 'atencao');
      b.setAttribute('data-ok', '1'); b.textContent = 'Toque de novo para confirmar a saída';
    } })));
    var rolagem = window.scrollY;
    moldura(nos);
    if (forcar) window.scrollTo(0, rolagem);
  }

  function iniciar() {
    chaveTela = '';
    moldura(h('p', { role: 'status', text: 'Conectando à sala…' }));
    sonda = EL.sondar(function () { return EL.api('GET', '/api/salas/' + sessao.sala + '/estado', { token: sessao.token }); },
      function (d) { var voltou = semConexao; semConexao = false; estado = d; desenhar(voltou); },
      function (e) {
        if (e.status === 401 || e.status === 404) return telaExpirada();
        if (!semConexao) { semConexao = true; if (estado) desenhar(true); else moldura(h('p', { role: 'status', text: 'Sem conexão com o servidor. Tentando de novo…' })); }
      }, 1500);
  }

  if (sessao && sessao.token) {
    var pedida = (new URLSearchParams(location.search).get('sala') || '').toUpperCase();
    if (pedida && pedida !== sessao.sala) { EL.guarda.apagar(CH_SESSAO); EL.guarda.apagar(CH_RASCUNHO); sessao = null; rascunhos = {}; telaEntrada(); }
    else iniciar();
  } else telaEntrada();
})();
