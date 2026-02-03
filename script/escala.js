// Importa o cliente Supabase, assumindo que ele está configurado em supabase.js
import { supabaseClient } from './supabase.js';

document.addEventListener('DOMContentLoaded', () => {
    console.log('Página de Controle de Escala carregada.');

    // Proteção de página: verifica se o usuário está logado
    const usuarioLogado = JSON.parse(localStorage.getItem('usuarioLogado'));
    if (!usuarioLogado) {
        alert('Acesso negado. Por favor, faça login.');
        window.location.href = 'index.html'; // Redireciona para a página de login na raiz
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
    const fileImportarDia = document.getElementById('fileImportarDia');
    const btnSalvar = document.getElementById('btnSalvar');
    const btnPDF = document.getElementById('btnPDF');
    
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
    
    // Tenta carregar dados salvos anteriormente
    try {
        const savedData = localStorage.getItem('marquespan_escala_dados');
        if (savedData) DADOS_LOCAL = JSON.parse(savedData);
    } catch (e) { console.error('Erro ao carregar dados locais:', e); }

    // --- CACHE DE VEÍCULOS ---
    let listaVeiculos = [];
    let listaRotas = [];

    /**
     * Carrega a lista de veículos ativos do banco de dados para popular os seletores.
     */
    async function carregarVeiculos() {
        try {
            const { data, error } = await supabaseClient
                .from('veiculos')
                .select('placa, modelo')
                .eq('situacao', 'ativo')
                .order('placa');

            if (error) throw error;
            
            listaVeiculos = data || [];
            
            const datalistPlacas = document.getElementById('listaVeiculos');
            const datalistModelos = document.getElementById('listaModelos');

            if (datalistPlacas) {
                datalistPlacas.innerHTML = data.map(v => `<option value="${v.placa}">`).join('');
            }

            if (datalistModelos) {
                // Filtra modelos únicos e não vazios
                const modelosUnicos = [...new Set(data.map(v => v.modelo).filter(m => m))];
                datalistModelos.innerHTML = modelosUnicos.map(m => `<option value="${m}">`).join('');
            }

        } catch (error) {
            console.error('Erro ao carregar veículos:', error);
        }
    }

    /**
     * Carrega a lista de rotas do banco de dados para popular o seletor.
     */
    async function carregarRotas() {
        try {
            const { data, error } = await supabaseClient
                .from('rotas')
                .select('numero')
                .order('numero');

            if (error) throw error;

            listaRotas = data || [];
            const datalistRotas = document.getElementById('listaRotas');
            if (datalistRotas) {
                const rotasUnicas = [...new Set(data.map(r => r.numero).filter(r => r))];
                datalistRotas.innerHTML = rotasUnicas.map(r => `<option value="${r}">`).join('');
            }
        } catch (error) {
            console.error('Erro ao carregar rotas:', error);
        }
    }

    /**
     * Carrega a lista de funcionários ativos do banco de dados para popular os seletores.
     */
    async function carregarFuncionarios() {
        try {
            const { data, error } = await supabaseClient
                .from('funcionario')
                .select('nome_completo, funcao')
                .eq('status', 'Ativo')
                .order('nome_completo');

            if (error) throw error;

            const datalistMotoristas = document.getElementById('listaMotoristas');
            const datalistAuxiliares = document.getElementById('listaAuxiliares');
            const datalistTerceiros = document.getElementById('listaTerceiros');

            if (datalistMotoristas) datalistMotoristas.innerHTML = '';
            if (datalistAuxiliares) datalistAuxiliares.innerHTML = '';
            if (datalistTerceiros) datalistTerceiros.innerHTML = '';

            const terceiros = [];

            data.forEach(func => {
                const nome = func.nome_completo;
                const funcao = func.funcao;

                if (funcao === 'Motorista') {
                    if (datalistMotoristas) datalistMotoristas.insertAdjacentHTML('beforeend', `<option value="${nome}">`);
                    terceiros.push(`(MOT-) ${nome}`);
                } else if (funcao === 'Auxiliar') {
                    if (datalistAuxiliares) datalistAuxiliares.insertAdjacentHTML('beforeend', `<option value="${nome}">`);
                    terceiros.push(`(AUX-) ${nome}`);
                }
            });
            
            terceiros.sort();
            if (datalistTerceiros) {
                datalistTerceiros.innerHTML = terceiros.map(t => `<option value="${t}">`).join('');
            }

        } catch (error) {
            console.error('Erro ao carregar funcionários:', error);
        }
    }

    // --- CONFIGURAÇÃO DE STATUS ---
    const STATUS_CONFIG = {
        'CNT SP': { color: '#FF9800', text: 'white' },
        'ZMRC': { color: '#F44336', text: 'white' },
        'ZMRC CPN': { color: '#B71C1C', text: 'white' },
        'V': { color: '#2196F3', text: 'white' },
        'P': { color: '#9C27B0', text: 'white' },
        'R': { color: '#4CAF50', text: 'white' },
        'V - RESTR': { color: '#3F51B5', text: 'white' },
        'RESTR': { color: '#795548', text: 'white' },
        'BGMN': { color: '#FFEB3B', text: 'black' },
        'TRI +': { color: '#E91E63', text: 'white' },
        '152/257': { color: '#00BCD4', text: 'black' },
        '194 TER': { color: '#009688', text: 'white' }
    };

    function carregarStatus() {
        const datalist = document.getElementById('listaStatus');
        if (datalist) {
            datalist.innerHTML = Object.keys(STATUS_CONFIG).map(s => `<option value="${s}">`).join('');
        }
    }

    function getStatusStyle(status) {
        const config = STATUS_CONFIG[status];
        if (config) {
            return `background-color: ${config.color}; color: ${config.text}; font-weight: bold;`;
        }
        return '';
    }

    function updateInputColor(input) {
        const style = getStatusStyle(input.value);
        input.style.cssText = style;
    }

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

        for (let i = 1; i <= 53; i++) {
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
            const colspan = sec === 'Faltas' ? 5 : 7;
            if(tbody) tbody.innerHTML = `<tr><td colspan="${colspan}" style="text-align: center;">Carregando...</td></tr>`;
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
        const formattedDate = currentDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
        const diaNome = dia === 'TERCA' ? 'TERÇA' : dia;
        tituloDia.innerHTML = `
            <div style="display: flex; align-items: center; gap: 10px;">
                <span><i class="fa-solid fa-calendar-day"></i> ${diaNome} - ${formattedDate}</span>
                <button id="btnImportarDiaAction" class="btn-primary" style="padding: 4px 10px; border-radius: 4px; border: none; cursor: pointer; font-size: 0.8em;" title="Importar Excel para este dia"><i class="fa-solid fa-plus"></i></button>
            </div>`;

        // Verifica se há dados locais importados para esta semana e dia
        const dadosSemana = DADOS_LOCAL[semana];
        const dadosDia = dadosSemana ? dadosSemana[dia] : null;

        sections.forEach(sec => {
            const tbody = document.getElementById(`tbody${sec}`);
            if (!tbody) return;

            tbody.innerHTML = '';

            // Se houver dados importados para esta seção
            if (dadosDia && dadosDia[sec] && dadosDia[sec].length > 0) {
                dadosDia[sec].forEach((item, index) => {
                    const tr = document.createElement('tr');
                    if (sec === 'Faltas') {
                        tr.innerHTML = `
                            <td><input type="text" list="listaMotoristas" class="table-input" value="${item.MOTORISTA || ''}" data-section="${sec}" data-row="${index}" data-key="MOTORISTA" placeholder="Motorista"></td>
                            <td contenteditable="true" data-section="${sec}" data-row="${index}" data-key="MOTIVO_MOTORISTA">${item.MOTIVO_MOTORISTA || ''}</td>
                            <td><input type="text" list="listaAuxiliares" class="table-input" value="${item.AUXILIAR || ''}" data-section="${sec}" data-row="${index}" data-key="AUXILIAR" placeholder="Auxiliar"></td>
                            <td contenteditable="true" data-section="${sec}" data-row="${index}" data-key="MOTIVO_AUXILIAR">${item.MOTIVO_AUXILIAR || ''}</td>
                            <td><button class="btn-acao excluir" title="Remover"><i class="fas fa-trash"></i></button></td>
                        `;
                    } else {
                        tr.innerHTML = `
                            <td><input type="text" list="listaVeiculos" class="table-input" value="${item.PLACA || ''}" data-section="${sec}" data-row="${index}" data-key="PLACA" placeholder="Placa"></td>
                            <td><input type="text" list="listaModelos" class="table-input" value="${item.MODELO || ''}" data-section="${sec}" data-row="${index}" data-key="MODELO" placeholder="Modelo"></td>
                            <td><input type="text" list="listaRotas" class="table-input" value="${item.ROTA || ''}" data-section="${sec}" data-row="${index}" data-key="ROTA" placeholder="Rota"></td>
                            <td><input type="text" list="listaStatus" class="table-input" value="${item.STATUS || ''}" data-section="${sec}" data-row="${index}" data-key="STATUS" placeholder="Status" style="${getStatusStyle(item.STATUS || '')}"></td>
                            <td><input type="text" list="listaMotoristas" class="table-input" value="${item.MOTORISTA || ''}" data-section="${sec}" data-row="${index}" data-key="MOTORISTA" placeholder="Motorista"></td>
                            <td><input type="text" list="listaAuxiliares" class="table-input" value="${item.AUXILIAR || ''}" data-section="${sec}" data-row="${index}" data-key="AUXILIAR" placeholder="Auxiliar"></td>
                            <td><input type="text" list="listaTerceiros" class="table-input" value="${item.TERCEIRO || ''}" data-section="${sec}" data-row="${index}" data-key="TERCEIRO" placeholder="Terceiro"></td>
                        `;
                    }
                    tbody.appendChild(tr);
                });
            } else {
                // Se não houver dados, mostra mensagem padrão
                const colspan = sec === 'Faltas' ? 5 : 7;
                tbody.innerHTML = `<tr><td colspan="${colspan}" style="text-align: center;">Nenhum registro em ${sec.toUpperCase()}.</td></tr>`;
            }
        });
    }

    /**
     * Gera e baixa o modelo Excel para importação.
     */
    function baixarModeloExcel() {
        const wb = XLSX.utils.book_new();

        // Definição das colunas padrão para veículos
        const headersVeiculos = ['PLACA', 'MODELO', 'ROTA', 'STATUS', 'MOTORISTA', 'AUXILIAR', 'TERCEIRO'];
        
        // 1. PADRÃO
        const wsPadrao = XLSX.utils.aoa_to_sheet([headersVeiculos]);
        XLSX.utils.book_append_sheet(wb, wsPadrao, "PADRAO");

        // 2. TRANSFERÊNCIA CD
        const wsTransf = XLSX.utils.aoa_to_sheet([headersVeiculos]);
        XLSX.utils.book_append_sheet(wb, wsTransf, "TRANSFERENCIA CD");

        // 3. EQUIPAMENTO
        const wsEquip = XLSX.utils.aoa_to_sheet([headersVeiculos]);
        XLSX.utils.book_append_sheet(wb, wsEquip, "EQUIPAMENTO");

        // 4. RESERVAS
        const wsReservas = XLSX.utils.aoa_to_sheet([headersVeiculos]);
        XLSX.utils.book_append_sheet(wb, wsReservas, "RESERVAS");

        // 5. FALTAS / FÉRIAS / AFASTADOS
        // Nota: Excel tem limite de caracteres para nome de aba e não aceita barras. Usaremos um nome simplificado.
        const headersFaltas = ['MOTORISTA', 'MOTIVO_MOTORISTA', 'AUXILIAR', 'MOTIVO_AUXILIAR'];
        const wsFaltas = XLSX.utils.aoa_to_sheet([headersFaltas]);
        XLSX.utils.book_append_sheet(wb, wsFaltas, "FALTAS");

        // Adiciona dados de exemplo na aba PADRAO para orientação
        XLSX.utils.sheet_add_aoa(wsPadrao, [
            ['ABC1234', 'TRUCK', 'ROTA 01', 'OK', 'JOAO SILVA', 'MARIA', 'NAO']
        ], { origin: -1 });
        
        XLSX.utils.sheet_add_aoa(wsFaltas, [['CARLOS SOUZA', 'FALTA', 'JOAO PEDRO', 'FERIAS']], { origin: -1 });

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
            // Obtém o dia ativo atual da interface (ex: 'SEGUNDA')
            const diaAtivo = document.querySelector('.tab-btn.active').dataset.dia;

            if (!DADOS_LOCAL[semanaAtual]) DADOS_LOCAL[semanaAtual] = {};
            if (!DADOS_LOCAL[semanaAtual][diaAtivo]) DADOS_LOCAL[semanaAtual][diaAtivo] = {};

            // Mapeamento de nomes de abas do Excel para IDs internos das seções
            const mapaAbas = {
                'PADRAO': 'Padrao',
                'PADRÃO': 'Padrao',
                'TRANSFERENCIA CD': 'Transferencia',
                'TRANSFERÊNCIA CD': 'Transferencia',
                'EQUIPAMENTO': 'Equipamento',
                'RESERVAS': 'Reservas',
                'FALTAS': 'Faltas',
                'FALTAS / FÉRIAS / AFASTADOS': 'Faltas'
            };

            let importouAlgo = false;

            // Itera sobre as abas do arquivo Excel
            workbook.SheetNames.forEach(sheetName => {
                const nomeNormalizado = sheetName.toUpperCase().trim();
                const secaoId = mapaAbas[nomeNormalizado];

                if (secaoId) {
                    const worksheet = workbook.Sheets[sheetName];
                    const json = XLSX.utils.sheet_to_json(worksheet);

                    if (json.length > 0) {
                        // Inicializa o array se não existir
                        if (!DADOS_LOCAL[semanaAtual][diaAtivo][secaoId]) {
                            DADOS_LOCAL[semanaAtual][diaAtivo][secaoId] = [];
                        }
                        // Adiciona os dados (substituindo ou appendando? Aqui estou appendando)
                        // Se quiser substituir, use = json;
                        DADOS_LOCAL[semanaAtual][diaAtivo][secaoId] = json;
                        importouAlgo = true;
                    }
                }
            });

            if (importouAlgo) {
                alert(`Dados importados com sucesso para ${diaAtivo}!`);
            } else {
                alert('Nenhuma aba correspondente encontrada no arquivo. Verifique se os nomes das abas estão corretos (PADRAO, TRANSFERENCIA CD, etc).');
            }

            // Recarrega o dia atual para mostrar os dados
            carregarDadosDia(diaAtivo, semanaAtual);
            
            // Limpa o input para permitir importar o mesmo arquivo novamente se necessário
            e.target.value = '';
        };
        reader.readAsArrayBuffer(file);
    }

    /**
     * Gera o PDF da escala completa da semana.
     */
    async function gerarPDF() {
        if (!window.jspdf) {
            alert('Biblioteca PDF não carregada. Verifique sua conexão.');
            return;
        }
        const { jsPDF } = window.jspdf;
        // Configuração A4 Paisagem com margens mínimas (5mm)
        const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
        
        const semana = selectSemana.value;
        const dadosSemana = DADOS_LOCAL[semana] || {};

        // Tenta carregar o logo
        try {
            const response = await fetch('logo.png');
            if (response.ok) {
                const blob = await response.blob();
                const reader = new FileReader();
                const base64data = await new Promise((resolve) => {
                    reader.onloadend = () => resolve(reader.result);
                    reader.readAsDataURL(blob);
                });
                // Logo no canto superior esquerdo
                doc.addImage(base64data, 'PNG', 5, 5, 40, 15);
            }
        } catch (e) {
            console.warn('Logo não carregado', e);
        }

        // Cabeçalho do Relatório
        doc.setFontSize(18);
        doc.text(`Escala Semanal - ${semana}`, 148.5, 15, { align: 'center' });
        doc.setFontSize(9);
        doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 292, 10, { align: 'right' });

        let finalY = 25;

        const dias = ['SEGUNDA', 'TERCA', 'QUARTA', 'QUINTA', 'SEXTA', 'SABADO', 'DOMINGO'];
        const secoes = [
            { id: 'Padrao', title: 'PADRÃO' },
            { id: 'Transferencia', title: 'TRANSFERÊNCIA CD' },
            { id: 'Equipamento', title: 'EQUIPAMENTO' },
            { id: 'Reservas', title: 'RESERVAS' },
            { id: 'Faltas', title: 'FALTAS / FÉRIAS / AFASTADOS' }
        ];

        let hasContent = false;

        for (const dia of dias) {
            const dadosDia = dadosSemana[dia];
            if (!dadosDia) continue;
            
            // Verifica se o dia tem algum dado em qualquer seção
            const hasData = secoes.some(sec => dadosDia[sec.id] && dadosDia[sec.id].length > 0);
            if (!hasData) continue;

            hasContent = true;

            // Verifica espaço para o cabeçalho do dia
            if (finalY > 185) {
                doc.addPage();
                finalY = 15;
            }
            
            // Cabeçalho do Dia (Barra Cinza)
            doc.setFillColor(230, 230, 230);
            doc.rect(5, finalY, 287, 7, 'F'); // Largura total menos margens (297 - 5 - 5)
            doc.setFontSize(11);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(0, 0, 0);
            
            let dateStr = '';
            if (CACHE_DATAS[semana] && CACHE_DATAS[semana][dia]) {
                 dateStr = ' - ' + CACHE_DATAS[semana][dia].toLocaleDateString('pt-BR');
            }
            
            doc.text(`${dia}${dateStr}`, 148.5, finalY + 5, { align: 'center' });
            finalY += 9;

            for (const sec of secoes) {
                const itens = dadosDia[sec.id] || [];
                if (itens.length === 0) continue;

                let columns, body;
                if (sec.id === 'Faltas') {
                    columns = ['MOTORISTA', 'MOTIVO MOTORISTA', 'AUXILIAR', 'MOTIVO AUXILIAR'];
                    body = itens.map(i => [i.MOTORISTA || '', i.MOTIVO_MOTORISTA || '', i.AUXILIAR || '', i.MOTIVO_AUXILIAR || '']);
                } else {
                    columns = ['PLACA', 'MODELO', 'ROTA', 'STATUS', 'MOTORISTA', 'AUXILIAR', 'TERCEIRO'];
                    body = itens.map(i => [i.PLACA || '', i.MODELO || '', i.ROTA || '', i.STATUS || '', i.MOTORISTA || '', i.AUXILIAR || '', i.TERCEIRO || '']);
                }

                // Título da Seção
                doc.setFontSize(9);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(0, 105, 55); // Verde Marquespan
                doc.text(sec.title, 5, finalY + 3);

                doc.autoTable({
                    head: [columns],
                    body: body,
                    startY: finalY + 4,
                    margin: { left: 5, right: 5 }, // Margens laterais de 5mm
                    theme: 'grid',
                    styles: { fontSize: 8, cellPadding: 1, overflow: 'linebreak' },
                    headStyles: { fillColor: [0, 105, 55], textColor: 255, fontSize: 8, fontStyle: 'bold', halign: 'center' },
                    columnStyles: {
                        0: { cellWidth: 'auto' }
                    },
                    didDrawPage: (data) => {
                        // Se a tabela quebrar página, atualiza o finalY
                        finalY = data.cursor.y;
                    }
                });

                finalY = doc.lastAutoTable.finalY + 4;
            }
            finalY += 2; // Espaço entre dias
        }

        if (!hasContent) {
            doc.setFontSize(12);
            doc.setTextColor(0, 0, 0);
            doc.text('Nenhum dado encontrado para esta semana.', 148.5, 50, { align: 'center' });
        }

        doc.save(`Escala_${semana.replace(/\s+/g, '_')}.pdf`);
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
                const formattedDate = currentDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'UTC' });
                
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

    if (btnPDF) {
        btnPDF.addEventListener('click', gerarPDF);
    }

    // Listener para o botão de importar específico do dia (Delegado pois o botão é criado dinamicamente)
    if (painelEscala) {
        painelEscala.addEventListener('click', (e) => {
            // Botão Importar Dia
            const btnImport = e.target.closest('#btnImportarDiaAction');
            if (btnImport && fileImportarDia) {
                fileImportarDia.click();
                return;
            }

            // Botão Excluir Linha
            const btnExcluir = e.target.closest('.btn-acao.excluir');
            if (btnExcluir) {
                const tr = btnExcluir.closest('tr');
                // Encontra a primeira célula editável para pegar os metadados
                const firstCell = tr.querySelector('td[data-section]');
                if (firstCell) {
                    const section = firstCell.dataset.section;
                    const index = parseInt(firstCell.dataset.row);
                    const semana = selectSemana.value;
                    const dia = document.querySelector('.tab-btn.active').dataset.dia;

                    if (confirm('Deseja remover esta linha?')) {
                        if (DADOS_LOCAL[semana] && DADOS_LOCAL[semana][dia] && DADOS_LOCAL[semana][dia][section]) {
                            DADOS_LOCAL[semana][dia][section].splice(index, 1);
                            carregarDadosDia(dia, semana); // Re-renderiza para atualizar índices
                        }
                    }
                }
            }
        });

        // Listener para Edição (Input) - Atualiza DADOS_LOCAL em tempo real
        painelEscala.addEventListener('input', (e) => {
            const target = e.target;
            // Verifica se é um elemento editável (input ou contenteditable)
            if (target.hasAttribute('contenteditable') || target.classList.contains('table-input')) {
                const section = target.dataset.section;
                const row = parseInt(target.dataset.row);
                const key = target.dataset.key;
                const semana = selectSemana.value;
                const dia = document.querySelector('.tab-btn.active').dataset.dia;
                
                if (DADOS_LOCAL[semana] && DADOS_LOCAL[semana][dia] && DADOS_LOCAL[semana][dia][section]) {
                    if (DADOS_LOCAL[semana][dia][section][row]) {
                        const valor = target.value !== undefined ? target.value : target.innerText;
                        DADOS_LOCAL[semana][dia][section][row][key] = valor;

                        // Auto-preencher Modelo se a Placa for alterada
                        if (key === 'PLACA') {
                            const veiculoEncontrado = listaVeiculos.find(v => v.placa === valor);
                            if (veiculoEncontrado) {
                                DADOS_LOCAL[semana][dia][section][row]['MODELO'] = veiculoEncontrado.modelo;
                                // Atualiza o input de modelo na mesma linha visualmente
                                const tr = target.closest('tr');
                                const inputModelo = tr.querySelector('input[data-key="MODELO"]');
                                if (inputModelo) inputModelo.value = veiculoEncontrado.modelo;
                            }
                        }

                        // Atualiza cor se for Status
                        if (key === 'STATUS') {
                            updateInputColor(target);
                        }
                    }
                }
            }
        });
    }
    if (fileImportarDia) fileImportarDia.addEventListener('change', importarExcel);

    // --- SALVAR ---
    function salvarDados() {
        localStorage.setItem('marquespan_escala_dados', JSON.stringify(DADOS_LOCAL));
        alert('Dados salvos com sucesso!');
    }

    if (btnSalvar) {
        btnSalvar.addEventListener('click', salvarDados);
    }

    // Atalho Ctrl+S
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
            e.preventDefault(); // Previne o salvar padrão do navegador
            salvarDados();
        }
    });

    // --- INICIALIZAÇÃO ---
    carregarSemanas();
    preencherCacheDatas();
    carregarVeiculos();
    carregarRotas();
    carregarFuncionarios();
    carregarStatus();
});