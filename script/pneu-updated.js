import { supabase } from './supabase.js';

let gridBody;
let editMode = false;
let editingId = null;

// 🚀 Inicialização
document.addEventListener('DOMContentLoaded', () => {
  gridBody = document.getElementById('grid-pneus-body');
  const form = document.getElementById('formPneu');
  const btnBuscar = document.getElementById('btn-buscar');
  const btnContagemEstoque = document.getElementById('btnContagemEstoque');
  const btnRelatorioMarcaFogo = document.getElementById('btnRelatorioMarcaFogo');
  const closeModalContagem = document.getElementById('closeModalContagem');
  const cancelModalContagem = document.getElementById('cancelModalContagem');
  const formContagem = document.getElementById('formContagemEstoque');

  // Menu toggle
  document.querySelectorAll('.menu-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      btn.parentElement.classList.toggle('active');
    });
  });

  // Buscar pneus
  btnBuscar?.addEventListener('click', () => {
    buscarPneus();
  });

  // Form submit
  form.addEventListener('submit', handleSubmit);

  // Contagem de Estoque modal
  btnContagemEstoque?.addEventListener('click', () => {
    document.getElementById('modalContagemEstoque').style.display = 'block';
    initializeSelectsContagem();
  });

  // Relatório Marca de Fogo
  btnRelatorioMarcaFogo?.addEventListener('click', () => {
    gerarRelatorioMarcaFogo();
  });

  closeModalContagem?.addEventListener('click', () => {
    document.getElementById('modalContagemEstoque').style.display = 'none';
  });

  cancelModalContagem?.addEventListener('click', () => {
    document.getElementById('modalContagemEstoque').style.display = 'none';
  });

  formContagem?.addEventListener('submit', handleContagemSubmit);

  // Close modal on outside click
  window.addEventListener('click', (event) => {
    const modal = document.getElementById('modalContagemEstoque');
    if (event.target === modal) {
      modal.style.display = 'none';
    }
  });

  // Initialize selects
  initializeSelects();

  // Load placas
  carregarPlacas();

  // Load pneus
  carregarPneus();

  // Verificar permissões após carregar
  verificarPermissoes();
});

// Initialize selects with predefined options
function initializeSelects() {
  const selectMarca = document.getElementById('marca');
  const selectModelo = document.getElementById('modelo');
  const selectTipo = document.getElementById('tipo');

  // Predefined options
  const marcas = ['BRIDGESTONE', 'CONTINENTAL', 'GOODYEAR', 'MICHELIN', 'PIRELLI'];
  const modelos = ['225/75/16', '235/75/17.5', '275/80/22.5 - LISO', '275/80/22.5 - BORRACHUDO', '295/80/22.5 - LISO', '295/80/22.5 - BORRACHUDO'];
  const tipos = ['NOVO', 'RECAPADO'];

  // Update marca options
  selectMarca.innerHTML = '<option value="">Selecione</option>' + marcas.map(m => `<option value="${m}">${m}</option>`).join('');

  // Similar for others
  selectModelo.innerHTML = '<option value="">Selecione</option>' + modelos.map(m => `<option value="${m}">${m}</option>`).join('');
  selectTipo.innerHTML = '<option value="">Selecione</option>' + tipos.map(t => `<option value="${t}">${t}</option>`).join('');
}

