# Conectar o Despezzas MCP ao ChatGPT

> [!IMPORTANT]
> Faça fork deste repositório e publique o seu próprio deployment no Prefect
> Horizon. Cada deployment acessa a conta Despezzas definida nos secrets daquele
> servidor. Não use a URL publicada pelo mantenedor nem o deployment de outra
> pessoa.

Copie do seu deployment a URL terminada em `/mcp`, semelhante a:

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

1. Confirme que você publicou o seu fork e copiou a URL do seu deployment.
2. Abra **Configurações**.
3. Entre em **Segurança e login** e ative o **Modo de desenvolvedor**.
4. Abra **Plugins**.
5. Selecione **+** para adicionar um plugin.
6. Informe o nome, a descrição e a Server URL da tabela acima.
7. Quando a interface solicitar uma imagem, envie
   `assets/despezzas-mcp.png`.
8. Crie a conexão e conclua o OAuth do seu deployment no Horizon.
9. Revise as ferramentas e os metadados detectados antes de usar o MCP.

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
Nunca conecte o ChatGPT a um deployment que não seja o seu.
