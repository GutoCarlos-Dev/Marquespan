import { supabaseClient } from './supabase.js';
import XLSX from "https://cdn.sheetjs.com/xlsx-0.20.2/package/xlsx.mjs";
// 📦 Importação do Supabase

// Estado dos arquivos
let veiculosCache = []; // Cache para busca rápida de modelo
let arquivosParaUpload = []; // Novos arquivos (File objects)
let arquivosExistentes = []; // Arquivos já salvos no banco ({nome, path})
let listaFornecedoresCache = []; // Cache para busca rápida no modal
let fornecedoresGridData = []; // Dados originais para o grid da aba
let fornecedoresSort = { field: 'nome', asc: true };
let fornecedorTabEditingId = null;
let titulosGridData = []; // Dados originais para o grid da aba títulos
let titulosSort = { field: 'titulo', asc: true };
let tituloTabEditingId = null;

// 🔀 Alternância de painéis internos
function mostrarPainelInterno(id) {
  document.querySelectorAll('.painel-conteudo').forEach(div => {
    div.classList.add('hidden');
    div.classList.remove('fade-in');
  });

  const painel = document.getElementById(id);
  if (painel) {
    painel.classList.remove('hidden');
    requestAnimationFrame(() => painel.classList.add('fade-in'));
  }

  document.querySelectorAll('.painel-btn').forEach(btn => {
    btn.classList.remove('active');
    btn.setAttribute('aria-selected', 'false');
  });

  const btnAtivo = document.querySelector(`.painel-btn[data-painel="${id}"]`);
  if (btnAtivo) {
    btnAtivo.classList.add('active');
    btnAtivo.setAttribute('aria-selected', 'true');
  }

  // Carrega dados específicos da aba se necessário
  if (id === 'abaFornecedores') {
      carregarTabelaFornecedores();
  } else if (id === 'abaTitulos') {
      carregarTabelaTitulos();
  }
}

function getUserLevel() {
    const usuario = JSON.parse(localStorage.getItem('usuarioLogado'));
    return usuario ? (usuario.nivel || '').toLowerCase() : null;
}

function canDelete() {
    const nivel = getUserLevel();
    return nivel === 'administrador' || nivel === 'gerencia';
}

// 👤 Preencher campo de usuário logado
function preencherUsuarioLogado() {
  const usuario = JSON.parse(localStorage.getItem('usuarioLogado'));
  if (usuario?.nome) {
    const inputUsuario = document.getElementById('usuarioLogado');
    if (inputUsuario) inputUsuario.value = usuario.nome;

    const divUsuario = document.getElementById('usuario-logado');
    if (divUsuario) divUsuario.textContent = `👤 Olá, ${usuario.nome}`;
  }
}

// 🔧 Carregamento de dados dinâmicos
async function carregarPlacas() {
  const { data, error } = await supabaseClient.from('veiculos').select('placa, modelo');
  const lista = document.getElementById('listaPlacas');
  if (error) return console.error('Erro ao carregar placas:', error);
  
  veiculosCache = data || []; // Armazena placas e modelos no cache

  lista.innerHTML = '';
  data?.forEach(v => v.placa && lista.appendChild(new Option(v.placa)));
}

/**
 * Preenche o campo de modelo do veículo com base na placa selecionada.
 */
function preencherModeloVeiculo() {
    const placaInput = document.getElementById('veiculo');
    const modeloInput = document.getElementById('modeloVeiculo'); // O novo campo de modelo
    if (!placaInput || !modeloInput) return;

    const placaSelecionada = placaInput.value;
    const veiculo = veiculosCache.find(v => v.placa === placaSelecionada);

    modeloInput.value = veiculo ? (veiculo.modelo || '') : '';
}

async function carregarFiliais() {
  const { data, error } = await supabaseClient.from('filiais').select('nome, sigla').order('nome');
  if (error) return console.error('Erro ao carregar filiais:', error);
  
  const selects = ['filial', 'tabFornFilial', 'modalFornFilial', 'tabTituloFilial'];
  selects.forEach(id => {
      const select = document.getElementById(id);
      if (select) {
          select.innerHTML = '<option value="">Selecione</option>';
          data?.forEach(f => {
              const val = f.sigla || f.nome;
              const text = f.sigla ? `${f.nome} (${f.sigla})` : f.nome;
              select.appendChild(new Option(text, val));
          });
      }
  });
}

async function carregarTitulosManutencao() {
  const { data, error } = await supabaseClient.from('titulo_manutencao').select('titulo').order('titulo');
  const lista = document.getElementById('listaTitulos');
  if (error) return console.error('Erro ao carregar títulos:', error);
  lista.innerHTML = '';
  data?.forEach(item => item.titulo && lista.appendChild(new Option(item.titulo)));
}

async function carregarFornecedores() {
  const { data, error } = await supabaseClient.from('fornecedor_manutencao').select('nome, cnpj').order('nome');
  const lista = document.getElementById('listaFornecedores');
  if (error) return console.error('Erro ao carregar fornecedores:', error);
  lista.innerHTML = '';
  listaFornecedoresCache = data || [];
  listaFornecedoresCache.forEach(f => {
    if (f.nome) {
      // Exibe Nome e CNPJ na lista de sugestões para facilitar a diferenciação
      const displayValue = f.cnpj ? `${f.nome} (CNPJ: ${f.cnpj})` : f.nome;
      lista.appendChild(new Option(displayValue));
    }
  });
}

