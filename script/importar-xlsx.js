import { supabaseClient } from './supabase.js';

const TIMEZONE_SAO_PAULO = 'America/Sao_Paulo';
const IMPORTACAO_CARREGAMENTO_KEY = 'carregamentoImportadoXlsx';
let clientesImportacao = [];
let itensImportacao = [];

function formatarCliente(cliente) {
    return cliente ? `${cliente.codigo} - ${cliente.nome}` : '';
}

function atualizarDatalistClientes() {
    const datalist = document.getElementById('clientes-list');
    datalist.innerHTML = '';
    clientesImportacao.forEach(cliente => {
        const option = document.createElement('option');
        option.value = formatarCliente(cliente);
        datalist.appendChild(option);
    });
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    }[char]));
}

function obterDataHoraLocalAtual() {
    const partes = new Intl.DateTimeFormat('sv-SE', {
        timeZone: TIMEZONE_SAO_PAULO,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23'
    }).formatToParts(new Date()).reduce((acc, part) => {
        acc[part.type] = part.value;
        return acc;
    }, {});

    return `${partes.year}-${partes.month}-${partes.day}T${partes.hour}:${partes.minute}`;
}

function obterSemanaIso(value) {
    const match = String(value || '').slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return '';

    const data = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    const diaSemana = data.getUTCDay() || 7;
    data.setUTCDate(data.getUTCDate() + 4 - diaSemana);
    const anoIso = data.getUTCFullYear();
    const inicioAno = new Date(Date.UTC(anoIso, 0, 1));
    const semana = Math.ceil((((data - inicioAno) / 86400000) + 1) / 7);
    return `${String(semana).padStart(2, '0')}-${anoIso}`;
}

function preencherSemanaPelaData() {
    document.getElementById('semana').value = obterSemanaIso(document.getElementById('dataHora').value);
}

function valorExisteNoDatalist(datalistId, value) {
    const valor = String(value || '').trim().toUpperCase();
    return Boolean(valor) && Array.from(document.getElementById(datalistId)?.options || [])
        .some(option => String(option.value || '').trim().toUpperCase() === valor);
}

function atualizarStatus(message, error = false) {
    const status = document.getElementById('importStatus');
    status.textContent = message;
    status.classList.toggle('error', error);
    status.classList.toggle('hidden', !message);
}

/**
 * Script para Importação de XLSX - Marquespan
 * Lógica específica para interpretar arquivos de importação
 * e gerar totais conforme especificado
 */

// Função para preencher o campo Conferente com o usuário logado
function preencherConferente() {
    const usuario = JSON.parse(localStorage.getItem('usuarioLogado'));
    const campoConferente = document.getElementById('conferente');
    const campoUsuarioHidden = document.getElementById('usuario-logado-hidden');

    if (usuario && usuario.nome) {
        campoConferente.value = usuario.nome;
        campoUsuarioHidden.value = usuario.nome;
        console.log('Conferente preenchido automaticamente:', usuario.nome);
    } else {
        campoConferente.value = 'Usuário não identificado';
        campoUsuarioHidden.value = '';
        console.warn('Usuário não encontrado no localStorage');
    }
}

// Função para buscar placas de veículos do banco de dados e preencher o datalist
async function preencherPlacas() {
    const datalistPlacas = document.getElementById('placas-list');
    try {
        const { data, error } = await supabaseClient
            .from('veiculos')
            .select('placa, modelo, situacao')
            .not('placa', 'is', null)
            .order('placa');

        if (error) {
            console.error('Erro ao buscar placas:', error);
            datalistPlacas.innerHTML = '<option value="Erro ao carregar placas">';
            return;
        }

        // Limpa opções existentes
        datalistPlacas.innerHTML = '';

        // Adiciona as placas como opções
        data
          .filter(veiculo => !veiculo.situacao || String(veiculo.situacao).toLowerCase() === 'ativo')
          .forEach(veiculo => {
            const option = document.createElement('option');
            option.value = veiculo.placa;
            option.label = veiculo.modelo || '';
            datalistPlacas.appendChild(option);
        });

        console.log('Placas carregadas com sucesso:', data.length);
    } catch (err) {
        console.error('Erro inesperado ao carregar placas:', err);
        datalistPlacas.innerHTML = '<option value="Erro ao carregar placas">';
    }
}

async function preencherMotoristas() {
    const datalist = document.getElementById('motoristas-list');
    const { data, error } = await supabaseClient
        .from('funcionario')
        .select('nome, nome_completo, funcao, status')
        .ilike('funcao', 'Motorista%')
        .eq('status', 'Ativo')
        .order('nome');

    if (error) {
        console.error('Erro ao buscar motoristas:', error);
        return;
    }

    datalist.innerHTML = '';
    (data || []).forEach(motorista => {
        const option = document.createElement('option');
        option.value = motorista.nome;
        option.label = motorista.nome_completo || motorista.funcao || '';
        datalist.appendChild(option);
    });
}

async function preencherSupervisores() {
    const datalist = document.getElementById('supervisores-list');
    const { data, error } = await supabaseClient
        .from('supervisores')
        .select('nome, nome_completo')
        .eq('status', 'ATIVO')
        .order('nome');

    if (error) {
        console.error('Erro ao buscar supervisores:', error);
        return;
    }

    datalist.innerHTML = '';
    (data || []).forEach(supervisor => {
        const option = document.createElement('option');
        option.value = supervisor.nome;
        option.label = supervisor.nome_completo || '';
        datalist.appendChild(option);
    });
}

