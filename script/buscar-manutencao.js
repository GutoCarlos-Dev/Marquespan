import { supabaseClient } from './supabase.js';
import XLSX from "https://cdn.sheetjs.com/xlsx-0.20.2/package/xlsx.mjs";

let dadosExportacao = [];
let todosRegistros = []; // Armazena todos os registros buscados
let currentSort = { column: 'data', direction: 'desc' };
let arquivosParaUpload = [];
let arquivosExistentes = [];
let arquivosParaDeletar = [];
let idManutencaoAnexo = null;
let arquivosAnexoSelecionados = [];
let arrastandoColunaResultado = false;
const BUSCA_MANUTENCAO_STATE_KEY = 'buscar_manutencao_estado_edicao';
const RESULTADOS_COLUNAS_KEY = 'buscar_manutencao_colunas_resultados';
const COLUNAS_RESULTADOS_PADRAO = [
  { key: 'data', label: 'Data', sort: 'data', value: (m) => formatarData(m.data) },
  { key: 'usuario', label: 'Usuário', sort: 'usuario', value: (m) => escapeHTML(m.usuario) },
  { key: 'numeroOS', label: 'OS', sort: 'numeroOS', value: (m) => escapeHTML(m.numeroOS) },
  { key: 'notaFiscal', label: 'NFE', sort: 'notaFiscal', value: (m) => escapeHTML(m.notaFiscal) },
  { key: 'notaServico', label: 'NFSE', sort: 'notaServico', value: (m) => escapeHTML(m.notaServico) },
  { key: 'veiculo', label: 'Placa', sort: 'veiculo', value: (m) => escapeHTML(m.veiculo) },
  { key: 'titulo', label: 'Título', sort: 'titulo', value: (m) => escapeHTML(m.titulo) },
  { key: 'descricao', label: 'Descrição', sort: 'descricao', value: (m) => escapeHTML(m.descricao) },
  { key: 'fornecedor', label: 'Fornecedor', sort: 'fornecedor', value: (m) => escapeHTML(m.fornecedor) },
  { key: 'valor', label: 'Valor', sort: 'valor', value: (m) => `R$ ${formatarValor(m.valor || 0)}`, className: 'col-valor' }
];
let ordemColunasResultados = carregarOrdemColunasResultados();

// Função utilitária para escapar HTML e prevenir XSS
function escapeHTML(str) {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(str || '')); // Garante que str não seja null/undefined
    return div.innerHTML;
}

