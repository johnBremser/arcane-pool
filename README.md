# Arcane Pool: Sinuca Clássica e Arcana

Projeto HTML5 de sinuca em JavaScript puro, com Canvas API, Web Audio API e
servidor Node.js. O cliente não usa CDN, bibliotecas, imagens, sons ou fontes
externas.

## Estado atual

O projeto está na versão **1.0.0** e está consolidado até a **Fase 10**:

- Fase 0: arquitetura e protocolo documentados;
- Fase 1: física e renderização local;
- Fase 2: modo clássico local;
- Fase 3: economia arcana, loja, inventário e descarte.
- Fase 4: ativação e efeitos dos cinco especiais comuns e cinco incomuns.
- Fase 5: seis especiais raros e quatro lendários, com seleção de bolas,
  caçapas e áreas da mesa.
- Fase 6: Bolas Mágicas com surgimento seguro, toque, coleta, expiração,
  recompensas por raridade e conversão automática.
- Fase 7: salas com código, lobby para dois jogadores, prontidão, reconexão e
  partidas clássicas com física, turno, pontuação e vitória autoritativos,
  nomes reais no placar, apresentação interpolada e revanche aceita pelos dois.
- Fase 8: Modo Arcano multiplayer completo, com economia privada, ativação dos
  vinte especiais, seleção autoritativa de alvos, efeitos físicos sincronizados,
  Rebobinar, Tempo Congelado e Bola Mágica em rede.
- Fase 9: oponente local por IA nos níveis Fácil, Normal e Difícil, com análise
  geométrica de caçapas, decisão que evita mirar deliberadamente na bola 8 antes
  da hora, jogada de segurança, variação de precisão por nível e decisões
  automáticas de loja e especiais no Modo Arcano.
- Fase 10: cabeçalho responsivo com menus compactos de partida e áudio, central
  de Ajuda com regras e guia dos 20 especiais, foco de teclado, semântica de
  diálogos, pausa automática da partida local quando a aba fica oculta e
  bateria consolidada de testes técnicos e visuais.

O multiplayer clássico e o Arcano estão disponíveis. Para criar uma sala
Arcana, selecione **Modo Arcano** antes de abrir o Multiplayer.

Para jogar contra o computador, escolha **IA: Fácil**, **IA: Normal** ou
**IA: Difícil** no seletor de oponente. A pessoa joga como **Você** no assento 1;
a IA controla o assento 2 e usa a mesma física e as mesmas regras da partida local.

## Como executar

Requisitos:

- Node.js 18 ou superior;
- npm.

Instale a única dependência do servidor e inicie o projeto:

```bash
npm install
npm start
```

Abra `http://localhost:5201`. A porta `5200` permanece reservada ao portal.

Para testar o multiplayer, abra o jogo em dois navegadores ou duas janelas,
clique em **Multiplayer**, crie a sala na primeira janela e entre com o código
na segunda. Os dois jogadores devem marcar prontidão; o anfitrião inicia.

O servidor também expõe:

- `GET /api/health` para diagnóstico;
- WebSocket no mesmo endereço HTTP para handshake e ping.

## Controles locais

- Mouse ou toque: mirar;
- antes da primeira tacada, arrastar a bola branca para cima ou para baixo;
- clicar/tocar e arrastar: definir força;
- `Esc`: cancelar a preparação ou fechar a loja;
- `L`: abrir/fechar a Loja Arcana;
- `R`: iniciar uma nova partida;
- `Música`: liga ou desliga a trilha ambiente, que começa desativada;
- painel da bola branca: aplicar top spin, back spin e efeito lateral.
- botão `Usar` no inventário: armar um especial antes da tacada;
- Caçapa Dourada e Ímã Leve: depois de usar, clicar na caçapa desejada;
- `Esc`: também cancela uma seleção de alvo arcano.
- `Tab` permanece reservado à navegação de foco do navegador.

## Especiais funcionais na Fase 4

- Comuns: Mira Fantasma, Força Perfeita, Toque Suave, Visão Ampliada e
  Estabilizador;
- incomuns: Bola Fantasma, Caçapa Dourada, Pressão, Ímã Leve e Tacada Dupla;
- efeitos podem ser combinados quando o jogador possui mais de um especial
  preparado para a próxima tacada;
- Tacada Dupla limita somente a tacada extra a 70% de força.

## Especiais funcionais na Fase 5

- Raros: Bola Magnética, Rebobinar, Escudo de Caçapa, Zona de Gelo, Zona
  Pegajosa e Troca de Posição;
- lendários: Tempo Congelado, Mão Fantasma, Caçapa Portal e Bola Explosiva;
- Rebobinar restaura posições, placar, economia e turno anteriores, consumindo
  o especial e obrigando o adversário a repetir a jogada;
- Tempo Congelado pausa a simulação no primeiro impacto por até dois segundos;
  mover o ponteiro escolhe a nova direção da branca e clicar libera antes;
- zonas permanecem por dois turnos e afetam os dois jogadores;
- Caçapa Portal devolve as bolas pela caçapa conectada com 60% da velocidade.

## Bolas Mágicas funcionais na Fase 6

- existem somente no Modo Arcano e apenas uma pode estar ativa por vez;
- surgem em posição livre da mesa e expiram depois de dois turnos completos;
- o primeiro toque concede até `+1 ✦` uma única vez por Bola Mágica;
- encaçapar coleta a bola, mantém a vez quando não há falta e entrega um
  especial da raridade indicada pela cor da bola;
- com inventário cheio, a recompensa vira pontos arcana: `2 ✦` comum, `3 ✦`
  incomum, `4 ✦` rara ou `6 ✦` lendária, respeitando o limite de saldo;
- uma recompensa lendária também é convertida quando o jogador já atingiu o
  limite de uma aquisição lendária na partida;
- o painel da mesa mostra raridade, turnos restantes e se o bônus de toque já
  foi coletado.

## Documentação técnica

- [Arquitetura e fases](docs/architecture.md)
- [Protocolo WebSocket](docs/protocol.md)

## Validação da versão 1.0

Execute `npm test` para rodar a bateria técnica completa das Fases 6 a 10. O
polimento visual deve ser conferido em desktop e celular, especialmente após
alterações no cabeçalho, inventário, loja ou placar.

As salas multiplayer vivem na memória do processo Node. Uma reinicialização ou
novo deploy encerra as salas ativas, embora não afete partidas futuras.