// 📦 Carregar placas do Supabase
async function carregarPlacas() {
  const selectPlaca = document.getElementById('placa');
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

    selectPlaca.innerHTML = '<option value="">Selecione</option>';
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

function getCurrentUserName() {
  // Usar localStorage para usuário logado
  const usuario = JSON.parse(localStorage.getItem('usuarioLogado'));
  return usuario ? usuario.nome : 'Usuário Anônimo';
}

// Verificar permissões do usuário
function verificarPermissoes() {
  const usuario = JSON.parse(localStorage.getItem('usuarioLogado'));
  if (!usuario) {
    alert('Usuário não logado. Redirecionando para login.');
    window.location.href = 'index.html';
    return false;
  }

  // Usuários de estoque podem acessar apenas visualização e contagem
  if (usuario.nivel === 'Estoque') {
    // Esconder botões de edição e exclusão
    const botoesEditar = document.querySelectorAll('.btn-acao.editar');
    const botoesExcluir = document.querySelectorAll('.btn-acao.excluir');
    botoesEditar.forEach(btn => btn.style.display = 'none');
    botoesExcluir.forEach(btn => btn.style.display = 'none');

    // Esconder formulário de cadastro - REMOVIDO para permitir lançamentos
    // const formCadastro = document.getElementById('formPneu');
    // if (formCadastro) formCadastro.style.display = 'none';

    // Esconder botão de contagem de estoque se não for necessário
    // const btnContagem = document.getElementById('btnContagemEstoque');
    // if (btnContagem) btnContagem.style.display = 'none';
  }

  return true;
}

// Handle form submit
async function handleSubmit(e) {
  e.preventDefault();

  const formData = new FormData(e.target);
  const pneu = {
    data: new Date().toISOString(),
    placa: formData.get('placa')?.toUpperCase(),
    marca: formData.get('marca'),
    modelo: formData.get('modelo'),
    vida: parseInt(formData.get('vida') || 0),
    tipo: formData.get('tipo'),
    status: formData.get('status'),
    descricao: formData.get('descricao'),
    nota_fiscal: formData.get('nota_fiscal')?.trim(),
    quantidade: parseInt(formData.get('quantidade') || 0),
    usuario: getCurrentUserName(),
  };

  if (!pneu.marca || !pneu.modelo || !pneu.tipo) {
    alert('Preencha os campos obrigatórios.');
    return;
  }

  try {
    if (editMode && editingId) {
      // UPDATE: Primeiro, buscar o registro antigo para reverter estoque
      const { data: oldPneu, error: fetchError } = await supabase
        .from('pneus')
        .select('*')
        .eq('id', editingId)
        .single();

      if (fetchError) {
        console.error('Erro ao buscar pneu para edição:', fetchError);
        alert('Erro ao buscar dados para edição.');
        return;
      }

      // Atualizar o registro
      const { error: updateError } = await supabase
        .from('pneus')
        .update(pneu)
        .eq('id', editingId);

      if (updateError) {
        console.error('Erro ao atualizar pneu:', updateError);
        alert('Erro ao atualizar pneu.');
        return;
      }

      alert('Pneu atualizado com sucesso!');
      editMode = false;
      editingId = null;
    } else {
      // INSERT: Inserir novo registro
      const { data: insertedData, error: insertError } = await supabase
        .from('pneus')
        .insert([pneu])
        .select()
        .single();

      if (insertError) {
        console.error('Erro ao cadastrar pneu:', insertError);
        console.error('Detalhes do erro:', JSON.stringify(insertError, null, 2));
        alert(`Erro ao cadastrar pneu: ${insertError.message || 'Erro desconhecido'}`);
        return;
      }

      // Se foi um lançamento de pneus NOVOS com ESTOQUE e múltiplas unidades,
      // gerar códigos de marca de fogo na tabela separada
      if (pneu.tipo === 'NOVO' && pneu.descricao === 'ESTOQUE' && pneu.status === 'ENTRADA' && pneu.quantidade > 1 && insertedData) {
        try {
          await gerarCodigosMarcaFogo(insertedData.id, pneu.quantidade, pneu.usuario);
        } catch (error) {
          console.error('Erro na geração de códigos:', error);
          alert('Aviso: Lançamento realizado, mas houve erro na geração dos códigos de marca de fogo.');
        }
      }

      alert('Pneu cadastrado com sucesso!');
    }

    clearForm();
    await carregarPneus();
  } catch (error) {
    console.error('Erro geral:', error);
    alert('Erro inesperado. Tente novamente.');
  }
}

function clearForm() {
  document.getElementById('formPneu').reset();
  document.getElementById('data').value = new Date().toISOString().slice(0, 16);
}

// 📦 Carregar pneus do Supabase
async function carregarPneus() {
  if (!gridBody) return;

  try {
    const { data: pneus, error } = await supabase
      .from('pneus')
      .select('*')
      .order('marca', { ascending: true })
      .order('data', { ascending: false });

    if (error) {
      console.error('Erro ao carregar pneus:', error);
      gridBody.innerHTML = '<div class="grid-row">Erro ao carregar dados.</div>';
      return;
    }

    renderizarPneus(pneus || []);
  } catch (error) {
    console.error('Erro ao carregar pneus:', error);
    gridBody.innerHTML = '<div class="grid-row">Erro ao carregar dados.</div>';
  }
}

// 🔍 Buscar pneus no Supabase
async function buscarPneus() {
  const placa = document.getElementById('campo-placa')?.value.trim().toUpperCase();
  const marca = document.getElementById('campo-marca')?.value.trim().toUpperCase();
  const modelo = document.getElementById('campo-modelo')?.value.trim().toUpperCase();

  try {
    let query = supabase
      .from('pneus')
      .select('*')
      .order('marca', { ascending: true })
      .order('data', { ascending: false });

    if (placa) {
      query = query.ilike('placa', `%${placa}%`);
    }
    if (marca) {
      query = query.ilike('marca', `%${marca}%`);
    }
    if (modelo) {
      query = query.ilike('modelo', `%${modelo}%`);
    }

    const { data: pneus, error } = await query;

    if (error) {
      console.error('Erro ao buscar pneus:', error);
      return;
    }

    renderizarPneus(pneus || []);
  } catch (error) {
    console.error('Erro ao buscar pneus:', error);
  }
}

// 🧱 Renderizar grid
function renderizarPneus(lista) {
  gridBody.innerHTML = '';

  if (lista.length === 0) {
    gridBody.innerHTML = '<div class="grid-row">Nenhum pneu encontrado.</div>';
    return;
  }

  // Verificar nível do usuário para ocultar coluna de ações
  const usuario = JSON.parse(localStorage.getItem('usuarioLogado'));
  const isEstoque = usuario && usuario.nivel === 'Estoque';

  // Ocultar cabeçalho de ações se for usuário Estoque
  const gridHeader = document.querySelector('.grid-header');
  if (gridHeader) {
    const acoesHeader = gridHeader.querySelector('div:last-child');
    if (acoesHeader && acoesHeader.textContent.trim() === 'Ações') {
      acoesHeader.style.display = isEstoque ? 'none' : 'block';
    }
  }

  lista.forEach((pneu, index) => {
    const row = document.createElement('div');
    row.classList.add('grid-row');
    row.style.display = 'flex';
    row.style.whiteSpace = 'nowrap';
    row.style.borderBottom = '1px solid #eee';
    row.style.backgroundColor = index % 2 === 0 ? '#ffffff' : '#f8f9fa';
    row.style.cursor = 'pointer';
    row.onmouseover = () => row.style.backgroundColor = '#e9ecef';
    row.onmouseout = () => row.style.backgroundColor = index % 2 === 0 ? '#ffffff' : '#f8f9fa';

    let acoesHTML = '';
    if (!isEstoque) {
      acoesHTML = `
        <div style="flex: 1; min-width: 150px; padding: 12px 8px; text-align: center;">
          <button class="btn-acao editar" onclick="editarPneu('${pneu.id}'); event.stopPropagation();" style="margin-right: 5px; background-color: #007bff; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer;">
            <i class="fas fa-pen"></i> Ed
          </button>
          <button class="btn-acao excluir" onclick="excluirPneu('${pneu.id}'); event.stopPropagation();" style="background-color: #dc3545; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer;">
            <i class="fas fa-trash"></i> Ex
          </button>
        </div>
      `;
    }

    row.innerHTML = `
      <div style="flex: 1; min-width: 80px; padding: 12px 8px; text-align: left; border-right: 1px solid #eee;">${pneu.placa || ''}</div>
      <div style="flex: 1; min-width: 80px; padding: 12px 8px; text-align: left; border-right: 1px solid #eee;">${pneu.marca}</div>
      <div style="flex: 1.2; min-width: 100px; padding: 12px 8px; text-align: left; border-right: 1px solid #eee;">${pneu.modelo}</div>
      <div style="flex: 0.5; min-width: 50px; padding: 12px 8px; text-align: center; border-right: 1px solid #eee;">${pneu.vida || 0}</div>
      <div style="flex: 1; min-width: 80px; padding: 12px 8px; text-align: left; border-right: 1px solid #eee;">${pneu.tipo}</div>
      <div style="flex: 1; min-width: 80px; padding: 12px 8px; text-align: left; border-right: 1px solid #eee;">${pneu.status || ''}</div>
      <div style="flex: 2; min-width: 100px; padding: 12px 8px; text-align: left; border-right: 1px solid #eee;">${pneu.descricao || ''}</div>
      <div style="flex: 1.5; min-width: 120px; padding: 12px 8px; text-align: left; border-right: 1px solid #eee;">${pneu.data ? new Date(pneu.data).toLocaleString() : ''}</div>
      <div style="flex: 1; min-width: 80px; padding: 12px 8px; text-align: left; border-right: 1px solid #eee;">${pneu.usuario || ''}</div>
      <div style="flex: 0.5; min-width: 60px; padding: 12px 8px; text-align: center; border-right: 1px solid #eee;">${pneu.quantidade || 0}</div>
      <div style="flex: 1; min-width: 100px; padding: 12px 8px; text-align: center; ${isEstoque ? '' : 'border-right: 1px solid #eee;'}">
        ${pneu.tipo === 'NOVO' && pneu.descricao === 'ESTOQUE' && pneu.status === 'ENTRADA' && pneu.quantidade > 1 ?
          `<button onclick="visualizarCodigosMarcaFogo('${pneu.id}'); event.stopPropagation();" style="background-color: #28a745; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 12px;">
            <i class="fas fa-eye"></i> Ver Códigos
          </button>` :
          (pneu.codigo_marca_fogo ? `<span style="color: #dc3545; font-weight: bold;">${pneu.codigo_marca_fogo}</span>` : '-')
        }
      </div>
      ${acoesHTML}
    `;

    gridBody.appendChild(row);
  });
}

// ✏️ Editar pneu
window.editarPneu = async function(id) {
  try {
    const { data: pneu, error } = await supabase
      .from('pneus')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('Erro ao buscar pneu para edição:', error);
      alert('Erro ao buscar dados para edição.');
      return;
    }

    if (!pneu) {
      alert('Pneu não encontrado.');
      return;
    }

    // Populate form
    document.getElementById('data').value = pneu.data ? new Date(pneu.data).toISOString().slice(0, 16) : '';
    document.getElementById('placa').value = pneu.placa || '';
    document.getElementById('marca').value = pneu.marca;
    document.getElementById('modelo').value = pneu.modelo;
    document.getElementById('vida').value = pneu.vida || 0;
    document.getElementById('tipo').value = pneu.tipo;
    document.getElementById('status').value = pneu.status || '';
    document.getElementById('descricao').value = pneu.descricao || '';
    document.getElementById('quantidade').value = pneu.quantidade || 0;

    editMode = true;
    editingId = id;

    // Scroll to form
    document.getElementById('formPneu').scrollIntoView({ behavior: 'smooth' });
  } catch (error) {
    console.error('Erro ao editar pneu:', error);
    alert('Erro ao carregar dados para edição.');
  }
};

