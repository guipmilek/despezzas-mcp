<a id="topo"></a>
<a id="top"></a>

<p align="right"><strong lang="pt-BR"><img src="https://raw.githubusercontent.com/jdecked/twemoji/b6b55fef1e8636b540a6d016a4729ca8cdf2e60b/assets/svg/1f1e7-1f1f7.svg" width="20" height="20" alt="Brasil"> Português</strong> · <a href="README.en.md" lang="en" title="Read in English"><img src="https://raw.githubusercontent.com/jdecked/twemoji/b6b55fef1e8636b540a6d016a4729ca8cdf2e60b/assets/svg/1f1fa-1f1f8.svg" width="20" height="20" alt="Estados Unidos"> English</a></p>

![Despezzas MCP — símbolo do projeto e nome sobre fundo azul-claro](assets/readme/capa.svg)

# Despezzas MCP

**MCP não oficial para consultar e administrar dados financeiros do Despezzas.**

Conecte seu cliente MCP à sua conta, consulte informações e prepare alterações antes de executá-las. Este repositório reúne o servidor, os testes e as orientações de uso.

<p>
  <a href="#overview"><img src="assets/readme/estado-projeto.pt-br.svg" width="180" height="24" alt="Projeto não oficial"></a>
  <a href="LICENSE"><img src="assets/readme/estado-licenca.pt-br.svg" width="140" height="24" alt="Licença MIT"></a>
</p>

<p>
  <a href="#getting-started"><img src="assets/readme/acao-comecar.pt-br.svg" width="200" height="36" alt="Ver primeiros passos"></a>
  <a href="#preview"><img src="assets/readme/acao-previa.pt-br.svg" width="143" height="36" alt="Ver a prévia"></a>
  <a href="src/despezzas_mcp/"><img src="assets/readme/acao-arquivos.pt-br.svg" width="144" height="36" alt="Ver arquivos"></a>
</p>

<details>
<summary>📒 Índice — ver as seções</summary>

