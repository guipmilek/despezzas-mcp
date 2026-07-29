# Escritas e segurança

Este MCP permite alterar dados financeiros reais. Toda ferramenta de escrita exige
`confirm: true` e encerra antes de acessar a API quando a confirmação não é enviada.

## Fluxo recomendado

1. Consulte os recursos e IDs atuais.
2. Para transações, use a ferramenta `despezzas_prepare_*` correspondente.
3. Revise payload, valor em centavos, data e perfil ativo.
4. Execute a escrita com os mesmos argumentos e `confirm: true`.
5. Consulte novamente o recurso para verificar o resultado.

As pré-visualizações não escrevem. Uma escrita confirmada não tem rollback
automático.

## Semântica MCP

- Leituras: `readOnlyHint=true`, não destrutivas e idempotentes.
- Criações: escrita não destrutiva e não idempotente.
- Atualizações e exclusões: destrutivas e idempotentes.
- Alternância de pagamento e API bruta: destrutivas e não idempotentes.
- Todas as ferramentas operam apenas na API Despezzas configurada:
  `openWorldHint=false`.

`despezzas_raw_api` é uma ferramenta avançada de diagnóstico. Prefira ferramentas
específicas; métodos diferentes de GET exigem também `allow_destructive: true`.