// 🗑️ Excluir pneu
window.excluirPneu = async function(id) {
  if (!confirm('Tem certeza que deseja excluir este pneu?')) return;

  try {
    const { error } = await supabase
      .from('pneus')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Erro ao excluir pneu:', error);
      alert('Erro ao excluir pneu.');
      return;
    }

    alert('Pneu excluído com sucesso!');
    await carregarPneus();
  } catch (error) {
    console.error('Erro ao excluir pneu:', error);
    alert('Erro inesperado ao excluir.');
  }
};

// Initialize selects for contagem modal
function initializeSelectsContagem() {
  const selectMarca = document.getElementById('marcaContagem');
  const selectModelo = document.getElementById('modeloContagem');
  const selectTipo = document.getElementById('tipoContagem');

  // Predefined options
  const marcas = ['BRIDGESTONE', 'CONTINENTAL', 'GOODYEAR', 'MICHELIN', 'PIRELLI'];
  const modelos = ['225/75/16', '235/75/17.5', '275/80/22.5 - LISO', '275/80/22.5 - BORRACHUDO', '295/80/22.5 - LISO', '295/80/22.5 - BORRACHUDO'];
  const tipos = ['NOVO', 'RECAPADO'];

  selectMarca.innerHTML = '<option value="">Selecione</option>' + marcas.map(m => `<option value="${m}">${m}</option>`).join('');
  selectModelo.innerHTML = '<option value="">Selecione</option>' + modelos.map(m => `<option value="${m}">${m}</option>`).join('');
  selectTipo.innerHTML = '<option value="">Selecione</option>' + tipos.map(t => `<option value="${t}">${t}</option>`).join('');
}

