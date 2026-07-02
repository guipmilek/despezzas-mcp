# Segurança

Este MCP acessa dados financeiros reais. Trate com o mesmo cuidado de uma senha bancária.

- Nunca faça commit de `.env` ou tokens bearer.
- `DESPEZZAS_FIREBASE_API_KEY` é uma chave pública do Firebase Web — o próprio frontend do Despezzas a expõe. Mesmo sendo pública, mantenha-a no `.env` ou como secret do Wrangler, nunca hardcoded no código. Para encontrá-la, abra https://despezzas.com, pressione F12, vá em Sources e procure por `apiKey`.
- Senhas do Despezzas estão comprometidas se aparecerem em chats, logs, histórico do terminal, screenshots ou arquivos versionados. Troque a senha imediatamente nesses casos.
- Prefira repositórios privados, a menos que o código seja intencionalmente público.
- Use `MCP_HTTP_BEARER_TOKEN` ao rodar o modo HTTP fora do localhost.
- Coloque HTTPS, autenticação e restrições por IP/mTLS na frente de qualquer endpoint MCP hospedado remotamente.
- A página `/login` pede sua senha do Despezzas. Use apenas em localhost ou com controle de acesso forte. Criação de conta e recuperação de senha são no app oficial do Despezzas.
- Para ChatGPT, prefira o modo OAuth. O ChatGPT recebe apenas um token OAuth opaco — nunca sua senha do Despezzas, refresh token do Firebase ou bearer token.
- Revise toda chamada de escrita antes de confirmar (`confirm: true`).

Se um token do Despezzas vazar, encerre as sessões ativas e troque as credenciais.
