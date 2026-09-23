# GassFlow! BPM — Servidor de Licenças

Serviço central da **Gass System** que gerencia e valida as licenças do GassFlow! BPM.
Cada instalação do GassFlow! (em cada cliente) consulta este serviço ao abrir o app.

- **Node.js 20+** + **Express** + **MySQL** (`mysql2`).
- Roda na TurboCloud junto do MySQL.
- **Independente** do resto do repositório (frontend Angular, backend Protheus).

## Modelo

Uma **licença** = validade + status + cliente:

| campo | descrição |
|---|---|
| `chave` | `DCF-XXXXX-XXXXX-XXXXX-XXXXX` (gerada automaticamente) |
| `cliente_nome` / `cliente_cnpj` | razão social e CNPJ do **contratante** |
| `produto` | `gassflow_bpm` (GassFlow! BPM) · `bpo_fopag` (BPO FOPAG GASS) |
| `plano` | `full` (perpétua) · `anual` · `mensal` |
| `status` | `ativa` · `suspensa` · `cancelada` |
| `inicio` / `fim` | vigência (datas); `fim` NULL = perpétua (plano full) |
| `tolerancia_dias` | dias de uso **após** expirar antes de bloquear (padrão 7) |
| **grupo de CNPJs** | `licenca_cnpjs`: outras empresas do grupo cobertas pela mesma licença |

Quando a empresa contrata para o **grupo econômico**, a licença cobre o CNPJ
contratante **+** os CNPJs cadastrados no grupo. Um CNPJ é "coberto" se for o
contratante ou estiver no grupo.

Cada instalação que valida deixa um registro em `licenca_ativacoes` (onde a licença
está sendo usada + último check-in).

Todo CNPJ que chama `/validar` é também registrado em `leads` (**Possíveis clientes**
na tela de gerência) — é uma empresa que já roda o GassFlow! BPM. Guarda a última
chave informada, o veredito, contagem/datas de consulta e um campo `situacao`
(`novo` · `em_contato` · `cliente` · `descartado`) + observação editáveis pelo admin.
A aba tem um **painel de monitoramento** no topo (KPIs, leads por situação,
cobertura da licença informada, veredito da última validação, novos leads nos
últimos 30 dias e os CNPJs mais ativos) alimentado por `GET /api/v1/admin/leads/resumo`.

Endpoints: `GET /api/v1/admin/leads?situacao=&q=`, `GET /api/v1/admin/leads/resumo`,
`PATCH /api/v1/admin/leads/:id`, `DELETE /api/v1/admin/leads/:id`.

### Regra de validação (o que o GassFlow! recebe)

| situação | `valida` | `bloquear` | comportamento no app |
|---|---|---|---|
| dentro da vigência | ✅ | ❌ | usa normal; aviso de renovação nos últimos 15 dias |
| expirada, dentro da tolerância | ✅ | ❌ | usa, mas com faixa "licença expirada — bloqueio em N dias" |
| expirada + tolerância vencida | ❌ | ✅ | tela de bloqueio |
| `suspensa` / `cancelada` / não encontrada | ❌ | ✅ | tela de bloqueio |
| CNPJ não cadastrado, ≤ 7 dias do 1º contato (`cnpj_em_avaliacao`) | ✅ | ❌ | usa, com faixa "CNPJ ainda não cadastrado — acesso liberado por N dia(s)" |
| CNPJ não cadastrado, > 7 dias do 1º contato (`cnpj_nao_coberto`) | ❌ | ✅ | tela de bloqueio |

`cnpj_coberto` só é avaliado quando a instalação envia o próprio `cnpj` no
`POST /validar` (`true` / `false` / `null` = não informado).

Um CNPJ que ainda não está na licença (nem contratante, nem no grupo) ganha uma
**janela de cortesia de 7 dias** contada do primeiro `/validar` (âncora =
`leads.primeira_consulta`), enquanto a licença em si estiver válida. Passados os
7 dias, passa a bloquear. Se a licença já está suspensa/expirada, o veredito dela
prevalece — não há cortesia.

## Rodando