// Handle contagem submit
async function handleContagemSubmit(e) {
  e.preventDefault();

  const formData = new FormData(e.target);
  const pneu = {
    data: new Date().toISOString(),
    placa: 'CONTROLE - SP',
    marca: formData.get('marcaContagem'),
    modelo: formData.get('modeloContagem'),
    vida: parseInt(formData.get('vidaContagem') || 0),
    tipo: formData.get('tipoContagem'),
    status: 'ENTRADA',
    descricao: 'CONTAGEM DE ESTOQUE',
    quantidade: parseInt(formData.get('quantidadeContagem') || 0),
    usuario: getCurrentUserName(),
  };

  if (!pneu.marca || !pneu.modelo || !pneu.tipo || !pneu.quantidade) {
    alert('Preencha todos os campos obrigatórios.');
    return;
  }

  try {
    const { error } = await supabase
      .from('pneus')
      .insert([pneu]);

    if (error) {
      console.error('Erro ao registrar contagem:', error);
      alert('Erro ao registrar contagem de estoque.');
      return;
    }

    alert('Contagem de estoque registrada com sucesso!');
    document.getElementById('modalContagemEstoque').style.display = 'none';
    e.target.reset();
    await carregarPneus();
  } catch (error) {
    console.error('Erro na contagem:', error);
    alert('Erro inesperado na contagem.');
  }
}

// Gerar códigos de marca de fogo para um lançamento
async function gerarCodigosMarcaFogo(lancamentoId, quantidade, usuario) {
  try {
    console.log('Iniciando geração de códigos para lançamento:', lancamentoId, 'quantidade:', quantidade);

    const codigosParaInserir = [];

    // Buscar todos os códigos existentes para determinar o próximo número
    const { data: todosCodigos, error: buscaError } = await supabase
      .from('marcas_fogo_lancamento')
      .select('codigo_marca_fogo')
      .order('codigo_marca_fogo', { ascending: false });

    if (buscaError) {
      console.error('Erro ao buscar códigos existentes:', buscaError);
      throw new Error('Erro ao buscar códigos existentes');
    }

    console.log('Códigos existentes encontrados:', todosCodigos?.length || 0);

    let proximoNumero = 1;
    if (todosCodigos && todosCodigos.length > 0) {
      // Encontrar o maior número
      const maiorCodigo = Math.max(...todosCodigos.map(c => parseInt(c.codigo_marca_fogo) || 0));
      proximoNumero = maiorCodigo + 1;
      console.log('Maior código encontrado:', maiorCodigo, 'próximo número:', proximoNumero);
    }

    // Gerar códigos sequenciais
    for (let i = 0; i < quantidade; i++) {
      const novoCodigo = proximoNumero.toString().padStart(6, '0');
      console.log('Gerando código:', novoCodigo, 'para posição:', i + 1);

      codigosParaInserir.push({
        lancamento_id: lancamentoId,
        codigo_marca_fogo: novoCodigo,
        usuario_criacao: usuario
      });

      proximoNumero++;
    }

    console.log('Códigos para inserir:', codigosParaInserir);

    if (codigosParaInserir.length > 0) {
      const { error: insertError } = await supabase
        .from('marcas_fogo_lancamento')
        .insert(codigosParaInserir);

      if (insertError) {
        console.error('Erro ao inserir códigos de marca de fogo:', insertError);
        console.error('Detalhes do erro:', JSON.stringify(insertError, null, 2));
        throw new Error('Erro ao inserir códigos: ' + insertError.message);
      }

      console.log('Códigos inseridos com sucesso!');
    }
  } catch (error) {
    console.error('Erro geral na geração de códigos:', error);
    throw error; // Re-throw para que o try-catch no handleSubmit capture
  }
}

