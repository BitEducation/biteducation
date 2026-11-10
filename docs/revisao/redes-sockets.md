# redes/sockets

- socket() = 3; bind; listen(3, 2). Sockets: 1.
- accept() com fila vazia: bloqueia. Lia conecta: entregue ao accept → descritor 4. Sockets: 2.
- Malu e Caio: fila (2/2). Rui: fila cheia → SYN ignorado.
- accept(): tira Malu → descritor 5, sem bloquear. Sockets: 3. Fila: Caio.
- Laboratório: backlog 1 → Caio e Rui ignorados; backlog 3 → ninguém ignorado.
- Quiz s4: backlog 2, três clientes com o servidor ocupado: 3 − 2 = 1 ignorado.

Para o dono conferir:

- [x] CN 6.1.3 (primitivas de soquetes de Berkeley).
- [x] Linux: com a fila de aceite cheia, o SYN é descartado (tcp_abort_on_overflow = 0).
