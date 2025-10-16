# 🚀 Guia Completo de Migração: localStorage → Supabase

## 📋 Status Atual
- ✅ **Schema do banco criado** (`migration-supabase.sql`)
- ✅ **Script de migração criado** (`migration-helper.js`)
- ✅ **RLS desabilitado temporariamente** para migração
- ✅ **Problema do ID corrigido** (removido da migração)
- 🔄 **AGUARDANDO: Executar migração no navegador**

## 🎯 Próximos Passos

### 1. Executar Migração no Navegador
Abra `pneu.html` ou `estoque-pneus.html` no navegador e execute no console (F12):

```javascript
// Verificar dados atuais
executarVerificacao()

// Executar migração completa
executarMigracao()
```

### 2. Após Migração Bem-Sucedida
Execute estes comandos no **SQL Editor do Supabase**:

```sql
-- Reabilitar RLS com políticas corretas
ALTER TABLE pneus ENABLE ROW LEVEL SECURITY;
ALTER TABLE estoque_pneus ENABLE ROW LEVEL SECURITY;

-- Políticas para pneus
CREATE POLICY "Permitir leitura para todos os usuários autenticados" ON pneus
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Permitir inserção para usuários autenticados" ON pneus
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Permitir atualização para usuários autenticados" ON pneus
    FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Permitir exclusão para usuários autenticados" ON pneus
    FOR DELETE USING (auth.role() = 'authenticated');

-- Políticas para estoque_pneus
CREATE POLICY "Permitir leitura do estoque para todos os usuários autenticados" ON estoque_pneus
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Permitir atualização do estoque para usuários autenticados" ON estoque_pneus
    FOR ALL USING (auth.role() = 'authenticated');
```

### 3. Atualizar Scripts da Aplicação
Após migração, será necessário atualizar os scripts JavaScript para usar Supabase ao invés de localStorage:

- `script/pneu.js` - Para página de movimentações
- `script/estoque-pneus.js` - Para página de estoque

### 4. Testes Finais
- ✅ Verificar se dados foram migrados corretamente
- ✅ Testar inserção de novos registros
- ✅ Verificar se o estoque é atualizado automaticamente
- ✅ Testar filtros e buscas

## 📁 Arquivos Criados/Modificados

### Novos Arquivos:
- `migration-supabase.sql` - Schema completo do banco
- `migration-helper.js` - Script de migração
- `fix-migration.sql` - Correções para RLS
- `README-MIGRACAO.md` - Este guia

### Arquivos Modificados:
- `estoque-pneus.html` - Adicionado script de migração
- `pneu.html` - Adicionado script de migração

## ⚠️ Pontos de Atenção

1. **Backup**: Faça backup dos dados do localStorage antes da migração
2. **RLS**: As políticas de segurança serão reabilitadas após migração
3. **Triggers**: O estoque será atualizado automaticamente via triggers
4. **Índices**: Criados para otimizar performance

## 🔧 Comandos Úteis

### No Console do Navegador:
```javascript
executarVerificacao()      // Ver dados atuais
executarMigracao()         // Migrar tudo
migrarMovimentacoesPneus() // Só movimentações
migrarEstoquePneus()       // Só estoque
limparDadosMigrados()      // Limpar dados migrados (cuidado!)
```

### No Supabase SQL Editor:
```sql
-- Verificar dados migrados
SELECT COUNT(*) FROM pneus;
SELECT COUNT(*) FROM estoque_pneus;
SELECT * FROM vw_estoque_atual;
```

## 🎉 Após Migração Completa

1. **Remover localStorage**: Os dados locais podem ser removidos
2. **Atualizar aplicação**: Usar Supabase em todos os scripts
3. **Monitorar performance**: Verificar se tudo funciona corretamente
4. **Backup regular**: Configurar backups automáticos no Supabase

---

**🚀 Execute `executarMigracao()` no navegador para continuar!**
