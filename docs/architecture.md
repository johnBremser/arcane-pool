# Fase 0 — Arquitetura técnica

## Objetivo e prioridades

O jogo deve permanecer jogável, justo e determinístico antes de receber mais
efeitos. A prioridade da arquitetura é impedir que renderização, interface e
rede se tornem fontes de verdade para regras, pontos ou inventário.

## Decisões principais

### Cliente

- JavaScript puro em scripts clássicos, sem bundler e sem dependências.
- Canvas 2D exclusivo para mesa, bolas, mira, partículas e efeitos do campo.
- DOM/CSS para placar, temporizador, spin, loja, inventário e modais.
- `game.js` orquestra entrada, áudio e renderização, mas delega regras a
  `rules.js` e física a `physics.js`.
- `net.js` encapsula WebSocket e não pode alterar o estado da partida sozinho.

### Núcleo compartilhado

- `physics.js` fornece `PhysicsCore.createWorld()`, permitindo mundos
  independentes para cliente local, servidor e testes.
- `rules.js` cria e altera apenas estado serializável: jogadores, turno,
  pontuação, economia, loja, inventário, Bola Mágica e temporizador.
- `specials.js` mantém o catálogo e sorteio, com fonte de aleatoriedade
  injetável.
- `protocol.js` define versão, tipos de mensagem, envelopes e validação.
- Os módulos expõem uma API de navegador e `module.exports` para Node.js.

### Servidor

- Node.js com `http` e apenas o pacote `ws` para WebSocket.
- Na Fase 8 o servidor entrega os arquivos, health check, salas clássicas ou
  arcanas, física autoritativa e a economia privada de cada jogador.
- Cada sala possui seu próprio mundo físico e estado de regras.
- O servidor receberá intenções, nunca resultados calculados pelo cliente.

## Estado do servidor por sala

```text
RoomState
  code
  hostSeat
  status: lobby | playing | finished
  players[2]
    id, seat, name, ready, connected, disconnectedAt
  match
    mode, phase, currentSeat, turn, players, winnerSeat
  physicsWorld
  privateStateBySeat
    shopOffers, reconnectToken
  commandSequence
  eventSequence
```

As ofertas da loja são privadas. O adversário recebe apenas `shop_opened` e
`shop_closed`, sem os itens oferecidos.

## Estado do cliente

```text
ClientState
  connection
    status, pingMs, roomCode, seat, lastSequence
  publicMatchSnapshot
  privatePlayerState
    shopOffers, inventoryDetails
  presentation
    aim, drag, selectedSpin, particles, openOverlay
    pendingSpecialTarget, currentShotEffects
  publicMagicBall
    id, position, rarity, lifetime, touched
```

No modo local, `rules.js` é a autoridade provisória. No multiplayer, os mesmos
comandos são executados pelo servidor; o cliente envia intenções e apresenta
snapshots e eventos confirmados. A Fase 8 inclui saldo, ofertas privadas,
reroll, compra, descarte, ativação e alvos. Modificadores físicos e a Bola
Mágica também existem somente no mundo autoritativo da sala.

## Ações de entrada

As entradas físicas são mapeadas para ações:

- `aim`;
- `charge-shot`;
- `release-shot`;
- `cancel`;
- `toggle-shop`;
- `reset-match`;
- `set-spin`.
- `use-special`;
- `select-special-target`.

Menus bloqueiam ações da mesa. Enquanto a loja está aberta, o temporizador fica
pausado e nenhuma tacada pode ser iniciada.
No teclado, `L` mapeia para `toggle-shop`; `Tab` não é capturado e permanece
disponível para a navegação de foco e acessibilidade do navegador.

## Economia arcana

- Saldo inicial: 2;
- limite: 10;
- bola válida: +1;
- bola com tabela: +2;
- bola longa: +2;
- duas ou mais bolas: bônus de +3;
- troca vencida: +1 para quem acertou antes do erro adversário;
- boa defesa: +1 quando a jogada deixa a branca sem linha direta para uma bola
  válida;
- loja: três ofertas novas a cada início de turno do jogador;
- reroll: custo de 1;
- inventário: três slots;
- lendário: no máximo uma aquisição por jogador na partida.

Todas as operações usam as funções de `rules.js`. Em rede, somente o servidor
pode chamá-las em resposta a comandos remotos válidos; saldo, preço e conteúdo
do inventário enviados pelo navegador nunca são aceitos como resultado.

## Ciclo dos especiais da Fase 4

`rules.js` valida o slot, o turno, o cooldown, o tipo de alvo e o estado da
partida. Ao ativar, a carga é consumida e um efeito serializável é armado no
jogador correto. No começo da tacada, `prepareShot()` transforma esses efeitos
em modificadores imutáveis daquela jogada e remove os estados de uso único.

