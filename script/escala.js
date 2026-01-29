// Importa o cliente Supabase, assumindo que ele está configurado em supabase.js
import { supabaseClient } from './supabase.js';

document.addEventListener('DOMContentLoaded', () => {
    console.log('Página de Controle de Escala carregada.');

    // Proteção de página: verifica se o usuário está logado
    const usuarioLogado = JSON.parse(localStorage.getItem('usuarioLogado'));
    if (!usuarioLogado) {
        alert('Acesso negado. Por favor, faça login.');
        window.location.href = '../index.html'; // Redireciona para a página de login na raiz
        return;
    }

    // --- ELEMENTOS DO DOM ---
    const selectSemana = document.getElementById('escalaSemana');
    const btnAbrirEscala = document.getElementById('btnAbrirEscala');
    const painelEscala = document.getElementById('painelEscala');
    const tituloDia = document.getElementById('tituloDia');
    const tabButtons = document.querySelectorAll('.tab-btn');
    const btnBaixarModelo = document.getElementById('btnBaixarModelo');
    const btnImportar = document.getElementById('btnImportar');
    const fileImportar = document.getElementById('fileImportar');

    // --- CACHE DE DATAS ---
    const CACHE_DATAS = {};

    function preencherCacheDatas() {
        const anoAtual = new Date().getFullYear();
        for (let i = 1; i <= 53; i++) {
            const semanaStr = `SEMANA ${String(i).padStart(2, '0')}`;
            const monday = getMondayOfIsoWeek(i, anoAtual);
            
            CACHE_DATAS[semanaStr] = {
                'SEGUNDA':  addDays(monday, 0),
                'TERCA':    addDays(monday, 1),
                'QUARTA':   addDays(monday, 2),
                'QUINTA':   addDays(monday, 3),
                'SEXTA':    addDays(monday, 4),
                'SABADO':   addDays(monday, 5),
                'DOMINGO':  addDays(monday, 6)
            };
        }
    }

    function addDays(date, days) {
        const result = new Date(date);
        result.setUTCDate(result.getUTCDate() + days);
        return result;
    }

    // --- DADOS LOCAIS (Para Importação) ---
    let DADOS_LOCAL = {}; // Estrutura: { 'SEMANA XX': { 'SEGUNDA': { 'Padrao': [], ... } } }

    // --- FUNÇÕES ---

    /**
     * Calcula o número da semana atual do ano.
     * @param {Date} d - A data atual.
     * @returns {number} O número da semana.
     */
    function getWeekNumber(d) {
        d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
        d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
        return weekNo;
    }

    /**
     * Popula o select de semanas com as 52 semanas do ano e seleciona a atual.
     */
    function carregarSemanas() {
        const semanaAtual = getWeekNumber(new Date());
        selectSemana.innerHTML = ''; // Limpa opções existentes

        for (let i = 1; i <= 52; i++) {
            const nomeSemana = `SEMANA ${String(i).padStart(2, '0')}`;
            const option = new Option(nomeSemana, nomeSemana);
            selectSemana.appendChild(option);
        }
        selectSemana.value = `SEMANA ${String(semanaAtual).padStart(2, '0')}`;
    }

    /**
     * Gets the date of the Monday of a given ISO week number and year.
     * @param {number} weekNum The week number (1-53).
     * @param {number} year The year.
     * @returns {Date} The date of the Monday of that week.
     */
    function getMondayOfIsoWeek(weekNum, year) {
        // January 4th is always in week 1
        const d = new Date(Date.UTC(year, 0, 4));
        // Get the day of week, with Sunday as 7
        const dayOfWeek = d.getUTCDay() || 7;
        // Set to the Monday of the week of Jan 4th and add the weeks
        d.setUTCDate(d.getUTCDate() + (weekNum - 1) * 7 - dayOfWeek + 1);
        return d;
    }

    /**
     * Carrega os dados da escala para o dia e semana selecionados.
     * @param {string} dia - O dia da semana (ex: 'SEGUNDA').
     * @param {string} semana - A semana selecionada (ex: 'SEMANA 01').
     */
    async function carregarDadosDia(dia, semana) {
        // IDs das 5 seções
        const sections = ['Padrao', 'Transferencia', 'Equipamento', 'Reservas', 'Faltas'];
        sections.forEach(sec => {
            const tbody = document.getElementById(`tbody${sec}`);
            if(tbody) tbody.innerHTML = '<tr><td colspan="7" style="text-align: center;">Carregando...</td></tr>';
        });

        const coresDia = {
            'SEGUNDA': '#007bff',
            'TERCA': '#fd7e14',
            'QUARTA': '#28a745',
            'QUINTA': '#6f42c1',
            'SEXTA': '#dc3545',
            'SABADO': '#17a2b8',
            'DOMINGO': '#e83e8c'
        };
        tituloDia.style.color = coresDia[dia] || '#006937';

        // Usa o cache para obter a data sem recalcular
        const dataDia = CACHE_DATAS[semana] ? CACHE_DATAS[semana][dia] : new Date();
        
        const currentDate = new Date(dataDia);
        const formattedDate = currentDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const diaNome = dia === 'TERCA' ? 'TERÇA' : dia;
        tituloDia.innerHTML = `<i class="fa-solid fa-calendar-day"></i> ${diaNome} - ${formattedDate}`;

        // Verifica se há dados locais importados para esta semana e dia
        const dadosSemana = DADOS_LOCAL[semana];
        const dadosDia = dadosSemana ? dadosSemana[dia] : null;

        sections.forEach(sec => {
            const tbody = document.getElementById(`tbody${sec}`);
            if (!tbody) return;

            tbody.innerHTML = '';

            // Se houver dados importados para esta seção
            if (dadosDia && dadosDia[sec] && dadosDia[sec].length > 0) {
                dadosDia[sec].forEach(item => {
                    const tr = document.createElement('tr');
                    if (sec === 'Faltas') {
                        tr.innerHTML = `
                            <td>${item.NOME || ''}</td>
                            <td>${item.FUNCAO || ''}</td>
                            <td>${item.MOTIVO || ''}</td>
                            <td>${item.DATA_INICIO || ''}</td>
                            <td>${item.DATA_FIM || ''}</td>
                            <td>${item.OBSERVACAO || ''}</td>
                            <td><button class="btn-acao excluir" title="Remover"><i class="fas fa-trash"></i></button></td>
                        `;
                    } else {
                        tr.innerHTML = `
                            <td>${item.PLACA || ''}</td>
                            <td>${item.MODELO || ''}</td>
                            <td>${item.ROTA || ''}</td>
                            <td>${item.STATUS || ''}</td>
                            <td>${item.MOTORISTA || ''}</td>
                            <td>${item.AUXILIAR || ''}</td>
                            <td>${item.TERCEIRO || ''}</td>
                        `;
                    }
                    tbody.appendChild(tr);
                });
            } else {
                // Se não houver dados, mostra mensagem padrão
                tbody.innerHTML = `<tr><td colspan="7" style="text-align: center;">Nenhum registro em ${sec.toUpperCase()}.</td></tr>`;
            }
        });
    }

    /**
     * Gera e baixa o modelo Excel para importação.
     */
    function baixarModeloExcel() {
        const wb = XLSX.utils.book_new();

        // Aba 1: Veículos (Padrão, Transferência, Equipamento, Reservas)
        const headersVeiculos = ['DIA', 'SECAO', 'PLACA', 'MODELO', 'ROTA', 'STATUS', 'MOTORISTA', 'AUXILIAR', 'TERCEIRO'];
        const dataVeiculos = [
            ['SEGUNDA', 'PADRAO', 'ABC1234', 'TRUCK', 'ROTA 01', 'OK', 'JOAO SILVA', 'MARIA', 'NAO'],
            ['SEGUNDA', 'TRANSFERENCIA CD', 'XYZ9876', 'CARRETA', 'ROTA 02', 'MANUTENCAO', 'PEDRO', '', 'SIM'],
            ['TERCA', 'EQUIPAMENTO', 'EQP001', 'EMPILHADEIRA', '', 'OK', '', '', '']
        ];
        const wsVeiculos = XLSX.utils.aoa_to_sheet([headersVeiculos, ...dataVeiculos]);
        XLSX.utils.book_append_sheet(wb, wsVeiculos, "Veiculos");

        // Aba 2: Faltas/Férias
        const headersFaltas = ['DIA', 'NOME', 'FUNCAO', 'MOTIVO', 'DATA_INICIO', 'DATA_FIM', 'OBSERVACAO'];
        const dataFaltas = [
            ['SEGUNDA', 'CARLOS SOUZA', 'MOTORISTA', 'FERIAS', '01/01/2025', '30/01/2025', 'Ferias anuais']
        ];
        const wsFaltas = XLSX.utils.aoa_to_sheet([headersFaltas, ...dataFaltas]);
        XLSX.utils.book_append_sheet(wb, wsFaltas, "Faltas");

        XLSX.writeFile(wb, "Modelo_Importacao_Escala.xlsx");
    }

    /**
     * Processa o arquivo Excel importado.
     */
    async function importarExcel(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (evt) => {
            const data = new Uint8Array(evt.target.result);
            const workbook = XLSX.read(data, { type: 'array' });

            const semanaAtual = selectSemana.value;
            if (!DADOS_LOCAL[semanaAtual]) DADOS_LOCAL[semanaAtual] = {};

            // Processar Aba Veículos
            const sheetVeiculos = workbook.Sheets["Veiculos"];
            if (sheetVeiculos) {
                const jsonVeiculos = XLSX.utils.sheet_to_json(sheetVeiculos);
                jsonVeiculos.forEach(row => {
                    const dia = row.DIA ? row.DIA.toUpperCase().trim() : 'SEGUNDA';
                    // Mapeia o nome da seção do Excel para o ID interno
                    let secao = 'Padrao';
                    const secaoExcel = row.SECAO ? row.SECAO.toUpperCase().trim() : '';
                    if (secaoExcel.includes('TRANSFERENCIA')) secao = 'Transferencia';
                    else if (secaoExcel.includes('EQUIPAMENTO')) secao = 'Equipamento';
                    else if (secaoExcel.includes('RESERVA')) secao = 'Reservas';

                    if (!DADOS_LOCAL[semanaAtual][dia]) DADOS_LOCAL[semanaAtual][dia] = {};
                    if (!DADOS_LOCAL[semanaAtual][dia][secao]) DADOS_LOCAL[semanaAtual][dia][secao] = [];

                    DADOS_LOCAL[semanaAtual][dia][secao].push(row);
                });
            }

            // Processar Aba Faltas
            const sheetFaltas = workbook.Sheets["Faltas"];
            if (sheetFaltas) {
                const jsonFaltas = XLSX.utils.sheet_to_json(sheetFaltas);
                jsonFaltas.forEach(row => {
                    const dia = row.DIA ? row.DIA.toUpperCase().trim() : 'SEGUNDA';
                    if (!DADOS_LOCAL[semanaAtual][dia]) DADOS_LOCAL[semanaAtual][dia] = {};
                    if (!DADOS_LOCAL[semanaAtual][dia]['Faltas']) DADOS_LOCAL[semanaAtual][dia]['Faltas'] = [];
                    DADOS_LOCAL[semanaAtual][dia]['Faltas'].push(row);
                });
            }

            alert('Dados importados com sucesso! Verifique as abas dos dias.');
            // Recarrega o dia atual para mostrar os dados
            const diaAtivo = document.querySelector('.tab-btn.active').dataset.dia;
            carregarDadosDia(diaAtivo, semanaAtual);
            
            // Limpa o input para permitir importar o mesmo arquivo novamente se necessário
            fileImportar.value = '';
        };
        reader.readAsArrayBuffer(file);
    }

    // --- EVENT LISTENERS ---

    // Botão Abrir Escala
    if (btnAbrirEscala) {
        btnAbrirEscala.addEventListener('click', () => {
            const semanaSelecionada = selectSemana.value;
            if (!semanaSelecionada) {
                alert('Por favor, selecione uma semana.');
                return;
            }

            // Usa o cache para atualizar as abas
            const dadosSemana = CACHE_DATAS[semanaSelecionada];

            tabButtons.forEach(btn => {
                const dia = btn.dataset.dia;
                const currentDate = dadosSemana ? dadosSemana[dia] : new Date();
                const formattedDate = currentDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
                
                const diaNome = btn.textContent.split(' ')[0].replace(/\d/g, '').replace(/\//g, '').trim();
                btn.innerHTML = `${diaNome} <span class="tab-date">${formattedDate}</span>`;
            });
            // --- FIM DA NOVA LÓGICA ---

            painelEscala.classList.remove('hidden');
            
            // Ativa a primeira aba (SEGUNDA) por padrão
            const abaSegunda = document.querySelector('.tab-btn[data-dia="SEGUNDA"]');
            if (abaSegunda) abaSegunda.click();
        });
    }

    // Navegação por Abas
    tabButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            // Remove classe active de todos
            tabButtons.forEach(b => b.classList.remove('active'));
            // Adiciona ao clicado
            e.target.classList.add('active');
            
            const dia = e.target.dataset.dia;
            const semana = selectSemana.value;
            carregarDadosDia(dia, semana);
        });
    });

    if (btnBaixarModelo) {
        btnBaixarModelo.addEventListener('click', baixarModeloExcel);
    }

    if (btnImportar && fileImportar) {
        btnImportar.addEventListener('click', () => fileImportar.click());
        fileImportar.addEventListener('change', importarExcel);
    }

    // --- INICIALIZAÇÃO ---
    carregarSemanas();
    preencherCacheDatas();
});