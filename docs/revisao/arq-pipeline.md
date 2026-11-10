# arq/pipeline

Pipeline clássico de 5 estágios; registrador escrito na primeira metade do ciclo e lido na
segunda; sem forwarding no tour.

- Sem sobreposição: 5 instruções × 5 etapas = 25 ciclos.
- Programa 1 (5 instruções independentes): 5 + 4 = **9 ciclos**; CPI 9/5 = 1,80.
- Programa 2: `add x5, x6, x7` seguido de `sub x8, x5, x9`. O add faz WB no ciclo 5; o sub
  só pode ler x5 no ID do ciclo 5, em vez do 3: **2 bolhas**, 11 ciclos, CPI 2,20.
- Monociclo com clock de 800 ps: 5 × 800 = 4000 ps. Pipeline com clock de 200 ps (o estágio
  mais lento): 9 × 200 = 1800 ps. Para 1 milhão de instruções: 800 / 200 ≈ 4×. O ganho é 4×,
  e não 5× (o número de estágios), porque os estágios não são equilibrados: é o exemplo do
  Patterson & Hennessy (cap. 4), em que alguns estágios levam menos que 200 ps.
- Com forwarding (Laboratório): só o load seguido de uso ainda gera 1 bolha.

Para o dono conferir:

- [x] os tempos de 800 ps e 200 ps contra a figura do P&H usada em aula.
