# Segurança

Este MCP acessa dados financeiros reais.

- Nunca faça commit de `.env`, tokens, senhas, sessões, HARs ou respostas da API.
- Cadastre credenciais apenas como secrets do Prefect Horizon.
- Habilite Authentication em todo deployment.
- Use um fork/deployment por conta; não compartilhe secrets entre usuários.
- A sessão Firebase existe apenas em memória e não é persistida.
- Nunca passe a senha do Despezzas como argumento de ferramenta.
- Revise toda escrita e exija `confirm: true`.
- Métodos não-GET de `despezzas_raw_api` também exigem `allow_destructive: true`.
- Troque imediatamente credenciais que aparecerem em chats, logs ou screenshots.

`DESPEZZAS_FIREBASE_API_KEY` é uma chave pública do frontend web, mas ainda deve ser
configurada por variável de ambiente, nunca hardcoded.