async function carregarCadastrosImportacao() {
    const [clientesResult, itensResult] = await Promise.all([
        supabaseClient
            .from('clientes')
            .select('id, codigo, nome')
            .order('nome'),
        supabaseClient
            .from('itens')
            .select('id, codigo, nome, tipo')
            .order('nome')
    ]);

    if (clientesResult.error) throw clientesResult.error;
    if (itensResult.error) throw itensResult.error;

    clientesImportacao = clientesResult.data || [];
    itensImportacao = itensResult.data || [];

    atualizarDatalistClientes();
}

function normalizarTexto(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toUpperCase();
}

function normalizarBusca(value) {
    return normalizarTexto(value)
        .replace(/[^A-Z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function obterNomeClienteDoArquivo(fileName) {
    return normalizarBusca(
        String(fileName || '')
            .replace(/\.(xlsx?|xls)$/i, '')
            .replace(/\s*\([^)]*\)\s*$/g, '')
    );
}

function obterTokens(value) {
    return normalizarBusca(value)
        .split(' ')
        .filter(token => token.length > 1);
}

function encontrarClientePorArquivo(fileName) {
    const nomeArquivo = obterNomeClienteDoArquivo(fileName);
    if (!nomeArquivo) return null;

    const correspondenciaExata = clientesImportacao.find(cliente =>
        normalizarBusca(cliente.nome) === nomeArquivo
    );
    if (correspondenciaExata) return correspondenciaExata;

    const candidatosContidos = clientesImportacao.filter(cliente => {
        const nomeCliente = normalizarBusca(cliente.nome);
        return nomeCliente.includes(nomeArquivo) || nomeArquivo.includes(nomeCliente);
    });
    if (candidatosContidos.length === 1) return candidatosContidos[0];

    const tokensArquivo = obterTokens(nomeArquivo);
    const pontuados = clientesImportacao
        .map(cliente => {
            const tokensCliente = new Set(obterTokens(cliente.nome));
            const comuns = tokensArquivo.filter(token => tokensCliente.has(token)).length;
            return {
                cliente,
                pontuacao: tokensArquivo.length ? comuns / tokensArquivo.length : 0
            };
        })
        .filter(resultado => resultado.pontuacao >= 0.8)
        .sort((a, b) => b.pontuacao - a.pontuacao);

    if (!pontuados.length) return null;
    if (pontuados[1] && pontuados[0].pontuacao === pontuados[1].pontuacao) return null;
    return pontuados[0].cliente;
}

function extrairClienteCelula(value) {
    const texto = String(value || '').replace(/\s+/g, ' ').trim();
    if (!texto) return { codigo: '', nome: '', texto: '' };

    const match = texto.match(/^(.*?)\s*\(([^()]+)\)\s*$/);
    if (!match) return { codigo: '', nome: texto, texto };

    return {
        nome: match[1].trim(),
        codigo: match[2].trim(),
        texto
    };
}

function encontrarClientePorDados(dadosCliente) {
    const codigo = normalizarBusca(dadosCliente?.codigo);
    const nome = normalizarBusca(dadosCliente?.nome);

    if (codigo) {
        const porCodigo = clientesImportacao.find(cliente =>
            normalizarBusca(cliente.codigo) === codigo
        );
        if (porCodigo) return porCodigo;
    }

    if (nome) {
        return clientesImportacao.find(cliente =>
            normalizarBusca(cliente.nome) === nome
        ) || null;
    }

    return null;
}

function obterMotivoArquivo(fileName, motivoPlanilha) {
    const name = normalizarTexto(fileName);
    if (name.includes('(NOVO)')) return 'Cliente Novo';
    if (name.includes('(AMT+TROCA)')) return 'Aumento+Troca';
    if (name.includes('(AMT)')) return 'Aumento+Troca';
    if (name.includes('(AM)')) return 'Aumento';
    if (name.includes('(TROCA+RP)')) return 'Troca';
    if (name.includes('(RE)')) return 'Retirada de Empréstimo';
    if (name.includes('(RP)')) return 'Retirada Parcial';
    if (name.includes('(RT)')) return 'Retirada Total';
    if (name.includes('(TROCA)')) return 'Troca';

    const motivo = normalizarTexto(motivoPlanilha);
    if (motivo.includes('CLIENTE NOVO')) return 'Cliente Novo';
    if (motivo.includes('AUMENTO') && motivo.includes('TROCA')) return 'Aumento+Troca';
    if (motivo.includes('AUMENTO')) return 'Aumento';
    if (motivo.includes('EMPREST')) return 'Retirada de Empréstimo';
    if (motivo.includes('PARCIAL')) return 'Retirada Parcial';
    if (motivo.includes('TOTAL')) return 'Retirada Total';
    return 'Troca';
}

function encontrarCliente(value) {
    const normalizado = normalizarBusca(value);
    return clientesImportacao.find(cliente =>
        normalizarBusca(`${cliente.codigo} - ${cliente.nome}`) === normalizado ||
        normalizarBusca(cliente.codigo) === normalizado ||
        normalizarBusca(cliente.nome) === normalizado
    );
}

function singularizarEquipamento(value) {
    const texto = normalizarBusca(value);
    if (texto.endsWith('ES')) return texto.slice(0, -2);
    if (texto.endsWith('S')) return texto.slice(0, -1);
    return texto;
}

function obterTipoItemDaLinha(row) {
    const novo = normalizarTexto(row[3]) === 'X';
    const usado = normalizarTexto(row[4]) === 'X';
    if (novo && !usado) return 'NOVO';
    if (usado && !novo) return 'USADO';
    return '';
}

function encontrarItem(nomeEquipamento, modeloEquipamento, tipoEsperado) {
    const equipamento = normalizarBusca(nomeEquipamento);
    const modelo = normalizarBusca(modeloEquipamento);
    const equipamentoModelo = normalizarBusca(`${equipamento} ${modelo}`);
    const equipamentoSemNumero = equipamento.replace(/\s+\d+(?:\s*[A-Z]+)?$/, '').trim();
    const singular = singularizarEquipamento(equipamento);
    const singularSemNumero = singularizarEquipamento(equipamentoSemNumero);

    const candidatos = itensImportacao
        .map(item => {
            const nome = normalizarBusca(item.nome);
            const codigo = normalizarBusca(item.codigo);
            const codigoNome = normalizarBusca(`${item.codigo} ${item.nome}`);
            let pontuacao = 0;

            if (codigoNome === equipamento || codigo === equipamento) pontuacao = 120;
            if (nome === equipamentoModelo && modelo) pontuacao = Math.max(pontuacao, 115);
            if (nome === equipamento) pontuacao = Math.max(pontuacao, 110);
            if (nome === singular) pontuacao = Math.max(pontuacao, 105);
            if (nome === equipamentoSemNumero) pontuacao = Math.max(pontuacao, 100);
            if (nome === singularSemNumero) pontuacao = Math.max(pontuacao, 95);
            if (modelo && nome.includes(equipamento) && nome.includes(modelo)) {
                pontuacao = Math.max(pontuacao, 90);
            }
            if (equipamento.includes(nome) || nome.includes(equipamento)) {
                pontuacao = Math.max(pontuacao, 70);
            }
            if (singular && (singular.includes(nome) || nome.includes(singular))) {
                pontuacao = Math.max(pontuacao, 65);
            }

            const tipo = normalizarTexto(item.tipo);
            if (tipoEsperado && tipo === tipoEsperado) pontuacao += 20;
            if (tipoEsperado && tipo && tipo !== tipoEsperado) pontuacao -= 30;

            return { item, pontuacao };
        })
        .filter(resultado => resultado.pontuacao >= 65)
        .sort((a, b) => b.pontuacao - a.pontuacao);

    if (!candidatos.length) return null;
    return candidatos[0].item;
}

const tablesContainer = document.getElementById("tables");
const resumoDiv = document.getElementById("resumo");
const btnAtualizar = document.getElementById("btnAtualizar");

let grids = []; // Armazena todos os dados carregados (para recalcular depois)
let motivos = {}; // Armazena totais de motivos
// Lista fixa de equipamentos
const equipamentosFixos = [
    'ARMÁRIO',
    'ARMÁRIO 10',
    'ARMÁRIO 16',
    'ARMÁRIO 40X60',
    'ARMÁRIO INOX',
    'CAM. FRIA',
    'CLIMA 20',
    'CLIMA 40',
    'ESQUELETO',
    'ESTEIRAS',
    'FORMA',
    'FORNO 10',
    'FORNO 5',
    'FORNO 8',
    'FREEZER',
    'MESA INOX',
    'MOINHO'
];

function normalizeEquipment(equip) {
    return String(equip || '').replace(/\s+/g, ' ').trim().toUpperCase();
}

function recalcularTotais() {
    let totalEquip_Carreg = 0, totalNovos_Carreg = 0, totalUsados_Carreg = 0;
    let totalEquip_Retorno = 0, totalNovos_Retorno = 0, totalUsados_Retorno = 0;

    grids.forEach(grid => {
        grid.rows.forEach(r => {
            const qtd = parseFloat(r[0]) || 0;
            const nMark = String(r[3] || '').trim().toUpperCase();
            const uMark = String(r[4] || '').trim().toUpperCase();
            const addQtd = qtd > 0 ? qtd : 1;

            if (grid.type === "carregamento") {
                totalEquip_Carreg += qtd;
                if (nMark === "X") totalNovos_Carreg += addQtd;
                if (uMark === "X") totalUsados_Carreg += addQtd;
            } else if (grid.type === "retorno") {
                totalEquip_Retorno += qtd;
                if (nMark === "X") totalNovos_Retorno += addQtd;
                if (uMark === "X") totalUsados_Retorno += addQtd;
            }
        });
    });

    resumoDiv.innerHTML = `
      <div class="resumo-section">
        <div class="resumo-card">
          <h3>🚚 Carregamento (NOVO/TROCA/AMT)</h3>
          <p><b>Total de Equipamentos:</b> <span class="total">${totalEquip_Carreg}</span></p>
          <p><b>Novos (N):</b> <span class="total">${totalNovos_Carreg}</span></p>
          <p><b>Usados (U):</b> <span class="total">${totalUsados_Carreg}</span></p>
        </div>
        <div class="resumo-card">
          <h3>🔄 Retorno (RP/RT)</h3>
          <p><b>Total de Equipamentos:</b> <span class="total">${totalEquip_Retorno}</span></p>
          <p><b>Novos (N):</b> <span class="total">${totalNovos_Retorno}</span></p>
          <p><b>Usados (U):</b> <span class="total">${totalUsados_Retorno}</span></p>
        </div>
      </div>
    `;
}

btnAtualizar.addEventListener("click", () => {
    recalcularTotais();
    // Force update of resumoDiv in case of (TROCA+RP) files
    // This ensures the totals are recalculated and displayed correctly
});
document.getElementById("btnGerarXLS").addEventListener("click", gerarXLSResumo);
document.getElementById('btnIniciarCarregamento').addEventListener('click', prepararInicioCarregamento);
document.getElementById('formCadastroClienteImportacao').addEventListener('submit', salvarClienteImportacao);
document.getElementById('btnFecharCadastroCliente').addEventListener('click', fecharCadastroCliente);
document.getElementById('btnCancelarCadastroCliente').addEventListener('click', fecharCadastroCliente);
document.getElementById('clienteCidadeImportacao').addEventListener('blur', e => {
    const cidade = e.target.value.trim();
    if (cidade) buscarEstadoPorCidade(cidade);
});
document.getElementById('modalCadastroCliente').addEventListener('click', event => {
    if (event.target.id === 'modalCadastroCliente') fecharCadastroCliente();
});

document.getElementById("fileUpload").addEventListener("change", function(e) {
    const files = e.target.files;
    document.getElementById('fileSelectionText').textContent = files.length
        ? `${files.length} ${files.length === 1 ? 'arquivo selecionado' : 'arquivos selecionados'}`
        : 'Nenhum arquivo selecionado';
    tablesContainer.innerHTML = "";
    resumoDiv.innerHTML = "";
    grids = [];
    motivos = {};
    atualizarStatus(files.length ? 'Processando arquivos...' : '');

    for (const file of files) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, {type: 'array'});

            const name = file.name.toUpperCase();
            const isCarregamento = name.includes("(NOVO)") ||
                name.includes("(TROCA)") ||
                name.includes("(AMT)") ||
                name.includes("(AMT+TROCA)");
            const isRetorno = name.includes("(RP)") || name.includes("(RT)") || (name.includes("(RT)") && name.includes("(RP)")) || name.includes("(RE)");
            const isNovo = name.includes("(NOVO)");

            const cfg = isNovo
              ? {
                  sheet: "REQUERIMENTO",
                  motivoCell: "K9",
                  clienteCell: "D6",
                  cidadeCell: "D7",
                  estadoSheet: "CADASTRO NOVO",
                  estadoCell: "N21",
                  startRow: 13,
                  endRow: 23,
                  startCol: 2,
                  endCol: 6,
                  headers: ["QTD","EQUIP","MOD.","N","U"],
                  filterQtd: true
                }
              : {
                  sheet: "REQUERIMENTO MANUAL",
                  motivoCell: "K8",
                  clienteCell: "C4",
                  cidadeCell: "C5",
                  startRow: 11,
                  endRow: 21,
                  startCol: 1,
                  endCol: 5,
                  headers: ["QTD","EQUIP","MOD.","N","U"],
                  filterQtd: false
                };

            if (!workbook.SheetNames.includes(cfg.sheet)) {
                tablesContainer.insertAdjacentHTML('beforeend', `<article class="arquivo-card">
                  <p>O arquivo <strong>${escapeHtml(file.name)}</strong> não possui a aba "${escapeHtml(cfg.sheet)}".</p>
                </article>`);
                atualizarStatus('Um ou mais arquivos não possuem o formato esperado.', true);
                return;
            }

            const sheet = workbook.Sheets[cfg.sheet];
            const motivoCell = sheet[cfg.motivoCell];
            const motivo = motivoCell ? motivoCell.v : "Não informado";
            const dadosClientePlanilha = extrairClienteCelula(sheet[cfg.clienteCell]?.v);
            const cidadePlanilha = String(sheet[cfg.cidadeCell]?.v || '').trim();
            const estadoSheet = cfg.estadoSheet ? workbook.Sheets[cfg.estadoSheet] : null;
            const estadoPlanilha = String(estadoSheet?.[cfg.estadoCell]?.v || '').trim().toUpperCase();

            const rows = [];
            for (let r = cfg.startRow; r <= cfg.endRow; r++) {
                const linha = [];
                for (let c = cfg.startCol; c <= cfg.endCol; c++) {
                    const cellAddress = XLSX.utils.encode_cell({r: r-1, c: c});
                    const cell = sheet[cellAddress];
                    linha.push(cell ? cell.v : "");
                }

                const qtd = parseFloat(linha[0]) || 0;
                if (cfg.filterQtd && qtd <= 0) continue;
                // Normalize equipment name
                linha[1] = normalizeEquipment(linha[1]);
                if (linha.some(v => v !== "")) rows.push(linha);
            }

            // Adicionar equipamentos à lista (agora usa lista fixa)
            // Não é mais necessário adicionar dinamicamente

            // Armazena para futuros cálculos
            let type = "outro";
            if (name.includes("(TROCA+RP)")) {
                type = "carregamento"; // Treat (TROCA+RP) as carregamento, like (TROCA)
            } else if (isCarregamento && !isRetorno) {
                type = "carregamento";
            } else if (isRetorno) {
                type = "retorno";
            } else if (isCarregamento && isRetorno) {
                type = "retorno";
            }
            const gridIndex = grids.length;
            const clienteSugerido = encontrarClientePorDados(dadosClientePlanilha) ||
                encontrarClientePorArquivo(file.name);
            const clienteSugeridoTexto = formatarCliente(clienteSugerido);
            const clientePendenteTexto = dadosClientePlanilha.codigo && dadosClientePlanilha.nome
                ? `${dadosClientePlanilha.codigo} - ${dadosClientePlanilha.nome}`
                : dadosClientePlanilha.nome;
            grids.push({
                type,
                isNovo,
                rows,
                arquivo: file.name,
                motivo: obterMotivoArquivo(file.name, motivo),
                cliente: clienteSugeridoTexto || clientePendenteTexto,
                clientePlanilha: {
                    ...dadosClientePlanilha,
                    cidade: cidadePlanilha,
                    estado: estadoPlanilha,
                    origemCliente: `${cfg.sheet}!${cfg.clienteCell}`
                },
                ordem: ''
            });

            // Contar motivos baseado no nome do arquivo
            if (name.includes("(NOVO)")) {
                motivos["CLIENTE NOVO"] = (motivos["CLIENTE NOVO"] || 0) + 1;
            }
            if (name.includes("(AM)")) {
                motivos["AUMENTO"] = (motivos["AUMENTO"] || 0) + 1;
            }
            if (
                name.includes("(AMT)") ||
                name.includes("(AMT+TROCA)") ||
                name.includes("(TROCA)") ||
                name.includes("(TROCA+RP)")
            ) {
                motivos["TROCA"] = (motivos["TROCA"] || 0) + 1;
            }
            if (name.includes("(RP)")) {
                motivos["RETIRADA PARCIAL"] = (motivos["RETIRADA PARCIAL"] || 0) + 1;
            }
            if (name.includes("(RE)")) {
                motivos["RETIRADA DE EMPRÉSTIMO"] = (motivos["RETIRADA DE EMPRÉSTIMO"] || 0) + 1;
            }
            if (name.includes("(RT)")) {
                motivos["RETIRADA TOTAL"] = (motivos["RETIRADA TOTAL"] || 0) + 1;
            }
            if (name.includes("(RT)") && name.includes("(RP)")) {
                motivos["RETIRADA TOTAL"] = (motivos["RETIRADA TOTAL"] || 0) + 1;
            }

            // Cria tabela HTML
            let html = `<article class="arquivo-card"><h4><i class="fas fa-file-excel"></i> ${escapeHtml(file.name)}</h4>`;
            html += `<div class="arquivo-meta"><div class="motivo-box"><strong>Motivo:</strong> ${escapeHtml(motivo)}</div>`;
            html += `<label class="cliente-box"><strong>Cliente:</strong> <input type="text" class="cliente-importacao" data-grid="${gridIndex}" list="clientes-list" value="${escapeHtml(clienteSugeridoTexto || clientePendenteTexto)}" placeholder="Código - Cliente" required>`;
            if (!clienteSugerido) {
                html += `<button type="button" class="btn-glass btn-green btn-cadastrar-cliente" data-grid="${gridIndex}"><i class="fas fa-user-plus"></i> Cadastrar</button>`;
            }
            html += `<small class="cliente-origem">Origem: ${escapeHtml(cfg.sheet)}!${escapeHtml(cfg.clienteCell)}${dadosClientePlanilha.texto ? ` - ${escapeHtml(dadosClientePlanilha.texto)}` : ' não preenchida'}</small></label>`;
            html += `<label class="ordem-box"><strong>Ordem:</strong> <input type="text" class="ordem-importacao" data-grid="${gridIndex}" placeholder="0000" maxlength="4"></label></div>`;
            html += `<div class="data-table"><table data-index="${gridIndex}"><thead><tr>`;
            cfg.headers.forEach(h => html += `<th>${escapeHtml(h)}</th>`);
            html += `</tr></thead><tbody>`;

            rows.forEach((row, i) => {
                html += `<tr data-row="${i}">`;
                row.forEach((cell, j) => {
                    if (j === 0) { // QTD column - make it disabled
                        html += `<td contenteditable="false">${escapeHtml(cell)}</td>`;
                    } else if (j === 1) { // EQUIP column
                        html += `<td contenteditable="false">${escapeHtml(cell)}</td>`;
                    } else if (j === 2) { // MOD column - make it disabled
                        html += `<td contenteditable="false">${escapeHtml(cell)}</td>`;
                    } else if (j === 3 || j === 4) {
                        html += `<td contenteditable="true">${escapeHtml(cell)}</td>`;
                    } else {
                        html += `<td>${escapeHtml(cell)}</td>`;
                    }
                });
                html += "</tr>";
            });
            html += "</tbody></table></div></article>";

            tablesContainer.innerHTML += html;
            recalcularTotais();
            atualizarStatus(`${grids.length} ${grids.length === 1 ? 'arquivo processado' : 'arquivos processados'}.`);
        };
        reader.onerror = () => atualizarStatus(`Erro ao ler o arquivo ${file.name}.`, true);
        reader.readAsArrayBuffer(file);
    }
});

