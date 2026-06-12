# Função `localizacao-veiculo`

Esta função mantém as credenciais da Systemsat fora do navegador.

Configure os secrets no projeto Supabase antes da publicação:

```powershell
supabase secrets set SYSTEMSAT_LOGIN="usuario-do-portal" SYSTEMSAT_PASSWORD="senha-do-portal"
supabase functions deploy localizacao-veiculo
```

Não adicione as credenciais em arquivos HTML, JavaScript ou SQL do projeto.

Após alterações nesta função, publique novamente pelo painel do Supabase ou pela CLI:

```powershell
supabase functions deploy localizacao-veiculo
```

A mesma função atende à localização atual e ao relatório histórico.
