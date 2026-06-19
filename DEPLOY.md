# Deploy no Railway

## Precisa do GitHub?

**Não é obrigatório**, mas é o jeito mais prático.

| Método | Quando usar |
|--------|-------------|
| **GitHub** (recomendado) | Atualiza o site automaticamente a cada `git push` |
| **Railway CLI** | Sobe direto do seu PC, sem criar repositório |

---

## Opção A — Com GitHub (recomendado)

### 1. Criar repositório no GitHub

No GitHub: **New repository** → nome ex. `lista-presenca` → criar vazio.

### 2. Enviar o código

```powershell
cd C:\Projetos\lista
git init
git add .
git commit -m "Sistema de confirmação de presença"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/lista-presenca.git
git push -u origin main
```

### 3. Conectar no Railway

1. Acesse [railway.app](https://railway.app) e entre com GitHub
2. **New Project** → **Deploy from GitHub repo**
3. Selecione o repositório `lista-presenca`
4. Railway detecta Node.js e faz `npm ci` + `npm start` automaticamente

### 4. Variáveis de ambiente

No serviço → **Variables**:

| Variável | Valor |
|----------|-------|
| `ADMIN_SENHA` | sua senha forte para o painel admin |
| `BASE_URL` | URL pública do app (ex. `https://lista-presenca.up.railway.app`) |

> Depois do primeiro deploy, copie a URL gerada pelo Railway e use como `BASE_URL`. Se mudar o domínio, atualize essa variável.

### 5. Disco persistente (obrigatório)

Sem volume, a lista de convidados some a cada redeploy.

1. No serviço → **Volumes** → **Add Volume**
2. **Mount Path:** `/app/data`
3. Salvar e redeployar

### 6. Domínio público

1. **Settings** → **Networking** → **Generate Domain**
2. Use essa URL como `BASE_URL`

### 7. Importar convidados

Pelo terminal do Railway (**Deployments** → três pontos → **Open Shell**):

```bash
node scripts/importar.js convidados-exemplo.csv
```

Ou cadastre pelo painel: `https://SUA-URL/admin.html`

---

## Opção B — Sem GitHub (Railway CLI)

### 1. Instalar CLI

```powershell
npm install -g @railway/cli
railway login
```

### 2. Subir do PC

```powershell
cd C:\Projetos\lista
railway init
railway up
```

### 3. Configurar

```powershell
railway variables set ADMIN_SENHA="sua-senha-forte"
railway variables set BASE_URL="https://seu-app.up.railway.app"
```

Volume e domínio: configure no painel web do Railway (mesmos passos 5 e 6 acima).

Para atualizar depois: rode `railway up` de novo na pasta do projeto.

---

## Não precisa compilar

Este projeto **não tem build**. O Railway roda:

```
npm ci    ← instala dependências no servidor Linux
npm start ← inicia o server.js
```

Não envie a pasta `node_modules` — ela é gerada no deploy.
