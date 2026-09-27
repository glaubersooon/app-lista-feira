// Sincronização com o Firebase (Firestore): dados, presença e versão finalizada.
// Usa as variáveis e funções globais do index.html: listas, lixeira, finalizada, regraDia,
// editandoIds, SEMENTE, render, aviso, mostrarMsg, ocupado, $.
import {initializeApp} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import {initializeFirestore,persistentLocalCache,persistentMultipleTabManager,collection,doc,onSnapshot,writeBatch,setDoc,deleteDoc,serverTimestamp} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';

const cfg={apiKey:'AIzaSyAiRjh8D0W2N5ojz5jKK35w-m10bDZFZGg',authDomain:'app-lista-feira.firebaseapp.com',projectId:'app-lista-feira',storageBucket:'app-lista-feira.firebasestorage.app',messagingSenderId:'1087885390895',appId:'1:1087885390895:web:b6586d26d991cbbdac02da'};

// O código de acesso vem do link (#c=... ou ?c=...) e fica guardado no aparelho,
// para o ícone da tela inicial abrir sem o código. Ele NÃO fica no código-fonte (repositório público).
function lerCodigo(){
  const h=new URLSearchParams(location.hash.slice(1)),q=new URLSearchParams(location.search);
  let c=h.get('c')||q.get('c');
  try{if(c)localStorage.setItem('codigo-compras',c);else c=localStorage.getItem('codigo-compras')}catch(e){}
  return c&&/^[A-Za-z0-9_-]{20,}$/.test(c)?c:null}
const CODIGO=lerCodigo();
const MODO_TESTE=/[?&]teste=1(&|$)/.test(location.search+location.hash);
window.MODO_TESTE=MODO_TESTE;

if(!CODIGO){mostrarMsg('Abra a lista pelo link do e-mail.<br>Esse link tem o código de acesso.')}
else iniciar();

