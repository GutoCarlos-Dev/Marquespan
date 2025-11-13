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

    // --- CABEÇALHO ---

    // IMPORTANTE: Para usar seu logo 'logo.png', converta-o para o formato Base64.
    // 1. Acesse um conversor online como: https://www.base64-image.de/
    // 2. Envie seu arquivo 'logo.png'.
    // 3. Copie o texto gerado e cole-o dentro das aspas da variável 'logoBase64' abaixo.
    const logoBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAMgAAABkCAYAAADDhn8LAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAABSSURBVHhe7cExAQAAAMKg9U9tCF8gAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABwZ08AAQAB2ds4AAAAAElFTkSuQmCC'; // Substitua este conteúdo
    const placeholderLogo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAMgAAABkCAYAAADDhn8LAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAABSSURBVHhe7cExAQAAAMKg9U9tCF8gAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABwZ08AAQAB2ds4AAAAAElFTkSuQmCC';

    // Adiciona a logo apenas se não for o placeholder, tratando possíveis erros.
    if (logoBase64 && logoBase64 !== placeholderLogo) {
        try {
            doc.addImage(logoBase64, 'PNG', 150, 8, 45, 20);
        } catch (e) {
            console.warn('Não foi possível adicionar o logo ao PDF. Verifique se o código Base64 está correto.', e);
            alert('Aviso: O logo não pôde ser carregado, mas o PDF foi gerado mesmo assim.');
        }
    } else {
        console.log('Logo placeholder detectado. Pulando a adição do logo no PDF. Substitua o conteúdo da variável "logoBase64" para exibir o logo da sua empresa.');
    }

    // Título do Documento
    doc.setFontSize(20);
    doc.setTextColor('#000000'); // Preto
    doc.setFont('helvetica', 'bold');
    doc.text('RELATÓRIO DE MARCA DE FOGO', 14, 20);

    // Linha divisória
    doc.setDrawColor(76, 175, 80); // Cor verde
    doc.setLineWidth(0.5);
    doc.line(14, 25, 196, 25);

    // --- INFORMAÇÕES GERAIS E ASSINATURAS (NOVO LAYOUT) ---
    doc.setFontSize(10);
    doc.setTextColor(40);
    let startY = 40;
    const lineHeight = 7; // Espaçamento entre linhas
    const leftMargin = 14;
    const rightMargin = 120;

    // Função auxiliar para desenhar texto com rótulo em negrito
    const drawLabeledText = (label, value, x, y) => {
        doc.setFont('helvetica', 'bold');
        doc.text(label, x, y);
        doc.setFont('helvetica', 'normal');
        doc.text(String(value), x + doc.getTextWidth(label), y);
    };

    // Coluna da Esquerda (Dados do Lançamento)
    const dataHora = new Date(pneu?.data || new Date()).toLocaleString('pt-BR');

    // MARCA/MODELO primeiro (destacado)
    doc.setFontSize(15); // Aumentar fonte para destacar
    doc.setTextColor('#f44336'); // Cor vermelha para destacar
    drawLabeledText('MARCA/MODELO:  ', `${pneu?.marca || ''} ${pneu?.modelo || ''}`, leftMargin, startY);
    doc.setTextColor(40); // Restaurar cor padrão
    doc.setFontSize(10); // Restaurar fonte padrão
    startY += lineHeight;

    drawLabeledText('Data do Lançamento:   ', pneu?.data ? new Date(pneu.data).toLocaleString('pt-BR') : 'N/A', leftMargin, startY);
    startY += lineHeight;
    drawLabeledText('Usuário:  ', pneu?.usuario || 'N/A', leftMargin, startY);
    startY += lineHeight;

    // Lógica para negritar "Tipo" e "Vida" na mesma linha
    let currentXPlaca = leftMargin;
    // 1. "Tipo:" (Negrito)
    doc.setFont('helvetica', 'bold');
    const labelTipo = 'Tipo:   ';
    doc.text(labelTipo, currentXPlaca, startY);
    currentXPlaca += doc.getTextWidth(labelTipo);

    // 2. Valor do tipo (Normal)
    doc.setFont('helvetica', 'normal');
    const valorTipo = `${pneu?.tipo || 'N/A'}    `; // Adiciona espaço para separar
    doc.text(valorTipo, currentXPlaca, startY);
    currentXPlaca += doc.getTextWidth(valorTipo);

    // 3. "Vida:" (Negrito)
    doc.setFont('helvetica', 'bold');
    const labelVida = 'Vida: ';
    doc.text(labelVida, currentXPlaca, startY);
    currentXPlaca += doc.getTextWidth(labelVida);

    // 4. Valor da vida (Normal)
    doc.setFont('helvetica', 'normal');
    doc.text(String(pneu?.vida || 0), currentXPlaca, startY);
    startY += lineHeight;

    // Nota Fiscal
    drawLabeledText('Nota Fiscal:  ', pneu?.nota_fiscal || 'N/A', leftMargin, startY);
    startY += lineHeight;

    // Adicionar Quantidade Total em vermelho
    doc.setTextColor('#f44336'); // Cor vermelha
    drawLabeledText('Quantidade Total: ', lista.length, leftMargin, startY);
    doc.setTextColor(40); // Restaurar cor padrão (cinza escuro)
    startY += lineHeight;

    // Coluna da Direita (Assinaturas)
    let signatureY = 90;
    doc.setFont('helvetica', 'bold');
    doc.text('Responsável:', rightMargin, signatureY);
    doc.setFont('helvetica', 'normal');
    doc.text(' ___________________________', rightMargin + doc.getTextWidth('Responsável:'), signatureY);

    // --- TABELA DE CÓDIGOS ---

    // Adicionar total de códigos antes da tabela
    doc.setFont('helvetica', 'bold');
    doc.text(`Total de Códigos: ${lista.length}`, 196, startY + 10, { align: 'right' });

    const tableColumn = ["Código de Marca de Fogo", "Data de Criação"];
    const tableRows = [];

    lista.forEach(item => {
        tableRows.push([
            item.codigo_marca_fogo,
            item.data_criacao ? new Date(item.data_criacao).toLocaleDateString('pt-BR') : 'N/A'
        ]);
    });

    doc.autoTable({
        head: [tableColumn],
        body: tableRows,
        startY: startY + 15, // Ajustado para dar espaço ao total
        theme: 'grid',
        headStyles: { fillColor: [76, 175, 80] },
        styles: { font: 'helvetica', fontSize: 10 }
    });

    // --- INSTRUÇÕES PARA MARCAÇÃO ---
    const instrucoesY = doc.lastAutoTable.finalY + 15;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('INSTRUÇÕES PARA MARCAÇÃO:', leftMargin, instrucoesY);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    const instrucoes = [
        '1. Use o código de marca de fogo para identificar cada pneu fisicamente',
        '2. Marque o código na lateral do pneu com tinta indelével',
        '3. Posicione o código em local visível para facilitar inventário',
        '4. Verifique se o código está legível após a marcação'
    ];

    instrucoes.forEach((instrucao, index) => {
        doc.text(instrucao, leftMargin + 5, instrucoesY + 8 + (index * 5));
    });

    // --- RODAPÉ ---
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(150);
        doc.text(`Documento gerado em: ${new Date().toLocaleString('pt-BR')}`, 14, 287);
        doc.text(`Página ${i} de ${pageCount}`, 196, 287, { align: 'right' });
    }

    // Salvar o PDF
    const dataHoraArquivo = new Date().toISOString().slice(0, 19).replace(/:/g, '-').replace('T', '_');
    const nomeArquivo = `relatorio_marca_fogo_${pneu?.marca || 'lancamento'}_${dataHoraArquivo}.pdf`;

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
