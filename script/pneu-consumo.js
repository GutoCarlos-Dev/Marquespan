import { supabaseClient as supabase } from './supabase.js';

let gridBody;
let pneusEmEstoque = [];
let todosPneusAtivos = [];

// 🚀 Inicialização
document.addEventListener('DOMContentLoaded', async () => {
  // Elementos do DOM
  gridBody = document.getElementById('grid-consumo-pneus-body');
  const form = document.getElementById('formConsumoPneu');
  const tipoOperacaoSelect = document.getElementById('tipo_operacao');
  const camposPneuUnico = document.getElementById('campos-pneu-unico');
  const camposInstalacaoMultipla = document.getElementById('campos-instalacao-multipla');
  const camposTrocaRodizio = document.getElementById('campos-troca-rodizio');
  const btnAdicionarPneu = document.getElementById('btn-adicionar-pneu');
  const gridInstalacaoPneus = document.getElementById('grid-instalacao-pneus');
  const btnBuscar = document.getElementById('btn-buscar');
  const btnLimparBusca = document.getElementById('btn-limpar-busca');
  const btnCancelForm = document.getElementById('btnCancelForm');

  // --- EVENT LISTENERS ---
  form.addEventListener('submit', handleSubmit);
  btnBuscar?.addEventListener('click', buscarMovimentacoes);
  btnLimparBusca?.addEventListener('click', limparFiltrosBusca);
  btnCancelForm?.addEventListener('click', () => clearForm());
  tipoOperacaoSelect.addEventListener('change', handleTipoOperacaoChange);
  btnAdicionarPneu.addEventListener('click', adicionarLinhaPneu);

  // --- INICIALIZAÇÃO ---
  await init();
});

// 📦 Carrega as placas dos veículos no select
async function carregarPlacas() {
  const selectPlaca = document.getElementById('placa');
  if (!selectPlaca) return;

  try {
    const { data, error } = await supabase
      .from('veiculos')
      .select('placa')
      .order('placa', { ascending: true });

    if (error) throw error;

    selectPlaca.innerHTML = '<option value="">Selecione</option>';
    data.forEach(veiculo => {
      const option = document.createElement('option');
      option.value = veiculo.placa;
      option.textContent = veiculo.placa;
      selectPlaca.appendChild(option);
    });
  } catch (error) {
    console.error('Erro ao carregar placas:', error);
  }
}

/**
 * Carrega os pneus disponíveis no estoque (status 'ESTOQUE').
 */
async function carregarPneusEstoque() {
  const { data, error } = await supabase
    .from('marcas_fogo_pneus')
    .select('id, codigo_marca_fogo, lancamento_id, pneus(marca, modelo, tipo, vida, valor_unitario_real)')
    .eq('status_pneu', 'ESTOQUE')
    .order('codigo_marca_fogo', { ascending: true });

  if (error) {
    console.error('Erro ao carregar pneus do estoque:', error);
    pneusEmEstoque = [];
    return;
  }
  pneusEmEstoque = data;
}

/**
 * Carrega todos os pneus ativos (em estoque ou em uso) para operações de pneu único.
 */
async function carregarTodosPneusAtivos() {
  const { data, error } = await supabase
    .from('marcas_fogo_pneus')
    .select('id, codigo_marca_fogo, lancamento_id, pneus(marca, modelo, tipo, vida, valor_unitario_real)')
    .in('status_pneu', ['ESTOQUE', 'EM USO']) // Carrega pneus em estoque E em uso
    .order('codigo_marca_fogo', { ascending: true });

  if (error) {
    console.error('Erro ao carregar todos os pneus ativos:', error);
    todosPneusAtivos = [];
    return;
  }
  todosPneusAtivos = data;
}


// Obtém o ID e o nome do usuário logado do localStorage
function getCurrentUser() {
  const usuario = JSON.parse(localStorage.getItem('usuarioLogado'));
  // Retorna um objeto com id e nome para maior flexibilidade
  return usuario ? { id: usuario.id, nome: usuario.nome } : { id: null, nome: 'Usuário Anônimo' };
}

