// script/veiculos.js
import { supabase } from './supabase.js';

document.addEventListener('DOMContentLoaded', () => {
  const btnAdd = document.getElementById('btnAddVeiculo');
  const btnCancel = document.getElementById('btnCancelar');
  const btnClear = document.getElementById('btnClear');
  const modal = document.getElementById('modalVeiculo');
  const form = document.getElementById('formVeiculo');

  // Exibe o modal ao clicar em "Adicionar"
  btnAdd?.addEventListener('click', () => {
    modal.style.display = 'block';
  });

  // Oculta e limpa o formulário ao clicar em "Cancelar"
  btnCancel?.addEventListener('click', () => {
    modal.style.display = 'none';
    limparFormulario(form);
  });

  // Limpa o formulário ao clicar em "Limpar"
  btnClear?.addEventListener('click', (e) => {
    e.preventDefault();
    limparFormulario(form);
    form.scrollIntoView({ behavior: 'smooth' });
  });

  // Envia os dados do formulário
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const veiculo = {
      filial: document.getElementById('filial').value.trim(),
      placa: document.getElementById('placa').value.trim(),
      marca: document.getElementById('marca').value.trim(),
      modelo: document.getElementById('modelo').value.trim(),
      tipo: document.getElementById('tipo').value.trim(),
      situacao: document.getElementById('situacao').value.trim(),
      chassi: document.getElementById('chassi').value.trim(),
      renavan: document.getElementById('renavan').value.trim(),
      anofab: document.getElementById('anofab').value.trim(),
      anomod: document.getElementById('anomod').value.trim()
    };

    const { data, error } = await supabase.from('veiculos').insert([veiculo]);

    if (error) {
      alert('Erro ao salvar veículo.');
    } else {
      alert('✅ Veículo salvo com sucesso!');
      limparFormulario(form);
      modal.style.display = 'none';
    }
  });

  // Converte texto para maiúsculas automaticamente
  const camposTexto = form?.querySelectorAll('input[type="text"], textarea');
  camposTexto?.forEach(campo => {
    campo.addEventListener('input', () => {
      campo.value = campo.value.toUpperCase();
    });
  });

  // Função de limpeza reutilizável
  function limparFormulario(form) {
    form.querySelectorAll('input').forEach(input => input.value = '');
    form.querySelectorAll('select').forEach(select => select.selectedIndex = 0);
    form.querySelectorAll('textarea').forEach(textarea => textarea.value = '');
  }
});
