# Revisão: arq/interrupcoes

Janela de 100 ticks; teclado pronto em 13, 41, 77. Consulta = 1 tick; tratar = 2 ticks; salvar e restaurar = 1 tick cada.

## Polling a cada 10

Consultas em 0, 10, …, 90 = 10. Acham algo: 20 (13), 50 (41), 80 (77) → 7 à toa.
Espera (do evento ao início do tratamento, depois do tick da consulta): 21 − 13 = 8; 51 − 41 = 10; 81 − 77 = 4 → média 22 ÷ 3 = 7,33.
Gasto: 10 consultas + 3 × 2 = 16 ticks.

## Interrupção

Cada evento: termina a instrução (1), salva (1), trata (2), restaura (1). Espera 1. Gasto 3 × 4 = 12 ticks.

## Para o dono conferir

- [x] A descrição de placas de rede que alternam interrupção e consulta (como o NAPI do Linux) está correta.
