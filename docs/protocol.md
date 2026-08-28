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
- `start_match`.

### Servidor → cliente

- `room_created`: código, assento e token de reconexão;
- `room_joined`: assento e estado do lobby;
- `lobby_state`: jogadores, pronto e host;
- `player_disconnected`: assento e prazo de reconexão;
- `player_reconnected`;
- `match_started`: snapshot público inicial.

## Partida clássica — Fase 7

### Cliente → servidor

- `shoot`: direção normalizada, força e spin;
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

## Loja e especiais — Fase 8

### Cliente → servidor

- `open_shop`;
- `close_shop`;
- `reroll_shop`;
- `buy_special`: `offerId`;
- `use_special`: `instanceId`; para efeitos sem alvo, já confirma a ativação;
- `discard_special`: `instanceId`;
- `select_special_target`: `instanceId` e alvo tipado, como
  `{ type: "pocket", pocketId: 0..5 }`, `{ type: "ball", ballId }`,
  `{ type: "point", x, y }` ou `{ type: "pocket_pair", pocketIds: [a, b] }`.

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
em `arcane_reward_granted` ou `arcane_reward_converted`. No jogo local da Fase
6, esses eventos usam sequência crescente no estado de regras e são consumidos
pela apresentação. Na Fase 8, o servidor enviará os mesmos tipos nos envelopes
WebSocket, com a sequência da sala.

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
