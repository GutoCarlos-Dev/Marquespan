import { supabase } from './supabase.js';

let placaSelecionada = null;

// 🚀 Inicialização
document.addEventListener('DOMContentLoaded', () => {
  // Menu toggle
  document.querySelectorAll('.menu-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      btn.parentElement.classList.toggle('active');
    });
  });

  // Carregar placas
  carregarPlacas();

  // Event listeners
  document.getElementById('placa_veiculo').addEventListener('change', selecionarVeiculo);
  document.getElementById('tipo_operacao').addEventListener('change', toggleCamposRodizio);
  document.getElementById('formSaida').addEventListener('submit', handleSubmitSaida);

  // Verificar permissões
  verificarPermissoes();
});

// 📦 Carregar placas do Supabase
async function carregarPlacas() {
  const selectPlaca = document.getElementById('placa_veiculo');
  if (!selectPlaca) return;

  try {
    const { data: placas, error } = await supabase
      .from('veiculos')
      .select('placa')
      .order('placa', { ascending: true });

    if (error) {
      console.error('Erro ao carregar placas:', error);
      return;
    }

    selectPlaca.innerHTML = '<option value="">Selecione o veículo</option>';
    placas.forEach(veiculo => {
      const option = document.createElement('option');
      option.value = veiculo.placa;
      option.textContent = veiculo.placa;
      selectPlaca.appendChild(option);
    });
  } catch (error) {
    console.error('Erro ao carregar placas:', error);
  }
}

// Selecionar veículo e carregar dados
async function selecionarVeiculo() {
  const placa = document.getElementById('placa_veiculo').value;
  if (!placa) {
    document.getElementById('posicoes-card').style.display = 'none';
    document.getElementById('form-card').style.display = 'none';
    document.getElementById('historico-card').style.display = 'none';
    return;
  }

  placaSelecionada = placa;

  // Mostrar cards
  document.getElementById('posicoes-card').style.display = 'block';
  document.getElementById('form-card').style.display = 'block';
  document.getElementById('historico-card').style.display = 'block';

  // Carregar posições atuais
  await carregarPosicoesVeiculo(placa);

  // Carregar histórico
  await carregarHistoricoSaidas(placa);

  // Setar data atual
  document.getElementById('data_operacao').value = new Date().toISOString().slice(0, 16);
}

// Carregar posições atuais dos pneus no veículo
async function carregarPosicoesVeiculo(placa) {
  const container = document.getElementById('posicoes-veiculo');

  try {
    const { data: posicoes, error } = await supabase
      .from('posicoes_veiculos')
      .select(`
        posicao,
        codigo_marca_fogo,
        data_instalacao,
        quilometragem_instalacao,
        pneus (
          marca,
          modelo,
          tipo,
          vida
        )
      `)
      .eq('placa', placa)
      .order('posicao');

    if (error) {
      console.error('Erro ao carregar posições:', error);
      container.innerHTML = '<div class="posicao-item" style="grid-column: 1 / -1; text-align: center; color: #dc3545;">Erro ao carregar posições</div>';
      return;
    }

    if (!posicoes || posicoes.length === 0) {
      container.innerHTML = '<div class="posicao-item" style="grid-column: 1 / -1; text-align: center; color: #6c757d;">Nenhum pneu instalado neste veículo</div>';
      return;
    }

    const posicoesPadrao = [
      'DIANTEIRO_ESQUERDO', 'DIANTEIRO_DIREITO',
      'TRACAO_ESQUERDO', 'TRACAO_DIREITO',
      'TRUCK_ESQUERDO', 'TRUCK_DIREITO'
    ];

    const posicoesMap = {};
    posicoes.forEach(p => {
      posicoesMap[p.posicao] = p;
    });

    container.innerHTML = '';

    posicoesPadrao.forEach(posicao => {
      const posicaoData = posicoesMap[posicao];
      const posicaoFormatada = posicao.replace('_', ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase());

      const div = document.createElement('div');
      div.className = 'posicao-item';
      div.style.cssText = `
        background: ${posicaoData ? '#d4edda' : '#f8d7da'};
        border: 2px solid ${posicaoData ? '#c3e6cb' : '#f5c6cb'};
        border-radius: 8px;
        padding: 15px;
        text-align: center;
        font-weight: 600;
      `;

      if (posicaoData) {
        div.innerHTML = `
          <div style="font-size: 0.9rem; color: #155724; margin-bottom: 8px;">${posicaoFormatada}</div>
          <div style="font-size: 1.2rem; color: #dc3545; margin-bottom: 5px;">${posicaoData.codigo_marca_fogo}</div>
          <div style="font-size: 0.8rem; color: #6c757d;">
            ${posicaoData.pneus?.marca} ${posicaoData.pneus?.modelo}<br>
            Vida: ${posicaoData.pneus?.vida || 0}
          </div>
        `;
      } else {
        div.innerHTML = `
          <div style="font-size: 0.9rem; color: #721c24; margin-bottom: 8px;">${posicaoFormatada}</div>
          <div style="font-size: 1.2rem; color: #721c24;">VAZIO</div>
        `;
      }

      container.appendChild(div);
    });

  } catch (error) {
    console.error('Erro ao carregar posições:', error);
    container.innerHTML = '<div class="posicao-item" style="grid-column: 1 / -1; text-align: center; color: #dc3545;">Erro ao carregar posições</div>';
  }
}