- [📍 Visão geral](#overview)
- [✨ Recursos](#features)
- [🎨 Prévia](#preview)
- [🛠️ Ferramentas](#tools)
- [🚀 Primeiros passos](#getting-started)
  - [Conectar ao ChatGPT](#conectar-ao-chatgpt)
- [📄 Condições de uso](#terms)
- [👏 Créditos](#credits)

</details>

<a id="overview"></a>
<a id="visão-geral"></a>

## 📍 Visão geral

O servidor expõe **37 ferramentas MCP** para perfis, contas, cartões, categorias, transações, transferências, resumos e diagnósticos. Foi construído a partir de endpoints observados no aplicativo web e **não é afiliado ao Despezzas**.

O uso local é via stdio. A implantação remota mantida é no **Prefect Horizon**, com OAuth gerenciado pela plataforma. Cada fork e implantação representam uma única conta Despezzas; as sessões ficam apenas em memória.

> [!IMPORTANT]
> Este servidor acessa finanças reais. Toda escrita exige `confirm: true`; revise os dados antes de confirmar. Nunca inclua `.env`, tokens, senhas, sessões, HARs, respostas da API ou exportações financeiras no repositório. Nunca envie a senha do Despezzas como argumento de ferramenta.
>
> **Cada deployment é vinculado a uma única conta.** Faça fork do repositório,
> publique seu próprio deployment no Prefect Horizon e configure somente os seus
> secrets. Não use nem compartilhe o deployment de outra pessoa: ele acessa os
> dados financeiros definidos nos secrets daquele servidor.

<a id="features"></a>
<a id="ferramentas-e-segurança"></a>

## ✨ Recursos

| O que você quer fazer? | Ferramentas e orientações |
| --- | --- |
| Consultar perfis, contas e cartões | `despezzas_list_profiles`, `despezzas_list_accounts`, `despezzas_list_credit_cards` |
| Buscar transações e consultar resumos | `despezzas_get_transaction`, `despezzas_search_transactions`, `despezzas_finance_summary` |
| Preparar uma alteração sem executá-la | `despezzas_prepare_create_transaction`, `despezzas_prepare_update_transaction`, `despezzas_prepare_batch_update_transactions` |
| Entender as regras de escrita | [Contrato de escritas](WRITES.md) · [Segurança](SECURITY.md) |
| Implantar e conectar um cliente | [Prefect Horizon](docs/deployment.md) · [Conexão de clientes MCP](docs/chatgpt-app-setup.md) |
| Consultar o catálogo e o código | [Catálogo em llms.txt](llms.txt) · [Ferramentas do servidor](src/despezzas_mcp/tools.py) |

Valores monetários usam **centavos inteiros** (`12345` = `R$ 123,45`); datas usam `YYYY-MM-DD`. As ferramentas publicam esquemas de entrada e saída e anotações MCP explícitas para distinguir leituras, criações, atualizações, exclusões e operações não idempotentes.

Criações e edições de transação são relidas e validadas após a escrita. Campo omitido é preservado; `null` explícito limpa campos anuláveis. A API bruta é um recurso avançado: métodos diferentes de GET exigem **`allow_destructive: true` e `confirm: true`**.

<details>
<summary>Ver limites e detalhes das operações</summary>

- A criação compara o estado anterior e confere quantidade, datas, parcelas e campos persistidos. A edição lê e mescla os dados antes do `PUT`.
- A busca oferece `offset`, cursor opaco e ordenação estável. `despezzas_get_transaction` localiza um ID fora do mês atual.
- `despezzas_status` informa a versão pública do servidor.
- Em séries, a prévia mostra o pagamento de cada ocorrência: somente a primeira pode iniciar paga; as futuras ficam pendentes.
- Recorrências mensais iniciadas nos dias 29, 30 ou 31 são bloqueadas devido ao comportamento de datas da API.
- Escritas parciais são informadas explicitamente; não são repetidas automaticamente nem têm reversão automática. Releia o estado antes de preparar apenas as alterações restantes.
- Exclusões de transferência tratam as duas pontas conectadas, inclusive relações que usam o ID bruto da API.
- `available_limit_cents` é somente leitura e não pertence aos esquemas de criação ou edição de cartão. Consulte esse valor pela lista de cartões.

O [contrato de escritas](WRITES.md) detalha validação, persistência parcial, recorrências e segurança. Os [registros da API](docs/despezzas-api-notes.md) documentam os comportamentos observados.

</details>

<a id="preview"></a>

## 🎨 Prévia

### Verificar a conexão

Após configurar o servidor, selecione `despezzas_status` no Inspector ou no cliente MCP. A ferramenta informa a versão e o estado de autenticação, sem alterar dados financeiros.

```json
{
  "name": "despezzas_status",
  "arguments": {}
}
```

O exemplo mostra apenas o nome da ferramenta e os argumentos. Não é uma resposta real, um arquivo de configuração de cliente nem uma comprovação de implantação ativa.

### Preparar antes de confirmar

1. Consulte os recursos e IDs atuais.
2. Use uma ferramenta `despezzas_prepare_*` e revise a prévia.
3. Execute a ferramenta de escrita somente depois de revisar os argumentos e enviar `confirm: true`.

As prévias podem consultar dados para montar a comparação, mas não escrevem. Para exemplos de pedidos em linguagem natural, veja [como conectar um cliente MCP](docs/chatgpt-app-setup.md).

<a id="tools"></a>

## 🛠️ Ferramentas

### Servidor

<p>
  <a href="pyproject.toml"><img src="assets/readme/ferramenta-python.svg" width="155" height="26" alt="Python &gt;= 3.11"></a>
  <a href="pyproject.toml"><img src="assets/readme/ferramenta-fastmcp.svg" width="148" height="26" alt="FastMCP 3.x"></a>
</p>

Python e FastMCP compõem o servidor. HTTPX faz as requisições à API; Pydantic define e valida os modelos. As dependências e seus intervalos de versão estão em [pyproject.toml](pyproject.toml).

### Desenvolvimento e implantação

| Ferramenta | Uso no projeto |
| --- | --- |
| uv | Instalar dependências e executar comandos |
| pytest | Verificar o catálogo e os comportamentos do servidor |
| Ruff | Formatar e analisar o código |
| Prefect Horizon | Implantar o MCP remoto e gerenciar sua autenticação OAuth |

Os badges identificam tecnologias e condições documentadas. Não comprovam versões instaladas, testes aprovados ou disponibilidade do serviço.

<a id="getting-started"></a>
<a id="início-rápido"></a>

## 🚀 Primeiros passos

### Executar localmente

Você precisa de **Python 3.11 ou superior**, [uv](https://docs.astral.sh/uv/) e acesso a uma conta Despezzas. Obtenha o código:

```powershell
git clone https://github.com/guipmilek/despezzas-mcp.git
cd despezzas-mcp
uv sync --extra dev
if (-not (Test-Path -LiteralPath .env)) { Copy-Item .env.example .env }
```

Edite o arquivo `.env` no seu computador. Configure uma destas opções:

- `DESPEZZAS_TOKEN`; ou
- `DESPEZZAS_EMAIL`, `DESPEZZAS_PASSWORD` e `DESPEZZAS_FIREBASE_API_KEY`.

Se `.env` já existir, preserve sua configuração. Não o inclua no controle de versão.

```powershell
uv run --env-file .env despezzas-mcp
```

Esse comando inicia o servidor via **stdio**; o cliente MCP precisa iniciá-lo e se comunicar com ele por esse transporte. A sessão Firebase fica em memória. Após uma nova inicialização sem sessão, o servidor autentica novamente com as credenciais configuradas.

<a id="conectar-ao-chatgpt"></a>

<details>
<summary>Conectar ao ChatGPT</summary>

Depois de publicar seu próprio fork e deployment, use estes metadados ao adicionar
o MCP no ChatGPT. Nunca use a URL de outra pessoa:

| Campo | Valor |
| --- | --- |
| Nome | `Despezzas` |
| Descrição | `Consulte e gerencie perfis, contas, cartões, transações, transferências e resumos financeiros do Despezzas, com confirmação obrigatória antes de alterações.` |
| URL | `https://seu-servidor.fastmcp.app/mcp` — substitua pela URL do seu deployment |
| Autenticação | OAuth |
| Imagem | [`assets/despezzas-mcp.png`](assets/despezzas-mcp.png) — PNG quadrado, 512 × 512, menor que 100 KB |

Ative o modo de desenvolvedor em **Configurações → Segurança e login**, abra
**Plugins**, selecione **+**, preencha os campos acima e conclua a autenticação.
Veja o [guia de conexão com o ChatGPT](docs/chatgpt-app-setup.md) para o passo a
passo, os testes de validação e a atualização do catálogo.

</details>

<a id="deploy-no-prefect-horizon"></a>

<details>
<summary>Implantar no Prefect Horizon e conectar um cliente</summary>

1. Faça fork deste repositório.
2. Entre em [horizon.prefect.io](https://horizon.prefect.io/) com GitHub e escolha o fork.
3. Use o ponto de entrada `src/despezzas_mcp/server.py:mcp`.
4. Cadastre as credenciais do Despezzas nos secrets do Horizon.
5. Habilite **Authentication**.
6. Faça a implantação e teste primeiro `despezzas_status` no Inspector.
7. Conecte o cliente MCP à URL `/mcp` fornecida pelo Horizon, com OAuth.

O endpoint terá formato semelhante a `https://seu-servidor.fastmcp.app/mcp`. Use uma implantação por conta; não compartilhe a implantação entre pessoas nem as credenciais. Conceder acesso ao MCP permite acessar a conta financeira configurada, mesmo sem revelar os secrets.

[Guia de implantação](docs/deployment.md) · [Conexão de clientes MCP](docs/chatgpt-app-setup.md)

</details>

<a id="desenvolvimento"></a>

<details>
<summary>Desenvolver e verificar o servidor</summary>

```powershell
uv sync --extra dev
uv run ruff format --check .
uv run ruff check .
uv run pytest
uv run fastmcp inspect src/despezzas_mcp/server.py:mcp
```

Para aplicar a formatação, use `uv run ruff format .`.

O teste de conexão abaixo é **opcional**, somente leitura e acessa endpoints reais. Execute-o apenas quando precisar verificar a integração e tiver configurado as credenciais:

```powershell
uv run --env-file .env python scripts/smoke_readonly.py
```

Para inspecionar um HAR com dados mascarados:

```powershell
uv run python scripts/inspect_har.py C:\caminho\captura.har
```

Não publique a captura original. Consulte [como contribuir](CONTRIBUTING.md) e as [instruções para agentes](AGENTS.md) antes de alterar contratos ou arquitetura.

</details>

<a id="comparação-com-o-mcp-oficial"></a>

<details>
<summary>Comparar o catálogo com o MCP oficial</summary>

O endpoint oficial documentado pelo projeto é `https://api.despezzas.com/mcp`. Para comparar apenas metadados, autentique pelo navegador e liste os catálogos:

```powershell
uv run fastmcp list https://api.despezzas.com/mcp --auth oauth --json
uv run fastmcp list src/despezzas_mcp/server.py --json
```

Não salve argumentos, resultados de ferramentas ou dados financeiros. Metas, faturas e investimentos dependem de endpoints autenticados comprovados e documentados; não são capacidades declaradas deste servidor. Veja a [matriz competitiva datada](docs/competitive-matrix.md).

</details>

<a id="terms"></a>

## 📄 Condições de uso

O projeto declara a [licença MIT](LICENSE). A integração não é oficial e usa endpoints não documentados, que podem mudar.

A licença não cria vínculo com o Despezzas nem garante disponibilidade do serviço externo. Você continua responsável por revisar e autorizar operações na sua conta. Consulte as [orientações de segurança](SECURITY.md) e o [contrato de escritas](WRITES.md).

<a id="credits"></a>

## 👏 Créditos

- **Autoria:** Guilherme Milek, conforme [pyproject.toml](pyproject.toml) e [LICENSE](LICENSE).
- **Desenvolvimento:** majoritariamente assistido por IA, com revisão humana.
- **Símbolo:** arquivo existente do projeto, preservado em [assets/despezzas-mcp.png](assets/despezzas-mcp.png). A capa apenas o incorpora; não substitui o original.
- **Estrutura e navegação do README:** adaptação do padrão reutilizável desenvolvido por Guilherme; os ícones funcionais locais são autorais.
- **Ícones funcionais:** SVGs locais autorais para ações, estados, Python e FastMCP; não são logotipos oficiais das ferramentas.
- **Bandeiras:** Twemoji, Twitter, Inc. e demais colaboradores; [CC BY 4.0](https://github.com/jdecked/twemoji/blob/b6b55fef1e8636b540a6d016a4729ca8cdf2e60b/LICENSE-GRAPHICS), sem alterações nos desenhos.

[Contribuir](CONTRIBUTING.md) · [Orientações de segurança](SECURITY.md) · [Registro desta adaptação](docs/readme-consistencia-2026-09-30.md)

---

<p align="right"><a href="#topo"><img src="assets/readme/voltar-ao-topo.pt-br.svg" width="157" height="32" alt="Voltar ao topo"></a></p>
