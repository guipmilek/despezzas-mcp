# Contribuindo

Obrigado por considerar uma contribuição. Este projeto integra um serviço financeiro pessoal e usa endpoints não documentados do Despezzas, então mudanças devem ser pequenas, revisáveis e cuidadosas com dados sensíveis.

## Como contribuir

1. Abra uma issue descrevendo bug, melhoria ou endpoint novo antes de mudanças grandes.
2. Crie um branch a partir de `main`.
3. Rode as verificações locais:

   ```powershell
   npm ci
   npm run typecheck
   npm test
   ```

4. Nunca inclua `.env`, tokens, senhas, arquivos de sessão, HARs não mascarados ou respostas reais da API com dados pessoais.
5. Para novas ferramentas de escrita, mantenha `confirm: true` obrigatório e adicione testes cobrindo payloads perigosos ou ambíguos.
6. Se mudar arquitetura, comandos, ferramentas MCP ou regras importantes para agentes, atualize `llms.txt`.

## Uso de IA

Este projeto foi desenvolvido de forma majoritariamente assistida por IA ("vibecoded"), com direção técnica, conhecimento de programação e revisão manual de Guilherme Milek. Contribuições geradas ou editadas por IA são bem-vindas, mas devem ser verificadas pelo autor antes do envio.

Agentes de IA devem ler `llms.txt` antes de modificar o projeto e devem validar comportamento com código-fonte, testes e execuções locais quando aplicável.

## Capturas de API

Se usar HARs ou logs do DevTools para mapear endpoints, mascare antes de anexar qualquer trecho. O script `npm run inspect:har -- caminho/arquivo.har` já mascara campos comuns, mas revise manualmente o resultado.
