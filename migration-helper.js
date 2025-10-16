// Script auxiliar para migração de dados do localStorage para Supabase
// Execute este script no console do navegador (F12) nas páginas pneu.html e estoque-pneus.html

// =====================================================
// CONFIGURAÇÃO DO SUPABASE
// =====================================================
// Usando a configuração existente do arquivo script/supabase.js
import { supabase } from './script/supabase.js';

// =====================================================
// FUNÇÕES DE MIGRAÇÃO
// =====================================================

// Função para migrar movimentações de pneus (de pneu.html)
async function migrarMovimentacoesPneus() {
  try {
    console.log('🔄 Iniciando migração de movimentações de pneus...');

    // Obter dados do localStorage
    const pneus = JSON.parse(localStorage.getItem('pneus')) || [];
    console.log(`📊 Encontrados ${pneus.length} registros de movimentações`);

    if (pneus.length === 0) {
      console.log('⚠️ Nenhum dado de movimentação encontrado no localStorage');
      return;
    }

    // Preparar dados para inserção
    const dadosParaMigracao = pneus.map(pneu => ({
      id: pneu.id,
      data: new Date(pneu.data).toISOString(),
      marca: pneu.marca,
      modelo: pneu.modelo,
      vida: pneu.vida || 0,
      tipo: pneu.tipo,
      status: pneu.status,
      descricao: pneu.descricao,
      quantidade: pneu.quantidade,
      usuario: pneu.usuario
    }));

    // Inserir no Supabase
    const { data, error } = await supabase
      .from('pneus')
      .insert(dadosParaMigracao);

    if (error) {
      console.error('❌ Erro ao migrar movimentações:', error);
      return false;
    }

    console.log('✅ Movimentações migradas com sucesso!');
    console.log(`📈 ${dadosParaMigracao.length} registros inseridos`);
    return true;

  } catch (error) {
    console.error('❌ Erro na migração de movimentações:', error);
    return false;
  }
}

// Função para migrar estoque de pneus (de estoque-pneus.html)
async function migrarEstoquePneus() {
  try {
    console.log('🔄 Iniciando migração de estoque de pneus...');

    // Obter dados do localStorage
    const estoque = JSON.parse(localStorage.getItem('estoquePneus')) || {};
    console.log(`📊 Encontrados ${Object.keys(estoque).length} itens em estoque`);

    if (Object.keys(estoque).length === 0) {
      console.log('⚠️ Nenhum dado de estoque encontrado no localStorage');
      return;
    }

    // Preparar dados para inserção
    const dadosParaMigracao = Object.entries(estoque).map(([key, quantidade]) => {
      const [marca, modelo, tipo, vida] = key.split('-');
      return {
        marca: marca,
        modelo: modelo,
        tipo: tipo,
        vida: parseInt(vida) || 0,
        quantidade: quantidade
      };
    });

    // Inserir no Supabase
    const { data, error } = await supabase
      .from('estoque_pneus')
      .insert(dadosParaMigracao);

    if (error) {
      console.error('❌ Erro ao migrar estoque:', error);
      return false;
    }

    console.log('✅ Estoque migrado com sucesso!');
    console.log(`📈 ${dadosParaMigracao.length} itens inseridos`);
    return true;

  } catch (error) {
    console.error('❌ Erro na migração de estoque:', error);
    return false;
  }
}

// Função para executar migração completa
async function executarMigracaoCompleta() {
  console.log('🚀 Iniciando migração completa para Supabase...');
  console.log('=====================================');

  // Verificar se Supabase está configurado
  if (!supabase) {
    console.error('❌ Supabase não está configurado. Inclua o script do Supabase na página.');
    console.log('📝 Adicione este script antes de fechar o </head>:');
    console.log('<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>');
    return;
  }

  // Executar migrações
  const movimentacoesOk = await migrarMovimentacoesPneus();
  console.log(''); // linha em branco

  const estoqueOk = await migrarEstoquePneus();
  console.log(''); // linha em branco

  // Resultado final
  if (movimentacoesOk && estoqueOk) {
    console.log('🎉 Migração completa realizada com sucesso!');
    console.log('✅ Todos os dados foram migrados para o Supabase');
    console.log('💡 Agora você pode atualizar os scripts para usar o Supabase ao invés do localStorage');
  } else {
    console.log('⚠️ Migração parcial concluída. Verifique os erros acima.');
  }

  console.log('=====================================');
}

