// script/veiculos.js
import { supabase } from './supabase.js';

document.addEventListener('DOMContentLoaded', () => {
  const btnAdd = document.getElementById('btnAddVeiculo');
  const btnCancel = document.getElementById('btnCancelar');
  const btnClear = document.getElementById('btnLimpar');
  const formSection = document.getElementById('formNovoVeiculo');
  const form = document.getElementById('formVeiculo');

  // Oculta o formulário ao carregar
  formSection.classList.add('hidden');

  // Exibe o formulário ao clicar em "Adicionar"
  btnAdd?.addEventListener('click', () => {
    formSection.classList.remove('hidden');
    formSection.scrollIntoView({ behavior: 'smooth' });
  });

  // Oculta e limpa o formulário ao clicar em "Cancelar"
  btnCancel?.addEventListener('click', () => {
    formSection.classList.add('hidden');
    form?.reset();
  });

  // Limpa o formulário ao clicar em "Limpar"
  btnClear?.addEventListener('click', (e) => {
    e.preventDefault(); // Evita comportamento padrão se estiver dentro de <form>
    form?.reset();
  });

  // Envia os dados do formulário
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

  // Converte texto para maiúsculas automaticamente
  const camposTexto = form?.querySelectorAll('input[type="text"], textarea');
  camposTexto?.forEach(campo => {
    campo.addEventListener('input', () => {
      campo.value = campo.value.toUpperCase();
    });
  });
});