// Carregar histórico de saídas do veículo
async function carregarHistoricoSaidas(placa) {
  const container = document.getElementById('grid-historico-body');

  try {
    const { data: saidas, error } = await supabase
      .from('saidas_detalhadas')
      .select(`
        data_saida,
        tipo_operacao,
        quilometragem,
        aplicacao,
        posicao_anterior,
        posicao_nova,
        codigo_marca_fogo_trocado,
        observacoes,
        usuario,
        pneus (
          marca,
          modelo,
          tipo,
          vida
        )
      `)
      .eq('placa', placa)
      .order('data_saida', { ascending: false })
      .limit(20);

    if (error) {
      console.error('Erro ao carregar histórico:', error);
      container.innerHTML = '<div class="grid-row" style="text-align: center; color: #dc3545;">Erro ao carregar histórico</div>';
      return;
    }

    if (!saidas || saidas.length === 0) {
      container.innerHTML = '<div class="grid-row" style="text-align: center; color: #6c757d;">Nenhuma saída registrada para este veículo</div>';
      return;
    }

    container.innerHTML = '';

    saidas.forEach(saida => {
      const row = document.createElement('div');
      row.classList.add('grid-row');
      row.style.display = 'flex';
      row.style.borderBottom = '1px solid #eee';
      row.style.backgroundColor = '#ffffff';

      const tipoOperacaoFormatado = {
        'RODIZIO': '🔄 Rodízio',
        'INSTALACAO': '📦 Instalação',
        'TROCA': '🔧 Troca',
        'DESCARTE': '🗑️ Descarte'
      }[saida.tipo_operacao] || saida.tipo_operacao;

      row.innerHTML = `
        <div style="flex: 1; min-width: 120px; padding: 12px 8px; text-align: left; border-right: 1px solid #eee;">${new Date(saida.data_saida).toLocaleString('pt-BR')}</div>
        <div style="flex: 1; min-width: 100px; padding: 12px 8px; text-align: left; border-right: 1px solid #eee;">${tipoOperacaoFormatado}</div>
        <div style="flex: 1; min-width: 100px; padding: 12px 8px; text-align: left; border-right: 1px solid #eee;">${saida.quilometragem?.toLocaleString('pt-BR') || ''}</div>
        <div style="flex: 1; min-width: 120px; padding: 12px 8px; text-align: left; border-right: 1px solid #eee;">${saida.pneus?.marca || ''}</div>
        <div style="flex: 1.2; min-width: 140px; padding: 12px 8px; text-align: left; border-right: 1px solid #eee;">${saida.pneus?.modelo || ''}</div>
        <div style="flex: 0.8; min-width: 100px; padding: 12px 8px; text-align: left; border-right: 1px solid #eee;">${saida.pneus?.tipo || ''}</div>
        <div style="flex: 1; min-width: 120px; padding: 12px 8px; text-align: center; border-right: 1px solid #eee;">${saida.codigo_marca_fogo_trocado || '-'}</div>
        <div style="flex: 1; min-width: 120px; padding: 12px 8px; text-align: left;">${saida.usuario || ''}</div>
      `;

      container.appendChild(row);
    });

  } catch (error) {
    console.error('Erro ao carregar histórico:', error);
    container.innerHTML = '<div class="grid-row" style="text-align: center; color: #dc3545;">Erro ao carregar histórico</div>';
  }
}

// Toggle campos específicos para rodízio
function toggleCamposRodizio() {
  const tipoOperacao = document.getElementById('tipo_operacao').value;
  const camposRodizio = document.getElementById('campos-rodizio');

  if (tipoOperacao === 'RODIZIO') {
    camposRodizio.style.display = 'block';
  } else {
    camposRodizio.style.display = 'none';
  }
}