```bash
cd license-server
cp .env.example .env      # preencher DB_* e JWT_SECRET
npm install
npm run migrate           # cria as tabelas no MySQL
npm run criar-usuario     # cria o 1º usuário da área de gerenciamento (pergunta nome/e-mail/senha)
npm start                 # sobe o serviço
```

- Gerência: `http://localhost:8090/admin/` → tela de **login** (e-mail + senha)
- Health: `GET /health`

### Acesso à área de gerenciamento

A gerência exige **login**. Usuários ficam na tabela `usuarios` (senha com scrypt).

- 1º usuário: `npm run criar-usuario` (também aceita `--nome`/`--email`/`--senha`
  ou `SEED_NOME`/`SEED_EMAIL`/`SEED_SENHA`; rodar de novo com o mesmo e-mail
  redefine a senha e reativa).
- Demais usuários: pela própria tela, aba **Usuários** (criar, ativar/desativar,
  trocar senha, excluir). Desativar um usuário derruba o acesso na hora, mesmo
  com sessão aberta. Não dá para excluir/desativar o último usuário ativo nem a
  si mesmo.
- Sessão: token assinado (HMAC, `JWT_SECRET`), validade 8 h, guardado no
  navegador.

### Deploy na TurboCloud (Hospedagem cPanel)

Pré-requisito: plano com **Node.js** no cPanel ("Setup Node.js App" / CloudLinux
Node.js Selector). Todas as dependências são JS puro (sem compilar nada).

**1. Banco de dados** — cPanel → *MySQL® Databases*
- Cria o banco (o cPanel prefixa: `contadaconta_docflow`).
- Cria um usuário, senha forte, e adiciona ao banco com **ALL PRIVILEGES**.
- Anota os nomes reais (com prefixo). `DB_HOST` = `localhost`.