// =====================================================
// FUNÇÕES DE VERIFICAÇÃO
// =====================================================

// Função para verificar dados no localStorage
function verificarDadosLocalStorage() {
  console.log('🔍 Verificando dados no localStorage...');
  console.log('=====================================');

  // Verificar movimentações
  const pneus = JSON.parse(localStorage.getItem('pneus')) || [];
  console.log(`📊 Movimentações de pneus: ${pneus.length} registros`);

  if (pneus.length > 0) {
    console.log('📝 Primeiros 3 registros de movimentações:');
    pneus.slice(0, 3).forEach((pneu, index) => {
      console.log(`  ${index + 1}. ${pneu.marca} ${pneu.modelo} - ${pneu.status} (${pneu.quantidade})`);
    });
  }

  // Verificar estoque
  const estoque = JSON.parse(localStorage.getItem('estoquePneus')) || {};
  console.log(`📦 Itens em estoque: ${Object.keys(estoque).length} tipos diferentes`);

  if (Object.keys(estoque).length > 0) {
    console.log('📝 Primeiros 3 itens do estoque:');
    Object.entries(estoque).slice(0, 3).forEach(([key, quantidade], index) => {
      const [marca, modelo, tipo, vida] = key.split('-');
      console.log(`  ${index + 1}. ${marca} ${modelo} (${tipo}) - Vida ${vida}: ${quantidade} unidades`);
    });
  }

  console.log('=====================================');
}

// =====================================================
// INSTRUÇÕES DE USO
// =====================================================

console.log('🔧 Script de Migração Marquespan - localStorage para Supabase');
console.log('=============================================================');
console.log('');
console.log('📋 PASSOS PARA MIGRAÇÃO:');
console.log('');
console.log('1. Configure o Supabase:');
console.log('   - Já configurado usando script/supabase.js existente');
console.log('   - Inclua este script na página HTML se necessário');
console.log('');
console.log('2. Verifique os dados atuais:');
console.log('   executarVerificacao()');
console.log('');
console.log('3. Execute a migração completa:');
console.log('   executarMigracao()');
console.log('');
console.log('4. Ou execute migrações individuais:');
console.log('   migrarMovimentacoesPneus()  // Para dados de pneu.html');
console.log('   migrarEstoquePneus()        // Para dados de estoque-pneus.html');
console.log('');
console.log('⚠️ IMPORTANTE: Faça backup dos dados antes de migrar!');
console.log('=============================================================');

// =====================================================
// FUNÇÕES GLOBAIS PARA EXECUÇÃO NO CONSOLE
// =====================================================

// Tornar funções disponíveis globalmente para uso no console
window.executarVerificacao = verificarDadosLocalStorage;
window.executarMigracao = executarMigracaoCompleta;
window.migrarMovimentacoesPneus = migrarMovimentacoesPneus;
window.migrarEstoquePneus = migrarEstoquePneus;
window.limparDadosMigrados = limparDadosMigrados;

// Função para limpar dados migrados (se necessário)
async function limparDadosMigrados() {
  if (confirm('⚠️ Isso irá apagar TODOS os dados migrados no Supabase. Tem certeza?')) {
    try {
      await supabase.from('pneus').delete().neq('id', 0);
      await supabase.from('estoque_pneus').delete().neq('id', 0);
      console.log('🗑️ Dados migrados removidos do Supabase');
    } catch (error) {
      console.error('❌ Erro ao limpar dados:', error);
    }
  }
}