// 💰 Calcular Total Fiscal
function calcularTotalFiscal() {
  const vlrNfe = parseFloat(document.getElementById('valorNfe').value.replace(',', '.')) || 0;
  const vlrNfse = parseFloat(document.getElementById('valorNfse').value.replace(',', '.')) || 0;
  const total = vlrNfe + vlrNfse;
  const inputTotal = document.getElementById('valorTotalFiscal');
  if (inputTotal) inputTotal.value = total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// � Carregar dados da manutenção para edição
async function carregarManutencaoParaEdicao(id) {
  try {
    // 1. Buscar dados principais da manutenção
    const { data: manutencao, error: manutencaoError } = await supabaseClient
      .from('manutencao')
      .select('*')
      .eq('id', id)
      .single();

    if (manutencaoError || !manutencao) {
      throw new Error('Manutenção não encontrada ou erro ao carregar.');
    }

    // 2. Preencher os campos do formulário
    document.getElementById('idManutencao').value = manutencao.id;
    document.getElementById('idManutencaoDisplay').textContent = manutencao.id;
    document.getElementById('usuarioLogado').value = manutencao.usuario;
    document.getElementById('status').value = manutencao.status;
    document.getElementById('filial').value = manutencao.filial;
    document.getElementById('titulo').value = manutencao.titulo;
    document.getElementById('tipoManutencao').value = manutencao.tipo || '';
    document.getElementById('data').value = manutencao.data ? manutencao.data.split('T')[0] : '';
    document.getElementById('veiculo').value = manutencao.veiculo;
    
    // Preenche o modelo do veículo ao carregar para edição
    preencherModeloVeiculo();
    document.getElementById('km').value = manutencao.km;
    document.getElementById('motorista').value = manutencao.motorista;
    document.getElementById('fornecedor').value = manutencao.fornecedor;
    document.getElementById('notaFiscal').value = manutencao.notaFiscal;
    document.getElementById('valorNfe').value = manutencao.valorNfe || '';
    document.getElementById('notaServico').value = manutencao.notaServico;
    document.getElementById('valorNfse').value = manutencao.valorNfse || '';
    calcularTotalFiscal();
    document.getElementById('numeroOS').value = manutencao.numeroOS;
    document.getElementById('descricao').value = manutencao.descricao;

    // 3. Carregar arquivos anexados
    const { data: arquivos, error: arquivosError } = await supabaseClient
      .from('manutencao_arquivos')
      .select('*')
      .eq('id_manutencao', id);

    if (!arquivosError && arquivos) {
        arquivosExistentes = arquivos.map(a => ({ nome: a.nome_arquivo, path: a.caminho_arquivo }));
        renderizarListaArquivos();
    }

    // 4. Mudar o texto do botão para "Atualizar"
    document.getElementById('btnSalvarManutencao').textContent = '🔄 Atualizar Manutenção';
  } catch (error) { console.error('Erro ao carregar manutenção para edição:', error); alert('Não foi possível carregar os dados da manutenção. Você será redirecionado.'); window.location.href = 'buscar-manutencao.html'; }
}

// 💾 Salvar manutenção principal
async function salvarManutencao() {
  const idManutencao = document.getElementById('idManutencao').value;

  const dados = {
    usuario: document.getElementById('usuarioLogado').value,
    status: document.getElementById('status').value,
    filial: document.getElementById('filial').value,
    titulo: document.getElementById('titulo').value,
    data: document.getElementById('data').value,
    tipo: document.getElementById('tipoManutencao').value,
    veiculo: document.getElementById('veiculo').value,
    km: parseInt(document.getElementById('km').value.replace(/\D/g, '')) || null,
    motorista: document.getElementById('motorista').value,
    fornecedor: document.getElementById('fornecedor').value,
    notaFiscal: document.getElementById('notaFiscal').value,
    valorNfe: parseFloat(document.getElementById('valorNfe').value.replace(',', '.')) || 0,
    notaServico: document.getElementById('notaServico').value,
    valorNfse: parseFloat(document.getElementById('valorNfse').value.replace(',', '.')) || 0,
    numeroOS: document.getElementById('numeroOS').value,
    descricao: document.getElementById('descricao').value
  };

  if (!dados.status || !dados.veiculo || !dados.data) {
    alert('⚠️ Preencha os campos obrigatórios: Status, Placa e Data.');
    return;
  }

  let resultado;
  if (idManutencao) {
    // Modo de atualização
    resultado = await supabaseClient.from('manutencao').update(dados).eq('id', idManutencao).select();
  } else {
    // Modo de inserção
    resultado = await supabaseClient.from('manutencao').insert([dados]).select();
  }

  const { data, error } = resultado;

  if (error) {
    console.error('Erro ao salvar manutenção:', error);
    alert(`❌ Erro ao ${idManutencao ? 'atualizar' : 'salvar'} manutenção.`);
    return;
  }

  const novoIdManutencao = data[0].id;
  document.getElementById('idManutencao').value = novoIdManutencao;
  document.getElementById('idManutencaoDisplay').textContent = novoIdManutencao;

  // Salvar Arquivos
  await salvarArquivosManutencao(novoIdManutencao);

  alert(`✅ Manutenção ${idManutencao ? 'atualizada' : 'salva'} com sucesso!`);
  // Recarrega a página ou limpa o form
  if (!idManutencao) {
      // Se for novo, limpa respeitando os campos fixados
      limparFormularioInteligente();
      arquivosParaUpload = [];
      arquivosExistentes = [];
      renderizarListaArquivos();
      preencherUsuarioLogado();
  } else {
      window.location.href = 'buscar-manutencao.html';
  }
}

// 📌 Lógica de Campos Fixos
const MAPA_CAMPOS = {
    'status': 'Status',
    'filial': 'Filial',
    'tipoManutencao': 'Tipo',
    'titulo': 'Título',
    'data': 'Data',
    'veiculo': 'Placa',
    'km': 'KM',
    'motorista': 'Motorista',
    'fornecedor': 'Fornecedor',
    'notaFiscal': 'NF-E',
    'valorNfe': 'Valor NF-E',
    'notaServico': 'NFS-E',
    'valorNfse': 'Valor NFS-E',
    'numeroOS': 'Número OS',
    'descricao': 'Descrição'
};

function abrirModalConfigurarCampos() {
    const modal = document.getElementById('modalConfigurarCampos');
    const container = document.getElementById('listaCamposFixos');
    const camposSalvos = JSON.parse(localStorage.getItem('manutencao_campos_fixos') || '[]');
    
    container.innerHTML = '';
    
    Object.entries(MAPA_CAMPOS).forEach(([id, label]) => {
        const div = document.createElement('div');
        div.style.display = 'flex';
        div.style.alignItems = 'center';
        div.style.gap = '8px';
        
        const checked = camposSalvos.includes(id) ? 'checked' : '';
        
        div.innerHTML = `
            <input type="checkbox" id="chk_fix_${id}" value="${id}" ${checked} style="width: auto;">
            <label for="chk_fix_${id}" style="margin: 0; cursor: pointer;">${label}</label>
        `;
        container.appendChild(div);
    });
    
    modal.classList.remove('hidden');
}

function fecharModalConfigurarCampos() {
    document.getElementById('modalConfigurarCampos').classList.add('hidden');
}

function salvarConfiguracaoCampos() {
    const checkboxes = document.querySelectorAll('#listaCamposFixos input[type="checkbox"]:checked');
    const selecionados = Array.from(checkboxes).map(cb => cb.value);
    
    localStorage.setItem('manutencao_campos_fixos', JSON.stringify(selecionados));
    alert('Preferências salvas! Os campos selecionados não serão limpos após salvar um novo lançamento.');
    fecharModalConfigurarCampos();
}

function limparFormularioInteligente() {
    const camposFixos = JSON.parse(localStorage.getItem('manutencao_campos_fixos') || '[]');
    
    Object.keys(MAPA_CAMPOS).forEach(id => {
        if (!camposFixos.includes(id)) {
            const el = document.getElementById(id);
            if (el) el.value = '';
        }
    });
    
    // Limpa o campo de modelo se o campo de placa não for fixo
    const modeloInput = document.getElementById('modeloVeiculo');
    if (modeloInput && !camposFixos.includes('veiculo')) modeloInput.value = '';

    // Recalcula totais caso valores tenham sido limpos
    calcularTotalFiscal();
}

//  Lógica de Arquivos
function abrirModalAnexo() {
    document.getElementById('modalAnexo').classList.remove('hidden');
    document.getElementById('inputArquivoAnexo').value = '';
    document.getElementById('arquivoAnexoLabel').textContent = 'Clique ou arraste o arquivo aqui';
}

function fecharModalAnexo() {
    document.getElementById('modalAnexo').classList.add('hidden');
}

function handleFileSelect(e) {
    const files = e.target.files;
    if (files.length > 0) {
        const label = files.length === 1 ? files[0].name : `${files.length} arquivos selecionados`;
        document.getElementById('arquivoAnexoLabel').textContent = label;
    }
}

function confirmarAnexo() {
    const input = document.getElementById('inputArquivoAnexo');
    if (input.files.length > 0) {
        Array.from(input.files).forEach(file => {
            arquivosParaUpload.push(file);
        });
        renderizarListaArquivos();
        fecharModalAnexo();
    }
}

function renderizarListaArquivos() {
    const container = document.getElementById('listaArquivosAnexados');
    container.innerHTML = '';

    // Renderiza arquivos existentes (Banco)
    arquivosExistentes.forEach((arq, index) => {
        const div = document.createElement('div');
        div.className = 'glass-panel-inner'; // Reusa estilo de card leve
        div.style.padding = '10px';
        div.style.marginBottom = '5px';
        div.style.display = 'flex';
        div.style.justifyContent = 'space-between';
        div.style.alignItems = 'center';
        
        div.innerHTML = `
            <span><i class="fas fa-file-alt"></i> ${arq.nome}</span>
            <div>
                <button type="button" class="btn-icon" onclick="downloadArquivo('${arq.path}')" title="Baixar"><i class="fas fa-download"></i></button>
                <button type="button" class="btn-icon delete" onclick="removerArquivoExistente(${index})" title="Remover"><i class="fas fa-trash"></i></button>
            </div>
        `;
        container.appendChild(div);
    });

    // Renderiza novos arquivos (Upload pendente)
    arquivosParaUpload.forEach((file, index) => {
        const div = document.createElement('div');
        div.className = 'glass-panel-inner';
        div.style.padding = '10px';
        div.style.marginBottom = '5px';
        div.style.display = 'flex';
        div.style.justifyContent = 'space-between';
        div.style.alignItems = 'center';
        div.style.borderLeft = '4px solid #28a745'; // Marca verde para novos

        div.innerHTML = `
            <span><i class="fas fa-file-upload"></i> ${file.name} (Novo)</span>
            <button type="button" class="btn-icon delete" onclick="removerArquivoNovo(${index})" title="Remover"><i class="fas fa-trash"></i></button>
        `;
        container.appendChild(div);
    });
}

async function downloadArquivo(path) {
    const { data, error } = await supabaseClient.storage.from('manutencao_arquivos').createSignedUrl(path, 60);
    if (error) {
        console.error('Erro ao gerar link:', error);
        alert('Erro ao baixar arquivo. Verifique se o arquivo existe.');
        return;
    }
    window.open(data.signedUrl, '_blank');
}

window.removerArquivoNovo = (index) => {
    arquivosParaUpload.splice(index, 1);
    renderizarListaArquivos();
};

window.removerArquivoExistente = (index) => {
    if(confirm('Remover este anexo? A exclusão será efetivada ao salvar.')) {
        arquivosExistentes.splice(index, 1);
        renderizarListaArquivos();
    }
};

async function salvarArquivosManutencao(idManutencao) {
    // 1. Upload de novos arquivos
    const novosRegistros = [];
    
    for (const file of arquivosParaUpload) {
        const fileName = `${idManutencao}/${Date.now()}_${file.name}`;
        const { data, error } = await supabaseClient.storage
            .from('manutencao_arquivos')
            .upload(fileName, file);
        
        if (error) {
            console.error('Erro no upload:', error);
            alert(`Erro ao enviar arquivo ${file.name}: ${error.message}`);
        } else {
            novosRegistros.push({
                id_manutencao: idManutencao,
                nome_arquivo: file.name,
                caminho_arquivo: data.path
            });
        }
    }

    // 2. Atualizar tabela de arquivos (Remove tudo e insere o estado atual)
    // Nota: Isso mantém os arquivos físicos no Storage mesmo se removidos da lista, 
    // para limpeza real seria necessário deletar do storage também.
    
    // Remove referências antigas
    const { error: deleteError } = await supabaseClient.from('manutencao_arquivos').delete().eq('id_manutencao', idManutencao);
    if (deleteError) console.error('Erro ao limpar referências antigas:', deleteError);

    // Prepara lista final (Existentes + Novos)
    const listaFinal = [
        ...arquivosExistentes.map(a => ({ id_manutencao: idManutencao, nome_arquivo: a.nome, caminho_arquivo: a.path })),
        ...novosRegistros
    ];

    if (listaFinal.length > 0) {
        const { error } = await supabaseClient.from('manutencao_arquivos').insert(listaFinal);
        if (error) {
            console.error('Erro ao salvar metadados dos arquivos:', error);
            alert('Erro ao salvar referência do arquivo no banco: ' + (error.message || JSON.stringify(error)));
        }
    }

    // Limpa lista de upload após salvar
    arquivosParaUpload = [];
    // Recarrega lista de existentes com o que acabou de ser salvo
    arquivosExistentes = listaFinal.map(a => ({ nome: a.nome_arquivo, path: a.caminho_arquivo }));
    renderizarListaArquivos();
}

// ️ Modais
function abrirModalTitulo() { document.getElementById('modalTitulo').classList.remove('hidden'); }
function fecharModalTitulo() { document.getElementById('modalTitulo').classList.add('hidden'); }

async function salvarTitulo() {
  const titulo = document.getElementById('novoTitulo').value.trim();
  if (!titulo) return;

  const { error } = await supabaseClient.from('titulo_manutencao').insert([{ titulo: titulo }]);
  if (error) {
    console.error('Erro ao salvar título:', error);
    alert('❌ Erro ao salvar título.');
    return;
  }

  const lista = document.getElementById('listaTitulos');
  lista.appendChild(new Option(titulo));
  document.getElementById('titulo').value = titulo;
  document.getElementById('novoTitulo').value = '';
  alert('✅ Título cadastrado com sucesso!');
  fecharModalTitulo();
}

// 🗂️ Modal de Fornecedor
function abrirModalFornecedor() { 
    document.getElementById('novoFornecedor').value = '';
    const cnpjInput = document.getElementById('modalFornCnpj');
    if (cnpjInput) cnpjInput.value = '';
    const telInput = document.getElementById('modalFornTelefone');
    if (telInput) telInput.value = '';
    const filialInput = document.getElementById('modalFornFilial');
    if (filialInput) filialInput.value = '';
    document.getElementById('obsFornecedor').value = '';
    document.getElementById('modalFornecedor').classList.remove('hidden'); 
    document.getElementById('resultadoBuscaFornecedor').style.display = 'none';
}
function fecharModalFornecedor() { document.getElementById('modalFornecedor').classList.add('hidden'); }

async function salvarFornecedor() {
  const nome = document.getElementById('novoFornecedor').value.trim();
  const cnpj = document.getElementById('modalFornCnpj')?.value.trim();
  const telefone = document.getElementById('modalFornTelefone')?.value.trim();
  const filial = document.getElementById('modalFornFilial')?.value;
  const obsFornecedor = document.getElementById('obsFornecedor').value.trim();
  if (!nome) return;

  const { error } = await supabaseClient.from('fornecedor_manutencao').insert([{ 
      nome: nome, 
      cnpj: cnpj,
      telefone: telefone,
      filial: filial,
      observacao: obsFornecedor 
  }]);
  if (error) {
    console.error('Erro ao salvar fornecedor:', error);
    alert('❌ Erro ao salvar fornecedor.');
    return;
  }

  const lista = document.getElementById('listaFornecedores');
  lista.appendChild(new Option(nome));
  listaFornecedoresCache.push({ nome: nome }); // Atualiza o cache local
  document.getElementById('fornecedor').value = nome;
  document.getElementById('novoFornecedor').value = '';
  if (document.getElementById('modalFornCnpj')) document.getElementById('modalFornCnpj').value = '';
  if (document.getElementById('modalFornTelefone')) document.getElementById('modalFornTelefone').value = '';
  if (document.getElementById('modalFornFilial')) document.getElementById('modalFornFilial').value = '';
  document.getElementById('obsFornecedor').value = '';
  document.getElementById('resultadoBuscaFornecedor').style.display = 'none';
  alert('✅ Fornecedor cadastrado com sucesso!');
  fecharModalFornecedor();
}

function handleBuscaFornecedorModal(e) {
    const termo = e.target.value.toLowerCase();
    const container = document.getElementById('resultadoBuscaFornecedor');
    container.innerHTML = '';
    
    if (termo.length < 2) {
        container.style.display = 'none';
        return;
    }

    const resultados = listaFornecedoresCache.filter(f => (f.nome || f.fornecedor).toLowerCase().includes(termo));
    
    if (resultados.length > 0) {
        container.style.display = 'block';
        const titulo = document.createElement('div');
        titulo.style.cssText = 'padding: 5px; font-size: 0.8em; color: #888; background: #f9f9f9; border-bottom: 1px solid #eee;';
        titulo.textContent = 'Fornecedores similares encontrados:';
        container.appendChild(titulo);

        resultados.forEach(f => {
            const div = document.createElement('div');
            div.style.cssText = 'padding: 8px; border-bottom: 1px solid #eee; font-size: 0.9em; color: #333;';
            div.textContent = f.cnpj ? `${f.nome || f.fornecedor} - CNPJ: ${f.cnpj}` : (f.nome || f.fornecedor);
            if (f.cnpj) div.title = `CNPJ do Fornecedor: ${f.cnpj}`; // Exibe CNPJ ao passar o mouse
            container.appendChild(div);
        });
    } else {
        container.style.display = 'none';
    }
}

// --- LÓGICA DAS NOVAS ABAS ---

// Fornecedores
async function carregarTabelaFornecedores() {
    try {
        const { data, error } = await supabaseClient.from('fornecedor_manutencao').select('*');
        if (error) throw error;
        fornecedoresGridData = data || [];
        renderTabelaFornecedores();
    } catch (error) {
        console.error('Erro ao carregar fornecedores:', error);
    }
}

function renderTabelaFornecedores() {
    const tbody = document.getElementById('tabelaFornecedoresTab');
    if (!tbody) return;

    const searchTerm = document.getElementById('searchFornecedorTab')?.value.toLowerCase() || '';
    const userCanDelete = canDelete();

    // Filtragem
    let filtered = fornecedoresGridData.filter(f => 
        (f.nome || '').toLowerCase().includes(searchTerm) || 
        (f.cnpj || '').toLowerCase().includes(searchTerm)
    );

    // Ordenação
    filtered.sort((a, b) => {
        let valA = a[fornecedoresSort.field] || '';
        let valB = b[fornecedoresSort.field] || '';
        const comparison = String(valA).localeCompare(String(valB), undefined, { numeric: true });
        return fornecedoresSort.asc ? comparison : -comparison;
    });

    tbody.innerHTML = '';
    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 20px;">Nenhum fornecedor encontrado.</td></tr>';
        return;
    }

    filtered.forEach(f => {
        const tr = document.createElement('tr');
        const btnExcluir = userCanDelete ? `<button class="btn-icon delete" onclick="excluirFornecedorTab('${f.id}')" title="Excluir"><i class="fas fa-trash"></i></button>` : '';
        const btnEditar = `<button class="btn-icon edit" onclick="editarFornecedorTab('${f.id}')" style="color: #007bff;" title="Editar"><i class="fas fa-edit"></i></button>`;
        
        tr.innerHTML = `
            <td>${f.nome}</td>
            <td>${f.cnpj || '-'}</td>
            <td>${f.telefone || '-'}</td>
            <td>${f.filial || '-'}</td>
            <td style="text-align:center; display: flex; gap: 8px; justify-content: center;">${btnEditar} ${btnExcluir}</td>
        `;
        tbody.appendChild(tr);
    });

    // Atualiza ícones de ordenação
    document.querySelectorAll('.sortable-forn i').forEach(i => i.className = 'fas fa-sort');
    const activeIcon = document.querySelector(`.sortable-forn[data-field="${fornecedoresSort.field}"] i`);
    if (activeIcon) activeIcon.className = fornecedoresSort.asc ? 'fas fa-sort-up' : 'fas fa-sort-down';
}

