/* Painel do moderador: cria a sala, conduz as etapas, vê gabarito, notas e justificativas. */
(function () {
  'use strict';
  var h = EL.h, app = document.getElementById('app');
  var CH = 'el26:moderador';
  var sessao = EL.guarda.ler(CH); // { sala, token } — nunca vai para links
  var estado = null, sonda = null, semConexao = false, ultimaRev = -1, erroAcao = null, ocupado = false, pedindoPular = false, relogio = null, desvio = 0, pedindoEncerrar = false;

  function moldura(conteudo, larga) {
    EL.limpar(app);
    if (semConexao) app.appendChild(h('div', { class: 'faixa-conexao', role: 'status', text: 'Sem conexão com o servidor. Tentando reconectar… Se persistir, use o modo de contingência.' }));
    app.appendChild(h('main', { class: 'pagina' + (larga ? ' larga' : '') },
      h('header', { class: 'topo' }, h('div', { class: 'evento' }, 'Encontro de Líderes 2026', h('small', { text: 'Painel do moderador' })),
        h('a', { class: 'botao discreto', href: 'contingencia.html', target: '_blank', rel: 'noopener', text: 'Contingência' })),
      conteudo));
  }

  // ---------- criação da sala ----------
  function telaCriar(mensagem) {
    var msg = h('div', { role: 'alert' });
    if (mensagem) msg.appendChild(h('p', { class: 'aviso atencao', text: mensagem }));
    var campoPin = h('div', { class: 'campo', hidden: true }, h('label', { for: 'pin', text: 'PIN do moderador' }), h('p', { class: 'dica', text: 'Definido na configuração do servidor (MODERATOR_PIN).' }), h('input', { id: 'pin', type: 'password', autocomplete: 'off' }));
    var botao = h('button', { class: 'botao bloco', type: 'submit', text: 'Criar sala' });
    var situacao = h('p', { class: 'apoio', role: 'status', text: 'Verificando o servidor…' });
    var demora = setTimeout(function () { situacao.textContent = 'Acordando o servidor… isso pode levar até um minuto na primeira vez. Aguarde.'; }, 3000);
    EL.api('GET', '/api/health', { limiteMs: 70000 }).then(function (s) {
      clearTimeout(demora);
      situacao.textContent = 'Servidor no ar. Banco de perguntas: versão ' + (s.versaoBanco || 'sem versão') + '.';
      if (s.pinExigido) campoPin.hidden = false;
    }, function (e) { clearTimeout(demora); situacao.textContent = ''; msg.appendChild(h('p', { class: 'aviso erro', text: 'Não foi possível falar com o servidor. ' + (e.mensagem || '') + ' Confira o endereço em config.js e se o serviço está no ar.' })); });
    var form = h('form', { onsubmit: function (ev) {
      ev.preventDefault(); EL.limpar(msg); botao.disabled = true; botao.textContent = 'Criando…';
      EL.api('POST', '/api/salas', { limiteMs: 70000, corpo: { pin: document.getElementById('pin').value } }).then(function (r) {
        sessao = { sala: r.sala, token: r.tokenModerador }; EL.guarda.gravar(CH, sessao); iniciar();
      }, function (e) { botao.disabled = false; botao.textContent = 'Criar sala'; msg.appendChild(h('p', { class: 'aviso erro', text: e.mensagem })); });
    } }, campoPin, msg, botao);
    moldura([EL.marcas(), EL.notaProvisoria(), h('section', { class: 'cartao', style: 'margin-top:16px' }, h('h1', { text: 'Criar a sala do encontro' }),
      h('p', { text: 'A sala fica na memória do servidor. Crie-a no dia, pouco antes de começar, e mantenha esta aba aberta.' }), situacao, form)]);
  }

  function encerrarSessao(mensagem) { if (sonda) sonda.parar(); clearInterval(relogio); sessao = null; estado = null; ultimaRev = -1; EL.guarda.apagar(CH); telaCriar(mensagem); }

  // ---------- ações ----------
  function acao(nome, extra) {
    if (ocupado) return; ocupado = true; erroAcao = null;
    var corpo = { acao: nome }; if (extra) Object.keys(extra).forEach(function (k) { corpo[k] = extra[k]; });
    EL.api('POST', '/api/salas/' + sessao.sala + '/controle', { token: sessao.token, corpo: corpo }).then(function (d) {
      ocupado = false; pedindoPular = false; pedindoEncerrar = false; receber(d, true);
    }, function (e) {
      ocupado = false;
      if (e.status === 401 || e.status === 404) return encerrarSessao('A sala expirou ou o servidor foi reiniciado. Crie uma nova sala.');
      erroAcao = e.rede ? 'A ação não chegou ao servidor. Tente de novo; repetir é seguro.' : e.mensagem; desenhar();
    });
  }
  function botao(texto, nome, extra, classe) { return h('button', { class: 'botao ' + (classe || ''), type: 'button', text: texto, onclick: function () { acao(nome, extra); } }); }

  // ---------- blocos ----------
  function nomeInst(v) { return EL.INST[v] ? EL.INST[v].nome : v; }
  function minutos(ms) { var s = Math.max(0, Math.floor(ms / 1000)); return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); }

  function blocoSala(e) {
    var link = EL.enderecoEquipe(e.sala);
    var urlProj = new URL('projecao.html', location.href); urlProj.hash = 'sala=' + e.sala + '&t=' + e.tokenProjecao;
    var copiado = h('span', { class: 'apoio', role: 'status' });
    var svg = EL.qr(link);
    return h('section', { class: 'cartao' }, h('p', { class: 'rotulo-etapa', text: 'Código da sala' }), h('p', { class: 'codigo-sala', text: e.sala }),
      h('p', { class: 'apoio', style: 'word-break:break-all;margin-top:8px' }, 'Link das equipes: ', h('a', { href: link, target: '_blank', rel: 'noopener', text: link })),
      h('div', { class: 'linha-botoes' },
        h('button', { class: 'botao secundario', type: 'button', text: 'Copiar link', onclick: function () {
          (navigator.clipboard ? navigator.clipboard.writeText(link) : Promise.reject()).then(function () { copiado.textContent = 'Link copiado.'; }, function () { copiado.textContent = 'Copie o link manualmente.'; });
        } }),
        h('a', { class: 'botao', href: urlProj.href, target: '_blank', rel: 'noopener', text: 'Abrir projeção' })), copiado,
      svg ? h('details', { style: 'margin-top:10px' }, h('summary', { text: 'Mostrar QR code aqui' }), h('div', { style: 'max-width:220px;margin-top:8px' }, svg)) : null,
      h('p', { class: 'apoio', style: 'margin-top:10px', text: 'O link da projeção só permite ver a tela. A credencial de moderador fica apenas neste navegador.' }));
  }

  function blocoEquipes(e) {
    var envios = e.envios ? Object.fromEntries(e.envios.map(function (x) { return [x.id, x]; })) : null;
    return h('section', { class: 'cartao' }, h('h2', { text: 'Equipes (' + e.totalEquipes + ')' }),
      e.rodada ? h('p', { role: 'status' }, h('strong', { text: e.respostasRecebidas + ' de ' + e.totalEquipes }), ' respostas recebidas nesta rodada.') : null,
      e.equipes.length ? h('ul', { class: 'lista-equipes' }, e.placar.map(function (l) {
        var env = envios && envios[l.id];
        return h('li', null, h('span', null, l.nome, env && env.resposta && env.resposta.dobro ? h('span', { class: 'apoio', title: 'Usou a Carta Dobro', text: ' ×2' }) : null, env && env.ajuda ? h('span', { class: 'apoio', title: 'Usou a Ajuda 50:50', text: ' 50:50' }) : null), h('span', null, env ? h('span', { class: 'selo ' + (env.enviou ? 'certo' : 'neutro'), text: env.enviou ? '✓ enviou' : 'aguardando' }) : null, ' ', h('span', { class: 'relogio', title: 'Pontos acumulados (visão privada)', text: l.total + ' pts' })));
      })) : h('p', { class: 'apoio', text: 'Nenhuma equipe entrou ainda.' }));
  }

  function blocoRoteiro(e) {
    var passos = [['abertura', 'Painel', e.painelDuracaoMin]].concat(e.rodadas.map(function (r) { return [r.id, r.titulo, r.duracaoMin]; }), [['placar', 'Placar e fechamento', e.fechamentoPrevio.duracaoMin]]);
    var atual = e.etapa.id === 'fechamento' ? 'placar' : e.etapa.id;
    var indice = passos.findIndex(function (p) { return p[0] === atual; });
    return h('section', { class: 'cartao' }, h('h2', { text: 'Roteiro (' + passos.reduce(function (a, p) { return a + p[2]; }, 0) + ' min)' }), h('ol', { class: 'roteiro' }, passos.map(function (p, k) {
      return h('li', { 'aria-current': k === indice ? 'step' : null, class: k < indice ? 'feito' : null }, h('span', { text: (k + 1) + '. ' + p[1] }), h('span', { text: p[2] + ' min' }));
    })));
  }

  function gabarito(e) {
    var r = e.rodada, g = e.gabaritoPrivado;
    var corpo;
    if (r.tipo === 'associacao') corpo = h('ol', null, r.itens.map(function (it, k) { return h('li', null, it.enunciado + ' — ', h('strong', { text: nomeInst(g.itens[k].gabarito) }), h('span', { class: 'apoio', text: ' (' + g.itens[k].acertos + ' de ' + g.itens[k].total + ' acertaram)' })); }));
    else if (r.tipo === 'ordenacao') corpo = h('ol', null, g.itens.map(function (it) { return h('li', null, h('strong', { text: it.ano + ' · ' }), it.texto, h('span', { class: 'apoio', text: ' (' + it.acertos + ' de ' + it.total + ' na posição certa)' })); }));
    else if (r.tipo === 'decisao') corpo = h('ul', null, r.opcoes.map(function (o, k) { return h('li', null, h('strong', { text: o.id.toUpperCase() + ' = ' + g.opcoes[k].pontos + ' pts. ' }), g.opcoes[k].analise, h('span', { class: 'apoio', text: ' (' + g.opcoes[k].escolhas + (g.opcoes[k].escolhas === 1 ? ' equipe)' : ' equipes)') })); }));
    else corpo = h('ol', null, r.questoes.map(function (q, k) { return h('li', null, q.enunciado + ' — ', h('strong', { text: g.questoes[k].correta.toUpperCase() }), h('span', { class: 'apoio', text: ' (' + g.questoes[k].acertos + ' de ' + g.questoes[k].total + ' acertaram)' })); }));
    return h('div', { class: 'privado' }, h('strong', { text: 'Gabarito — só nesta tela' }), corpo);
  }

  function justificativas(e) {
    var r = e.rodada; if (r.tipo !== 'decisao') return null;
    var enviados = e.envios.filter(function (x) { return x.enviou; });
    return h('div', { class: 'privado' }, h('strong', { text: 'Justificativas das equipes — não vão para a projeção' }),
      enviados.length ? enviados.map(function (x) { return h('div', { class: 'justificativa' }, h('p', null, h('strong', { text: x.nome }), ' escolheu ', h('strong', { text: x.resposta.opcao.toUpperCase() }), e.etapa.fase === 'aberta' ? null : ' (' + x.pontos + ' pts)'), h('p', { text: x.resposta.justificativa })); })
        : h('p', { class: 'apoio', text: 'Nenhuma resposta ainda.' }),
      h('p', { class: 'apoio', text: 'Antes de revelar, convide duas equipes com escolhas diferentes a explicar o raciocínio.' }));
  }

  function enunciadoResumo(r) {
    if (r.tipo === 'decisao') return [h('p', { class: 'apoio', text: 'Caso sorteado: ' + r.tema }), h('p', { text: r.caso }), h('p', { class: 'regra', text: r.criterio }), h('ol', { type: 'A' }, r.opcoes.map(function (o) { return h('li', { text: o.texto }); }))];
    if (r.tipo === 'associacao') return [h('p', { class: 'apoio', text: 'Enunciados sorteados para esta sala:' }), h('ol', null, r.itens.map(function (i) { return h('li', { text: i.enunciado }); }))];
    if (r.tipo === 'quiz') return [h('p', { class: 'apoio', text: 'Questões sorteadas para esta sala:' }), h('ol', null, r.questoes.map(function (q) { return h('li', { text: q.enunciado }); }))];
    return [h('p', { class: 'apoio', text: 'Acontecimentos sorteados para esta sala (a ordem correta fica no gabarito, depois de abrir):' }), h('ul', null, r.itens.map(function (i) { return h('li', { text: i.texto }); }))];
  }

  /** Se ainda faltam equipes, pede confirmação antes de encerrar (o encerramento é manual e vale para todas). */
  function botaoEncerrar(e) {
    var faltam = e.totalEquipes - e.respostasRecebidas;
    if (faltam <= 0) return botao('Encerrar envios', 'encerrar');
    if (!pedindoEncerrar) return h('button', { class: 'botao', type: 'button', text: 'Encerrar envios (faltam ' + faltam + ')', onclick: function () { pedindoEncerrar = true; desenhar(); } });
    return [h('p', { class: 'aviso atencao', role: 'status', text: 'Ainda faltam ' + faltam + (faltam === 1 ? ' equipe' : ' equipes') + ' sem resposta. Quem não enviou fica com 0 pontos nesta rodada.' }),
      botao('Confirmar: encerrar mesmo assim', 'encerrar', null, 'perigo'),
      h('button', { class: 'botao secundario', type: 'button', text: 'Voltar', onclick: function () { pedindoEncerrar = false; desenhar(); } })];
  }

  function blocoEtapa(e) {
    var id = e.etapa.id, fase = e.etapa.fase, r = e.rodada;
    var nos = [h('p', { class: 'rotulo-etapa', text: EL.NOMES_ETAPA[id] + (fase ? ' · ' + { preparo: 'aguardando abertura', aberta: 'envios abertos', encerrada: 'envios encerrados', revelada: 'devolutiva na tela' }[fase] : '') })];
    var erro = h('div', { role: 'alert' }); if (erroAcao) erro.appendChild(h('p', { class: 'aviso erro', text: erroAcao }));
    var iProx = ['abertura', 'r1', 'r2', 'r3'].indexOf(id);
    var proxima = iProx >= 0 ? e.rodadas[iProx] : null;
    var rotuloAvancar = proxima ? 'Ir para: ' + proxima.titulo : id === 'r4' ? 'Ir para o placar final' : 'Ir para o fechamento';

    if (id === 'abertura') {
      var s = e.slides[e.slide];
      nos.push(h('h1', { text: 'Painel de contexto e resultados' }), h('p', { class: 'apoio', text: 'Previsto: ' + e.painelDuracaoMin + ' min. As equipes podem entrar durante toda a abertura.' }),
        h('p', null, h('strong', { text: 'Na projeção agora: ' }), 'slide ' + (e.slide + 1) + ' de ' + e.slides.length + ' — ' + s.titulo),
        h('div', { class: 'notas' }, h('strong', { text: 'Notas de fala (privadas)' }), s.notasModerador),
        s.pontos ? h('ul', null, s.pontos.map(function (p) { return h('li', { text: p }); })) : null,
        s.marcos ? h('ul', null, s.marcos.map(function (m) { return h('li', null, h('strong', { text: nomeInst(m.instituicao) + ' (' + m.situacao + '): ' }), m.fato + ' ' + m.importancia); })) : null,
        erro,
        h('div', { class: 'linha-botoes' },
          h('button', { class: 'botao secundario', type: 'button', disabled: e.slide === 0, text: '← Slide anterior', onclick: function () { acao('slide', { indice: e.slide - 1 }); } }),
          e.slide < e.slides.length - 1 ? h('button', { class: 'botao', type: 'button', text: 'Próximo slide →', onclick: function () { acao('slide', { indice: e.slide + 1 }); } }) : botao(rotuloAvancar + ' →', 'avancar')));
    } else if (r) {
      nos.push(h('h1', { text: r.titulo }), h('p', { text: r.instrucao }), h('p', { class: 'regra', text: r.regraPontuacao }));
      nos.push(h('div', { class: 'notas' }, h('strong', { text: 'Instruções de mediação (privadas)' }), e.notas));
      if (fase === 'preparo') {
        nos.push(enunciadoResumo(r), erro, h('div', { class: 'linha-botoes' }, botao('Abrir rodada', 'abrir'),
          pedindoPular ? botao('Confirmar: pular esta rodada', 'avancar', { pular: true }, 'perigo') : h('button', { class: 'botao discreto', type: 'button', text: 'Pular rodada', onclick: function () { pedindoPular = true; desenhar(); } })));
      } else if (fase === 'aberta') {
        nos.push(h('p', { role: 'timer' }, 'Tempo de rodada: ', h('span', { class: 'relogio', id: 'relogio', text: '0:00' }), ' · previsto para a rodada inteira: ' + r.duracaoMin + ' min (inclui devolutiva)'),
          justificativas(e), erro, h('div', { class: 'linha-botoes' }, botaoEncerrar(e)),
          h('p', { class: 'apoio', text: 'O encerramento é seu: não há corte automático por tempo.' }), gabarito(e));
      } else if (fase === 'encerrada') {
        nos.push(justificativas(e), erro, h('div', { class: 'linha-botoes' }, botao('Revelar devolutiva', 'revelar'), botao('Reabrir envios', 'reabrir', null, 'secundario')), gabarito(e));
      } else {
        var n = r.tipo === 'associacao' ? r.itens.length : r.tipo === 'quiz' ? r.questoes.length : 1;
        nos.push(n > 1 ? h('p', null, h('strong', { text: 'Na projeção agora: ' }), 'item ' + (e.item + 1) + ' de ' + n) : null, erro,
          h('div', { class: 'linha-botoes' },
            n > 1 ? h('button', { class: 'botao secundario', type: 'button', disabled: e.item === 0, text: '← Item anterior', onclick: function () { acao('item', { indice: e.item - 1 }); } }) : null,
            n > 1 && e.item < n - 1 ? h('button', { class: 'botao', type: 'button', text: 'Próximo item →', onclick: function () { acao('item', { indice: e.item + 1 }); } }) : botao(rotuloAvancar + ' →', 'avancar')),
          h('div', { class: 'linha-botoes', style: 'margin-top:10px' }, e.parcialNaTela
            ? h('button', { class: 'botao secundario', type: 'button', text: 'Voltar à devolutiva na projeção', onclick: function () { acao('parcial', { mostrar: false }); } })
            : h('button', { class: 'botao secundario', type: 'button', text: 'Mostrar placar parcial na projeção', onclick: function () { acao('parcial', { mostrar: true }); } })),
          e.parcialNaTela ? h('p', { class: 'aviso ok', role: 'status', text: 'O placar parcial está na projeção e nos celulares.' }) : null,
          n > 1 && e.item < n - 1 ? h('p', null, h('button', { class: 'botao discreto', type: 'button', text: rotuloAvancar + ' sem passar pelos demais itens', onclick: function () { acao('avancar'); } })) : null,
          justificativas(e), gabarito(e));
      }
    } else {
      var dz = e.desempate, aberto = dz && dz.fase === 'aberta';
      nos.push(h('h1', { text: id === 'placar' ? 'Placar final' : 'Fechamento' }),
        h('div', { class: 'notas' }, h('strong', { text: 'Notas de fala (privadas)' }), e.fechamentoPrevio.notasModerador),
        id === 'fechamento' ? h('p', { class: 'pergunta-final', style: 'font-size:1.4rem', text: e.fechamentoPrevio.pergunta }) : null);
      if (id === 'placar') {
        // desempate
        if (e.temDesempate && !dz && e.reveladas === 0 && e.empatePodio.length) nos.push(h('div', { class: 'privado' }, h('strong', { text: 'Empate no pódio' }),
          h('p', { text: 'Equipes empatadas entre as três primeiras posições: ' + e.empatePodio.join(', ') + '.' }),
          h('p', { class: 'apoio', text: 'Pergunta de desempate: ' + e.desempatePrivado.pergunta + ' Resposta: ' + e.desempatePrivado.resposta + '. ' + e.desempatePrivado.referencia }),
          h('div', { class: 'linha-botoes' }, botao('Abrir desempate', 'desempate_abrir', null, 'secundario')),
          h('p', { class: 'apoio', text: 'Opcional. Sem desempate, as equipes dividem a posição. Depois de iniciar a revelação do placar, não é mais possível desempatar.' })));
        if (dz) nos.push(h('div', { class: 'privado' }, h('strong', { text: aberto ? 'Desempate aberto' : 'Desempate encerrado' }),
          h('p', { text: dz.pergunta }),
          h('p', { role: 'status' }, aberto ? h('strong', { text: dz.recebidos + ' de ' + dz.equipes.length + ' palpites recebidos.' }) : h('strong', { text: 'Resposta: ' + dz.resposta + '.' })),
          aberto ? h('p', { class: 'apoio', text: 'Resposta (só nesta tela): ' + e.desempatePrivado.resposta + '. Participam: ' + dz.equipes.join(', ') + '.' })
            : h('ul', null, dz.palpites.map(function (x) { return h('li', { text: x.nome + ': ' + (x.palpite === null ? 'sem palpite' : x.palpite) }); })),
          aberto ? h('div', { class: 'linha-botoes' }, botao('Encerrar desempate', 'desempate_encerrar')) : null));
        nos.push(h('p', { role: 'status' }, h('strong', { text: 'Na projeção: ' }), e.placarCompleto ? 'placar completo.' : e.reveladas + ' de ' + e.placar.length + ' equipes reveladas (do último ao primeiro).'));
      }
      nos.push(h('table', { class: 'placar' }, h('caption', { class: 'oculto-visual', text: 'Placar completo, visão privada do moderador' }),
          h('thead', null, h('tr', null, h('th', { scope: 'col', text: 'Pos.' }), h('th', { scope: 'col', text: 'Equipe' }), e.rodadas.map(function (x, k) { return h('th', { scope: 'col', class: 'n', title: x.titulo, text: 'R' + (k + 1) }); }), h('th', { scope: 'col', class: 'n', text: 'Total' }), h('th', { scope: 'col', text: 'Selos' }))),
          h('tbody', null, e.placar.map(function (l) { return h('tr', null, h('td', { class: 'pos', text: EL.posicao(l.posicao) }), h('td', { text: l.nome }), e.rodadas.map(function (x) { return h('td', { class: 'n', text: String(l.porRodada[x.id] || 0) }); }), h('td', { class: 'n' }, h('strong', { text: String(l.total) })), h('td', { text: l.selos.map(function (s) { return e.nomesSelos[s]; }).join(', ') || '—' })); }))),
        erro);
      if (id === 'placar') nos.push(h('div', { class: 'linha-botoes', style: 'margin-top:14px' },
        !e.placarCompleto ? h('button', { class: 'botao', type: 'button', disabled: aberto, text: 'Revelar próxima posição', onclick: function () { acao('revelar_posicao'); } }) : null,
        !e.placarCompleto ? h('button', { class: 'botao secundario', type: 'button', disabled: aberto, text: 'Revelar tudo de uma vez', onclick: function () { acao('revelar_tudo'); } }) : null,
        e.placarCompleto ? botao('Ir para o fechamento →', 'avancar') : null),
        e.placarCompleto ? null : h('p', null, h('button', { class: 'botao discreto', type: 'button', disabled: aberto, text: 'Ir para o fechamento sem revelar posição por posição', onclick: function () { acao('avancar'); } })));
      else nos.push(h('p', { class: 'aviso ok', style: 'margin-top:14px', text: 'Última etapa. A sala permanece disponível até expirar por inatividade.' }));
    }
    return h('section', { class: 'cartao' }, nos);
  }

  function desenhar() {
    var e = estado; if (!e) return;
    var rolagem = window.scrollY;
    var ativo = document.activeElement && document.activeElement.textContent;
    moldura(h('div', { class: 'mod-grade' },
      h('div', null, blocoSala(e), blocoEquipes(e), blocoRoteiro(e),
        h('p', null, h('button', { class: 'botao discreto', type: 'button', text: 'Sair desta sala neste navegador', onclick: function () {
          if (this.getAttribute('data-ok')) return encerrarSessao('Você saiu da sala. Ela continua no servidor até expirar, mas a credencial foi apagada deste navegador.');
          this.setAttribute('data-ok', '1'); this.textContent = 'Clique de novo para confirmar (a credencial será apagada)';
        } }))),
      h('div', null, blocoEtapa(e))), true);
    window.scrollTo(0, rolagem);
    if (ativo) { var bs = app.querySelectorAll('button'); for (var i = 0; i < bs.length; i++) if (bs[i].textContent === ativo && !bs[i].disabled) { bs[i].focus({ preventScroll: true }); break; } }
    atualizarRelogio();
  }
  function atualizarRelogio() {
    var el = document.getElementById('relogio');
    if (el && estado && estado.abertaEm) el.textContent = minutos(Date.now() + desvio - estado.abertaEm);
  }

  function receber(d, forcar) {
    var voltou = semConexao; semConexao = false; estado = d; desvio = d.agora - Date.now();
    if (forcar || voltou || d.rev !== ultimaRev) { ultimaRev = d.rev; desenhar(); }
  }

  function iniciar() {
    ultimaRev = -1;
    moldura(h('p', { role: 'status', text: 'Conectando à sala…' }));
    sonda = EL.sondar(function () { return EL.api('GET', '/api/salas/' + sessao.sala + '/estado', { token: sessao.token }); }, function (d) { receber(d, false); },
      function (e) {
        if (e.status === 401 || e.status === 404) return encerrarSessao('A sala expirou ou o servidor foi reiniciado. Crie uma nova sala.');
        if (!semConexao) { semConexao = true; if (estado) desenhar(); }
      }, 1500);
    clearInterval(relogio); relogio = setInterval(atualizarRelogio, 1000);
  }

  if (sessao && sessao.token) iniciar(); else telaCriar();
})();
