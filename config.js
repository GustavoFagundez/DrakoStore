/**
 * config.js — as duas chaves do seu projeto Supabase.
 *
 * Onde achar: Supabase → Project Settings → API:
 *   - Project URL        → cole em `url`
 *   - anon / public key  → cole em `anonKey`   (chamada de "publishable key" nos projetos novos)
 *
 * Estas chaves são feitas para ficar no navegador: quem protege seus dados são o login
 * e as regras do banco (supabase/schema.sql). NUNCA coloque aqui a "service_role" / "secret key".
 */
window.CONFIG_SUPABASE = {
  url: "https://dtmidijxpngkcvczabdc.supabase.co",
  anonKey: "sb_publishable_D-EBnT8_ruYfTbMmNS_D-A_JR2n3HxT",
};