// Limpa o formulário e redefine a data
function clearForm() {
  const form = document.getElementById('formConsumoPneu');
  form.reset();
  document.getElementById('grid-instalacao-pneus').innerHTML = ''; // Limpa o grid
  setDataAtual();
  handleTipoOperacaoChange();
}

function setDataAtual() {
  const dataInput = document.getElementById('data');
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  dataInput.value = now.toISOString().slice(0, 16);
}

/**
 * Alterna a visibilidade dos campos do formulário com base na operação selecionada.
 */
function handleTipoOperacaoChange() {
  const operacao = document.getElementById('tipo_operacao').value;
  const camposPneuUnico = document.getElementById('campos-pneu-unico');
  const camposInstalacaoMultipla = document.getElementById('campos-instalacao-multipla');
  const camposTrocaRodizio = document.getElementById('campos-troca-rodizio');

  // Esconde todos os painéis
  camposPneuUnico.classList.add('hidden');
  camposInstalacaoMultipla.classList.add('hidden');
  camposTrocaRodizio.classList.add('hidden');

  if (operacao === 'INSTALACAO') {
    camposInstalacaoMultipla.classList.remove('hidden');
  } else if (operacao) { // Qualquer outra operação selecionada
    camposPneuUnico.classList.remove('hidden');
    // Mostra campos específicos se for troca ou rodízio
    if (operacao === 'TROCA' || operacao === 'RODIZIO') {
      camposTrocaRodizio.classList.remove('hidden');
    }
  }
}

/**
 * Adiciona uma nova linha ao grid de instalação de pneus.
 */
function adicionarLinhaPneu() {
  const gridInstalacaoPneus = document.getElementById('grid-instalacao-pneus');
  const pneuId = `pneu-row-${Date.now()}`;
  const div = document.createElement('div');
  div.className = 'instalacao-grid-row';
  div.id = pneuId;

  // Cria o seletor de posição
  const selectPosicao = document.createElement('select');
  selectPosicao.name = 'posicao_aplicacao[]';
  selectPosicao.required = true;
  selectPosicao.innerHTML = `
    <option value="">Selecione a Posição</option>
    <option value="DIANTEIRO_ESQUERDO">Dianteiro Esquerdo</option>
    <option value="DIANTEIRO_DIREITO">Dianteiro Direito</option>
    <option value="TRACAO_ESQUERDO_INTERNO">Tração Esq. Interno</option>
    <option value="TRACAO_ESQUERDO_EXTERNO">Tração Esq. Externo</option>
    <option value="TRACAO_DIREITO_INTERNO">Tração Dir. Interno</option>
    <option value="TRACAO_DIREITO_EXTERNO">Tração Dir. Externo</option>
    <option value="TRUCK_ESQUERDO_INTERNO">Truck Esq. Interno</option>
    <option value="TRUCK_ESQUERDO_EXTERNO">Truck Esq. Externo</option>
    <option value="TRUCK_DIREITO_INTERNO">Truck Dir. Interno</option>
    <option value="TRUCK_DIREITO_EXTERNO">Truck Dir. Externo</option>
    <option value="ESTEPE">Estepe</option>
  `;

  // Cria o seletor de marca de fogo
  const selectMarcaFogo = document.createElement('select');
  selectMarcaFogo.name = 'marca_fogo_id[]';
  selectMarcaFogo.required = true;
  selectMarcaFogo.innerHTML = '<option value="">Selecione a Marca de Fogo</option>';
  pneusEmEstoque.forEach(pneu => {
    const option = document.createElement('option');
    option.value = pneu.id;
    option.textContent = `${pneu.codigo_marca_fogo} (${pneu.pneus?.marca || 'N/A'} - ${pneu.pneus?.modelo || 'N/A'})`;
    selectMarcaFogo.appendChild(option);
  });

  // Cria o botão de remover
  const btnRemover = document.createElement('button');
  btnRemover.type = 'button';
  btnRemover.className = 'btn-pneu btn-pneu-danger';
  btnRemover.innerHTML = '<i class="fas fa-trash"></i>';
  btnRemover.onclick = () => {
    document.getElementById(pneuId).remove();
  };

  // Adiciona os elementos à linha
  div.appendChild(selectPosicao);
  div.appendChild(selectMarcaFogo);
  div.appendChild(btnRemover);

  gridInstalacaoPneus.appendChild(div);
}

