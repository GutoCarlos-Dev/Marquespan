// script/veiculos.js
import { supabase } from './supabase.js';

document.addEventListener('DOMContentLoaded', () => {
  const btnAdd = document.getElementById('btnAddVeiculo');
  const btnCancel = document.getElementById('btnCancelar');
  const btnClear = document.getElementById('btnClear'); // Certifique-se que o botão tem esse ID
  const modal = document.getElementById('modalVeiculo');
  const form = document.getElementById('formVeiculo');

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

// 🧽 Função de limpeza
function limparFormulario(form) {
  form.querySelectorAll('input').forEach(input => input.value = '');
  form.querySelectorAll('select').forEach(select => select.selectedIndex = 0);
  form.querySelectorAll('textarea').forEach(textarea => textarea.value = '');
}

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
      anomod: getValorUpper('anomod')
    };

    const { data, error } = await supabase.from('veiculos').insert([veiculo]);

    if (error) {
      alert('❌ Erro ao salvar veículo.');
    } else {
      alert('✅ Veículo salvo com sucesso!');
      limparFormulario(form);
      modal.style.display = 'none';
    }
  });

  // 🔠 Força maiúsculas em tempo real
  const camposTexto = form?.querySelectorAll('input[type="text"], textarea');
  camposTexto?.forEach(campo => {
    campo.addEventListener('input', () => {
      campo.value = campo.value.toUpperCase();
    });
  });

  // 🔁 Função para obter valor em maiúsculas
  function getValorUpper(id) {
    const el = document.getElementById(id);
    return el?.value.trim().toUpperCase() || '';
  }
});
