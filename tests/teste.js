const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const REPO = path.join(__dirname, '..');
let html = fs.readFileSync(path.join(REPO, 'index.html'), 'utf8');

// Remove o módulo nuvem.js (Firebase real) e o service worker: este teste é só da UI/render, offline.
html = html.replace(/<script type="module" src="nuvem\.js"[^>]*><\/script>/, '');
html = html.replace(/<script>if\('serviceWorker'[\s\S]*?<\/script>/, '');
// Sortable vem de CDN (sem rede aqui): troca por um stub que não faz nada, só não pode quebrar as chamadas.
html = html.replace(
  '<script src="https://cdnjs.cloudflare.com/ajax/libs/Sortable/1.15.2/Sortable.min.js"></script>',
  '<script>window.Sortable={create:()=>({})}</script>'
);
// Top-level const/let de dentro do <script> principal não viram propriedades de window;
// expõe o que o teste precisa através de um <script> extra logo depois (mesmo escopo global).
html = html.replace(
  '</body>',
  '<script>window.__t={render,listas,lixeira,pintarLixeira,montar,resumo};</script></body>'
);

const { VirtualConsole } = require('jsdom');
const vc = new VirtualConsole();
vc.on('jsdomError', (e) => { console.error('JSDOM ERROR:', e.message); if (e.detail) console.error(e.detail); });
vc.on('error', (...a) => console.error('CONSOLE ERROR:', ...a));

const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://glaubersooon.github.io/app-lista-feira/', virtualConsole: vc });
const { window } = dom;
window.matchMedia = window.matchMedia || (() => ({ matches: false, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){} }));
window.prompt = () => '1862'; // simula digitar a senha certa quando testado
window.navigator.standalone = false;

function esperar(cond, tentativas = 50) {
  return new Promise((resolve, reject) => {
    const tick = () => {
      if (cond()) return resolve();
      if (--tentativas <= 0) return reject(new Error('timeout esperando condição'));
      setTimeout(tick, 20);
    };
    tick();
  });
}

