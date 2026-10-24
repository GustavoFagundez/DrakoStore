-- ============================================================================
-- Sistema de Estoque — banco de dados (Supabase / PostgreSQL)
--
-- Como usar: Supabase → SQL Editor → New query → cole TUDO isto → Run.
-- Pode rodar de novo sem medo: nada é apagado, só criado se ainda não existir.
--
-- Cada linha pertence a um usuário (user_id). A segurança por linha (RLS)
-- garante que cada pessoa só enxerga e altera os próprios dados.
-- ============================================================================

-- ---------- Tabelas ----------

create table if not exists public.categorias (
  id        text primary key,
  user_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nome      text not null,
  imagem    text,                         -- miniatura em base64 (data:image/webp...)
  posicao   integer not null default 0,   -- ordem de exibição
  criado_em timestamptz not null default now()
);

create table if not exists public.variacoes (          -- ex.: Cor, Tamanho
  id           text primary key,
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  categoria_id text not null references public.categorias (id) on delete cascade,
  nome         text not null,
  posicao      integer not null default 0
);

create table if not exists public.opcoes (             -- ex.: Azul, Vermelho, P, M, G
  id          text primary key,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  variacao_id text not null references public.variacoes (id) on delete cascade,
  nome        text not null,
  posicao     integer not null default 0
);

create table if not exists public.produtos (           -- cada combinação tem estoque próprio
  id           text primary key,
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  categoria_id text not null references public.categorias (id) on delete cascade,
  nome         text not null,
  imagem       text,
  escolhas     jsonb not null default '{}'::jsonb,       -- { idVariacao: idOpcao }
  estoque      integer not null default 0 check (estoque >= 0),
  vendidos     integer not null default 0 check (vendidos >= 0),
  posicao      integer not null default 0,
  atualizado_em timestamptz not null default now()
);

-- ---------- Índices ----------

create index if not exists categorias_user_idx on public.categorias (user_id, posicao);
create index if not exists variacoes_categoria_idx on public.variacoes (categoria_id, posicao);
create index if not exists variacoes_user_idx on public.variacoes (user_id);
create index if not exists opcoes_variacao_idx on public.opcoes (variacao_id, posicao);
create index if not exists opcoes_user_idx on public.opcoes (user_id);
create index if not exists produtos_categoria_idx on public.produtos (categoria_id, posicao);
create index if not exists produtos_user_idx on public.produtos (user_id);

-- ---------- Atualiza "atualizado_em" a cada alteração de produto ----------

create or replace function public.tocar_atualizado_em()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$;

drop trigger if exists produtos_atualizado_em on public.produtos;
create trigger produtos_atualizado_em
  before update on public.produtos
  for each row execute function public.tocar_atualizado_em();

-- ---------- Segurança por linha (RLS) ----------

alter table public.categorias enable row level security;
alter table public.variacoes  enable row level security;
alter table public.opcoes     enable row level security;
alter table public.produtos   enable row level security;

drop policy if exists "dono_categorias" on public.categorias;
create policy "dono_categorias" on public.categorias
  for all to authenticated
  using      (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "dono_variacoes" on public.variacoes;
create policy "dono_variacoes" on public.variacoes
  for all to authenticated
  using      (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "dono_opcoes" on public.opcoes;
create policy "dono_opcoes" on public.opcoes
  for all to authenticated
  using      (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "dono_produtos" on public.produtos;
create policy "dono_produtos" on public.produtos
  for all to authenticated
  using      (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Visitantes sem login não acessam nada.
revoke all on public.categorias, public.variacoes, public.opcoes, public.produtos from anon;
grant select, insert, update, delete
  on public.categorias, public.variacoes, public.opcoes, public.produtos to authenticated;