window.editarFornecedorTab = (id) => {
    const forn = fornecedoresGridData.find(f => f.id == id);
    if (!forn) return;

    fornecedorTabEditingId = id;
    document.getElementById('tabFornNome').value = forn.nome || '';
    document.getElementById('tabFornCnpj').value = forn.cnpj || '';
    document.getElementById('tabFornTelefone').value = forn.telefone || '';
    document.getElementById('tabFornFilial').value = forn.filial || '';

    const btn = document.querySelector('button[onclick="salvarFornecedorTab()"]');
    if (btn) btn.innerHTML = '<i class="fas fa-sync"></i> Atualizar Fornecedor';
    document.getElementById('tabFornNome').focus();
};

async function salvarFornecedorTab() {
    const nome = document.getElementById('tabFornNome').value.trim();
    const cnpj = document.getElementById('tabFornCnpj').value.trim();
    const telefone = document.getElementById('tabFornTelefone').value.trim();
    const filial = document.getElementById('tabFornFilial').value;
    
    if (!nome) return alert('Nome é obrigatório');
    
    let error;
    if (fornecedorTabEditingId) {
        const { error: err } = await supabaseClient.from('fornecedor_manutencao').update({ nome, cnpj, telefone, filial }).eq('id', fornecedorTabEditingId);
        error = err;
    } else {
        const { error: err } = await supabaseClient.from('fornecedor_manutencao').insert([{ nome, cnpj, telefone, filial }]);
        error = err;
    }

    if (error) return alert('Erro ao salvar: ' + error.message);
    
    fornecedorTabEditingId = null;
    const btn = document.querySelector('button[onclick="salvarFornecedorTab()"]');
    if (btn) btn.innerHTML = '<i class="fas fa-plus"></i> Adicionar Fornecedor';

    document.getElementById('tabFornNome').value = '';
    document.getElementById('tabFornCnpj').value = '';
    document.getElementById('tabFornTelefone').value = '';
    document.getElementById('tabFornFilial').value = '';
    carregarTabelaFornecedores();
    carregarFornecedores(); // Atualiza o datalist principal
}

