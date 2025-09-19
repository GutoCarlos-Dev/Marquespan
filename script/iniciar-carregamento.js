import { supabase } from './supabase.js';

export async function carregarPlacasVeiculos() {
  const inputPlaca = document.getElementById('placa');
  const dataListId = 'placasVeiculosList';

  // Criar datalist se não existir
  let dataList = document.getElementById(dataListId);
  if (!dataList) {
    dataList = document.createElement('datalist');
    dataList.id = dataListId;
    document.body.appendChild(dataList);
  }

  // Associar datalist ao input
  inputPlaca.setAttribute('list', dataListId);

  // Buscar placas no banco
  const { data, error } = await supabase
    .from('veiculos')
    .select('placa')
    .order('placa', { ascending: true });

  if (error) {
    console.error('Erro ao carregar placas:', error);
    return;
  }

  // Limpar datalist
  dataList.innerHTML = '';

  // Popular datalist com opções
  data.forEach(veiculo => {
    const option = document.createElement('option');
    option.value = veiculo.placa;
    dataList.appendChild(option);
  });
}

// Inicializar ao carregar a página
document.addEventListener('DOMContentLoaded', () => {
  carregarPlacasVeiculos();
});
