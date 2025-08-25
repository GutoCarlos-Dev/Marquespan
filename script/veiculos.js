import { supabase } from "https://gutocarlos-dev.github.io/Marquespan/script/supabase.js";

let gridBody;

document.addEventListener('DOMContentLoaded', () => {
  const btnAdd = document.getElementById('btnAddVeiculo');
  const btnCancel = document.getElementById('btnCancelar');
  const btnClear = document.getElementById('btnClear');
  const btnBuscar = document.getElementById('btn-buscar');
  const modal = document.getElementById('modalVeiculo');
  const form = document.getElementById('formVeiculo');
  gridBody = document.getElementById('grid-veiculos-body');

  // 🟢 Abrir modal
  btnAdd?.addEventListener('click', () => {
    modal.style.display = 'block';
  });

  // 🔴 Cancelar e limpar
  btnCancel?.addEventListener('click', () => {
    modal.style.display = 'none';
    limparFormulario(form);
  });

  // 🧼 Limpar formulário
  btnClear?.addEventListener('click', (e) => {
    e.preventDefault();
    limparFormulario(form);
  });

  // 🔍 Buscar veículos
  btnBuscar?.addEventListener('click', () => {
    window.buscarVeiculos();
  });

  // 💾 Submeter dados
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const veiculo = {
      filial: getValorUpper('filial'),
      placa: getValorUpper('placa'),
      marca: getValorUpper('marca'),
      modelo: getValorUpper('modelo'),
      tipo: getValorUpper('tipo'),
      situacao: getValorUpper('situacao'),
      chassi: getValorUpper('chassi'),
      renavan: getValorUpper('renavan'),
      anofab: getValorUpper('anofab'),
      anomod: getValorUpper('anomod'),
      qtdtanque: getValorUpper('qtdtanque')
    };

    if (!veiculo.filial || !veiculo.placa || !veiculo.tipo || !veiculo.situacao) {
      alert('⚠️ Preencha todos os campos obrigatórios: Filial, Placa, Tipo e Situação.');
      return;
    }

    const { error } = await supabase.from('veiculos').insert([veiculo]);

    if (error) {
      alert('❌ Erro ao salvar veículo.');
    } else {
      alert('✅ Veículo salvo com sucesso!');
      limparFormulario(form);
      modal.style.display = 'none';
      carregarVeiculos();
    }
  });

  // 🔠 Força maiúsculas em tempo real
  const camposTexto = form?.querySelectorAll('input[type="text"], textarea');
  camposTexto?.forEach(campo => {
    campo.addEventListener('input', () => {
      campo.value = campo.value.toUpperCase();
    });
  });

  // 🚀 Inicializa a listagem
  carregarVeiculos();
});

// 🔧 Utilitários
function getValorUpper(id) {
  const el = document.getElementById(id);
  return el?.value.trim().toUpperCase() || '';
}

function limparFormulario(form) {
  form.querySelectorAll('input').forEach(input => input.value = '');
  form.querySelectorAll('select').forEach(select => select.selectedIndex = 0);
  form.querySelectorAll('textarea').forEach(textarea => textarea.value = '');
}

// 📦 Carregar todos os veículos
async function carregarVeiculos() {
  if (!gridBody) return;

  const { data, error } = await supabase
    .from('veiculos')
    .select('*')
    .order('placa', { ascending: true });

  if (error) {
    console.error('Erro ao carregar veículos:', error);
    gridBody.innerHTML = '<div class="grid-row">Erro ao carregar dados.</div>';
    return;
  }

  gridBody.innerHTML = '';
  renderizarVeiculos(data);
}

// 🔍 Buscar veículos por placa (com confirmação)
window.buscarVeiculos = async function () {
  if (!gridBody) return;

  const placa = document.getElementById('campo-placa')?.value.trim().toUpperCase();
  let query = supabase.from('veiculos').select('*');

  if (placa) {
    query = query.ilike('placa', `%${placa}%`);
  } else {
    const confirmar = confirm("⚠️ Nenhum filtro foi preenchido.\nDeseja buscar todos os veículos?");
    if (!confirmar) return;
  }

  const { data, error } = await query;

  if (error) {
    console.error('Erro ao buscar veículos:', error);
    gridBody.innerHTML = '<div class="grid-row">Erro ao buscar dados.</div>';
    return;
  }

  if (data.length === 0) {
    gridBody.innerHTML = '<div class="grid-row">Nenhum veículo encontrado.</div>';
    return;
  }

  renderizarVeiculos(data);
};

// 🧱 Renderiza os veículos na grid
function renderizarVeiculos(lista) {
  gridBody.innerHTML = '';

  lista.forEach(veiculo => {
    const row = document.createElement('div');
    row.classList.add('grid-row');

    row.innerHTML = `
      <div>${veiculo.filial}</div>
      <div>${veiculo.placa}</div>
      <div>${veiculo.modelo || '-'}</div>
      <div>${veiculo.renavan || '-'}</div>
      <div>${veiculo.tipo || '-'}</div>
      <div>${veiculo.situacao || '-'}</div>
      <div>
        <button onclick="editarVeiculo('${veiculo.id}')">
          <i class="fas fa-edit"></i> Editar
        </button>
      </div>
    `;

    gridBody.appendChild(row);
  });
}

// ✏️ Editar veículo
window.editarVeiculo = async function (id) {
  const { data, error } = await supabase
    .from('veiculos')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !data) {
    alert('❌ Veículo não encontrado.');
    return;
  }

  const largura = 900;
  const altura = 700;
  const esquerda = (window.screen.width - largura) / 2;
  const topo = (window.screen.height - altura) / 2;

  const params = new URLSearchParams(data).toString();

  window.open(
    `cadastro-veiculo.html?${params}`,
    'EditarVeiculo',
    `width=${largura},height=${altura},left=${esquerda},top=${top},resizable=yes,scrollbars=yes`
  );
};

// 🆕 Abrir tela de cadastro de novo veículo
window.abrirCadastroVeiculo = function () {
  const largura = 900;
  const altura = 700;
  const esquerda = (window.screen.width - largura) / 2;
  const topo = (window.screen.height - altura) / 2;

  window.open(
    'cadastro-veiculo.html',
    'CadastroVeiculo',
    `width=${largura},height=${altura},left=${esquerda},top=${top},resizable=yes,scrollbars=yes`
  );
};
