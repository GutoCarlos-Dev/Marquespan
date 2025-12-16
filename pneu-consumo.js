import { supabase } from './supabase.js';

document.addEventListener('DOMContentLoaded', () => {
  // Elementos do DOM
  const tipoOperacaoSelect = document.getElementById('tipo_operacao');
  const camposPneuUnico = document.getElementById('campos-pneu-unico');
  const camposInstalacaoMultipla = document.getElementById('campos-instalacao-multipla');
  const camposTrocaRodizio = document.getElementById('campos-troca-rodizio');
  const btnAdicionarPneu = document.getElementById('btn-adicionar-pneu');
  const gridInstalacaoPneus = document.getElementById('grid-instalacao-pneus');
  const placaSelect = document.getElementById('placa');
  const dataInput = document.getElementById('data');

  let pneusEmEstoque = [];

  // --- FUNÇÕES DE INICIALIZAÇÃO ---

  /**
   * Define a data e hora atual no campo de data.
   */
  function setDataAtual() {
    const agora = new Date();
    agora.setMinutes(agora.getMinutes() - agora.getTimezoneOffset());
    dataInput.value = agora.toISOString().slice(0, 16);
  }

  /**
   * Carrega as placas dos veículos da tabela 'veiculos' e preenche o select.
   */
  async function carregarPlacas() {
    const { data, error } = await supabase.from('veiculos').select('placa').order('placa');
    if (error) {
      console.error('Erro ao carregar placas:', error);
      return;
    }
    placaSelect.innerHTML = '<option value="">Selecione</option>'; // Limpa e adiciona a opção padrão
    data.forEach(veiculo => {
      const option = document.createElement('option');
      option.value = veiculo.placa;
      option.textContent = veiculo.placa;
      placaSelect.appendChild(option);
    });
  }

  /**
   * Carrega os pneus disponíveis no estoque (status 'EM ESTOQUE').
   */
  async function carregarPneusEstoque() {
    const { data, error } = await supabase
      .from('pneus')
      .select('id, codigo_marca_fogo, marca, modelo')
      .eq('status', 'EM ESTOQUE')
      .order('codigo_marca_fogo');

    if (error) {
      console.error('Erro ao carregar pneus do estoque:', error);
      pneusEmEstoque = [];
      return;
    }
    pneusEmEstoque = data;
  }

  // --- FUNÇÕES DE MANIPULAÇÃO DA UI ---

  /**
   * Alterna a visibilidade dos campos do formulário com base na operação selecionada.
   */
  function handleTipoOperacaoChange() {
    const operacao = tipoOperacaoSelect.value;

    // Esconde todos os painéis
    camposPneuUnico.classList.add('hidden');
    camposInstalacaoMultipla.classList.add('hidden');
    camposTrocaRodizio.classList.add('hidden');

    if (operacao === 'INSTALACAO') {
      camposInstalacaoMultipla.classList.remove('hidden');
    } else if (operacao) { // Qualquer outra operação selecionada
      camposPneuUnico.classList.remove('hidden');
      // Mostra campos específicos se for troca ou rodízio
      if (operacao === 'TROCA' || operacao === 'RODIZIO') {
        camposTrocaRodizio.classList.remove('hidden');
      }
    }
  }

  /**
   * Adiciona uma nova linha ao grid de instalação de pneus.
   */
  function adicionarLinhaPneu() {
    const pneuId = `pneu-row-${Date.now()}`;
    const div = document.createElement('div');
    div.className = 'instalacao-grid-row';
    div.id = pneuId;

    // Cria o seletor de posição
    const selectPosicao = document.createElement('select');
    selectPosicao.name = 'posicao_aplicacao[]';
    selectPosicao.required = true;
    selectPosicao.innerHTML = `
      <option value="">Selecione a Posição</option>
      <option value="DIANTEIRO_ESQUERDO">Dianteiro Esquerdo</option>
      <option value="DIANTEIRO_DIREITO">Dianteiro Direito</option>
      <option value="TRACAO_ESQUERDO_INTERNO">Tração Esq. Interno</option>
      <option value="TRACAO_ESQUERDO_EXTERNO">Tração Esq. Externo</option>
      <option value="TRACAO_DIREITO_INTERNO">Tração Dir. Interno</option>
      <option value="TRACAO_DIREITO_EXTERNO">Tração Dir. Externo</option>
      <option value="TRUCK_ESQUERDO_INTERNO">Truck Esq. Interno</option>
      <option value="TRUCK_ESQUERDO_EXTERNO">Truck Esq. Externo</option>
      <option value="TRUCK_DIREITO_INTERNO">Truck Dir. Interno</option>
      <option value="TRUCK_DIREITO_EXTERNO">Truck Dir. Externo</option>
      <option value="ESTEPE">Estepe</option>
    `;

    // Cria o seletor de marca de fogo
    const selectMarcaFogo = document.createElement('select');
    selectMarcaFogo.name = 'marca_fogo_id[]';
    selectMarcaFogo.required = true;
    selectMarcaFogo.innerHTML = '<option value="">Selecione a Marca de Fogo</option>';
    pneusEmEstoque.forEach(pneu => {
      const option = document.createElement('option');
      option.value = pneu.id;
      option.textContent = `${pneu.codigo_marca_fogo} (${pneu.marca} - ${pneu.modelo})`;
      selectMarcaFogo.appendChild(option);
    });

    // Cria o botão de remover
    const btnRemover = document.createElement('button');
    btnRemover.type = 'button';
    btnRemover.className = 'btn-pneu btn-pneu-danger';
    btnRemover.innerHTML = '<i class="fas fa-trash"></i>';
    btnRemover.onclick = () => {
      document.getElementById(pneuId).remove();
    };

    // Adiciona os elementos à linha
    div.appendChild(selectPosicao);
    div.appendChild(selectMarcaFogo);
    div.appendChild(btnRemover);

    gridInstalacaoPneus.appendChild(div);
  }

  // --- EVENT LISTENERS ---

  tipoOperacaoSelect.addEventListener('change', handleTipoOperacaoChange);
  btnAdicionarPneu.addEventListener('click', adicionarLinhaPneu);

  document.getElementById('formConsumoPneu').addEventListener('submit', async (e) => {
    e.preventDefault();
    // A lógica de submissão do formulário virá aqui.
    // Será necessário diferenciar a coleta de dados para instalação única e múltipla.
    alert('Lógica de submissão ainda não implementada.');
    console.log('Formulário enviado. Implementar a lógica de salvamento no Supabase.');
  });

  // --- INICIALIZAÇÃO ---

  /**
   * Função principal para inicializar a página.
   */
  async function init() {
    setDataAtual();
    await carregarPlacas();
    await carregarPneusEstoque();
    handleTipoOperacaoChange(); // Garante que o estado inicial do form está correto
  }

  init();
});