async function excluirFornecedorTab(id) {
    if (!confirm('Excluir fornecedor?')) return;
    const { error } = await supabaseClient.from('fornecedor_manutencao').delete().eq('id', id);
    if (error) return alert('Erro ao excluir');
    carregarTabelaFornecedores();
    carregarFornecedores();
}

async function handleImportarFornecedores(e) {
    const file = e.target.files[0];
    if (!file) return;

    try {
        // 1. Carregar Filiais para o usuário escolher
        const { data: filiais, error: errF } = await supabaseClient.from('filiais').select('nome, sigla').order('nome');
        if (errF) throw errF;

        const opcoes = filiais.map(f => f.sigla || f.nome);
        const escolha = prompt(`Escolha a Filial para realizar a importação:\nOpções: ${opcoes.join(', ')}`);

        if (!escolha) return; 
        const filialSinc = escolha.toUpperCase().trim();

        if (!opcoes.map(o => o.toUpperCase()).includes(filialSinc)) {
            alert('Filial inválida. Por favor, utilize uma das siglas exibidas.');
            return;
        }

        const reader = new FileReader();
        reader.onload = async (evt) => {
            try {
                const data = new Uint8Array(evt.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const sheet = workbook.Sheets[workbook.SheetNames[0]];
                const json = XLSX.utils.sheet_to_json(sheet);

                if (json.length === 0) throw new Error('A planilha está vazia.');

                const payloads = json.map(row => {
                    const r = {};
                    Object.keys(row).forEach(k => r[k.toUpperCase().trim()] = row[k]);
                    return {
                        nome: r['NOME'] || r['FORNECEDOR'],
                        cnpj: r['CNPJ'] ? String(r['CNPJ']) : null,
                        telefone: r['TELEFONE'] ? String(r['TELEFONE']) : null,
                        filial: filialSinc
                    };
                }).filter(p => p.nome);

                if (payloads.length === 0) throw new Error('Nenhum fornecedor válido (com nome) encontrado.');

                const { error } = await supabaseClient.from('fornecedor_manutencao').insert(payloads);
                if (error) throw error;

                alert(`✅ Importação concluída! ${payloads.length} fornecedores inseridos para a filial ${filialSinc}.`);
                carregarTabelaFornecedores();
                carregarFornecedores();
            } catch (err) {
                console.error(err);
                alert('Erro ao processar planilha: ' + err.message);
            }
        };
        reader.readAsArrayBuffer(file);
    } catch (err) {
        console.error(err);
        alert('Erro ao carregar lista de filiais.');
    } finally {
        e.target.value = '';
    }
}

// Títulos
async function carregarTabelaTitulos() {
    try {
        const { data, error } = await supabaseClient.from('titulo_manutencao').select('*');
        if (error) throw error;
        titulosGridData = data || [];
        renderTabelaTitulos();
    } catch (error) {
        console.error('Erro ao carregar títulos:', error);
    }
}

function renderTabelaTitulos() {
    const tbody = document.getElementById('tabelaTitulosTab');
    if (!tbody) return;

    const searchTerm = document.getElementById('searchTituloTab')?.value.toLowerCase() || '';
    const userCanDelete = canDelete();

    // Filtragem
    let filtered = titulosGridData.filter(t => 
        (t.titulo || '').toLowerCase().includes(searchTerm)
    );

    // Ordenação
    filtered.sort((a, b) => {
        let valA = a[titulosSort.field] || '';
        let valB = b[titulosSort.field] || '';
        const comparison = String(valA).localeCompare(String(valB), undefined, { numeric: true });
        return titulosSort.asc ? comparison : -comparison;
    });

    tbody.innerHTML = '';
    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="2" style="text-align:center; padding: 20px;">Nenhum título encontrado.</td></tr>';
        return;
    }

    filtered.forEach(t => {
        const tr = document.createElement('tr');
        const btnExcluir = userCanDelete ? `<button class="btn-icon delete" onclick="excluirTituloTab('${t.id}')" title="Excluir"><i class="fas fa-trash"></i></button>` : '';
        const btnEditar = `<button class="btn-icon edit" onclick="editarTituloTab('${t.id}')" style="color: #007bff;" title="Editar"><i class="fas fa-edit"></i></button>`;

        tr.innerHTML = `
            <td>${t.titulo}</td>
            <td>${t.filial || '-'}</td>
            <td style="text-align:center; display: flex; gap: 8px; justify-content: center;">${btnEditar} ${btnExcluir}</td>
        `;
        tbody.appendChild(tr);
    });

    // Atualiza ícones de ordenação
    document.querySelectorAll('.sortable-tit i').forEach(i => i.className = 'fas fa-sort');
    const activeIcon = document.querySelector(`.sortable-tit[data-field="${titulosSort.field}"] i`);
    if (activeIcon) activeIcon.className = titulosSort.asc ? 'fas fa-sort-up' : 'fas fa-sort-down';
}

