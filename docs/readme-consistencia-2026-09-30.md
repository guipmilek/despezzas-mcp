# Aplicação do padrão reutilizável de README

Data: 2026-09-30.

## Pedido e alcance

Guilherme pediu aplicar o padrão do README da guipm neste repositório para testar sua consistência. Confirmou a adaptação local dos dois idiomas, com identidade própria, capa compacta, mesmas seções e navegação, exemplo de uso sem dados financeiros e preservação das regras de segurança e implantação. Commit e push não fazem parte desta autorização.

Esta é a segunda aplicação do padrão v08, agora no perfil **biblioteca/ferramenta**, em vez de marca/design. O modelo é uma estrutura de apresentação, não um conjunto obrigatório de tecnologias ou informações pessoais.

## O que foi reutilizado

- Um H1, sete H2 na mesma ordem, emojis fixos e subtítulos sem decoração repetitiva.
- Índice expansível, âncoras ASCII estáveis, até três atalhos e um único retorno ao topo.
- Rótulos, ícones e dimensões dos oito SVGs neutros de ações e navegação.
- Badges flat-square separados entre condições do projeto e ferramentas.
- Detalhes expansíveis para informações complementares, sem ocultar os avisos essenciais.
- PT-BR e inglês com os mesmos fatos, comandos, destinos e recursos.