// Verificar estoque disponível
async function verificarEstoque() {
  const marca = document.getElementById('marca').value;
  const modelo = document.getElementById('modelo').value;
  const tipo = document.getElementById('tipo').value;
  const estoqueDiv = document.getElementById('estoque-disponivel');
  const estoqueTexto = document.getElementById('estoque-texto');

  if (!marca || !modelo || !tipo) {
    estoqueTexto.textContent = 'Selecione marca, modelo e tipo';
    estoqueDiv.style.background = '#e9ecef';
    return;
  }

  try {
    const { data: entradas, error: errorEntradas } = await supabase
      .from('pneus')
      .select('quantidade')
      .eq('marca', marca)
      .eq('modelo', modelo)
      .eq('tipo', tipo)
      .eq('status', 'ENTRADA');

    if (errorEntradas) {
      console.error('Erro ao consultar entradas:', errorEntradas);
      estoqueTexto.textContent = 'Erro ao consultar estoque';
      estoqueDiv.style.background = '#f8d7da';
      return;
    }

    const { data: saidas, error: errorSaidas } = await supabase
      .from('pneus')
      .select('quantidade')
      .eq('marca', marca)
      .eq('modelo', modelo)
      .eq('tipo', tipo)
      .eq('status', 'SAIDA');

    if (errorSaidas) {
      console.error('Erro ao consultar saídas:', errorSaidas);
      estoqueTexto.textContent = 'Erro ao consultar estoque';
      estoqueDiv.style.background = '#f8d7da';
      return;
    }

    const totalEntradas = entradas?.reduce((sum, item) => sum + (item.quantidade || 0), 0) || 0;
    const totalSaidas = saidas?.reduce((sum, item) => sum + (item.quantidade || 0), 0) || 0;
    const disponivel = totalEntradas - totalSaidas;

    estoqueTexto.textContent = `${disponivel} unidade${disponivel !== 1 ? 's' : ''} disponível${disponivel === 0 ? 's' : ''}`;

    if (disponivel === 0) {
      estoqueDiv.style.background = '#f8d7da';
    } else if (disponivel <= 5) {
      estoqueDiv.style.background = '#fff3cd';
    } else {
      estoqueDiv.style.background = '#d4edda';
    }

  } catch (error) {
    console.error('Erro ao verificar estoque:', error);
    estoqueTexto.textContent = 'Erro ao consultar estoque';
    estoqueDiv.style.background = '#f8d7da';
  }
}

// Handle form submit
async function handleSubmitSaida(e) {
  e.preventDefault();

  if (!placaSelecionada) {
    alert('Selecione um veículo primeiro.');
    return;
  }

  const formData = new FormData(e.target);
  const saida = {
    data: new Date().toISOString(),
    placa: placaSelecionada,
    marca: formData.get('marca'),
    modelo: formData.get('modelo'),
    vida: parseInt(formData.get('vida') || 0),
    tipo: formData.get('tipo'),
    status: 'SAIDA',
    descricao: 'SAIDA_PARA_VEICULO',
    quantidade: parseInt(formData.get('quantidade') || 1),
    usuario: getCurrentUserName(),
  };

  if (!saida.marca || !saida.modelo || !saida.tipo) {
    alert('Preencha todos os campos obrigatórios.');
    return;
  }

  // Verificar estoque
  const estoqueAtual = await consultarEstoqueUsado(saida.marca, saida.modelo, saida.tipo);
  if (estoqueAtual < saida.quantidade) {
    alert(`Estoque insuficiente! Disponível: ${estoqueAtual} unidades.`);
    return;
  }

  try {
    // Inserir registro de saída na tabela pneus
    const { data: insertedData, error: insertError } = await supabase
      .from('pneus')
      .insert([saida])
      .select()
      .single();

    if (insertError) {
      console.error('Erro ao registrar saída:', insertError);
      alert(`Erro ao registrar saída: ${insertError.message}`);
      return;
    }

    // Registrar detalhes na tabela saidas_detalhadas
    const saidaDetalhada = {
      lancamento_id: insertedData.id,
      codigo_marca_fogo: formData.get('codigo_marca_fogo_instalado') || null,
      data_saida: new Date().toISOString(),
      placa: placaSelecionada,
      quilometragem: parseInt(formData.get('quilometragem') || 0),
      aplicacao: formData.get('aplicacao'),
      tipo_operacao: formData.get('tipo_operacao'),
      posicao_anterior: formData.get('posicao_anterior') || null,
      posicao_nova: formData.get('posicao_nova') || null,
      codigo_marca_fogo_trocado: formData.get('codigo_marca_fogo_trocado') || null,
      observacoes: formData.get('observacoes')?.trim() || null,
      usuario: saida.usuario
    };

    const { error: saidaError } = await supabase
      .from('saidas_detalhadas')
      .insert([saidaDetalhada]);

    if (saidaError) {
      console.error('Erro ao registrar saída detalhada:', saidaError);
      alert('Aviso: Saída registrada, mas houve erro no registro detalhado.');
    } else {
      // Se foi rodízio, atualizar posições
      if (saidaDetalhada.tipo_operacao === 'RODIZIO') {
        await atualizarPosicoesRodizio(saidaDetalhada);
      }
    }

    alert('✅ Saída registrada com sucesso!');

    // Limpar formulário e recarregar dados
    limparFormulario();
    await carregarPosicoesVeiculo(placaSelecionada);
    await carregarHistoricoSaidas(placaSelecionada);

  } catch (error) {
    console.error('Erro geral:', error);
    alert('Erro inesperado. Tente novamente.');
  }
}

