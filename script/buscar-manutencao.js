import { supabaseClient } from './supabase.js';
import XLSX from "https://cdn.sheetjs.com/xlsx-0.20.2/package/xlsx.mjs";

let dadosExportacao = [];
let todosRegistros = []; // Armazena todos os registros buscados
// Paginação removida para exibir todos os resultados
function preencherUsuarioLogado() {
  const usuario = JSON.parse(localStorage.getItem('usuarioLogado'));
  const divUsuario = document.getElementById('usuario-logado');
  if (usuario?.nome && divUsuario) {
    divUsuario.textContent = `👤 Olá, ${usuario.nome}`;
  }
}

async function carregarFiltros() {
  const [placas, titulos, filiais, fornecedores] = await Promise.all([
    supabaseClient.from('veiculos').select('placa'),
    supabaseClient.from('titulomanutencao').select('manutencao'),
    supabaseClient.from('filiais').select('nome, sigla').order('nome'),
    supabaseClient.from('fornecedor').select('fornecedor')
  ]);

  preencherDatalist('listaPlacas', placas.data, 'placa');
  preencherDatalist('listaTitulos', titulos.data, 'manutencao');
  
  const selectFilial = document.getElementById('filial');
  selectFilial.innerHTML = '<option value="">Todas</option>';
  if (filiais.data) {
      filiais.data.forEach(f => {
          const opt = new Option(f.sigla ? `${f.nome} (${f.sigla})` : f.nome, f.sigla || f.nome);
          selectFilial.appendChild(opt);
      });
  }

  preencherDatalist('listaFornecedores', fornecedores.data, 'fornecedor');
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

async function buscarManutencao() {
  const filtros = {
    dataInicial: document.getElementById('dataInicial').value,
    dataFinal: document.getElementById('dataFinal').value,
    titulo: document.getElementById('titulo').value,
    nfse: document.getElementById('nfse').value,
    os: document.getElementById('os').value,
    veiculo: document.getElementById('veiculo').value,
    filial: document.getElementById('filial').value,
    tipo: document.getElementById('tipoManutencao').value,
    fornecedor: document.getElementById('fornecedor').value,
    usuario: document.getElementById('usuarioBusca').value
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
  renderizarTabelaCompleta();
}

function aplicarFiltrosQuery(query, filtros) {
  if (filtros.dataInicial) query = query.gte('data', filtros.dataInicial);
  if (filtros.dataFinal) query = query.lte('data', filtros.dataFinal);
  if (filtros.titulo) query = query.ilike('titulo', `%${filtros.titulo}%`);
  if (filtros.nfse) query = query.ilike('notaServico', `%${filtros.nfse}%`);
  if (filtros.os) query = query.ilike('numeroOS', `%${filtros.os}%`);
  if (filtros.veiculo) query = query.ilike('veiculo', `%${filtros.veiculo}%`);
  if (filtros.filial) query = query.eq('filial', filtros.filial);
  if (filtros.tipo) query = query.eq('tipo', filtros.tipo);
  if (filtros.fornecedor) query = query.ilike('fornecedor', `%${filtros.fornecedor}%`);
  if (filtros.usuario) query = query.ilike('usuario', `%${filtros.usuario}%`);
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

function renderizarTabelaCompleta() {
    preencherTabela(todosRegistros); // Renderiza todos os registros de uma vez

    // Atualiza totais gerais
    const valorTotalGeral = todosRegistros.reduce((acc, curr) => acc + (curr.valor || 0), 0);
    const totalRegistrosCount = todosRegistros.length;

    document.getElementById('totalRegistros').textContent = totalRegistrosCount;
    document.getElementById('valorTotal').textContent = formatarValor(valorTotalGeral);
    document.getElementById('paginationContainer').classList.add('hidden'); // Sempre esconde a paginação
}

// 📋 Preencher tabela de resultados
function preencherTabela(registros) {
  const tabela = document.getElementById('tabelaResultados');
  tabela.innerHTML = '';

  registros.forEach(m => {
    const linha = document.createElement('tr');
    linha.innerHTML = `
      <td style="display: flex; gap: 5px;">
        <button class="btn-icon view btn-visualizar" data-id="${m.id}" title="Visualizar"><i class="fas fa-eye"></i></button>
        <button class="btn-icon edit btn-editar" data-id="${m.id}" title="Abrir/Editar"><i class="fas fa-edit"></i></button>
        <button class="btn-icon delete btn-excluir" data-id="${m.id}" title="Excluir"><i class="fas fa-trash-alt"></i></button>
      </td>
      <td>${m.usuario || ''}</td>
      <td>${m.titulo || ''}</td>
      <td>${m.veiculo || ''}</td>
      <td>${m.descricao || ''}</td>
      <td>${m.numeroOS || ''}</td>
      <td>${formatarData(m.data)}</td>
      <td>R$ ${formatarValor(m.valor || 0)}</td>
    `;
    tabela.appendChild(linha);
  });
}

function formatarData(data) {
  if (!data) return '';
  const d = new Date(data);
  return d.toLocaleDateString('pt-BR');
}

function formatarValor(valor) {
  const v = parseFloat(valor);
  if (isNaN(v)) return '0,00';
  return v.toFixed(2).replace('.', ',');
}

// 🔗 Abrir manutenção
function abrirManutencao(id) {
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

    // 2. Preencher campos do modal
    document.getElementById('viewId').textContent = m.id;
    document.getElementById('viewData').textContent = formatarData(m.data);
    document.getElementById('viewStatus').textContent = m.status || '-';
    document.getElementById('viewFilial').textContent = m.filial || '-';
    document.getElementById('viewUsuario').textContent = m.usuario || '-';
    document.getElementById('viewVeiculo').textContent = m.veiculo || '-';
    document.getElementById('viewKm').textContent = m.km || '-';
    document.getElementById('viewMotorista').textContent = m.motorista || '-';
    document.getElementById('viewTitulo').textContent = m.titulo || '-';
    document.getElementById('viewDescricao').textContent = m.descricao || '-';
    document.getElementById('viewFornecedor').textContent = m.fornecedor || '-';
    document.getElementById('viewNotas').textContent = `NF: ${m.notaFiscal || '-'} | NFS: ${m.notaServico || '-'}`;
    
    // Calcular valor total (NF + NFS)
    const total = (parseFloat(m.valorNfe) || 0) + (parseFloat(m.valorNfse) || 0);
    document.getElementById('viewValor').textContent = `R$ ${formatarValor(total)}`;

    // 3. Buscar arquivos anexados
    const { data: arquivos } = await supabaseClient
      .from('manutencao_arquivos')
      .select('*')
      .eq('id_manutencao', id);

    const listaArquivos = document.getElementById('viewListaArquivos');
    listaArquivos.innerHTML = '';

    if (arquivos && arquivos.length > 0) {
      arquivos.forEach(arq => {
        const li = document.createElement('li');
        li.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 8px; border-bottom: 1px solid #eee; background: #f9f9f9; margin-bottom: 5px; border-radius: 4px;';
        li.innerHTML = `
            <span><i class="fas fa-file-alt"></i> ${arq.nome_arquivo}</span>
            <button onclick="downloadArquivo('${arq.caminho_arquivo}')" class="btn-icon view" title="Baixar"><i class="fas fa-download"></i></button>
        `;
        listaArquivos.appendChild(li);
      });
    } else {
      listaArquivos.innerHTML = '<li style="color: #999; font-style: italic;">Nenhum arquivo anexado.</li>';
    }

    document.getElementById('modalVisualizar').classList.remove('hidden');
    document.getElementById('modalVisualizar').style.display = 'flex';
  } catch (e) {
    console.error('Erro ao visualizar manutenção:', e);
    alert('Erro ao carregar detalhes da manutenção.');
  }
}

// �️ Excluir manutenção
async function excluirManutencao(id) {
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

// ❌ Fechar modal
window.fecharModalVisualizacao = function() {
  document.getElementById('modalVisualizar').classList.add('hidden');
  document.getElementById('modalVisualizar').style.display = 'none';
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

function setupColumnResizing() {
    const headers = document.querySelectorAll('.table-responsive th');
    
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
document.addEventListener('DOMContentLoaded', () => {
  preencherUsuarioLogado();
  carregarFiltros();
  injectVisualizarModal(); // Injeta o modal de visualização se não existir

  document.getElementById('btnBuscarManutencao').addEventListener('click', buscarManutencao);

  document.getElementById('btnExportarPDF').addEventListener('click', () => {
    alert('📄 Exportar PDF ainda não implementado.');
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

  // Fechar modal ao clicar fora
  window.addEventListener('click', (e) => {
    const modal = document.getElementById('modalVisualizar');
    if (e.target === modal) modal.classList.add('hidden');
  });

  setupColumnResizing();

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
      });
  }
});

async function setupImportModal() {
  if (document.getElementById('modalImportar')) return;

  // Carregar filiais para o select
  let optionsFiliais = '<option value="">Selecione a Filial...</option>';
  const { data: filiais } = await supabaseClient.from('filiais').select('nome, sigla').order('nome');
  if (filiais) {
      filiais.forEach(f => {
          const val = f.sigla || f.nome;
          const text = f.sigla ? `${f.nome} (${f.sigla})` : f.nome;
          optionsFiliais += `<option value="${val}">${text}</option>`;
      });
  }

  const modalHtml = `
  <div id="modalImportar" class="hidden" style="position: fixed; z-index: 9999; left: 0; top: 0; width: 100%; height: 100%; overflow: auto; background-color: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center;">
      <div class="modal-content" style="background-color: #fefefe; margin: auto; padding: 20px; border: 1px solid #888; width: 400px; max-width: 90%; border-radius: 8px; box-shadow: 0 4px 8px rgba(0,0,0,0.2); position: relative;">
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

function baixarModeloImportacao() {
    const tipo = document.getElementById('tipoImportacao').value;
    if (!tipo) {
        alert('Por favor, selecione um "Tipo de Planilha" para baixar o modelo correspondente.');
        return;
    }

    let headers = [];
    let data = [];

    if (tipo === 'ENGRAXE') {
        headers = ['TÍTULO_DA_MANUTENÇÃO', 'FORNECEDOR', 'DATA', 'PLACA', 'KM', 'OS', 'NFS-E', 'Valor_NFS-E', 'DESCRIÇÃO'];
        data = [['ENGRAXE', 'Oficina Exemplo', new Date().toLocaleDateString('pt-BR'), 'ABC1234', '10000', '123', '456', '150.00', 'Engraxe completo']];
    } else {
        headers = ['DATA', 'PLACA', 'DESCRICAO', 'VALOR', 'KM', 'FORNECEDOR', 'NF', 'FILIAL'];
        data = [[new Date().toLocaleDateString('pt-BR'), 'ABC1234', `Exemplo de ${tipo}`, '150.00', '10000', 'Oficina Exemplo', '12345', 'SP']];
    }

    const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Modelo");
    
    XLSX.writeFile(wb, `Modelo_Importacao_${tipo}.xlsx`);
}

async function handleImportSubmit(e) {
  e.preventDefault();
  const tipo = document.getElementById('tipoImportacao').value;
  const filialSelecionada = document.getElementById('filialImportacao').value;
  const fileInput = document.getElementById('arquivoImportacao');
  const anexoInput = document.getElementById('arquivoAnexoImportacao');
  const file = fileInput.files[0];
  const btnSubmit = e.target.querySelector('button[type="submit"]');

  if (!file) return;

  const originalText = btnSubmit.textContent;
  btnSubmit.disabled = true;
  btnSubmit.textContent = 'Processando...';

  const reader = new FileReader();
  reader.onload = async (ev) => {
      try {
          const data = new Uint8Array(ev.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const json = XLSX.utils.sheet_to_json(worksheet);

          if (json.length === 0) throw new Error('Planilha vazia.');

          await processarDadosImportacao(json, tipo, filialSelecionada, anexoInput.files);
          
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
      }
  };
  reader.readAsArrayBuffer(file);
}

async function processarDadosImportacao(dados, tipo, filialSelecionada, arquivosAnexo) {
  const usuarioLogado = JSON.parse(localStorage.getItem('usuarioLogado'))?.nome || 'Sistema';
  const manutencoesParaInserir = [];
  const valoresParaInserir = [];

  // Helper para limpar valores monetários (R$ 1.200,50 -> 1200.50)
  const parseCurrency = (val) => {
      if (typeof val === 'number') return val;
      if (!val) return 0;
      let str = val.toString().replace(/[R$\s]/g, ''); // Remove R$ e espaços
      // Se tiver vírgula, assume formato BR (ponto é milhar, vírgula é decimal)
      if (str.includes(',')) {
          str = str.replace(/\./g, '').replace(',', '.');
      }
      return parseFloat(str) || 0;
  };

  for (const row of dados) {
      const r = {};
      Object.keys(row).forEach(k => r[k.toUpperCase().trim()] = row[k]);

      let dataISO = new Date().toISOString();
      const dataRaw = r['DATA'] || r['DT'];
      if (dataRaw) {
           if (typeof dataRaw === 'string' && dataRaw.includes('/')) {
               const parts = dataRaw.split('/');
               if(parts.length === 3) dataISO = `${parts[2]}-${parts[1]}-${parts[0]}`;
           } else if (dataRaw instanceof Date) {
               dataISO = dataRaw.toISOString().split('T')[0];
           }
      }
      if (dataISO.includes('T')) dataISO = dataISO.split('T')[0];

      const placa = (r['PLACA'] || r['VEICULO'] || '').toUpperCase().trim();
      if (!placa) continue;

      // Mapeamento específico para Engraxe e genérico
      let titulo = r['TÍTULO_DA_MANUTENÇÃO'] || r['TITULO_DA_MANUTENCAO'] || r['TITULO'] || tipo;
      let tipoManutencao = '';
      if (tipo === 'ENGRAXE') tipoManutencao = 'PREVENTIVA';
      const fornecedor = r['FORNECEDOR'] || r['OFICINA'] || '';
      const km = r['KM'] ? String(r['KM']) : '';
      const numeroOS = r['OS'] ? String(r['OS']) : '';
      const notaServico = r['NFS-E'] || r['NFSE'] || '';
      const valorNfse = parseCurrency(r['VALOR_NFS-E'] || r['VALOR_NFSE']);
      const descricao = r['DESCRIÇÃO'] || r['DESCRICAO'] || r['SERVICO'] || r['OBS'] || `${tipo} Importado`;
      
      // Campos padrão/outros
      const valorNfe = parseCurrency(r['VALOR'] || r['TOTAL'] || r['CUSTO']);
      const notaFiscal = r['NF'] || r['NOTA'] || '';
      // Usa a filial selecionada no modal, ignorando a da planilha se houver

      manutencoesParaInserir.push({
          data: dataISO,
          veiculo: placa,
          titulo: titulo,
          tipo: tipoManutencao,
          descricao: descricao,
          valorNfe: valorNfe,
          valorNfse: valorNfse,
          km: km,
          fornecedor: fornecedor,
          notaFiscal: notaFiscal,
          notaServico: notaServico,
          numeroOS: numeroOS,
          usuario: usuarioLogado,
          status: 'finalizado',
          filial: filialSelecionada
      });
      
      valoresParaInserir.push(valorNfe + valorNfse);
  }

  if (manutencoesParaInserir.length > 0) {
      // 1. Insere as manutenções (cabeçalho)
      const { data: inserted, error } = await supabaseClient.from('manutencao').insert(manutencoesParaInserir).select();
      if (error) throw error;
      
      // 2. Prepara os itens com o valor total
      const itens = inserted.map((m, i) => ({
          id_manutencao: m.id,
          quantidade: 1,
          valor: valoresParaInserir[i]
      }));
      
      // 3. Insere os itens na tabela manutencao_itens
      const { error: errItens } = await supabaseClient.from('manutencao_itens').insert(itens);
      if (errItens) console.error("Erro ao inserir itens de valor:", errItens);

      // Processar anexo se houver
      if (arquivosAnexo && arquivosAnexo.length > 0) {
          for (const m of inserted) {
              for (let i = 0; i < arquivosAnexo.length; i++) {
                  const arquivo = arquivosAnexo[i];
                  const fileName = `${m.id}/${Date.now()}_${arquivo.name}`;
                  const { data: uploadData, error: uploadError } = await supabaseClient.storage
                      .from('manutencao_arquivos')
                      .upload(fileName, arquivo);
                  
                  if (!uploadError) {
                      await supabaseClient.from('manutencao_arquivos').insert({
                          id_manutencao: m.id,
                          nome_arquivo: arquivo.name,
                          caminho_arquivo: uploadData.path
                      });
                  } else {
                      console.error(`Erro ao enviar anexo ${arquivo.name} para manutenção ${m.id}:`, uploadError);
                  }
              }
          }
      }

      alert(`${inserted.length} registros de ${tipo} importados com sucesso!`);
  } else {
      throw new Error('Nenhum registro válido encontrado na planilha.');
  }
}

function injectVisualizarModal() {
    if (document.getElementById('modalVisualizar')) return;

    const modalHtml = `
    <div id="modalVisualizar" class="hidden" style="position: fixed; z-index: 99999; left: 0; top: 0; width: 100%; height: 100%; overflow: auto; background-color: rgba(0,0,0,0.7) !important; display: none; align-items: center; justify-content: center;">
        <div class="modal-content" style="background-color: #ffffff !important; color: #333333 !important; margin: auto; padding: 20px; border: 1px solid #ccc; width: 600px; max-width: 90%; border-radius: 8px; box-shadow: 0 5px 15px rgba(0,0,0,0.5); position: relative; max-height: 90vh; overflow-y: auto; display: block;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; border-bottom: 1px solid #eee; padding-bottom: 10px;">
                <h3 style="margin: 0; color: #333 !important; font-size: 1.25rem;">Detalhes da Manutenção #<span id="viewId"></span></h3>
                <span onclick="fecharModalVisualizacao()" style="color: #aaa; font-size: 28px; font-weight: bold; cursor: pointer;">&times;</span>
            </div>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 15px; text-align: left;">
                <div><strong style="color:#555;">Data:</strong> <span id="viewData" style="color:#333;"></span></div>
                <div><strong style="color:#555;">Status:</strong> <span id="viewStatus" style="font-weight:bold;"></span></div>
                <div><strong style="color:#555;">Filial:</strong> <span id="viewFilial"></span></div>
                <div><strong style="color:#555;">Usuário:</strong> <span id="viewUsuario"></span></div>
                <div><strong style="color:#555;">Veículo:</strong> <span id="viewVeiculo" style="font-weight:bold;"></span></div>
                <div><strong style="color:#555;">KM:</strong> <span id="viewKm"></span></div>
                <div><strong style="color:#555;">Motorista:</strong> <span id="viewMotorista"></span></div>
                <div><strong style="color:#555;">Valor Total:</strong> <span id="viewValor" style="color:#28a745; font-weight:bold;"></span></div>
            </div>

            <div style="margin-bottom: 15px; text-align: left;">
                <strong style="color:#555;">Título:</strong>
                <div id="viewTitulo" style="background:#f9f9f9; padding:8px; border-radius:4px; margin-top:5px; border: 1px solid #eee;"></div>
            </div>

            <div style="margin-bottom: 15px; text-align: left;">
                <strong style="color:#555;">Descrição:</strong>
                <div id="viewDescricao" style="background:#f9f9f9; padding:8px; border-radius:4px; margin-top:5px; white-space: pre-wrap; border: 1px solid #eee;"></div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr; gap: 10px; margin-bottom: 15px; background: #fff3cd; padding: 10px; border-radius: 4px; border: 1px solid #ffeeba; text-align: left;">
                <div><strong style="color:#856404;">Fornecedor:</strong> <span id="viewFornecedor" style="color:#856404;"></span></div>
                <div><strong style="color:#856404;">Notas Fiscais:</strong> <span id="viewNotas" style="color:#856404;"></span></div>
            </div>

            <div style="margin-bottom: 15px; text-align: left;">
                <strong style="color:#555;">Anexos:</strong>
                <ul id="viewListaArquivos" style="list-style: none; padding: 0; margin-top: 5px;"></ul>
            </div>

            <div style="text-align: right; border-top: 1px solid #eee; padding-top: 15px;">
                <button onclick="fecharModalVisualizacao()" style="padding: 10px 20px; background-color: #6c757d !important; color: white !important; border: none; border-radius: 4px; cursor: pointer; font-size: 14px;">Fechar</button>
            </div>
        </div>
    </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}
