# so/condicao-de-corrida

Saldo inicial 500; Ana deposita 100, Bia 50; esperado 650. Troca de thread a cada instrução, começando por Ana
(A = Ana, B = Bia).

Sem proteção: A lê 500, B lê 500, A soma (600), B soma (550), A grava 600, B grava 550. Saldo 550; o depósito de
Ana se perde. Quiz do passo 2: 550.

Trava ingênua: A testa ocupado = 0, B testa ocupado = 0, A marca, B marca. As duas entram; segue igual à anterior:
550, com as duas juntas na seção.

Peterson: A quer0 = 1, B quer1 = 1, A vez = 1, B vez = 0. A testa "quer1 e vez = 1?": vez = 0, entra.
B testa "quer0 e vez = 0?": sim, espera. A lê, soma, grava (600), sai; B gasta 4 voltas (uma em cada tick de A, do
teste até o sai). B entra: 650. Total 18 ticks. Quiz do passo 4: Ana (Bia cedeu a vez por último).

TSL: A tsl lê 0 e grava 1, entra. B tsl lê 1: espera durante lê, soma, grava e sai de A (4 voltas). B tsl lê 0:
650 em 14 ticks.

Mutex: A lock; B lock encontra fechado e dorme (1 bloqueio). A lê, soma, grava, unlock passa o mutex para B.
B lê 600, soma, grava 650, unlock. 10 ticks, 0 voltas.

O teste confere a exclusão mútua das três versões protegidas para quantum de 1 a 6 e as duas ordens de início, e a
perda de atualização sem proteção.

Para o dono conferir:

- [x] MOS 2.3.1, 2.3.3 e 2.3.6;
- [x] Maziero 10.2.
