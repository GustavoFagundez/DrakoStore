# Sistema de Estoque — Supabase + Vercel

Site estático (HTML, CSS e JavaScript puros, sem etapa de build).
Os dados ficam no **Supabase** (com login por e-mail e senha) e o site fica hospedado no **Vercel**.

## 1. Criar o banco no Supabase

1. Entre em <https://supabase.com> → **New project** (anote a senha do banco, mas você não vai precisar dela aqui).
2. Quando o projeto terminar de criar, abra **SQL Editor → New query**.
3. Abra o arquivo `supabase/schema.sql`, copie **tudo**, cole no editor e clique em **Run**.
   Deve aparecer "Success. No rows returned". Pode rodar de novo sem problemas.
4. Em **Project Settings → API**, copie:
   - **Project URL**
   - **anon / public key** (nos projetos novos aparece como *Publishable key*)
5. Abra o arquivo `config.js` e cole os dois valores. Essas chaves podem ficar no site: quem protege
   os dados é o login + as regras do banco. **Nunca** use a `service_role` / *secret key* aqui.

### Login (Authentication)

- Em **Authentication → Providers → Email** o login por e-mail já vem ligado.
- Por padrão o Supabase exige **confirmar o e-mail** depois de criar a conta (chega um link na caixa de entrada).
  Se preferir entrar direto, desligue **Confirm email** nessa mesma tela.
- Depois de criar a sua conta, **desligue os novos cadastros** para ninguém mais criar conta no seu sistema:
  **Authentication → Sign In / Providers → "Allow new users to sign up"** (desativar).
  Ou, se quiser liberar o acesso só para você, crie o usuário em **Authentication → Users → Add user**.
- Em **Authentication → URL Configuration**, coloque o endereço do seu site do Vercel em **Site URL**
  (assim o link do e-mail de confirmação abre o sistema certo).

## 2. Publicar no Vercel

**Opção A — pelo GitHub (recomendada, atualiza sozinho a cada alteração)**

1. Crie um repositório no GitHub e envie esta pasta (o conteúdo de `sistema-estoque`).
2. No <https://vercel.com> → **Add New → Project** → escolha o repositório → **Deploy**.
   - Framework Preset: **Other**
   - Build Command: deixe vazio · Output Directory: deixe vazio (a raiz já é o site)

**Opção B — pelo terminal, sem GitHub**

```bash
npm i -g vercel
cd sistema-estoque
vercel          # primeira vez: responde as perguntas (Framework: Other)
vercel --prod   # publica de verdade
```

Pronto: o Vercel te dá um endereço `https://seu-projeto.vercel.app`. Depois, volte ao Supabase e coloque
esse endereço em **Authentication → URL Configuration → Site URL**.

## 3. Trazer os dados que já estavam no navegador

Abra o site publicado **no mesmo navegador e no mesmo aparelho** onde você usava o sistema antes,
entre com a sua conta e confirme a pergunta "Enviar para a nuvem agora?". Os dados antigos continuam
no navegador (nada é apagado). Se recusar, a pergunta não volta para essa conta.

## Como funciona

| Tabela       | Guarda                                                  |
|--------------|---------------------------------------------------------|
| `categorias` | nome e imagem da categoria                              |
| `variacoes`  | ex.: Cor, Tamanho (de cada categoria)                   |
| `opcoes`     | ex.: Azul, Vermelho, P, M, G (de cada variação)         |
| `produtos`   | cada combinação, com `estoque` e `vendidos`             |

- Cada linha tem `user_id`; as regras (RLS) deixam cada pessoa ver e alterar **só os próprios dados**.
- O site carrega tudo ao entrar e envia só o que mudou, em segundo plano. O texto no topo mostra
  "Salvando…", "Salvo na nuvem" ou o erro (com novas tentativas automáticas).
- Ao voltar para a aba, o sistema busca as mudanças feitas em outro aparelho.
- As preferências da tela (gráficos abertos, avisos já vistos) ficam só no navegador.

## Atenção

- Se você abrir o sistema em **dois aparelhos ao mesmo tempo** e vender o mesmo produto nos dois sem
  atualizar, a última gravação vale. Para uma loja com vários vendedores simultâneos, o ideal é registrar
  a venda por uma função do banco (diminui o estoque de forma atômica) — dá para evoluir para isso.
- A biblioteca do Supabase é carregada do CDN jsDelivr (versão fixa). Se quiser tudo hospedado por você,
  baixe `supabase.js` dessa mesma versão e troque o `<script>` em `index.html`.