function limparNomeArquivoStorage(nome) {
    return String(nome || 'arquivo')
        .replace(/[\\/:*?"<>|#%{}^~[\]`]/g, '_')
        .trim() || 'arquivo';
}

function gerarTokenArquivo() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    return `${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function criarCaminhoArquivo(idManutencao, nomeArquivo, indice = 0) {
    return `${idManutencao}/${Date.now()}_${indice}_${gerarTokenArquivo()}_${limparNomeArquivoStorage(nomeArquivo)}`;
}

function criarNomeArquivoUnico(nomeArquivo, nomesUsados) {
    const nomeBase = String(nomeArquivo || 'arquivo');
    if (!nomesUsados.has(nomeBase)) {
        nomesUsados.add(nomeBase);
        return nomeBase;
    }

    const ponto = nomeBase.lastIndexOf('.');
    const base = ponto > 0 ? nomeBase.slice(0, ponto) : nomeBase;
    const extensao = ponto > 0 ? nomeBase.slice(ponto) : '';
    let contador = 2;
    let candidato = `${base} (${contador})${extensao}`;

    while (nomesUsados.has(candidato)) {
        contador += 1;
        candidato = `${base} (${contador})${extensao}`;
    }

    nomesUsados.add(candidato);
    return candidato;
}

function mapearArquivoBanco(arquivo) {
    return {
        nome: arquivo.nome_arquivo,
        path: arquivo.caminho_arquivo,
        isZipped: arquivo.is_zipped,
        originalNames: arquivo.original_names
    };
}

function carregarOrdemColunasResultados() {
  const padrao = COLUNAS_RESULTADOS_PADRAO.map(col => col.key);

  try {
    const salva = JSON.parse(localStorage.getItem(RESULTADOS_COLUNAS_KEY) || '[]');
    const validas = salva.filter(key => padrao.includes(key));
    const novas = padrao.filter(key => !validas.includes(key));
    return validas.length ? [...validas, ...novas] : padrao;
  } catch {
    return padrao;
  }
}

function getColunasResultadosOrdenadas() {
  return ordemColunasResultados
    .map(key => COLUNAS_RESULTADOS_PADRAO.find(col => col.key === key))
    .filter(Boolean);
}

function salvarOrdemColunasResultados() {
  localStorage.setItem(RESULTADOS_COLUNAS_KEY, JSON.stringify(ordemColunasResultados));
}

function renderCabecalhoResultados() {
  const cabecalho = document.getElementById('cabecalhoResultados');
  if (!cabecalho) return;

  const colunasHtml = getColunasResultadosOrdenadas().map(col => `
    <th class="sortable draggable-column ${col.className || ''}"
        data-column-key="${col.key}"
        data-sort="${col.sort}"
        draggable="true">
      <span class="column-drag-handle" title="Arraste para mover a coluna"><i class="fas fa-grip-vertical"></i></span>
      <span>${col.label}</span>
      <i class="fas fa-sort sort-icon"></i>
    </th>
  `).join('');

  cabecalho.innerHTML = `${colunasHtml}<th class="col-acoes-fixed">Ações</th>`;
  bindResultadoHeaderEvents();
  updateSortIcons();
  if (typeof setupColumnResizing === 'function') setupColumnResizing();
}

function bindResultadoHeaderEvents() {
  document.querySelectorAll('#cabecalhoResultados th.sortable').forEach(th => {
    th.addEventListener('click', (event) => {
      if (arrastandoColunaResultado) return;
      if (event.target.closest('.resizer')) return;
      handleSort(th.dataset.sort);
    });

    th.addEventListener('dragstart', handleColumnDragStart);
    th.addEventListener('dragover', handleColumnDragOver);
    th.addEventListener('drop', handleColumnDrop);
    th.addEventListener('dragleave', () => th.classList.remove('drag-over-column'));
    th.addEventListener('dragend', handleColumnDragEnd);
  });
}

function handleColumnDragStart(event) {
  const th = event.currentTarget;
  arrastandoColunaResultado = true;
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', th.dataset.columnKey);
  th.classList.add('dragging-column');
}

function handleColumnDragOver(event) {
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
  event.currentTarget.classList.add('drag-over-column');
}

function handleColumnDrop(event) {
  event.preventDefault();
  const origem = event.dataTransfer.getData('text/plain');
  const destino = event.currentTarget.dataset.columnKey;
  if (!origem || !destino || origem === destino) return;

  const proximaOrdem = ordemColunasResultados.filter(key => key !== origem);
  const destinoIndex = proximaOrdem.indexOf(destino);
  proximaOrdem.splice(destinoIndex, 0, origem);
  ordemColunasResultados = proximaOrdem;
  salvarOrdemColunasResultados();
  renderCabecalhoResultados();
  filtrarERenderizarTabela();
}

function handleColumnDragEnd() {
  document.querySelectorAll('#cabecalhoResultados th').forEach(th => {
    th.classList.remove('dragging-column', 'drag-over-column');
  });
  setTimeout(() => {
    arrastandoColunaResultado = false;
  }, 0);
}

// Paginação removida para exibir todos os resultados
function preencherUsuarioLogado() {
  const usuario = JSON.parse(localStorage.getItem('usuarioLogado'));
  const divUsuario = document.getElementById('usuario-logado');
  if (usuario?.nome && divUsuario) {
    divUsuario.textContent = `👤 Olá, ${usuario.nome}`;
  }
}

function getUserFilial() {
  const usuario = JSON.parse(localStorage.getItem('usuarioLogado'));
  return usuario?.filial || null;
}

function getUserLevel() {
  const usuario = JSON.parse(localStorage.getItem('usuarioLogado'));
  return usuario ? (usuario.nivel || '').toLowerCase() : null;
}

function canDelete() {
  const nivel = getUserLevel();
  return ['administrador', 'gerencia', 'adm_logistica'].includes(nivel);
}

function toggleMenuLateralManutencao() {
  document.body.classList.toggle('manutencao-menu-oculto');
  const oculto = document.body.classList.contains('manutencao-menu-oculto');
  const btn = document.getElementById('btnToggleMenuLateral');
  if (btn) {
    btn.title = oculto ? 'Mostrar menu lateral' : 'Ocultar menu lateral';
    btn.setAttribute('aria-label', btn.title);
  }
}

async function carregarFiltros() {
  const [titulos, filiais, fornecedores] = await Promise.all([
    supabaseClient.from('titulo_manutencao').select('titulo').order('titulo'),
    supabaseClient.from('filiais').select('nome, sigla').order('nome'),
    supabaseClient.from('fornecedor_manutencao').select('nome, cnpj').order('nome')
  ]);

  preencherDatalist('listaTitulos', titulos.data, 'titulo');
  
  const selectFilial = document.getElementById('filial');
  selectFilial.innerHTML = '<option value="">Todas</option>';
  if (filiais.data) {
      filiais.data.forEach(f => {
          const opt = new Option(f.sigla ? `${f.nome} (${f.sigla})` : f.nome, f.sigla || f.nome);
          selectFilial.appendChild(opt);
      });
  }

  const userFilial = getUserFilial();
  if (userFilial && selectFilial) {
      selectFilial.value = userFilial;
      selectFilial.disabled = true;
  }

  // Preenche datalist de fornecedores seguindo o padrão da aba de inclusão (Nome + CNPJ)
  const listaFornecedores = document.getElementById('listaFornecedores');
  if (listaFornecedores) {
    listaFornecedores.innerHTML = '';
    fornecedores.data?.forEach(f => {
      if (f.nome) {
        const displayValue = f.cnpj ? `${f.nome} (CNPJ: ${f.cnpj})` : f.nome;
        listaFornecedores.appendChild(new Option(displayValue));
      }
    });
  }
}

function preencherDatalist(id, data, campo) {
  const lista = document.getElementById(id);
  lista.innerHTML = '';
  data?.forEach(item => {
    if (item[campo]) {
      lista.appendChild(new Option(item[campo]));
    }
  });
}

function preencherSelect(id, data, campo) {
  const select = document.getElementById(id);
  select.innerHTML = '<option value="">Todos</option>';
  data?.forEach(item => {
    select.appendChild(new Option(item[campo], item[campo]));
  });
}

function getFiltrosBuscaAtual() {
  return {
    dataInicial: document.getElementById('dataInicial')?.value || '',
    dataFinal: document.getElementById('dataFinal')?.value || '',
    filial: document.getElementById('filial')?.value || '',
    tipoManutencao: document.getElementById('tipoManutencao')?.value || '',
    veiculo: document.getElementById('veiculo')?.value || '',
    titulo: document.getElementById('titulo')?.value || '',
    fornecedor: document.getElementById('fornecedor')?.value || '',
    nfse: document.getElementById('nfse')?.value || '',
    nfe: document.getElementById('nfe')?.value || '',
    os: document.getElementById('os')?.value || '',
    status: document.getElementById('status')?.value || '',
    searchResultadosLocal: document.getElementById('searchResultadosLocal')?.value || '',
    sort: { ...currentSort }
  };
}

function salvarEstadoBuscaParaEdicao(idManutencao) {
  const estado = {
    origem: 'editar-manutencao',
    idManutencao,
    filtros: getFiltrosBuscaAtual(),
    criadoEm: Date.now()
  };
  sessionStorage.setItem(BUSCA_MANUTENCAO_STATE_KEY, JSON.stringify(estado));
}

function aplicarValorCampo(id, valor) {
  const campo = document.getElementById(id);
  if (!campo) return;
  campo.value = valor || '';
}

async function restaurarBuscaAposEdicao() {
  const estadoRaw = sessionStorage.getItem(BUSCA_MANUTENCAO_STATE_KEY);
  if (!estadoRaw) return false;

  try {
    const estado = JSON.parse(estadoRaw);
    const expirado = !estado?.criadoEm || Date.now() - estado.criadoEm > 6 * 60 * 60 * 1000;
    if (estado?.origem !== 'editar-manutencao' || expirado) {
      sessionStorage.removeItem(BUSCA_MANUTENCAO_STATE_KEY);
      return false;
    }

    const filtros = estado.filtros || {};
    aplicarValorCampo('dataInicial', filtros.dataInicial);
    aplicarValorCampo('dataFinal', filtros.dataFinal);
    aplicarValorCampo('filial', filtros.filial);
    aplicarValorCampo('tipoManutencao', filtros.tipoManutencao);
    aplicarValorCampo('veiculo', filtros.veiculo);
    aplicarValorCampo('titulo', filtros.titulo);
    aplicarValorCampo('fornecedor', filtros.fornecedor);
    aplicarValorCampo('nfse', filtros.nfse);
    aplicarValorCampo('nfe', filtros.nfe);
    aplicarValorCampo('os', filtros.os);
    aplicarValorCampo('status', filtros.status);
    aplicarValorCampo('searchResultadosLocal', filtros.searchResultadosLocal);

    if (filtros.sort?.column && filtros.sort?.direction) {
      currentSort = { column: filtros.sort.column, direction: filtros.sort.direction };
    }

    sessionStorage.removeItem(BUSCA_MANUTENCAO_STATE_KEY);
    await buscarManutencao();
    return true;
  } catch (error) {
    console.error('Erro ao restaurar filtros de manutenção:', error);
    sessionStorage.removeItem(BUSCA_MANUTENCAO_STATE_KEY);
    return false;
  }
}

async function buscarManutencao() {
  const filtros = {
    dataInicial: document.getElementById('dataInicial').value,
    dataFinal: document.getElementById('dataFinal').value,
    titulo: document.getElementById('titulo').value,
    nfse: document.getElementById('nfse').value,
    nfe: document.getElementById('nfe').value,
    os: document.getElementById('os').value,
    veiculo: document.getElementById('veiculo').value,
    filial: document.getElementById('filial').value,
    tipo: document.getElementById('tipoManutencao').value,
    fornecedor: document.getElementById('fornecedor').value,
    status: document.getElementById('status').value
  };

  // 1. Primeiro, obter a contagem total para avisar o usuário
  let countQuery = supabaseClient.from('manutencao').select('*', { count: 'exact', head: true });
  countQuery = aplicarFiltrosQuery(countQuery, filtros);

  const { count, error: countError } = await countQuery;
  
  if (countError) {
      console.error('Erro ao contar registros:', countError);
      
      let msg = 'Erro ao verificar quantidade de registros.';
      if (countError.message) {
          msg += `\nDetalhes: ${countError.message}`;
          // Tratamento específico para erro de conexão/DNS (ERR_NAME_NOT_RESOLVED geralmente resulta em Failed to fetch)
          if (countError.message.includes('Failed to fetch')) {
              msg = 'Erro de Conexão: Não foi possível conectar ao servidor. Verifique sua internet ou DNS.';
          }
      } else {
          msg += '\nVerifique sua conexão com a internet.';
      }
      
      alert(msg);
      return;
  }

  // 2. Buscar os dados em lotes para não ter limite
  let manutencoes = [];
  const step = 1000; // Limite do Supabase por requisição
  for (let i = 0; i < count; i += step) {
      let query = supabaseClient.from('manutencao').select('*');
      query = aplicarFiltrosQuery(query, filtros);
      query = query.order('data', { ascending: false });
      query = query.range(i, i + step - 1);

      const { data: batch, error } = await query;

      if (error) {
          console.error('❌ Erro ao buscar manutenções em lote:', error);
          alert('Erro ao buscar manutenções. Verifique os filtros ou tente novamente.');
          return; // Interrompe a busca em caso de erro
      }
      if (batch) {
          manutencoes.push(...batch);
      }
  }

  // Verificar se há dados
  if (!manutencoes || manutencoes.length === 0) {
    alert('Nenhuma manutenção encontrada com os filtros aplicados.');
    document.getElementById('tabelaResultados').innerHTML = '';
    document.getElementById('totalRegistros').textContent = '0';
    document.getElementById('valorTotal').textContent = '0,00';
    document.getElementById('paginationContainer').classList.add('hidden');
    return;
  }

  // Buscar os valores dos itens para todas as manutenções encontradas
  const manutencaoIds = manutencoes.map(m => m.id);
  
  // Busca itens em lotes para evitar erro de URL muito longa
  const itens = await fetchItensEmLotes(manutencaoIds);

  // Calcular o valor total para cada manutenção
  const valorPorManutencao = {};
  if (itens) {
    itens.forEach(item => {
      const totalItem = (item.quantidade || 0) * (item.valor || 0);
      valorPorManutencao[item.id_manutencao] = (valorPorManutencao[item.id_manutencao] || 0) + totalItem;
    });
  }

  // Adicionar o valor calculado a cada objeto de manutenção
  const manutencoesComValor = manutencoes.map(m => {
    const totalItens = valorPorManutencao[m.id] || 0;
    // Se não tiver valor nos itens, tenta usar o valor salvo no cabeçalho (NFE + NFSE)
    const totalCabecalho = (m.valorNfe || 0) + (m.valorNfse || 0);
    const valorFinal = totalCabecalho > 0 ? totalCabecalho : totalItens;
    return { ...m, valor: valorFinal };
  });

  dadosExportacao = manutencoesComValor;
  todosRegistros = manutencoesComValor;

  // Preencher a tabela com os dados enriquecidos
  filtrarERenderizarTabela();
}

function filtrarERenderizarTabela() {
    const searchTerm = document.getElementById('searchResultadosLocal')?.value.toLowerCase() || '';
    
    // 1. Filtragem Local (Placa, Fornecedor, Descrição e OS)
    let filtrados = todosRegistros.filter(m => 
        (m.usuario || '').toLowerCase().includes(searchTerm) ||
        (m.veiculo || '').toLowerCase().includes(searchTerm) ||
        (m.titulo || '').toLowerCase().includes(searchTerm) ||
        (m.fornecedor || '').toLowerCase().includes(searchTerm) || 
        (m.descricao || '').toLowerCase().includes(searchTerm) ||
        (m.numeroOS || '').toLowerCase().includes(searchTerm) ||
        (m.notaFiscal || '').toLowerCase().includes(searchTerm) ||
        (m.notaServico || '').toLowerCase().includes(searchTerm)
    );

    // 2. Ordenação
    const { column, direction } = currentSort;
    const factor = direction === 'asc' ? 1 : -1;

    filtrados.sort((a, b) => {
        let valA = a[column];
        let valB = b[column];

        if (column === 'data') {
            const fixDate = (v) => (typeof v === 'string' && v.length === 10 && !v.includes('T')) ? `${v}T00:00:00` : (v || 0);
            valA = new Date(fixDate(valA));
            valB = new Date(fixDate(valB));
        } else if (typeof valA === 'string') {
            valA = valA.toLowerCase();
            valB = (valB || '').toLowerCase();
        }

        if (valA < valB) return -1 * factor;
        if (valA > valB) return 1 * factor;
        return 0;
    });

    // 3. Atualiza Totais da busca filtrada
    const valorTotalFiltrado = filtrados.reduce((acc, curr) => acc + (curr.valor || 0), 0);
    document.getElementById('totalRegistros').textContent = filtrados.length;
    document.getElementById('valorTotal').textContent = formatarValor(valorTotalFiltrado);

    preencherTabela(filtrados);
    updateSortIcons();
}

function aplicarFiltrosQuery(query, filtros) {
  const userFilial = getUserFilial();

  if (filtros.dataInicial) query = query.gte('data', `${filtros.dataInicial}T00:00:00-03:00`);
  if (filtros.dataFinal) query = query.lte('data', `${filtros.dataFinal}T23:59:59-03:00`);
  if (filtros.titulo) query = query.ilike('titulo', `%${filtros.titulo}%`);
  if (filtros.nfse) query = query.ilike('notaServico', `%${filtros.nfse}%`);
  if (filtros.nfe) query = query.ilike('notaFiscal', `%${filtros.nfe}%`);
  if (filtros.os) query = query.ilike('numeroOS', `%${filtros.os}%`);
  if (filtros.veiculo) query = query.ilike('veiculo', `%${filtros.veiculo}%`);
  
  if (userFilial) {
    query = query.eq('filial', userFilial);
  } else if (filtros.filial) {
    query = query.eq('filial', filtros.filial);
  }

  if (filtros.tipo) query = query.eq('tipo', filtros.tipo);
  if (filtros.fornecedor) query = query.ilike('fornecedor', `%${filtros.fornecedor}%`);
  if (filtros.status) query = query.eq('status', filtros.status);
  return query;
}

async function fetchItensEmLotes(ids) {
    const chunkSize = 200;
    let allItems = [];
    for (let i = 0; i < ids.length; i += chunkSize) {
        const chunk = ids.slice(i, i + chunkSize);
        const { data, error } = await supabaseClient
            .from('manutencao_itens')
            .select('id_manutencao, quantidade, valor')
            .in('id_manutencao', chunk);
        
        if (!error && data) {
            allItems = allItems.concat(data);
        }
    }
    return allItems;
}

// 📋 Preencher tabela de resultados
function preencherTabela(registros) {
  const tabela = document.getElementById('tabelaResultados');
  tabela.innerHTML = '';

  const userCanDelete = canDelete();
  const colunas = getColunasResultadosOrdenadas();

  registros.forEach(m => {
    const btnExcluirHtml = userCanDelete 
      ? `<button class="btn-icon delete btn-excluir" data-id="${m.id}" title="Excluir"><i class="fas fa-trash-alt"></i></button>`
      : '';

    const celulasHtml = colunas.map(col => {
      const classe = col.className ? ` class="${col.className}"` : '';
      return `<td${classe}>${col.value(m)}</td>`;
    }).join('');

    const linha = document.createElement('tr');
    linha.innerHTML = `
      ${celulasHtml}
      <td class="col-acoes-fixed">
        <button class="btn-icon view btn-visualizar" data-id="${m.id}" title="Visualizar"><i class="fas fa-eye"></i></button>
        <button class="btn-icon view btn-anexar" data-id="${m.id}" title="Anexar Arquivo"><i class="fas fa-paperclip"></i></button>
        <button class="btn-icon edit btn-editar" data-id="${m.id}" title="Abrir/Editar"><i class="fas fa-edit"></i></button>
        ${btnExcluirHtml}
      </td>
    `;
    tabela.appendChild(linha);
  });
}

function formatarData(data) {
  if (!data) return '';
  
  // Se a data vier no formato YYYY-MM-DD, o construtor Date assume UTC,
  // o que exibe o dia anterior em fusos horários negativos (como o do Brasil).
  const dateString = (typeof data === 'string' && data.length === 10 && !data.includes('T'))
    ? `${data}T00:00:00`
    : data;

  const d = new Date(dateString);
  return d.toLocaleDateString('pt-BR');
}

function formatarValor(valor) {
  const v = parseFloat(valor);
  if (isNaN(v)) return '0,00';
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function handleSort(column) {
    if (currentSort.column === column) {
        currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
    } else {
        currentSort.column = column;
        currentSort.direction = 'asc';
    }
    filtrarERenderizarTabela();
}

function updateSortIcons() {
    document.querySelectorAll('th.sortable .sort-icon').forEach(icon => {
        icon.className = 'fas fa-sort';
        const th = icon.closest('th');
        if (th.dataset.sort === currentSort.column) {
            icon.className = currentSort.direction === 'asc' ? 'fas fa-sort-up' : 'fas fa-sort-down';
        }
    });
}

// 🔗 Abrir manutenção
function abrirManutencao(id) {
  salvarEstadoBuscaParaEdicao(id);
  window.location.href = `incluir-manutencao.html?id=${id}`;
}

// 👁️ Visualizar manutenção (Modal)
async function visualizarManutencao(id) {
  try {
    // 1. Buscar dados da manutenção
    const { data: m, error } = await supabaseClient
      .from('manutencao')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;

    // 2. Buscar arquivos anexados
    const { data: arquivos } = await supabaseClient
      .from('manutencao_arquivos')
      .select('*')
      .eq('id_manutencao', id);

    let arquivosHtml = '';
    if (arquivos && arquivos.length > 0) {
        for (const arq of arquivos) {
            // Gera link assinado válido por 1 hora
            const { data: signed } = await supabaseClient.storage
                .from('manutencao_arquivos')
                .createSignedUrl(arq.caminho_arquivo, 3600);
            
            if (signed?.signedUrl) {
                arquivosHtml += `<li style="margin-bottom:5px;"><a href="${signed.signedUrl}" target="_blank" style="text-decoration:none; color:#007bff; display:flex; align-items:center; gap:5px;">📄 ${arq.nome_arquivo} <small>(Clique para baixar)</small></a></li>`;
            }
        } // Note: arq.nome_arquivo is escaped below in htmlContent
    } else {
        arquivosHtml = '<li style="color:#999; font-style:italic;">Nenhum arquivo anexado.</li>';
    }
    
    // Calcular valor total (NF + NFS)
    const total = (parseFloat(m.valorNfe) || 0) + (parseFloat(m.valorNfse) || 0);
    const valorFormatado = `R$ ${formatarValor(total)}`;
    const dataFormatada = formatarData(m.data);

    // Buscar Logo
    const getLogoBase64 = async () => {
        try {
            const response = await fetch('logo.png');
            if (!response.ok) return null;
            const blob = await response.blob();
            return new Promise((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.readAsDataURL(blob);
            });
        } catch (e) {
            console.warn('Logo não encontrado');
            return null;
        }
    };
    const logoBase64 = await getLogoBase64();

    // 3. Montar HTML da Nova Janela
    const htmlContent = `
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
            <meta charset="UTF-8">
            <title>Detalhes Manutenção #${m.id}</title>
            <style>
                body { font-family: 'Segoe UI', Tahoma, sans-serif; background: #f4f6f9; padding: 20px; color: #333; margin: 0; }
                .container { max-width: 850px; margin: 0 auto; background: #fff; padding: 40px; border-radius: 8px; box-shadow: 0 4px 10px rgba(0,0,0,0.1); border-top: 5px solid #006937; }
                .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #eee; padding-bottom: 20px; margin-bottom: 30px; }
                .header-content { display: flex; align-items: center; gap: 20px; }
                .logo { height: 60px; width: auto; object-fit: contain; }
                h2 { color: #006937; margin: 0; font-size: 1.8rem; }
                .subtitle { color: #666; font-size: 0.9em; margin-top: 5px; }
                .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px; }
                .field strong { display: block; font-size: 0.8em; color: #666; text-transform: uppercase; margin-bottom: 5px; letter-spacing: 0.5px; }
                .field span { font-size: 1.1em; font-weight: 500; display: block; color: #333; }
                .box { background: #f8f9fa; padding: 20px; border-radius: 6px; border: 1px solid #e9ecef; margin-bottom: 20px; }
                .money { color: #28a745; font-weight: bold; font-size: 1.2em; }
                ul { list-style: none; padding: 0; margin: 0; }
                .btn-print { background: #006937; color: white; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer; font-size: 14px; font-weight: 600; display: inline-flex; align-items: center; gap: 8px; transition: background 0.2s; }
                .btn-print:hover { background: #00562b; }
                @media print { body { background: #fff; padding: 0; } .container { box-shadow: none; max-width: 100%; border: none; padding: 0; margin: 0; } .no-print { display: none; } }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <div class="header-content" style="flex-grow: 1;">
                        ${logoBase64 ? `<img src="${logoBase64}" class="logo" alt="Logo Marquespan">` : ''}
                        <div>
                            <h2>Relatório de Manutenção #${m.id}</h2>
                            <div class="subtitle">Gerado em ${new Date().toLocaleString('pt-BR')}</div>
                        </div>
                    </div>
                    <button onclick="window.print()" class="btn-print no-print">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                            <path d="M2.5 8a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1z"/>
                            <path d="M5 1a2 2 0 0 0-2 2v2H2a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h1v1a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-1h1a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-1V3a2 2 0 0 0-2-2H5zM4 3a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2H4V3zm1 5a2 2 0 0 0-2 2v1H2a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v-1a2 2 0 0 0-2-2H5zm7 2v3a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1z"/>
                        </svg>
                        Imprimir
                    </button>
                </div>

                <div class="grid">
                    <div class="field"><strong>Data</strong><span>${escapeHTML(dataFormatada)}</span></div>
                    <div class="field"><strong>Status</strong><span>${escapeHTML(m.status || '-')}</span></div>
                    <div class="field"><strong>Filial</strong><span>${escapeHTML(m.filial || '-')}</span></div>
                    <div class="field"><strong>Usuário</strong><span>${escapeHTML(m.usuario || '-')}</span></div>
                    <div class="field"><strong>Veículo</strong><span>${escapeHTML(m.veiculo || '-')}</span></div>
                    <div class="field"><strong>KM</strong><span>${escapeHTML(m.km || '-')}</span></div>
                    <div class="field"><strong>Motorista</strong><span>${escapeHTML(m.motorista || '-')}</span></div>
                    <div class="field"><strong>Valor Total</strong><span class="money">${valorFormatado}</span></div>
                </div>

                <div class="box">
                    <div class="field"><strong>Título</strong><span style="color:#0056b3;">${escapeHTML(m.titulo || '-')}</span></div>
                    <div class="field" style="margin-top:15px;"><strong>Nº OS</strong><span style="color:#333;">${escapeHTML(m.numeroOS || '-')}</span></div>
                    <div class="field" style="margin-top:15px;"><strong>Descrição</strong><div style="white-space: pre-wrap;">${escapeHTML(m.descricao || '-')}</div></div>
                </div>

                <div class="grid box" style="background:#fff3cd; border-color:#ffeeba; color:#856404;">
                    <div class="field"><strong>Fornecedor</strong><span>${escapeHTML(m.fornecedor || '-')}</span></div>
                    <div class="field"><strong>Notas Fiscais</strong><span>NF: ${escapeHTML(m.notaFiscal || '-')} | NFS: ${escapeHTML(m.notaServico || '-')}</span></div>
                </div>

                <div class="grid box">
                    <div class="field"><strong>Valor NF-e</strong><span>R$ ${formatarValor(m.valorNfe || 0)}</span></div>
                    <div class="field"><strong>Valor NFS-e</strong><span>R$ ${formatarValor(m.valorNfse || 0)}</span></div>
                    <div class="field"><strong>Valor Total</strong><span class="money">${valorFormatado}</span></div>
                </div>

                <div class="box">
                    <strong>Anexos / Arquivos</strong>
                    <ul style="margin-top:10px;">${arquivosHtml}</ul>
                </div>
            </div>
        </body>
        </html>
    `;

    // 4. Abrir Nova Janela
    const win = window.open('', '_blank', 'width=900,height=800,scrollbars=yes,resizable=yes');
    if (win) {
        win.document.open();
        win.document.write(htmlContent);
        win.document.close();
        win.focus();
    } else {
        alert('Pop-up bloqueado. Por favor, permita pop-ups para visualizar os detalhes.');
    }

  } catch (e) {
    console.error('Erro ao visualizar manutenção:', e);
    alert('Erro ao carregar detalhes da manutenção.');
  }
}

// �️ Excluir manutenção
async function excluirManutencao(id) {
  if (!canDelete()) {
    alert('Você não tem permissão para excluir registros.');
    return;
  }

  if (!confirm('Tem certeza que deseja excluir esta manutenção? Esta ação não pode ser desfeita.')) return;

  try {
    // 1. Limpar arquivos do Storage (usando listagem direta da pasta para garantir limpeza total)
    // Lista todos os arquivos dentro da pasta do ID
    const { data: filesInStorage, error: listError } = await supabaseClient.storage
      .from('manutencao_arquivos')
      .list(id.toString());

    if (!listError && filesInStorage && filesInStorage.length > 0) {
      // Mapeia para o caminho completo (ID/NomeArquivo)
      const paths = filesInStorage.map(f => `${id}/${f.name}`);
      const { error: storageError } = await supabaseClient.storage
        .from('manutencao_arquivos')
        .remove(paths);
      
      if (storageError) console.warn('Aviso: Erro ao excluir arquivos do Storage:', storageError);
    }

    // 3. Excluir registros dependentes (caso não haja CASCADE configurado no banco)
    await supabaseClient.from('manutencao_arquivos').delete().eq('id_manutencao', id);
    await supabaseClient.from('manutencao_itens').delete().eq('id_manutencao', id);

    // 4. Excluir a manutenção principal
    const { error } = await supabaseClient.from('manutencao').delete().eq('id', id);
    if (error) throw error;

    alert('✅ Manutenção excluída com sucesso!');
    buscarManutencao(); // Atualiza a tabela
  } catch (error) {
    console.error('Erro ao excluir manutenção:', error);
    alert('❌ Erro ao excluir manutenção: ' + (error.message || error));
  }
}

// 📥 Baixar arquivo
window.downloadArquivo = async function(path) {
  try {
    const { data, error } = await supabaseClient.storage.from('manutencao_arquivos').createSignedUrl(path, 60);
    if (error) throw error;
    window.open(data.signedUrl, '_blank');
  } catch (err) {
    console.error('Erro ao baixar arquivo:', err);
    alert('Erro ao gerar link de download.');
  }
}

function exportarExcel() {
    if (!dadosExportacao || dadosExportacao.length === 0) {
        alert('Realize uma busca para exportar os dados.');
        return;
    }

    const dadosFormatados = dadosExportacao.map(m => ({
        'TÍTULO_DA_MANUTENÇÃO': m.titulo || '',
        'FORNECEDOR': m.fornecedor || '',
        'DATA': m.data ? new Date(m.data).toLocaleDateString('pt-BR') : '',
        'PLACA': m.veiculo || '',
        'KM': m.km || 0,
        'OS': m.numeroOS || '',
        'NFS-E': m.notaServico || '',
        'Valor_NFS-E': (m.valorNfse || 0).toLocaleString('pt-BR', {minimumFractionDigits: 2}),
        'DESCRIÇÃO': m.descricao || '',
        'NF': m.notaFiscal || '',
        'Valor_NF': (m.valorNfe || 0).toLocaleString('pt-BR', {minimumFractionDigits: 2}),
        'Valor_Total': (m.valor || 0).toLocaleString('pt-BR', {minimumFractionDigits: 2}),
        'Usuário': m.usuario || '',
        'Filial': m.filial || ''
    }));

    const ws = XLSX.utils.json_to_sheet(dadosFormatados);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Manutencoes");
    XLSX.writeFile(wb, "Relatorio_Manutencao.xlsx");
}

async function getLogoBase64PDF() {
    return new Promise((resolve) => {
        const img = new Image();
        img.src = 'logo.png';
        img.crossOrigin = 'Anonymous';
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0);
            resolve(canvas.toDataURL('image/jpeg'));
        };
        img.onerror = () => resolve(null);
    });
}

function getFiltrosAtivosTexto() {
    const filtros = [];
    const getValue = (id) => document.getElementById(id)?.value?.trim() || '';

    const dataInicial = getValue('dataInicial');
    const dataFinal = getValue('dataFinal');
    if (dataInicial || dataFinal) {
        filtros.push(`Período: ${dataInicial ? formatarData(dataInicial) : 'Início'} a ${dataFinal ? formatarData(dataFinal) : 'Atual'}`);
    }

    const campos = [
        ['filial', 'Filial'],
        ['tipoManutencao', 'Tipo'],
        ['veiculo', 'Veículo'],
        ['titulo', 'Título'],
        ['fornecedor', 'Fornecedor'],
        ['nfse', 'NFS-e'],
        ['nfe', 'NF-e'],
        ['os', 'OS'],
        ['status', 'Status']
    ];

    campos.forEach(([id, label]) => {
        const value = getValue(id);
        if (value) filtros.push(`${label}: ${value}`);
    });

    return filtros.length ? filtros.join(' | ') : 'Sem filtros aplicados';
}

async function exportarPDF() {
    if (!dadosExportacao || dadosExportacao.length === 0) {
        alert('Realize uma busca para exportar os dados.');
        return;
    }

    if (!window.jspdf || !window.jspdf.jsPDF) {
        alert('Biblioteca jsPDF não carregada. Verifique sua conexão.');
        return;
    }

    const btn = document.getElementById('btnExportarPDF');
    const originalText = btn?.innerHTML;
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Gerando...';
    }

    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
        const logoBase64 = await getLogoBase64PDF();
        const usuarioLogado = JSON.parse(localStorage.getItem('usuarioLogado'));
        const nomeUsuario = usuarioLogado?.nome || 'Sistema';
        const totalGeral = dadosExportacao.reduce((acc, m) => acc + (parseFloat(m.valor) || 0), 0);

        if (logoBase64) {
            doc.addImage(logoBase64, 'JPEG', 14, 10, 40, 10);
        }

        doc.setFontSize(18);
        doc.setTextColor(0, 105, 55);
        doc.text('Relatório de Manutenção', 60, 18);

        doc.setFontSize(9);
        doc.setTextColor(100);
        doc.text(`Gerado por: ${nomeUsuario}`, 14, 29);
        doc.text(`Registros: ${dadosExportacao.length}`, 14, 34);
        doc.text(`Total: R$ ${formatarValor(totalGeral)}`, 55, 34);

        const filtrosTexto = doc.splitTextToSize(getFiltrosAtivosTexto(), 260);
        doc.text(filtrosTexto, 14, 40);

        const startY = 40 + (filtrosTexto.length * 4) + 4;
        const columns = ['Data', 'Usuário', 'Título', 'Placa', 'Fornecedor', 'Descrição', 'OS', 'NF', 'NFS-e', 'Valor'];
        const rows = dadosExportacao.map(m => [
            formatarData(m.data),
            m.usuario || '-',
            m.titulo || '-',
            m.veiculo || '-',
            m.fornecedor || '-',
            m.descricao || '-',
            m.numeroOS || '-',
            m.notaFiscal || '-',
            m.notaServico || '-',
            `R$ ${formatarValor(m.valor || 0)}`
        ]);

        rows.push([
            { content: 'TOTAL GERAL', colSpan: 9, styles: { halign: 'right', fontStyle: 'bold' } },
            { content: `R$ ${formatarValor(totalGeral)}`, styles: { halign: 'right', fontStyle: 'bold' } }
        ]);

        doc.autoTable({
            head: [columns],
            body: rows,
            startY,
            theme: 'grid',
            headStyles: { fillColor: [0, 105, 55], textColor: 255, fontSize: 8 },
            styles: { fontSize: 7, cellPadding: 2, overflow: 'linebreak' },
            alternateRowStyles: { fillColor: [245, 247, 246] },
            columnStyles: {
                0: { cellWidth: 18 },
                1: { cellWidth: 24 },
                2: { cellWidth: 30 },
                3: { cellWidth: 20 },
                4: { cellWidth: 34 },
                5: { cellWidth: 55 },
                6: { cellWidth: 18 },
                7: { cellWidth: 20 },
                8: { cellWidth: 20 },
                9: { cellWidth: 24, halign: 'right' }
            }
        });

        const pageCount = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setFontSize(8);
            doc.setTextColor(100);
            const pageWidth = doc.internal.pageSize.getWidth();
            const pageHeight = doc.internal.pageSize.getHeight();
            doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 14, pageHeight - 10);
            const pageText = `Página ${i} de ${pageCount}`;
            doc.text(pageText, pageWidth - 14 - doc.getTextWidth(pageText), pageHeight - 10);
        }

        doc.save(`Relatorio_Manutencao_${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (err) {
        console.error('Erro ao exportar PDF:', err);
        alert('Erro ao gerar PDF: ' + (err.message || err));
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    }
}

function setupColumnResizing() {
    const headers = document.querySelectorAll('.table-responsive th:not(.col-acoes-fixed)');
    
    headers.forEach(th => {
        // Adiciona o elemento resizer se não existir
        if (!th.querySelector('.resizer')) {
            const resizer = document.createElement('div');
            resizer.classList.add('resizer');
            th.appendChild(resizer);
            createResizableColumn(th, resizer);
        }
    });
}

function createResizableColumn(col, resizer) {
    let x = 0;
    let w = 0;

    const mouseDownHandler = function (e) {
        e.preventDefault();
        e.stopPropagation();
        x = e.clientX;
        const styles = window.getComputedStyle(col);
        w = parseInt(styles.width, 10);
        document.addEventListener('mousemove', mouseMoveHandler);
        document.addEventListener('mouseup', mouseUpHandler);
        resizer.classList.add('resizing');
    };

    const mouseMoveHandler = function (e) {
        const dx = e.clientX - x;
        col.style.width = `${w + dx}px`;
    };

    const mouseUpHandler = function () {
        document.removeEventListener('mousemove', mouseMoveHandler);
        document.removeEventListener('mouseup', mouseUpHandler);
        resizer.classList.remove('resizing');
    };

    resizer.addEventListener('mousedown', mouseDownHandler);
}

// 🚀 Inicialização
document.addEventListener('DOMContentLoaded', async () => {
  preencherUsuarioLogado();
  await carregarFiltros();
  renderCabecalhoResultados();

  document.getElementById('btnIncluirManutencao')?.addEventListener('click', () => {
    window.location.href = 'incluir-manutencao.html';
  });

  document.getElementById('btnBuscarManutencao').addEventListener('click', buscarManutencao);
  document.getElementById('btnToggleMenuLateral')?.addEventListener('click', toggleMenuLateralManutencao);

  document.getElementById('btnExportarPDF').addEventListener('click', () => {
    exportarPDF();
  });

  document.getElementById('btnExportarXLS').addEventListener('click', () => {
    exportarExcel();
  });
  
  const btnImportar = document.getElementById('btnImportar');
  if (btnImportar) {
    btnImportar.addEventListener('click', async () => {
      await setupImportModal();
      document.getElementById('modalImportar').classList.remove('hidden');
    });
  }

  // Listener para busca local
  document.getElementById('searchResultadosLocal')?.addEventListener('input', filtrarERenderizarTabela);

  // ✅ Delegação de Eventos para a Tabela de Resultados
  const tabelaResultados = document.getElementById('tabelaResultados');
  if (tabelaResultados) {
      tabelaResultados.addEventListener('click', (e) => {
          const btn = e.target.closest('button');
          if (!btn) return;
          
          const id = btn.dataset.id;
          if (!id) return;

          if (btn.classList.contains('btn-visualizar')) visualizarManutencao(id);
          else if (btn.classList.contains('btn-editar')) abrirManutencao(id);
          else if (btn.classList.contains('btn-excluir')) excluirManutencao(id);
          else if (btn.classList.contains('btn-anexar')) iniciarAnexoManutencao(id);
      });
  }

  // Listeners para o Modal de Anexo (MOVIDOS PARA DENTRO DO DOMContentLoaded)
  const btnCloseModalAnexo = document.getElementById('btnCloseModalAnexo');
  if (btnCloseModalAnexo) btnCloseModalAnexo.addEventListener('click', fecharModalAnexo);

  const btnCancelarAnexo = document.getElementById('btnCancelarAnexo');
  if (btnCancelarAnexo) btnCancelarAnexo.addEventListener('click', fecharModalAnexo);

  const inputArquivoAnexo = document.getElementById('inputArquivoAnexo');
  if (inputArquivoAnexo) inputArquivoAnexo.addEventListener('change', handleFileSelect);

  const arquivoAnexoLabel = document.getElementById('arquivoAnexoLabel');
  if (arquivoAnexoLabel) setupDropzoneAnexo(arquivoAnexoLabel);

  const btnConfirmarAnexo = document.getElementById('btnConfirmarAnexo');
  if (btnConfirmarAnexo) btnConfirmarAnexo.addEventListener('click', confirmarAnexo);

  // Fechar modal ao clicar no backdrop
  window.addEventListener('click', (e) => {
      if (e.target.id === 'modalAnexo') fecharModalAnexo();
      if (e.target.id === 'modalVisualizar') fecharModalVisualizacao();
  });

  await restaurarBuscaAposEdicao();
});

async function iniciarAnexoManutencao(id) {
    idManutencaoAnexo = id;
    arquivosParaUpload = [];
    arquivosParaDeletar = [];
    arquivosExistentes = [];

    try {
        const { data: arquivos, error } = await supabaseClient
            .from('manutencao_arquivos')
            .select('*')
            .eq('id_manutencao', id);

        if (error) throw error;

        if (arquivos && arquivos.length > 0) {
            if (!confirm('Já existem arquivos anexados a este lançamento. Deseja incluir novos arquivos?')) {
                return;
            }
            arquivosExistentes = arquivos.map(a => ({ 
                nome: a.nome_arquivo, 
                path: a.caminho_arquivo, 
                isZipped: a.is_zipped || false, 
                originalNames: a.original_names || [] 
            }));
        }

        abrirModalAnexo();
    } catch (e) {
        console.error('Erro ao verificar anexos:', e);
        alert('Erro ao carregar anexos existentes.');
    }
}

function abrirModalAnexo() {
    console.log('abrirModalAnexo called');
    const modalElement = document.getElementById('modalAnexo');
    if (!modalElement) {
        console.error("Elemento 'modalAnexo' não encontrado no DOM! Verifique o HTML.");
        return; // Impede o erro de 'classList' em null
    }
    modalElement.classList.remove('hidden');
    document.getElementById('inputArquivoAnexo').value = '';
    arquivosAnexoSelecionados = [];
    atualizarLabelAnexo();
    renderizarListaArquivos();
}

function fecharModalAnexo() {
    console.log('fecharModalAnexo called');
    document.getElementById('modalAnexo').classList.add('hidden');
}

function handleFileSelect(e) {
    atualizarArquivosSelecionadosAnexo(e.target.files);
}

function atualizarArquivosSelecionadosAnexo(files) {
    arquivosAnexoSelecionados = Array.from(files || []);
    if (arquivosAnexoSelecionados.length > 0) {
        const label = arquivosAnexoSelecionados.length === 1
            ? arquivosAnexoSelecionados[0].name
            : `${arquivosAnexoSelecionados.length} arquivos selecionados`;
        atualizarLabelAnexo(label);
    }
}

function setupDropzoneAnexo(dropzone) {
    ['dragenter', 'dragover'].forEach(eventName => {
        dropzone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropzone.classList.add('drag-over');
        });
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropzone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropzone.classList.remove('drag-over');
        });
    });

    dropzone.addEventListener('drop', (e) => {
        atualizarArquivosSelecionadosAnexo(e.dataTransfer.files);
    });
}

function atualizarLabelAnexo(texto = 'Clique ou arraste o arquivo aqui') {
    const label = document.getElementById('arquivoAnexoLabel');
    if (!label) return;

    label.innerHTML = `
        <i class="fas fa-cloud-upload-alt"></i>
        <span>${escapeHTML(texto)}</span>
    `;
}

async function confirmarAnexo() {
    console.log('confirmarAnexo called');
    const input = document.getElementById('inputArquivoAnexo');
    const files = arquivosAnexoSelecionados.length > 0 ? arquivosAnexoSelecionados : Array.from(input.files || []);
    if (files.length === 0) return;

    const arquivosPreparados = await prepararArquivosParaAnexo(files);
    if (!arquivosPreparados) return;

    arquivosParaUpload.push(...arquivosPreparados);
    renderizarListaArquivos();
    input.value = '';
    arquivosAnexoSelecionados = [];
    atualizarLabelAnexo();
}

async function prepararArquivosParaAnexo(files) {
    const listaArquivos = Array.from(files || []);
    if (listaArquivos.length === 0) return [];

    if (listaArquivos.length === 1) {
        return [{ file: listaArquivos[0], name: listaArquivos[0].name, isZipped: false, originalNames: null }];
    }

    if (typeof JSZip === 'undefined') {
        alert('A biblioteca JSZip não foi encontrada. Certifique-se de que ela está carregada na página.');
        return null;
    }

    const zip = new JSZip();
    const originalNames = [];
    listaArquivos.forEach(file => {
        zip.file(file.name, file);
        originalNames.push(file.name);
    });

    const content = await zip.generateAsync({ type: "blob" });
    const zipFileName = `anexos_${Date.now()}.zip`;
    return [{ file: content, name: zipFileName, isZipped: true, originalNames }];
}

function renderizarListaArquivos() {
    console.log('renderizarListaArquivos called');
    const container = document.getElementById('listaArquivosAnexados');
    if (!container) return;
    container.innerHTML = '';

    const arquivosRender = [
        ...arquivosExistentes.map((arquivo, index) => ({ arquivo, index, novo: false })),
        ...arquivosParaUpload.map((arquivo, index) => ({ arquivo, index, novo: true }))
    ];

    arquivosRender.forEach(({ arquivo, index, novo }) => {
        const div = document.createElement('div');
        div.className = novo ? 'arquivo-item novo' : 'arquivo-item';

        const nome = arquivo.nome || arquivo.name || 'Arquivo';
        const info = document.createElement('span');
        info.className = 'arquivo-nome';
        info.innerHTML = `${arquivo.isZipped ? '<i class="fas fa-file-archive"></i>' : '<i class="fas fa-file-alt"></i>'} <span>${escapeHTML(nome)}</span>${novo ? ' <strong>(Novo)</strong>' : ''}`;

        const actions = document.createElement('div');
        actions.className = 'arquivo-acoes';

        if (!novo) {
            const downloadBtn = document.createElement('button');
            downloadBtn.type = 'button';
            downloadBtn.className = 'btn-icon';
            downloadBtn.title = 'Baixar';
            downloadBtn.innerHTML = '<i class="fas fa-download"></i>';
            downloadBtn.addEventListener('click', () => window.downloadArquivo(arquivo.path));
            actions.appendChild(downloadBtn);
        }

        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'btn-icon delete';
        removeBtn.title = 'Remover';
        removeBtn.innerHTML = '<i class="fas fa-trash-alt"></i>';
        removeBtn.addEventListener('click', () => {
            if (novo) window.removerArquivoNovo(index);
            else window.removerArquivoExistente(index);
        });
        actions.appendChild(removeBtn);

        div.appendChild(info);
        div.appendChild(actions);
        container.appendChild(div);
    });

    if (arquivosParaUpload.length > 0 || arquivosParaDeletar.length > 0) {
        const saveBtn = document.createElement('button');
        saveBtn.className = 'btn-glass btn-green';
        saveBtn.style.cssText = 'width: 100%; margin-top: 10px; padding: 10px; cursor: pointer; background: #28a745; color: white; border: none; border-radius: 4px;';
        saveBtn.innerHTML = '<i class="fas fa-save"></i> Salvar Alterações de Arquivos';
        saveBtn.onclick = () => salvarArquivosManutencao(idManutencaoAnexo);
        container.appendChild(saveBtn);
    }
}

window.removerArquivoNovo = (index) => { arquivosParaUpload.splice(index, 1); renderizarListaArquivos(); };
window.removerArquivoExistente = (index) => {
    if (confirm('Remover este anexo? A exclusão será efetivada ao salvar.')) {
        console.log('removerArquivoExistente called');
        const removed = arquivosExistentes.splice(index, 1)[0];
        if (removed?.path) arquivosParaDeletar.push(removed.path);
        renderizarListaArquivos();
    }
};

async function salvarArquivosManutencao(idManutencao) {
    console.log('salvarArquivosManutencao called');
    const btn = document.querySelector('#listaArquivosAnexados .btn-green');
    if(btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';
    }

    try {
        // 1. Excluir arquivos marcados para remoção no Storage
        const caminhosParaDeletar = [...arquivosParaDeletar];
        if (arquivosParaDeletar.length > 0) {
            await supabaseClient.storage.from('manutencao_arquivos').remove(arquivosParaDeletar);

            const { error: dbDeleteError } = await supabaseClient
                .from('manutencao_arquivos')
                .delete()
                .eq('id_manutencao', idManutencao)
                .in('caminho_arquivo', caminhosParaDeletar);

            if (dbDeleteError) throw dbDeleteError;

            arquivosParaDeletar = [];
        }

        const novosRegistros = [];
        const nomesUsados = new Set(arquivosExistentes.map(a => a.nome).filter(Boolean));
        let indiceUpload = 0;
        
        // 2. Upload de novos arquivos
        for (const file of arquivosParaUpload) {
            const nomeArquivo = criarNomeArquivoUnico(file.name, nomesUsados);
            const fileName = criarCaminhoArquivo(idManutencao, nomeArquivo, indiceUpload++);
            const { data, error } = await supabaseClient.storage
                .from('manutencao_arquivos')
                .upload(fileName, file.file);
            
            if (!error) {
                novosRegistros.push({
                    id_manutencao: idManutencao,
                    nome_arquivo: nomeArquivo,
                    is_zipped: file.isZipped,
                    original_names: file.originalNames || null,
                    caminho_arquivo: data.path
                });
            }
        }

        if (novosRegistros.length > 0) {
            const { data: insertedData, error: insertError } = await supabaseClient
                .from('manutencao_arquivos')
                .insert(novosRegistros)
                .select('*');

            if (insertError) throw insertError;

            // Atualiza o estado local com os dados do banco
            arquivosExistentes = [
                ...arquivosExistentes,
                ...insertedData.map(mapearArquivoBanco)
            ];
        }

        arquivosParaUpload = [];
        renderizarListaArquivos();
        alert('✅ Anexos atualizados com sucesso!');
        fecharModalAnexo();

    } catch (err) {
        console.error('Erro ao salvar arquivos:', err);
        alert('Erro ao salvar anexos: ' + err.message);
        if(btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-save"></i> Salvar Alterações de Arquivos';
        }
    }
}

async function setupImportModal() {
  if (document.getElementById('modalImportar')) return;

  // Carregar filiais e fornecedores para os campos do modal
  let optionsFiliais = '<option value="">Selecione a Filial...</option>';
  let optionsFornecedores = '';
  const [{ data: filiais }, { data: fornecedores }] = await Promise.all([
      supabaseClient.from('filiais').select('nome, sigla').order('nome'),
      supabaseClient.from('fornecedor_manutencao').select('nome, cnpj').order('nome')
  ]);

  if (filiais) {
      filiais.forEach(f => {
          const val = f.sigla || f.nome;
          const text = f.sigla ? `${f.nome} (${f.sigla})` : f.nome;
          optionsFiliais += `<option value="${val}">${text}</option>`;
      });
  }

  if (fornecedores) {
      fornecedores.forEach(f => {
          if (!f.nome) return;
          const displayValue = f.cnpj ? `${f.nome} (CNPJ: ${f.cnpj})` : f.nome;
          optionsFornecedores += `<option value="${escapeHTML(displayValue)}"></option>`;
      });
  }

  const modalHtml = `
  <div id="modalImportar" class="hidden" style="position: fixed; z-index: 9999; left: 0; top: 0; width: 100%; height: 100%; overflow: auto; background-color: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center;">
      <div class="modal-content" style="background-color: #fefefe; margin: auto; padding: 20px; border: 1px solid #888; width: 460px; max-width: 90%; border-radius: 8px; box-shadow: 0 4px 8px rgba(0,0,0,0.2); position: relative;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 1px solid #eee; padding-bottom: 10px;">
              <h3 style="margin: 0; color: #333;">Importar Manutenção</h3>
              <span id="closeModalImportar" style="color: #aaa; font-size: 24px; font-weight: bold; cursor: pointer;">&times;</span>
          </div>
          <form id="formImportar">
              <div style="margin-bottom: 15px;">
                  <label for="tipoImportacao" style="display: block; margin-bottom: 5px; font-weight: bold; color: #555;">Tipo de Planilha:</label>
                  <select id="tipoImportacao" required style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;">
                      <option value="">Selecione...</option>
                      <option value="ENGRAXE">Engraxe</option>
                      <option value="FECHAMENTO">Fechamento</option>
                      <option value="LAVAGEM">Lavagem</option>
                  </select>
              </div>
              <div style="margin-bottom: 15px;">
                  <label for="filialImportacao" style="display: block; margin-bottom: 5px; font-weight: bold; color: #555;">Filial (Obrigatório):</label>
                  <select id="filialImportacao" required style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;">
                      ${optionsFiliais}
                  </select>
              </div>
              <div style="margin-bottom: 15px;">
                  <label for="fornecedorImportacao" style="display: block; margin-bottom: 5px; font-weight: bold; color: #555;">Fornecedor (Obrigatório):</label>
                  <input type="text" id="fornecedorImportacao" list="listaFornecedoresImportacao" required placeholder="Nome do Fornecedor" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;">
                  <datalist id="listaFornecedoresImportacao">
                      ${optionsFornecedores}
                  </datalist>
              </div>
              <div style="margin-bottom: 15px;">
                  <label for="tipoManutencaoImportacao" style="display: block; margin-bottom: 5px; font-weight: bold; color: #555;">Tipo de Manutenção (Obrigatório):</label>
                  <select id="tipoManutencaoImportacao" required style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;">
                      <option value="">Selecione...</option>
                      <option value="CORRETIVA">CORRETIVA</option>
                      <option value="PREVENTIVA">PREVENTIVA</option>
                   </select>
              </div>
              <div style="margin-bottom: 15px;">
                  <label for="arquivoAnexoImportacao" style="display: block; margin-bottom: 5px; font-weight: bold; color: #555;">Anexar Arquivos (Opcional):</label>
                  <input type="file" id="arquivoAnexoImportacao" multiple style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;">
              </div>
              <div style="margin-bottom: 5px; text-align: right;">
                  <a href="#" id="btnBaixarModelo" style="color: #007bff; text-decoration: none; font-size: 0.85em; display: inline-flex; align-items: center; gap: 5px;"><i class="fas fa-download"></i> Baixar Modelo</a>
              </div>
              <div style="margin-bottom: 20px;">
                  <label for="arquivoImportacao" style="display: block; margin-bottom: 5px; font-weight: bold; color: #555;">Arquivo (XLSX):</label>
                  <input type="file" id="arquivoImportacao" accept=".xlsx, .xls" required style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;">
              </div>
              <div id="importStatus" class="hidden" style="margin-bottom: 20px; padding: 12px; border: 1px solid #ddd; border-radius: 6px; background: #f8f9fb;">
                  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; font-weight: 600; color: #333;">
                      <span class="import-status-text">Carregando... Aguarde</span>
                      <span class="import-progress-percent">0%</span>
                  </div>
                  <div style="position: relative; height: 10px; background: #e8ecef; border-radius: 10px; overflow: hidden;">
                      <div id="importProgressBarFill" style="width: 0%; height: 100%; background: linear-gradient(90deg, #4caf50, #24a148); transition: width 0.2s ease;"></div>
                  </div>
              </div>
              <div style="text-align: right;">
                  <button type="button" id="btnCancelarImportacao" style="padding: 8px 16px; margin-right: 10px; background-color: #6c757d; color: white; border: none; border-radius: 4px; cursor: pointer;">Cancelar</button>
                  <button type="submit" style="padding: 8px 16px; background-color: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer;">Importar</button>
              </div>
          </form>
      </div>
  </div>
  `;
  document.body.insertAdjacentHTML('beforeend', modalHtml);

  const closeModal = () => document.getElementById('modalImportar').classList.add('hidden');
  document.getElementById('closeModalImportar').addEventListener('click', closeModal);
  document.getElementById('btnCancelarImportacao').addEventListener('click', closeModal);
  document.getElementById('modalImportar').addEventListener('click', (e) => {
      if (e.target === document.getElementById('modalImportar')) closeModal();
  });
  document.getElementById('formImportar').addEventListener('submit', handleImportSubmit);
  
  document.getElementById('btnBaixarModelo').addEventListener('click', (e) => {
      e.preventDefault();
      baixarModeloImportacao();
  });
}

function setImportProgress(text, percent) {
  const status = document.getElementById('importStatus');
  const progressFill = document.getElementById('importProgressBarFill');
  const percentText = status?.querySelector('.import-progress-percent');
  const statusText = status?.querySelector('.import-status-text');
  if (!status || !progressFill || !percentText || !statusText) return;
  statusText.textContent = text || 'Carregando... Aguarde';
  const clamped = Math.max(0, Math.min(100, percent || 0));
  progressFill.style.width = `${clamped}%`;
  percentText.textContent = `${clamped}%`;
}

function showImportProgress(show) {
  const status = document.getElementById('importStatus');
  const closeBtn = document.getElementById('closeModalImportar');
  const form = document.getElementById('formImportar');
  if (!status || !form) return;
  status.classList.toggle('hidden', !show);
  const elements = Array.from(form.querySelectorAll('input, select, button'));
  elements.forEach(el => {
      if (el.id === 'btnCancelarImportacao' || el.type === 'submit') {
          el.disabled = show;
      } else if (el.type !== 'submit') {
          el.disabled = show;
      }
  });
  if (closeBtn) {
      closeBtn.style.pointerEvents = show ? 'none' : '';
      closeBtn.style.opacity = show ? '0.5' : '1';
  }
}

function baixarModeloImportacao() {
    const tipo = document.getElementById('tipoImportacao').value;
    if (!tipo) {
        alert('Por favor, selecione um "Tipo de Planilha" para baixar o modelo correspondente.');
        return;
    }

    let headers = [];
    let data = [];

    headers = ['DATA', 'TÍTULO_DA_MANUTENÇÃO', 'PLACA', 'KM', 'OS', 'NF', 'VALOR_NF', 'NFS', 'VALOR_NFS', 'DESCRICAO'];
    data = [[new Date().toLocaleDateString('pt-BR'), 'ALMOXARIFADO', 'ABC1234', '10000', '123', '456', '500.00', '789', '150.00', 'Descrição da manutenção']];

    const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Modelo");
    
    XLSX.writeFile(wb, `Modelo_Importacao_${tipo}.xlsx`);
}

async function handleImportSubmit(e) {
  e.preventDefault();
  const tipo = document.getElementById('tipoImportacao').value;
  const filialSelecionada = document.getElementById('filialImportacao').value;
  const fornecedorSelecionado = document.getElementById('fornecedorImportacao').value.trim();
  const tipoManutencaoSelecionado = document.getElementById('tipoManutencaoImportacao').value;
  const fileInput = document.getElementById('arquivoImportacao');
  const anexoInput = document.getElementById('arquivoAnexoImportacao');
  const file = fileInput.files[0];
  const btnSubmit = e.target.querySelector('button[type="submit"]');

  if (!file) return;

  const originalText = btnSubmit.textContent;
  btnSubmit.disabled = true;
  btnSubmit.textContent = 'Processando...';
  showImportProgress(true);
  setImportProgress('Preparando importação... Aguarde', 0);

  const reader = new FileReader();
  reader.onload = async (ev) => {
      try {
          const data = new Uint8Array(ev.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const json = XLSX.utils.sheet_to_json(worksheet);

          if (json.length === 0) throw new Error('Planilha vazia.');

          await processarDadosImportacao(json, tipo, filialSelecionada, fornecedorSelecionado, tipoManutencaoSelecionado, anexoInput.files, (message, percent) => {
              setImportProgress(message, percent);
          });
          
          document.getElementById('modalImportar').classList.add('hidden');
          document.getElementById('formImportar').reset();
          buscarManutencao();
      } catch (error) {
          console.error('Erro na importação:', error);
          alert('Erro ao processar arquivo: ' + error.message);
      } finally {
          btnSubmit.disabled = false;
          btnSubmit.textContent = originalText;
          fileInput.value = '';
          showImportProgress(false);
      }
  };
  reader.readAsArrayBuffer(file);
}

async function processarDadosImportacao(dados, tipo, filialSelecionada, fornecedorSelecionado, tipoManutencaoSelecionado, arquivosAnexo, progressCallback = () => {}) {
  const usuarioLogado = JSON.parse(localStorage.getItem('usuarioLogado'))?.nome || 'Sistema';
  const totalRows = dados.length;
  const manutencoesParaInserir = [];
  const valoresParaInserir = [];
  const importedRecords = []; // Para registros que foram inseridos com sucesso
  const rejectedRecords = []; // Para registros que falharam na validação ou inserção

  const hasValue = (val) => val !== undefined && val !== null && String(val).trim() !== '';
  const getCell = (row, keys) => {
      for (const key of keys) {
          if (hasValue(row[key])) return row[key];
      }
      return undefined;
  };

  // Helper para limpar valores monetários (R$ 1.200,50 -> 1200.50)
  const parseCurrency = (val) => {
      if (typeof val === 'number') return val;
      if (!hasValue(val)) return null;
      if (typeof val !== 'string') val = String(val); // Garante que é string para replace
      let str = val.toString().replace(/[R$\s]/g, ''); // Remove R$ e espaços
      // Se tiver vírgula, assume formato BR (ponto é milhar, vírgula é decimal)
      if (str.includes(',')) {
          str = str.replace(/\./g, '').replace(',', '.');
      }
      const parsed = parseFloat(str);
      return Number.isNaN(parsed) ? null : parsed;
  };

  const parseExcelDate = (value) => {
      if (value instanceof Date && !Number.isNaN(value.getTime())) {
          return value.toISOString().split('T')[0];
      }
      const rawValue = (typeof value === 'string') ? value.trim() : value;
      if (typeof rawValue === 'number' && rawValue > 0) {
          const excelEpoch = new Date(Date.UTC(1899, 11, 30));
          const date = new Date(excelEpoch.getTime() + rawValue * 24 * 60 * 60 * 1000);
          return date.toISOString().split('T')[0];
      }
      if (typeof rawValue === 'string' && /^\d+$/.test(rawValue)) {
          const numeric = Number(rawValue);
          if (!Number.isNaN(numeric) && numeric > 0) {
              const excelEpoch = new Date(Date.UTC(1899, 11, 30));
              const date = new Date(excelEpoch.getTime() + numeric * 24 * 60 * 60 * 1000);
              return date.toISOString().split('T')[0];
          }
      }
      if (typeof rawValue === 'string' && rawValue.includes('/')) {
          const parts = rawValue.split('/');
          if (parts.length === 3) return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
      }
      if (typeof rawValue === 'string' && rawValue.includes('-')) {
          return rawValue.split('T')[0];
      }
      return null;
  };

  for (let rowIndex = 0; rowIndex < dados.length; rowIndex++) {
      const row = dados[rowIndex];
      const r = {};
      let motivoRejeicao = '';
      Object.keys(row).forEach(k => r[k.toUpperCase().trim()] = row[k]);

      let dataISO = null;
      const dataRaw = getCell(r, ['DATA', 'DT']);
      if (hasValue(dataRaw)) {
          dataISO = parseExcelDate(dataRaw);
      }
      
      const placa = String(getCell(r, ['PLACA', 'VEICULO']) || '').toUpperCase().trim();
      if (!placa) {
          motivoRejeicao = 'Placa não informada.';
          rejectedRecords.push({ originalRow: row, motivo_rejeicao: motivoRejeicao });
          continue;
      }

      const titulo = getCell(r, ['TÍTULO_DA_MANUTENÇÃO', 'TITULO_DA_MANUTENCAO', 'TITULO']);
      const km = getCell(r, ['KM']);
      const numeroOS = getCell(r, ['OS', 'Nº OS', 'N° OS']);
      const notaFiscal = getCell(r, ['NF', 'NOTA', 'NF-E']);
      const valorNfe = parseCurrency(getCell(r, ['VALOR_NF', 'VALOR', 'TOTAL', 'CUSTO']));
      const notaServico = getCell(r, ['NFS', 'NFS-E', 'NFSE']);
      const valorNfse = parseCurrency(getCell(r, ['VALOR_NFS', 'VALOR_NFS-E', 'VALOR_NFSE']));
      const descricao = getCell(r, ['DESCRICAO', 'DESCRIÇÃO', 'SERVICO', 'OBS']);
      
      const payloadManutencao = {
          veiculo: placa,
          fornecedor: fornecedorSelecionado,
          tipo: tipoManutencaoSelecionado,
          usuario: usuarioLogado,
          status: 'finalizado',
          filial: filialSelecionada
      };

      if (hasValue(dataISO)) payloadManutencao.data = dataISO;
      if (hasValue(titulo)) payloadManutencao.titulo = titulo;
      if (hasValue(descricao)) payloadManutencao.descricao = descricao;
      if (valorNfe !== null) payloadManutencao.valorNfe = valorNfe;
      if (valorNfse !== null) payloadManutencao.valorNfse = valorNfse;
      if (hasValue(km)) payloadManutencao.km = String(km);
      if (hasValue(notaFiscal)) payloadManutencao.notaFiscal = notaFiscal;
      if (hasValue(notaServico)) payloadManutencao.notaServico = notaServico;
      if (hasValue(numeroOS)) payloadManutencao.numeroOS = numeroOS;

      manutencoesParaInserir.push(payloadManutencao);
      valoresParaInserir.push((valorNfe || 0) + (valorNfse || 0)); // Guarda o valor para o item

      if ((rowIndex + 1) % 5 === 0 || rowIndex === totalRows - 1) {
          progressCallback('Validando registros... Aguarde', Math.round(10 + ((rowIndex + 1) / totalRows) * 15));
      }
  }

  if (manutencoesParaInserir.length > 0) {
      // 1. Insere as manutenções (cabeçalho)
      progressCallback('Inserindo manutenções...', 30);
      const { data: inserted, error } = await supabaseClient.from('manutencao').insert(manutencoesParaInserir).select();
      if (error) {
          // Se a inserção em lote falhar, todos os itens do lote são considerados rejeitados
          manutencoesParaInserir.forEach(m => rejectedRecords.push({ originalRow: m, motivo_rejeicao: `Erro ao inserir no banco de dados: ${error.message}` }));
          throw error; // Re-lança o erro para o handleImportSubmit
      }

      // Adiciona os registros inseridos com sucesso à lista de importados
      inserted.forEach(m => importedRecords.push(m));
      progressCallback('Preparando itens de valor...', 55);
      
      // 2. Prepara os itens com o valor total
      const itens = inserted.map((m, i) => ({
          id_manutencao: m.id,
          quantidade: 1,
          descricao: m.descricao || m.titulo || 'Valor importado',
          valor: valoresParaInserir[i] || 0
      })).filter(item => item.valor > 0);
      
      // 3. Insere os itens na tabela manutencao_itens
      progressCallback('Inserindo itens de valor...', 70);
      if (itens.length > 0) {
          const { error: errItens } = await supabaseClient.from('manutencao_itens').insert(itens);
          if (errItens) console.error("Erro ao inserir itens de valor:", errItens);
      }

      // Processar anexo se houver
      if (arquivosAnexo && arquivosAnexo.length > 0) {
          progressCallback('Preparando anexos...', 75);
          const arquivosPreparados = await prepararArquivosParaAnexo(arquivosAnexo);
          if (!arquivosPreparados) throw new Error('Não foi possível preparar os anexos para importação.');

          const totalAnexos = arquivosPreparados.length * inserted.length;
          let anexosProcessados = 0;

          for (const m of inserted) {
              const nomesUsadosAnexo = new Set();
              let indiceUpload = 0;
              for (const arquivo of arquivosPreparados) {
                  const nomeArquivo = criarNomeArquivoUnico(arquivo.name, nomesUsadosAnexo);
                  const fileName = criarCaminhoArquivo(m.id, nomeArquivo, indiceUpload++);
                  const { data: uploadData, error: uploadError } = await supabaseClient.storage
                      .from('manutencao_arquivos')
                      .upload(fileName, arquivo.file);
                  
                  if (!uploadError) {
                      const { error: insertArquivoError } = await supabaseClient.from('manutencao_arquivos').insert({
                          id_manutencao: m.id,
                          nome_arquivo: nomeArquivo,
                          caminho_arquivo: uploadData.path,
                          is_zipped: arquivo.isZipped,
                          original_names: arquivo.originalNames || null
                      });
                      if (insertArquivoError) {
                          console.error(`Erro ao salvar referência do anexo ${nomeArquivo} para manutenção ${m.id}:`, insertArquivoError);
                      }
                  } else {
                      console.error(`Erro ao enviar anexo ${arquivo.name} para manutenção ${m.id}:`, uploadError);
                  }

                  anexosProcessados += 1;
                  progressCallback(`Enviando anexos... (${anexosProcessados}/${totalAnexos})`, Math.round(75 + (anexosProcessados / totalAnexos) * 20));
              }
          }
      }

      progressCallback('Finalizando importação...', 95);
      alert(`${inserted.length} registros de ${tipo} importados com sucesso!`);
      progressCallback('Importação concluída!', 100);
      // Gera o relatório final
      gerarRelatorioImportacao(importedRecords, rejectedRecords);
  } else {
      throw new Error('Nenhum registro válido encontrado na planilha.');
  }
}

function gerarRelatorioImportacao(importedRecords, rejectedRecords) {
    let reportContent = `
RESUMO DA IMPORTAÇÃO DE MANUTENÇÕES
===================================
Data do Processamento: ${new Date().toLocaleString('pt-BR')}
Total de Registros na Planilha: ${importedRecords.length + rejectedRecords.length}
Registros Importados com Sucesso: ${importedRecords.length}
Registros Rejeitados: ${rejectedRecords.length}
===================================
`;

    if (importedRecords.length > 0) {
        reportContent += `\n✅ REGISTROS IMPORTADOS COM SUCESSO:\n`;
        reportContent += `-----------------------------------\n`;
        importedRecords.forEach((record, index) => {
            reportContent += `${index + 1}. ID: ${record.id} | Placa: ${record.veiculo} | Data: ${record.data} | Título: ${record.titulo}\n`;
        });
    }

    if (rejectedRecords.length > 0) {
        reportContent += `\n❌ REGISTROS REJEITADOS / ERROS:\n`;
        reportContent += `-----------------------------------\n`;
        rejectedRecords.forEach((record, index) => {
            reportContent += `\nErro ${index + 1}:\n`;
            reportContent += `  Motivo da Rejeição: ${record.motivo_rejeicao}\n`;
            reportContent += `  Dados da Linha Original (ou tentativa de inserção):\n`;
            // Tenta exibir os campos mais relevantes da linha original
            const originalData = record.originalRow || record; // Pode ser a linha original ou o payload
            for (const key in originalData) {
                // Evita mostrar campos internos do Supabase ou objetos complexos
                if (key.startsWith('_') || typeof originalData[key] === 'object') continue;
                reportContent += `    - ${key}: ${originalData[key]}\n`;
            }
        });
    }

    const blob = new Blob([reportContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    a.download = `resumo_importacao_manutencao_${timestamp}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
