# so/filosofos

Cinco filósofos (Ana 0 … Eva 4); o garfo i fica entre o filósofo i (esquerda dele) e o i+1. Cada um faz, por
refeição: pensa, P(esquerdo), P(direito), come, V(direito), V(esquerdo). Round Robin, 1 operação por vez, 2
refeições.

Ingênuo: rodada 1, todos pensam (5 passos); rodada 2, todos pegam o garfo da esquerda (5); rodada 3, todos tentam
o da direita e bloqueiam (5). 15 passos, 5 bloqueados, impasse. Quiz do passo 2: 5. Com 2 operações por vez o
impasse se repete; com 3, cada um pega os dois garfos seguidos e a mesa termina.

Ordem (menor garfo primeiro): só Eva muda, pegando o garfo 0 antes do 4. Ela disputa o garfo 0 com Ana e não fecha
o ciclo. Termina em 60 passos = 6 operações × 2 refeições × 5 filósofos: um P que bloqueia conta como passo e
se completa quando o V acorda a thread, sem passo extra. Há 8 bloqueios no caminho.

Garçom (semáforo mesa = 4): cada refeição tem 8 operações; termina em 80 = 8 × 2 × 5 passos.

O teste confere que ordem e garçom terminam para 1 a 3 refeições e 1 a 3 operações por vez.

Para o dono conferir:

- [x] MOS 2.5.1; Maziero 12.4.
