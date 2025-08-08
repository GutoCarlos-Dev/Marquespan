// script/veiculos.js
import { supabase } from './supabase.js';

document.addEventListener('DOMContentLoaded', () => {
  const btnAdd = document.getElementById('btnAddVeiculo');
  const btnCancel = document.getElementById('btnCancelar');
  const btnClear = document.getElementById('btnLimpar');
  const formSection = document.getElementById('formNovoVeiculo');
  const form = document.getElementById('formVeiculo');

  formSection.classList.add('hidden');

  btnAdd?.addEventListener('click', () => {
    formSection.classList.remove('hidden');
    formSection.scrollIntoView({ behavior: 'smooth' });
  });

  btnCancel?.addEventListener('click', () => {
    formSection.classList.add('hidden');
    form.reset();
  });

  btnClear?.addEventListener('click', () => {
    form.reset();
  });

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const veiculo = {
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
      form.reset();
      formSection.classList.add('hidden');
    }
  });

  const camposTexto = form?.querySelectorAll('input[type="text"], textarea');
  camposTexto?.forEach(campo => {
    campo.addEventListener('input', () => {
      campo.value = campo.value.toUpperCase();
    });
  });
});