`physics.js` não conhece inventário nem custos. Ele recebe apenas modificadores
como atrito reduzido da branca, bola fantasma e caçapa magnética. `game.js`
coordena entrada, áudio e apresentação; o DOM mantém inventário, botões e chips
de estado, enquanto Canvas desenha linhas, auras de caçapa e partículas.

Efeitos implementados:

- Mira Fantasma: trajetórias pós-impacto da bola alvo e da branca;
- Força Perfeita: zona ideal calculada pela distância da jogada;
- Toque Suave: 30% menos atrito apenas na bola branca;
- Visão Ampliada: linha 50% maior com até dois reflexos;
- Estabilizador: reduz pela metade a pequena variação lateral natural;
- Bola Fantasma: a primeira bola atingida ignora a próxima bola ou atravessa a
  próxima tabela, reaparecendo no lado oposto;
- Caçapa Dourada: alvo por caçapa e bônus de 3 pontos arcana;
- Pressão: variação pública de até 8% na próxima força adversária;
- Ímã Leve: primeira bola atingida recebe atração perto da caçapa escolhida;
- Tacada Dupla: erro sem falta concede nova tacada limitada a 70% de força.

## Ciclo dos especiais da Fase 5

Os alvos usam quatro formatos serializáveis: `pocketId`, `ballId`, ponto `x/y`
e par `pocketIds`. O cliente faz a seleção contextual no Canvas, mas regras e
física validam novamente antes de alterar o estado.

- Bola Magnética: atração média da bola selecionada pela caçapa mais próxima;
- Rebobinar: checkpoint conjunto de `match` e bolas antes de cada tacada;
- Escudo de Caçapa: modificador da próxima jogada adversária e cooldown de três
  turnos do proprietário;
- Zonas de Gelo/Pegajosa: entidades de partida com raio 80 e expiração por
  número de turno;
- Troca de Posição e Mão Fantasma: ações imediatas com validação de ocupação;
- Tempo Congelado: estado temporário interno da física, com velocidades
  preservadas e nova direção da branca;
- Caçapa Portal: par de caçapas dentro do modificador da tacada;
- Bola Explosiva: impulso radial sem remover a bola escolhida.

No multiplayer, checkpoints de Rebobinar e alvos validados ficam apenas no
servidor; o cliente recebe snapshots e eventos públicos.

## Regras de pontuação consolidadas

- bola comum: +10;
- bola que tocou tabela após o contato: +20;
- bola com percurso longo: +25;
- branca encaçapada: -15, inclusive permitindo placar negativo;
- bola 8 antes da hora ou em jogada com falta: derrota;
- bola 8 depois das demais bolas: vitória.

Os bônus de tabela e longa são categorias alternativas, não cumulativas. A
categoria longa tem prioridade quando as duas condições existem.

## Bola Arcana e Bola Mágica

O texto original descreve dois sistemas sobrepostos. Para evitar duas famílias
quase idênticas, o projeto adotará uma única entidade canônica: **Bola Mágica**.

- Pode existir apenas uma por vez;
- tocar concede +1 ponto arcana uma única vez;
- encaçapar concede a recompensa completa;
- expira após dois turnos completos;
- posição, tipo e recompensa são definidos pelo servidor;
- os nomes de rede usam o prefixo `arcane_ball_` por compatibilidade com o
  protocolo solicitado.

Na Fase 6, `rules.js` mantém a entidade serializável e sua fila ordenada de
eventos, enquanto `physics.js` mantém somente o corpo físico. No modo local,
`game.js` escolhe uma posição livre através da física e pede às regras para
criar a entidade; no multiplayer, esse mesmo fluxo é executado pelo servidor.

O tipo público da bola é sua raridade: comum, incomum, rara ou lendária. Ao
surgir, a recompensa é sorteada entre os especiais da mesma raridade e fica
oculta até a coleta. O primeiro contato durante uma tacada concede até `+1`
ponto arcana, respeitando o limite de saldo, e é persistido para não premiar
contatos repetidos.

Ao ser encaçapada, a Bola Mágica entrega o especial em um slot livre. Se o
inventário estiver cheio, a recompensa é convertida em `2`, `3`, `4` ou `6`
pontos arcana, conforme a raridade. Uma lendária também é convertida quando o
limite de uma aquisição lendária por jogador já foi atingido. A coleta conta
como encaçapada válida para continuidade da vez, mas não soma pontos clássicos.

O Canvas apresenta núcleo luminoso, runa, anéis, partículas e cor por raridade;
o DOM informa raridade, vida restante e bônus de toque. A fila local emite os
mesmos seis nomes `arcane_*` do protocolo e também os publica no navegador como
`CustomEvent("arcane-pool:event")` para manter a apresentação desacoplada.

## Oponente por IA — Fase 9