// Escuta alterações nas células editáveis
tablesContainer.addEventListener("input", function(e) {
    if (e.target.matches('.cliente-importacao')) {
        const gridIndex = Number(e.target.dataset.grid);
        if (grids[gridIndex]) grids[gridIndex].cliente = e.target.value.trim();
        return;
    }

    if (e.target.matches('.ordem-importacao')) {
        const gridIndex = Number(e.target.dataset.grid);
        if (grids[gridIndex]) grids[gridIndex].ordem = e.target.value.trim();
        return;
    }

    const td = e.target.closest("td[contenteditable]");
    if (!td) return;

    const tr = td.parentElement;
    const table = td.closest("table");
    const gridIndex = parseInt(table.dataset.index);
    const rowIndex = parseInt(tr.dataset.row);
    const cellIndex = [...tr.children].indexOf(td);

    // Verifica se a linha existe no array
    if (grids[gridIndex] && grids[gridIndex].rows[rowIndex]) {
        grids[gridIndex].rows[rowIndex][cellIndex] = td.innerText.trim().toUpperCase();
        // Atualiza automaticamente ao digitar:
        recalcularTotais();
    }
});

// Escuta alterações nos dropdowns de equipamentos
tablesContainer.addEventListener("change", function(e) {
    const select = e.target.closest("select.equip-dropdown");
    if (!select) return;

    const tr = select.parentElement.parentElement;
    const table = tr.closest("table");
    const gridIndex = parseInt(table.dataset.index);
    const rowIndex = parseInt(tr.dataset.row);
    const cellIndex = 1; // EQUIP column

    grids[gridIndex].rows[rowIndex][cellIndex] = select.value.trim().toUpperCase();

    // Atualiza automaticamente ao alterar:
    recalcularTotais();
});