/**
 * Popula o dropdown de seleção de pneu para operações únicas.
 */
function popularSelectPneuUnico() {
  const selectPneu = document.getElementById('codigo_marca_fogo_select');
  if (!selectPneu) return;

  selectPneu.innerHTML = '<option value="">Selecione a Marca de Fogo</option>';
  // Usa a lista de todos os pneus ativos (em estoque ou em uso)
  todosPneusAtivos.forEach(pneu => {
    const option = document.createElement('option');
    option.value = pneu.codigo_marca_fogo;
    option.textContent = `${pneu.codigo_marca_fogo} (${pneu.pneus?.marca || 'N/A'} - ${pneu.pneus?.modelo || 'N/A'})`;
    selectPneu.appendChild(option);
  });
}

// 💾 Salva uma movimentação de pneu
async function handleSubmit(e) {
  e.preventDefault();
  const operacao = document.getElementById('tipo_operacao').value;

  if (operacao === 'INSTALACAO') {
    await handleInstalacaoMultipla(e);
  } else {
    await handleOperacaoUnica(e);
  }
}

async function handleInstalacaoMultipla(e) {
  const form = e.target;
  const placa = form.placa.value;
  const quilometragem = form.quilometragem.value;
  const observacoes = form.observacoes.value;
  const usuario = getCurrentUser();
  const dataOperacao = form.data.value;

  // Validação Crítica: Garante que o usuário está logado.
  if (!usuario || !usuario.id) {
    alert('Erro de autenticação: Usuário não identificado. Por favor, faça login novamente.');
    return;
  }

  const linhasPneus = document.querySelectorAll('#grid-instalacao-pneus .instalacao-grid-row');

  if (linhasPneus.length === 0) {
    alert('Adicione pelo menos um pneu para a instalação.');
    return;
  }

  const movimentacoes = [];
  const idsParaAtualizar = [];
  const saidasEstoque = []; // Array para registrar as saídas na tabela 'pneus'

  for (const linha of linhasPneus) {
    const marcaFogoId = linha.querySelector('select[name="marca_fogo_id[]"]').value;
    const posicao = linha.querySelector('select[name="posicao_aplicacao[]"]').value;

    if (!marcaFogoId || !posicao) {
      alert('Preencha a posição e a marca de fogo para todos os pneus adicionados.');
      return;
    }

    const pneuInfo = pneusEmEstoque.find(p => p.id == marcaFogoId);
    if (!pneuInfo) continue;

    movimentacoes.push({
      data: dataOperacao, // Envia data e hora completas
      codigo_marca_fogo: pneuInfo.codigo_marca_fogo,
      placa: placa,
      quilometragem: parseInt(quilometragem),
      tipo_operacao: 'INSTALACAO',
      posicao_aplicacao: posicao,
      observacoes: observacoes,
      usuario: usuario.nome // Mantém o nome do usuário na coluna 'usuario'
    });
    idsParaAtualizar.push(marcaFogoId);

    // Prepara o registro de SAIDA para a tabela 'pneus' (Baixa no Estoque)
    saidasEstoque.push({
      data: dataOperacao,
      nota_fiscal: 'SAIDA', // Indica que é uma saída
      marca: pneuInfo.pneus?.marca,
      modelo: pneuInfo.pneus?.modelo,
      tipo: pneuInfo.pneus?.tipo,
      vida: pneuInfo.pneus?.vida,
      quantidade: 1, // Baixa de 1 unidade
      valor_unitario_real: pneuInfo.pneus?.valor_unitario_real || 0,
      valor_total: pneuInfo.pneus?.valor_unitario_real || 0,
      status: 'SAIDA',
      descricao: `INSTALACAO - PLACA ${placa}`,
      placa: placa, // Vincula a placa para saber onde o pneu está
      usuario: usuario.nome
    });
  }

  try {
    const { error: insertError } = await supabase.from('movimentacoes_pneus').insert(movimentacoes).select();
    if (insertError) throw insertError;

    // Insere as saídas na tabela 'pneus' para atualizar a contagem do estoque
    const { error: saidaError } = await supabase.from('pneus').insert(saidasEstoque);
    if (saidaError) throw saidaError;

    const { error: updateError } = await supabase
      .from('marcas_fogo_pneus')
      .update({ status_pneu: 'EM USO' })
      .in('id', idsParaAtualizar);
    if (updateError) throw updateError;

    alert(`${movimentacoes.length} pneu(s) instalado(s) com sucesso!`);
    clearForm();
    await carregarMovimentacoes();
    await carregarTodosPneusAtivos(); // Recarrega todos os pneus ativos
    popularSelectPneuUnico(); // Repopula o dropdown de pneu único
    await carregarPneusEstoque(); // Recarrega a lista de pneus em estoque

  } catch (error) {
    console.error('Erro ao salvar instalação múltipla:', error);
    alert(`Ocorreu um erro: ${error.message}`);
  }
}

