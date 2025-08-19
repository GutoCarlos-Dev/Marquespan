import { supabase } from '..script/supabase.js';

document.addEventListener('DOMContentLoaded', () => {
  const btnAdd = document.getElementById('btnAddVeiculo');
  const btnCancel = document.getElementById('btnCancelar');
  const btnClear = document.getElementById('btnClear');
  const modal = document.getElementById('modalVeiculo');
  const form = document.getElementById('formVeiculo');
  const gridBody = document.getElementById('grid-veiculos-body');

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

    const { data, error } = await supabase.from('veiculos').insert([veiculo]);

    if (error) {
      alert('❌ Erro ao salvar veículo.');
    } else {
      alert('✅ Veículo salvo com sucesso!');
      limparFormulario(form);
      modal.style.display = 'none';
      carregarVeiculos(); // 🔁 Atualiza a lista após cadastro
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
    form.querySelectorAll('input').forEach(input => input.value = '');
    form.querySelectorAll('select').forEach(select => select.selectedIndex = 0);
    form.querySelectorAll('textarea').forEach(textarea => textarea.value = '');
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
        <div>${veiculo.renavan || '-'}</div>
        <div>${veiculo.chassi || '-'}</div>
        <div>${veiculo.anofab || '-'}</div>
        <div>${veiculo.anomod || '-'}</div>
        <div>${veiculo.qtdtanque || '-'}</div>
        <div>${veiculo.tipo || '-'}</div>
        <div>${veiculo.situacao}</div>
      `;

      gridBody.appendChild(row);
    });
  }

  // 🚀 Inicializa a listagem ao carregar a página
  carregarVeiculos();
});
