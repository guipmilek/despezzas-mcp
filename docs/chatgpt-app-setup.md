# Conectar o deployment a um cliente MCP

Depois do deploy, copie a URL `https://seu-servidor.fastmcp.app/mcp` mostrada pelo
Horizon. A autenticação de entrada é gerenciada pelo Horizon; as credenciais do
Despezzas permanecem apenas nos secrets do servidor.

Para clientes que aceitam MCP remoto:

- Nome: `Despezzas`
- Server URL: URL `/mcp` do Horizon
- Authentication: OAuth

Prompts de teste:

- “Liste minhas contas.”
- “Quanto gastei este mês?”
- “Prepare uma despesa de R$ 45,90, sem criá-la.”

Antes de uma escrita real, revise os IDs e o payload preparado. Só então repita a
ferramenta de escrita com `confirm: true`.
