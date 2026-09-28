# Testes

`teste.js` é um smoke test automatizado (jsdom) do `index.html`: carrega a página fora do navegador, simula alguns dados e cliques, e confere se a UI se comporta como esperado (sem tocar no Firebase de verdade).

Rodar antes de cada push:

```
npm install   # só na primeira vez (ou quando o package.json mudar)
npm test
```

Deve terminar com `TUDO OK` e "Erros de execução capturados: 0". Isso não substitui testar ao vivo no navegador/celular — coisas como animações reais, drag-and-drop e o fluxo de instalar no iPhone só dá para confirmar testando de verdade.
