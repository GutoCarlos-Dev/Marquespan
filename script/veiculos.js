import { supabase } from '/script/supabase.js';

document.addEventListener('DOMContentLoaded', () => {
  const btnAdd = document.getElementById('btnAddVeiculo');
  const btnCancel = document.getElementById('btnCancelar');
  const btnClear = document.getElementById('btnClear');
  const modal = document.getElementById('modalVeiculo');
  const form = document.getElementById('formVeiculo');
  const gridBody = document.getElementById('grid-veiculos-body');

  let veiculoEditandoId = null;

  // 🟢 Abrir modal para novo veículo
  btnAdd?.addEventListener('click', () => {
    veiculoEditandoId = null;
    limparFormulario(form);
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

  // 💾 Submeter dados (novo ou edição)
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

    let resultado;
    if (veiculoEditandoId) {
      resultado = await supabase
        .from('veiculos')
        .update(veiculo)
        .eq('id', veiculoEditandoId);
    } else {
      resultado = await supabase
        .from('veiculos')
        .insert([veiculo]);
    }

    const { error } = resultado;

    if (error) {
      alert('❌ Erro ao salvar veículo.');
    } else {
      alert('✅ Veículo salvo com sucesso!');
      limparFormulario(form);
      modal.style.display = 'none';
      veiculoEditandoId = null;
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

  function getValorUpper(id) {
    const el = document.getElementById(id);
    return el?.value.trim().toUpperCase() || '';
  }

  function limparFormulario(form) {
    veiculoEditandoId = null;
    form.querySelectorAll('input').forEach(input => input.value = '');
    form.querySelectorAll('select').forEach(select => select.selectedIndex = 0);
    form.querySelectorAll('textarea').forEach(textarea => textarea.value = '');
  }

  function preencherFormulario(veiculo) {
    document.getElementById('filial').value = veiculo.filial || '';
    document.getElementById('placa').value = veiculo.placa || '';
    document.getElementById('marca').value = veiculo.marca || '';
    document.getElementById('modelo').value = veiculo.modelo || '';
    document.getElementById('tipo').value = veiculo.tipo || '';
    document.getElementById('situacao').value = veiculo.situacao || '';
    document.getElementById('chassi').value = veiculo.chassi || '';
    document.getElementById('renavan').value = veiculo.renavan || '';
    document.getElementById('anofab').value = veiculo.anofab || '';
    document.getElementById('anomod').value = veiculo.anomod || '';
    document.getElementById('qtdtanque').value = veiculo.qtdtanque || '';
  }

  // 📦 Carregar veículos do banco
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

    data.forEach(veiculo => {
      const row = document.createElement('div');
      row.classList.add('grid-row');

      row.innerHTML = `
        <div>${veiculo.filial}</div>
        <div>${veiculo.placa}</div>
        <div>${veiculo.marca || '-'}</div>
        <div>${veiculo.modelo || '-'}</div>
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

    veiculoEditandoId = id;
    preencherFormulario(data);
    modal.style.display = 'block';
  };

  // 🚀 Inicializa a listagem ao carregar a página
  carregarVeiculos();
});

// 🔍 Buscar veículos com filtros
window.buscarVeiculos = async function () {
  if (!gridBody) return;

  const placa = document.querySelector('input[placeholder="Placa"]').value.trim().toUpperCase();
  const frota = document.querySelector('input[placeholder="Frota"]').value.trim().toUpperCase();
  const marca = document.querySelector('input[placeholder="Marca"]').value.trim().toUpperCase();
  const modelo = document.querySelector('input[placeholder="Modelo"]').value.trim().toUpperCase();
  const grupo = document.querySelector('input[placeholder="Grupo"]').value.trim().toUpperCase();
  const filial = document.querySelector('input[placeholder="Filial"]').value.trim().toUpperCase();

  let query = supabase.from('veiculos').select('*');

  if (placa) query = query.ilike('placa', `%${placa}%`);
  if (frota) query = query.ilike('frota', `%${frota}%`);
  if (marca) query = query.ilike('marca', `%${marca}%`);
  if (modelo) query = query.ilike('modelo', `%${modelo}%`);
  if (grupo) query = query.ilike('grupo', `%${grupo}%`);
  if (filial) query = query.ilike('filial', `%${filial}%`);

  const { data, error } = await query;

  if (error) {
    console.error('Erro ao buscar veículos:', error);
    gridBody.innerHTML = '<div class="grid-row">Erro ao buscar dados.</div>';
    return;
  }

  gridBody.innerHTML = '';

  if (data.length === 0) {
    gridBody.innerHTML = '<div class="grid-row">Nenhum veículo encontrado.</div>';
    return;
  }

  data.forEach(veiculo => {
    const row = document.createElement('div');
    row.classList.add('grid-row');

    row.innerHTML = `
      <div>${veiculo.filial}</div>
      <div>${veiculo.placa}</div>
      <div>${veiculo.marca || '-'}</div>
      <div>${veiculo.modelo || '-'}</div>
      <div>
        <button onclick="editarVeiculo('${veiculo.id}')">
          <i class="fas fa-edit"></i> Editar
        </button>
      </div>
    `;

    gridBody.appendChild(row);
  });
};