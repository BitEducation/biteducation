# so/sinais

Roteiro: tratador para SIGINT e SIGUSR1; Ctrl+C; bloqueia SIGUSR1; dois SIGUSR1; desbloqueia;
tenta tratar SIGKILL; recebe SIGKILL.

- SIGINT: pendente, não bloqueado → entregue na volta ao modo usuário → tratador (1).
- SIGUSR1 #1: pendente e bloqueado. #2: bit já ligado → funde. Ao desbloquear: entregue uma vez
  → tratador (2). Envios 2, execuções 1 (quiz).
- sigaction(SIGKILL): recusado. SIGKILL: entregue com ação padrão → editor termina; o pai recebe
  SIGCHLD. Vivo no fim: não.
- Tratadores executados: 2.
- Passo novo s4: sigaction(SIGTERM) aceito; SIGTERM enviado e tratado → 3 execuções de tratador ao todo (SIGINT, SIGUSR1, SIGTERM); depois o SIGKILL termina o editor.

Para o dono conferir:

- [x] MOS 10.3.2 (sinais no Linux, sigaction, SIGKILL); o Maziero não trata sinais e saiu das referências.
- [x] Sinais padrão não entram em fila (POSIX); SIGKILL e SIGSTOP não podem ser tratados.