O módulo `public/ai.js` é independente de DOM e de renderização. Ele recebe um
snapshot da física e devolve somente ângulo, força, efeito e alvos escolhidos.
Assim, a tacada continua passando por `rules.js` e `physics.js`, exatamente como
uma tacada humana local, sem criar regras paralelas ou interferir no servidor
autoritativo do multiplayer.

O planejador procura combinações bola-caçapa por geometria de bola fantasma,
descarta trajetórias obstruídas, pontua distância e ângulo de corte e evita a
bola 8 enquanto ainda existem bolas normais. Sem encaçapada direta viável, ele
prioriza contato seguro com uma bola liberada. Fácil, Normal e Difícil variam o
tempo de decisão, a quantidade de candidatos considerada e os erros de mira e
força.

No Modo Arcano, a IA compra ofertas compatíveis com seu saldo e inventário e
pode armar automaticamente especiais cujo alvo seja resolvido sem interação
manual. Efeitos puramente visuais ou que exijam reposicionamento interativo não
são desperdiçados pela IA.

## Polimento e QA — Fase 10

O cabeçalho usa três composições responsivas: uma linha em telas largas, duas
linhas em desktops estreitos e uma faixa compacta no celular. Configuração de
modo, oponente, nova partida e multiplayer ficam no menu Jogar; efeitos sonoros
e música ficam no menu Áudio. A Ajuda reúne regras, controles, modo Arcano e o
guia de uso dos 20 especiais. Os painéis de efeito e inventário continuam
recolhíveis e fora do centro útil.

Partidas locais pausam o cronômetro antes da tacada quando a aba fica oculta e
retomam com o mesmo tempo ao voltar. O multiplayer não tenta pausar o servidor,
que permanece como autoridade de tempo. Controles possuem foco visível, estados
dinâmicos usam regiões `aria-live`, diálogos declaram sua semântica e animações
não essenciais respeitam `prefers-reduced-motion`.

A bateria `npm test` consolida os smokes de regras, economia, multiplayer,
especiais, Bola Mágica, IA e contratos estáticos da interface final. O playtest
visual cobre inicialização, tacada, Modo Arcano com IA, overlays, desktop
estreito e viewport móvel.

## Segurança e informações privadas

- O cliente nunca envia saldo, inventário final, placar ou posição resultante.
- Comandos incluem `requestId`, sequência e versão do protocolo.
- O servidor valida sala, identidade, turno, fase, custo e alvo.
- Ofertas e tokens de reconexão são enviados somente ao respectivo jogador.
- Snapshots públicos omitem ofertas e segredos.
- Mensagens desconhecidas, fora de ordem ou com campos inválidos são rejeitadas.
- Limites de tamanho e frequência serão aplicados antes do multiplayer público.

## Performance e depuração

- física com acumulador fixo em 120 Hz;
- limite de tempo acumulado por frame;
- pool de partículas;
- texturas pesadas pré-renderizadas em `OffscreenCanvas` quando disponível, com
  fallback para canvas em memória;
- suporte a `devicePixelRatio`;
- estado serializável separado de objetos de renderização;
- diagnósticos de rede e física poderão ser ativados sem alterar regras.

### Calibração das caçapas

A abertura visual usa `table.pocketRadius`, enquanto a captura física usa
`table.captureRadius`. A calibração atual mantém a abertura em `24` e exige que
o centro da bola entre em um raio de `21` para a encaçapada, reduzindo acertos
de borda sem fechar excessivamente as caçapas.

### Calibração da força

A velocidade básica continua limitada por `physics.maxShotSpeed`. Para melhorar
quebradas e trajetórias de ponta a ponta sem prejudicar o controle fino, a
potência recebe um reforço cúbico configurável por `highPowerBoost` e
`highPowerExponent`. Com os valores atuais, tacadas leves praticamente não
mudam, 50% de força recebe cerca de 2,5% de reforço e 100% recebe 20%, chegando
a uma velocidade efetiva máxima de `1800`. Somente a primeira tacada recebe o
multiplicador adicional `input.openingBreak.powerMultiplier` de 1,45, chegando
a `2610` na força máxima. Antes dessa saída, a branca pode ser deslocada apenas
no eixo vertical; no multiplayer, o servidor limita e valida a coordenada.

## Entregas por fase

1. Fase 0: este documento e o protocolo.
2. Fase 1: física, mesa, bolas, mira, força e spin.
3. Fase 2: regras, pontos, faltas, turnos e fim de partida.
4. Fase 3: economia, loja, inventário e descarte.
5. Fase 4: especiais comuns e incomuns.
6. Fase 5: especiais raros e lendários.
7. Fase 6: Bola Mágica unificada.
8. Fase 7: salas e multiplayer clássico autoritativo.
9. Fase 8: economia e especiais autoritativos em rede.
10. Fase 9: IA.
11. Fase 10: polimento.