// Visualizar códigos de marca de fogo de um lançamento específico
window.visualizarCodigosMarcaFogo = async function(lancamentoId) {
  try {
    // Buscar códigos de marca de fogo para este lançamento
    const { data: codigos, error } = await supabase
      .from('marcas_fogo_lancamento')
      .select(`
        codigo_marca_fogo,
        data_criacao,
        usuario_criacao,
        pneus (
          marca,
          modelo,
          tipo,
          vida,
          quantidade,
          nota_fiscal,
          data,
          usuario
        )
      `)
      .eq('lancamento_id', lancamentoId)
      .order('codigo_marca_fogo', { ascending: true });

    if (error) {
      console.error('Erro ao buscar códigos:', error);
      alert('Erro ao carregar códigos de marca de fogo.');
      return;
    }

    const lista = codigos || [];

    if (lista.length === 0) {
      alert('Nenhum código de marca de fogo encontrado para este lançamento.');
      return;
    }

    // Criar modal para exibir os códigos
    const modal = document.createElement('div');
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background-color: rgba(0,0,0,0.5);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 10000;
    `;

    const modalContent = document.createElement('div');
    modalContent.style.cssText = `
      background: white;
      padding: 20px;
      border-radius: 8px;
      max-width: 800px;
      max-height: 80vh;
      overflow-y: auto;
      box-shadow: 0 4px 20px rgba(0,0,0,0.3);
    `;

    const pneu = lista[0]?.pneus;
    const titulo = document.createElement('h3');
    titulo.textContent = `Códigos de Marca de Fogo - ${pneu?.marca} ${pneu?.modelo}`;
    titulo.style.cssText = 'margin-bottom: 15px; color: #28a745; border-bottom: 2px solid #28a745; padding-bottom: 10px;';

    const infoLancamento = document.createElement('div');
    infoLancamento.innerHTML = `
      <p><strong>Quantidade Total:</strong> ${pneu?.quantidade || 0}</p>
      <p><strong>Data do Lançamento:</strong> ${pneu?.data ? new Date(pneu.data).toLocaleDateString('pt-BR') : ''}</p>
      <p><strong>Nota Fiscal:</strong> ${pneu?.nota_fiscal || 'N/A'}</p>
      <p><strong>Usuário:</strong> ${pneu?.usuario || ''}</p>
    `;
    infoLancamento.style.cssText = 'margin-bottom: 20px; padding: 10px; background: #f8f9fa; border-radius: 4px;';

    const gridCodigos = document.createElement('div');
    gridCodigos.style.cssText = `
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
      gap: 10px;
      margin-bottom: 20px;
    `;

    lista.forEach(item => {
      const codigoDiv = document.createElement('div');
      codigoDiv.style.cssText = `
        background: #28a745;
        color: white;
        padding: 8px;
        border-radius: 4px;
        text-align: center;
        font-weight: bold;
        font-size: 14px;
        border: 2px solid #218838;
      `;
      codigoDiv.textContent = item.codigo_marca_fogo;
      gridCodigos.appendChild(codigoDiv);
    });

    const botoesContainer = document.createElement('div');
    botoesContainer.style.cssText = 'display: flex; gap: 10px; justify-content: flex-end;';

    const btnFechar = document.createElement('button');
    btnFechar.textContent = 'Fechar';
    btnFechar.style.cssText = 'padding: 8px 16px; background: #6c757d; color: white; border: none; border-radius: 4px; cursor: pointer;';
    btnFechar.onclick = () => document.body.removeChild(modal);

    const btnExportarXLSX = document.createElement('button');
    btnExportarXLSX.textContent = 'Exportar XLSX';
    btnExportarXLSX.style.cssText = 'padding: 8px 16px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer;';
    btnExportarXLSX.onclick = () => exportarCodigosLancamento(codigos);

    const btnExportarPDF = document.createElement('button');
    btnExportarPDF.textContent = 'Gerar PDF';
    btnExportarPDF.style.cssText = 'padding: 8px 16px; background: #dc3545; color: white; border: none; border-radius: 4px; cursor: pointer;';
    btnExportarPDF.onclick = () => gerarPDFCodigosLancamento(codigos);

    botoesContainer.appendChild(btnExportarXLSX);
    botoesContainer.appendChild(btnExportarPDF);
    botoesContainer.appendChild(btnFechar);

    modalContent.appendChild(titulo);
    modalContent.appendChild(infoLancamento);
    modalContent.appendChild(gridCodigos);
    modalContent.appendChild(botoesContainer);
    modal.appendChild(modalContent);

    // Fechar modal ao clicar fora
    modal.onclick = (e) => {
      if (e.target === modal) {
        document.body.removeChild(modal);
      }
    };

    document.body.appendChild(modal);
  } catch (error) {
    console.error('Erro ao visualizar códigos:', error);
    alert('Erro ao carregar códigos de marca de fogo.');
  }
};

// Exportar códigos de um lançamento específico
async function exportarCodigosLancamento(codigos) {
  try {
    const lista = codigos || [];

    if (lista.length === 0) {
      alert('Nenhum código para exportar.');
      return;
    }

    const pneu = lista[0]?.pneus;

    // Preparar dados para XLSX
    const dadosXLSX = [];

    // Cabeçalho
    dadosXLSX.push(['MARQUESPAN - CÓDIGOS DE MARCA DE FOGO']);
    dadosXLSX.push([`Lançamento: ${pneu?.marca} ${pneu?.modelo}`]);
    dadosXLSX.push([`Data: ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR')}`]);
    dadosXLSX.push(['']); // Linha em branco

    // Cabeçalhos das colunas
    dadosXLSX.push(['CÓDIGOS DE MARCA DE FOGO', 'DATA', 'NF', 'MARCA', 'MODELO']);

    // Dados dos códigos
    lista.forEach(item => {
      const pneu = item.pneus;
      dadosXLSX.push([
        item.codigo_marca_fogo,
        item.data_criacao ? new Date(item.data_criacao).toLocaleDateString('pt-BR') : '',
        pneu?.nota_fiscal || '',
        pneu?.marca || '',
        pneu?.modelo || ''
      ]);
    });

    dadosXLSX.push(['']); // Linha em branco
    dadosXLSX.push(['INFORMAÇÕES DO LANÇAMENTO']);
    dadosXLSX.push([`Marca: ${pneu?.marca || ''}`]);
    dadosXLSX.push([`Modelo: ${pneu?.modelo || ''}`]);
    dadosXLSX.push([`Tipo: ${pneu?.tipo || ''}`]);
    dadosXLSX.push([`Vida: ${pneu?.vida || 0}`]);
    dadosXLSX.push([`Quantidade: ${pneu?.quantidade || 0}`]);
    dadosXLSX.push([`Nota Fiscal: ${pneu?.nota_fiscal || ''}`]);
    dadosXLSX.push([`Data Entrada: ${pneu?.data ? new Date(pneu.data).toLocaleDateString('pt-BR') : ''}`]);
    dadosXLSX.push([`Usuário: ${pneu?.usuario || ''}`]);

    // Criar workbook e worksheet
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(dadosXLSX);

    // Definir larguras das colunas
    ws['!cols'] = [
      { wch: 25 }, // CÓDIGOS DE MARCA DE FOGO
      { wch: 15 }, // DATA
      { wch: 20 }, // NF
      { wch: 15 }, // MARCA
      { wch: 25 }  // MODELO
    ];

    // Adicionar worksheet ao workbook
    XLSX.utils.book_append_sheet(wb, ws, 'Codigos_Marca_Fogo');

    // Nome do arquivo
    const dataHora = new Date().toISOString().slice(0, 19).replace(/:/g, '-').replace('T', '_');
    const nomeArquivo = `codigos_marca_fogo_${pneu?.marca || 'lancamento'}_${dataHora}.xlsx`;

    // Salvar arquivo
    XLSX.writeFile(wb, nomeArquivo);

    alert(`✅ Códigos exportados com sucesso!\n\n📊 ${lista.length} códigos exportados\n📅 Data: ${new Date().toLocaleDateString('pt-BR')}\n\nArquivo: ${nomeArquivo}`);
  } catch (error) {
    console.error('Erro na exportação:', error);
    alert('Erro ao exportar códigos.');
  }
}

