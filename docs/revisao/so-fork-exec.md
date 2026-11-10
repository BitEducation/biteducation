# so/fork-exec

10 quadros. Shell PID 100 (pai: init, PID 1) com 4 páginas (código, dados, heap, pilha) nos quadros 0 a 3.

fork: filho PID 101, PPID 100. As 4 páginas passam a ter 2 referências; nenhum quadro novo (4 ocupados).
Quiz do passo 2: 0.

Escritas (padrão 1, na pilha): o quadro 3 tem 2 referências, então é copiado para o quadro 4. Ocupados: 5.

exec("/bin/ls") com 3 páginas: o filho solta os quadros 0, 1 e 2 (voltam a 1 referência) e a cópia 4 (livre).
ls entra nos quadros livres 4, 5 e 6. Ocupados: 4 + 3 = 7. Quiz do passo 4: 7.

exit(0): os 3 quadros de ls são liberados (4 ocupados); entrada 101 fica zumbi até o wait do shell, que recebe
(101, 0).

Órfão (num cenário separado): o shell termina antes; o PPID de 101 vira 1; o init recolhe o shell zumbi.

O teste confere a cópia única por página, a volta de um quadro a privado e que nenhum quadro vaza depois do exit.

Para o dono conferir:

- [x] MOS 2.1.2 e 2.1.3; Maziero 5.3 e 18.2.