tablesContainer.addEventListener('click', event => {
    const button = event.target.closest('.btn-cadastrar-cliente');
    if (!button) return;
    abrirCadastroCliente(Number(button.dataset.grid));
});

// Função para gerar XLS de resumo
function gerarXLSResumo() {
    if (grids.length === 0) {
        alert('Nenhum dado carregado. Importe arquivos primeiro.');
        return;
    }

    const placaInformada = document.getElementById('placa').value.trim();
    const motoristaInformado = document.getElementById('motorista').value.trim();
    const supervisorInformado = document.getElementById('supervisor').value.trim();
    const semanaInformada = document.getElementById('semana').value.trim();
    const dataHoraInformada = document.getElementById('dataHora').value;

    if (!semanaInformada || !dataHoraInformada) {
        alert('Preencha os campos Semana e Data/Hora.');
        return;
    }
    if (!valorExisteNoDatalist('placas-list', placaInformada)) {
        alert('Selecione uma placa válida cadastrada em Veículos.');
        return;
    }
    if (!valorExisteNoDatalist('motoristas-list', motoristaInformado)) {
        alert('Selecione um motorista ativo cadastrado em Funcionários.');
        return;
    }
    if (supervisorInformado && !valorExisteNoDatalist('supervisores-list', supervisorInformado)) {
        alert('Selecione um supervisor ativo cadastrado em Supervisores.');
        return;
    }

    // Obter dados do formulário
    const semana = semanaInformada;
    const data = dataHoraInformada;
    const placa = placaInformada;
    const motorista = motoristaInformado;
    const conferente = document.getElementById('conferente').value || 'Não informado';
    const supervisor = supervisorInformado || 'Não informado';

    // Lista de equipamentos fixos
    const equipamentosFixos = [
        'ARMÁRIO',
        'ARMÁRIO 10',
        'ARMÁRIO 16',
        'ARMÁRIO 40X60',
        'ARMÁRIO INOX',
        'CAM. FRIA',
        'CLIMA 20',
        'CLIMA 40',
        'ESQUELETO',
        'ESTEIRAS',
        'FORMA',
        'FORNO 10',
        'FORNO 5',
        'FORNO 8',
        'FREEZER',
        'MESA INOX',
        'MOINHO'
    ];

    // Inicializar equipamentos com zero
    const equipamentos = {};
    equipamentosFixos.forEach(equip => {
        equipamentos[equip] = { novos: 0, usados: 0, total: 0, retorno: 0 };
    });

    // Agregar totais por equipamento
    grids.forEach(grid => {
        grid.rows.forEach(r => {
            const equip = String(r[1] || '').trim().toUpperCase(); // EQUIP
            const qtd = parseFloat(r[0]) || 0;
            const nMark = String(r[3] || '').trim().toUpperCase();
            const uMark = String(r[4] || '').trim().toUpperCase();

            if (equipamentos[equip]) {
                const addQtd = qtd > 0 ? qtd : 1;
                if (nMark === "X") equipamentos[equip].novos += addQtd;
                if (uMark === "X") equipamentos[equip].usados += addQtd;
                equipamentos[equip].total += addQtd;
                if (grid.type === "retorno") equipamentos[equip].retorno += addQtd;
            }
        });
    });



    // Criar dados para o XLS
    const headerData = [
        ['Semana:', semana],
        ['Data/Hora:', data],
        ['Placa:', placa],
        ['Motorista:', motorista],
        ['Conferente:', conferente],
        ['Supervisor:', supervisor],
        [], // Linha vazia
        ['Equipamento', 'NOVOS', 'USADOS', 'Total', 'Retorno']
    ];

    const tableData = equipamentosFixos.map(equip => [
        equip,
        equipamentos[equip].novos,
        equipamentos[equip].usados,
        equipamentos[equip].total,
        equipamentos[equip].retorno
    ]);

    const motivosData = [
        [], // Linha vazia
        ['Motivo', 'Total'],
        ['CLIENTE NOVO', motivos['CLIENTE NOVO'] || 0],
        ['AUMENTO', motivos['AUMENTO'] || 0],
        ['TROCA', motivos['TROCA'] || 0],
        ['RETIRADA PARCIAL', motivos['RETIRADA PARCIAL'] || 0],
        ['RETIRADA DE EMPRÉSTIMO', motivos['RETIRADA DE EMPRÉSTIMO'] || 0],
        ['RETIRADA TOTAL', motivos['RETIRADA TOTAL'] || 0]
    ];

    const wsData = [...headerData, ...tableData, ...motivosData];

    // Criar workbook
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    XLSX.utils.book_append_sheet(wb, ws, 'Resumo');

    // Download
    XLSX.writeFile(wb, `resumo_carregamento_${new Date().toISOString().split('T')[0]}.xlsx`);
}

