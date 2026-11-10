# so/chamada-de-sistema

Roteiro sem Laboratório. Fatos que a lição afirma:

- `read` é a syscall 63 em Linux/RISC-V (`include/uapi/asm-generic/unistd.h`);
- convenção: número em a7, argumentos em a0–a5, retorno em a0;
- `ecall` em modo U gera `scause = 8`; interrupção externa de supervisor = 9 com o bit de
  interrupção ligado;
- `sepc` aponta para o próprio ecall; o kernel soma 4 antes do `sret`;
- com o cache de páginas falhando, o DMA grava numa página do cache do kernel e o kernel
  copia para o buffer do usuário (`copy_to_user`) antes de voltar; só com `O_DIRECT` o DMA
  iria direto para o buffer do processo;
- trocas de modo no roteiro: 6 (U→S no ecall, S→U ao entregar a CPU ao player, U→S na
  interrupção, S→U ao voltar para o player, U→S quando o escalonador troca de processo,
  S→U no sret do editor). Confira contando os eventos `count` do contador "Modo da CPU".

Para o dono conferir:

- [x] os números contra a especificação privilegiada do RISC-V e o código do Linux;
- [x] capítulos das referências (Tanenbaum MOS 1.6, Silberschatz cap. 2, OSTEP cap. 6).
