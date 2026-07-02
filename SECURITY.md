# Segurança

Este MCP pode ler e alterar dados financeiros pessoais. Trate-o como infraestrutura sensível.

- Nunca faça commit de `.env` ou tokens bearer.
- Considere senhas do Despezzas expostas se forem coladas em chats, logs, histórico de shell, screenshots ou arquivos versionados. Troque a senha depois de qualquer exposição acidental.
- Prefira repositórios privados no GitHub, a menos que você queira intencionalmente tornar o código público.
- Use `MCP_HTTP_BEARER_TOKEN` ao rodar o modo HTTP fora do localhost.
- Coloque HTTPS, autenticação e restrições por IP/mTLS na frente de qualquer endpoint MCP hospedado remotamente.
- A página HTTP `/login` aceita sua senha do Despezzas para autorizar este MCP. Use-a apenas no localhost ou atrás de um controle de acesso forte; criação de conta e recuperação de senha devem acontecer no app/site oficial do Despezzas.
- Para ChatGPT, prefira o modo OAuth. O ChatGPT deve receber apenas um token de acesso MCP opaco, nunca sua senha do Despezzas, refresh token do Firebase ou bearer token do Despezzas.
- Revise toda chamada de ferramenta de escrita antes de passar `confirm: true`.

Se um token do Despezzas for exposto, encerre sessões do Despezzas e troque credenciais quando possível.