// Gerar PDF dos códigos de marca de fogo de um lançamento específico
async function gerarPDFCodigosLancamento(codigos) {
  try {
    const lista = codigos || [];

    if (lista.length === 0) {
      alert('Nenhum código para gerar PDF.');
      return;
    }

    const pneu = lista[0]?.pneus;

    // Inicializar jsPDF
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    // Configurações da página
    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;
    const margin = 20;
    let yPosition = margin;

    // Função auxiliar para adicionar texto com quebra de linha
    const addText = (text, x, y, options = {}) => {
      doc.text(text, x, y, options);
      return y + 6; // Retorna nova posição Y
    };

    // Cabeçalho com logo no canto superior direito
    try {
      // Adicionar logo no canto superior direito
      const logoWidth = 40;
      const logoHeight = 20;
      const logoX = pageWidth - margin - logoWidth;
      const logoY = margin;

      // Logo em base64 fornecido pelo usuário
      const logoBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAXQAAABKCAYAAACrZK86AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsIAAA7CARUoSoAAAAAZdEVYdFNvZnR3YXJlAEFkb2JlIEltYWdlUmVhZHlxyWU8AAADrGlUWHRYTUw6Y29tLmFkb2JlLnhtcAAAAAAAPD94cGFja2V0IGJlZ2luPSLvu78iIGlkPSJXNU0wTXBDZWhpSHpyZVN6TlRjemtjOWQiPz4NCjx4OnhtcG1ldGEgeG1sbnM6eD0iYWRvYmU6bnM6bWV0YS8iIHg6eG1wdGs9IkFkb2JlIFhNUCBDb3JlIDkuMS1jMDAyIDc5LmExY2QxMmY0MSwgMjAyNC8xMS8wOC0xNjowOToyMCAgICAgICAgIj4NCgk8cmRmOlJERiB4bWxuczpyZGY9Imh0dHA6Ly93d3cudzMub3JnLzE5OTkvMDIvMjItcmRmLXN5bnRheC1ucyMiPg0KCQk8cmRmOkRlc2NyaXB0aW9uIHJkZjphYm91dD0iIiB4bWxuczp4bXA9Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC8iIHhtcE1NOkluc3RhbmNlSUQ9InhtcC5paWQ6RUNFNTVCRjVGM0EwMTFFRkEyQzU4QUJCMjcxMUU5M0YiIHhtcE1NOkRvY3VtZW50SUQ9InhtcC5kaWQ6RUNFNTVCRjZGM0EwMTFFRkEyQzU4QUJCMjcxMUU5M0YiPg0KCQkJPHhtcE1NOkRlcml2ZWRGcm9tIHN0UmVmOmluc3RhbmNlSUQ9InhtcC5paWQ6RUNFNTVCRjNGM0EwMTFFRkEyQzU4QUJCMjcxMUU5M0YiIHN0UmVmOmRvY3VtZW50SUQ9InhtcC5kaWQ6RUNFNTVCRjRGM0EwMTFFRkEyQzU4QUJCMjcxMUU5M0YiLz4NCgkJPC9yZGY6RGVzY3JpcHRpb24+DQoJCTxyZGY6RGVzY3JpcHRpb24geG1sbnM6dGlmZj0iaHR0cDovL25zLmFkb2JlLmNvbS10aWZmLzEuMC8iPjx0aWZmOk9yaWVudGF0aW9uPjE8L3RpZmY6T3JpZW50YXRpb24+PC9yZGY6RGVzY3JpcHRpb24+PC9yZGY6UkRGPg0KPC94OnhtcG1ldGE+DQo8P3hwYWNr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';
      doc.addImage(logoBase64, 'PNG', logoX, logoY, logoWidth, logoHeight);

      // Título do relatório ao lado esquerdo
      doc.setFontSize(12);
      doc.text('RELATÓRIO DE MARCA DE FOGO', margin, yPosition + 10);
      yPosition += 25; // Ajustar espaço após a imagem e título
    } catch (error) {
      // Fallback para texto se a imagem não estiver disponível
      console.error('Erro ao adicionar logo:', error);
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('MARQUESPAN', margin, yPosition);
      yPosition += 8;

      doc.setFontSize(12);
      doc.text('RELATÓRIO DE MARCA DE FOGO', margin, yPosition);
      yPosition += 15;
    }

    // Informações do cabeçalho em tabela invisível (4 colunas)
    const tableData = [
      ['Data', new Date().toLocaleDateString('pt-BR') + ', ' + new Date().toLocaleTimeString('pt-BR'), 'Usuário', pneu?.usuario || 'Sistema'],
      ['Marca/Modelo', `${pneu?.marca || ''} ${pneu?.modelo || ''}`, 'Quantidade', pneu?.quantidade || 0],
      ['Nota Fiscal', pneu?.nota_fiscal || 'N/A', 'Tipo', pneu?.tipo || ''],
      ['Data Entrada', pneu?.data ? new Date(pneu.data).toLocaleDateString('pt-BR') : 'N/A', 'Vida', pneu?.vida || 0]
    ];

    // Adicionar tabela invisível (sem bordas)
    doc.autoTable({
      startY: yPosition,
      head: [],
      body: tableData,
      theme: 'plain', // Sem bordas
      styles: {
        fontSize: 10,
        cellPadding: 2,
        lineColor: [255, 255, 255], // Branco (invisível)
        lineWidth: 0,
      },
      columnStyles: {
        0: { cellWidth: 35, fontStyle: 'bold' }, // Rótulos
        1: { cellWidth: 70 }, // Valores
        2: { cellWidth: 35, fontStyle: 'bold' }, // Rótulos
        3: { cellWidth: 35 }  // Valores
      },
      margin: { top: 10 },
      showHead: 'never', // Sem cabeçalho
    });

    yPosition = doc.lastAutoTable.finalY + 10;

    // Status (estilo do modelo)
    doc.setFont('helvetica', 'bold');
    doc.text('Status: _________', margin, yPosition);
    yPosition += 8;

    doc.setFont('helvetica', 'normal');
    doc.text('Realizado por: ___________________________', margin, yPosition);
    yPosition += 15;

    // Título da tabela
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('CÓDIGOS DE MARCA DE FOGO', margin, yPosition);
    yPosition += 10;

    // Preparar dados para tabela (estilo do modelo)
    const tableDataCodigos = lista.map(item => [
      item.codigo_marca_fogo,
      item.data_criacao ? new Date(item.data_criacao).toLocaleDateString('pt-BR') : '',
      pneu?.nota_fiscal || '',
      pneu?.marca || '',
      pneu?.modelo || ''
    ]);

    // Adicionar tabela usando autoTable (estilo do modelo)
    doc.autoTable({
      startY: yPosition,
      head: [['Código', 'Data', 'NF', 'Marca', 'Modelo']],
      body: tableDataCodigos,
      theme: 'grid',
      styles: {
        fontSize: 9,
        cellPadding: 4,
        lineColor: [0, 0, 0],
        lineWidth: 0.1,
      },
      headStyles: {
        fillColor: [255, 255, 255], // Branco
        textColor: [0, 0, 0], // Preto
        fontStyle: 'bold',
        lineColor: [0, 0, 0],
        lineWidth: 0.3,
      },
      columnStyles: {
        0: { cellWidth: 30 }, // Código
        1: { cellWidth: 30 }, // Data
        2: { cellWidth: 25 }, // NF
        3: { cellWidth: 30 }, // Marca
        4: { cellWidth: 40 }, // Modelo
      },
      margin: { top: 10 },
      alternateRowStyles: {
        fillColor: [248, 249, 250], // Cinza claro alternado
      },
    });

    // Adicionar rodapé (estilo do modelo)
    const finalY = doc.lastAutoTable.finalY + 15;
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(`Documento gerado em: ${new Date().toLocaleString('pt-BR')} (Lançamento: ${pneu?.marca || ''} ${pneu?.modelo || ''})`, margin, finalY);
    doc.text(`Página 1 de 1`, pageWidth - margin - 40, finalY, { align: 'right' });

    // Salvar PDF
    const dataHora = new Date().toISOString().slice(0, 19).replace(/:/g, '-').replace('T', '_');
    const nomeArquivo = `relatorio_marca_fogo_${pneu?.marca || 'lancamento'}_${dataHora}.pdf`;

    doc.save(nomeArquivo);

    alert(`✅ PDF gerado com sucesso!\n\n📄 ${lista.length} códigos incluídos\n📅 Data: ${new Date().toLocaleDateString('pt-BR')}\n\nArquivo: ${nomeArquivo}`);
  } catch (error) {
    console.error('Erro na geração do PDF:', error);
    alert('Erro ao gerar PDF.');
  }
}

