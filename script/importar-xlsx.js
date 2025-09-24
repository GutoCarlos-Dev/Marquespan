/**
 * Script para Importação de XLSX - Marquespan
 * Lógica específica para interpretar arquivos de importação
 * e gerar totais conforme especificado
 */

import { supabase } from './supabase.js';

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
        const { data, error } = await supabase
            .from('veiculos')
            .select('placa')
            .not('placa', 'is', null); // Exclui registros onde placa é nula

        if (error) {
            console.error('Erro ao buscar placas:', error);
            datalistPlacas.innerHTML = '<option value="Erro ao carregar placas">';
            return;
        }

        // Limpa opções existentes
        datalistPlacas.innerHTML = '';

        // Adiciona as placas como opções
        data.forEach(veiculo => {
            const option = document.createElement('option');
            option.value = veiculo.placa;
            datalistPlacas.appendChild(option);
        });

        console.log('Placas carregadas com sucesso:', data.length);
    } catch (err) {
        console.error('Erro inesperado ao carregar placas:', err);
        datalistPlacas.innerHTML = '<option value="Erro ao carregar placas">';
    }
}

document.getElementById("supervisor").value

const tablesContainer = document.getElementById("tables");
const resumoDiv = document.getElementById("resumo");
const btnAtualizar = document.getElementById("btnAtualizar");

let grids = []; // Armazena todos os dados carregados (para recalcular depois)
let motivos = {}; // Armazena totais de motivos
// Lista fixa de equipamentos
const equipamentosFixos = [
    'ARMÁRIO',
    'ARMÁRIO 60X40',
    'ARMÁRIO INOX',
    'ARMÁRIO 10 ESTEIRAS',
    'ARMÁRIO 16 ESTEIRAS',
    'CÂMARA FRIA',
    'CLIMA DE 20',
    'CLIMA DE 40',
    'ESQUELETO',
    'ESTEIRAS',
    'FORMA LISA',
    'FORNO DE 5 A GÁS',
    'FORNO DE 5 ELÉTRICA',
    'FORNO DE 8 A GÁS',
    'FORNO DE 8 ELÉTRICO',
    'FREEZER',
    'FREZZER VERTICAL',
    'MOINHO'
];