async function handleOperacaoUnica(e) {
  const form = e.target;
  const marcaFogo = form.codigo_marca_fogo.value?.trim().toUpperCase();

  // Validação Crítica: Garante que o usuário está logado.
  const currentUser = getCurrentUser();
  if (!currentUser || !currentUser.id) {
    alert('Erro de autenticação: Usuário não identificado. Por favor, faça login novamente.');
    return;
  }

  try {
    const { data: pneu, error: pneuError } = await supabase
      .from('marcas_fogo_pneus')
      .select('id, status_pneu, lancamento_id, pneus(marca, modelo, tipo, vida, valor_unitario_real)')
      .eq('codigo_marca_fogo', marcaFogo)
      .single();

    if (pneuError || !pneu) {
      alert(`Erro: Pneu com a marca de fogo "${marcaFogo}" não encontrado.`);
      return;
    }

    const tipoOperacao = form.tipo_operacao.value;
    if (tipoOperacao !== 'REFORMA' && tipoOperacao !== 'DESCARTE' && pneu.status_pneu !== 'ESTOQUE') {
      alert(`Atenção: O pneu "${marcaFogo}" não está no estoque. Status atual: ${pneu.status_pneu}.`);
      return;
    }

    const movimentacaoData = {
      data: form.data.value, // Envia data e hora completas
      codigo_marca_fogo: marcaFogo,
      placa: form.placa.value,
      quilometragem: parseInt(form.quilometragem.value),
      tipo_operacao: tipoOperacao,
      posicao_aplicacao: form.aplicacao.value,
      observacoes: form.observacoes.value?.trim(),
      usuario: currentUser.nome // Usa o nome do usuário já obtido
    };

    const { error: insertError } = await supabase.from('movimentacoes_pneus').insert([movimentacaoData]).select();
    if (insertError) throw insertError;

    // Se o pneu estava no estoque e está saindo (não é apenas rodízio interno), registra a SAIDA na tabela 'pneus'
    // Nota: Rodízio e Troca podem ou não gerar saída dependendo da regra de negócio, 
    // mas se o status muda de ESTOQUE para outra coisa, deve baixar.
    if (pneu.status_pneu === 'ESTOQUE') {
        const saidaRecord = {
            data: form.data.value,
            nota_fiscal: 'SAIDA',
            marca: pneu.pneus?.marca,
            modelo: pneu.pneus?.modelo,
            tipo: pneu.pneus?.tipo,
            vida: pneu.pneus?.vida,
            quantidade: 1,
            valor_unitario_real: pneu.pneus?.valor_unitario_real || 0,
            valor_total: pneu.pneus?.valor_unitario_real || 0,
            status: 'SAIDA',
            descricao: `${tipoOperacao} - PLACA ${form.placa.value}`,
            placa: form.placa.value,
            usuario: currentUser.nome
        };
        const { error: saidaError } = await supabase.from('pneus').insert([saidaRecord]);
        if (saidaError) throw saidaError;
    }

    let novoStatus = 'EM USO';
    if (movimentacaoData.tipo_operacao === 'REFORMA') novoStatus = 'EM REFORMA';
    if (movimentacaoData.tipo_operacao === 'DESCARTE') novoStatus = 'DESCARTADO';

    const { error: updateError } = await supabase
      .from('marcas_fogo_pneus')
      .update({ status_pneu: novoStatus })
      .eq('id', pneu.id);

    if (updateError) throw updateError;

    alert('Movimentação de pneu registrada com sucesso!');
    clearForm();
    await carregarMovimentacoes();
    await carregarTodosPneusAtivos(); // Recarrega todos os pneus ativos
    popularSelectPneuUnico(); // Repopula o dropdown de pneu único
    await carregarPneusEstoque();

  } catch (error) {
    console.error('Erro ao salvar movimentação:', error);
    alert(`Ocorreu um erro: ${error.message}`);
  }
}