// 📊 Gerar relatório de marca de fogo
async function gerarRelatorioMarcaFogo() {
  try {
    // Buscar códigos de marca de fogo da tabela separada
    const { data: codigos, error } = await supabase
      .from('marcas_fogo_lancamento')
      .select(`
        codigo_marca_fogo,
        data_criacao,
        usuario_criacao,
        pneus (
          marca,
          modelo,
          tipo,
          vida,
          quantidade,
          nota_fiscal,
          data,
          usuario
        )
      `)
      .order('codigo_marca_fogo', { ascending: true });

    if (error) {
      console.error('Erro ao buscar dados para relatório:', error);
      alert('Erro ao gerar relatório.');
      return;
    }

    const lista = codigos || [];

    if (lista.length === 0) {
      alert('Nenhum pneu com marca de fogo encontrado.');
      return;
    }

    // Preparar dados para XLSX
    const dadosXLSX = [];

    // Cabeçalho com informações da empresa
    dadosXLSX.push(['MARQUESPAN - RELATÓRIO DE MARCA DE FOGO']);
    dadosXLSX.push([`Relatório gerado em: ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR')}`]);
    dadosXLSX.push(['Período: Todos os códigos gerados']);
    dadosXLSX.push(['Fonte: Tabela marcas_fogo_lancamento']);
    dadosXLSX.push(['']); // Linha em branco

    // Cabeçalhos das colunas
    dadosXLSX.push(['CÓDIGO MARCA DE FOGO', 'MARCA', 'MODELO', 'TIPO', 'VIDA', 'NOTA FISCAL', 'DATA ENTRADA', 'USUÁRIO']);

    // Dados dos códigos
    lista.forEach(item => {
      const pneu = item.pneus;
      if (pneu) {
        dadosXLSX.push([
          item.codigo_marca_fogo,
          pneu.marca,
          pneu.modelo,
          pneu.tipo,
          pneu.vida || 0,
          pneu.nota_fiscal || '',
          pneu.data ? new Date(pneu.data).toLocaleDateString('pt-BR') : '',
          pneu.usuario || ''
        ]);
      }
    });

    // Estatísticas
    const marcasDistintas = [...new Set(lista.map(item => item.pneus?.marca).filter(Boolean))].length;
    const modelosDistintos = [...new Set(lista.map(item => item.pneus?.modelo).filter(Boolean))].length;

    dadosXLSX.push(['']); // Linha em branco
    dadosXLSX.push(['ESTATÍSTICAS DO RELATÓRIO']);
    dadosXLSX.push([`Total de códigos gerados: ${lista.length}`]);
    dadosXLSX.push([`Marcas distintas: ${marcasDistintas}`]);
    dadosXLSX.push([`Modelos distintos: ${modelosDistintos}`]);
    dadosXLSX.push(['']); // Linha em branco
    dadosXLSX.push(['INSTRUÇÕES PARA MARCAÇÃO']);
    dadosXLSX.push(['1. Use o código de marca de fogo para identificar cada pneu fisicamente']);
    dadosXLSX.push(['2. Marque o código na lateral do pneu com tinta indelével']);
    dadosXLSX.push(['3. Posicione o código em local visível para facilitar inventário']);
    dadosXLSX.push(['4. Verifique se o código está legível após a marcação']);
    dadosXLSX.push(['']); // Linha em branco
    dadosXLSX.push([`Gerado por: Sistema Marquespan - ${new Date().toLocaleString('pt-BR')}`]);

    // Criar workbook e worksheet
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(dadosXLSX);

    // Definir larguras das colunas
    ws['!cols'] = [
      { wch: 20 }, // CÓDIGO MARCA DE FOGO
      { wch: 15 }, // MARCA
      { wch: 25 }, // MODELO
      { wch: 10 }, // TIPO
      { wch: 8 },  // VIDA
      { wch: 20 }, // NOTA FISCAL
      { wch: 15 }, // DATA ENTRADA
      { wch: 20 }  // USUÁRIO
    ];

    // Adicionar worksheet ao workbook
    XLSX.utils.book_append_sheet(wb, ws, 'Relatorio_Marca_Fogo');

    // Nome do arquivo com data e hora
    const dataHora = new Date().toISOString().slice(0, 19).replace(/:/g, '-').replace('T', '_');
    const nomeArquivo = `relatorio_marca_fogo_marquespan_${dataHora}.xlsx`;

    // Salvar arquivo
    XLSX.writeFile(wb, nomeArquivo);

    // Feedback visual
    alert(`✅ Relatório de Marca de Fogo gerado com sucesso!\n\n📊 ${lista.length} códigos de marca de fogo\n📅 Data: ${new Date().toLocaleDateString('pt-BR')}\n⏰ Hora: ${new Date().toLocaleTimeString('pt-BR')}\n\nArquivo salvo como: ${nomeArquivo}\n\n📋 Use este relatório para orientar a equipe de marcação física dos pneus.`);
  } catch (error) {
    console.error('Erro ao gerar relatório:', error);
    alert('Erro ao gerar relatório de marca de fogo.');
  }
}
