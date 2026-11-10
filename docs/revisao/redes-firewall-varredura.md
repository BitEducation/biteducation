# redes/firewall-varredura

Resultados deduzidos das regras; nenhuma sonda é enviada. Endereços de documentação.

16 portas: 21 22 23 25 53 80 110 139 143 443 445 993 3306 3389 5432 8080. Serviços: 22, 80, 443, 3306, 8080.

- Sem firewall: abertas 22, 80, 443, 3306, 8080 = 5 (quiz: 5); fechadas (RST) 11; filtradas 0.
- Lista de bloqueio (descarta 3306 e 445, padrão aceita): abertas 22, 80, 443, 8080 = 4; filtradas 2; fechadas 10.
- Negar por padrão (aceita 80, 443; 22 só de 192.0.2.0/24; padrão descarta), varredor 198.51.100.66:
  abertas 80 e 443 = 2; filtradas 14; fechadas 0.

IDS: limiar 10 portas distintas em 5 s, sonda a cada 200 ms. Na sonda i (t = 200·i), todas as anteriores estão
na janela enquanto 200·i < 5000; a 10ª sonda (i = 9, t = 1,8 s) atinge o limiar. Varredura total 15 × 200 = 3 s.
Laboratório 2000 ms: no máximo ⌊4999/2000⌋ + 1 = 3 sondas na janela → sem alerta.

Estado: a tabela tem 192.0.2.80:443 (atualização aberta pelo servidor).

- Sem estado, com a regra "aceita ACK" antes das outras: resposta aceita; ACK forjado para 3306 aceito.
- Com estado: resposta casa com a tabela (aceita); ACK forjado sem entrada (descarta).

Passos de sinais (s3) e defesa (s5, s6) presentes. Sem comandos nem ferramentas.

Para o dono conferir:

- [x] Tanenbaum CN 8.3.1 e 8.3.2.