// Função para consultar estoque atual
async function consultarEstoqueUsado(marca, modelo, tipo) {
  try {
    const { data: entradas, error: errorEntradas } = await supabase
      .from('pneus')
      .select('quantidade')
      .eq('marca', marca)
      .eq('modelo', modelo)
      .eq('tipo', tipo)
      .eq('status', 'ENTRADA');

    if (errorEntradas) {
      console.error('Erro ao consultar entradas:', errorEntradas);
      return 0;
    }

    const { data: saidas, error: errorSaidas } = await supabase
      .from('pneus')
      .select('quantidade')
      .eq('marca', marca)
      .eq('modelo', modelo)
      .eq('tipo', tipo)
      .eq('status', 'SAIDA');

    if (errorSaidas) {
      console.error('Erro ao consultar saídas:', errorSaidas);
      return 0;
    }

    const totalEntradas = entradas?.reduce((sum, item) => sum + (item.quantidade || 0), 0) || 0;
    const totalSaidas = saidas?.reduce((sum, item) => sum + (item.quantidade || 0), 0) || 0;

    return totalEntradas - totalSaidas;
  } catch (error) {
    console.error('Erro ao consultar estoque:', error);
    return 0;
  }
}

// Atualizar posições dos pneus durante rodízio
async function atualizarPosicoesRodizio(saidaDetalhada) {
  try {
    // Remover pneu da posição anterior
    if (saidaDetalhada.posicao_anterior) {
      await supabase
        .from('posicoes_veiculos')
        .delete()
        .eq('placa', saidaDetalhada.placa)
        .eq('posicao', saidaDetalhada.posicao_anterior);
    }

    // Adicionar pneu na nova posição
    if (saidaDetalhada.posicao_nova && saidaDetalhada.codigo_marca_fogo) {
      await supabase
        .from('posicoes_veiculos')
        .upsert({
          placa: saidaDetalhada.placa,
          posicao: saidaDetalhada.posicao_nova,
          codigo_marca_fogo: saidaDetalhada.codigo_marca_fogo,
          data_instalacao: saidaDetalhada.data_saida,
          quilometragem_instalacao: saidaDetalhada.quilometragem,
          usuario_instalacao: saidaDetalhada.usuario
        });
    }
  } catch (error) {
    console.error('Erro ao atualizar posições do rodízio:', error);
  }
}

// Limpar formulário
function limparFormulario() {
  document.getElementById('formSaida').reset();
  document.getElementById('data_operacao').value = new Date().toISOString().slice(0, 16);
  document.getElementById('campos-rodizio').style.display = 'none';
}

// Funções auxiliares
function getCurrentUserName() {
  const usuario = JSON.parse(localStorage.getItem('usuarioLogado'));
  return usuario ? usuario.nome : 'Usuário Anônimo';
}

function verificarPermissoes() {
  const usuario = JSON.parse(localStorage.getItem('usuarioLogado'));
  if (!usuario) {
    alert('Usuário não logado. Redirecionando para login.');
    window.location.href = 'index.html';
    return false;
  }
  return true;
}

// Event listeners para verificar estoque em tempo real
document.getElementById('marca').addEventListener('change', verificarEstoque);
document.getElementById('modelo').addEventListener('change', verificarEstoque);
document.getElementById('tipo').addEventListener('change', verificarEstoque);
