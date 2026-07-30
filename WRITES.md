# Escritas e segurança

Este MCP permite alterar dados financeiros reais. Toda ferramenta de escrita exige
`confirm: true` e encerra antes de acessar a API quando a confirmação não é enviada.

## Fluxo recomendado

1. Consulte os recursos e IDs atuais.
2. Para transações, use `despezzas_prepare_update_transaction` ou
   `despezzas_prepare_batch_update_transactions`.
3. Revise `before`, `after`, `changed_fields`, valor em centavos, data e perfil ativo.
4. Execute a escrita com os mesmos argumentos e `confirm: true`.
5. Consulte novamente o recurso para verificar o resultado.

As pré-visualizações podem fazer leituras para montar o diff, mas não escrevem.
Uma escrita confirmada não tem rollback automático.

## Atualização segura de transações

- Campo ausente preserva o valor atual.
- `null` explícito limpa somente campos anuláveis.
- Antes do `PUT`, o MCP relê a transação e envia um payload completo mesclado.
- `edition_date` usa a data original quando não é informada, inclusive com
  `scope: ALL`; uma nova `date` não vira a âncora da série.
- Depois da escrita, o MCP relê e confere campos alterados e preservados.
- Lotes são sequenciais, respeitam `Retry-After`, usam chave de idempotência e
  retornam `success`, `failed` e `not_attempted`.

O MCP envia uma única chamada para edições de série. A atomicidade e o rollback
das parcelas dentro dessa chamada dependem da implementação da API Despezzas;
o MCP detecta divergências posteriores, mas não tenta uma reversão compensatória
que poderia agravar uma série parcialmente alterada.

## Semântica MCP

- Leituras: `readOnlyHint=true`, não destrutivas e idempotentes.
- Criações: escrita não destrutiva e não idempotente.
- Atualizações e exclusões: destrutivas e idempotentes.
- Alternância de pagamento e API bruta: destrutivas e não idempotentes.
- Todas as ferramentas operam apenas na API Despezzas configurada:
  `openWorldHint=false`.

`despezzas_raw_api` é uma ferramenta avançada de diagnóstico. Prefira ferramentas
específicas; métodos diferentes de GET exigem também `allow_destructive: true`.
