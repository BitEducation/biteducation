# Revisão: redes/kerberos

Padrão: relógio 2 min adiantado, senha certa, 3 serviços.

- Mensagens: AS-REQ, AS-REP, TGS-REQ, TGS-REP, AP-REQ, AP-REP = 6 no primeiro serviço.
- Serviços seguintes: só TGS-REQ, TGS-REP, AP-REQ, AP-REP = 4 cada → 6 + 4 × 2 = 14.
- Diferença 2 ≤ 5 → aceito. 6 min → recusado. Senha errada → não abre K1 → para no passo 2.

## Para o dono conferir

- [x] Limite padrão de 5 minutos de diferença de relógio.
- [x] Descrição da pré-autenticação e do risco da chave do TGS.