function iniciar(){
  const app=initializeApp(cfg);
  let db;
  try{db=initializeFirestore(app,{localCache:persistentLocalCache({tabManager:persistentMultipleTabManager()})})}
  catch(e){db=initializeFirestore(app,{})}
  const base=['acesso',CODIGO];
  const colL=collection(db,...base,'listas'),colI=collection(db,...base,'itens'),colP=collection(db,...base,'presenca');
  const refFin=doc(db,...base,'estado','finalizada');
  const refRegraDia=doc(db,...base,'estado','regraDia');
  const refSessao=doc(db,...base,'estado','sessao');

  const dL=new Map(),dI=new Map();
  let okL=false,okI=false,servidorL=false,semeado=false,aplicando=false,pendRender=false,bloqueado=false;

  const erro=e=>{console.error(e);
    if(e&&e.code==='permission-denied')mostrarMsg('Este link não tem acesso à lista.<br>Abra de novo pelo link do e-mail.');
    else aviso('Sem conexão com a nuvem. As mudanças ficam guardadas e sobem quando a internet voltar.')};

  // ---- Dados: do Firestore para a tela ----
  function reconstruir(){
    if(!okL||!okI)return;
    if(!dL.size&&!servidorL)return; // aparelho novo sem nada guardado: espera o servidor
    const ls=[...dL].map(([id,d])=>({id,nome:d.nome||'Lista',cor:d.cor||'extra',min:!!d.min,tudo:!!d.tudo,org:!!d.org,fixa:!!d.fixa,_p:d.pos??0,itens:[]}))
      .sort((a,b)=>a._p-b._p||a.id.localeCompare(b.id));
    const porId=new Map(ls.map(l=>[l.id,l])),lix=[];
    [...dI].sort((a,b)=>(a[1].pos??0)-(b[1].pos??0)||(b[1].criado??0)-(a[1].criado??0)).forEach(([id,d])=>{
      const i={id,n:d.n||'',e:d.e||'',det:d.det||'',off:!!d.off};
      if(d.del){Object.assign(i,{del:true,delEm:d.delEm||0,delLista:d.delLista||d.lista,delListaNome:d.delListaNome||''});lix.push(i);return}
      const l=porId.get(d.lista)||ls[0];if(l)l.itens.push(i)});
    ls.forEach(l=>delete l._p);
    listas.length=0;listas.push(...ls);lixeira.length=0;lixeira.push(...lix);
    desenhar()}

  function desenhar(){
    if(bloqueado)return;
    if(ocupado()){pendRender=true;return}
    pendRender=false;aplicando=true;
    try{render();if(!$('#modal').hidden&&$('#modal [aria-label="Lixeira"]'))pintarLixeira()}finally{aplicando=false}}
  setInterval(()=>{if(pendRender&&!ocupado())desenhar()},1200);

  onSnapshot(colL,{includeMetadataChanges:false},s=>{
    s.docChanges().forEach(c=>{if(c.type==='removed')dL.delete(c.doc.id);else dL.set(c.doc.id,c.doc.data())});
    okL=true;if(!s.metadata.fromCache)servidorL=true;
    if(servidorL&&!dL.size&&!semeado){semear();return}
    reconstruir()},erro);
  onSnapshot(colI,s=>{
    s.docChanges().forEach(c=>{if(c.type==='removed')dI.delete(c.doc.id);else dI.set(c.doc.id,c.doc.data())});
    okI=true;reconstruir()},erro);
  onSnapshot(refFin,s=>{finalizada=s.exists()?s.data({serverTimestamps:'estimate'}):null},()=>{});
  onSnapshot(refRegraDia,s=>{regraDia=s.exists()?s.data():null},()=>{});

  // Primeira vez: grava as listas iniciais (ids fixos, então dois aparelhos ao mesmo tempo não duplicam)
  function semear(){
    semeado=true;const b=writeBatch(db),agora=Date.now();
    SEMENTE.forEach((l,li)=>{
      b.set(doc(colL,l.id),{nome:l.nome,cor:l.cor,min:!!l.min,tudo:false,org:false,fixa:!!l.fixa,pos:li});
      l.itens.forEach((i,ii)=>b.set(doc(colI,i.id),{n:i.n,e:i.e||'',det:'',off:false,lista:l.id,pos:ii,del:false,criado:agora}))});
    b.commit().catch(erro)}

  // ---- Dados: da tela para o Firestore (grava só o que mudou) ----
  const KI=['n','e','det','off','lista','pos','del','delEm','delLista','delListaNome'];
  const campoL=(l,pos)=>({nome:l.nome,cor:l.cor||'extra',min:!!l.min,tudo:!!l.tudo,org:!!l.org,fixa:!!l.fixa,pos});
  const campoI=(i,lista,pos,del)=>del
    ?{n:i.n,e:i.e||'',det:i.det||'',off:!!i.off,lista,pos,del:true,delEm:i.delEm||Date.now(),delLista:i.delLista||lista,delListaNome:i.delListaNome||''}
    :{n:i.n,e:i.e||'',det:i.det||'',off:!!i.off,lista,pos,del:false};
  const igual=(a,d,ks)=>!!d&&ks.every(k=>(a[k]??null)===(d[k]??null));

  function salvar(){
    if(MODO_TESTE)return;
    if(aplicando||!okL||!okI||!servidorL&&!dL.size)return;
    const b=writeBatch(db),agora=Date.now(),vistas=new Set();let n=0;
    const gravaI=(i,lista,pos,del)=>{const a=campoI(i,lista,pos,del),d=dI.get(i.id);
      if(!igual(a,d,KI)){b.set(doc(colI,i.id),{...a,criado:d?.criado??agora});n++}};
    listas.forEach((l,li)=>{vistas.add(l.id);const a=campoL(l,li);
      if(!igual(a,dL.get(l.id),Object.keys(a))){b.set(doc(colL,l.id),a);n++}
      l.itens.forEach((i,ii)=>gravaI(i,l.id,ii,false))});
    lixeira.forEach((i,ii)=>gravaI(i,i.delLista,ii,true));
    dL.forEach((_,id)=>{if(!vistas.has(id)){b.delete(doc(colL,id));n++}}); // lista excluída (os itens já foram para a lixeira)
    if(n)b.commit().catch(erro)}

  // ---- Presença: quem está com o app aberto e qual item está mexendo ----
  const SID=Math.random().toString(36).slice(2)+Date.now().toString(36);
  let meuEd=null;const pres=new Map();
  // Derrubar todos: ignora o valor que já existia ao conectar (não é um "derrubar" acontecendo agora,
  // é histórico) e nunca desconecta quem mandou o derrubar (compara pelo SID de quem gravou).
  let sessaoPrimeira=true;
  onSnapshot(refSessao,s=>{
    const era=sessaoPrimeira;sessaoPrimeira=false;
    if(era||bloqueado||!s.exists())return;
    const d=s.data();
    if(d.por!==SID){bloqueado=true;mostrarMsg('Você foi desconectado.<br>Peça o link por e-mail para entrar de novo.')}
  },()=>{});
  const pulso=()=>{if(MODO_TESTE)return;setDoc(doc(colP,SID),{visto:serverTimestamp(),editando:meuEd}).catch(()=>{})};
  pulso();setInterval(pulso,20000);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')pulso()});
  addEventListener('pagehide',()=>{deleteDoc(doc(colP,SID)).catch(()=>{})});
  onSnapshot(colP,s=>{s.docChanges().forEach(c=>{if(c.type==='removed')pres.delete(c.doc.id);else pres.set(c.doc.id,c.doc.data({serverTimestamps:'estimate'}))});avaliar()},()=>{});
  setInterval(avaliar,10000);
  function avaliar(){
    const agora=Date.now(),ms=d=>d.visto&&d.visto.toMillis?d.visto.toMillis():agora;
    const ativos=[...pres].filter(([id,d])=>id!==SID&&agora-ms(d)<75000);
    $('#presenca').hidden=!ativos.length;
    const ed=new Set(ativos.map(([,d])=>d.editando).filter(Boolean));
    if(ed.size!==editandoIds.size||[...ed].some(x=>!editandoIds.has(x))){editandoIds=ed;if(okL&&okI)desenhar()}
    pres.forEach((d,id)=>{if(id!==SID&&agora-ms(d)>3600000)deleteDoc(doc(colP,id)).catch(()=>{})})}

  window.nuvem={
    salvar,
    editando(id){if((id||null)===meuEd)return;meuEd=id||null;pulso()},
    finalizar(estado){if(MODO_TESTE)return;setDoc(refFin,{...estado,em:serverTimestamp()}).catch(erro)},
    marcarRegraDia(data){if(MODO_TESTE)return;setDoc(refRegraDia,{data,em:serverTimestamp()}).catch(erro)},
    derrubar(){if(MODO_TESTE)return;setDoc(refSessao,{em:serverTimestamp(),por:SID}).catch(erro)}
  };
}
