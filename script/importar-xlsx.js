/**
 * Script para Importação de XLSX - Marquespan
 * Funcionalidades:
 * - Upload e processamento de arquivos XLSX
 * - Extração de dados de planilhas
 * - Cálculo de totais automáticos
 * - Interface responsiva e moderna
 */

class ImportarXLSX {
    constructor() {
        this.tablesContainer = document.getElementById("tables");
        this.resumoDiv = document.getElementById("resumo");
        this.btnAtualizar = document.getElementById("btnAtualizar");
        this.grids = []; // Armazena todos os dados carregados

        this.init();
    }

    init() {
        this.setupEventListeners();
        this.preencherConferente();
    }

    setupEventListeners() {
        // Botão atualizar totais
        this.btnAtualizar.addEventListener("click", () => this.recalcularTotais());

        // Upload de arquivos
        document.getElementById("fileUpload").addEventListener("change", (e) => this.handleFileUpload(e));

        // Edição de células
        this.tablesContainer.addEventListener("input", (e) => this.handleCellEdit(e));
    }

    preencherConferente() {
        // Preenche o campo conferente com o usuário logado
        const usuario = JSON.parse(localStorage.getItem('usuarioLogado'));
        if (usuario && usuario.nome) {
            document.getElementById('conferente').value = usuario.nome.toUpperCase();
        }
    }

    async handleFileUpload(event) {
        const files = event.target.files;
        this.tablesContainer.innerHTML = "";
        this.resumoDiv.innerHTML = "";
        this.grids = [];

        // Mostra loading
        this.tablesContainer.innerHTML = '<div class="loading" style="text-align: center; padding: 40px;">Processando arquivos...</div>';

        for (const file of files) {
            await this.processFile(file);
        }

        // Remove loading
        const loading = this.tablesContainer.querySelector('.loading');
        if (loading) loading.remove();

        // Calcula totais iniciais
        this.recalcularTotais();
    }

