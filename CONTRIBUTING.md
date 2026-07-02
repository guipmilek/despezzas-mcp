# Contribuindo

Obrigado por considerar uma contribuicao. Este projeto integra um servico financeiro pessoal e usa endpoints nao documentados do Despezzas, entao mudancas devem ser pequenas, revisaveis e cuidadosas com dados sensiveis.

## Como contribuir

1. Abra uma issue descrevendo bug, melhoria ou endpoint novo antes de mudancas grandes.
2. Crie um branch a partir de `main`.
3. Rode as verificacoes locais:

   ```powershell
   npm ci
   npm run typecheck
   npm test
   ```

4. Nunca inclua `.env`, tokens, senhas, arquivos de sessao, HARs nao mascarados ou respostas reais da API com dados pessoais.
5. Para novas ferramentas de escrita, mantenha `confirm: true` obrigatorio e adicione testes cobrindo payloads perigosos ou ambiguos.
6. Se mudar arquitetura, comandos, ferramentas MCP ou regras importantes para agentes, atualize `llms.txt`.

## Uso de IA

Este projeto foi desenvolvido de forma majoritariamente assistida por IA ("vibecoded"), com direcao tecnica, conhecimento de programacao e revisao manual de Guilherme Milek. Contribuicoes geradas ou editadas por IA sao bem-vindas, mas devem ser verificadas pelo autor antes do envio.

Agentes de IA devem ler `llms.txt` antes de modificar o projeto e devem validar comportamento com codigo-fonte, testes e execucoes locais quando aplicavel.

## Capturas de API

Se usar HARs ou logs do DevTools para mapear endpoints, mascare antes de anexar qualquer trecho. O script `npm run inspect:har -- caminho/arquivo.har` ja mascara campos comuns, mas revise manualmente o resultado.