(async () => {
  const erros = [];
  window.addEventListener('error', e => erros.push(e.error || e.message));

  await esperar(() => typeof window.__t !== 'undefined' && typeof window.__t.render === 'function');
  const t = window.__t;

  // Dados de exemplo, cobrindo: lista fixa, lista comum (não-fixa), lista min:true, nomes grandes.
  t.listas.length = 0;
  t.listas.push(
    { id: 'feira', nome: 'Feira', cor: 'feira', fixa: true, itens: [
      { id: 'i1', n: 'Alho', e: '', det: '', off: false },
      { id: 'i2', n: 'Cebola roxa', e: '', det: '', off: true },
    ]},
    { id: 'jorge', nome: 'Sr. Jorge', cor: 'jorge', fixa: true, itens: [
      { id: 'i3', n: 'Tomate', e: '', det: '', off: false },
    ]},
    { id: 'umb', nome: 'Umbanda', cor: 'umb', min: true, itens: [
      { id: 'i4', n: 'Vela', e: '', det: '', off: false },
      { id: 'i5', n: 'Flor', e: '', det: '', off: false },
      { id: 'i6', n: 'Fumo', e: '', det: '', off: false },
    ]},
    { id: 'merc', nome: 'Mercado', cor: 'extra', min: true, itens: Array.from({length: 51}, (_, k) => ({ id: 'm'+k, n: 'Item '+k, e: '', det: '', off: false })) },
    { id: 'grande', nome: 'Lista de compras para o mês inteiro do ano todo', cor: 'extra', fixa: false, itens: [
      { id: 'i7', n: 'Item com nome bem grande para testar a quebra de linha e reticências', e: '', det: '', off: false },
    ]},
  );

  t.lixeira.length = 0;
  t.lixeira.push(
    { id: 'x1', n: 'Teste', e: '🍅', det: '', off: false, del: true, delEm: Date.now(), delLista: 'grande', delListaNome: 'Lista de Feira Priscila' },
    { id: 'x2', n: 'Pastel', e: '', det: '', off: false, del: true, delEm: Date.now(), delLista: 'feira', delListaNome: 'Feira' },
  );

  t.render();
  t.pintarLixeira();
  t.resumo();

  // Checagens estruturais
  const doc = window.document;
  const cols = doc.querySelectorAll('.col');
  const quadros = doc.querySelectorAll('.quadro');
  const xlistaBtns = doc.querySelectorAll('.xlista');
  const h2s = [...doc.querySelectorAll('.quadro-topo h2')];
  const lixItens = doc.querySelectorAll('.lix-item');
  const lixTopos = doc.querySelectorAll('.lix-item .lix-topo');
  const headerIcon = doc.querySelector('header img[src="icone-192.png"]');
  const instalarLinha = doc.querySelector('#instalarLinha');
  const vaiHTML = doc.querySelector('#vai').innerHTML;

  console.log('Colunas geradas:', cols.length);
  console.log('Cards de lista:', quadros.length, '(esperado 5 listas)');
  console.log('Botões ✕ de excluir lista (deve ser 0, removido no item 9):', xlistaBtns.length);
  console.log('Nomes de lista renderizados:', h2s.map(h => h.textContent));
  console.log('Itens na lixeira:', lixItens.length, '| com .lix-topo:', lixTopos.length);
  console.log('Ícone do app no topo da página presente:', !!headerIcon);
  console.log('Botão de instalar app presente (oculto por padrão):', !!instalarLinha, instalarLinha && instalarLinha.hidden);
  console.log('Texto da faixa de impressão (.vai):', vaiHTML);
  console.log('Erros de execução capturados:', erros.length);
  erros.forEach(e => console.log('  ERRO:', e && e.stack || e));

  if (xlistaBtns.length !== 0) throw new Error('botão .xlista ainda presente');
  if (quadros.length !== 5) throw new Error('quantidade de cards inesperada');
  if (lixItens.length !== 2 || lixTopos.length !== 2) throw new Error('lixeira não renderizou como esperado');
  if (!headerIcon) throw new Error('ícone do app não aparece no topo da página');
  if (!instalarLinha || !instalarLinha.hidden) throw new Error('botão de instalar deveria existir e começar oculto');
  if ((vaiHTML.match(/<b>/g) || []).length !== 3) throw new Error('resumo() deveria ter um <b> por nome de lista (3 listas ativas: feira, jorge, grande)');
  if (erros.length) throw new Error('houve erro de execução durante render/pintarLixeira/resumo');
  // pintarLixeira() acima deixou o #modal aberto (é o que ela faz de verdade); fecha para simular o estado
  // normal da página (nada aberto ainda) antes de seguir com os próximos testes.
  doc.querySelector('#modal').hidden = true;

  // Testa o menu de contexto do topo da lista (item 4 do novo pedido): botão direito agora só abre um MENU pequeno
  // (não mais a confirmação direto). Só clicando em "Excluir lista" no menu é que abre o modal de fato.
  const quadroGrande = [...quadros].find(q => q.dataset.lista === 'grande');
  const topoGrande = quadroGrande.querySelector('.quadro-topo');
  topoGrande.dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }));

  const menuLista = doc.querySelector('#menuItem');
  console.log('Menu pequeno (não a confirmação) apareceu ao clicar com botão direito no topo da lista:', !!menuLista);
  if (!menuLista) throw new Error('right-click no topo da lista não abriu o menu pequeno');
  const modalAindaFechado = doc.querySelector('#modal');
  if (!modalAindaFechado.hidden) throw new Error('a confirmação de excluir não deveria abrir só com o right-click, antes de escolher no menu');
  const btnExcluirNoMenu = menuLista.querySelector('[data-menu="xlistadireto"]');
  if (!btnExcluirNoMenu) throw new Error('menu do topo da lista não tem a opção de excluir');
  btnExcluirNoMenu.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

  const modal = doc.querySelector('#modal');
  const caixaExcluir = modal.querySelector('.caixa-modal[aria-label="Excluir lista"]');
  console.log('Modal de confirmação de excluir lista apareceu ao clicar em "Excluir lista" no menu:', !!caixaExcluir, '| #modal.hidden:', modal.hidden);
  if (!caixaExcluir || modal.hidden) throw new Error('clicar em "Excluir lista" no menu não abriu o modal de excluir');
  const alertaNoCard = quadroGrande.querySelector('.alerta');
  if (alertaNoCard) throw new Error('a confirmação de excluir ainda aparece embutida no card (deveria estar só no modal)');

  // Confirma a exclusão pelo botão do modal e checa que a lista some e os itens vão para a lixeira.
  const btnSim = modal.querySelector('[data-xlista-sim]');
  btnSim.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  const modalDepois = doc.querySelector('#modal');
  const quadrosDepois = doc.querySelectorAll('.quadro');
  console.log('Modal fechou após confirmar exclusão:', modalDepois.hidden, '| cards restantes:', quadrosDepois.length, '| itens na lixeira agora (array):', t.lixeira.length);
  if (!modalDepois.hidden) throw new Error('modal deveria fechar depois de excluir a lista');
  if (quadrosDepois.length !== 4) throw new Error('lista não foi removida do grid após confirmar exclusão');
  if (t.lixeira.length !== 3) throw new Error('item da lista excluída não foi para a lixeira');
  if (erros.length) throw new Error('excluir lista pelo modal gerou erro de execução');

  // Testa o Restaurar sem nenhuma versão finalizada ainda: deve cair no padrão (Feira/Sr.Jorge ativas,
  // Umbanda/Mercado desativadas, tudo por comprar), em vez do beco-sem-saída "ainda não existe versão".
  doc.querySelector('[data-restaurar]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  const modalRestaurar = doc.querySelector('#modal');
  const temPadrao = /padrão/i.test(modalRestaurar.textContent);
  console.log('Modal de Restaurar (sem versão finalizada) oferece o padrão em vez de travar:', temPadrao);
  if (modalRestaurar.hidden || !temPadrao) throw new Error('Restaurar sem versão finalizada deveria oferecer o estado padrão');
  const btnRestaurarSim = modalRestaurar.querySelector('[data-restaurar-sim]');
  if (!btnRestaurarSim) throw new Error('modal de Restaurar não tem o botão de confirmar');
  btnRestaurarSim.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  if (!doc.querySelector('#modal').hidden) throw new Error('modal deveria fechar depois de restaurar o padrão');
  const feiraDepoisRestaurar = t.listas.find(l => l.id === 'feira');
  const umbDepoisRestaurar = t.listas.find(l => l.id === 'umb');
  if (!feiraDepoisRestaurar || feiraDepoisRestaurar.min) throw new Error('Feira deveria estar ativa depois de restaurar o padrão');
  if (!umbDepoisRestaurar || !umbDepoisRestaurar.min) throw new Error('Umbanda deveria estar desativada depois de restaurar o padrão');
  if (feiraDepoisRestaurar.itens.some(i => i.off)) throw new Error('itens da Feira deveriam voltar todos como "por comprar" no padrão');
  if (erros.length) throw new Error('restaurar o padrão gerou erro de execução');

  // Testa o novo botão "Salvar" no rodapé: deve pedir confirmação antes de gravar o estado.
  const btnSalvar = doc.querySelector('[data-salvar-lista]');
  console.log('Botão Salvar existe no rodapé:', !!btnSalvar);
  if (!btnSalvar) throw new Error('botão de Salvar não existe no rodapé');
  btnSalvar.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  const modalSalvar = doc.querySelector('#modal');
  const caixaSalvar = modalSalvar.querySelector('.caixa-modal[aria-label="Salvar"]');
  if (!caixaSalvar || modalSalvar.hidden) throw new Error('botão Salvar não abriu a confirmação');
  const btnSalvarSim = modalSalvar.querySelector('[data-salvar-sim]');
  if (!btnSalvarSim) throw new Error('confirmação de Salvar não tem o botão "Ok, salvar"');
  btnSalvarSim.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  if (!doc.querySelector('#modal').hidden) throw new Error('modal deveria fechar depois de confirmar o Salvar');
  if (erros.length) throw new Error('salvar pelo rodapé gerou erro de execução');

  // Testa abrir/fechar uma lista pelo botão ativar/desativar. O jsdom não tem Element.animate de verdade
  // (a suavidade em si só o teste ao vivo garante), então usamos um stub que dispara onfinish na hora,
  // simulando a animação já concluída, para poder testar o resultado final (estado + DOM) de qualquer jeito.
  window.HTMLElement.prototype.animate = function () {
    const o = {};
    Object.defineProperty(o, 'onfinish', { set(fn) { if (fn) fn() } });
    return o;
  };
  const quadroUmb = doc.querySelector('.quadro[data-lista="umb"]');
  const btnAtivarUmb = quadroUmb && quadroUmb.querySelector('[data-min]');
  if (!btnAtivarUmb) throw new Error('não achei o botão de ativar a lista Umbanda');
  btnAtivarUmb.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  const umbDepoisAbrir = t.listas.find(l => l.id === 'umb');
  const quadroUmbDepois = doc.querySelector('.quadro[data-lista="umb"]');
  console.log('Umbanda ficou ativa depois de abrir pelo botão:', umbDepoisAbrir && !umbDepoisAbrir.min, '| tem .corpo no DOM:', !!(quadroUmbDepois && quadroUmbDepois.querySelector('.corpo')));
  if (!umbDepoisAbrir || umbDepoisAbrir.min) throw new Error('Umbanda deveria ficar ativa depois de clicar em "Ativar lista"');
  if (!quadroUmbDepois || !quadroUmbDepois.querySelector('.corpo')) throw new Error('depois de abrir, a lista deveria ter o corpo com os itens no DOM');
  if (erros.length) throw new Error('abrir uma lista desativada gerou erro de execução');
  // E fechar de novo, pra checar que o caminho de fechar continua funcionando depois da mudança.
  const btnDesativarUmb = quadroUmbDepois.querySelector('[data-min]');
  btnDesativarUmb.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  const umbDepoisFechar = t.listas.find(l => l.id === 'umb');
  console.log('Umbanda ficou desativada de novo depois de fechar pelo botão:', umbDepoisFechar && umbDepoisFechar.min);
  if (!umbDepoisFechar || !umbDepoisFechar.min) throw new Error('Umbanda deveria voltar a ficar desativada depois de clicar em "Desativar lista"');
  if (erros.length) throw new Error('fechar uma lista ativa gerou erro de execução');

  // Testa o menu de contexto do topo da página (item 3: derrubar todos).
  const header = doc.querySelector('header');
  header.dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }));
  const menuTopo = doc.querySelector('#menuItem');
  console.log('Menu "derrubar" apareceu ao clicar com botão direito no topo da página:', !!menuTopo);
  if (!menuTopo) throw new Error('right-click no header não abriu o menu de derrubar');

  // Clica no botão "derrubar" do menu (sem window.nuvem carregado, e com senha certa via prompt stub).
  const btnDerrubar = menuTopo.querySelector('[data-menu="derrubar"]');
  btnDerrubar.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  console.log('Clique em "derrubar" (senha certa) não quebrou o app (sem nuvem carregada):', erros.length === 0);
  if (erros.length) throw new Error('clique em derrubar gerou erro');

  // Testa o balão de tutorial: primeiro clique num item deve criar o balão.
  const primeiroItem = doc.querySelector('.itens .item .nome');
  if (primeiroItem) {
    primeiroItem.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    const balao = doc.querySelector('.balao-tutorial');
    console.log('Balão de tutorial apareceu no primeiro clique num item:', !!balao);
    if (!balao) throw new Error('balão de tutorial não apareceu ao clicar num item pela primeira vez');
    balao.querySelector('.ok-tutorial').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    if (doc.querySelector('.balao-tutorial')) throw new Error('balão de tutorial não fechou ao clicar em "Entendi"');
    // Segundo clique não deve reabrir (localStorage já marcado).
    primeiroItem.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    if (doc.querySelector('.balao-tutorial')) throw new Error('balão de tutorial reapareceu numa segunda interação (deveria ser só uma vez)');
  }
  if (erros.length) throw new Error('tutorial de arrastar gerou erro de execução');

  console.log('\nTUDO OK');
  process.exit(0);
})().catch(e => { console.error('FALHOU:', e); process.exit(1); });