O padrão de origem está em [guipmilek/guipm](https://github.com/guipmilek/guipm/tree/main/02-exploracoes/readme/modelo). A cópia usada inclui a revisão local dos rótulos em PT-BR, ainda não enviada ao GitHub naquele repositório. A consulta futura ao link pode mostrar uma revisão diferente.

## O que foi adaptado

| Elemento | Aplicação neste projeto |
| --- | --- |
| Capa | 1200 × 260, com o PNG original incorporado sem alterar seus bytes |
| Identidade | Fundo `#F1F6FF` e texto `#12131B`, presentes no símbolo existente; navegação neutra |
| Estados | Projeto não oficial e licença MIT; nenhum indicador de testes ou serviço ativo |
| Recursos | Ferramentas reais, catálogo, contrato de escritas e documentação |
| Prévia | Nome e argumentos de `despezzas_status`; não apresenta uma resposta real |
| Primeiros passos | Execução local via stdio, Horizon, verificação e comparação de catálogos |
| Créditos | Autoria e recursos deste projeto; sem biografia ou contatos da guipm |
| Idiomas | Seletor comum com nomes textuais e bandeiras SVG de 20 px, nas duas versões |

O inglês anterior informava 36 ferramentas. A origem registra 37 ferramentas e o teste de catálogo declara esse conjunto; ambos os README agora informam 37. Os detalhes de validação já presentes no PT-BR também foram alinhados no inglês.

Os destinos antigos foram preservados com âncoras de compatibilidade onde as seções mudaram de lugar. O código do servidor, o catálogo, os contratos de escrita, as dependências, a licença e as instruções de implantação não foram alterados.

## Primeira rodada de verificação

A primeira adaptação e as verificações estruturais foram concluídas. Guilherme apontou depois que o acabamento não parecia consistente, citando as bandeiras. Os resultados abaixo documentam essa primeira rodada; não comprovam que todos os componentes visuais coincidiam com a referência. A avaliação de Guilherme permanece pendente; esta entrega não constitui aprovação final nem publicação.

| Verificação | Resultado em 2026-09-30 |
| --- | --- |
| Estrutura e navegação | Um H1, sete H2, um retorno ao topo e 53 destinos conferidos por idioma; caminhos locais e fragmentos existentes |
| Paridade | Mesmos fatos, comandos e blocos de código em PT-BR e inglês |
| Recursos visuais | 13 SVGs; os 12 recursos funcionais têm rótulos coerentes entre texto visível, título e texto alternativo, sem cortes de texto |
| Símbolo original | PNG incorporado na capa com os mesmos bytes do arquivo existente |
| Codificação | 17 arquivos de entrega em UTF-8 sem BOM e com LF; regras de `.gitattributes` limitadas a esses caminhos |
| Formatação e análise | `uv run --frozen ruff format --check .`: 31 arquivos já formatados; `uv run --frozen ruff check .`: aprovado |
| Testes | `uv run --frozen pytest`: 111 testes aprovados, em 2,90 segundos |
| Catálogo local | FastMCP inspect: versão 0.1.9, 37 ferramentas; sem chamada à API financeira |
| Prévia | PT-BR e inglês, temas claro e escuro, larguras de 1280 e 390 px; sem transbordamento da página em 390 px |
| Comparação com a guipm | Mesma ordem de seções, proporção de capa 1200 × 260 e composição de ações e navegação, com conteúdo e identidade próprios |
| Revisão independente | Três achados corrigidos e conferidos: isolamento da implantação, proteção do `.env` existente e padronização de fim de linha; nenhuma pendência restante na revisão |

O índice, os atalhos, o seletor de idioma e o retorno ao topo foram exercitados na prévia. Tabelas e blocos de código podem ter rolagem horizontal própria em telas pequenas. A conferência usou renderização Markdown pela API do GitHub em uma moldura local; não equivale à página final publicada nem a um teste em aparelho físico. Capturas e materiais de apoio locais ficam em `.agents/readme-preview/`, ignorado pelo Git.

O ambiente `.venv`, também ignorado, foi preparado a partir do `uv.lock` existente para executar as verificações. Código, testes, scripts, dependências declaradas, catálogo, licença, contratos e símbolo original permanecem sem alterações. Não houve alteração de configuração global ou implantação.

Nenhuma ferramenta foi chamada contra uma conta Despezzas. Não foram carregados credenciais, HARs ou dados financeiros para compor a apresentação.

## Correção após a comparação visual

Guilherme autorizou com “sim” corrigir o kit e alinhar as duas aplicações, sem commit/push. Foram preservados o seletor PT-BR/EN com bandeiras de 20 px, a ordem dos idiomas, o rótulo do índice em inglês e a escala dos badges: estados com ícones a 24 px, ferramentas monocromáticas a 26 px. Os ícones funcionais do Python e FastMCP são autorais e não representam logotipos oficiais. Créditos do Twemoji e dos ícones foram acrescentados aos dois idiomas.

O verificador do kit recebeu critérios para esses componentes e um parâmetro de comparação de outro README bilíngue completo. A base anterior falhava nos novos critérios de componentes; a execução final passou em **32/32**, incluindo cinco desvios simulados apenas em memória e rejeitados pelo teste.

A conferência visual atualizada mostrou as bandeiras e todos os recursos locais carregados em PT-BR/EN, com temas claro/escuro e larguras de 1280 e 390 px. Os textos dos 14 SVGs funcionais couberam nas imagens. A troca de idioma funcionou nos dois sentidos, o índice levou a Ferramentas e os retornos ao topo funcionaram. Em 390 px, a página não transbordou; tabelas e código podem ter rolagem própria. A prévia não substitui avaliação no GitHub publicado ou em aparelho físico.

O primeiro passe identificou falha do badge externo do Python na prévia e ordem invertida de objeto/valor nos estados em inglês. A correção agrupada adotou um SVG funcional local do Python e a mesma divisão objeto à esquerda / valor à direita nos dois idiomas. Título e alternativa textual em inglês usam dois-pontos para expressar essa divisão. Nenhum recurso remoto foi baixado para contornar restrições de exibição. A confirmação mostrou ambos os badges de ferramentas carregados a 26 px.

O lote atual soma 15 SVGs e 19 arquivos de entrega. Ruff passou e os 111 testes foram aprovados em 2,40 segundos. Código, dependências, contratos, implantação e PNG original continuam sem mudanças; nenhuma API financeira foi chamada.

## Continuidade

Correção local e verificações concluídas. Os registros “sem commit/push” acima descrevem as autorizações iniciais. O segundo uso testa a aplicação manual do padrão a um projeto de ferramenta; o verificador não julga fatos, tradução, qualidade visual ou todas as combinações de módulos opcionais.

## Autorização posterior de envio

Em 2026-09-30, Guilherme pediu “commites e pushes”, autorizando enviar o lote documental nos repositórios guipm e Despezzas MCP. Antes dos commits, passaram novamente as 32 verificações do kit e comparação, Ruff e os 111 testes do servidor, em 2,28 segundos. Os dois commits novos encontrados na main remota trazem orientações de conexão ao ChatGPT e isolamento por conta; essas orientações devem ser preservadas ao integrar o README.

A autorização não inclui dados financeiros, credenciais, implantação manual ou aprovação estética. A configuração de implantação não será alterada; um eventual fluxo automático disparado pelo push pertence à configuração existente e não foi validado nesta etapa. A confirmação do envio remoto deve ser feita após o push. Próxima avaliação: apresentação publicada no GitHub, separadamente da verificação local.

A integração preserva integralmente as orientações novas dos PRs #12 e #13: metadados e instruções de conexão ao ChatGPT ficam em detalhes dentro de Primeiros passos, com âncora e atalho no índice; o aviso de conta única permanece visível na Visão geral. Os demais arquivos desses commits remotos não são modificados por este lote. As instruções de interface foram preservadas da documentação remota, não revalidadas na interface do ChatGPT. Resolving Merge Conflicts orientou a conciliação dos dois README sem descartar os objetivos de nenhuma alteração.

Após a conciliação, passaram as 32 verificações do README, Ruff e os **113 testes** da base remota atualizada, em 2,35 segundos. Os sete blocos de código continuam idênticos entre idiomas. A checagem de codificação identificou conversão local de `.gitattributes` para CRLF pelo `core.autocrlf` do Git instalado; o arquivo recebeu sua própria regra `eol=lf` e normalização mecânica. Os 19 arquivos de entrega passaram novamente em UTF-8 sem BOM e LF. Systematic Debugging orientou o diagnóstico por evidência, sem mudar a configuração global; Verification Before Completion orientou as conferências anteriores ao envio.

## Proteção da main e destino do push

O GitHub rejeitou o push direto para `main` com GH013: exige pull request e o check `build`. As regras foram conferidas pela API e permanecem intactas. A branch escolhida para enviar este lote é `docs/readme-consistencia-2026-09-30`; a entrada na `main` depende do fluxo de PR. O pedido de commit/push não é tratado como autorização para bypass, force push, merge ou implantação manual. A abertura e a integração de um PR ficam para confirmação separada.

[PT-BR](../README.md) · [English](../README.en.md) · [Recursos da apresentação](../assets/readme/)
