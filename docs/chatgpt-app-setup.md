# Conectar o Despezzas MCP ao ChatGPT

Publique primeiro o seu fork no Prefect Horizon. Cada deployment representa uma
única conta Despezzas. Copie do Horizon a URL terminada em `/mcp`, semelhante a:

```text
https://seu-servidor.fastmcp.app/mcp
```

A autenticação de entrada é gerenciada pelo Horizon. Tokens, senha e demais
credenciais do Despezzas permanecem somente nos secrets do servidor.

## Metadados prontos para copiar

| Campo | Valor |
| --- | --- |
| Nome | `Despezzas` |
| Descrição | `Consulte e gerencie perfis, contas, cartões, transações, transferências e resumos financeiros do Despezzas, com confirmação obrigatória antes de alterações.` |
| Server URL | A URL `/mcp` exibida pelo seu deployment no Horizon |
| Authentication | OAuth |
| Imagem | [`assets/despezzas-mcp.png`](../assets/despezzas-mcp.png) |
| Formato da imagem | PNG quadrado, 512 × 512, menor que 100 KB |

## Passo a passo no ChatGPT

1. Abra **Configurações**.
2. Entre em **Segurança e login** e ative o **Modo de desenvolvedor**.
3. Abra **Plugins**.
4. Selecione **+** para adicionar um plugin.
5. Informe o nome, a descrição e a Server URL da tabela acima.
6. Quando a interface solicitar uma imagem, envie
   `assets/despezzas-mcp.png`.
7. Crie a conexão e conclua o OAuth do Horizon.
8. Revise as ferramentas e os metadados detectados antes de usar o MCP.

A disponibilidade do modo de desenvolvedor e de plugins pode depender do plano e
das políticas do workspace. Consulte a
[documentação oficial de conexão do ChatGPT](https://developers.openai.com/plugins/deploy/connect-chatgpt).

## Validar a conexão

Execute, nesta ordem:

- “Mostre o status do Despezzas.”
- “Liste meus perfis e contas sem alterar nada.”
- “Quanto gastei este mês?”
- “Prepare uma despesa de R$ 45,90, sem criá-la.”

Uma escrita deve primeiro retornar o preview sem persistir a alteração. Revise
perfil, conta, valores, datas e payload antes de repetir a ferramenta com
`confirm: true`.

## Atualizar depois de um deploy

Se ferramentas ou parâmetros mudarem e o ChatGPT continuar mostrando um catálogo
antigo:

1. confirme que o novo deployment está saudável;
2. remova a conexão antiga do plugin;
3. adicione novamente a mesma URL `/mcp`;
4. repita os testes de validação acima.

Nunca coloque credenciais ou dados financeiros na descrição, na URL ou em prompts.
