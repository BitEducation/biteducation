# arq/ligacao

Instruções de 4 bytes. principal.s: inicio 0 (li), 4 call soma, 8 sw total, 12 j fim, fim 16 (ret),
total 20 (.word); 24 bytes. soma.s: soma 0 (addi), 4 ret; 8 bytes.

- Passagem 1: inicio 0, fim 16, total 20; soma externo. Referências adiante: sw total em 8 e j fim em 12 (2).
- Passagem 2: j fim = 16 − 12 = +4 (resolvido); call soma e sw total ficam pendentes (2).
- Ligação a partir de 1024 (0x0400), principal primeiro: principal 0x0400–0x0417, soma 0x0418–0x041f.
  soma = 1048 = 0x0418 (quiz); total = 1024 + 20 = 1044 = 0x0414.
- Remendos: call em 1028 → 1048 − 1028 = +20; sw total → 0x0414; j fim em 1036 → 1040: +4.
- Mover 0x4000 (16384): só total muda, para 0x4414; call e j continuam +20 e +4. 1 de 3.

Ordem soma primeiro, início 0 (teste): soma em 0, principal em 8; call em 12 → 0 − 12 = −12; total 8 + 20 = 28.

Para o dono conferir:

- [x] SCO 7.3 e 7.4.
