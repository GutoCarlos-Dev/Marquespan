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
      const { error: insertError } = await supabase
        .from('pneus')
        .insert([pneu]);

      if (insertError) {
        console.error('Erro ao cadastrar pneu:', insertError);
        console.error('Detalhes do erro:', JSON.stringify(insertError, null, 2));
        alert(`Erro ao cadastrar pneu: ${insertError.message || 'Erro desconhecido'}`);
        return;
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
      <div style="flex: 0.5; min-width: 60px; padding: 12px 8px; text-align: center; ${isEstoque ? '' : 'border-right: 1px solid #eee;'}">${pneu.quantidade || 0}</div>
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

// 📊 Gerar relatório de marca de fogo
async function gerarRelatorioMarcaFogo() {
  try {
    // Buscar TODOS os pneus com código de marca de fogo (gerados em qualquer entrada)
    const { data: pneus, error } = await supabase
      .from('pneus')
      .select('*')
      .not('codigo_marca_fogo', 'is', null)
      .eq('tipo', 'NOVO')
      .eq('descricao', 'ESTOQUE')
      .eq('status', 'ENTRADA')
      .order('codigo_marca_fogo', { ascending: true });

    if (error) {
      console.error('Erro ao buscar dados para relatório:', error);
      alert('Erro ao gerar relatório.');
      return;
    }

    const lista = pneus || [];

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
    dadosXLSX.push(['Filtro: Pneus NOVOS com descrição ESTOQUE e status ENTRADA']);
    dadosXLSX.push(['']); // Linha em branco

    // Cabeçalhos das colunas
    dadosXLSX.push(['CÓDIGO MARCA DE FOGO', 'MARCA', 'MODELO', 'TIPO', 'VIDA', 'QUANTIDADE', 'NOTA FISCAL', 'DATA ENTRADA', 'USUÁRIO']);

    // Dados dos pneus
    lista.forEach(pneu => {
      dadosXLSX.push([
        pneu.codigo_marca_fogo,
        pneu.marca,
        pneu.modelo,
        pneu.tipo,
        pneu.vida || 0,
        pneu.quantidade || 0,
        pneu.nota_fiscal || '',
        pneu.data ? new Date(pneu.data).toLocaleDateString('pt-BR') : '',
        pneu.usuario || ''
      ]);
    });

    // Estatísticas
    const totalPneus = lista.reduce((sum, pneu) => sum + (pneu.quantidade || 0), 0);
    const marcasDistintas = [...new Set(lista.map(p => p.marca))].length;
    const modelosDistintos = [...new Set(lista.map(p => p.modelo))].length;

    dadosXLSX.push(['']); // Linha em branco
    dadosXLSX.push(['ESTATÍSTICAS DO RELATÓRIO']);
    dadosXLSX.push([`Total de códigos gerados: ${lista.length}`]);
    dadosXLSX.push([`Total de pneus marcados: ${totalPneus}`]);
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
      { wch: 12 }, // QUANTIDADE
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
    alert(`✅ Relatório de Marca de Fogo gerado com sucesso!\n\n📊 ${lista.length} códigos de marca de fogo\n🛢️ ${totalPneus} pneus marcados\n📅 Data: ${new Date().toLocaleDateString('pt-BR')}\n⏰ Hora: ${new Date().toLocaleTimeString('pt-BR')}\n\nArquivo salvo como: ${nomeArquivo}\n\n📋 Use este relatório para orientar a equipe de marcação física dos pneus.`);
  } catch (error) {
    console.error('Erro ao gerar relatório:', error);
    alert('Erro ao gerar relatório de marca de fogo.');
  }
}