// 📦 Carrega as últimas movimentações
async function carregarMovimentacoes() {
  if (!gridBody) return;

  try {
    const { data, error } = await supabase
      .from('movimentacoes_pneus')
      .select('*')
      .order('data', { ascending: false })
      .limit(100);

    if (error) throw error;

    renderizarGrid(data || []);
  } catch (error) {
    console.error('Erro ao carregar movimentações:', error);
    gridBody.innerHTML = `<tr><td colspan="8" class="error-message">Erro ao carregar dados.</td></tr>`;
  }
}

// 🔍 Busca movimentações com base nos filtros
async function buscarMovimentacoes() {
  const marcaFogo = document.getElementById('campo-marca-fogo-busca')?.value.trim().toUpperCase();
  const placa = document.getElementById('campo-placa-busca')?.value.trim().toUpperCase();
  const operacao = document.getElementById('campo-operacao')?.value;

  try {
    let query = supabase
      .from('movimentacoes_pneus')
      .select('*')
      .order('data', { ascending: false });

    if (marcaFogo) query = query.ilike('codigo_marca_fogo', `%${marcaFogo}%`);
    if (placa) query = query.ilike('placa', `%${placa}%`);
    if (operacao) query = query.eq('tipo_operacao', operacao);

    const { data, error } = await query;

    if (error) throw error;

    renderizarGrid(data || []);
  } catch (error) {
    console.error('Erro ao buscar movimentações:', error);
  }
}

// 🧹 Limpa os filtros de busca e recarrega a lista completa
function limparFiltrosBusca() {
  document.getElementById('campo-marca-fogo-busca').value = '';
  document.getElementById('campo-placa-busca').value = '';
  document.getElementById('campo-operacao').value = '';
  carregarMovimentacoes();
}

