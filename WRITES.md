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
- A localização por ID usa a data conhecida da busca, consulta conta e cartão nesse
  dia; não fica restrita ao mês atual.
- Em transações únicas, a nova data vai em `date` e os campos `edition_*` não são
  enviados. Em séries, `date` identifica a ocorrência original e `edition_date`
  recebe a nova data, conforme o contrato usado pela interface oficial.
- O argumento público `edition_date` é apenas uma dica para localizar uma
  transação histórica quando ela ainda não foi observada em uma busca.
- Depois da escrita, o MCP relê e confere campos alterados e preservados.
- `updated: true` só é retornado depois de `validation.ok: true`; uma resposta HTTP
  aceita sem persistência produz `failed_validation`, `updated: false` e
  `api_accepted: true`.
- Se `changed_fields` estiver vazio, a operação retorna `status: unchanged` sem
  chamar a API nem incrementar os contadores de atualização.
- Lotes são sequenciais, respeitam `Retry-After`, usam chave de idempotência e
  retornam `success`, `unchanged`, `failed` e `not_attempted`.

O MCP envia uma única chamada para edições de série. A atomicidade e o rollback
das parcelas dentro dessa chamada dependem da implementação da API Despezzas;
o MCP detecta divergências posteriores, mas não tenta uma reversão compensatória
que poderia agravar uma série parcialmente alterada.

Criações e edições com subcategoria consultam o catálogo e bloqueiam pares de
categoria/subcategoria incompatíveis antes da escrita. Contas manuais são
relidas e mescladas antes do `PUT`, pois a interface oficial envia o objeto
completo. O limite disponível de cartão é calculado pelo backend;
`available_limit_cents` não faz parte dos schemas de entrada de criação ou
edição, embora continue aparecendo nas respostas de leitura.

Ao excluir uma transação `TRANSFER`, o preview localiza
`connected_transaction_id`. Esse identificador pode apontar para o ID bruto da
API ou ser compartilhado pelas duas pontas; o MCP resolve a relação e converte a
contraparte para o ID interno editável. A execução exclui as duas pontas
sequencialmente e relê ambas; relações ausentes ou ambíguas são bloqueadas e
falhas parciais são expostas individualmente, pois a API não oferece um endpoint
atômico conjunto.

## Semântica MCP

- Leituras: `readOnlyHint=true`, não destrutivas e idempotentes.
- Criações: escrita não destrutiva e não idempotente.
- Atualizações e exclusões: destrutivas e idempotentes.
- Alternância de pagamento e API bruta: destrutivas e não idempotentes.
- Todas as ferramentas operam apenas na API Despezzas configurada:
  `openWorldHint=false`.

`despezzas_raw_api` é uma ferramenta avançada de diagnóstico. Prefira ferramentas
específicas; métodos diferentes de GET exigem também `allow_destructive: true`.
