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

A mesma função atende à localização atual, ao relatório histórico e ao monitoramento da frota.
# Correspondência de placas

A função remove automaticamente hífens e outros separadores antes de comparar as placas.
Quando uma placa antiga foi convertida para o padrão Mercosul, a função também aceita uma
diferença de um caractere, desde que exista apenas um veículo candidato com as mesmas três
letras iniciais. Exemplo: `BQU-4466` pode ser associado ao cadastro `BQU4E66`.
