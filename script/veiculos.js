import { supabaseClient } from './supabase.js';

let gridBody;
let currentSort = { column: 'placa', direction: 'asc' };

// 🚀 Inicialização
document.addEventListener('DOMContentLoaded', () => {
  gridBody = document.getElementById('grid-veiculos-body');
  const btnBuscar = document.getElementById('btn-buscar');
  const btnNovoVeiculo = document.getElementById('btn-novo-veiculo');
  const btnImportarMassa = document.getElementById('btn-importar-massa');
  const modalImportacao = document.getElementById('modalImportacao');
  const formImportacao = document.getElementById('formImportacao');
  const btnCloseModalImportacao = modalImportacao?.querySelector('.close-button');


  // 🔍 Buscar veículos
  btnBuscar?.addEventListener('click', () => {
    buscarVeiculos();
  });

  // ➕ Abrir modal de cadastro
  btnNovoVeiculo?.addEventListener('click', () => {
    abrirCadastroVeiculo();
  });

  // 📥 Eventos de Importação
  btnImportarMassa?.addEventListener('click', () => abrirModalImportacao());
  btnCloseModalImportacao?.addEventListener('click', () => fecharModalImportacao());
  modalImportacao?.addEventListener('click', (e) => {
      if (e.target === modalImportacao) {
          fecharModalImportacao();
      }
  });
  formImportacao?.addEventListener('submit', (e) => handleImport(e));

  // � Carrega veículos ao iniciar
  carregarVeiculos();

  // Eventos de ordenação
  document.querySelectorAll('th[data-sort]').forEach(th => {
    th.addEventListener('click', () => handleSort(th.dataset.sort));
  });
});

// 🔄 Expõe a função de atualização para a janela filha (cadastro-veiculo.html)
window.refreshGrid = function() {
  console.log('Grid de veículos será atualizada...');
  carregarVeiculos();
};

// ➕ Abre a janela para um novo cadastro
function abrirCadastroVeiculo() {
  const largura = 900;
  const altura = 700;
  const esquerda = (window.screen.width - largura) / 2;
  const topo = (window.screen.height - altura) / 2;

  window.open(
    'cadastro-veiculo.html',
    'CadastroVeiculo',
    `width=${largura},height=${altura},left=${esquerda},top=${topo},resizable=yes,scrollbars=yes`
  );
}

function abrirModalImportacao() {
    const modal = document.getElementById('modalImportacao');
    if (modal) {
        modal.classList.remove('hidden');
        document.getElementById('formImportacao').reset();
    }
}

function fecharModalImportacao() {
    const modal = document.getElementById('modalImportacao');
    if (modal) {
        modal.classList.add('hidden');
    }
}

async function handleImport(e) {
    e.preventDefault();
    const btnSubmit = e.target.querySelector('button[type="submit"]');
    const originalText = btnSubmit.innerHTML;
    
    const filial = document.getElementById('importFilial').value;
    const arquivo = document.getElementById('arquivoImportacao').files[0];

    if (!filial) {
        alert('Por favor, selecione uma filial.');
        return;
    }
    if (!arquivo) {
        alert('Por favor, selecione um arquivo .xlsx.');
        return;
    }

    btnSubmit.disabled = true;
    btnSubmit.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processando...';

    try {
        const data = await arquivo.arrayBuffer();
        const workbook = XLSX.read(data);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json(worksheet);

        if (json.length === 0) {
            throw new Error("O arquivo está vazio ou em um formato inválido.");
        }

        // 1. Buscar todas as placas existentes de uma vez para otimizar
        const { data: existingVehicles, error: fetchError } = await supabaseClient
            .from('veiculos')
            .select('placa');
        
        if (fetchError) throw fetchError;

        const existingPlates = new Set(existingVehicles.map(v => v.placa));
        
        const veiculosParaInserir = [];
        let duplicados = 0;

        // 2. Processar cada linha do Excel
        for (const row of json) {
            const normalizedRow = {};
            for (const key in row) {
                normalizedRow[key.toUpperCase()] = row[key];
            }

            const placa = normalizedRow['PLACA']?.toString().trim().toUpperCase();
            const modelo = normalizedRow['MODELO']?.toString().trim();

            if (!placa || !modelo) {
                console.warn('Linha ignorada por falta de PLACA ou MODELO:', row);
                continue;
            }

            if (existingPlates.has(placa)) {
                duplicados++;
            } else {
                veiculosParaInserir.push({ 
                    placa, 
                    modelo, 
                    filial, 
                    situacao: 'ativo',
                    marca: 'NÃO INFORMADA', // Valor padrão para evitar erro de constraint
                    tipo: 'OUTROS',         // Valor padrão para evitar erro de constraint em 'tipo'
                    anofab: new Date().getFullYear(), // Valor padrão (ano atual)
                    anomod: new Date().getFullYear(), // Valor padrão (ano atual)
                    qtdtanque: 1            // Valor padrão mínimo
                });
                existingPlates.add(placa); // Evita duplicatas dentro do mesmo arquivo
            }
        }

        // 3. Inserir os novos veículos em lote
        if (veiculosParaInserir.length > 0) {
            const { error: insertError } = await supabaseClient.from('veiculos').insert(veiculosParaInserir);
            if (insertError) throw insertError;
        }

        alert(`Importação concluída!\n\n- ${veiculosParaInserir.length} veículos novos importados.\n- ${duplicados} placas duplicadas foram ignoradas.`);
        
        fecharModalImportacao();
        carregarVeiculos(); // Atualiza a grid
    } catch (error) {
        console.error('Erro durante a importação:', error);
        alert(`Ocorreu um erro: ${error.message}`);
    } finally {
        btnSubmit.disabled = false;
        btnSubmit.innerHTML = originalText;
    }
}

