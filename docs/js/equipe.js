/* Tela da equipe (celular). Um aparelho por equipe; uma resposta consolidada por rodada. */
(function () {
  'use strict';
  var h = EL.h, app = document.getElementById('app');
  var CH_SESSAO = 'el26:equipe', CH_APARELHO = 'el26:aparelho', CH_RASCUNHO = 'el26:rascunho';
  var sessao = EL.guarda.ler(CH_SESSAO);          // { sala, token, nome }
  var rascunhos = EL.guarda.ler(CH_RASCUNHO) || {}; // por rodada, sobrevive à recarga
  var estado = null, sonda = null, chaveTela = '', semConexao = false, enviando = false, erroEnvio = null, confirmando = false, pedindoAjuda = null;

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
  function grupoRadio(nome, legenda, opcoes, valor, aoMudar, classe, numero) {
    return h('fieldset', { 'data-q': numero ? String(numero) : null }, h('legend', null, legenda),
      h('div', { class: 'opcoes ' + (classe || '') }, opcoes.map(function (o) {
        return h('label', { class: 'opcao' + (o.desativada ? ' eliminada' : '') }, h('input', { type: 'radio', name: nome, value: o.id, checked: valor === o.id, disabled: o.desativada, onchange: function () { aoMudar(o.id); } }), h('span', { text: o.texto }));
      })));
  }
  /** Carta Dobro: escolha explícita de um item (ou "não usar"). d.dobro: undefined = ainda não escolheu; null = não usar. */
  function campoDobro(r, d, rotulos) {
    var ops = rotulos.map(function (x) { return { id: x.id, texto: x.texto }; }).concat([{ id: '__nao', texto: 'Não usar a Carta Dobro nesta rodada' }]);
    return h('div', { class: 'carta-dobro' },
      grupoRadio('dobro-' + r.id, [h('span', { class: 'selo dobro', text: '×2 Carta Dobro' }), ' Em qual item a equipe mais confia?'], ops, d.dobro === null ? '__nao' : d.dobro, function (v) { d.dobro = v === '__nao' ? null : v; salvarRascunho(); }),
      h('p', { class: 'dica', text: 'Se o item escolhido estiver certo, ele vale 40 em vez de 20 (+20 de bônus). Se estiver errado, nada se perde.' }));
  }
  /** Início do texto do item, para a equipe reconhecer onde está pondo a Carta Dobro. */
  function resumo(t) { t = String(t || ''); return t.length > 70 ? t.slice(0, 70).replace(/\s+\S*$/, '') + '…' : t; }
  function faltaDobro(d) { return d.dobro === undefined ? 'Escolham onde usar a Carta Dobro, ou marquem “Não usar”.' : null; }
  function comDobro(resposta, d) { if (d.dobro) resposta.dobro = d.dobro; return resposta; }

  function formAssociacao(r) {
    var d = rascunho(r.id, { itens: {} });
    var ops = [{ id: 'unifasam', texto: 'UNIFASAM' }, { id: 'integra', texto: 'FACULDADE INTEGRA' }, { id: 'ambas', texto: 'Ambas' }];
    return { nos: r.itens.map(function (it, k) {
      return grupoRadio('a-' + it.id, [h('span', { class: 'num', text: String(k + 1) }), it.enunciado], ops, d.itens[it.id], function (v) { d.itens[it.id] = v; salvarRascunho(); }, 'tres', k + 1);
    }).concat(campoDobro(r, d, r.itens.map(function (it, k) { return { id: it.id, texto: (k + 1) + '. ' + resumo(it.enunciado) }; }))),
      pronto: function () { return r.itens.every(function (it) { return d.itens[it.id]; }) ? faltaDobro(d) : 'Marque uma opção em cada enunciado antes de enviar.'; },
      resposta: function () { return comDobro({ itens: d.itens }, d); } };
  }
  function formOrdenacao(r) {
    var ids = r.itens.map(function (i) { return i.id; });
    var d = rascunho(r.id, { ordem: ids.slice() });
    if (d.ordem.length !== ids.length || !d.ordem.every(function (i) { return ids.indexOf(i) >= 0; })) d.ordem = ids.slice();
    var lista = h('ol', { class: 'ordenar', 'aria-label': 'Acontecimentos, do mais antigo ao mais recente' });
    var vivo = h('p', { class: 'oculto-visual', 'aria-live': 'polite' });
    function desenharLista(focoId, direcao) {
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
      desenharLista(id, direcao); vivo.textContent = 'Movido para a posição ' + (j + 1) + ' de ' + d.ordem.length + '.';
    }
    desenharLista();
    return { nos: [h('p', { class: 'enunciado', text: 'Mais antigo no topo, mais recente embaixo.' }), lista, vivo, campoDobro(r, d, r.itens.map(function (it) { return { id: it.id, texto: it.texto }; }))],
      pronto: function () { return faltaDobro(d); }, resposta: function () { return comDobro({ ordem: d.ordem }, d); } };
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
    ], pronto: function () { if (!d.opcao) return 'Escolha uma das ações.'; if (d.justificativa.trim().length < 10) return 'Escreva uma justificativa curta (pelo menos 10 caracteres).'; return null; }, resposta: function () { return { opcao: d.opcao, justificativa: d.justificativa }; } };
  }
  function formQuiz(r) {
    var d = rascunho(r.id, { respostas: {} });
    var aj = estado.ajuda;
    if (aj && aj.eliminadas.indexOf(d.respostas[aj.questao]) >= 0) { delete d.respostas[aj.questao]; salvarRascunho(); }
    var nos = [];
    r.questoes.forEach(function (q, k) {
      var minha = aj && aj.questao === q.id;
      nos.push(grupoRadio('q-' + q.id, [h('span', { class: 'num', text: String(k + 1) }), q.enunciado], q.opcoes.map(function (o) {
        var fora = minha && aj.eliminadas.indexOf(o.id) >= 0;
        return { id: o.id, texto: o.id.toUpperCase() + ') ' + o.texto + (fora ? ' (eliminada pela Ajuda 50:50)' : ''), desativada: fora };
      }), d.respostas[q.id], function (v) { d.respostas[q.id] = v; salvarRascunho(); }, '', k + 1));
      if (minha) nos.push(h('p', { class: 'aviso ok', role: 'status', text: '✓ Ajuda 50:50 usada nesta questão: duas alternativas erradas foram eliminadas.' }));
      else if (!aj && estado.ajudaDisponivel) nos.push(h('p', { class: 'linha-ajuda' }, pedindoAjuda === q.id
        ? [h('button', { class: 'botao', type: 'button', disabled: enviando, text: 'Confirmar: usar a única Ajuda 50:50 aqui', onclick: function () { usarAjuda(q.id); } }), ' ', h('button', { class: 'botao secundario', type: 'button', text: 'Cancelar', onclick: function () { pedindoAjuda = null; desenhar(true); } })]
        : h('button', { class: 'botao secundario', type: 'button', 'aria-label': '50:50 nesta questão ' + (k + 1), text: '50:50 nesta questão', onclick: function () { pedindoAjuda = q.id; desenhar(true); } })));
    });
    if (!aj && !estado.ajudaDisponivel) nos.push(h('p', { class: 'apoio', text: 'A Ajuda 50:50 da equipe já foi usada.' }));
    nos.push(campoDobro(r, d, r.questoes.map(function (q, k) { return { id: q.id, texto: (k + 1) + '. ' + resumo(q.enunciado) }; })));
    return { nos: nos, pronto: function () { return r.questoes.every(function (q) { return d.respostas[q.id]; }) ? faltaDobro(d) : 'Responda a todas as questões antes de enviar.'; }, resposta: function () { return comDobro({ respostas: d.respostas }, d); } };
  }
  var FORMS = { associacao: formAssociacao, ordenacao: formOrdenacao, decisao: formDecisao, quiz: formQuiz };

  function usarAjuda(idQuestao) {
    erroEnvio = null;
    EL.api('POST', '/api/salas/' + sessao.sala + '/ajuda', { token: sessao.token, corpo: { questao: idQuestao } }).then(function (a) {
      pedindoAjuda = null; estado.ajuda = { questao: a.questao, eliminadas: a.eliminadas }; estado.ajudaDisponivel = false; desenhar(true);
    }, function (e) {
      if (e.status === 401 || e.status === 404) return telaExpirada();
      pedindoAjuda = null; erroEnvio = e.rede ? 'O pedido de ajuda não chegou ao servidor. Tente de novo.' : e.mensagem; desenhar(true); if (sonda) sonda.agora();
    });
  }

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
  function marcaDobro(resp, id) { return resp && resp.dobro === id ? h('span', { class: 'selo dobro', text: '×2 Carta Dobro' }) : null; }
  function resumoResposta(r, resp) {
    if (r.tipo === 'associacao') return h('ol', null, r.itens.map(function (it) { return h('li', null, it.enunciado + ' — ', h('strong', { text: nomeInst(resp.itens[it.id]) }), ' ', marcaDobro(resp, it.id)); }));
    if (r.tipo === 'ordenacao') return h('ol', null, resp.ordem.map(function (id) { var it = r.itens.filter(function (x) { return x.id === id; })[0]; return h('li', null, it ? it.texto : id, ' ', marcaDobro(resp, id)); }));
    if (r.tipo === 'decisao') { var o = r.opcoes.filter(function (x) { return x.id === resp.opcao; })[0]; return [h('p', null, h('strong', { text: 'Ação ' + resp.opcao.toUpperCase() + ': ' }), o ? o.texto : ''), h('p', { class: 'justificativa', text: resp.justificativa })]; }
    return h('ol', null, r.questoes.map(function (q) { var o = q.opcoes.filter(function (x) { return x.id === resp.respostas[q.id]; })[0]; return h('li', null, q.enunciado + ' — ', h('strong', { text: o ? o.id.toUpperCase() + ') ' + o.texto : '' }), ' ', marcaDobro(resp, q.id)); }));
  }
  function selo(certo) { return h('span', { class: 'selo ' + (certo ? 'certo' : 'errado'), text: certo ? '✓ Acertou' : '✗ Não acertou' }); }
  function devolutiva(r, dv, resp) {
    if (r.tipo === 'associacao') return r.itens.map(function (it, k) {
      var g = dv.itens[k], minha = resp ? resp.itens[it.id] : null;
      return h('div', { class: 'devolutiva-item' }, h('p', { class: 'enunciado', text: (k + 1) + '. ' + it.enunciado }),
        h('p', null, 'Resposta: ', EL.etiqueta(g.gabarito), ' ', resp ? selo(minha === g.gabarito) : null, ' ', marcaDobro(resp, it.id), resp && minha !== g.gabarito ? h('span', { class: 'apoio', text: ' Sua equipe marcou ' + nomeInst(minha) + '.' }) : null),
        h('p', { text: g.comentario }), h('p', { class: 'referencia', text: 'Fonte: ' + g.referencia }));
    });
    if (r.tipo === 'ordenacao') return [h('ol', { class: 'ordenar' }, dv.itens.map(function (g, k) {
      var certo = resp && resp.ordem[k] === g.id;
      return h('li', null, h('span', { class: 'num', text: String(k + 1) }), h('div', null, h('strong', { text: g.ano + ' · ' }), g.texto, ' ', g.instituicao ? EL.etiqueta(g.instituicao) : null, ' ', resp ? selo(certo) : null, ' ', marcaDobro(resp, g.id), h('p', { class: 'referencia', text: g.detalhe + ' Fonte: ' + g.referencia })));
    })), h('p', { text: dv.comentario })];
    if (r.tipo === 'decisao') return [r.opcoes.map(function (o, k) {
      var g = dv.opcoes[k];
      return h('div', { class: 'devolutiva-item' }, h('p', { class: 'enunciado' }, o.id.toUpperCase() + ') ' + o.texto, ' ', resp && resp.opcao === o.id ? h('span', { class: 'selo neutro', text: 'Escolha da equipe' }) : null),
        h('p', null, h('strong', { text: g.pontos + ' pontos. ' }), g.analise));
    }), h('p', { text: dv.comentario }), h('p', { class: 'referencia', text: 'Fonte: ' + dv.referencia })];
    return r.questoes.map(function (q, k) {
      var g = dv.questoes[k], minha = resp ? resp.respostas[q.id] : null;
      var correta = q.opcoes.filter(function (o) { return o.id === g.correta; })[0];
      return h('div', { class: 'devolutiva-item' }, h('p', { class: 'enunciado', text: (k + 1) + '. ' + q.enunciado }),
        h('p', null, h('strong', { text: 'Resposta: ' + g.correta.toUpperCase() + ') ' }), correta.texto, ' ', resp ? selo(minha === g.correta) : null, ' ', marcaDobro(resp, q.id)),
        h('p', { text: g.comentario }), h('p', { class: 'referencia', text: 'Fonte: ' + g.referencia }));
    });
  }
  function listaSelos(ids, nomes) {
    if (!ids || !ids.length) return null;
    return h('ul', { class: 'selos', 'aria-label': 'Selos conquistados' }, ids.map(function (id) { return h('li', { class: 'selo conquista', text: '★ ' + (nomes[id] || id) }); }));
  }
  function variacao(v) { return v === null || v === undefined ? '' : v > 0 ? '▲ subiu ' + v : v < 0 ? '▼ desceu ' + (-v) : '= manteve'; }

  function blocoDesempate(dz) {
    if (dz.fase === 'aberta' && dz.participo && dz.meuPalpite === null) {
      var campo = h('input', { id: 'palpite', type: 'number', inputmode: 'numeric', min: '0', step: '1', 'aria-describedby': 'dica-palpite' });
      var msg = h('div', { role: 'alert' });
      return h('section', { class: 'cartao' }, h('p', { class: 'rotulo-etapa', text: 'Desempate' }), h('h1', { text: 'Sua equipe está empatada no pódio' }),
        h('form', { novalidate: true, onsubmit: function (ev) {
          ev.preventDefault(); EL.limpar(msg);
          var n = Number(campo.value);
          if (campo.value === '' || !Number.isInteger(n) || n < 0) { msg.appendChild(h('p', { class: 'aviso erro', text: 'Digite um número inteiro.' })); campo.focus(); return; }
          EL.api('POST', '/api/salas/' + sessao.sala + '/desempate', { token: sessao.token, corpo: { palpite: n } }).then(function () { if (sonda) sonda.agora(); },
            function (e) { msg.appendChild(h('p', { class: 'aviso erro', text: e.rede ? 'O palpite não chegou ao servidor. Tente de novo.' : e.mensagem })); });
        } }, h('div', { class: 'campo' }, h('label', { for: 'palpite', text: dz.pergunta }), h('p', { class: 'dica', id: 'dica-palpite', text: dz.instrucao }), campo), msg,
          h('button', { class: 'botao bloco', type: 'submit', text: 'Enviar palpite da equipe' })));
    }
    return h('section', { class: 'cartao' }, h('p', { class: 'rotulo-etapa', text: 'Desempate' }), h(dz.fase === 'aberta' ? 'h1' : 'h2', { text: dz.fase === 'aberta' ? 'Desempate no pódio' : 'Resultado do desempate' }),
      h('p', { text: dz.pergunta }),
      dz.fase === 'aberta' ? h('p', { class: 'aviso ' + (dz.participo ? 'ok' : 'atencao'), role: 'status', text: dz.participo ? '✓ Palpite recebido: ' + dz.meuPalpite + '. Aguardem o encerramento.' : 'Equipes empatadas estão respondendo: ' + dz.equipes.join(', ') + '.' })
        : [h('p', null, h('strong', { text: 'Resposta: ' + dz.resposta + '. ' }), dz.comentario), h('ul', null, dz.palpites.map(function (x) { return h('li', { text: x.nome + ': ' + (x.palpite === null ? 'sem palpite' : x.palpite) }); })), h('p', { class: 'referencia', text: 'Fonte: ' + dz.referencia })]);
  }

  /** Marca os itens sem resposta, leva o foco ao primeiro e devolve a lista de números. */
  function marcarFaltas() {
    var faltam = [], primeiro = null;
    Array.prototype.forEach.call(document.querySelectorAll('fieldset[data-q]'), function (fs) {
      var ok = !!fs.querySelector('input:checked');
      fs.classList.toggle('faltando', !ok);
      if (!ok) { faltam.push(fs.getAttribute('data-q')); if (!primeiro) primeiro = fs; }
    });
    if (primeiro) { var r = primeiro.querySelector('input:not([disabled])'); if (r) r.focus(); primeiro.scrollIntoView({ block: 'center' }); }
    return faltam;
  }
  /** Barra fixa "n de N respondidos" nas rodadas com vários itens. */
  function iniciarProgresso() {
    var cartao = app.querySelector('.cartao');
    var grupos = cartao ? cartao.querySelectorAll('fieldset[data-q]') : [];
    if (!cartao || grupos.length < 2 || document.getElementById('confirmar')) return;
    var barra = h('p', { class: 'progresso', role: 'status', 'aria-live': 'polite' });
    function atualizar() {
      var feitos = 0;
      Array.prototype.forEach.call(grupos, function (fs) { if (fs.querySelector('input:checked')) { feitos++; fs.classList.remove('faltando'); } });
      barra.textContent = feitos + ' de ' + grupos.length + ' respondidos' + (feitos === grupos.length ? ' · falta só enviar' : '');
      barra.classList.toggle('completo', feitos === grupos.length);
    }
    cartao.addEventListener('change', atualizar);
    cartao.appendChild(barra); atualizar();
  }

  // ---------- telas por etapa ----------
  function desenhar(forcar) {
    var e = estado; if (!e) return;
    var r = e.rodada, fase = e.etapa.fase, minha = e.minha || {}, dz = e.desempate;
    var chave = [e.etapa.id, fase, minha.enviada, e.ajuda ? e.ajuda.questao : '', e.parcial ? 'p' : '', dz ? dz.fase + dz.meuPalpite : '', e.placarCompleto, fase === 'revelada' || e.placar ? e.rev : ''].join('|');
    if (!forcar && chave === chaveTela) return;
    if (chave !== chaveTela) { confirmando = false; if (!enviando) erroEnvio = null; }
    chaveTela = chave;
    var nos = [];
    var rotulo = h('p', { class: 'rotulo-etapa', text: EL.NOMES_ETAPA[e.etapa.id] + (r ? ' · ' + r.duracaoMin + ' min' : '') });

    if (e.etapa.id === 'abertura') {
      nos.push(h('section', { class: 'cartao' }, rotulo, h('h1', { text: 'Equipe ' + e.equipe.nome + ' está na sala' }),
        h('p', { class: 'aviso ok', role: 'status', text: '✓ Entrada confirmada. ' + e.totalEquipes + (e.totalEquipes === 1 ? ' equipe conectada.' : ' equipes conectadas.') }),
        h('p', { text: 'Acompanhem o painel na tela. A primeira rodada aparece aqui assim que o moderador abrir.' }),
        h('h2', { text: 'Recursos da equipe' }),
        h('ul', null, h('li', null, h('strong', { text: 'Carta Dobro: ' }), 'uma por rodada; se o item escolhido estiver certo, ele vale 40 em vez de 20 (+20 de bônus).'), h('li', null, h('strong', { text: 'Ajuda 50:50: ' }), 'uma no jogo, no quiz final; elimina duas alternativas erradas.'), h('li', null, h('strong', { text: 'Selos: ' }), 'para quem acerta tudo de uma instituição ou todos os itens “Ambas”.')),
        h('p', { class: 'apoio', text: 'Velocidade não conta pontos. Mantenham esta página aberta; se o celular bloquear, basta voltar a ela.' })));
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
        if (p) { var faltam = marcarFaltas(); msg.appendChild(h('p', { class: 'aviso erro', text: faltam.length ? p.replace(/\.$/, '') + ': faltam ' + (faltam.length === 1 ? 'o item ' : 'os itens ') + faltam.join(', ') + '.' : p })); return; }
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
      var eu = e.parcial ? e.parcial.filter(function (l) { return l.voce; })[0] : null;
      nos.push(h('section', { class: 'cartao' }, rotulo, h('h1', { text: r.titulo }),
        h('p', null, h('span', { class: 'pontos-grandes', text: String(minha.pontos || 0) }), ' pontos nesta rodada'),
        r.cartaDobro && minha.enviada ? h('p', { class: 'apoio', text: minha.bonus ? minha.base + ' pelos acertos + ' + minha.bonus + ' da Carta Dobro = ' + minha.pontos + ' pontos.' : minha.base + ' pelos acertos. ' + (minha.resposta.dobro ? 'A Carta Dobro não rendeu bônus: o item escolhido não estava certo.' : 'A Carta Dobro não foi usada.') }) : null,
        minha.enviada ? null : h('p', { class: 'aviso atencao', text: 'Sua equipe não enviou resposta nesta rodada.' }),
        h('p', { class: 'apoio', text: 'Total acumulado: ' + e.meusPontos + ' pontos.' }),
        eu ? h('p', { class: 'aviso ok', role: 'status', text: 'Placar parcial: ' + EL.posicao(eu.posicao) + ' lugar' + (variacao(eu.variacao) ? ' (' + variacao(eu.variacao) + ')' : '') + '.' }) : null,
        listaSelos(e.meusSelos, e.nomesSelos)));
      nos.push(h('section', { class: 'cartao' }, h('h2', { text: 'Devolutiva' }), devolutiva(r, e.devolutiva, minha.enviada ? minha.resposta : null)));
    } else {
      if (dz && e.etapa.id === 'placar' && dz.fase === 'aberta') nos.push(blocoDesempate(dz));
      if (e.etapa.id === 'placar' && !e.placarCompleto && !(dz && dz.fase === 'aberta')) nos.push(h('section', { class: 'cartao' }, rotulo, h('h1', { text: 'Placar final' }),
        h('p', { class: 'aviso atencao', role: 'status', text: 'O moderador está revelando o placar na tela, do último ao primeiro lugar.' }),
        h('p', null, 'Sua equipe somou ', h('strong', { text: e.meusPontos + ' pontos' }), '.'), listaSelos(e.meusSelos, e.nomesSelos)));
      if (e.placar) {
        var meu = e.placar.filter(function (l) { return l.voce; })[0];
        nos.push(h('section', { class: 'cartao' }, rotulo, h('h1', { text: e.etapa.id === 'fechamento' ? 'Para conversar' : 'Placar final' }),
          e.fechamento ? [h('p', { class: 'pergunta-final', style: 'font-size:1.5rem', text: e.fechamento.pergunta }), h('p', { class: 'apoio', text: e.fechamento.apoio })] : null,
          meu ? h('p', { role: 'status' }, 'Sua equipe ficou em ', h('strong', { text: EL.posicao(meu.posicao) + ' lugar' }), ' com ', h('strong', { text: meu.total + ' pontos' }), '.') : null,
          listaSelos(e.meusSelos, e.nomesSelos),
          h('table', { class: 'placar' }, h('caption', { class: 'oculto-visual', text: 'Classificação final' }),
            h('thead', null, h('tr', null, h('th', { scope: 'col', text: 'Posição' }), h('th', { scope: 'col', text: 'Equipe' }), h('th', { scope: 'col', class: 'n', text: 'Pontos' }))),
            h('tbody', null, e.placar.map(function (l) { return h('tr', { class: l.voce ? 'voce' : null }, h('td', { class: 'pos', text: EL.posicao(l.posicao) }), h('td', null, l.nome + (l.voce ? ' (sua equipe)' : ''), l.selos.length ? h('span', { class: 'apoio', text: ' ★'.repeat(l.selos.length) }) : null), h('td', { class: 'n', text: String(l.total) })); }))),
          h('p', { class: 'apoio', text: 'Cada ★ é um selo conquistado. Equipes com a mesma pontuação dividem a posição.' })));
      }
      if (dz && e.etapa.id === 'placar' && dz.fase !== 'aberta') nos.push(blocoDesempate(dz));
    }
    nos.push(h('p', { style: 'text-align:center' }, h('button', { class: 'botao discreto', type: 'button', text: 'Sair e entrar como outra equipe', onclick: function () {
      var b = this; if (b.getAttribute('data-ok')) return sairParaEntrada('Você saiu da sala neste aparelho.', 'atencao');
      b.setAttribute('data-ok', '1'); b.textContent = 'Toque de novo para confirmar a saída';
    } })));
    var rolagem = window.scrollY;
    moldura(nos);
    iniciarProgresso();
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
