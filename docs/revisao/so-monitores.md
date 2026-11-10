# Revisão: so/monitores

Padrão: semântica de Mesa, consumidor testa com if.

## Sequência (Mesa, if)

1. C1 entra; buffer 0 → wait(naoVazio): solta a trava, dorme. (2 eventos)
2. P entra; C2 chega e espera na entrada; P põe 1 item; signal → C1 vai para a entrada atrás do C2; P sai. (5 eventos)
3. C2 entra, retira o item (0), sai. (2 eventos)
4. C1 volta do wait() e, com if, retira de buffer vazio: −1. (2 eventos)

Total: 11 eventos; bug = sim; final = −1.

## Variantes

- Mesa com while: no passo 4 o C1 reconfere e dorme de novo; final 0.
- Hoare: o signal entrega a trava ao C1, que retira o item (0); P sai; C2 entra, encontra 0 e dorme. Final 0, sem bug, com if ou while.

## Para o dono conferir

- [x] Os textos dos passos 3 a 5 fazem sentido nas três variantes do Laboratório.
- [x] A afirmação de que pthreads, Java e Python seguem Mesa está correta.
