# Segurança

Os sites são estáticos: não há servidor, login, formulário enviado nem cookie. Ainda assim,
podem existir falhas como injeção de HTML por parâmetros da URL (`?lab=`, `?passo=`), arquivos
de progresso importados maliciosos ou problemas na cadeia de build.

Para relatar uma vulnerabilidade, use a aba **Security → Report a vulnerability** do
repositório (aviso privado do GitHub). Não abra issue pública. Responderemos assim que
possível e combinaremos a divulgação depois da correção.

Fora do escopo: o conteúdo das lições de ataque, que descreve técnicas conhecidas e
documentadas (ARP spoofing, SYN flood) apenas em simulação, junto com detecção e defesa.