window.editarTituloTab = (id) => {
    const tit = titulosGridData.find(t => t.id == id);
    if (!tit) return;

    tituloTabEditingId = id;
    document.getElementById('tabTituloNome').value = tit.titulo || '';
    document.getElementById('tabTituloFilial').value = tit.filial || '';

    const btn = document.querySelector('button[onclick="salvarTituloTab()"]');
    if (btn) {
        btn.innerHTML = '<i class="fas fa-sync"></i> Atualizar Título';
        btn.classList.remove('btn-green');
        btn.classList.add('btn-blue');
    }
    
    // Foco e scroll para o campo de edição
    const input = document.getElementById('tabTituloNome');
    input.focus();
    input.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function salvarTituloTab() {
    const titulo = document.getElementById('tabTituloNome').value.trim();
    const filial = document.getElementById('tabTituloFilial').value;
    if (!titulo) return alert('Título é obrigatório');
    
    let error;
    if (tituloTabEditingId) {
        const { error: err } = await supabaseClient.from('titulo_manutencao').update({ titulo, filial }).eq('id', tituloTabEditingId);
        error = err;
    } else {
        const { error: err } = await supabaseClient.from('titulo_manutencao').insert([{ titulo, filial }]);
        error = err;
    }

    if (error) return alert('Erro ao salvar: ' + error.message);
    
    tituloTabEditingId = null;
    const btn = document.querySelector('button[onclick="salvarTituloTab()"]');
    if (btn) {
        btn.innerHTML = '<i class="fas fa-plus"></i> Adicionar Título';
        btn.classList.remove('btn-blue');
        btn.classList.add('btn-green');
    }

    document.getElementById('tabTituloNome').value = '';
    document.getElementById('tabTituloFilial').value = '';
    carregarTabelaTitulos();
    carregarTitulosManutencao(); // Atualiza o datalist principal
}

async function excluirTituloTab(id) {
    if (!confirm('Excluir título?')) return;
    const { error } = await supabaseClient.from('titulo_manutencao').delete().eq('id', id);
    if (error) return alert('Erro ao excluir');
    carregarTabelaTitulos();
    carregarTitulosManutencao();
}

// 🚀 Inicialização da página
document.addEventListener('DOMContentLoaded', () => {
  // --- CORREÇÃO DE ESTILO E COMPORTAMENTO DAS ABAS ---
  // Garante que as abas secundárias tenham as classes necessárias para alinhamento (glass-panel)
  // e para a lógica de alternância (painel-conteudo) funcionar corretamente.
  ['abaFornecedores', 'abaTitulos', 'cadastroInterno'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
          el.classList.add('painel-conteudo');
          if (id !== 'cadastroInterno') el.classList.add('glass-panel'); // Aplica o estilo visual de card
      }
  });

  preencherUsuarioLogado();
  carregarPlacas();
  carregarFiliais();
  carregarTitulosManutencao();
  carregarFornecedores();

  // Listener Importação Fornecedores
  const btnImportarFornecedores = document.getElementById('btnImportarFornecedores');
  const fileImportarFornecedores = document.getElementById('fileImportarFornecedores');
  if (btnImportarFornecedores && fileImportarFornecedores) {
      btnImportarFornecedores.addEventListener('click', () => fileImportarFornecedores.click());
      fileImportarFornecedores.addEventListener('change', handleImportarFornecedores);
  }

  // Listeners para Busca e Ordenação na aba Fornecedores
  const searchForn = document.getElementById('searchFornecedorTab');
  if (searchForn) searchForn.addEventListener('input', renderTabelaFornecedores);

  document.querySelectorAll('.sortable-forn').forEach(th => {
      th.addEventListener('click', () => {
          const field = th.dataset.field;
          if (fornecedoresSort.field === field) {
              fornecedoresSort.asc = !fornecedoresSort.asc;
          } else {
              fornecedoresSort.field = field;
              fornecedoresSort.asc = true;
          }
          renderTabelaFornecedores();
      });
  });

  // Listeners para Busca e Ordenação na aba Títulos
  const searchTit = document.getElementById('searchTituloTab');
  if (searchTit) searchTit.addEventListener('input', renderTabelaTitulos);

  document.querySelectorAll('.sortable-tit').forEach(th => {
      th.addEventListener('click', () => {
          const field = th.dataset.field;
          if (titulosSort.field === field) {
              titulosSort.asc = !titulosSort.asc;
          } else {
              titulosSort.field = field;
              titulosSort.asc = true;
          }
          renderTabelaTitulos();
      });
  });

  // Listener para preencher o modelo quando a placa muda
  const veiculoInput = document.getElementById('veiculo');
  if (veiculoInput) {
      veiculoInput.addEventListener('input', preencherModeloVeiculo);
  }

  // Listeners para cálculo fiscal
  document.getElementById('valorNfe')?.addEventListener('input', calcularTotalFiscal);
  document.getElementById('valorNfse')?.addEventListener('input', calcularTotalFiscal);

  // Listener Busca Fornecedor Modal
  document.getElementById('novoFornecedor').addEventListener('input', handleBuscaFornecedorModal);

  // Listeners Anexo
  document.getElementById('btnAbrirModalAnexo').addEventListener('click', abrirModalAnexo);
  document.getElementById('btnCloseModalAnexo').addEventListener('click', fecharModalAnexo);
  document.getElementById('btnCancelarAnexo').addEventListener('click', fecharModalAnexo);
  document.getElementById('inputArquivoAnexo').addEventListener('change', handleFileSelect);
  document.getElementById('btnConfirmarAnexo').addEventListener('click', confirmarAnexo);

  const params = new URLSearchParams(window.location.search);
  const idManutencao = params.get('id');

  if (idManutencao) {
    carregarManutencaoParaEdicao(idManutencao);
  }
  mostrarPainelInterno('cadastroInterno'); // Garante que a aba de cadastro seja exibida

  document.querySelectorAll('.painel-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      mostrarPainelInterno(btn.dataset.painel);
    });
  });

  // Fechar modais ao clicar fora
  window.addEventListener('click', (e) => {
    const modals = ['modalTitulo', 'modalFornecedor', 'modalAnexo', 'modalConfigurarCampos'];
    modals.forEach(id => {
        const modal = document.getElementById(id);
        if (e.target === modal) {
            modal.classList.add('hidden');
        }
    });
  });

  // Atalho de teclado Ctrl+S para salvar
  document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
          e.preventDefault(); // Previne a ação padrão do navegador (Salvar página)
          document.getElementById('btnSalvarManutencao').click(); // Simula o clique no botão de salvar
      }
  });
});

    document.querySelectorAll('.menu-toggle').forEach(btn => {
  btn.addEventListener('click', () => {
    btn.parentElement.classList.toggle('active');
  });
});

// 🌐 Expor funções para uso no HTML
window.abrirModalTitulo = abrirModalTitulo;
window.fecharModalTitulo = fecharModalTitulo;
window.salvarTitulo = salvarTitulo;

window.abrirModalFornecedor = abrirModalFornecedor;
window.fecharModalFornecedor = fecharModalFornecedor;
window.salvarFornecedor = salvarFornecedor;

window.mostrarPainelInterno = mostrarPainelInterno;
window.salvarManutencao = salvarManutencao;

window.abrirModalConfigurarCampos = abrirModalConfigurarCampos;
window.fecharModalConfigurarCampos = fecharModalConfigurarCampos;
window.salvarConfiguracaoCampos = salvarConfiguracaoCampos;
window.downloadArquivo = downloadArquivo;

window.salvarFornecedorTab = salvarFornecedorTab;
window.excluirFornecedorTab = excluirFornecedorTab;
window.salvarTituloTab = salvarTituloTab;
window.excluirTituloTab = excluirTituloTab;
