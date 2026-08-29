# Protocolo WebSocket — versão 1

## Envelope

Toda mensagem é JSON e segue este envelope:

```json
{
  "v": 1,
  "type": "ping",
  "requestId": "req_abc123",
  "roomCode": "AB12CD",
  "seq": 10,
  "payload": {}
}
```

- `v`: versão do protocolo;
- `type`: tipo da mensagem;
- `requestId`: correlação de comando e resposta;
- `roomCode`: obrigatório após entrar em sala;
- `seq`: sequência monotônica de eventos do servidor;
- `payload`: dados específicos.

O servidor responde erros com `error`, incluindo `code`, `message` e o
`requestId` original. Mensagens maiores que 32 KiB são rejeitadas.

## Sessão e diagnóstico

### Cliente → servidor

- `hello`: versão do cliente e nome de exibição;
- `ping`: instante enviado pelo cliente;
- `resume_session`: código da sala e token privado.

### Servidor → cliente

- `welcome`: id da conexão, versão aceita e capacidades ativas;
- `pong`: instante original e instante do servidor;
- `session_resumed`: snapshot público e estado privado do jogador;
- `error`: rejeição estruturada.

## Lobby — Fase 7

### Cliente → servidor

- `create_room`: nome e modo desejado;
- `join_room`: código e nome;
- `leave_room`;
- `set_ready`: booleano;
- `start_match`;
- `request_rematch`: após o fim, o perdedor solicita e o vencedor aceita.

### Servidor → cliente

- `room_created`: código, assento e token de reconexão;
- `room_joined`: assento, token de reconexão e estado do lobby;
- `lobby_state`: jogadores, pronto e host;
- `player_disconnected`: assento e prazo de reconexão;
- `player_reconnected`;
- `match_started`: snapshot público inicial;
- `rematch_state`: solicitante, assentos que aceitaram e total necessário.

Na revanche, os dois jogadores permanecem na mesma sala. A nova partida começa
automaticamente após as duas confirmações e o assento responsável pela saída é
alternado.

## Partida clássica — Fase 7

### Cliente → servidor

- `shoot`: direção normalizada, força, spin e `cueY` opcional somente na saída;
- `cancel_aim`: apenas informativo;
- `request_snapshot`.

### Servidor → cliente

- `shot_accepted`: id da tacada e parâmetros validados;
- `shot_rejected`: motivo;
- `physics_snapshot`: tick e bolas públicas;
- `shot_resolved`: faltas, bolas encaçapadas, pontos e próximo turno;
- `turn_started`: assento e prazo;
- `points_updated`: placar público;
- `match_finished`: vencedor e motivo.

O cliente nunca envia posições finais, bolas encaçapadas, pontos ou vencedor.
Durante as tacadas, snapshots são apresentados com interpolação no cliente para
evitar saltos visuais sem retirar a autoridade física do servidor.

## Loja e especiais — Fase 8

Todos os comandos desta seção estão ativos no multiplayer Arcano.

### Cliente → servidor

- `open_shop`;
- `close_shop`;
- `reroll_shop`;
- `buy_special`: `offerId`;
- `discard_special`: `instanceId`;
- `use_special`: `instanceId`; para efeitos sem alvo, já confirma a ativação;
- `select_special_target`: `instanceId` e alvo tipado, como
  `{ type: "pocket", pocketId: 0..5 }`, `{ type: "ball", ballId }`,
  `{ type: "point", x, y }` ou `{ type: "pocket_pair", pocketIds: [a, b] }`.
- `set_frozen_direction`: ângulo escolhido durante Tempo Congelado;
- `release_time_freeze`: encerra antecipadamente o Tempo Congelado.

### Servidor → jogador proprietário

- `shop_state`: três ofertas privadas e saldo;
- `shop_rerolled`;
- `special_bought`;
- `special_used`: instância consumida, usos restantes e efeito armado;
- `special_discarded`;
- `special_ready`;
- `special_cooldown`;
- `inventory_state`;
- `arcana_points_updated`.

### Servidor → ambos

- `shop_opened`: somente assento do jogador;
- `shop_closed`;
- `special_effect_started`: informações públicas do efeito;
- `special_effect_finished`.
- `special_physics_event`: colisão ou alteração física especial já validada.

Para `rewind`, o servidor mantém o checkpoint anterior e nunca aceita posições
ou placares enviados pelo cliente. Para `time_freeze`, somente ajustes de
direção dentro da janela ativa são aceitos.

## Bola Mágica — Fase 6/8

- `arcane_ball_spawned`: `id`, posição `x/y`, `radius`, `rarity`, `color`,
  `spawnedTurn`, `expiresAfterTurn` e `turnsRemaining`;
- `arcane_ball_touched`: `id`, `seat`, `rarity` e `arcanaGranted`;
- `arcane_ball_potted`: `id`, `seat`, `pocketId` e `rarity`;
- `arcane_ball_expired`: `id`, `rarity`, última posição conhecida e
  `expiredAtTurn`;
- `arcane_reward_granted`: `id`, `seat`, `slot` e `reward` com
  `instanceUid`, `defId`, `name` e `rarity`;
- `arcane_reward_converted`: `id`, `seat`, `reason`, `conversionValue`,
  `arcanaGranted` e a recompensa original.

Somente uma Bola Mágica pode existir por partida. A recompensa sorteada não
aparece no evento de surgimento nem no snapshot público; ela é revelada apenas
em `arcane_reward_granted` ou `arcane_reward_converted`. No jogo local esses
eventos usam sequência crescente no estado de regras; no multiplayer da Fase 8
o servidor envia os mesmos tipos nos envelopes WebSocket da sala.

## Ordenação e reconexão

- O servidor mantém `seq` crescente por sala.
- O cliente ignora eventos duplicados e solicita snapshot ao detectar lacuna.
- O token de reconexão nunca aparece em snapshots públicos.
- Após 30 segundos desconectado, o jogador perde por abandono.
- Intenções repetidas com o mesmo `requestId` retornam o resultado anterior sem
  executar a ação novamente.

## Compatibilidade

Alterações incompatíveis incrementam `v`. Campos opcionais podem ser
adicionados sem alterar a versão quando clientes antigos puderem ignorá-los.
