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

## Validação segura de criações

Antes do `POST`, o MCP lê o intervalo e o destino em que a transação será
materializada. Depois da resposta aceita, relê o mesmo intervalo e identifica
somente IDs que não existiam no snapshot anterior. A validação confere:

- quantidade de ocorrências;
- datas e números das parcelas;
- título, descrição, tipo, destino, categoria, subcategoria e pagamento;
- valor por ocorrência ou total, conforme `amount_mode`.

Uma persistência integral retorna `status: success`. Se algum registro foi criado,
mas a quantidade ou os campos divergiram, retorna `status: partially_created`,
`created: true` e os mismatches. Se a API aceitou a requisição e nenhuma
persistência foi localizada, retorna `failed_validation`. Se o snapshot anterior
não puder ser lido, a criação é bloqueada antes do `POST`.

## Criação segura de recorrências

O backend materializa recorrências com 12 ocorrências. O preview e a execução
usam `installments: 12` e retornam `series_preview` com todas as datas, o valor
por ocorrência, o total projetado e o estado `paid` de cada ocorrência.
Parcelamentos também retornam esse preview por ocorrência. Recorrências mensais
iniciadas nos dias 29, 30 ou 31 são bloqueadas antes do `POST`: a API pode fazer
overflow de fevereiro para março, pulando fevereiro e criando duas ocorrências
em março.

O MCP não substitui uma série por 12 transações independentes, pois isso
eliminaria a relação usada por operações com `scope: ALL`. Em parcelamentos e
recorrências, `paid: true` representa o estado inicial: somente a primeira
ocorrência é criada paga e as seguintes ficam pendentes. A validação usa esse
vetor esperado e não trata as ocorrências futuras como falha. Em compras no
cartão, `paid: false` é normalizado para `true` nesse estado inicial; preview e
execução retornam avisos explícitos para as duas regras.

## Atualização segura de transações

- Campo ausente preserva o valor atual.
- `null` explícito limpa somente campos anuláveis.
- Como a API ignora `description: null` e `description: ""`, o MCP codifica a
  limpeza de descrição como um único espaço no `PUT` e o normaliza de volta para
  vazio nas leituras estruturadas. A API bruta permanece transparente.
- Antes do `PUT`, o MCP relê a transação e envia um payload completo mesclado.
- A localização por ID usa a data conhecida da busca, consulta conta e cartão nesse
  dia; não fica restrita ao mês atual.
- Em transações únicas, a nova data vai em `date` e os campos `edition_*` não são
  enviados. Em séries, `date` identifica a ocorrência original e `edition_date`
  recebe a nova data, conforme o contrato usado pela interface oficial.
- O argumento público `edition_date` é apenas uma dica para localizar uma
  transação histórica quando ela ainda não foi observada em uma busca.
- Depois da escrita, o MCP relê e confere campos alterados e preservados.
- `updated: true` representa alguma persistência confirmada. Uma gravação
  completa usa `status: success`; uma gravação parcial usa
  `status: partially_updated` e lista campos persistidos e rejeitados. Uma
  resposta HTTP aceita sem qualquer persistência produz `failed_validation`,
  `updated: false` e `api_accepted: true`.
- Se `changed_fields` estiver vazio, a operação retorna `status: unchanged` sem
  chamar a API nem incrementar os contadores de atualização.
- Lotes são sequenciais, respeitam `Retry-After`, usam chave de idempotência e
  retornam `success`, `partially_updated`, `unchanged`, `failed_request`,
  `failed_validation` e `not_attempted`.

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

`despezzas_list_credit_cards` é a fonte confiável para
`available_limit_cents`. O objeto `credit_card` aninhado em respostas brutas de
transações pode retornar `available_limit: 0` mesmo quando o limite disponível
real é diferente; buscas com `include_raw: true` incluem esse alerta e não
alteram o dado bruto.

Ao excluir uma transação `TRANSFER`, o preview localiza
`connected_transaction_id`. Esse identificador pode apontar para o ID bruto da
API ou ser compartilhado pelas duas pontas; o MCP resolve a relação e converte a
contraparte para o ID interno editável. A execução exclui as duas pontas
sequencialmente e relê ambas; relações ausentes ou ambíguas são bloqueadas e
falhas parciais são expostas individualmente, pois a API não oferece um endpoint
atômico conjunto.

`despezzas_leave_profile` confirma que o ID existe em `member_profiles` antes
da escrita e relê os vínculos depois. Uma mensagem de sucesso do backend não é
suficiente: o MCP só retorna `left: true` quando o vínculo realmente desaparece.

## Semântica MCP

- Leituras: `readOnlyHint=true`, não destrutivas e idempotentes.
- Criações: escrita não destrutiva e não idempotente.
- Atualizações e exclusões: destrutivas e idempotentes.
- Alternância de pagamento e API bruta: destrutivas e não idempotentes.
- Todas as ferramentas operam apenas na API Despezzas configurada:
  `openWorldHint=false`.

`despezzas_raw_api` é uma ferramenta avançada de diagnóstico. Prefira ferramentas
específicas; métodos diferentes de GET exigem também `allow_destructive: true`.