// 🧱 Renderiza os dados na tabela
function renderizarGrid(lista) {
  gridBody.innerHTML = '';

  if (lista.length === 0) {
    gridBody.innerHTML = `<tr><td colspan="8" class="no-results-message">Nenhuma movimentação encontrada.</td></tr>`;
    return;
  }

  lista.forEach(mov => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
            <td>${mov.data
                ? new Date(mov.data).toLocaleString('pt-BR', {
                      year: 'numeric',
                      month: '2-digit',
                      day: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                      timeZone: 'America/Sao_Paulo' // Define explicitamente o fuso horário
                  }) : ''}</td>
            <td class="uppercase">${mov.codigo_marca_fogo}</td>
            <td>${mov.tipo_operacao || ''}</td>
            <td class="uppercase">${mov.placa || ''}</td>
            <td>${mov.quilometragem || ''}</td>
            <td>${mov.posicao_aplicacao || ''}</td>
            <td>${mov.usuario || ''}</td>
            <td class="actions-cell">
                <button class="btn-pneu-action delete" onclick="excluirMovimentacao(${mov.id}, '${mov.codigo_marca_fogo}')" title="Cancelar Movimentação">
                    <i class="fas fa-undo"></i>
                </button>
            </td>
        `;
    gridBody.appendChild(tr);
  });
}

// 🗑️ Exclui uma movimentação (cancela a operação)
window.excluirMovimentacao = async function(id, marcaFogo) {
  if (!confirm(`Tem certeza que deseja cancelar esta movimentação? O pneu "${marcaFogo}" retornará ao status "ESTOQUE" e a quantidade será ajustada.`)) {
    return;
  }

  try {
    // 1. Buscar informações do pneu para criar o registro de estorno.
    // Usamos a marca de fogo para encontrar o pneu e, através da relação, seus detalhes originais.
    const { data: pneuInfo, error: pneuError } = await supabase
      .from('marcas_fogo_pneus')
      .select('id, pneus(marca, modelo, tipo, vida, valor_unitario_real)')
      .eq('codigo_marca_fogo', marcaFogo)
      .single();

    if (pneuError || !pneuInfo) {
      throw new Error(`Não foi possível encontrar os dados do pneu ${marcaFogo} para realizar o estorno.`);
    }
    
    // 2. Buscar a movimentação original para obter a placa para a descrição do estorno
    const { data: movInfo, error: movError } = await supabase
      .from('movimentacoes_pneus')
      .select('placa')
      .eq('id', id)
      .single();
    
    // Não é um erro fatal se não encontrar, mas é bom para o log.
    if (movError) {
        console.warn(`Não foi possível obter a placa da movimentação ${id} para o log de estorno.`);
    }

    // 3. Deletar a movimentação da tabela de histórico de movimentações.
    const { error: deleteError } = await supabase
      .from('movimentacoes_pneus')
      .delete()
      .eq('id', id);

    if (deleteError) throw deleteError;

    // 4. Criar um registro de ENTRADA compensatório na tabela 'pneus' para estornar a SAÍDA.
    const estornoRecord = {
      data: new Date().toISOString(),
      nota_fiscal: 'ESTORNO', // Identifica a operação como um estorno de cancelamento
      marca: pneuInfo.pneus?.marca,
      modelo: pneuInfo.pneus?.modelo,
      tipo: pneuInfo.pneus?.tipo,
      vida: pneuInfo.pneus?.vida,
      quantidade: 1, // Retornando 1 unidade ao estoque
      valor_unitario_real: pneuInfo.pneus?.valor_unitario_real || 0,
      valor_total: pneuInfo.pneus?.valor_unitario_real || 0, // Valor total para 1 unidade
      status: 'ENTRADA',
      descricao: `ESTORNO CANCELAMENTO MOV. ID ${id} (PLACA: ${movInfo?.placa || 'N/A'})`,
      placa: null, // O pneu está voltando para o estoque geral, não está mais em um veículo.
      usuario: getCurrentUser().nome
    };

    const { error: estornoError } = await supabase.from('pneus').insert([estornoRecord]);
    if (estornoError) {
      throw new Error(`A movimentação foi deletada, mas falhou ao estornar o pneu para o estoque: ${estornoError.message}`);
    }

    // 5. Reverter o status do pneu individual para 'ESTOQUE' na tabela de controle.
    const { error: updateError } = await supabase
      .from('marcas_fogo_pneus')
      .update({ status_pneu: 'ESTOQUE' })
      .eq('codigo_marca_fogo', marcaFogo);

    if (updateError) throw updateError;

    alert('Movimentação cancelada e pneu estornado ao estoque com sucesso!');
    
    // 6. Recarregar todos os dados da página para refletir as mudanças.
    await carregarMovimentacoes();
    await carregarTodosPneusAtivos();
    popularSelectPneuUnico();
    await carregarPneusEstoque();

  } catch (error) {
    console.error('Erro ao cancelar movimentação:', error);
    alert(`Erro ao cancelar: ${error.message}`);
  }
};

/**
 * Função principal para inicializar a página.
 */
async function init() {
  setDataAtual();
  await Promise.all([
    carregarPlacas(),
    carregarTodosPneusAtivos(),
    carregarPneusEstoque(),
    carregarMovimentacoes()
  ]);
  popularSelectPneuUnico(); // Garante que o dropdown de pneu único seja populado
  handleTipoOperacaoChange(); // Garante que o estado inicial do form está correto
}
