import { supabaseClient } from './supabase.js';
// 📦 Importação do Supabase

// Estado dos arquivos
let arquivosParaUpload = []; // Novos arquivos (File objects)
let arquivosExistentes = []; // Arquivos já salvos no banco ({nome, path})
let listaFornecedoresCache = []; // Cache para busca rápida no modal

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
  const { data, error } = await supabaseClient.from('veiculos').select('placa');
  const lista = document.getElementById('listaPlacas');
  if (error) return console.error('Erro ao carregar placas:', error);
  lista.innerHTML = '';
  data?.forEach(v => v.placa && lista.appendChild(new Option(v.placa)));
}

async function carregarFiliais() {
  const { data, error } = await supabaseClient.from('filiais').select('nome, sigla').order('nome');
  if (error) return console.error('Erro ao carregar filiais:', error);
  
  const selects = ['filial', 'tabFornFilial', 'modalFornFilial'];
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
  const { data, error } = await supabaseClient.from('fornecedor_manutencao').select('nome').order('nome');
  const lista = document.getElementById('listaFornecedores');
  if (error) return console.error('Erro ao carregar fornecedores:', error);
  lista.innerHTML = '';
  listaFornecedoresCache = data || [];
  listaFornecedoresCache.forEach(f => f.nome && lista.appendChild(new Option(f.nome)));
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
            div.textContent = f.nome || f.fornecedor;
            container.appendChild(div);
        });
    } else {
        container.style.display = 'none';
    }
}

// --- LÓGICA DAS NOVAS ABAS ---

// Fornecedores
async function carregarTabelaFornecedores() {
    const tbody = document.getElementById('tabelaFornecedoresTab');
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Carregando...</td></tr>';
    
    const { data, error } = await supabaseClient.from('fornecedor_manutencao').select('*').order('nome');
    if (error) return console.error(error);
    
    tbody.innerHTML = '';
    data.forEach(f => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${f.nome}</td>
            <td>${f.cnpj || '-'}</td>
            <td>${f.telefone || '-'}</td>
            <td>${f.filial || '-'}</td>
            <td><button class="btn-icon delete" onclick="excluirFornecedorTab('${f.id}')"><i class="fas fa-trash"></i></button></td>
        `;
        tbody.appendChild(tr);
    });
}

async function salvarFornecedorTab() {
    const nome = document.getElementById('tabFornNome').value.trim();
    const cnpj = document.getElementById('tabFornCnpj').value.trim();
    const telefone = document.getElementById('tabFornTelefone').value.trim();
    const filial = document.getElementById('tabFornFilial').value;
    
    if (!nome) return alert('Nome é obrigatório');
    
    const { error } = await supabaseClient.from('fornecedor_manutencao').insert([{ nome, cnpj, telefone, filial }]);
    if (error) return alert('Erro ao salvar: ' + error.message);
    
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

// Títulos
async function carregarTabelaTitulos() {
    const tbody = document.getElementById('tabelaTitulosTab');
    tbody.innerHTML = '<tr><td colspan="2" style="text-align:center;">Carregando...</td></tr>';
    
    const { data, error } = await supabaseClient.from('titulo_manutencao').select('*').order('titulo');
    if (error) return console.error(error);
    
    tbody.innerHTML = '';
    data.forEach(t => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${t.titulo}</td>
            <td><button class="btn-icon delete" onclick="excluirTituloTab('${t.id}')"><i class="fas fa-trash"></i></button></td>
        `;
        tbody.appendChild(tr);
    });
}

async function salvarTituloTab() {
    const titulo = document.getElementById('tabTituloNome').value.trim();
    if (!titulo) return alert('Título é obrigatório');
    
    const { error } = await supabaseClient.from('titulo_manutencao').insert([{ titulo }]);
    if (error) return alert('Erro ao salvar: ' + error.message);
    
    document.getElementById('tabTituloNome').value = '';
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
  preencherUsuarioLogado();
  carregarPlacas();
  carregarFiliais();
  carregarTitulosManutencao();
  carregarFornecedores();

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