function recalcularTotais() {
    let totalEquip_Carreg = 0, totalNovos_Carreg = 0, totalUsados_Carreg = 0;
    let totalEquip_Retorno = 0, totalNovos_Retorno = 0, totalUsados_Retorno = 0;

    grids.forEach(grid => {
        grid.rows.forEach(r => {
            const qtd = parseFloat(r[0]) || 0;
            const nMark = r[3].toString().trim().toUpperCase();
            const uMark = r[4].toString().trim().toUpperCase();
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

btnAtualizar.addEventListener("click", recalcularTotais);
document.getElementById("btnGerarXLS").addEventListener("click", gerarXLSResumo);

document.getElementById("fileUpload").addEventListener("change", function(e) {
    const files = e.target.files;
    tablesContainer.innerHTML = "";
    resumoDiv.innerHTML = "";
    grids = [];
    motivos = {};

    for (const file of files) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, {type: 'array'});

            const name = file.name.toUpperCase();
            const isCarregamento = name.includes("(NOVO)") || name.includes("(TROCA)") || name.includes("(AMT)");
            const isRetorno = name.includes("(RP)") || name.includes("(RT)") || (name.includes("(RT)") && name.includes("(RP)")) || name.includes("(RE)");
            const isNovo = name.includes("(NOVO)");

            const cfg = isNovo
              ? { sheet: "REQUERIMENTO", motivoCell: "K9", startRow: 13, endRow: 23, startCol: 2, endCol: 6,
                  headers: ["QTD","EQUIP","MOD.","N","U"], filterQtd: true }
              : { sheet: "REQUERIMENTO MANUAL", motivoCell: "K8", startRow: 11, endRow: 21, startCol: 1, endCol: 5,
                  headers: ["QTD","EQUIP","MOD.","N","U"], filterQtd: false };

            if (!workbook.SheetNames.includes(cfg.sheet)) {
                tablesContainer.innerHTML += `<p style="color:red;text-align:center;">
                  ❌ O arquivo <b>${file.name}</b> não possui a aba "${cfg.sheet}".
                </p>`;
                return;
            }

            const sheet = workbook.Sheets[cfg.sheet];
            const motivoCell = sheet[cfg.motivoCell];
            const motivo = motivoCell ? motivoCell.v : "Não informado";

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
                if (linha.some(v => v !== "")) rows.push(linha);
            }

            // Adicionar equipamentos à lista (agora usa lista fixa)
            // Não é mais necessário adicionar dinamicamente

            // Armazena para futuros cálculos
            grids.push({
                type: isCarregamento ? "carregamento" : (isRetorno ? "retorno" : "outro"),
                rows: rows
            });

            // Contar motivos baseado no nome do arquivo
            if (name.includes("(NOVO)")) {
                motivos["CLIENTE NOVO"] = (motivos["CLIENTE NOVO"] || 0) + 1;
            }
            if (name.includes("(AM)")) {
                motivos["AUMENTO"] = (motivos["AUMENTO"] || 0) + 1;
            }
            if (name.includes("(AMT)") || name.includes("(TROCA)") || name.includes("(TROCA+RP)")) {
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
            let html = `<h4>Arquivo: ${file.name}</h4>`;
            html += `<div class="motivo-box">Motivo: ${motivo}</div>`;
            html += `<div class="data-table"><table data-index="${grids.length - 1}"><thead><tr>`;
            cfg.headers.forEach(h => html += `<th>${h}</th>`);
            html += `<th>Ações</th></tr></thead><tbody>`;

            rows.forEach((row, i) => {
                html += `<tr data-row="${i}">`;
                row.forEach((cell, j) => {
                    if (j === 0) { // QTD column - make it disabled
                        html += `<td contenteditable="false" style="background-color: #f0f0f0;">${cell}</td>`;
                    } else if (j === 1) { // EQUIP column
                        html += `<td><select class="equip-dropdown">${equipamentosFixos.map(equip => `<option value="${equip}" ${cell === equip ? 'selected' : ''}>${equip}</option>`).join('')}</select></td>`;
                    } else if (j === 2) { // MOD column - make it disabled
                        html += `<td contenteditable="false" style="background-color: #f0f0f0;">${cell}</td>`;
                    } else if (j === 3 || j === 4) {
                        html += `<td contenteditable="true">${cell}</td>`;
                    } else {
                        html += `<td>${cell}</td>`;
                    }
                });
                html += `<td><button class="edit-row-btn" data-grid="${grids.length - 1}" data-row="${i}">✏️</button> <button class="delete-row-btn" data-grid="${grids.length - 1}" data-row="${i}">🗑️</button></td>`;
                html += "</tr>";
            });
            html += "</tbody></table></div>";
            html += `<button class="add-row-btn" data-index="${grids.length - 1}">Adicionar Linha</button>`;

            tablesContainer.innerHTML += html;
        };
        reader.readAsArrayBuffer(file);
    }
});

// Escuta alterações nas células editáveis
tablesContainer.addEventListener("input", function(e) {
    const td = e.target.closest("td[contenteditable]");
    if (!td) return;

    const tr = td.parentElement;
    const table = td.closest("table");
    const gridIndex = parseInt(table.dataset.index);
    const rowIndex = parseInt(tr.dataset.row);
    const cellIndex = [...tr.children].indexOf(td);

    grids[gridIndex].rows[rowIndex][cellIndex] = td.innerText.trim().toUpperCase();

    // Atualiza automaticamente ao digitar:
    recalcularTotais();
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

// Função para gerar XLS de resumo
function gerarXLSResumo() {
    if (grids.length === 0) {
        alert('Nenhum dado carregado. Importe arquivos primeiro.');
        return;
    }

    // Obter dados do formulário
    const semana = document.getElementById('semana').value || 'Não informado';
    const data = document.getElementById('data').value || 'Não informado';
    const placa = document.getElementById('placa').value || 'Não informado';
    const motorista = document.getElementById('motorista').value || 'Não informado';
    const conferente = document.getElementById('conferente').value || 'Não informado';
    const supervisor = document.getElementById('supervisor').value || 'Não informado';

    // Lista de equipamentos fixos
    const equipamentosFixos = [
        'ARMÁRIO',
        'ARMÁRIO 60X40',
        'ARMÁRIO INOX',
        'ARMÁRIO 10 ESTEIRAS',
        'ARMÁRIO 16 ESTEIRAS',
        'CÂMARA FRIA',
        'CLIMA DE 20',
        'CLIMA DE 40',
        'ESQUELETO',
        'ESTEIRAS',
        'FORMA LISA',
        'FORNO DE 5 A GÁS',
        'FORNO DE 5 ELÉTRICA',
        'FORNO DE 8 A GÁS',
        'FORNO DE 8 ELÉTRICO',
        'FREEZER',
        'FREZZER VERTICAL',
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
            const equip = r[1].toString().trim().toUpperCase(); // EQUIP
            const qtd = parseFloat(r[0]) || 0;
            const nMark = r[3].toString().trim().toUpperCase();
            const uMark = r[4].toString().trim().toUpperCase();

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
        ['Data:', data],
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
        <td><button class="delete-row-btn" data-grid="${gridIndex}" data-row="${grids[gridIndex].rows.length - 1}">🗑️</button></td>
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
document.addEventListener('DOMContentLoaded', function() {
    console.log('Inicializando página de importação XLSX...');
    preencherConferente();
    preencherPlacas(); // Carrega as placas do banco de dados
});
