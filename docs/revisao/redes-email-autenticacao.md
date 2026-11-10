# Revisão: redes/email-autenticacao

SPF: banco.example → 192.0.2.0/24; golpe.example → 203.0.113.0/24.

| Mensagem | IP | Envelope | From | DKIM d= | SPF | DKIM | Alinhado | DMARC |
|---|---|---|---|---|---|---|---|---|
| fatura | 192.0.2.10 | banco | banco | banco | pass | pass | SPF e DKIM | pass |
| falsa | 203.0.113.66 | golpe | banco | — | pass | none | nenhum | fail |
| lista, com rodapé | 198.51.100.5 | banco | banco | banco | fail | fail | nenhum | fail |
| lista, sem rodapé | 198.51.100.5 | banco | banco | banco | fail | pass | DKIM | pass |

Ação da falsa: reject → rejeitar; quarantine → quarentena; none → entregar.

## Para o dono conferir

- [x] Lição de defesa: não há comandos nem passo a passo de falsificação; tem passo de sinais (s6) e de defesa (s7).
- [x] Referências às RFCs 7208, 6376 e 7489 (o livro não cobre SPF, DKIM e DMARC).
