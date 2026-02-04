// script/escala.js
import { supabaseClient } from './supabase.js';

document.addEventListener('DOMContentLoaded', () => {
    console.log('Página de Controle de Escala carregada.');

    // Proteção de página: verifica se o usuário está logado
    const usuarioLogado = JSON.parse(localStorage.getItem('usuarioLogado'));
    if (!usuarioLogado) {
        alert('Acesso negado. Por favor, faça login.');
        window.location.href = 'index.html';
        return;
    }

    // --- ESTILOS DE PLANILHA (Injetados dinamicamente) ---
    const styleSheet = document.createElement("style");
    styleSheet.innerText = `
        /* Reset de tabela para estilo planilha */
        table { border-collapse: collapse !important; width: 100%; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; font-size: 13px; background-color: #fff; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
        th { background-color: #f8f9fa; color: #495057; font-weight: 600; border: 1px solid #dee2e6; padding: 10px 8px; text-align: left; text-transform: uppercase; font-size: 11px; letter-spacing: 0.5px; }
        td { border: 1px solid #dee2e6; padding: 0 !important; height: 34px; vertical-align: middle; position: relative; }
        tbody tr:nth-child(even) { background-color: #f8f9fa; }
        tbody tr:nth-child(odd) { background-color: #ffffff; }
        tbody tr:hover { background-color: #f1f3f5; }
        input.table-input { width: 100%; height: 100%; border: none !important; border-radius: 0 !important; padding: 0 10px; background: transparent; font-size: 13px; color: #212529; outline: none; box-shadow: none !important; margin: 0; display: block; box-sizing: border-box; }
        input.table-input:focus { background-color: #fff; box-shadow: inset 0 0 0 2px #007bff !important; z-index: 2; }
        td[contenteditable="true"] { padding: 8px 10px !important; outline: none; cursor: text; }
        td[contenteditable="true"]:focus { background-color: #fff; box-shadow: inset 0 0 0 2px #007bff; }
        .btn-acao.excluir { background: transparent; border: none; color: #dc3545; cursor: pointer; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; opacity: 0.5; transition: all 0.2s; font-size: 14px; }
        .btn-acao.excluir:hover { opacity: 1; background-color: #ffebee; }
        .resizer { position: absolute; right: 0; top: 0; height: 100%; width: 5px; background: rgba(0,0,0,0.05); cursor: col-resize; user-select: none; touch-action: none; z-index: 10; }
        .resizer:hover, .resizing { background: #007bff; }
        .status-saving { color: #ffc107; font-size: 0.8em; margin-left: 10px; }
        .status-saved { color: #28a745; font-size: 0.8em; margin-left: 10px; }
        .status-error { color: #dc3545; font-size: 0.8em; margin-left: 10px; }
    `;
    document.head.appendChild(styleSheet);

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
    const btnSalvar = document.getElementById('btnSalvar'); // Agora usado para feedback ou ações em lote
    const btnPDF = document.getElementById('btnPDF');
    const globalSearch = document.getElementById('globalSearch');
    
    // Reordenar abas visualmente para começar com Domingo
    if (tabButtons.length > 0) {
        const container = tabButtons[0].parentNode;
        const order = ['DOMINGO', 'SEGUNDA', 'TERCA', 'QUARTA', 'QUINTA', 'SEXTA', 'SABADO'];
        const buttonsMap = {};
        tabButtons.forEach(btn => { if (btn.dataset.dia) buttonsMap[btn.dataset.dia] = btn; });
        order.forEach(dia => { if (buttonsMap[dia]) container.appendChild(buttonsMap[dia]); });
    }

    // --- CACHE DE DATAS ---
    const CACHE_DATAS = {};

    function preencherCacheDatas() {
        const baseDate = new Date(Date.UTC(2025, 11, 28)); // 28 de Dezembro de 2025

        for (let i = 1; i <= 53; i++) {
            const nomeSemana = `SEMANA ${String(i).padStart(2, '0')} - 2026`;
            const startOfWeek = addDays(baseDate, (i - 1) * 7);
            CACHE_DATAS[nomeSemana] = {
                'DOMINGO':  addDays(startOfWeek, 0),
                'SEGUNDA':  addDays(startOfWeek, 1),
                'TERCA':    addDays(startOfWeek, 2),
                'QUARTA':   addDays(startOfWeek, 3),
                'QUINTA':   addDays(startOfWeek, 4),
                'SEXTA':    addDays(startOfWeek, 5),
                'SABADO':   addDays(startOfWeek, 6)
            };
        }
    }

    function addDays(date, days) {
        const result = new Date(date);
        result.setUTCDate(result.getUTCDate() + days);
        return result;
    }

    // --- MAPA DE SEÇÕES PARA DB ---
    const SECAO_PARA_DB = {
        'Padrao': { tabela: 'escala', tipo: 'PADRAO' },
        'Transferencia': { tabela: 'escala', tipo: 'TRANSFERENCIA' },
        'Equipamento': { tabela: 'escala', tipo: 'EQUIPAMENTO' },
        'Reservas': { tabela: 'escala', tipo: 'RESERVA' },
        'Faltas': { tabela: 'faltas_afastamentos', tipo: null }
    };

    // --- INJEÇÃO DE BOTÕES "ADICIONAR LINHA" ---
    Object.keys(SECAO_PARA_DB).forEach(sec => {
        const tbody = document.getElementById(`tbody${sec}`);
        if (tbody) {
            const table = tbody.closest('table');
            if (table) {
                const container = document.createElement('div');
                container.style.textAlign = 'right';
                container.style.marginTop = '5px';
                
                const btnAdd = document.createElement('button');
                btnAdd.className = 'btn-custom';
                btnAdd.style.backgroundColor = '#28a745';
                btnAdd.style.color = 'white';
                btnAdd.style.padding = '5px 10px';
                btnAdd.style.fontSize = '0.85rem';
                btnAdd.innerHTML = '<i class="fas fa-plus"></i> Adicionar Linha';
                btnAdd.onclick = () => adicionarLinhaManual(sec);
                
                container.appendChild(btnAdd);
                table.parentNode.insertBefore(container, table.nextSibling);
            }
        }
    });

    // --- FUNÇÕES DE DADOS ---

    async function adicionarLinhaManual(section) {
        const semana = selectSemana.value;
        const dia = document.querySelector('.tab-btn.active')?.dataset.dia;
        if (!semana || !dia) return;

        const dataObj = CACHE_DATAS[semana][dia];
        const dataISO = dataObj.toISOString().split('T')[0];
        const config = SECAO_PARA_DB[section];

        const payload = {
            semana_nome: semana,
            data_escala: dataISO
        };

        if (config.tabela === 'escala') {
            payload.tipo_escala = config.tipo;
        }

        try {
            const { error } = await supabaseClient.from(config.tabela).insert([payload]);
            if (error) throw error;
            carregarDadosDia(dia, semana);
        } catch (err) {
            console.error('Erro ao adicionar linha:', err);
            alert('Erro ao adicionar linha: ' + err.message);
        }
    }

    async function carregarDadosDia(dia, semana) {
        const sections = Object.keys(SECAO_PARA_DB);
        sections.forEach(sec => {
            const tbody = document.getElementById(`tbody${sec}`);
            const colspan = sec === 'Faltas' ? 5 : 7;
            if(tbody) tbody.innerHTML = `<tr><td colspan="${colspan}" style="text-align: center;">Carregando...</td></tr>`;
        });

        const coresDia = { 'SEGUNDA': '#007bff', 'TERCA': '#fd7e14', 'QUARTA': '#28a745', 'QUINTA': '#6f42c1', 'SEXTA': '#dc3545', 'SABADO': '#17a2b8', 'DOMINGO': '#e83e8c' };
        tituloDia.style.color = coresDia[dia] || '#006937';

        const dataObj = CACHE_DATAS[semana] ? CACHE_DATAS[semana][dia] : new Date();
        const dataISO = dataObj.toISOString().split('T')[0];
        const formattedDate = dataObj.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
        const diaNome = dia === 'TERCA' ? 'TERÇA' : dia;

        tituloDia.innerHTML = `
            <div style="display: flex; align-items: center; gap: 10px;">
                <span><i class="fa-solid fa-calendar-day"></i> ${diaNome} - ${formattedDate}</span>
                <button id="btnImportarDiaAction" class="btn-primary" style="padding: 4px 10px; border-radius: 4px; border: none; cursor: pointer; font-size: 0.8em;" title="Importar Excel para este dia"><i class="fa-solid fa-plus"></i></button>
                <button id="btnCopiarDiaSeguinte" class="btn-primary" style="padding: 4px 10px; border-radius: 4px; border: none; cursor: pointer; font-size: 0.8em; background-color: #17a2b8;" title="Copiar Escala para o Dia Seguinte"><i class="fa-solid fa-copy"></i></button>
                <span id="status-indicator"></span>
            </div>`;

        try {
            // Busca dados das duas tabelas em paralelo
            const [resEscala, resFaltas] = await Promise.all([
                supabaseClient.from('escala').select('*').eq('data_escala', dataISO).order('id'),
                supabaseClient.from('faltas_afastamentos').select('*').eq('data_escala', dataISO).order('id')
            ]);

            if (resEscala.error) throw resEscala.error;
            if (resFaltas.error) throw resFaltas.error;

            const dadosEscala = resEscala.data;
            const dadosFaltas = resFaltas.data;

            // Renderiza cada seção
            sections.forEach(sec => {
                const tbody = document.getElementById(`tbody${sec}`);
                if (!tbody) return;
                tbody.innerHTML = '';

                let itens = [];
                if (sec === 'Faltas') {
                    itens = dadosFaltas;
                } else {
                    const tipo = SECAO_PARA_DB[sec].tipo;
                    itens = dadosEscala.filter(d => d.tipo_escala === tipo);
                }

                if (itens.length > 0) {
                    itens.forEach(item => {
                        const tr = document.createElement('tr');
                        tr.dataset.id = item.id; // ID do banco para updates
                        tr.dataset.tabela = sec === 'Faltas' ? 'faltas_afastamentos' : 'escala';

                        if (sec === 'Faltas') {
                            tr.innerHTML = `
                                <td><input type="text" list="listaMotoristas" class="table-input" value="${item.motorista_ausente || ''}" data-key="motorista_ausente" placeholder="Motorista"></td>
                                <td contenteditable="true" data-key="motivo_motorista">${item.motivo_motorista || ''}</td>
                                <td><input type="text" list="listaAuxiliares" class="table-input" value="${item.auxiliar_ausente || ''}" data-key="auxiliar_ausente" placeholder="Auxiliar"></td>
                                <td contenteditable="true" data-key="motivo_auxiliar">${item.motivo_auxiliar || ''}</td>
                                <td><button class="btn-acao excluir" title="Remover"><i class="fas fa-trash"></i></button></td>
                            `;
                        } else {
                            tr.innerHTML = `
                                <td><input type="text" list="listaVeiculos" class="table-input" value="${item.placa || ''}" data-key="placa" placeholder="Placa"></td>
                                <td><input type="text" list="listaModelos" class="table-input" value="${item.modelo || ''}" data-key="modelo" placeholder="Modelo"></td>
                                <td><input type="text" list="listaRotas" class="table-input" value="${item.rota || ''}" data-key="rota" placeholder="Rota"></td>
                                <td><input type="text" list="listaStatus" class="table-input" value="${item.status || ''}" data-key="status" placeholder="Status" style="${getStatusStyle(item.status || '')}"></td>
                                <td><input type="text" list="listaMotoristas" class="table-input" value="${item.motorista || ''}" data-key="motorista" placeholder="Motorista"></td>
                                <td><input type="text" list="listaAuxiliares" class="table-input" value="${item.auxiliar || ''}" data-key="auxiliar" placeholder="Auxiliar"></td>
                                <td><input type="text" list="listaTerceiros" class="table-input" value="${item.terceiro || ''}" data-key="terceiro" placeholder="Terceiro"></td>
                            `;
                        }
                        tbody.appendChild(tr);
                    });
                } else {
                    const colspan = sec === 'Faltas' ? 5 : 7;
                    tbody.innerHTML = `<tr><td colspan="${colspan}" style="text-align: center;">Nenhum registro em ${sec.toUpperCase()}.</td></tr>`;
                }
            });

        } catch (err) {
            console.error('Erro ao carregar dados:', err);
            alert('Erro ao carregar dados do dia.');
        }
    }

    // --- EVENTOS DE EDIÇÃO (AUTO-SAVE) ---
    if (painelEscala) {
        // Delegação de eventos para inputs e contenteditable
        painelEscala.addEventListener('change', handleEdit); // Para inputs
        painelEscala.addEventListener('focusout', (e) => { // Para contenteditable
            if (e.target.isContentEditable) handleEdit(e);
        });

        painelEscala.addEventListener('click', async (e) => {
            // Botão Excluir
            const btnExcluir = e.target.closest('.btn-acao.excluir');
            if (btnExcluir) {
                const tr = btnExcluir.closest('tr');
                const id = tr.dataset.id;
                const tabela = tr.dataset.tabela;
                
                if (confirm('Deseja remover esta linha?')) {
                    try {
                        const { error } = await supabaseClient.from(tabela).delete().eq('id', id);
                        if (error) throw error;
                        tr.remove();
                    } catch (err) {
                        console.error('Erro ao excluir:', err);
                        alert('Erro ao excluir linha.');
                    }
                }
            }

            // Botão Importar Dia
            if (e.target.closest('#btnImportarDiaAction')) {
                fileImportarDia.click();
            }

            // Botão Copiar Dia Seguinte
            if (e.target.closest('#btnCopiarDiaSeguinte')) {
                copiarDiaSeguinte();
            }
        });
    }

    async function handleEdit(e) {
        const target = e.target;
        const tr = target.closest('tr');
        if (!tr || !tr.dataset.id) return;

        const id = tr.dataset.id;
        const tabela = tr.dataset.tabela;
        const key = target.dataset.key;
        
        if (!key) return;

        const valor = target.value !== undefined ? target.value : target.innerText;
        const statusIndicator = document.getElementById('status-indicator');

        if (statusIndicator) statusIndicator.innerHTML = '<span class="status-saving"><i class="fas fa-spinner fa-spin"></i> Salvando...</span>';

        // Auto-preencher Modelo se a Placa for alterada
        let extraUpdates = {};
        if (key === 'placa' && tabela === 'escala') {
            const veiculoEncontrado = listaVeiculos.find(v => v.placa === valor);
            if (veiculoEncontrado) {
                extraUpdates.modelo = veiculoEncontrado.modelo;
                const inputModelo = tr.querySelector('input[data-key="modelo"]');
                if (inputModelo) inputModelo.value = veiculoEncontrado.modelo;
            }
        }
        // Atualiza cor se for Status
        if (key === 'status') updateInputColor(target);

        try {
            const { error } = await supabaseClient
                .from(tabela)
                .update({ [key]: valor, ...extraUpdates })
                .eq('id', id);

            if (error) throw error;
            if (statusIndicator) {
                statusIndicator.innerHTML = '<span class="status-saved"><i class="fas fa-check"></i> Salvo</span>';
                setTimeout(() => statusIndicator.innerHTML = '', 2000);
            }
        } catch (err) {
            console.error('Erro ao salvar:', err);
            if (statusIndicator) statusIndicator.innerHTML = '<span class="status-error"><i class="fas fa-times"></i> Erro</span>';
        }
    }

    async function copiarDiaSeguinte() {
        const semanaAtual = selectSemana.value;
        const diaAtual = document.querySelector('.tab-btn.active')?.dataset.dia;
        if (!semanaAtual || !diaAtual) return;

        const diasOrdenados = ['DOMINGO', 'SEGUNDA', 'TERCA', 'QUARTA', 'QUINTA', 'SEXTA', 'SABADO'];
        const idxAtual = diasOrdenados.indexOf(diaAtual);
        
        let proximaSemana = semanaAtual;
        let proximoDia = '';

        if (idxAtual < diasOrdenados.length - 1) {
            proximoDia = diasOrdenados[idxAtual + 1];
        } else {
            // Lógica para virar a semana (simplificada, assume padrão de nome)
            const match = semanaAtual.match(/SEMANA (\d+) - (\d+)/);
            if (match) {
                let numSemana = parseInt(match[1], 10) + 1;
                proximaSemana = `SEMANA ${String(numSemana).padStart(2, '0')} - ${match[2]}`;
                proximoDia = 'DOMINGO';
            } else return;
        }

        const dataOrigem = CACHE_DATAS[semanaAtual][diaAtual].toISOString().split('T')[0];
        const dataDestino = CACHE_DATAS[proximaSemana][proximoDia].toISOString().split('T')[0];

        if (!confirm(`Copiar dados de ${diaAtual} (${dataOrigem}) para ${proximoDia} (${dataDestino})?`)) return;

        try {
            // 1. Busca dados origem
            const [resEscala, resFaltas] = await Promise.all([
                supabaseClient.from('escala').select('*').eq('data_escala', dataOrigem),
                supabaseClient.from('faltas_afastamentos').select('*').eq('data_escala', dataOrigem)
            ]);

            if (resEscala.error) throw resEscala.error;
            if (resFaltas.error) throw resFaltas.error;

            if (resEscala.data.length === 0 && resFaltas.data.length === 0) {
                alert('Dia atual vazio. Nada para copiar.');
                return;
            }

            // 2. Prepara dados destino (remove ID e timestamps)
            const novosEscala = resEscala.data.map(({ id, created_at, updated_at, ...rest }) => ({
                ...rest,
                semana_nome: proximaSemana,
                data_escala: dataDestino
            }));
            
            const novosFaltas = resFaltas.data.map(({ id, created_at, updated_at, ...rest }) => ({
                ...rest,
                semana_nome: proximaSemana,
                data_escala: dataDestino
            }));

            // 3. Insere
            if (novosEscala.length > 0) {
                const { error } = await supabaseClient.from('escala').insert(novosEscala);
                if (error) throw error;
            }
            if (novosFaltas.length > 0) {
                const { error } = await supabaseClient.from('faltas_afastamentos').insert(novosFaltas);
                if (error) throw error;
            }

            alert('Cópia realizada com sucesso!');
            
            // Se for na mesma semana, muda a aba
            if (semanaAtual === proximaSemana) {
                document.querySelector(`.tab-btn[data-dia="${proximoDia}"]`)?.click();
            }

        } catch (err) {
            console.error('Erro ao copiar:', err);
            alert('Erro ao copiar dados: ' + err.message);
        }
    }

    // --- IMPORTAÇÃO EXCEL ---
    async function importarExcel(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (evt) => {
            const data = new Uint8Array(evt.target.result);
            const workbook = XLSX.read(data, { type: 'array' });

            const semana = selectSemana.value;
            const dia = document.querySelector('.tab-btn.active').dataset.dia;
            const dataISO = CACHE_DATAS[semana][dia].toISOString().split('T')[0];

            // Mapeamento de nomes de abas do Excel para IDs internos das seções
            const mapaAbas = {
                'PADRAO': { tipo: 'PADRAO', tabela: 'escala' },
                'TRANSFERENCIA CD': { tipo: 'TRANSFERENCIA', tabela: 'escala' },
                'EQUIPAMENTO': { tipo: 'EQUIPAMENTO', tabela: 'escala' },
                'RESERVAS': { tipo: 'RESERVA', tabela: 'escala' },
                'FALTAS': { tipo: null, tabela: 'faltas_afastamentos' }
            };

            const insertsEscala = [];
            const insertsFaltas = [];

            // Itera sobre as abas do arquivo Excel
            workbook.SheetNames.forEach(sheetName => {
                const nomeNormalizado = sheetName.toUpperCase().trim();
                // Tenta match exato ou parcial para Faltas
                let config = mapaAbas[nomeNormalizado];
                if (!config && nomeNormalizado.includes('FALTAS')) config = mapaAbas['FALTAS'];

                if (config) {
                    const json = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
                    json.forEach(row => {
                        if (config.tabela === 'escala') {
                            insertsEscala.push({
                                semana_nome: semana,
                                data_escala: dataISO,
                                tipo_escala: config.tipo,
                                placa: row['PLACA'],
                                modelo: row['MODELO'],
                                rota: row['ROTA'],
                                status: row['STATUS'],
                                motorista: row['MOTORISTA'],
                                auxiliar: row['AUXILIAR'],
                                terceiro: row['TERCEIRO']
                            });
                        } else {
                            insertsFaltas.push({
                                semana_nome: semana,
                                data_escala: dataISO,
                                motorista_ausente: row['MOTORISTA'],
                                motivo_motorista: row['MOTIVO_MOTORISTA'],
                                auxiliar_ausente: row['AUXILIAR'],
                                motivo_auxiliar: row['MOTIVO_AUXILIAR']
                            });
                        }
                    });
                }
            });

            try {
                if (insertsEscala.length > 0) await supabaseClient.from('escala').insert(insertsEscala);
                if (insertsFaltas.length > 0) await supabaseClient.from('faltas_afastamentos').insert(insertsFaltas);
                
                alert('Importação concluída!');
                carregarDadosDia(dia, semana);
            } catch (err) {
                console.error('Erro na importação:', err);
                alert('Erro ao importar dados: ' + err.message);
            }
            e.target.value = '';
        };
        reader.readAsArrayBuffer(file);
    }

    // --- GERAÇÃO DE PDF ---
    async function gerarPDF() {
        if (!window.jspdf) return alert('Biblioteca PDF não carregada.');
        
        const semana = selectSemana.value;
        // Busca dados da semana inteira
        const { data: dadosEscala } = await supabaseClient.from('escala').select('*').eq('semana_nome', semana);
        const { data: dadosFaltas } = await supabaseClient.from('faltas_afastamentos').select('*').eq('semana_nome', semana);

        if ((!dadosEscala || dadosEscala.length === 0) && (!dadosFaltas || dadosFaltas.length === 0)) {
            return alert('Nenhum dado encontrado para esta semana.');
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

        // Logo
        try {
            const response = await fetch('logo.png');
            if (response.ok) {
                const blob = await response.blob();
                const reader = new FileReader();
                const base64data = await new Promise(r => { reader.onloadend = () => r(reader.result); reader.readAsDataURL(blob); });
                doc.addImage(base64data, 'PNG', 5, 5, 40, 15);
            }
        } catch (e) {}

        doc.setFontSize(18);
        doc.text(`Escala Semanal - ${semana}`, 148.5, 15, { align: 'center' });
        doc.setFontSize(9);
        doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 292, 10, { align: 'right' });

        let finalY = 25;
        const dias = ['DOMINGO', 'SEGUNDA', 'TERCA', 'QUARTA', 'QUINTA', 'SEXTA', 'SABADO'];
        const secoes = [
            { id: 'PADRAO', title: 'PADRÃO' },
            { id: 'TRANSFERENCIA', title: 'TRANSFERÊNCIA CD' },
            { id: 'EQUIPAMENTO', title: 'EQUIPAMENTO' },
            { id: 'RESERVA', title: 'RESERVAS' },
            { id: 'FALTAS', title: 'FALTAS / FÉRIAS / AFASTADOS' }
        ];

        for (const dia of dias) {
            const dataDia = CACHE_DATAS[semana][dia].toISOString().split('T')[0];
            
            // Filtra dados para o dia
            const itensDiaEscala = dadosEscala ? dadosEscala.filter(d => d.data_escala === dataDia) : [];
            const itensDiaFaltas = dadosFaltas ? dadosFaltas.filter(d => d.data_escala === dataDia) : [];

            if (itensDiaEscala.length === 0 && itensDiaFaltas.length === 0) continue;

            if (finalY > 185) { doc.addPage(); finalY = 15; }

            // Cabeçalho do Dia
            doc.setFillColor(230, 230, 230);
            doc.rect(5, finalY, 287, 7, 'F');
            doc.setFontSize(11);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(0, 0, 0);
            doc.text(`${dia} - ${CACHE_DATAS[semana][dia].toLocaleDateString('pt-BR')}`, 148.5, finalY + 5, { align: 'center' });
            finalY += 9;

            for (const sec of secoes) {
                let itens = [];
                let columns, body;

                if (sec.id === 'FALTAS') {
                    itens = itensDiaFaltas;
                    columns = ['MOTORISTA', 'MOTIVO MOTORISTA', 'AUXILIAR', 'MOTIVO AUXILIAR'];
                    body = itens.map(i => [i.motorista_ausente, i.motivo_motorista, i.auxiliar_ausente, i.motivo_auxiliar]);
                } else {
                    itens = itensDiaEscala.filter(d => d.tipo_escala === sec.id);
                    columns = ['PLACA', 'MODELO', 'ROTA', 'STATUS', 'MOTORISTA', 'AUXILIAR', 'TERCEIRO'];
                    body = itens.map(i => [i.placa, i.modelo, i.rota, i.status, i.motorista, i.auxiliar, i.terceiro]);
                }

                if (itens.length === 0) continue;

                doc.setFontSize(9);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(0, 105, 55);
                doc.text(sec.title, 5, finalY + 3);

                doc.autoTable({
                    head: [columns],
                    body: body,
                    startY: finalY + 4,
                    margin: { left: 5, right: 5 },
                    theme: 'grid',
                    styles: { fontSize: 8, cellPadding: 1 },
                    headStyles: { fillColor: [0, 105, 55], textColor: 255 },
                    didDrawPage: (data) => { finalY = data.cursor.y; }
                });
                finalY = doc.lastAutoTable.finalY + 4;
            }
            finalY += 2;
        }
        doc.save(`Escala_${semana}.pdf`);
    }

    // --- BOLETA ---
    async function buscarDadosBoleta() {
        const tipo = document.getElementById('filtroBoletaTipo').value;
        const valor = document.getElementById('filtroBoletaValor').value.trim().toUpperCase();
        const data = document.getElementById('boletaData').value;

        if (!valor || !data) return;

        // Limpa campos
        ['boletaPlaca', 'boletaModelo', 'boletaRota'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });

        try {
            let query = supabaseClient
                .from('escala')
                .select('placa, modelo, rota') // Seleciona apenas as colunas necessárias
                .eq('data_escala', data);

            // Constrói a query dinamicamente baseada no tipo de filtro
            if (tipo === 'MOTORISTA') {
                // Busca por motorista OU auxiliar
                query = query.or(`motorista.ilike.%${valor}%,auxiliar.ilike.%${valor}%`);
            } else if (tipo === 'ROTA') {
                // Para rotas, uma correspondência exata é mais segura
                query = query.eq('rota', valor);
            }

            // Busca o primeiro registro que corresponde aos critérios
            const { data: res, error } = await query.limit(1).single();

            // Ignora o erro "no rows found", que é esperado se não houver correspondência
            if (error && error.code !== 'PGRST116') throw error;

            // Se um resultado for encontrado, preenche os campos
            if (res) {
                document.getElementById('boletaPlaca').value = res.placa || '';
                document.getElementById('boletaModelo').value = res.modelo || '';
                document.getElementById('boletaRota').value = res.rota || '';
            }
        } catch (err) {
            console.error('Erro ao buscar dados para boleta:', err);
        }
    }

    // --- INICIALIZAÇÃO ---
    function carregarSemanas() {
        const baseDate = new Date(Date.UTC(2025, 11, 28));
        const hoje = new Date();
        const diffDays = Math.floor((hoje - baseDate) / (1000 * 60 * 60 * 24));
        let semanaAtual = Math.floor(diffDays / 7) + 1;
        if (semanaAtual < 1) semanaAtual = 1;

        selectSemana.innerHTML = '';
        for (let i = 1; i <= 53; i++) {
            const nome = `SEMANA ${String(i).padStart(2, '0')} - 2026`;
            selectSemana.appendChild(new Option(nome, nome));
        }
        selectSemana.value = `SEMANA ${String(semanaAtual).padStart(2, '0')} - 2026`;
    }

    // --- CACHE DE VEÍCULOS E FUNCIONÁRIOS ---
    let listaVeiculos = [];
    async function carregarListasAuxiliares() {
        // Veículos
        const { data: veiculos } = await supabaseClient.from('veiculos').select('placa, modelo').eq('situacao', 'ativo');
        listaVeiculos = veiculos || [];
        const dlPlacas = document.getElementById('listaVeiculos');
        const dlModelos = document.getElementById('listaModelos');
        if (dlPlacas) dlPlacas.innerHTML = listaVeiculos.map(v => `<option value="${v.placa}">`).join('');
        if (dlModelos) dlModelos.innerHTML = [...new Set(listaVeiculos.map(v => v.modelo))].map(m => `<option value="${m}">`).join('');

        // Rotas
        const { data: rotas } = await supabaseClient.from('rotas').select('numero');
        const dlRotas = document.getElementById('listaRotas');
        if (dlRotas && rotas) dlRotas.innerHTML = [...new Set(rotas.map(r => r.numero))].map(r => `<option value="${r}">`).join('');

        // Funcionários
        const { data: funcs } = await supabaseClient.from('funcionario').select('nome_completo, funcao').eq('status', 'Ativo');
        const dlMot = document.getElementById('listaMotoristas');
        const dlAux = document.getElementById('listaAuxiliares');
        if (funcs) {
            if (dlMot) dlMot.innerHTML = funcs.filter(f => f.funcao === 'Motorista').map(f => `<option value="${f.nome_completo}">`).join('');
            if (dlAux) dlAux.innerHTML = funcs.filter(f => f.funcao === 'Auxiliar').map(f => `<option value="${f.nome_completo}">`).join('');
        }
        
        // Status
        const statusList = ['OK', 'MANUTENÇÃO', 'FALTA', 'FERIAS', 'FOLGA', 'ATESTADO'];
        const dlStatus = document.getElementById('listaStatus');
        if(dlStatus) dlStatus.innerHTML = statusList.map(s => `<option value="${s}">`).join('');
    }

    function getStatusStyle(status) {
        // Exemplo simples, pode expandir
        if (status === 'OK') return 'color: green; font-weight: bold;';
        if (['FALTA', 'MANUTENÇÃO'].includes(status)) return 'color: red; font-weight: bold;';
        return '';
    }
    function updateInputColor(input) { input.style.cssText = getStatusStyle(input.value); }

    // --- LISTENERS GERAIS ---
    if (btnAbrirEscala) {
        btnAbrirEscala.addEventListener('click', () => {
            if (!selectSemana.value) return alert('Selecione uma semana.');
            
            // Atualiza datas nas abas
            const dadosSemana = CACHE_DATAS[selectSemana.value];
            tabButtons.forEach(btn => {
                const dia = btn.dataset.dia;
                const date = dadosSemana ? dadosSemana[dia] : new Date();
                const diaNome = btn.textContent.split(' ')[0].trim();
                btn.innerHTML = `${diaNome} <span class="tab-date">${date.toLocaleDateString('pt-BR', {day:'2-digit', month:'2-digit', timeZone:'UTC'})}</span>`;
            });

            painelEscala.classList.remove('hidden');
            document.querySelector('.tab-btn[data-dia="DOMINGO"]')?.click();
        });
    }

    tabButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            tabButtons.forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active'); // Use currentTarget para pegar o botão mesmo se clicar no span
            carregarDadosDia(e.currentTarget.dataset.dia, selectSemana.value);
        });
    });

    if (btnSalvar) {
        // Botão Salvar agora é apenas visual ou para ações em lote se necessário, pois temos auto-save
        btnSalvar.style.display = 'none'; // Oculta pois o salvamento é automático
        
        // Injeta botão Limpar Semana
        const btnLimpar = document.createElement('button');
        btnLimpar.className = 'btn-custom';
        btnLimpar.innerHTML = '<i class="fas fa-trash"></i> Limpar Semana';
        btnLimpar.style.backgroundColor = '#dc3545';
        btnLimpar.onclick = async () => {
            const semana = selectSemana.value;
            if (confirm(`ATENÇÃO: Apagar TODOS os dados da ${semana}?`)) {
                await supabaseClient.from('escala').delete().eq('semana_nome', semana);
                await supabaseClient.from('faltas_afastamentos').delete().eq('semana_nome', semana);
                alert('Semana limpa.');
                const dia = document.querySelector('.tab-btn.active')?.dataset.dia;
                if(dia) carregarDadosDia(dia, semana);
            }
        };
        if(btnSalvar.parentNode) btnSalvar.parentNode.insertBefore(btnLimpar, btnSalvar);
    }

    if (btnImportar && fileImportar) {
        btnImportar.addEventListener('click', () => fileImportar.click());
        fileImportar.addEventListener('change', importarExcel);
    }
    if (fileImportarDia) fileImportarDia.addEventListener('change', importarExcel);
    if (btnPDF) btnPDF.addEventListener('click', gerarPDF);
    if (btnBaixarModelo) btnBaixarModelo.addEventListener('click', () => alert('Função de baixar modelo mantida do original (requer SheetJS).'));

    // Boleta Listeners
    const filtroBoletaValor = document.getElementById('filtroBoletaValor');
    const boletaData = document.getElementById('boletaData');
    if (filtroBoletaValor) filtroBoletaValor.addEventListener('change', buscarDadosBoleta);
    if (boletaData) boletaData.addEventListener('change', buscarDadosBoleta);

    // Inicialização
    carregarSemanas();
    preencherCacheDatas();
    carregarListasAuxiliares();
});

                    
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

        const dias = ['DOMINGO', 'SEGUNDA', 'TERCA', 'QUARTA', 'QUINTA', 'SEXTA', 'SABADO'];
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
            
            // Ativa a primeira aba (DOMINGO) por padrão
            const abaDomingo = document.querySelector('.tab-btn[data-dia="DOMINGO"]');
            if (abaDomingo) abaDomingo.click();
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

            // Botão Copiar Dia Seguinte
            const btnCopiar = e.target.closest('#btnCopiarDiaSeguinte');
            if (btnCopiar) {
                const semanaAtual = selectSemana.value;
                const diaAtual = document.querySelector('.tab-btn.active')?.dataset.dia;
                
                if (!semanaAtual || !diaAtual) return;

                const diasOrdenados = ['DOMINGO', 'SEGUNDA', 'TERCA', 'QUARTA', 'QUINTA', 'SEXTA', 'SABADO'];
                const idxAtual = diasOrdenados.indexOf(diaAtual);
                
                let proximaSemana = semanaAtual;
                let proximoDia = '';

                if (idxAtual === -1) return;

                if (idxAtual < diasOrdenados.length - 1) {
                    proximoDia = diasOrdenados[idxAtual + 1];
                } else {
                    // É Sábado, vai para Domingo da próxima semana
                    const match = semanaAtual.match(/SEMANA (\d+) - (\d+)/);
                    if (match) {
                        let numSemana = parseInt(match[1], 10);
                        let ano = parseInt(match[2], 10);
                        
                        numSemana++;
                        if (numSemana > 53) {
                             alert('Limite de semanas atingido.');
                             return;
                        }
                        proximaSemana = `SEMANA ${String(numSemana).padStart(2, '0')} - ${ano}`;
                        proximoDia = 'DOMINGO';
                    } else {
                        return;
                    }
                }

                if (!DADOS_LOCAL[semanaAtual] || !DADOS_LOCAL[semanaAtual][diaAtual]) {
                    alert('Não há dados neste dia para copiar.');
                    return;
                }

                const dadosOrigem = DADOS_LOCAL[semanaAtual][diaAtual];
                const temDadosOrigem = Object.values(dadosOrigem).some(arr => Array.isArray(arr) && arr.length > 0);
                
                if (!temDadosOrigem) {
                    alert('O dia atual está vazio. Nada para copiar.');
                    return;
                }

                if (!DADOS_LOCAL[proximaSemana]) DADOS_LOCAL[proximaSemana] = {};
                
                if (DADOS_LOCAL[proximaSemana][proximoDia]) {
                     const temDadosDestino = Object.values(DADOS_LOCAL[proximaSemana][proximoDia]).some(arr => Array.isArray(arr) && arr.length > 0);
                     if (temDadosDestino) {
                         if (!confirm(`O dia seguinte (${proximoDia} - ${proximaSemana}) já possui dados. Deseja sobrescrever?`)) {
                             return;
                         }
                     }
                }

                DADOS_LOCAL[proximaSemana][proximoDia] = JSON.parse(JSON.stringify(dadosOrigem));
                localStorage.setItem('marquespan_escala_dados', JSON.stringify(DADOS_LOCAL));
                
                if (proximaSemana === semanaAtual) {
                    if(confirm(`Copiado com sucesso para ${proximoDia}! Deseja ir para este dia?`)) {
                        const tab = document.querySelector(`.tab-btn[data-dia="${proximoDia}"]`);
                        if(tab) tab.click();
                    }
                } else {
                    alert(`Copiado com sucesso para ${proximoDia} da ${proximaSemana}!`);
                }
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

        // Injeta o botão Limpar Escala dinamicamente
        const btnLimpar = document.createElement('button');
        btnLimpar.id = 'btnLimparEscala';
        btnLimpar.className = 'btn-custom';
        btnLimpar.innerHTML = '<i class="fas fa-trash"></i> Limpar Escala';
        btnLimpar.style.backgroundColor = '#dc3545';
        
        if (btnSalvar.parentNode) {
            btnSalvar.parentNode.insertBefore(btnLimpar, btnSalvar.nextSibling);
        }

        btnLimpar.addEventListener('click', () => {
            const semana = selectSemana.value;
            if (!semana) return;

            if (confirm(`ATENÇÃO: Tem certeza que deseja limpar TODOS os dados da ${semana}?\n\nEsta ação apagará todos os registros de todos os dias desta semana e não pode ser desfeita.`)) {
                if (DADOS_LOCAL[semana]) {
                    delete DADOS_LOCAL[semana];
                    localStorage.setItem('marquespan_escala_dados', JSON.stringify(DADOS_LOCAL));
                    
                    // Recarrega a visualização do dia atual
                    const diaAtivo = document.querySelector('.tab-btn.active')?.dataset.dia || 'SEGUNDA';
                    carregarDadosDia(diaAtivo, semana);
                    
                    alert('Escala limpa com sucesso!');
                } else {
                    alert('A escala desta semana já está vazia.');
                }
            }
        });
    }

    // Atalho Ctrl+S
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
            e.preventDefault(); // Previne o salvar padrão do navegador
            salvarDados();
        }
    });

    // --- BOLETA DE HORÁRIO ---
    const btnGerarBoleta = document.getElementById('btnGerarBoleta');
    const modalBoleta = document.getElementById('modalBoleta');
    const btnCloseModalBoleta = document.getElementById('btnCloseModalBoleta');
    const btnGerarBoletaPDF = document.getElementById('btnGerarBoletaPDF');
    const filtroBoletaTipo = document.getElementById('filtroBoletaTipo');
    const filtroBoletaValor = document.getElementById('filtroBoletaValor');
    const listaBoletaOpcoes = document.getElementById('listaBoletaOpcoes');
    const boletaPlaca = document.getElementById('boletaPlaca');
    const boletaModelo = document.getElementById('boletaModelo');
    const boletaRota = document.getElementById('boletaRota');
    const boletaData = document.getElementById('boletaData');

    if (btnGerarBoleta) {
        btnGerarBoleta.addEventListener('click', () => {
            if (modalBoleta) {
                modalBoleta.classList.remove('hidden');
                // Garante que o display flex inline funcione se a classe hidden usar display:none
                modalBoleta.style.display = 'flex'; 
                atualizarOpcoesBoleta();
                // Limpa campos ao abrir
                if(filtroBoletaValor) filtroBoletaValor.value = '';
                if(boletaPlaca) boletaPlaca.value = '';
                if(boletaModelo) boletaModelo.value = '';
                if(boletaRota) boletaRota.value = '';
                
                // Define data padrão (Segunda-feira da semana selecionada)
                const semana = selectSemana.value;
                if (CACHE_DATAS[semana] && CACHE_DATAS[semana]['SEGUNDA']) {
                    // Ajusta para YYYY-MM-DD
                    const dateObj = CACHE_DATAS[semana]['SEGUNDA'];
                    if(boletaData) boletaData.value = dateObj.toISOString().split('T')[0];
                }
            }
        });
    }

    if (btnCloseModalBoleta) {
        btnCloseModalBoleta.addEventListener('click', () => {
            if (modalBoleta) {
                modalBoleta.classList.add('hidden');
                modalBoleta.style.display = 'none';
            }
        });
    }
    
    // Fechar ao clicar fora
    if (modalBoleta) {
        modalBoleta.addEventListener('click', (e) => {
            if (e.target === modalBoleta) {
                modalBoleta.classList.add('hidden');
                modalBoleta.style.display = 'none';
            }
        });
    }

    if (filtroBoletaTipo) {
        filtroBoletaTipo.addEventListener('change', () => {
            if (filtroBoletaValor) filtroBoletaValor.value = '';
            atualizarOpcoesBoleta();
            // Limpa campos automáticos
            if(boletaPlaca) boletaPlaca.value = '';
            if(boletaModelo) boletaModelo.value = '';
            if(boletaRota) boletaRota.value = '';
        });
    }

    // Preenchimento automático ao selecionar/digitar
    function buscarDadosBoleta() {
        const tipo = filtroBoletaTipo.value;
        const valorRaw = filtroBoletaValor.value;
        const valor = valorRaw ? valorRaw.trim().toUpperCase() : '';
        const dataSelecionada = boletaData ? boletaData.value : null;

        // Limpa campos antes de buscar
        if(boletaPlaca) boletaPlaca.value = '';
        if(boletaModelo) boletaModelo.value = '';
        if(boletaRota) boletaRota.value = '';

        if (!valor || !dataSelecionada) return;

        // Garante que o cache de datas esteja preenchido
        if (Object.keys(CACHE_DATAS).length === 0) {
            preencherCacheDatas();
        }

        // 1. Identifica qual semana e dia correspondem à data selecionada (busca em todo o calendário)
        let semanaEncontrada = null;
        let diaEncontrado = null;

        for (const [semanaKey, diasObj] of Object.entries(CACHE_DATAS)) {
            for (const [diaKey, dateObj] of Object.entries(diasObj)) {
                if (dateObj.toISOString().split('T')[0] === dataSelecionada) {
                    semanaEncontrada = semanaKey;
                    diaEncontrado = diaKey;
                    break;
                }
            }
            if (semanaEncontrada) break;
        }

        if (!semanaEncontrada || !diaEncontrado) return; // Data não encontrada no calendário

        // 2. Busca nos dados locais usando a semana e dia encontrados
        if (DADOS_LOCAL[semanaEncontrada] && DADOS_LOCAL[semanaEncontrada][diaEncontrado]) {
            const secoesBusca = ['Padrao', 'Transferencia', 'Equipamento', 'Reservas'];
            
            for (const s of secoesBusca) {
                const lista = DADOS_LOCAL[semanaEncontrada][diaEncontrado][s] || [];
                for (const item of lista) {
                    const itemMotorista = item.MOTORISTA ? item.MOTORISTA.toUpperCase().trim() : '';
                    const itemAuxiliar = item.AUXILIAR ? item.AUXILIAR.toUpperCase().trim() : '';
                    const itemRota = item.ROTA ? item.ROTA.toUpperCase().trim() : '';

                    if (tipo === 'MOTORISTA') {
                        if (itemMotorista === valor || itemAuxiliar === valor) {
                            if(boletaPlaca) boletaPlaca.value = item.PLACA || '';
                            if(boletaModelo) boletaModelo.value = item.MODELO || '';
                            if(boletaRota) boletaRota.value = item.ROTA || '';
                            return; // Encontrou e preencheu
                        }
                    } else { // ROTA
                        if (itemRota === valor) {
                            if(boletaPlaca) boletaPlaca.value = item.PLACA || '';
                            if(boletaModelo) boletaModelo.value = item.MODELO || '';
                            if(boletaRota) boletaRota.value = valor; // Mantém o valor pesquisado
                            return; // Encontrou e preencheu
                        }
                    }
                }
            }
        }
    }

    if (filtroBoletaValor) {
        filtroBoletaValor.addEventListener('input', buscarDadosBoleta);
        filtroBoletaValor.addEventListener('change', buscarDadosBoleta);
    }
    
    if (boletaData) {
        boletaData.addEventListener('change', buscarDadosBoleta);
    }

    function atualizarOpcoesBoleta() {
        if (!listaBoletaOpcoes) return;
        const tipo = filtroBoletaTipo.value;
        listaBoletaOpcoes.innerHTML = '';
        
        if (tipo === 'ROTA') {
             const options = document.getElementById('listaRotas').innerHTML;
             listaBoletaOpcoes.innerHTML = options;
        } else {
             const motOptions = document.getElementById('listaMotoristas').innerHTML;
             const auxOptions = document.getElementById('listaAuxiliares').innerHTML;
             listaBoletaOpcoes.innerHTML = motOptions + auxOptions;
        }
    }

    if (btnGerarBoletaPDF) {
        btnGerarBoletaPDF.addEventListener('click', () => {
            const tipo = filtroBoletaTipo.value;
            const valor = filtroBoletaValor.value.trim();
            const semana = selectSemana.value;
            
            if (!valor) {
                alert('Por favor, informe o nome ou rota.');
                return;
            }
            
            gerarPDFBoleta(semana, tipo, valor);
        });
    }

    async function gerarPDFBoleta(semana, tipo, valor) {
        if (!window.jspdf) {
            alert('Biblioteca PDF não carregada.');
            return;
        }
        
        // Garante que as datas estejam carregadas no cache
        if (Object.keys(CACHE_DATAS).length === 0) {
            preencherCacheDatas();
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        
        // Logo
        try {
            const response = await fetch('logo.png');
            if (response.ok) {
                const blob = await response.blob();
                const reader = new FileReader();
                const base64data = await new Promise((resolve) => {
                    reader.onloadend = () => resolve(reader.result);
                    reader.readAsDataURL(blob);
                });
                doc.addImage(base64data, 'PNG', 10, 10, 40, 15);
            }
        } catch (e) { console.warn('Logo não carregado', e); }

        // Pega as informações dos campos do modal (que foram preenchidos automaticamente ou manualmente)
        const infoPlaca = document.getElementById('boletaPlaca').value || '_____';
        const infoModelo = document.getElementById('boletaModelo').value || '_____';
        const infoRota = document.getElementById('boletaRota').value || '_____';

        doc.setFontSize(16);
        doc.text(`Boleta de Controle - ${semana}`, 105, 15, { align: 'center' });
        
        doc.setFontSize(11);
        doc.text(`Placa: ${infoPlaca} - ${infoModelo}   |   Rota: ${infoRota}`, 105, 22, { align: 'center' });

        doc.setFontSize(12);
        doc.setFont(undefined, 'bold');
        doc.text(`${tipo === 'ROTA' ? 'Rota' : 'Colaborador'}: ${valor}`, 105, 29, { align: 'center' });
        doc.setFont(undefined, 'normal');

        doc.setFontSize(9);
        doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 200, 10, { align: 'right' });

        // Prepara as datas
        const datasDia = {};
        if (CACHE_DATAS[semana]) {
            const dias = ['DOMINGO', 'SEGUNDA', 'TERCA', 'QUARTA', 'QUINTA', 'SEXTA', 'SABADO'];
            dias.forEach(dia => {
                if (CACHE_DATAS[semana][dia]) {
                    datasDia[dia] = CACHE_DATAS[semana][dia].toLocaleDateString('pt-BR');
                } else {
                    datasDia[dia] = '';
                }
            });
        }

        let currentY = 35;
        const margin = 10;
        const pageWidth = 210;
        const contentWidth = pageWidth - (margin * 2);
        const gap = 5;
        const colWidth = (contentWidth - gap) / 2;

        // Função auxiliar para desenhar a tabela de um dia
        const drawDayTable = (diaKey, x, y, width) => {
            const dateStr = datasDia[diaKey] || '';
            const diaNome = diaKey === 'TERCA' ? 'TERÇA' : diaKey;
            
            doc.autoTable({
                startY: y,
                margin: { left: x },
                tableWidth: width,
                theme: 'grid',
                head: [[{ 
                    content: `${diaNome} - ${dateStr}`, 
                    colSpan: 4, 
                    styles: { halign: 'center', fillColor: [0, 105, 55], textColor: 255, fontStyle: 'bold', fontSize: 10 } 
                }]],
                body: [
                    [
                        { content: 'INICIO', colSpan: 2, styles: { halign: 'center', fontStyle: 'bold', fillColor: [240, 240, 240] } },
                        { content: 'TÉRMINO', colSpan: 2, styles: { halign: 'center', fontStyle: 'bold', fillColor: [240, 240, 240] } }
                    ],
                    [
                        { content: `DATA: ${dateStr}`, colSpan: 2, styles: { halign: 'center', fontSize: 8 } },
                        { content: `DATA: ${dateStr}`, colSpan: 2, styles: { halign: 'center', fontSize: 8 } }
                    ],
                    [
                        { content: 'HORA:\n\n      :      ', styles: { halign: 'center', valign: 'middle', minCellHeight: 20 } },
                        { content: 'ASS:\n\n________________', styles: { halign: 'center', valign: 'middle', minCellHeight: 20 } },
                        { content: 'HORA:\n\n      :      ', styles: { halign: 'center', valign: 'middle', minCellHeight: 20 } },
                        { content: 'ASS:\n\n________________', styles: { halign: 'center', valign: 'middle', minCellHeight: 20 } }
                    ]
                ],
                styles: { fontSize: 8, cellPadding: 1, lineColor: [150, 150, 150], lineWidth: 0.1 },
                columnStyles: {
                    0: { cellWidth: width * 0.2 },
                    1: { cellWidth: width * 0.3 },
                    2: { cellWidth: width * 0.2 },
                    3: { cellWidth: width * 0.3 }
                }
            });
            return doc.lastAutoTable.finalY;
        };

        // 1. Domingo (Centralizado)
        const domWidth = colWidth; 
        const domX = (pageWidth - domWidth) / 2;
        currentY = drawDayTable('DOMINGO', domX, currentY, domWidth) + 5;

        // 2. Segunda e Terça
        const ySeg = drawDayTable('SEGUNDA', margin, currentY, colWidth);
        const yTer = drawDayTable('TERCA', margin + colWidth + gap, currentY, colWidth);
        currentY = Math.max(ySeg, yTer) + 5;

        // 3. Quarta e Quinta
        const yQua = drawDayTable('QUARTA', margin, currentY, colWidth);
        const yQui = drawDayTable('QUINTA', margin + colWidth + gap, currentY, colWidth);
        currentY = Math.max(yQua, yQui) + 5;

        // 4. Sexta e Sábado
        const ySex = drawDayTable('SEXTA', margin, currentY, colWidth);
        const ySab = drawDayTable('SABADO', margin + colWidth + gap, currentY, colWidth);

        doc.save(`Boleta_${valor.replace(/[^a-z0-9]/gi, '_')}_${semana}.pdf`);
    }

    // --- INICIALIZAÇÃO ---
    carregarSemanas();
    preencherCacheDatas();
    carregarVeiculos();
    carregarRotas();
    carregarFuncionarios();
    carregarStatus();