function handleSort(column) {
  if (currentSort.column === column) {
    currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
  } else {
    currentSort.column = column;
    currentSort.direction = 'asc';
  }
  updateSortIcons();
  
  // Recarrega os dados com a nova ordenação
  const placa = document.getElementById('campo-placa')?.value.trim();
  if (placa) buscarVeiculos();
  else carregarVeiculos();
}

function updateSortIcons() {
  document.querySelectorAll('th[data-sort] i').forEach(icon => {
    icon.className = 'fas fa-sort'; // Reset
    const th = icon.parentElement;
    if (th.dataset.sort === currentSort.column) {
      icon.className = currentSort.direction === 'asc' ? 'fas fa-sort-up' : 'fas fa-sort-down';
    }
  });
}

// 📦 Carregar todos os veículos
async function carregarVeiculos() {
  if (!gridBody) return;
  gridBody.innerHTML = '<tr><td colspan="8" class="text-center" style="padding: 20px;">Carregando veículos...</td></tr>';

  const { data, error } = await supabaseClient
    .from('veiculos')
    .select('*')
    .order(currentSort.column, { ascending: currentSort.direction === 'asc' });

  if (error) {
    console.error('Erro ao carregar veículos:', error);
    gridBody.innerHTML = '<tr><td colspan="8" class="text-center" style="color: red; padding: 20px;">Erro ao carregar dados.</td></tr>';
    return;
  }

  renderizarVeiculos(data);
}


// 🔍 Buscar veículos por placa
async function buscarVeiculos() {
  if (!gridBody) return;
  gridBody.innerHTML = '<tr><td colspan="8" class="text-center" style="padding: 20px;">Buscando...</td></tr>';

  const placa = document.getElementById('campo-placa')?.value.trim().toUpperCase();
  let query = supabaseClient.from('veiculos').select('*').order(currentSort.column, { ascending: currentSort.direction === 'asc' });

  if (placa) {
    query = query.ilike('placa', `%${placa}%`);
  } else {
    // Se a busca for vazia, carrega todos, sem confirmação.
  }

  const { data, error } = await query;

  if (error) {
    console.error('Erro ao buscar veículos:', error);
    gridBody.innerHTML = '<tr><td colspan="8" class="text-center" style="color: red; padding: 20px;">Erro ao buscar dados.</td></tr>';
    return;
  }

  if (data.length === 0) {
    gridBody.innerHTML = '<tr><td colspan="8" class="text-center" style="padding: 20px;">Nenhum veículo encontrado.</td></tr>';
    return;
  }

  renderizarVeiculos(data);
}


// 🧱 Renderiza os veículos na grid
function renderizarVeiculos(lista) {
  gridBody.innerHTML = '';

  if (!lista || lista.length === 0) {
    gridBody.innerHTML = '<tr><td colspan="8" class="text-center" style="padding: 20px;">Nenhum veículo cadastrado.</td></tr>';
    return;
  }

  lista.forEach(veiculo => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="padding: 12px; border-bottom: 1px solid #eee;">${veiculo.filial || '-'}</td>
      <td style="padding: 12px; border-bottom: 1px solid #eee;">${veiculo.placa}</td>
      <td style="padding: 12px; border-bottom: 1px solid #eee;">${veiculo.modelo || '-'}</td>
      <td style="padding: 12px; border-bottom: 1px solid #eee;">${veiculo.renavan || '-'}</td>
      <td style="padding: 12px; border-bottom: 1px solid #eee;">${veiculo.tipo || '-'}</td>
      <td style="padding: 12px; border-bottom: 1px solid #eee;">${veiculo.situacao || '-'}</td>
      <td style="padding: 12px; border-bottom: 1px solid #eee;">${veiculo.qrcode || '-'}</td>
      <td style="padding: 12px; border-bottom: 1px solid #eee;">
        <div class="acoes" style="display: flex; gap: 5px;">
          <button class="btn-acao editar" onclick="editarVeiculo('${veiculo.id}')" title="Editar">
            <i class="fas fa-pen"></i>
          </button>
          <button class="btn-acao excluir" onclick="excluirVeiculo('${veiculo.id}')" title="Excluir">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </td>
    `;
    gridBody.appendChild(tr);
  });
}


// ✏️ Editar veículo
window.editarVeiculo = function (id) {
  if (!id) return;

  const largura = 900;
  const altura = 700;
  const esquerda = (window.screen.width - largura) / 2;
  const topo = (window.screen.height - altura) / 2;

  // Passa apenas o ID, que é o que a página de cadastro espera
  window.open(
    `cadastro-veiculo.html?id=${id}`,
    'EditarVeiculo',
    `width=${largura},height=${altura},left=${esquerda},top=${top},resizable=yes,scrollbars=yes`
  );
};

// 🗑️ Excluir veículo
window.excluirVeiculo = async function (id) {
  const confirmar = confirm("Tem certeza que deseja excluir este veículo?");
  if (!confirmar) return;

  const { error } = await supabaseClient
    .from('veiculos')
    .delete()
    .eq('id', id);

  if (error) {
    console.error("Erro ao excluir veículo:", error);
    alert("❌ Erro ao excluir. Tente novamente.");
  } else {
    alert("✅ Veículo excluído com sucesso!");
    carregarVeiculos(); // Atualiza a grid
  }
};