**2. Subdomínio** — cPanel → *Domains* / *Subdomains*
- Cria `licencas.gasssystem.com.br` (ou o que preferir).
- Depois: *SSL/TLS Status* → **Run AutoSSL** nesse subdomínio (HTTPS Let's Encrypt).

**3. Código** — pasta `license-server/` na home do cPanel
- Via *Git Version Control* (clona o repo) **ou** *File Manager* (sobe um zip da
  pasta `license-server/` **sem** `node_modules/` nem `.env`, e extrai).
- Ex.: `~/license-server`.

**4. Criar a aplicação** — cPanel → *Setup Node.js App* → **Create Application**
- Node.js version: **20.x** (ou a mais alta disponível)
- Application mode: **Production**
- Application root: `license-server` (a pasta do passo 3)
- Application URL: o subdomínio do passo 2
- Application startup file: `server.cjs`
  (o loader do LiteSpeed/Passenger faz `require()` síncrono e espera receber o
  `app`; `server.cjs` repassa o `src/index.js`. O projeto é CommonJS.)
- **Não** definir `PORT` — o Passenger cuida disso.

**5. Variáveis de ambiente** — na mesma tela, seção *Environment variables*:

| variável | valor |
|---|---|
| `NODE_ENV` | `production` |
| `DB_HOST` | `localhost` |
| `DB_PORT` | `3306` |
| `DB_USER` | usuário MySQL (com prefixo) |
| `DB_PASSWORD` | senha do MySQL |
| `DB_NAME` | banco (com prefixo) |
| `DB_SSL` | `false` |
| `JWT_SECRET` | `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `CORS_ORIGINS` | `*` |
| `AVISO_ANTECEDENCIA_DIAS` | `15` |

**6. Instalar dependências** — botão **Run NPM Install** na tela da aplicação.

**7. Migração + 1º usuário** — sem SSH, dá pra fazer pela própria tela:
- *Run JS script* → escolhe **`migrate`** → executa (cria as tabelas).
- Adiciona temporariamente as variáveis `SEED_NOME`, `SEED_EMAIL`, `SEED_SENHA`.
- *Run JS script* → escolhe **`criar-usuario`** → executa.
- **Remove** `SEED_SENHA` (e as outras SEED\_) depois.
- (Com SSH/Terminal do cPanel: entra no virtualenv que a tela mostra e roda
  `npm run migrate` / `npm run criar-usuario` normalmente.)

**8. Restart** — botão **Restart** na tela da aplicação (sempre que mudar env ou código).

**9. Conferir**
- `https://licencas.gasssystem.com.br/health` → `{"ok":true,"db":"up"}`
- `https://licencas.gasssystem.com.br/admin/` → tela de login
- A página de login também responde na raiz do subdomínio (o Passenger serve
  `public/` como docroot) — normal.

**Atualizar depois:** subir o código novo (git pull / novo zip) → *Run NPM Install*
se mudou dependência → *Run JS script* → `migrate` se houver migração nova →
**Restart**.

## API

### Pública — usada pelo GassFlow!

```
POST /api/v1/licencas/validar
Content-Type: application/json

{ "chave": "DCF-...", "cnpj": "00.000.000/0000-00", "instancia": "<cnpj>-<empresa>-<filial>", "versao": "1.0.0" }
```

`cnpj` é opcional; quando enviado, o servidor confere se esse CNPJ está coberto
pela licença (contratante ou grupo).

Resposta (HTTP 200 sempre):
```json
{
  "valida": true,
  "bloquear": false,
  "status": "ativa",
  "aviso": "Sua licença do GassFlow! BPM expira em 9 dia(s) (31/12/2026)...",
  "cliente": "Empresa X LTDA",
  "expira_em": "2026-12-31",
  "dias_restantes": 9,
  "cnpj_coberto": true
}
```

### Autenticação

```
POST /api/v1/auth/login   { email, senha }  ->  { token, usuario }
GET  /api/v1/auth/eu       (Bearer token)    ->  usuário logado
```

### Gerência — `Authorization: Bearer <token do login>`

| método | rota | |
|---|---|---|
| GET | `/api/v1/admin/licencas?status=&cnpj=&q=` | listar |
| POST | `/api/v1/admin/licencas` | criar (gera a chave) |
| GET | `/api/v1/admin/licencas/:id` | detalhe + veredito + ativações |
| PATCH | `/api/v1/admin/licencas/:id` | atualizar (status, fim, tolerância, cliente...) |
| DELETE | `/api/v1/admin/licencas/:id` | excluir (para desativar sem perder histórico, use `PATCH status=cancelada`) |
| GET | `/api/v1/admin/licencas/:id/ativacoes` | check-ins daquela licença |
| POST | `/api/v1/admin/licencas/:id/renovar` | renovar `{ periodos? }` ou `{ ate? }` |
| POST | `/api/v1/admin/licencas/:id/plano` | trocar plano `{ plano }` |
| GET | `/api/v1/admin/licencas/:id/cnpjs` | listar CNPJs do grupo |
| POST | `/api/v1/admin/licencas/:id/cnpjs` | adicionar ao grupo `{ cnpj, razao_social? }` |
| DELETE | `/api/v1/admin/licencas/:id/cnpjs/:cnpjId` | remover do grupo |
| GET | `/api/v1/usuarios` | listar usuários da gerência |
| POST | `/api/v1/usuarios` | criar `{ nome, email, senha }` |
| PATCH | `/api/v1/usuarios/:id` | atualizar `{ nome?, email?, ativo?, senha? }` |
| DELETE | `/api/v1/usuarios/:id` | excluir |

## Integração no GassFlow! (feita)

O GassFlow! **não** chama este serviço direto — quem valida é o **Protheus**:

1. `chave` + endereço deste serviço ficam em `gflow_bpm_config` (ENTIDADE `licenca`),
   informados em **Configurações > Licença** no BPM.
2. `U_GASSFLOW.tlpp` expõe `GET /tlpp/gassflow/licenca_status/:empresa/:filial`, que:
   - usa o cache do dia (`gflow_bpm_config` ENTIDADE `licenca-cache`) quando existe e
     não está bloqueado;
   - senão faz `POST /api/v1/licencas/validar` aqui (com `chave` + `cnpj` da SM0) e
     regrava o cache.
   - **Falha de rede nunca bloqueia** — só bloqueia com resposta explícita
     suspensa/cancelada/expirada.
3. O Angular (`LicencaService`, chamado no `app.ts`) consulta o Protheus, e o `App`
   troca todo o conteúdo pela tela `LicencaBloqueada` quando `bloquear: true`;
   `aviso` presente → faixa no topo.
