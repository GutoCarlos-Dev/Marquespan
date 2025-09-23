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

document.getElementById("supervisor").value

const tablesContainer = document.getElementById("tables");
const resumoDiv = document.getElementById("resumo");
const btnAtualizar = document.getElementById("btnAtualizar");

let grids = []; // Armazena todos os dados carregados (para recalcular depois)

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

document.getElementById("fileUpload").addEventListener("change", function(e) {
    const files = e.target.files;
    tablesContainer.innerHTML = "";
    resumoDiv.innerHTML = "";
    grids = [];

    for (const file of files) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, {type: 'array'});

            const name = file.name.toUpperCase();
            const isCarregamento = name.includes("(NOVO)") || name.includes("(TROCA)") || name.includes("(AMT)");
            const isRetorno = name.includes("(RP)") || name.includes("(RT)");
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

            // Armazena para futuros cálculos
            grids.push({
                type: isCarregamento ? "carregamento" : (isRetorno ? "retorno" : "outro"),
                rows: rows
            });

            // Cria tabela HTML
            let html = `<h4>Arquivo: ${file.name}</h4>`;
            html += `<div class="motivo-box">Motivo: ${motivo}</div>`;
            html += `<div class="data-table"><table data-index="${grids.length - 1}"><thead><tr>`;
            cfg.headers.forEach(h => html += `<th>${h}</th>`);
            html += "</tr></thead><tbody>";

            rows.forEach((row, i) => {
                html += `<tr data-row="${i}">`;
                row.forEach((cell, j) => {
                    if (j === 3 || j === 4) {
                        html += `<td contenteditable="true">${cell}</td>`;
                    } else {
                        html += `<td>${cell}</td>`;
                    }
                });
                html += "</tr>";
            });
            html += "</tbody></table></div>";

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

// Inicialização quando a página carrega
document.addEventListener('DOMContentLoaded', function() {
    console.log('Inicializando página de importação XLSX...');
    preencherConferente();
});