async function buscarEstadoPorCidade(cidade) {
    const inputEstado = document.getElementById('clienteEstadoImportacao');
    if (!inputEstado || inputEstado.value.trim()) return;

    inputEstado.placeholder = 'Buscando...';
    inputEstado.disabled = true;

    try {
        const url = `https://servicodados.ibge.gov.br/api/v1/localidades/municipios?nome=${encodeURIComponent(cidade)}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error('Erro na API');
        const data = await res.json();

        const municipio = (data || []).find(m =>
            String(m.nome || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase() ===
            cidade.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
        ) || data[0];

        const uf = municipio?.microrregiao?.mesorregiao?.UF?.sigla || '';
        if (uf) inputEstado.value = uf;
    } catch {
        // silencia erro de rede — usuário preenche manualmente
    } finally {
        inputEstado.placeholder = 'UF';
        inputEstado.disabled = false;
    }
}

function abrirCadastroCliente(gridIndex) {
    const grid = grids[gridIndex];
    if (!grid) return;

    const codigoInput = document.getElementById('clienteCodigoImportacao');
    const codigoLabel = codigoInput.closest('.form-group')?.querySelector('label');

    document.getElementById('clienteGridIndex').value = String(gridIndex);
    document.getElementById('clienteGridIsNovo').value = grid.isNovo ? '1' : '';
    codigoInput.value = grid.clientePlanilha?.codigo || '';
    document.getElementById('clienteNomeImportacao').value = grid.clientePlanilha?.nome || '';
    document.getElementById('clienteCidadeImportacao').value = grid.clientePlanilha?.cidade || '';
    document.getElementById('clienteEstadoImportacao').value = grid.clientePlanilha?.estado || '';

    codigoInput.setAttribute('required', '');
    codigoInput.placeholder = grid.isNovo ? 'Informe o código do novo cliente' : '';
    if (codigoLabel) codigoLabel.textContent = 'Código:';

    document.getElementById('modalCadastroCliente').classList.remove('hidden');

    const cidadePreenchida = grid.clientePlanilha?.cidade || '';
    const estadoPreenchido = grid.clientePlanilha?.estado || '';
    if (cidadePreenchida && !estadoPreenchido) {
        buscarEstadoPorCidade(cidadePreenchida);
    }
    if (cidadePreenchida) {
        document.getElementById('clienteEstadoImportacao').focus();
    } else {
        document.getElementById('clienteCidadeImportacao').focus();
    }
}

function fecharCadastroCliente() {
    document.getElementById('modalCadastroCliente').classList.add('hidden');
    document.getElementById('formCadastroClienteImportacao').reset();
    document.getElementById('clienteGridIndex').value = '';
    document.getElementById('clienteGridIsNovo').value = '';
    const codigoInput = document.getElementById('clienteCodigoImportacao');
    codigoInput.setAttribute('required', '');
    codigoInput.placeholder = '';
    const codigoLabel = codigoInput.closest('.form-group')?.querySelector('label');
    if (codigoLabel) codigoLabel.textContent = 'Código:';
}

async function salvarClienteImportacao(event) {
    event.preventDefault();

    const gridIndex = Number(document.getElementById('clienteGridIndex').value);
    const codigo = document.getElementById('clienteCodigoImportacao').value.trim();
    const nome = document.getElementById('clienteNomeImportacao').value.trim();
    const cidade = document.getElementById('clienteCidadeImportacao').value.trim();
    const estado = document.getElementById('clienteEstadoImportacao').value.trim().toUpperCase();

    if (!codigo || !nome || !cidade || !estado) {
        alert('Preencha código, nome, cidade e estado. O código é obrigatório no cadastro de clientes.');
        return;
    }

    const existente = encontrarClientePorDados({ codigo, nome });
    if (existente) {
        aplicarClienteCadastrado(existente, gridIndex);
        fecharCadastroCliente();
        return;
    }

    const { data, error } = await supabaseClient
        .from('clientes')
        .insert([{ codigo, nome, cidade, estado }])
        .select('id, codigo, nome')
        .single();

    if (error) {
        console.error('Erro ao cadastrar cliente durante a importação:', error);
        alert(`Não foi possível cadastrar o cliente: ${error.message}`);
        return;
    }

    clientesImportacao.push(data);
    clientesImportacao.sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
    atualizarDatalistClientes();
    aplicarClienteCadastrado(data, gridIndex);
    fecharCadastroCliente();
    atualizarStatus(`Cliente ${formatarCliente(data)} cadastrado e associado às requisições.`);
}

function aplicarClienteCadastrado(cliente, gridIndexOrigem) {
    const codigo = normalizarBusca(cliente.codigo);
    const nome = normalizarBusca(cliente.nome);

    grids.forEach((grid, index) => {
        const mesmoCodigo = codigo &&
            normalizarBusca(grid.clientePlanilha?.codigo) === codigo;
        const mesmoNome = nome &&
            normalizarBusca(grid.clientePlanilha?.nome) === nome;

        if (index !== gridIndexOrigem && !mesmoCodigo && !mesmoNome) return;

        grid.cliente = formatarCliente(cliente);
        const input = tablesContainer.querySelector(`.cliente-importacao[data-grid="${index}"]`);
        if (input) input.value = grid.cliente;
        tablesContainer.querySelector(`.btn-cadastrar-cliente[data-grid="${index}"]`)?.remove();
    });
}

function prepararInicioCarregamento() {
    if (!grids.length) {
        alert('Importe pelo menos uma requisição antes de iniciar o carregamento.');
        return;
    }

    const semana = document.getElementById('semana').value.trim();
    const dataHora = document.getElementById('dataHora').value;
    const placa = document.getElementById('placa').value.trim();
    const motorista = document.getElementById('motorista').value.trim();
    const conferente = document.getElementById('conferente').value.trim();
    const supervisor = document.getElementById('supervisor').value.trim();

    if (!semana || !dataHora) {
        alert('Preencha os campos Semana e Data/Hora.');
        return;
    }
    if (!valorExisteNoDatalist('placas-list', placa)) {
        alert('Selecione uma placa válida cadastrada em Veículos.');
        return;
    }
    if (!valorExisteNoDatalist('motoristas-list', motorista)) {
        alert('Selecione um motorista ativo cadastrado em Funcionários.');
        return;
    }
    if (supervisor && !valorExisteNoDatalist('supervisores-list', supervisor)) {
        alert('Selecione um supervisor ativo cadastrado em Supervisores.');
        return;
    }

    const erros = new Set();
    const requisicoes = grids.map((grid, index) => {
        const cliente = encontrarCliente(grid.cliente) ||
            encontrarClientePorDados(grid.clientePlanilha) ||
            encontrarClientePorArquivo(grid.arquivo);
        if (!cliente) {
            erros.add(`Arquivo ${grid.arquivo}: selecione um cliente válido.`);
        }

        const itens = grid.rows
            .filter(row => (parseFloat(row[0]) || 0) > 0 && normalizarTexto(row[1]))
            .map(row => {
                const tipoEsperado = obterTipoItemDaLinha(row);
                const item = encontrarItem(row[1], row[2], tipoEsperado);
                if (!item) {
                    const detalheModelo = normalizarTexto(row[2]) ? `, modelo "${row[2]}"` : '';
                    const detalheTipo = tipoEsperado ? `, tipo ${tipoEsperado}` : '';
                    erros.add(`Item "${row[1]}"${detalheModelo}${detalheTipo} não encontrado no cadastro.`);
                }

                return {
                    item_id: item?.id || null,
                    item_nome: item ? `${item.codigo} - ${item.nome}` : String(row[1] || ''),
                    modelo: String(row[2] || '').trim(),
                    tipo: item?.tipo || '',
                    quantidade: parseFloat(row[0]) || 0
                };
            });

        if (!itens.length) {
            erros.add(`Arquivo ${grid.arquivo}: nenhuma quantidade válida foi encontrada.`);
        }

        return {
            cliente_id: cliente?.id || null,
            cliente_nome: cliente ? `${cliente.codigo} - ${cliente.nome}` : grid.cliente,
            motivo: grid.motivo,
            ordem: grid.ordem,
            arquivo: grid.arquivo,
            itens
        };
    });

    const listaErros = Array.from(erros);
    if (listaErros.length) {
        atualizarStatus(listaErros.join(' '), true);
        alert(listaErros.slice(0, 12).join('\n'));
        return;
    }

    const rascunho = {
        versao: 1,
        criado_em: new Date().toISOString(),
        cabecalho: {
            semana,
            data_hora: dataHora,
            placa,
            motorista,
            conferente,
            supervisor
        },
        requisicoes
    };

    localStorage.setItem(IMPORTACAO_CARREGAMENTO_KEY, JSON.stringify(rascunho));
    window.location.href = 'iniciar-carregamento.html';
}

// Função para adicionar nova linha
function addNewRow(gridIndex) {
    const newRow = ['', '', '', '', '']; // Linha vazia
    grids[gridIndex].rows.push(newRow);

    // Atualizar HTML
    const tables = document.querySelectorAll('table[data-index]');
    const table = tables[gridIndex];
    const tbody = table.querySelector('tbody');
    const newTr = document.createElement('tr');
    newTr.innerHTML = `
        <td contenteditable="true">${newRow[0]}</td>
        <td><select class="equip-dropdown">${equipamentosFixos.map(equip => `<option value="${equip}">${equip}</option>`).join('')}</select></td>
        <td contenteditable="true">${newRow[2]}</td>
        <td contenteditable="true">${newRow[3]}</td>
        <td contenteditable="true">${newRow[4]}</td>
        <td><button class="edit-row-btn" data-grid="${gridIndex}" data-row="${grids[gridIndex].rows.length - 1}">✏️</button> <button class="delete-row-btn" data-grid="${gridIndex}" data-row="${grids[gridIndex].rows.length - 1}">🗑️</button></td>
    `;
    tbody.appendChild(newTr);

    // Atualizar totais
    recalcularTotais();
}

// Função para deletar uma linha
function deleteRow(gridIndex, rowIndex) {
    // Remove a linha do array de dados
    grids[gridIndex].rows.splice(rowIndex, 1);

    // Atualizar HTML: remover a linha da tabela
    const tables = document.querySelectorAll('table[data-index]');
    const table = tables[gridIndex];
    const tbody = table.querySelector('tbody');
    const rows = tbody.querySelectorAll('tr[data-row]');
    if (rows[rowIndex]) {
        rows[rowIndex].remove();
    }

    // Atualizar data-row para as linhas restantes
    Array.from(rows).forEach((row, i) => {
        if (i >= rowIndex) {
            row.dataset.row = i;
            const deleteBtn = row.querySelector('.delete-row-btn');
            if (deleteBtn) {
                deleteBtn.dataset.row = i;
            }
        }
    });

    // Atualizar totais
    recalcularTotais();
}

// Escuta cliques nos botões de adicionar linha e deletar linha
document.addEventListener('click', function(e) {
    if (e.target.classList.contains('add-row-btn')) {
        const gridIndex = parseInt(e.target.dataset.index);
        addNewRow(gridIndex);
    } else if (e.target.classList.contains('delete-row-btn')) {
        const gridIndex = parseInt(e.target.dataset.grid);
        const rowIndex = parseInt(e.target.dataset.row);
        deleteRow(gridIndex, rowIndex);
    }
});

// Inicialização quando a página carrega
document.addEventListener('DOMContentLoaded', async function() {
    console.log('Inicializando página de importação XLSX...');
    preencherConferente();
    try {
        await Promise.all([
            preencherPlacas(),
            preencherMotoristas(),
            preencherSupervisores(),
            carregarCadastrosImportacao()
        ]);
    } catch (error) {
        console.error('Erro ao carregar cadastros da importação:', error);
        atualizarStatus('Não foi possível carregar clientes e itens cadastrados.', true);
    }

    const dataHora = document.getElementById('dataHora');
    dataHora.value = obterDataHoraLocalAtual();
    preencherSemanaPelaData();
    dataHora.addEventListener('change', preencherSemanaPelaData);
});