    async processFile(file) {
        return new Promise((resolve) => {
            const reader = new FileReader();

            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });

                    const fileName = file.name.toUpperCase();
                    const isCarregamento = name.includes("(NOVO)") || name.includes("(TROCA)") || name.includes("(AMT)");
                    const isRetorno = name.includes("(RP)") || name.includes("(RT)");
                    const isNovo = name.includes("(NOVO)");

                    const config = this.getConfig(isNovo);

                    if (!workbook.SheetNames.includes(config.sheet)) {
                        this.showError(`O arquivo ${file.name} não possui a aba "${config.sheet}".`);
                        resolve();
                        return;
                    }

                    const sheet = workbook.Sheets[config.sheet];
                    const motivo = this.getMotivo(sheet, config.motivoCell);
                    const rows = this.extractRows(sheet, config);

                    if (rows.length === 0) {
                        this.showError(`Nenhum dado encontrado no arquivo ${file.name}.`);
                        resolve();
                        return;
                    }

                    // Armazena dados para cálculos
                    this.grids.push({
                        type: isCarregamento ? "carregamento" : (isRetorno ? "retorno" : "outro"),
                        rows: rows,
                        fileName: file.name
                    });

                    // Cria tabela HTML
                    this.createTableHTML(file.name, motivo, rows, this.grids.length - 1);

                    resolve();
                } catch (error) {
                    console.error('Erro ao processar arquivo:', error);
                    this.showError(`Erro ao processar arquivo ${file.name}: ${error.message}`);
                    resolve();
                }
            };

            reader.readAsArrayBuffer(file);
        });
    }

    getConfig(isNovo) {
        return isNovo
            ? {
                sheet: "REQUERIMENTO",
                motivoCell: "K9",
                startRow: 13,
                endRow: 23,
                startCol: 2,
                endCol: 6,
                headers: ["QTD", "EQUIP", "MOD.", "N", "U"],
                filterQtd: true
            }
            : {
                sheet: "REQUERIMENTO MANUAL",
                motivoCell: "K8",
                startRow: 11,
                endRow: 21,
                startCol: 1,
                endCol: 5,
                headers: ["QTD", "EQUIP", "MOD.", "N", "U"],
                filterQtd: false
            };
    }

    getMotivo(sheet, motivoCell) {
        const cell = sheet[motivoCell];
        return cell ? cell.v : "Não informado";
    }

    extractRows(sheet, config) {
        const rows = [];

        for (let r = config.startRow; r <= config.endRow; r++) {
            const linha = [];

            for (let c = config.startCol; c <= config.endCol; c++) {
                const cellAddress = XLSX.utils.encode_cell({ r: r - 1, c: c });
                const cell = sheet[cellAddress];
                linha.push(cell ? cell.v : "");
            }

            const qtd = parseFloat(linha[0]) || 0;
            if (config.filterQtd && qtd <= 0) continue;
            if (linha.some(v => v !== "")) rows.push(linha);
        }

        return rows;
    }

    createTableHTML(fileName, motivo, rows, gridIndex) {
        let html = `
            <div class="tables-section">
                <h4 style="text-align: center; color: #333; margin-bottom: 10px;">📁 ${fileName}</h4>
                <div class="motivo-box">Motivo: ${motivo}</div>
                <div class="data-table">
                    <table data-index="${gridIndex}">
                        <thead>
                            <tr>
        `;

        const config = this.getConfig(fileName.toUpperCase().includes("(NOVO)"));
        config.headers.forEach(header => {
            html += `<th>${header}</th>`;
        });

        html += `
                            </tr>
                        </thead>
                        <tbody>
        `;

        rows.forEach((row, rowIndex) => {
            html += `<tr data-row="${rowIndex}">`;
            row.forEach((cell, cellIndex) => {
                if (cellIndex === 3 || cellIndex === 4) { // Colunas N e U
                    html += `<td contenteditable="true">${cell}</td>`;
                } else {
                    html += `<td>${cell}</td>`;
                }
            });
            html += `</tr>`;
        });

        html += `
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        this.tablesContainer.insertAdjacentHTML('beforeend', html);
    }

    handleCellEdit(event) {
        const td = event.target.closest("td[contenteditable]");
        if (!td) return;

        const tr = td.parentElement;
        const table = td.closest("table");
        const gridIndex = parseInt(table.dataset.index);
        const rowIndex = parseInt(tr.dataset.row);
        const cellIndex = [...tr.children].indexOf(td);

        // Atualiza os dados no grid
        this.grids[gridIndex].rows[rowIndex][cellIndex] = td.innerText.trim().toUpperCase();

        // Recalcula totais automaticamente
        this.recalcularTotais();
    }

    recalcularTotais() {
        let totalEquip_Carreg = 0, totalNovos_Carreg = 0, totalUsados_Carreg = 0;
        let totalEquip_Retorno = 0, totalNovos_Retorno = 0, totalUsados_Retorno = 0;

        this.grids.forEach(grid => {
            grid.rows.forEach(row => {
                const qtd = parseFloat(row[0]) || 0;
                const nMark = row[3] ? row[3].toString().trim().toUpperCase() : "";
                const uMark = row[4] ? row[4].toString().trim().toUpperCase() : "";
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

        this.renderResumo(totalEquip_Carreg, totalNovos_Carreg, totalUsados_Carreg,
                         totalEquip_Retorno, totalNovos_Retorno, totalUsados_Retorno);
    }

    renderResumo(carregEquip, carregNovos, carregUsados, retornoEquip, retornoNovos, retornoUsados) {
        this.resumoDiv.innerHTML = `
            <div class="resumo-section">
                <div class="resumo-card">
                    <h3>🚚 Carregamento (NOVO/TROCA/AMT)</h3>
                    <p><b>Total de Equipamentos:</b> <span class="total">${carregEquip}</span></p>
                    <p><b>Novos (N):</b> <span class="total">${carregNovos}</span></p>
                    <p><b>Usados (U):</b> <span class="total">${carregUsados}</span></p>
                </div>
                <div class="resumo-card">
                    <h3>🔄 Retorno (RP/RT)</h3>
                    <p><b>Total de Equipamentos:</b> <span class="total">${retornoEquip}</span></p>
                    <p><b>Novos (N):</b> <span class="total">${retornoNovos}</span></p>
                    <p><b>Usados (U):</b> <span class="total">${retornoUsados}</span></p>
                </div>
            </div>
        `;
    }

    showError(message) {
        const errorDiv = document.createElement('div');
        errorDiv.style.cssText = `
            background: #fed7d7;
            color: #c53030;
            padding: 15px;
            border-radius: 8px;
            margin: 10px 0;
            border-left: 4px solid #c53030;
            text-align: center;
        `;
        errorDiv.textContent = message;
        this.tablesContainer.appendChild(errorDiv);
    }
}

// Inicializa quando o DOM estiver carregado
document.addEventListener('DOMContentLoaded', () => {
    new ImportarXLSX();
});
