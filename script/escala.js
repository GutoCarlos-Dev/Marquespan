// script/escala.js
import { supabaseClient } from './supabase.js';

// Variável para armazenar os dados da seção PADRÃO do dia atual
let dadosPadraoDoDia = [];

const COLUMN_COLORS_KEY = 'marquespan_column_colors';
const CELL_COLORS_KEY = 'marquespan_cell_colors';
const SAVED_COLORS_KEY = 'marquespan_saved_colors';
const COLUMN_ORDER_KEY_PREFIX = 'marquespan_escala_column_order_';
const COLUMN_WIDTH_KEY_PREFIX = 'marquespan_escala_column_width_';
const SECTION_COLLAPSE_KEY = 'marquespan_escala_collapsed_sections';

document.addEventListener('DOMContentLoaded', () => {
    console.log('Página de Controle de Escala carregada.');

    // Proteção de página: verifica se o usuário está logado
    const usuarioLogado = JSON.parse(localStorage.getItem('usuarioLogado'));
    if (!usuarioLogado) {
        alert('Acesso negado. Por favor, faça login.');
        window.location.href = 'index.html';
        return;
    }

    // Removido: Injeção de estilos via JavaScript (centralizado no escala.css)

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
    const btnImportarSemana = document.getElementById('btnImportarSemana');
    const fileImportarSemana = document.getElementById('fileImportarSemana');
    const btnSalvar = document.getElementById('btnSalvar'); // Agora usado para feedback ou ações em lote
    const btnPDF = document.getElementById('btnPDF');
    const globalSearch = document.getElementById('globalSearch');
    
    // --- ELEMENTOS DINÂMICOS ---
    const contextMenu = document.createElement('div');
    contextMenu.id = 'customContextMenu';
    contextMenu.className = 'context-menu';
    document.body.appendChild(contextMenu);

    // Input de cor oculto para seleção
    const colorPickerInput = document.createElement('input');
    colorPickerInput.type = 'color';
    colorPickerInput.style.display = 'none';
    document.body.appendChild(colorPickerInput);

    let currentHeaderTarget = null;
    let currentCellTarget = null;

    // Funções para Cores Salvas
    function getSavedColors() {
        return JSON.parse(localStorage.getItem(SAVED_COLORS_KEY) || '[]');
    }

    function saveColorToPalette(color) {
        let colors = getSavedColors();
        // Remove se já existe para mover para o topo
        colors = colors.filter(c => c !== color);
        colors.unshift(color);
        if (colors.length > 10) colors.pop(); // Mantém as últimas 10
        localStorage.setItem(SAVED_COLORS_KEY, JSON.stringify(colors));
    }

    function getSavedColorsHTML() {
        const colors = getSavedColors();
        if (colors.length === 0) return '';
        
        let html = '<div style="padding: 8px 15px; border-top: 1px solid #eee;"><div style="font-size: 11px; color: #666; margin-bottom: 5px;">Cores Recentes:</div><div style="display: flex; gap: 5px; flex-wrap: wrap;">';
        colors.forEach(c => {
            html += `<div onclick="applySavedColor('${c}')" style="width: 20px; height: 20px; background-color: ${c}; border: 1px solid #ccc; cursor: pointer; border-radius: 3px;" title="${c}"></div>`;
        });
        html += '</div></div>';
        return html;
    }

    // Função unificada para aplicar cor
    function applyColor(color) {
        const selectedHeaders = document.querySelectorAll('.selected-header');
        const selectedCells = document.querySelectorAll('.selected-cell');

        if (selectedHeaders.length > 0) {
            selectedHeaders.forEach(th => setColumnColor(th, color));
        } else if (currentHeaderTarget) {
            setColumnColor(currentHeaderTarget, color);
        }

        if (selectedCells.length > 0) {
            selectedCells.forEach(input => {
                const tr = input.closest('tr');
                if (tr) {
                    setCellColor({
                        tabela: tr.dataset.tabela,
                        id: tr.dataset.id,
                        key: input.dataset.key,
                        element: input
                    }, color);
                }
            });
        } else if (currentCellTarget) {
            setCellColor(currentCellTarget, color);
        }
    }

    colorPickerInput.addEventListener('input', (e) => {
        const color = e.target.value;
        saveColorToPalette(color);
        applyColor(color);
    });

    window.triggerColorPicker = () => {
        currentCellTarget = null;
        colorPickerInput.click();
        contextMenu.style.display = 'none';
    };

    window.triggerCellColorPicker = () => {
        currentHeaderTarget = null;
        colorPickerInput.click();
        contextMenu.style.display = 'none';
    };
    
    window.applySavedColor = (color) => {
        saveColorToPalette(color); // Move para o topo da lista
        applyColor(color);
        contextMenu.style.display = 'none';
    };

    window.resetColumnColor = () => {
        const selectedHeaders = document.querySelectorAll('.selected-header');
        if (selectedHeaders.length > 0) {
            selectedHeaders.forEach(th => setColumnColor(th, null));
        } else if (currentHeaderTarget) {
            setColumnColor(currentHeaderTarget, null);
        }
        contextMenu.style.display = 'none';
    };

    window.resetCellColor = () => {
        const selectedCells = document.querySelectorAll('.selected-cell');
        if (selectedCells.length > 0) {
            selectedCells.forEach(input => {
                const tr = input.closest('tr');
                if (tr) {
                    setCellColor({
                        tabela: tr.dataset.tabela,
                        id: tr.dataset.id,
                        key: input.dataset.key,
                        element: input
                    }, null);
                }
            });
        } else if (currentCellTarget) {
            setCellColor(currentCellTarget, null);
        }
        contextMenu.style.display = 'none';
    };

    // Modal Copiar Escala
    const modalCopiarEscala = document.createElement('div');
    modalCopiarEscala.id = 'modalCopiarEscala';
    modalCopiarEscala.className = 'modal-expedicao'; // Reutiliza classe para estilo base de overlay
    modalCopiarEscala.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);display:none;justify-content:center;align-items:center;z-index:2000;';
    modalCopiarEscala.innerHTML = `
        <div style="background:white;padding:20px;border-radius:8px;width:300px;box-shadow:0 2px 10px rgba(0,0,0,0.3);font-family:sans-serif;text-align:center;">
            <h3 style="margin-top:0;color:#333;">Copiar Escala</h3>
            <p id="textoOrigemCopia" style="color:#666;font-size:0.9em;margin-bottom:15px;"></p>
            <div style="margin-bottom:15px;text-align:left;">
                <label style="display:block;margin-bottom:5px;font-weight:bold;font-size:0.9em;">Para o dia:</label>
                <input type="date" id="dataDestinoCopia" style="width:100%;padding:8px;border:1px solid #ccc;border-radius:4px;box-sizing:border-box;">
            </div>
            <div style="display:flex;gap:10px;justify-content:center;">
                <button id="btnConfirmarCopia" style="background:#17a2b8;color:white;padding:8px 15px;border:none;border-radius:4px;cursor:pointer;font-weight:bold;">Copiar</button>
                <button id="btnCancelarCopia" style="background:transparent;border:1px solid #ccc;color:#666;padding:8px 15px;border-radius:4px;cursor:pointer;">Cancelar</button>
            </div>
        </div>
    `;
    document.body.appendChild(modalCopiarEscala);

    const btnConfirmarCopia = document.getElementById('btnConfirmarCopia');
    const btnCancelarCopia = document.getElementById('btnCancelarCopia');
    const dataDestinoCopia = document.getElementById('dataDestinoCopia');
    const textoOrigemCopia = document.getElementById('textoOrigemCopia');

    const btnTerceiroRotaSuspenso = document.createElement('button');
    btnTerceiroRotaSuspenso.id = 'btnTerceiroRotaSuspenso';
    btnTerceiroRotaSuspenso.className = 'floating-terceiro-btn hidden';
    btnTerceiroRotaSuspenso.type = 'button';
    btnTerceiroRotaSuspenso.disabled = true;
    btnTerceiroRotaSuspenso.innerHTML = '<i class="fa-solid fa-user-plus"></i><span>Terceiro</span>';
    document.body.appendChild(btnTerceiroRotaSuspenso);

    btnTerceiroRotaSuspenso.addEventListener('click', () => {
        if (!btnTerceiroRotaSuspenso.disabled) abrirModalTerceiroRota();
    });

    function atualizarBotaoTerceiroSuspenso() {
        const contexto = getDataEscalaAberta();
        const escalaAberta = painelEscala && !painelEscala.classList.contains('hidden');
        const ativo = !!contexto && escalaAberta;

        btnTerceiroRotaSuspenso.disabled = !ativo;
        btnTerceiroRotaSuspenso.classList.toggle('hidden', !ativo);

        if (ativo) {
            btnTerceiroRotaSuspenso.title = `Gerenciar terceiro por rota - ${contexto.dia} ${contexto.dataBR}`;
            btnTerceiroRotaSuspenso.querySelector('span').textContent = `Terceiro ${contexto.dia}`;
        } else {
            btnTerceiroRotaSuspenso.title = 'Abra uma escala e selecione uma data.';
            btnTerceiroRotaSuspenso.querySelector('span').textContent = 'Terceiro';
        }
    }

    if (btnCancelarCopia) btnCancelarCopia.addEventListener('click', () => modalCopiarEscala.style.display = 'none');
    modalCopiarEscala.addEventListener('click', (e) => { if (e.target === modalCopiarEscala) modalCopiarEscala.style.display = 'none'; });

    // Modal Copiar Planejamento para Semana
    const modalCopiarPlanejamento = document.createElement('div');
    modalCopiarPlanejamento.id = 'modalCopiarPlanejamento';
    modalCopiarPlanejamento.className = 'modal-expedicao';
    modalCopiarPlanejamento.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);display:none;justify-content:center;align-items:center;z-index:2000;';
    modalCopiarPlanejamento.innerHTML = `
        <div style="background:white;padding:20px;border-radius:8px;width:350px;box-shadow:0 2px 10px rgba(0,0,0,0.3);font-family:sans-serif;text-align:center;">
            <h3 style="margin-top:0;color:#333;">Copiar Planejamento para Escala</h3>
            <p style="color:#666;font-size:0.9em;margin-bottom:15px;">Selecione a semana de destino para aplicar este planejamento.</p>
            <div style="margin-bottom:15px;text-align:left;">
                <label style="display:block;margin-bottom:5px;font-weight:bold;font-size:0.9em;">Semana Destino:</label>
                <select id="selectSemanaDestinoPlan" style="width:100%;padding:8px;border:1px solid #ccc;border-radius:4px;box-sizing:border-box;"></select>
            </div>
            <div style="display:flex;gap:10px;justify-content:center;">
                <button id="btnConfirmarCopiaPlan" style="background:#28a745;color:white;padding:8px 15px;border:none;border-radius:4px;cursor:pointer;font-weight:bold;">Aplicar</button>
                <button id="btnCancelarCopiaPlan" style="background:transparent;border:1px solid #ccc;color:#666;padding:8px 15px;border-radius:4px;cursor:pointer;">Cancelar</button>
            </div>
        </div>
    `;
    document.body.appendChild(modalCopiarPlanejamento);

    const btnCopiarPlanejamento = document.getElementById('btnCopiarPlanejamento');
    const btnCancelarCopiaPlan = document.getElementById('btnCancelarCopiaPlan');
    const btnConfirmarCopiaPlan = document.getElementById('btnConfirmarCopiaPlan');

    if (btnCopiarPlanejamento) {
        btnCopiarPlanejamento.addEventListener('click', () => {
            const selectDest = document.getElementById('selectSemanaDestinoPlan');
            // Copia as opções do seletor principal de semanas
            selectDest.innerHTML = selectSemana.innerHTML;
            selectDest.value = selectSemana.value;
            modalCopiarPlanejamento.style.display = 'flex';
        });
    }

    if (btnCancelarCopiaPlan) {
        btnCancelarCopiaPlan.addEventListener('click', () => modalCopiarPlanejamento.style.display = 'none');
    }

    if (btnConfirmarCopiaPlan) {
        btnConfirmarCopiaPlan.addEventListener('click', async () => {
            const sourceWeek = selectSemana.value;
            const targetWeek = document.getElementById('selectSemanaDestinoPlan').value;

            if (!sourceWeek || !targetWeek) return;
            if (!confirm(`Confirma aplicar o planejamento da ${sourceWeek} na escala da ${targetWeek}?`)) return;

            try {
                // 1. Busca o planejamento da semana atual
                const { data: planData, error } = await supabaseClient
                    .from('planejamento_semanal')
                    .select('*')
                    .eq('semana_nome', sourceWeek);

                if (error) throw error;
                if (!planData || planData.length === 0) {
                    alert('O planejamento desta semana está vazio.');
                    return;
                }

                const inserts = [];
                const dias = ['DOMINGO', 'SEGUNDA', 'TERCA', 'QUARTA', 'QUINTA', 'SEXTA', 'SABADO'];

                // 2. Transforma o planejamento em registros de escala diária
                planData.forEach(row => {
                    dias.forEach(dia => {
                        const rota = row[`${dia.toLowerCase()}_rota`];
                        const status = row[`${dia.toLowerCase()}_status`];

                        // Só cria registro se houver rota ou status definido para o dia
                        if (rota || status) {
                            const dataEscala = CACHE_DATAS[targetWeek][dia].toISOString().split('T')[0];
                            inserts.push({
                                semana_nome: targetWeek,
                                data_escala: dataEscala,
                                tipo_escala: 'PADRAO', // Assume que planejamento vai para PADRAO
                                placa: row.placa,
                                modelo: row.modelo,
                                motorista: row.motorista,
                                auxiliar: row.auxiliar,
                                terceiro: row.terceiro,
                                rota: rota,
                                status: status
                            });
                        }
                    });
                });

                if (inserts.length > 0) {
                    const { error: insertError } = await supabaseClient.from('escala').insert(inserts);
                    if (insertError) throw insertError;
                    alert('Planejamento aplicado à escala com sucesso!');
                    modalCopiarPlanejamento.style.display = 'none';
                } else {
                    alert('Nenhum dado válido encontrado no planejamento para copiar.');
                }

            } catch (err) {
                console.error('Erro ao copiar planejamento:', err);
                alert('Erro ao copiar planejamento: ' + err.message);
            }
        });
    }

    // Modal de Orientação do PDF
    const pdfModal = document.createElement('div');
    pdfModal.id = 'pdfOrientationModal';
    pdfModal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);display:none;justify-content:center;align-items:center;z-index:2000;';
    pdfModal.innerHTML = `
        <div style="background:white;padding:20px;border-radius:8px;text-align:center;box-shadow:0 2px 10px rgba(0,0,0,0.3);font-family:sans-serif;max-width:400px;">
            <h3 style="margin-top:0;color:#333;">Gerar PDF da Escala</h3>
            
            <div style="text-align:left; margin-bottom:15px; border:1px solid #eee; padding:10px; border-radius:4px;">
                <p style="margin:0 0 10px 0; font-weight:bold; font-size:0.9em;">Selecione as seções:</p>
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:5px; font-size:0.85em;">
                    <label><input type="checkbox" class="pdf-section-chk" value="PADRAO" checked> PADRÃO</label>
                    <label><input type="checkbox" class="pdf-section-chk" value="TRANSFERENCIA" checked> TRANSFERÊNCIA</label>
                    <label><input type="checkbox" class="pdf-section-chk" value="EQUIPAMENTO" checked> EQUIPAMENTO</label>
                    <label><input type="checkbox" class="pdf-section-chk" value="RESERVA" checked> RESERVAS</label>
                    <label><input type="checkbox" class="pdf-section-chk" value="FALTAS" checked> FALTAS</label>
                </div>
            </div>

            <p style="margin-bottom:10px; font-size:0.9em;">Escolha a orientação:</p>
            <div style="margin:20px 0;display:flex;gap:10px;justify-content:center;">
                <button id="btnPdfLandscape" style="background:#007bff;color:white;padding:10px 20px;border:none;border-radius:4px;cursor:pointer;font-weight:bold;"><i class="fas fa-image"></i> Horizontal</button>
                <button id="btnPdfPortrait" style="background:#28a745;color:white;padding:10px 20px;border:none;border-radius:4px;cursor:pointer;font-weight:bold;"><i class="fas fa-file-alt"></i> Vertical</button>
            </div>
            <button id="btnPdfCancel" style="background:transparent;border:none;color:#666;cursor:pointer;text-decoration:underline;">Cancelar</button>
        </div>
    `;
    document.body.appendChild(pdfModal);

    // Modal de Expedição
    const expedicaoModal = document.createElement('div');
    expedicaoModal.id = 'modalExpedicao';
    expedicaoModal.className = 'modal-expedicao';
    expedicaoModal.innerHTML = `
        <div class="modal-expedicao-content">
            <div class="modal-expedicao-header">
                <h3 id="modalExpedicaoTitulo">Resumo de Expedição</h3>
                <button class="close-btn" id="modalExpedicaoClose">&times;</button>
            </div>
            <div class="modal-expedicao-subheader">
                <span id="modalExpedicaoDiaSemana"></span>
                <span id="modalExpedicaoSemanaData"></span>
            </div>
            <div class="modal-expedicao-table-container">
                <table class="modal-expedicao-table">
                    <thead>
                        <tr>
                            <th>Placa</th>
                            <th>Modelo</th>
                            <th>Rota</th>
                            <th>Status</th>
                            <th>Motorista</th>
                        </tr>
                        <tr id="expedicao-filters">
                            <td><select class="filter-input" data-column="placa" multiple></select></td>
                            <td><select class="filter-input" data-column="modelo" multiple></select></td>
                            <td><select class="filter-input" data-column="rota" multiple></select></td>
                            <td><select class="filter-input" data-column="status" multiple></select></td>
                            <td><select class="filter-input" data-column="motorista" multiple></select></td>
                        </tr>
                    </thead>
                    <tbody id="modalExpedicaoTbody"></tbody>
                </table>
            </div>
            <div class="modal-expedicao-footer">
                <div id="modalExpedicaoTotalizador"></div>
                <div class="card-acoes">
                    <h4>Ações</h4>
                    <button id="btnExpedicaoPDF" class="btn-acao-exp pdf"><i class="fas fa-file-pdf"></i> PDF</button>
                    <button id="btnExpedicaoPDFConferencia" class="btn-acao-exp pdf" style="background-color: #17a2b8;"><i class="fas fa-clipboard-check"></i> PDF Conferência</button>
                    <button id="btnExpedicaoXLSX" class="btn-acao-exp xlsx"><i class="fas fa-file-excel"></i> XLSX</button>
                    <button id="btnExpedicaoFecharFooter" class="btn-acao-exp fechar"><i class="fas fa-times"></i> Fechar</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(expedicaoModal);

    // Fechar modal ao clicar fora
    pdfModal.addEventListener('click', (e) => { if (e.target === pdfModal) pdfModal.style.display = 'none'; });
    document.getElementById('btnPdfCancel').addEventListener('click', () => pdfModal.style.display = 'none');

    // Reordenar abas visualmente para começar com Domingo
    if (tabButtons.length > 0) {
        const container = tabButtons[0].parentNode;
        const order = ['PLANEJAMENTO', 'DOMINGO', 'SEGUNDA', 'TERCA', 'QUARTA', 'QUINTA', 'SEXTA', 'SABADO'];
        const buttonsMap = {};
        tabButtons.forEach(btn => { 
            if (btn.dataset.dia) buttonsMap[btn.dataset.dia] = btn; 
            if (btn.dataset.tab) buttonsMap[btn.dataset.tab.toUpperCase()] = btn;
        });
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
                container.className = 'section-add-row-container';
                container.dataset.section = sec;
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

    function verificarDuplicidades() {
        // Determina o escopo de busca (apenas o painel visível) para não pegar dados de outras abas
        const painelDias = document.getElementById('conteudoDias');
        const painelPlan = document.getElementById('conteudoPlanejamento');
        let scope = document;

        if (painelDias && !painelDias.classList.contains('hidden')) {
            scope = painelDias;
        } else if (painelPlan && !painelPlan.classList.contains('hidden')) {
            scope = painelPlan;
        }

        // Agrupamento de campos para verificação (ex: motorista e motorista_ausente são verificados juntos)
        const groupsToCheck = [
            ['placa'],
            ['motorista', 'motorista_ausente'],
            ['auxiliar', 'auxiliar_ausente'],
            ['terceiro']
        ];
        
        groupsToCheck.forEach(keys => {
            const selector = keys.map(k => `input[data-key="${k}"]`).join(', ');
            const inputs = scope.querySelectorAll(selector);
            const valuesMap = new Map();

            inputs.forEach(input => {
                // Reseta estilo (mantendo a cor do status se for o caso, mas aqui estamos resetando duplicidade)
                // Se for status, a cor é gerenciada por updateInputColor, então não resetamos background aqui se for status
                // Mas status não está em groupsToCheck, então ok.
                input.style.backgroundColor = '';
                input.style.color = '';
                input.style.fontWeight = '';

                const val = input.value.trim().toUpperCase();
                if (val) {
                    if (!valuesMap.has(val)) valuesMap.set(val, []);
                    valuesMap.get(val).push(input);
                }
            });

            valuesMap.forEach((elements) => {
                if (elements.length > 1) {
                    elements.forEach(el => {
                        el.style.backgroundColor = '#dc3545';
                        el.style.color = 'white';
                        el.style.fontWeight = 'bold';
                    });
                }
            });
        });
    }

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

    // --- ATUALIZAR TÍTULO DA ABA DINAMICAMENTE ---
    function atualizarTituloDia(dia, semana) {
        const tituloDia = document.getElementById('tituloDia');
        if (!tituloDia) return;

        const coresDia = { 'SEGUNDA': '#007bff', 'TERCA': '#fd7e14', 'QUARTA': '#28a745', 'QUINTA': '#6f42c1', 'SEXTA': '#dc3545', 'SABADO': '#17a2b8', 'DOMINGO': '#e83e8c' };
        tituloDia.style.color = coresDia[dia] || '#006937';

        const dataObj = CACHE_DATAS[semana] ? CACHE_DATAS[semana][dia] : new Date();
        const formattedDate = dataObj.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
        const diaNome = dia === 'TERCA' ? 'TERÇA' : dia;

        tituloDia.innerHTML = `
            <span><i class="fa-solid fa-calendar-day"></i> ${diaNome} - ${formattedDate}</span>
            <input type="file" id="fileImportarDia" accept=".xlsx, .xls" style="display: none;">
            <button id="btnCopiarDia" class="btn-primary" style="padding: 4px 10px; border-radius: 4px; border: none; cursor: pointer; font-size: 0.8em; background-color: #17a2b8; color: white;" title="Copiar Escala">
                <i class="fa-solid fa-copy"></i>
            </button>
            <button id="btnModeloDia" class="btn-primary" style="padding: 4px 10px; border-radius: 4px; border: none; cursor: pointer; font-size: 0.8em; background-color: #6c757d; color: white;" title="Baixar Modelo">
                <i class="fa-solid fa-download"></i>
            </button>
            <button id="btnImportarDia" class="btn-primary" style="padding: 4px 10px; border-radius: 4px; border: none; cursor: pointer; font-size: 0.8em; background-color: #28a745; color: white;" title="Importar XLSX">
                <i class="fa-solid fa-file-import"></i>
            </button>
            <button id="btnExcluirSelecionadosDia" class="btn-primary" style="padding: 4px 10px; border-radius: 4px; border: none; cursor: pointer; font-size: 0.8em; background-color: #dc3545; color: white;" title="Excluir Selecionados">
                <i class="fa-solid fa-trash-can"></i>
            </button>`;
    }

    async function carregarDadosDia(dia, semana) {
        const sections = Object.keys(SECAO_PARA_DB);
        sections.forEach(sec => {
            const tbody = document.getElementById(`tbody${sec}`);
            const colspan = sec === 'Faltas' ? 6 : 9;
            if(tbody) tbody.innerHTML = `<tr><td colspan="${colspan}" style="text-align: center;">Carregando...</td></tr>`;
        });

        const dataObj = CACHE_DATAS[semana] ? CACHE_DATAS[semana][dia] : new Date();
        const dataISO = dataObj.toISOString().split('T')[0];

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

                // Armazena os dados da seção PADRÃO para o modal de expedição
                if (sec === 'Padrao') {
                    dadosPadraoDoDia = itens;
                }

                if (itens.length > 0) {
                    itens.forEach(item => {
                        const tr = document.createElement('tr');
                        tr.dataset.id = item.id; // ID do banco para updates
                        tr.dataset.tabela = sec === 'Faltas' ? 'faltas_afastamentos' : 'escala';

                        if (sec === 'Faltas') {
                            tr.innerHTML = `
                                <td style="text-align: center; vertical-align: middle;"><input type="checkbox" class="row-selector-dia"></td>
                                <td><input type="text" list="listaMotoristas" class="table-input" value="${item.motorista_ausente || ''}" data-key="motorista_ausente" placeholder="Motorista" style="${getCellStyle('faltas_afastamentos', item.id, 'motorista_ausente')}"></td>
                                <td contenteditable="true" data-key="motivo_motorista" style="${getCellStyle('faltas_afastamentos', item.id, 'motivo_motorista')}">${item.motivo_motorista || ''}</td>
                                <td><input type="text" list="listaAuxiliares" class="table-input" value="${item.auxiliar_ausente || ''}" data-key="auxiliar_ausente" placeholder="Auxiliar" style="${getCellStyle('faltas_afastamentos', item.id, 'auxiliar_ausente')}"></td>
                                <td contenteditable="true" data-key="motivo_auxiliar" style="${getCellStyle('faltas_afastamentos', item.id, 'motivo_auxiliar')}">${item.motivo_auxiliar || ''}</td>
                                <td class="actions-cell"><button class="btn-icon delete btn-delete-row" title="Remover"><i class="fas fa-trash-alt"></i></button></td>
                            `;
                        } else {
                            tr.innerHTML = `
                                <td style="text-align: center; vertical-align: middle;"><input type="checkbox" class="row-selector-dia"></td>
                                <td><input type="text" list="listaVeiculos" class="table-input" value="${item.placa || ''}" data-key="placa" placeholder="Placa" style="${getCellStyle('escala', item.id, 'placa')}"></td>
                                <td><input type="text" list="listaModelos" class="table-input non-editable" value="${item.modelo || ''}" data-key="modelo" placeholder="Modelo" readonly style="${getCellStyle('escala', item.id, 'modelo')}"></td>
                                <td><input type="text" list="listaRotas" class="table-input" value="${item.rota || ''}" data-key="rota" placeholder="Rota" style="${getCellStyle('escala', item.id, 'rota')}"></td>
                                <td><input type="text" list="listaStatus" class="table-input" value="${item.status || ''}" data-key="status" placeholder="Status" title="${getStatusTitleAttr(item.status)}" style="${getCellStyle('escala', item.id, 'status', item.status)}"></td>
                                <td><input type="text" list="listaMotoristas" class="table-input" value="${item.motorista || ''}" data-key="motorista" placeholder="Motorista" style="${getCellStyle('escala', item.id, 'motorista')}"></td>
                                <td><input type="text" list="listaAuxiliares" class="table-input" value="${item.auxiliar || ''}" data-key="auxiliar" placeholder="Auxiliar" style="${getCellStyle('escala', item.id, 'auxiliar')}"></td>
                                <td><input type="text" list="listaTerceiros" class="table-input" value="${item.terceiro || ''}" data-key="terceiro" placeholder="Terceiro" style="${getCellStyle('escala', item.id, 'terceiro')}"></td>
                                <td class="actions-cell"><button class="btn-icon delete btn-delete-row" title="Remover"><i class="fas fa-trash-alt"></i></button></td>
                            `;
                        }
                        tbody.appendChild(tr);
                    });
                } else {
                    const colspan = sec === 'Faltas' ? 6 : 9;
                    tbody.innerHTML = `<tr><td colspan="${colspan}" style="text-align: center;">Nenhum registro em ${sec.toUpperCase()}.</td></tr>`;
                }
            });

            verificarDuplicidades();
            setupEscalaGridTools();

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

        // --- CONTEXT MENU (Right-click para Gerar Boleta) ---
        painelEscala.addEventListener('contextmenu', (e) => {
            const target = e.target;
            
            // 1. Verifica se é Header (TH) para pintar coluna
            const th = target.closest('th');
            if (th) {
                e.preventDefault();
                
                // Lógica de Seleção no Clique Direito
                if (!th.classList.contains('selected-header')) {
                    if (!e.ctrlKey) {
                        document.querySelectorAll('.selected-header').forEach(el => el.classList.remove('selected-header'));
                        document.querySelectorAll('.selected-cell').forEach(el => el.classList.remove('selected-cell'));
                    }
                    th.classList.add('selected-header');
                }
                currentHeaderTarget = th;
                
                const count = document.querySelectorAll('.selected-header').length;
                const text = count > 1 ? `Pintar ${count} Colunas...` : 'Escolher Cor...';

                contextMenu.innerHTML = `
                    <div class="context-menu-item" onclick="triggerColorPicker()"><i class="fas fa-palette" style="margin-right: 8px; color: #007bff;"></i>${text}</div>
                    <div class="context-menu-item" onclick="resetColumnColor()"><i class="fas fa-eraser" style="margin-right: 8px; color: #dc3545;"></i>Limpar Cor</div>
                    ${getSavedColorsHTML()}
                `;
                
                contextMenu.style.display = 'block';
                contextMenu.style.left = `${e.pageX}px`;
                contextMenu.style.top = `${e.pageY}px`;
                return;
            }

            // 2. Verifica se é Célula (Input) para pintar célula ou gerar boleta
            const input = target.closest('input.table-input');
            const tr = target.closest('tr');

            if (input && tr && tr.dataset.id) {
                e.preventDefault(); // Previne o menu padrão do navegador
                
                // Lógica de Seleção no Clique Direito
                if (!input.classList.contains('selected-cell')) {
                    if (!e.ctrlKey) {
                        document.querySelectorAll('.selected-cell').forEach(el => el.classList.remove('selected-cell'));
                        document.querySelectorAll('.selected-header').forEach(el => el.classList.remove('selected-header'));
                    }
                    input.classList.add('selected-cell');
                }

                currentCellTarget = {
                    tabela: tr.dataset.tabela,
                    id: tr.dataset.id,
                    key: input.dataset.key,
                    element: input
                };

                const count = document.querySelectorAll('.selected-cell').length;
                const text = count > 1 ? `Pintar ${count} Células...` : 'Pintar Célula...';

                let menuHTML = `
                    <div class="context-menu-item" onclick="triggerCellColorPicker()"><i class="fas fa-fill-drip" style="margin-right: 8px; color: #e83e8c;"></i>${text}</div>
                    <div class="context-menu-item" onclick="resetCellColor()"><i class="fas fa-eraser" style="margin-right: 8px; color: #dc3545;"></i>Limpar Cor Célula</div>
                `;

                // Adiciona opção de Boleta se aplicável
                const key = input.dataset.key;
                if ((key === 'motorista' || key === 'auxiliar' || key === 'terceiro') && input.value.trim() !== '') {
                    const nome = input.value.trim();
                    const placa = tr.querySelector('input[data-key="placa"]')?.value || '';
                    const rota = tr.querySelector('input[data-key="rota"]')?.value || '';
                    const modelo = tr.querySelector('input[data-key="modelo"]')?.value || '';

                    menuHTML += `<div class="context-menu-item-separator" style="border-bottom:1px solid #eee; margin: 4px 0;"></div>`;
                    menuHTML += `<div class="context-menu-item" data-action="gerarBoleta" data-nome="${nome}" data-placa="${placa}" data-rota="${rota}" data-modelo="${modelo}"><i class="fas fa-file-invoice" style="margin-right: 8px;"></i>Gerar Boleta para ${nome}</div>`;
                }

                menuHTML += getSavedColorsHTML();
                contextMenu.innerHTML = menuHTML;
                
                // Posiciona e exibe o menu
                contextMenu.style.display = 'block';
                contextMenu.style.left = `${e.pageX}px`;
                contextMenu.style.top = `${e.pageY}px`;

                // Adiciona o listener para o item do menu
                const itemMenu = contextMenu.querySelector('[data-action="gerarBoleta"]');
                if(itemMenu) {
                    itemMenu.addEventListener('click', () => {
                        abrirModalBoletaComDados(itemMenu.dataset.nome, itemMenu.dataset.placa, itemMenu.dataset.rota, itemMenu.dataset.modelo);
                        contextMenu.style.display = 'none';
                    });
                }
            }
        });

        painelEscala.addEventListener('click', async (e) => {
            // Lógica de Seleção Múltipla com CTRL
            const input = e.target.closest('input.table-input');
            const th = e.target.closest('th');
            
            if (input || th) {
                if (e.ctrlKey) {
                    if (input) input.classList.toggle('selected-cell');
                    if (th) th.classList.toggle('selected-header');
                } else {
                    // Se clicar sem CTRL, limpa outras seleções (comportamento padrão de grid)
                    document.querySelectorAll('.selected-cell').forEach(el => el !== input && el.classList.remove('selected-cell'));
                    document.querySelectorAll('.selected-header').forEach(el => el !== th && el.classList.remove('selected-header'));
                    
                    if (input) input.classList.add('selected-cell');
                    if (th) th.classList.add('selected-header');
                }
            }

            // Botão Excluir
            const btnExcluir = e.target.closest('.btn-delete-row');
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
            const btnToggleSection = e.target.closest('.section-toggle-btn');
            if (btnToggleSection) {
                toggleEscalaSection(btnToggleSection.dataset.section);
                return;
            }

            if (e.target.closest('#btnImportarDiaAction')) {
                fileImportarDia.click();
            }

            // Botão Copiar Dia Seguinte
            if (e.target.closest('#btnCopiarDiaSeguinte')) {
                abrirModalCopia();
            }

            // Botão Expedição
            if (e.target.closest('#btnExpedicao')) {
                abrirModalExpedicao();
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
        if (key === 'placa' && (tabela === 'escala' || tabela === 'planejamento_semanal')) {
            const placaBusca = normalizeVehiclePlate(valor);
            const veiculoEncontrado = listaVeiculos.find(v => v.placa_normalizada === placaBusca || normalizeVehiclePlate(v.placa) === placaBusca);
            if (veiculoEncontrado) {
                extraUpdates.modelo = veiculoEncontrado.modelo;
                const inputModelo = tr.querySelector('input[data-key="modelo"]');
                if (inputModelo) inputModelo.value = veiculoEncontrado.modelo;
            }
        }
        // Atualiza cor se for Status
        if (key === 'status') updateInputColor(target);

        // Atualiza cor no Planejamento (se preenchido)
        if (tabela === 'planejamento_semanal' && (key.includes('_rota') || key.includes('_status'))) {
            updatePlanningInputColor(target);
            if (key.includes('_status')) target.title = getStatusTooltip(target.value);
        }

        verificarDuplicidades();

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

    function abrirModalCopia() {
        const semanaAtual = selectSemana.value;
        const diaAtual = document.querySelector('.tab-btn.active')?.dataset.dia;
        if (!semanaAtual || !diaAtual) return;

        const dataObj = CACHE_DATAS[semanaAtual][diaAtual];
        const formattedDate = dataObj.toLocaleDateString('pt-BR', { timeZone: 'UTC' });

        if (textoOrigemCopia) textoOrigemCopia.textContent = `Copiando escala de: ${formattedDate}`;
        
        // Sugere o dia seguinte como padrão
        const diaSeguinte = new Date(dataObj);
        diaSeguinte.setUTCDate(diaSeguinte.getUTCDate() + 1);
        if (dataDestinoCopia) dataDestinoCopia.value = diaSeguinte.toISOString().split('T')[0];

        if (modalCopiarEscala) modalCopiarEscala.classList.remove('hidden');
        modalCopiarEscala.style.display = 'flex';
    }

    if (btnConfirmarCopia) {
        btnConfirmarCopia.addEventListener('click', async () => {
            const dataDestino = dataDestinoCopia.value;
            if (!dataDestino) return alert('Selecione uma data de destino.');
            
            const semanaAtual = selectSemana.value;
            const diaAtual = document.querySelector('.tab-btn.active')?.dataset.dia;
            if (!semanaAtual || !diaAtual) return;

            const dataOrigem = CACHE_DATAS[semanaAtual][diaAtual].toISOString().split('T')[0];
            
            // Calcular semana de destino
            const dateDestinoUTC = new Date(Date.UTC(
                parseInt(dataDestino.split('-')[0]),
                parseInt(dataDestino.split('-')[1]) - 1,
                parseInt(dataDestino.split('-')[2])
            ));
            
            const baseDate = new Date(Date.UTC(2025, 11, 28));
            const diffTime = dateDestinoUTC.getTime() - baseDate.getTime();
            const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
            let weekNum = Math.floor(diffDays / 7) + 1;
            if (weekNum < 1) weekNum = 1;
            const semanaDestino = `SEMANA ${String(weekNum).padStart(2, '0')} - 2026`;

            if (!confirm(`Confirmar cópia de ${dataOrigem} para ${dataDestino} (${semanaDestino})?`)) return;

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
                semana_nome: semanaDestino,
                data_escala: dataDestino
            }));
            
            const novosFaltas = resFaltas.data.map(({ id, created_at, updated_at, ...rest }) => ({
                ...rest,
                semana_nome: semanaDestino,
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
            modalCopiarEscala.style.display = 'none';
            
            // Se for na mesma semana, muda a aba
            if (semanaDestino === selectSemana.value) {
                const diasSemana = ['DOMINGO', 'SEGUNDA', 'TERCA', 'QUARTA', 'QUINTA', 'SEXTA', 'SABADO'];
                const diaSemanaDestino = diasSemana[dateDestinoUTC.getUTCDay()];
                document.querySelector(`.tab-btn[data-dia="${diaSemanaDestino}"]`)?.click();
            }

        } catch (err) {
            console.error('Erro ao copiar:', err);
            alert('Erro ao copiar dados: ' + err.message);
        }
        });
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

    function normalizeString(value) {
        return String(value || '')
            .trim()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/\s+/g, ' ')
            .toUpperCase();
    }

    function findSheetForSemana(workbook, semana) {
        const normalizedWeek = normalizeString(semana);
        // Tenta extrair o número da semana (ex: de "SEMANA 19 - 2026" extrai "19")
        const weekNumberMatch = normalizedWeek.match(/SEMANA\s*([0-9]{1,2})/);
        const weekNumber = weekNumberMatch ? weekNumberMatch[1] : null;
        
        // Prioridade 1: Aba com o nome exato da semana (ex: "SEMANA 19")
        // 1. Prioridade: Aba com o nome exato da semana (ex: "SEMANA 19 - 2026")
        let sheet = workbook.SheetNames.find(n => normalizeString(n) === normalizedWeek);
        if (sheet) return sheet;

        // Prioridade 2: Aba que contém "PLAN"
        // 2. Busca pelo número da semana (ex: "19" ou "SEMANA 19")
        if (weekNumber) {
            sheet = workbook.SheetNames.find(n => {
                const ns = normalizeString(n);
                return ns === weekNumber || ns === `SEMANA ${weekNumber}`;
            });
            if (sheet) return sheet;
        }

        // 3. Busca por aba que contém "PLAN"
        sheet = workbook.SheetNames.find(n => normalizeString(n).includes('PLAN'));
        if (sheet) return sheet;

        
        // 4. Fallback: Se houver apenas uma aba no arquivo, assume que é ela
        if (workbook.SheetNames.length === 1) return workbook.SheetNames[0];
        
        return null;
    }

    /**
     * Função Inteligente para Importar a Semana Inteira (Ações Rápidas ou Aba Planejamento)
     * Se o arquivo tiver abas por dia (SEGUNDA, TERCA, etc), ela consolida tudo.
     */
    async function importarExcelPlanejamentoGlobal(e) {
        const file = e.target.files[0];
        if (!file) return;

        const semana = selectSemana.value;
        if (!semana) return alert('Selecione uma semana antes de importar.');

        const reader = new FileReader();
        reader.onload = async (evt) => {
            try {
                const data = new Uint8Array(evt.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const diasSemana = ['DOMINGO', 'SEGUNDA', 'TERCA', 'QUARTA', 'QUINTA', 'SEXTA', 'SABADO'];
                
                // Mapa para consolidar dados por PLACA: { 'ABC1234': { placa, motorista, segunda_rota, segunda_status... } }
                const consolidado = new Map();

                // Percorre todas as abas do Excel
                workbook.SheetNames.forEach(sheetName => {
                    const nomeAba = normalizeString(sheetName);
                    // Identifica se a aba é um dia da semana (ex: "TERÇA" -> "TERCA")
                    const diaEncontrado = diasSemana.find(d => nomeAba.includes(d) || (d === 'TERCA' && nomeAba.includes('TERCA')));
                    
                    if (diaEncontrado) {
                        const json = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
                        json.forEach(row => {
                            const r = {};
                            Object.keys(row).forEach(k => r[k.toUpperCase().trim()] = row[k]);
                            
                            const placa = String(r['PLACA'] || '').trim().toUpperCase();
                            if (!placa) return;

                            if (!consolidado.has(placa)) {
                                consolidado.set(placa, {
                                    semana_nome: semana,
                                    placa: placa,
                                    modelo: String(r['MODELO'] || '').trim(),
                                    motorista: String(r['MOTORISTA'] || '').trim(),
                                    auxiliar: String(r['AUXILIAR'] || '').trim(),
                                    terceiro: String(r['TERCEIRO'] || '').trim()
                                });
                            }

                            const entry = consolidado.get(placa);
                            const prefix = diaEncontrado.toLowerCase();
                            entry[`${prefix}_rota`] = String(r['ROTA'] || r[`${diaEncontrado} ROTA`] || '').trim();
                            entry[`${prefix}_status`] = String(r['STATUS'] || r['STAT'] || r[`${diaEncontrado} STATUS`] || '').trim();
                        });
                    }
                });

                if (consolidado.size === 0) {
                    throw new Error('Não foram encontrados dados válidos nas abas diárias (SEGUNDA, TERÇA, etc).');
                }

                const inserts = Array.from(consolidado.values());
                if (confirm(`Deseja importar o planejamento consolidado de ${consolidado.size} veículos para a ${semana}?`)) {
                    const { error } = await supabaseClient.from('planejamento_semanal').insert(inserts);
                    if (error) throw error;
                    alert('✅ Planejamento semanal importado com sucesso!');
                    carregarPlanejamento(semana);
                }

            } catch (err) {
                console.error(err);
                alert('Erro na importação: ' + err.message);
            }
        }

        // 4. Caso o arquivo tenha abas por dia e o usuário esteja tentando importar na aba Planejamento
        const dayMatch = workbook.SheetNames.find(sheetName => normalizeString(sheetName) === diaAtivo);
        if (dayMatch) return dayMatch;

        return workbook.SheetNames.length === 1 ? workbook.SheetNames[0] : null;
    }

    function findRowKey(row, terms) {
        return Object.keys(row).find(key => terms.some(term => key.includes(term))) || null;
    }

    function findDayColumnKey(row, day, type) {
        const normalizedDay = normalizeString(day);
        const aliases = [normalizedDay, normalizedDay.slice(0, 3)];
        return Object.keys(row).find(key => aliases.some(alias => key.includes(alias)) && key.includes(type)) || null;
    }

    const IMPORT_DAYS = ['DOMINGO', 'SEGUNDA', 'TERCA', 'QUARTA', 'QUINTA', 'SEXTA', 'SABADO'];

    function getDiaFromSheetName(sheetName) {
        const normalized = normalizeString(sheetName);
        return IMPORT_DAYS.find(dia => normalized === dia || normalized.startsWith(`${dia} `)) || null;
    }

    function cleanImportValue(value, { keepZero = false } = {}) {
        if (value === null || value === undefined) return '';
        const text = String(value).replace(/\s+/g, ' ').trim();
        if (!keepZero && (text === '0' || normalizeString(text) === 'SYSTEM.XML.XMLELEMENT')) return '';
        return text;
    }

    function normalizeVehiclePlate(value) {
        return cleanImportValue(value).replace(/[\s-]+/g, '').toUpperCase();
    }

    function getModeloVisualByPlaca(placa) {
        const placaBusca = normalizeVehiclePlate(placa);
        const veiculo = listaVeiculos.find(v => v.placa_normalizada === placaBusca || normalizeVehiclePlate(v.placa) === placaBusca);
        return veiculo ? cleanImportValue(veiculo.modelo) : '';
    }

    function splitPlacaModelo(value) {
        const text = cleanImportValue(value);
        if (!text) return { placa: '', modelo: '' };

        const match = text.match(/^([A-Z]{3}\s*-?\s*[0-9A-Z]{4})\s*-?\s*(.*)$/i);
        if (!match) return { placa: text, modelo: '' };

        const placa = normalizeVehiclePlate(match[1]);
        const modelo = cleanImportValue(match[2]);
        return { placa, modelo };
    }

    function excelDateToISO(cell) {
        if (!cell) return '';

        if (cell.v instanceof Date) {
            return cell.v.toISOString().split('T')[0];
        }

        const rawValue = cell.v ?? cell.w;
        const numericValue = Number(rawValue);
        if (!Number.isNaN(numericValue) && numericValue > 0) {
            const utc = Date.UTC(1899, 11, 30) + numericValue * 86400000;
            return new Date(utc).toISOString().split('T')[0];
        }

        const text = cleanImportValue(rawValue || cell.w, { keepZero: true });
        const match = text.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
        if (!match) return '';

        const day = match[1].padStart(2, '0');
        const month = match[2].padStart(2, '0');
        const year = match[3].length === 2 ? `20${match[3]}` : match[3];
        return `${year}-${month}-${day}`;
    }

    function identifyImportSection(row) {
        const marker = normalizeString(row[1] || '');
        if (marker.includes('TRANSFERENCIA')) return 'TRANSFERENCIA';
        if (marker.includes('EQUIPAMENTO')) return 'EQUIPAMENTO';
        if (marker.includes('RESERVAS')) return 'RESERVA';
        if (marker.includes('FALTAS') || marker.includes('FERIAS') || marker.includes('AFASTADOS')) return 'FALTAS';
        return null;
    }

    function isImportHeaderRow(row) {
        const cod = normalizeString(row[1] || '');
        const placa = normalizeString(row[2] || '');
        const rota = normalizeString(row[3] || '');
        return cod === 'COD' && placa.includes('PLACA') && rota.includes('ROTA');
    }

    function getSheetCellText(sheet, address) {
        const cell = sheet[address];
        if (!cell) return '';
        if (cell.w !== undefined && cell.w !== null) return cleanImportValue(cell.w, { keepZero: true });
        if (cell.v !== undefined && cell.v !== null && typeof cell.v !== 'object') return cleanImportValue(cell.v, { keepZero: true });
        return '';
    }

    function getRoteiroRow(sheet, rowNumber) {
        return [
            '',
            getSheetCellText(sheet, `B${rowNumber}`),
            getSheetCellText(sheet, `C${rowNumber}`),
            getSheetCellText(sheet, `D${rowNumber}`),
            getSheetCellText(sheet, `E${rowNumber}`),
            getSheetCellText(sheet, `F${rowNumber}`),
            getSheetCellText(sheet, `G${rowNumber}`),
            getSheetCellText(sheet, `H${rowNumber}`)
        ];
    }

    function parseRoteiroSheet(workbook, sheetName, semana) {
        const sheet = workbook.Sheets[sheetName];
        const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1:H1');
        const dataISO = excelDateToISO(sheet['G4']);
        const insertsEscala = [];
        const insertsFaltas = [];

        let currentSection = 'PADRAO';
        let headerFound = false;

        for (let rowNumber = range.s.r + 1; rowNumber <= range.e.r + 1; rowNumber++) {
            const row = getRoteiroRow(sheet, rowNumber);
            const nextSection = identifyImportSection(row);
            if (nextSection) {
                currentSection = nextSection;
                headerFound = false;
                continue;
            }

            if (isImportHeaderRow(row)) {
                headerFound = true;
                continue;
            }

            if (!headerFound) continue;

            const rota = cleanImportValue(row[3], { keepZero: true });
            const status = cleanImportValue(row[4], { keepZero: true });
            const motorista = cleanImportValue(row[5]);
            const auxiliar = cleanImportValue(row[6]);
            const terceiro = cleanImportValue(row[7]);

            if (currentSection === 'FALTAS') {
                if (!motorista && !auxiliar) continue;
                insertsFaltas.push({
                    semana_nome: semana,
                    data_escala: dataISO,
                    motorista_ausente: motorista,
                    motivo_motorista: motorista ? rota : '',
                    auxiliar_ausente: auxiliar,
                    motivo_auxiliar: auxiliar ? rota : ''
                });
                continue;
            }

            const { placa, modelo } = splitPlacaModelo(row[2]);
            const modeloVisual = getModeloVisualByPlaca(placa) || modelo;
            if (!placa && !rota && !status && !motorista && !auxiliar && !terceiro) continue;

            insertsEscala.push({
                semana_nome: semana,
                data_escala: dataISO,
                tipo_escala: currentSection,
                placa,
                modelo: modeloVisual,
                rota,
                status,
                motorista,
                auxiliar,
                terceiro
            });
        }

        return { dataISO, insertsEscala, insertsFaltas };
    }

    async function importarRoteiroDiario(workbook, sheetName, semana, diaParaRecarregar = null) {
        const parsed = parseRoteiroSheet(workbook, sheetName, semana);
        if (!parsed) {
            throw new Error(`Falha ao processar a aba ${sheetName}.`);
        }
        const total = parsed.insertsEscala.length + parsed.insertsFaltas.length;
        if (!parsed.dataISO) {
            throw new Error(`Nao foi possivel ler a data em G4 na aba ${sheetName}.`);
        }
        if (total === 0) {
            throw new Error(`Nenhum registro valido encontrado na aba ${sheetName}.`);
        }

        if (parsed.insertsEscala.length > 0) {
            const { error } = await supabaseClient.from('escala').insert(parsed.insertsEscala);
            if (error) throw error;
        }

        if (parsed.insertsFaltas.length > 0) {
            const { error } = await supabaseClient.from('faltas_afastamentos').insert(parsed.insertsFaltas);
            if (error) throw error;
        }

        if (diaParaRecarregar) carregarDadosDia(diaParaRecarregar, semana);
        return total;
    }

    async function importarRoteiroSemana(e) {
        const file = e.target.files[0];
        if (!file) return;

        const semana = selectSemana.value;
        if (!semana) return alert('Selecione uma semana antes de importar.');

        const reader = new FileReader();
        reader.onload = async (evt) => {
            const importModal = document.getElementById('importProgressModal');
            const progressBar = document.getElementById('importProgressBar');
            const progressText = document.getElementById('importProgressText');
            const progressDetails = document.getElementById('importProgressDetails');

            try {
                importModal.classList.remove('hidden');
                progressBar.style.width = '15%';
                progressText.textContent = 'Processando: 15%';
                progressDetails.textContent = 'Lendo arquivo Excel...';

                const data = new Uint8Array(evt.target.result);
                const workbook = XLSX.read(data, { type: 'array', cellDates: false });
                const sheetsDias = workbook.SheetNames
                    .map(sheetName => ({ sheetName, dia: getDiaFromSheetName(sheetName) }))
                    .filter(item => item.dia);

                if (sheetsDias.length === 0) {
                    throw new Error('Nao foram encontradas abas de dias da semana no arquivo.');
                }

                const resumo = sheetsDias.map(({ sheetName }) => {
                    const parsed = parseRoteiroSheet(workbook, sheetName, semana);
                    if (!parsed) return `${sheetName}: falha ao processar`;
                    return `${sheetName}: ${parsed.insertsEscala.length + parsed.insertsFaltas.length} registros`;
                }).join('\n');

                importModal.classList.add('hidden');
                if (!confirm(`Importar as abas diarias encontradas?\n\n${resumo}`)) return;

                importModal.classList.remove('hidden');
                let totalImportado = 0;
                for (let i = 0; i < sheetsDias.length; i++) {
                    const { sheetName } = sheetsDias[i];
                    const progress = 20 + Math.round((i / sheetsDias.length) * 70);
                    progressBar.style.width = `${progress}%`;
                    progressText.textContent = `Processando: ${progress}%`;
                    progressDetails.textContent = `Importando ${sheetName}...`;
                    totalImportado += await importarRoteiroDiario(workbook, sheetName, semana);
                }

                progressBar.style.width = '100%';
                progressText.textContent = 'Processando: 100%';
                progressDetails.textContent = 'Importacao concluida.';

                await new Promise(resolve => setTimeout(resolve, 500));
                alert(`Importacao concluida: ${totalImportado} registros importados.`);

                const diaAtual = document.querySelector('.tab-btn.active')?.dataset.dia;
                if (diaAtual) carregarDadosDia(diaAtual, semana);
            } catch (err) {
                console.error('Erro ao importar roteiro:', err);
                alert('Erro ao importar roteiro: ' + err.message);
            } finally {
                importModal.classList.add('hidden');
                e.target.value = '';
            }
        };
        reader.readAsArrayBuffer(file);
    }

    async function importarExcelPlanejamento(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (evt) => {
            // Mostrar modal de progresso
            const importModal = document.getElementById('importProgressModal');
            const progressBar = document.getElementById('importProgressBar');
            const progressText = document.getElementById('importProgressText');
            const progressDetails = document.getElementById('importProgressDetails');
            
            importModal.classList.remove('hidden');
            progressBar.style.width = '0%';
            progressText.textContent = 'Processando: 0%';
            progressDetails.textContent = '';

            try {
                // Simular atraso de leitura do arquivo
                await new Promise(resolve => setTimeout(resolve, 300));
                progressBar.style.width = '15%';
                progressText.textContent = 'Processando: 15%';
                progressDetails.textContent = 'Lendo arquivo Excel...';

                const data = new Uint8Array(evt.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                
                await new Promise(resolve => setTimeout(resolve, 200));
                progressBar.style.width = '30%';
                progressText.textContent = 'Processando: 30%';
                progressDetails.textContent = 'Localizando planilha...';

                const semana = selectSemana.value;
                if (!semana) {
                    importModal.classList.add('hidden');
                    return alert('Selecione uma semana.');
                }

                const sheetName = findSheetForSemana(workbook, semana);
                if (!sheetName) {
                    importModal.classList.add('hidden');
                    return alert('Não foi possível localizar a aba correspondente à semana selecionada. Verifique o nome da planilha no arquivo Excel.');
                }

                await new Promise(resolve => setTimeout(resolve, 200));
                progressBar.style.width = '45%';
                progressText.textContent = 'Processando: 45%';
                progressDetails.textContent = 'Convertendo dados...';

                const json = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });
                if (!json || json.length === 0) {
                    importModal.classList.add('hidden');
                    return alert('A planilha selecionada está vazia ou não possui dados válidos.');
                }

                const inserts = [];
                const dias = ['DOMINGO', 'SEGUNDA', 'TERCA', 'QUARTA', 'QUINTA', 'SEXTA', 'SABADO'];
                const totalRows = json.length;

                json.forEach((rawRow, index) => {
                    // Atualizar progresso de processamento de linhas (45% - 80%)
                    const rowProgress = 45 + (index / totalRows) * 35;
                    progressBar.style.width = rowProgress + '%';
                    progressText.textContent = `Processando: ${Math.round(rowProgress)}%`;
                    progressDetails.textContent = `Processando linhas: ${index + 1} de ${totalRows}`;

                    const row = {};
                    Object.keys(rawRow).forEach(key => {
                        const normalized = normalizeString(key);
                        if (normalized) row[normalized] = rawRow[key];
                    });

                    const placaKey = findRowKey(row, ['PLACA', 'VEICULO', 'CAMINHAO', 'CARRO']);
                    const modeloKey = findRowKey(row, ['MODELO']);
                    const motoristaKey = findRowKey(row, ['MOTORISTA', 'CONDUTOR', 'CHOFER']);
                    const auxiliarKey = findRowKey(row, ['AUXILIAR', 'APOIO']);
                    const terceiroKey = findRowKey(row, ['TERCEIRO', 'TERCEIRA', 'TERCEIR']);

                    const item = {
                        semana_nome: semana,
                        placa: placaKey ? String(row[placaKey]).trim() : '',
                        modelo: modeloKey ? String(row[modeloKey]).trim() : '',
                        motorista: motoristaKey ? String(row[motoristaKey]).trim() : '',
                        auxiliar: auxiliarKey ? String(row[auxiliarKey]).trim() : '',
                        terceiro: terceiroKey ? String(row[terceiroKey]).trim() : ''
                    };

                    let hasAnyData = !!item.placa || !!item.motorista || !!item.auxiliar || !!item.terceiro;

                    dias.forEach(dia => {
                        const rotaKey = findDayColumnKey(row, dia, 'ROTA');
                        const statusKey = findDayColumnKey(row, dia, 'STATUS');
                        item[`${dia.toLowerCase()}_rota`] = rotaKey ? String(row[rotaKey]).trim() : '';
                        item[`${dia.toLowerCase()}_status`] = statusKey ? String(row[statusKey]).trim() : '';
                        if (item[`${dia.toLowerCase()}_rota`] || item[`${dia.toLowerCase()}_status`]) {
                            hasAnyData = true;
                        }
                    });

                    if (hasAnyData) {
                        inserts.push(item);
                    }
                });

                await new Promise(resolve => setTimeout(resolve, 200));
                progressBar.style.width = '80%';
                progressText.textContent = 'Processando: 80%';
                progressDetails.textContent = 'Confirmando importação...';

                if (inserts.length > 0 && confirm(`Importar ${inserts.length} registros para o Planejamento da ${semana}?`)) {
                    try {
                        progressBar.style.width = '90%';
                        progressText.textContent = 'Processando: 90%';
                        progressDetails.textContent = 'Enviando para banco de dados...';

                        const { error } = await supabaseClient.from('planejamento_semanal').insert(inserts);
                        if (error) throw error;

                        progressBar.style.width = '100%';
                        progressText.textContent = 'Processando: 100%';
                        progressDetails.textContent = 'Importação concluída com sucesso!';

                        await new Promise(resolve => setTimeout(resolve, 1000));
                        importModal.classList.add('hidden');
                        alert('Importação concluída!');
                        carregarPlanejamento(semana);
                    } catch (err) {
                        importModal.classList.add('hidden');
                        console.error('Erro na importação:', err);
                        alert('Erro: ' + err.message);
                    }
                } else if (inserts.length === 0) {
                    importModal.classList.add('hidden');
                    alert('Nenhum registro válido encontrado para importar desta planilha.');
                } else {
                    importModal.classList.add('hidden');
                }
            } catch (err) {
                importModal.classList.add('hidden');
                console.error('Erro ao processar arquivo:', err);
                alert('Erro ao processar o arquivo: ' + err.message);
            }
            
            e.target.value = '';
        };
        reader.readAsArrayBuffer(file);
    }

    function baixarModeloPlanejamento() {
        if (typeof XLSX === 'undefined') return alert('Biblioteca XLSX não carregada.');

        const headers = [
            'PLACA', 'MODELO', 'MOTORISTA', 'AUXILIAR', 'TERCEIRO',
            'DOMINGO ROTA', 'DOMINGO STATUS',
            'SEGUNDA ROTA', 'SEGUNDA STATUS',
            'TERÇA ROTA', 'TERÇA STATUS',
            'QUARTA ROTA', 'QUARTA STATUS',
            'QUINTA ROTA', 'QUINTA STATUS',
            'SEXTA ROTA', 'SEXTA STATUS',
            'SÁBADO ROTA', 'SÁBADO STATUS'
        ];

        const data = [
            { 'PLACA': 'EXEMPLO', 'MODELO': 'VUC', 'MOTORISTA': 'NOME', 'AUXILIAR': '', 'TERCEIRO': '', 'DOMINGO ROTA': '', 'DOMINGO STATUS': 'FOLGA', 'SEGUNDA ROTA': '101', 'SEGUNDA STATUS': 'OK' }
        ];

        const ws = XLSX.utils.json_to_sheet(data, { header: headers });
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Modelo");
        XLSX.writeFile(wb, "Modelo_Planejamento.xlsx");
    }

    // --- FUNÇÕES ESPECÍFICAS PARA DIAS ---
    function baixarModeloDia() {
        if (typeof XLSX === 'undefined') return alert('Biblioteca XLSX não carregada.');

        const dia = document.querySelector('.tab-btn.active')?.dataset.dia;
        if (!dia) return alert('Selecione um dia primeiro.');

        // Headers para cada seção
        const headers = {
            'PADRAO': ['PLACA', 'MODELO', 'ROTA', 'STATUS', 'MOTORISTA', 'AUXILIAR', 'TERCEIRO'],
            'TRANSFERENCIA': ['PLACA', 'MODELO', 'ROTA', 'STATUS', 'MOTORISTA', 'AUXILIAR', 'TERCEIRO'],
            'EQUIPAMENTO': ['PLACA', 'MODELO', 'ROTA', 'STATUS', 'MOTORISTA', 'AUXILIAR', 'TERCEIRO'],
            'RESERVAS': ['PLACA', 'MODELO', 'ROTA', 'STATUS', 'MOTORISTA', 'AUXILIAR', 'TERCEIRO'],
            'FALTAS': ['MOTORISTA', 'MOTIVO_MOTORISTA', 'AUXILIAR', 'MOTIVO_AUXILIAR']
        };

        const wb = XLSX.utils.book_new();

        // Cria uma aba para cada seção
        Object.entries(headers).forEach(([section, cols]) => {
            const data = [cols]; // Headers na primeira linha
            const ws = XLSX.utils.aoa_to_sheet(data);
            XLSX.utils.book_append_sheet(wb, ws, section);
        });

        XLSX.writeFile(wb, `Modelo_${dia}.xlsx`);
    }

    async function importarExcelDia(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (evt) => {
            // Mostrar modal de progresso
            const importModal = document.getElementById('importProgressModal');
            const progressBar = document.getElementById('importProgressBar');
            const progressText = document.getElementById('importProgressText');
            const progressDetails = document.getElementById('importProgressDetails');

            importModal.classList.remove('hidden');
            progressBar.style.width = '0%';
            progressText.textContent = 'Processando: 0%';
            progressDetails.textContent = '';

            try {
                // Simular atraso de leitura do arquivo
                await new Promise(resolve => setTimeout(resolve, 300));
                progressBar.style.width = '15%';
                progressText.textContent = 'Processando: 15%';
                progressDetails.textContent = 'Lendo arquivo Excel...';

                const data = new Uint8Array(evt.target.result);
                const workbook = XLSX.read(data, { type: 'array', cellDates: false });

                await new Promise(resolve => setTimeout(resolve, 200));
                progressBar.style.width = '30%';
                progressText.textContent = 'Processando: 30%';
                progressDetails.textContent = 'Localizando abas...';

                const semana = selectSemana.value;
                const dia = document.querySelector('.tab-btn.active')?.dataset.dia;
                if (!semana || !dia) {
                    importModal.classList.add('hidden');
                    return alert('Selecione uma semana e dia.');
                }

                const roteiroSheetName = workbook.SheetNames.find(sheetName => getDiaFromSheetName(sheetName) === dia);
                if (roteiroSheetName) {
                    const parsed = parseRoteiroSheet(workbook, roteiroSheetName, semana);
                    const totalRoteiro = parsed.insertsEscala.length + parsed.insertsFaltas.length;

                    importModal.classList.add('hidden');
                    if (totalRoteiro === 0) {
                        e.target.value = '';
                        return alert(`Nenhum registro valido encontrado na aba ${roteiroSheetName}.`);
                    }

                    if (confirm(`Importar ${totalRoteiro} registros da aba ${roteiroSheetName} para a data ${parsed.dataISO}?`)) {
                        importModal.classList.remove('hidden');
                        progressBar.style.width = '85%';
                        progressText.textContent = 'Processando: 85%';
                        progressDetails.textContent = 'Enviando para banco de dados...';

                        await importarRoteiroDiario(workbook, roteiroSheetName, semana, dia);

                        progressBar.style.width = '100%';
                        progressText.textContent = 'Processando: 100%';
                        progressDetails.textContent = 'Importacao concluida com sucesso!';
                        await new Promise(resolve => setTimeout(resolve, 500));
                        importModal.classList.add('hidden');
                        alert('Importacao concluida!');
                    }
                    e.target.value = '';
                    return;
                }

                const dataISO = CACHE_DATAS[semana][dia].toISOString().split('T')[0];
                const insertsEscala = [];
                const insertsFaltas = [];

                // Mapeamento de nomes de abas do Excel para IDs internos das seções
                const mapaAbas = {
                    'PADRAO': { tipo: 'PADRAO', tabela: 'escala' },
                    'TRANSFERENCIA': { tipo: 'TRANSFERENCIA', tabela: 'escala' },
                    'TRANSFERÊNCIA CD': { tipo: 'TRANSFERENCIA', tabela: 'escala' },
                    'EQUIPAMENTO': { tipo: 'EQUIPAMENTO', tabela: 'escala' },
                    'RESERVAS': { tipo: 'RESERVA', tabela: 'escala' },
                    'FALTAS': { tipo: null, tabela: 'faltas_afastamentos' },
                    'FALTAS / FÉRIAS / AFASTADOS': { tipo: null, tabela: 'faltas_afastamentos' }
                };

                // Itera sobre as abas do arquivo Excel
                workbook.SheetNames.forEach(sheetName => {
                    const nomeNormalizado = sheetName.toUpperCase().trim();
                    // Tenta match exato ou parcial para cada seção
                    let config = null;
                    for (const [key, value] of Object.entries(mapaAbas)) {
                        if (nomeNormalizado === key.toUpperCase() ||
                            nomeNormalizado.includes(key.toUpperCase()) ||
                            key.toUpperCase().includes(nomeNormalizado)) {
                            config = value;
                            break;
                        }
                    }

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

                await new Promise(resolve => setTimeout(resolve, 200));
                progressBar.style.width = '80%';
                progressText.textContent = 'Processando: 80%';
                progressDetails.textContent = 'Confirmando importação...';

                const totalRegistros = insertsEscala.length + insertsFaltas.length;
                if (totalRegistros > 0 && confirm(`Importar ${totalRegistros} registros (${insertsEscala.length} escala + ${insertsFaltas.length} faltas) para o dia ${dia}?`)) {
                    try {
                        progressBar.style.width = '90%';
                        progressText.textContent = 'Processando: 90%';
                        progressDetails.textContent = 'Enviando para banco de dados...';

                        if (insertsEscala.length > 0) {
                            const { error: escalaError } = await supabaseClient.from('escala').insert(insertsEscala);
                            if (escalaError) throw escalaError;
                        }
                        if (insertsFaltas.length > 0) {
                            const { error: faltasError } = await supabaseClient.from('faltas_afastamentos').insert(insertsFaltas);
                            if (faltasError) throw faltasError;
                        }

                        progressBar.style.width = '100%';
                        progressText.textContent = 'Processando: 100%';
                        progressDetails.textContent = 'Importação concluída com sucesso!';

                        await new Promise(resolve => setTimeout(resolve, 1000));
                        importModal.classList.add('hidden');
                        alert('Importação concluída!');
                        carregarDadosDia(dia, semana);
                    } catch (err) {
                        importModal.classList.add('hidden');
                        console.error('Erro na importação:', err);
                        alert('Erro: ' + err.message);
                    }
                } else if (totalRegistros === 0) {
                    importModal.classList.add('hidden');
                    alert('Nenhum registro válido encontrado para importar desta planilha.');
                } else {
                    importModal.classList.add('hidden');
                }
            } catch (err) {
                importModal.classList.add('hidden');
                console.error('Erro ao processar arquivo:', err);
                alert('Erro ao processar o arquivo: ' + err.message);
            }

            e.target.value = '';
        };
        reader.readAsArrayBuffer(file);
    }

    async function copiarDia() {
        const semana = selectSemana.value;
        const diaAtual = document.querySelector('.tab-btn.active')?.dataset.dia;
        if (!semana || !diaAtual) return alert('Selecione uma semana e dia.');

        // Modal para escolher dia de origem
        const modalCopiarDia = document.createElement('div');
        modalCopiarDia.id = 'modalCopiarDia';
        modalCopiarDia.className = 'modal-expedicao';
        modalCopiarDia.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);display:flex;justify-content:center;align-items:center;z-index:2000;';
        modalCopiarDia.innerHTML = `
            <div style="background:white;padding:20px;border-radius:8px;width:350px;box-shadow:0 2px 10px rgba(0,0,0,0.3);font-family:sans-serif;text-align:center;">
                <h3 style="margin-top:0;color:#333;">Copiar Dados do Dia</h3>
                <p style="color:#666;font-size:0.9em;margin-bottom:15px;">Selecione o dia de origem para copiar os dados.</p>
                <div style="margin-bottom:15px;text-align:left;">
                    <label style="display:block;margin-bottom:5px;font-weight:bold;font-size:0.9em;">Dia de Origem:</label>
                    <select id="selectDiaOrigem" style="width:100%;padding:8px;border:1px solid #ccc;border-radius:4px;box-sizing:border-box;">
                        <option value="DOMINGO">DOMINGO</option>
                        <option value="SEGUNDA">SEGUNDA</option>
                        <option value="TERCA">TERÇA</option>
                        <option value="QUARTA">QUARTA</option>
                        <option value="QUINTA">QUINTA</option>
                        <option value="SEXTA">SEXTA</option>
                        <option value="SABADO">SÁBADO</option>
                    </select>
                </div>
                <div style="display:flex;gap:10px;justify-content:center;">
                    <button id="btnConfirmarCopiarDia" style="background:#28a745;color:white;padding:8px 15px;border:none;border-radius:4px;cursor:pointer;font-weight:bold;">Copiar</button>
                    <button id="btnCancelarCopiarDia" style="background:transparent;border:1px solid #ccc;color:#666;padding:8px 15px;border-radius:4px;cursor:pointer;">Cancelar</button>
                </div>
            </div>
        `;
        document.body.appendChild(modalCopiarDia);

        const selectDiaOrigem = document.getElementById('selectDiaOrigem');
        const btnConfirmarCopiarDia = document.getElementById('btnConfirmarCopiarDia');
        const btnCancelarCopiarDia = document.getElementById('btnCancelarCopiarDia');

        selectDiaOrigem.value = diaAtual; // Define o dia atual como padrão

        btnCancelarCopiarDia.addEventListener('click', () => modalCopiarDia.remove());
        modalCopiarDia.addEventListener('click', (e) => { if (e.target === modalCopiarDia) modalCopiarDia.remove(); });

        btnConfirmarCopiarDia.addEventListener('click', async () => {
            const diaOrigem = selectDiaOrigem.value;
            if (!diaOrigem) return;

            if (!confirm(`Copiar dados do ${diaOrigem} para ${diaAtual}?`)) return;

            try {
                const dataOrigem = CACHE_DATAS[semana][diaOrigem].toISOString().split('T')[0];
                const dataDestino = CACHE_DATAS[semana][diaAtual].toISOString().split('T')[0];

                // Busca dados do dia de origem
                const [resEscala, resFaltas] = await Promise.all([
                    supabaseClient.from('escala').select('*').eq('data_escala', dataOrigem),
                    supabaseClient.from('faltas_afastamentos').select('*').eq('data_escala', dataOrigem)
                ]);

                if (resEscala.error || resFaltas.error) {
                    throw resEscala.error || resFaltas.error;
                }

                const insertsEscala = resEscala.data.map(item => ({
                    ...item,
                    data_escala: dataDestino,
                    id: undefined // Remove ID para criar novo registro
                }));

                const insertsFaltas = resFaltas.data.map(item => ({
                    ...item,
                    data_escala: dataDestino,
                    id: undefined
                }));

                // Insere dados no dia destino
                if (insertsEscala.length > 0) {
                    const { error: escalaError } = await supabaseClient.from('escala').insert(insertsEscala);
                    if (escalaError) throw escalaError;
                }
                if (insertsFaltas.length > 0) {
                    const { error: faltasError } = await supabaseClient.from('faltas_afastamentos').insert(insertsFaltas);
                    if (faltasError) throw faltasError;
                }

                alert('Cópia realizada com sucesso!');
                modalCopiarDia.remove();
                carregarDadosDia(diaAtual, semana);

            } catch (err) {
                console.error('Erro ao copiar:', err);
                alert('Erro ao copiar dados: ' + err.message);
            }
        });
    }

    async function excluirSelecionadosDia() {
        const selectedCells = document.querySelectorAll('.selected-cell');
        if (selectedCells.length === 0) {
            return alert('Selecione pelo menos uma célula para excluir.');
        }

        if (!confirm('Tem certeza que deseja excluir as linhas selecionadas?')) return;

        const toDelete = { escala: [], faltas_afastamentos: [] };

        selectedCells.forEach(el => {
            const tr = el.closest('tr');
            if (tr && tr.dataset.id && tr.dataset.tabela) {
                if (!toDelete[tr.dataset.tabela].includes(tr.dataset.id)) {
                    toDelete[tr.dataset.tabela].push(tr.dataset.id);
                }
            }
        });

        try {
            for (const table in toDelete) {
                if (toDelete[table].length > 0) {
                    const { error } = await supabaseClient.from(table).delete().in('id', toDelete[table]);
                    if (error) throw error;
                }
            }
            alert('Exclusão realizada com sucesso.');
            const dia = document.querySelector('.tab-btn.active')?.dataset.dia;
            const semana = selectSemana.value;
            if (dia && semana) carregarDadosDia(dia, semana);
        } catch (err) {
            alert('Erro ao excluir: ' + err.message);
        }
    }

    // --- GERAÇÃO DE PDF NA PAGINA ESCALA ---
    async function gerarPDF(orientation = 'portrait', selectedSections = null) {
        if (!window.jspdf) return alert('Biblioteca PDF não carregada.');

        const semana = selectSemana.value;
        const dia = document.querySelector('.tab-btn.active')?.dataset.dia;

        if (!semana || !dia) {
            return alert('Nenhuma semana ou dia selecionado para gerar o PDF.');
        }

        const dataISO = CACHE_DATAS[semana][dia].toISOString().split('T')[0];

        // Busca dados apenas do dia selecionado
        const { data: dadosEscala, error: escalaError } = await supabaseClient.from('escala').select('*').eq('data_escala', dataISO);
        const { data: dadosFaltas, error: faltasError } = await supabaseClient.from('faltas_afastamentos').select('*').eq('data_escala', dataISO);

        if (escalaError || faltasError) {
            console.error('Erro ao buscar dados do dia:', escalaError || faltasError);
            return alert('Erro ao carregar dados para o PDF.');
        }

        if ((!dadosEscala || dadosEscala.length === 0) && (!dadosFaltas || dadosFaltas.length === 0)) {
            return alert('Nenhum dado encontrado para este dia.');
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: orientation, unit: 'mm', format: 'a4' });

        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const centerX = pageWidth / 2;
        const rightX = pageWidth - 5;

        // Logo
        try {
            const response = await fetch('logo.png');
            if (response.ok) {
                const blob = await response.blob();
                const reader = new FileReader();
                const base64data = await new Promise(r => { reader.onloadend = () => r(reader.result); reader.readAsDataURL(blob); });
                doc.addImage(base64data, 'PNG', 5, 5, 40, 10);
            }
        } catch (e) {}

        const diaNome = dia === 'TERCA' ? 'TERÇA' : dia;
        const formattedDate = CACHE_DATAS[semana][dia].toLocaleDateString('pt-BR', { timeZone: 'UTC' });
        
        doc.setFontSize(18);
        doc.text(`ESCALA - ${semana} - ${diaNome} - ${formattedDate}`, centerX, 20, { align: 'center' });
        doc.setFontSize(9);
        doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, rightX, 10, { align: 'right' });

        let finalY = 25;
        const secoes = [
            { id: 'PADRAO', title: 'PADRÃO' },
            { id: 'TRANSFERENCIA', title: 'TRANSFERÊNCIA CD' },
            { id: 'EQUIPAMENTO', title: 'EQUIPAMENTO' },
            { id: 'RESERVA', title: 'RESERVAS' },
            { id: 'FALTAS', title: 'FALTAS / FÉRIAS / AFASTADOS' }
        ];

        const secoesFiltradas = selectedSections ? secoes.filter(s => selectedSections.includes(s.id)) : secoes;

        for (const sec of secoesFiltradas) {
            let itens = [];
            let columns, body;

            if (sec.id === 'FALTAS') {
                itens = dadosFaltas || [];
                columns = ['MOTORISTA', 'MOTIVO MOTORISTA', 'AUXILIAR', 'MOTIVO AUXILIAR', 'ASSINATURA'];
                body = itens.map(i => [i.motorista_ausente || '', i.motivo_motorista || '', i.auxiliar_ausente || '', i.motivo_auxiliar || '', '']);
            } else {
                itens = (dadosEscala || []).filter(d => d.tipo_escala === sec.id);
                columns = ['PLACA', 'MODELO', 'ROTA', 'STATUS', 'MOTORISTA', 'AUXILIAR', 'TERCEIRO', 'ASSINATURA'];
                body = itens.map(i => [i.placa || '', i.modelo || '', i.rota || '', i.status || '', i.motorista || '', i.auxiliar || '', i.terceiro || '', '']);
            }

            if (itens.length === 0) continue;

            if (finalY > pageHeight - 40) { doc.addPage(); finalY = 15; }

            doc.setFillColor(0, 0, 0);
            doc.rect(5, finalY, pageWidth - 10, 6, 'F');

            doc.setFontSize(10);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(255, 255, 255);
            doc.text(sec.title, centerX, finalY + 4.5, { align: 'center' });

            doc.autoTable({
                head: [columns],
                body: body,
                startY: finalY + 7,
                margin: { left: 5, right: 5 },
                theme: 'grid',
                styles: { fontSize: 8, cellPadding: 1 },
                headStyles: { fillColor: [0, 105, 55], textColor: 255 },
                alternateRowStyles: { fillColor: [220, 220, 220] },
                didDrawPage: (data) => { finalY = data.cursor.y; },
                didParseCell: function(data) {
                    if (data.section === 'body' && sec.id !== 'FALTAS' && data.column.index === 3) {
                        const status = data.cell.raw;
                        const config = STATUS_CONFIG[status] || STATUS_CONFIG[status?.toUpperCase()];
                        if (config) {
                            data.cell.styles.textColor = config.bg;
                            data.cell.styles.fontStyle = 'bold';
                        }
                    }
                }
            });
            finalY = doc.lastAutoTable.finalY + 4;
        }

        const pageCount = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setFontSize(8);
            doc.setTextColor(100);
            doc.text(`Página ${i} de ${pageCount}`, rightX, pageHeight - 5, { align: 'right' });
        }

        doc.save(`Escala_${semana}_${dia}.pdf`);
    }

    // --- FUNÇÕES DO MODAL DE EXPEDIÇÃO ---
    function abrirModalExpedicao() {
        const semana = selectSemana.value;
        const dia = document.querySelector('.tab-btn.active')?.dataset.dia;
        if (!semana || !dia) return;

        const dataObj = CACHE_DATAS[semana][dia];
        const formattedDate = dataObj.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
        const diaNome = dia === 'TERCA' ? 'TERÇA' : dia;

        document.getElementById('modalExpedicaoDiaSemana').innerHTML = `${diaNome} <span id="expedicaoQtdTotal" style="color: red; font-weight: bold;"></span>`;
        document.getElementById('modalExpedicaoSemanaData').textContent = `${semana} - ${formattedDate}`;
        
        // Limpa filtros antigos
        document.querySelectorAll('#expedicao-filters .filter-input').forEach(input => input.value = '');

        popularFiltrosExpedicao(dadosPadraoDoDia);
        renderTabelaExpedicao(dadosPadraoDoDia);
        calcularTotalizadorModelos(dadosPadraoDoDia);

        document.getElementById('modalExpedicao').style.display = 'flex';
    }

    function getDataEscalaAberta() {
        const semana = selectSemana.value;
        const dia = document.querySelector('.tab-btn.active')?.dataset.dia;
        if (!semana || !dia || !CACHE_DATAS[semana] || !CACHE_DATAS[semana][dia]) return null;

        const dataObj = CACHE_DATAS[semana][dia];
        return {
            semana,
            dia,
            dataISO: dataObj.toISOString().split('T')[0],
            dataBR: dataObj.toLocaleDateString('pt-BR', { timeZone: 'UTC' })
        };
    }

    function ensureModalTerceiroRota() {
        let modal = document.getElementById('modalTerceiroRota');
        if (modal) return modal;

        modal = document.createElement('div');
        modal.id = 'modalTerceiroRota';
        modal.className = 'terceiro-modal hidden';
        modal.innerHTML = `
            <div class="terceiro-modal-content">
                <div class="terceiro-modal-header">
                    <h3><i class="fa-solid fa-user-plus"></i> Terceiro por Rota</h3>
                    <button type="button" id="btnFecharTerceiroRota" class="terceiro-modal-close" title="Fechar">&times;</button>
                </div>
                <div class="terceiro-modal-subtitle" id="terceiroRotaContexto"></div>
                <div class="terceiro-form-grid">
                    <div class="form-group">
                        <label for="terceiroRotaFuncionario">Funcionario</label>
                        <input type="text" id="terceiroRotaFuncionario" list="listaTerceiros" class="glass-input" placeholder="Selecione o funcionario">
                    </div>
                    <div class="form-group">
                        <label for="terceiroRotaNumero">Rota</label>
                        <input type="text" id="terceiroRotaNumero" list="listaRotas" class="glass-input" placeholder="Informe a rota">
                    </div>
                    <button type="button" id="btnAplicarTerceiroRota" class="btn-glass btn-blue">
                        <i class="fa-solid fa-check"></i> Aplicar
                    </button>
                </div>
                <div class="terceiro-table-wrap">
                    <table class="data-grid terceiro-table">
                        <thead>
                            <tr>
                                <th>ROTA</th>
                                <th>PLACA</th>
                                <th>MODELO</th>
                                <th>MOTORISTA</th>
                                <th>AUXILIAR</th>
                                <th>TERCEIRO</th>
                                <th>ACOES</th>
                            </tr>
                        </thead>
                        <tbody id="tbodyTerceiroRota"></tbody>
                    </table>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        modal.addEventListener('click', (e) => {
            if (e.target === modal || e.target.closest('#btnFecharTerceiroRota')) {
                modal.classList.add('hidden');
            }
        });

        modal.querySelector('#btnAplicarTerceiroRota').addEventListener('click', aplicarTerceiroPorRota);
        modal.querySelector('#tbodyTerceiroRota').addEventListener('click', limparTerceiroDaLinha);

        return modal;
    }

    async function abrirModalTerceiroRota() {
        const contexto = getDataEscalaAberta();
        if (!contexto) return alert('Abra uma semana e um dia antes de gerenciar terceiros.');

        const modal = ensureModalTerceiroRota();
        modal.querySelector('#terceiroRotaContexto').textContent = `${contexto.dia} - ${contexto.dataBR}`;
        modal.querySelector('#terceiroRotaFuncionario').value = '';
        modal.querySelector('#terceiroRotaNumero').value = '';
        modal.classList.remove('hidden');
        await carregarTerceiroRotaModal();
    }

    async function carregarTerceiroRotaModal() {
        const contexto = getDataEscalaAberta();
        const tbody = document.getElementById('tbodyTerceiroRota');
        if (!contexto || !tbody) return;

        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">Carregando...</td></tr>';

        const { data, error } = await supabaseClient
            .from('escala')
            .select('id, placa, modelo, rota, motorista, auxiliar, terceiro')
            .eq('data_escala', contexto.dataISO)
            .not('terceiro', 'is', null)
            .neq('terceiro', '')
            .order('rota')
            .order('id');

        if (error) {
            console.error('Erro ao carregar terceiros por rota:', error);
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:#dc3545;">Erro ao carregar dados.</td></tr>';
            return;
        }

        if (!data || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">Nenhum terceiro preenchido para esta data.</td></tr>';
            return;
        }

        tbody.innerHTML = data.map(item => `
            <tr>
                <td>${escapeAttribute(item.rota || '')}</td>
                <td>${escapeAttribute(item.placa || '')}</td>
                <td>${escapeAttribute(item.modelo || '')}</td>
                <td>${escapeAttribute(item.motorista || '')}</td>
                <td>${escapeAttribute(item.auxiliar || '')}</td>
                <td>${escapeAttribute(item.terceiro || '')}</td>
                <td class="actions-cell">
                    <button type="button" class="btn-icon delete btn-limpar-terceiro" data-id="${item.id}" title="Limpar terceiro">
                        <i class="fas fa-eraser"></i>
                    </button>
                </td>
            </tr>
        `).join('');
    }

    async function aplicarTerceiroPorRota() {
        const contexto = getDataEscalaAberta();
        if (!contexto) return;

        const funcionario = cleanImportValue(document.getElementById('terceiroRotaFuncionario')?.value);
        const rota = cleanImportValue(document.getElementById('terceiroRotaNumero')?.value, { keepZero: true });

        if (!funcionario) return alert('Selecione o funcionario.');
        if (!rota) return alert('Informe a rota.');

        const { data, error } = await supabaseClient
            .from('escala')
            .update({ terceiro: funcionario })
            .eq('data_escala', contexto.dataISO)
            .eq('rota', rota)
            .select('id');

        if (error) {
            console.error('Erro ao aplicar terceiro por rota:', error);
            return alert('Erro ao aplicar terceiro: ' + error.message);
        }

        if (!data || data.length === 0) {
            return alert(`Nenhuma linha encontrada para a rota ${rota} nesta data.`);
        }

        alert(`Terceiro aplicado em ${data.length} linha(s) da rota ${rota}.`);
        await carregarTerceiroRotaModal();
        carregarDadosDia(contexto.dia, contexto.semana);
    }

    async function limparTerceiroDaLinha(e) {
        const btn = e.target.closest('.btn-limpar-terceiro');
        if (!btn) return;

        const contexto = getDataEscalaAberta();
        if (!contexto) return;

        if (!confirm('Limpar o terceiro desta linha?')) return;

        const { error } = await supabaseClient
            .from('escala')
            .update({ terceiro: null })
            .eq('id', btn.dataset.id);

        if (error) {
            console.error('Erro ao limpar terceiro:', error);
            return alert('Erro ao limpar terceiro: ' + error.message);
        }

        await carregarTerceiroRotaModal();
        carregarDadosDia(contexto.dia, contexto.semana);
    }

    function popularFiltrosExpedicao(dados) {
        const columns = ['placa', 'modelo', 'rota', 'status', 'motorista'];
        columns.forEach(col => {
            const select = document.querySelector(`#expedicao-filters .filter-input[data-column="${col}"]`);
            if (!select) return;

            select.innerHTML = ''; // Limpa todas as opções anteriores

            if (!dados || dados.length === 0) return;

            // Extrai valores únicos, não nulos e ordena
            const values = [...new Set(dados.map(item => item[col]).filter(v => v != null && v !== ''))].sort();
            
            values.forEach(val => {
                const option = document.createElement('option');
                option.value = val;
                option.textContent = val;
                select.appendChild(option);
            });
        });
    }

    function renderTabelaExpedicao(dados) {
        const tbody = document.getElementById('modalExpedicaoTbody');
        tbody.innerHTML = '';

        // Atualiza o totalizador no cabeçalho
        const qtdEl = document.getElementById('expedicaoQtdTotal');
        if (qtdEl) qtdEl.textContent = `( ${dados ? dados.length : 0} )`;

        if (!dados || dados.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center;">Nenhum dado padrão para exibir.</td></tr>';
            return;
        }

        dados.forEach(item => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${item.placa || ''}</td>
                <td>${item.modelo || ''}</td>
                <td>${item.rota || ''}</td>
                <td>${item.status || ''}</td>
                <td>${item.motorista || ''}</td>
            `;
            tbody.appendChild(tr);
        });
    }

    function calcularTotalizadorModelos(dados) {
        const totalizadorEl = document.getElementById('modalExpedicaoTotalizador');
        if (!dados || dados.length === 0) {
            totalizadorEl.innerHTML = 'Nenhum modelo para totalizar.';
            return;
        }

        const modeloCounts = dados.reduce((acc, item) => {
            if (item.modelo) {
                const modelo = item.modelo.trim().toUpperCase();
                acc[modelo] = (acc[modelo] || 0) + 1;
            }
            return acc;
        }, {});

        if (Object.keys(modeloCounts).length === 0) {
            totalizadorEl.innerHTML = 'Nenhum modelo informado nos dados.';
            return;
        }

        let totalizadorHTML = '<table style="margin: 0 auto; border-collapse: collapse; width: auto; min-width: 300px; font-size: 0.9em;">';
        totalizadorHTML += '<thead><tr style="background-color: #f2f2f2;"><th style="border: 1px solid #ccc; padding: 6px; position: sticky; top: 0; background-color: #f2f2f2; z-index: 1;">Modelo</th><th style="border: 1px solid #ccc; padding: 6px; position: sticky; top: 0; background-color: #f2f2f2; z-index: 1;">Quantidade</th></tr></thead>';
        totalizadorHTML += '<tbody>';

        totalizadorHTML += Object.entries(modeloCounts)
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([modelo, count]) => `<tr><td style="border: 1px solid #ccc; padding: 5px 8px;">${modelo}</td><td style="border: 1px solid #ccc; padding: 5px 8px; text-align: center;"><strong>${count}</strong></td></tr>`)
            .join('');
        totalizadorHTML += '</tbody></table>';

        totalizadorEl.innerHTML = totalizadorHTML;
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
                // Busca por motorista, auxiliar OU terceiro
                query = query.or(`motorista.ilike.%${valor}%,auxiliar.ilike.%${valor}%,terceiro.ilike.%${valor}%`);
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

    function abrirModalBoletaComDados(nome, placa = '', rota = '', modelo = '') {
        const modal = document.getElementById('modalBoleta');
        const tipoSelect = document.getElementById('filtroBoletaTipo');
        const valorInput = document.getElementById('filtroBoletaValor');
        const dataInput = document.getElementById('boletaData');
        const bPlaca = document.getElementById('boletaPlaca');
        const bModelo = document.getElementById('boletaModelo');
        const bRota = document.getElementById('boletaRota');

        if (!modal || !tipoSelect || !valorInput || !dataInput) return;

        // Abre o modal
        modal.classList.remove('hidden');
        modal.style.display = 'flex';

        // Preenche os campos
        tipoSelect.value = 'MOTORISTA';
        valorInput.value = nome;
        if (bPlaca) bPlaca.value = placa;
        if (bModelo) bModelo.value = modelo;
        if (bRota) bRota.value = rota;

        // Define a data para o dia que está sendo visualizado na escala
        const diaAtivo = document.querySelector('.tab-btn.active')?.dataset.dia;
        const semanaAtiva = selectSemana.value;
        if (diaAtivo && semanaAtiva && CACHE_DATAS[semanaAtiva] && CACHE_DATAS[semanaAtiva][diaAtivo]) {
            dataInput.value = CACHE_DATAS[semanaAtiva][diaAtivo].toISOString().split('T')[0];
        }

        // Se não tiver placa ou rota (caso clique em um campo vazio ou erro de extração), tenta buscar no banco
        if (!placa || !rota) buscarDadosBoleta();
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

    const PLANNING_DAY_COLORS = {
        'domingo': '#ffcccc',
        'segunda': '#cce5ff',
        'terca': '#fff3cd',
        'quarta': '#d4edda',
        'quinta': '#ffdfcc',
        'sexta': '#f2f2f2',
        'sabado': '#e0d6cc'
    };

    // --- CACHE DE VEÍCULOS E FUNCIONÁRIOS ---
    let listaVeiculos = [];

    // Configuração de Status baseada em status.html
    const STATUS_CONFIG = {
        'CNT SP': { bg: '#FF9800', color: 'white', desc: 'Centro de SP: caminhao precisa sair ate 12h.' },
        'ZMRC': { bg: '#F44336', color: 'white', desc: 'Sao Paulo Zona de Maxima Restricao de Circulacao: precisa ser VUC.' },
        'ZMRC CPN': { bg: '#B71C1C', color: 'white', desc: 'Campinas Zona de Maxima Restricao de Circulacao: precisa ser VUC.' },
        'V': { bg: '#2196F3', color: 'white', desc: 'Rota vai para viagem de pernoite.' },
        'P': { bg: '#9C27B0', color: 'white', desc: 'Rota vai pernoitar.' },
        'R': { bg: '#4CAF50', color: 'white', desc: 'Rota vai retornar.' },
        'V - RESTR': { bg: '#3F51B5', color: 'white', desc: 'Vai para pernoite e tem restricao a circulacao de caminhoes; precisa cadastrar a placa.' },
        'RESTR': { bg: '#795548', color: 'white', desc: 'Rota com restricao a circulacao de caminhoes; precisa cadastrar a placa.' },
        'BGMN': { bg: '#FFEB3B', color: 'black', desc: 'Rota do Bergamini: tem que ir palete de madeira.' },
        'TRI +': { bg: '#E91E63', color: 'white', desc: 'Rota do Trimais: tem que ir palete de madeira.' },
        '152/257': { bg: '#00BCD4', color: 'black', desc: 'Rotas dos proximos dias na programacao do caminhao e da dupla.' },
        '194 TER': { bg: '#009688', color: 'white', desc: 'Rotas dos proximos dias na programacao do caminhao e da dupla.' },
        // Status Legados
        'OK': { bg: '#28a745', color: 'white', desc: 'Status OK.' },
        'MANUTENÇÃO': { bg: '#dc3545', color: 'white' },
        'FALTA': { bg: '#dc3545', color: 'white', desc: 'Falta.' },
        'FERIAS': { bg: '#17a2b8', color: 'white', desc: 'Ferias.' },
        'FOLGA': { bg: '#6c757d', color: 'white', desc: 'Folga.' },
        'ATESTADO': { bg: '#ffc107', color: 'black', desc: 'Atestado.' }
    };
    STATUS_CONFIG.MANUTENCAO = STATUS_CONFIG.MANUTENCAO || { bg: '#dc3545', color: 'white', desc: 'Veiculo em manutencao.' };

    async function carregarListasAuxiliares() {
        // Veículos
        const { data: veiculos } = await supabaseClient.from('veiculos').select('placa, modelo').eq('situacao', 'ativo');
        listaVeiculos = (veiculos || []).map(v => ({
            ...v,
            placa_normalizada: normalizeVehiclePlate(v.placa)
        }));
        const dlPlacas = document.getElementById('listaVeiculos');
        const dlModelos = document.getElementById('listaModelos');
        if (dlPlacas) dlPlacas.innerHTML = listaVeiculos.map(v => `<option value="${v.placa_normalizada}">`).join('');
        if (dlModelos) dlModelos.innerHTML = [...new Set(listaVeiculos.map(v => v.modelo))].map(m => `<option value="${m}">`).join('');

        // Rotas
        const { data: rotas } = await supabaseClient.from('rotas').select('numero');
        const dlRotas = document.getElementById('listaRotas');
        if (dlRotas && rotas) dlRotas.innerHTML = [...new Set(rotas.map(r => r.numero))].map(r => `<option value="${r}">`).join('');

        // Funcionários
        const { data: funcs } = await supabaseClient.from('funcionario').select('nome_completo, funcao, status');
        const dlMot = document.getElementById('listaMotoristas');
        const dlAux = document.getElementById('listaAuxiliares');
        const dlTer = document.getElementById('listaTerceiros');
        if (funcs) {
            const funcionariosAtivos = funcs.filter(f => normalizeString(f.status) === 'ATIVO');
            const optionHTML = (items) => [...new Set(items.map(f => cleanImportValue(f.nome_completo)).filter(Boolean))]
                .sort((a, b) => a.localeCompare(b, 'pt-BR'))
                .map(nome => `<option value="${nome.replace(/"/g, '&quot;')}">`)
                .join('');

            const motoristas = funcionariosAtivos.filter(f => normalizeString(f.funcao).includes('MOTORISTA'));
            const auxiliares = funcionariosAtivos.filter(f => {
                const funcao = normalizeString(f.funcao);
                return funcao.includes('AUXILIAR') || funcao.includes('AJUDANTE');
            });

            if (dlMot) dlMot.innerHTML = optionHTML(motoristas);
            if (dlAux) dlAux.innerHTML = optionHTML(auxiliares);
            if (dlTer) dlTer.innerHTML = optionHTML([...motoristas, ...auxiliares]);
        }
        
        // Status
        const dlStatus = document.getElementById('listaStatus');
        if(dlStatus) dlStatus.innerHTML = Object.keys(STATUS_CONFIG).map(s => `<option value="${s}" label="${escapeAttribute(STATUS_CONFIG[s].desc || '')}">`).join('');
    }

    function getStatusStyle(status) {
        const config = getStatusConfig(status);
        if (config) {
            return `background-color: ${config.bg}; color: ${config.color}; font-weight: bold; text-align: center;`;
        }
        return '';
    }

    function getStatusConfig(status) {
        const normalized = normalizeString(status);
        return STATUS_CONFIG[status?.toUpperCase()] || STATUS_CONFIG[status] || STATUS_CONFIG[normalized] || null;
    }

    function getStatusTooltip(status) {
        const value = cleanImportValue(status, { keepZero: true });
        const config = getStatusConfig(value);
        if (!value) return 'Informe o status da rota.';
        return config?.desc ? `${value}: ${config.desc}` : `${value}: status sem descricao cadastrada.`;
    }

    function escapeAttribute(value) {
        return String(value || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function getStatusTitleAttr(status) {
        return escapeAttribute(getStatusTooltip(status));
    }

    function updateInputColor(input) {
        input.style.cssText = getStatusStyle(input.value);
        input.title = getStatusTooltip(input.value);
    }

    function updatePlanningInputColor(input) {
        const key = input.dataset.key;
        if (!key) return;
        
        const day = key.split('_')[0];
        const val = input.value.trim();
        
        if (val && PLANNING_DAY_COLORS[day]) {
            input.style.setProperty('background-color', PLANNING_DAY_COLORS[day], 'important');
            input.style.color = '#000';
            input.style.fontWeight = 'bold';
        } else {
            input.style.backgroundColor = '';
            input.style.color = '';
            input.style.fontWeight = '';
        }
    }

    // --- LISTENERS GERAIS ---
    const btnAdicionarLinhaPlanejamento = document.getElementById('btnAdicionarLinhaPlanejamento');
    if (btnAdicionarLinhaPlanejamento) {
        btnAdicionarLinhaPlanejamento.addEventListener('click', adicionarLinhaPlanejamento);
    }

    if (btnAbrirEscala) {
        btnAbrirEscala.addEventListener('click', () => {
            if (!selectSemana.value) return alert('Selecione uma semana.');
            
            // Atualiza datas nas abas
            const dadosSemana = CACHE_DATAS[selectSemana.value];
            tabButtons.forEach(btn => {
                const dia = btn.dataset.dia; // Pode ser undefined para a aba 'PLANEJAMENTO'
                // Apenas processa botões que representam um dia da semana
                if (dia) {
                    const date = dadosSemana ? dadosSemana[dia] : new Date();
                    const diaNome = btn.textContent.split(' ')[0].trim();
                    btn.innerHTML = `${diaNome} <span class="tab-date">${date.toLocaleDateString('pt-BR', {day:'2-digit', month:'2-digit', timeZone:'UTC'})}</span>`;
                }
            });

            painelEscala.classList.remove('hidden');
            document.querySelector('.tab-btn[data-dia="DOMINGO"]')?.click();
            atualizarBotaoTerceiroSuspenso();
        });
    }

    if (selectSemana) {
        selectSemana.addEventListener('change', () => {
            if (!painelEscala || painelEscala.classList.contains('hidden')) {
                atualizarBotaoTerceiroSuspenso();
                return;
            }

            const activeDia = document.querySelector('.tab-btn.active')?.dataset.dia;
            const dadosSemana = CACHE_DATAS[selectSemana.value];
            tabButtons.forEach(btn => {
                const dia = btn.dataset.dia;
                if (!dia) return;
                const date = dadosSemana ? dadosSemana[dia] : new Date();
                const diaNome = btn.textContent.split(' ')[0].trim();
                btn.innerHTML = `${diaNome} <span class="tab-date">${date.toLocaleDateString('pt-BR', {day:'2-digit', month:'2-digit', timeZone:'UTC'})}</span>`;
            });

            if (activeDia) {
                atualizarTituloDia(activeDia, selectSemana.value);
                carregarDadosDia(activeDia, selectSemana.value);
            }
            atualizarBotaoTerceiroSuspenso();
        });
    }

    tabButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            tabButtons.forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');
            
            const dia = e.currentTarget.dataset.dia;
            const tab = e.currentTarget.dataset.tab;
            const painelDias = document.getElementById('conteudoDias');
            const painelPlan = document.getElementById('conteudoPlanejamento');

            if (tab === 'planejamento') {
                if(painelDias) painelDias.classList.add('hidden');
                if(painelPlan) painelPlan.classList.remove('hidden');
                carregarPlanejamento(selectSemana.value);
                atualizarBotaoTerceiroSuspenso();
            } else {
                if(painelPlan) painelPlan.classList.add('hidden');
                if(painelDias) painelDias.classList.remove('hidden');
                if(dia) {
                    // Atualizar título da aba dinamicamente
                    atualizarTituloDia(dia, selectSemana.value);
                    carregarDadosDia(dia, selectSemana.value);
                    atualizarBotaoTerceiroSuspenso();
                }
            }
        });
    });

    if (btnSalvar) {
        // Botão Salvar agora é apenas visual ou para ações em lote se necessário, pois temos auto-save
        btnSalvar.style.display = 'none'; // Oculta pois o salvamento é automático
        
        // Injeta botão Limpar Semana
        const btnLimpar = document.createElement('button');
        btnLimpar.className = 'btn-custom';
        btnLimpar.classList.add('btn-pdf'); // Adiciona a classe para a cor vermelha padrão
        btnLimpar.innerHTML = '<i class="fas fa-trash"></i> Limpar Escala';
        btnLimpar.onclick = async () => {
            const semana = selectSemana.value;
            const dia = document.querySelector('.tab-btn.active')?.dataset.dia;
            if (!semana || !dia) return;

            const dataObj = CACHE_DATAS[semana][dia];
            const dataISO = dataObj.toISOString().split('T')[0];
            const formattedDate = dataObj.toLocaleDateString('pt-BR', { timeZone: 'UTC' });

            if (confirm(`ATENÇÃO: Apagar TODOS os dados do dia ${formattedDate}?`)) {
                await supabaseClient.from('escala').delete().eq('data_escala', dataISO);
                await supabaseClient.from('faltas_afastamentos').delete().eq('data_escala', dataISO);
                alert(`Dados do dia ${formattedDate} foram limpos.`);
                if(dia) carregarDadosDia(dia, semana);
            }
        };
        if(btnSalvar.parentNode) btnSalvar.parentNode.insertBefore(btnLimpar, btnSalvar);
    }

    // --- CORREÇÃO: Delegação de eventos para botões dinâmicos no Título do Dia ---
    if (tituloDia) {
        tituloDia.addEventListener('click', (e) => {
            const target = e.target.closest('button');
            if (!target) return;

            if (target.id === 'btnModeloDia') baixarModeloDia();
            if (target.id === 'btnImportarDia') tituloDia.querySelector('#fileImportarDia')?.click();
            if (target.id === 'btnCopiarDia') copiarDia();
            if (target.id === 'btnExcluirSelecionadosDia') excluirSelecionadosDia();
        });

        // Listener para o input file dinâmico
        tituloDia.addEventListener('change', (e) => {
            if (e.target.id === 'fileImportarDia') importarExcelDia(e);
        });
    }

    if (btnImportar && fileImportar) {
        btnImportar.addEventListener('click', () => {
            // Se estiver na aba planejamento, usa a nova lógica global
            fileImportar.click();
        });
        fileImportar.addEventListener('change', importarExcelPlanejamentoGlobal);
    }
    if (btnImportarSemana && fileImportarSemana) {
        btnImportarSemana.addEventListener('click', () => fileImportarSemana.click());
        fileImportarSemana.addEventListener('change', importarRoteiroSemana);
    }
    if (fileImportarDia) fileImportarDia.addEventListener('change', importarExcel);
    if (btnPDF) {
        btnPDF.addEventListener('click', () => {
            document.getElementById('pdfOrientationModal').style.display = 'flex';
        });
        document.getElementById('btnPdfLandscape').addEventListener('click', () => {
            const selected = Array.from(document.querySelectorAll('.pdf-section-chk:checked')).map(cb => cb.value);
            if(selected.length === 0) return alert('Selecione pelo menos uma seção.');
            document.getElementById('pdfOrientationModal').style.display = 'none';
            gerarPDF('landscape', selected);
        });
        document.getElementById('btnPdfPortrait').addEventListener('click', () => {
            const selected = Array.from(document.querySelectorAll('.pdf-section-chk:checked')).map(cb => cb.value);
            if(selected.length === 0) return alert('Selecione pelo menos uma seção.');
            document.getElementById('pdfOrientationModal').style.display = 'none';
            gerarPDF('portrait', selected);
        });
    }

    const btnImportarPlanejamento = document.getElementById('btnImportarPlanejamento');
    const fileImportarPlanejamento = document.getElementById('fileImportarPlanejamento');
    if (btnImportarPlanejamento && fileImportarPlanejamento) {
        btnImportarPlanejamento.addEventListener('click', () => fileImportarPlanejamento.click());
        fileImportarPlanejamento.addEventListener('change', importarExcelPlanejamento);
        btnImportarPlanejamento.addEventListener('click', () => {
            // Abre o seletor de arquivos
            fileImportarPlanejamento.click();
        });
        // Altera para usar a lógica global que é mais flexível com múltiplas abas ou nomes variados
        fileImportarPlanejamento.addEventListener('change', importarExcelPlanejamentoGlobal);
    }

    const btnModeloPlanejamento = document.getElementById('btnModeloPlanejamento');
    if (btnModeloPlanejamento) {
        btnModeloPlanejamento.addEventListener('click', baixarModeloPlanejamento);
    }

    const selectAllPlan = document.getElementById('selectAllPlanejamento');
    if (selectAllPlan) {
        selectAllPlan.addEventListener('change', (e) => {
            const isChecked = e.target.checked;
            document.querySelectorAll('#tbodyPlanejamento .row-selector-plan').forEach(chk => {
                chk.checked = isChecked;
            });
        });
    }

    const btnExcluirSelecionadosPlan = document.getElementById('btnExcluirSelecionadosPlan');
    if (btnExcluirSelecionadosPlan) {
        btnExcluirSelecionadosPlan.addEventListener('click', async () => {
            const checkboxes = document.querySelectorAll('#tbodyPlanejamento .row-selector-plan:checked');
            if (checkboxes.length === 0) return alert('Selecione pelo menos uma linha para excluir.');

            if (!confirm(`Tem certeza que deseja excluir as ${checkboxes.length} linhas selecionadas do planejamento?`)) return;

            const ids = Array.from(checkboxes).map(cb => cb.dataset.id);

            try {
                const { error } = await supabaseClient
                    .from('planejamento_semanal')
                    .delete()
                    .in('id', ids);

                if (error) throw error;
                alert('Itens excluídos com sucesso!');
                carregarPlanejamento(selectSemana.value);
                if (selectAllPlan) selectAllPlan.checked = false;
            } catch (err) {
                console.error('Erro ao excluir em massa:', err);
                alert('Erro ao excluir registros.');
            }
        });
    }

    if (btnBaixarModelo) btnBaixarModelo.addEventListener('click', () => alert('Função de baixar modelo mantida do original (requer SheetJS).'));

    // Esconde o menu de contexto ao clicar em qualquer outro lugar
    document.addEventListener('click', (e) => {
        if (!contextMenu.contains(e.target)) {
            contextMenu.style.display = 'none';
        }
    });

    // --- MODAL BOLETA ---
    const modalBoleta = document.getElementById('modalBoleta');
    const btnCloseModalBoleta = document.getElementById('btnCloseModalBoleta');
    const btnGerarBoleta = document.getElementById('btnGerarBoleta');
    const filtroBoletaTipo = document.getElementById('filtroBoletaTipo');
    const listaBoletaOpcoes = document.getElementById('listaBoletaOpcoes');

    function atualizarOpcoesBoleta() {
        if (!listaBoletaOpcoes || !filtroBoletaTipo) return;
        const tipo = filtroBoletaTipo.value;
        listaBoletaOpcoes.innerHTML = '';
        
        if (tipo === 'ROTA') {
             const options = document.getElementById('listaRotas')?.innerHTML || '';
             listaBoletaOpcoes.innerHTML = options;
        } else {
             const motOptions = document.getElementById('listaMotoristas')?.innerHTML || '';
             const auxOptions = document.getElementById('listaAuxiliares')?.innerHTML || '';
             listaBoletaOpcoes.innerHTML = motOptions + auxOptions;
        }
    }

    if (btnGerarBoleta) {
        btnGerarBoleta.addEventListener('click', () => {
            if (modalBoleta) {
                modalBoleta.classList.remove('hidden');
                modalBoleta.style.display = 'flex';
                atualizarOpcoesBoleta();
                
                // Limpa campos
                const fValor = document.getElementById('filtroBoletaValor');
                if(fValor) fValor.value = '';
                ['boletaPlaca', 'boletaModelo', 'boletaRota'].forEach(id => {
                    const el = document.getElementById(id);
                    if(el) el.value = '';
                });

                // Define data padrão (Segunda-feira da semana selecionada)
                const semana = selectSemana.value;
                const bData = document.getElementById('boletaData');
                if (CACHE_DATAS[semana] && CACHE_DATAS[semana]['SEGUNDA'] && bData) {
                    bData.value = CACHE_DATAS[semana]['SEGUNDA'].toISOString().split('T')[0];
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
            const fValor = document.getElementById('filtroBoletaValor');
            if(fValor) fValor.value = '';
            atualizarOpcoesBoleta();
             ['boletaPlaca', 'boletaModelo', 'boletaRota'].forEach(id => {
                const el = document.getElementById(id);
                if(el) el.value = '';
            });
        });
    }

    const btnGerarBoletaPDF = document.getElementById('btnGerarBoletaPDF');
    if (btnGerarBoletaPDF) {
        btnGerarBoletaPDF.addEventListener('click', () => {
            const tipo = document.getElementById('filtroBoletaTipo').value;
            const valor = document.getElementById('filtroBoletaValor').value.trim();
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
        
        if (Object.keys(CACHE_DATAS).length === 0) {
            preencherCacheDatas();
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
        
        try {
            const response = await fetch('logo.png');
            if (response.ok) {
                const blob = await response.blob();
                const reader = new FileReader();
                const base64data = await new Promise((resolve) => {
                    reader.onloadend = () => resolve(reader.result);
                    reader.readAsDataURL(blob);
                });
                doc.addImage(base64data, 'PNG', 50, 5, 40, 10);
            }
        } catch (e) { console.warn('Logo não carregado', e); }

        const infoPlaca = document.getElementById('boletaPlaca').value || '_____';
        const infoModelo = document.getElementById('boletaModelo').value || '_____';
        const infoRota = document.getElementById('boletaRota').value || '_____';

        // Configurações de Layout (Metade da Página)
        const margin = 10;
        const halfPageWidth = 148.5; // Metade de 297mm
        const contentWidth = halfPageWidth - (margin * 2);
        const centerX = halfPageWidth / 2; // Centro da primeira metade da página

        const azul = [0, 0, 255];
        const preto = [0, 0, 0];
        const vermelho = [255, 0, 0];
        
        doc.setFontSize(10);
        doc.setFont(undefined, 'bold');
        
        // --- LINHA 1: Placa e Rota ---
        const l1_label1 = "Placa: ";
        const l1_value1 = `${infoPlaca} - ${infoModelo}`;
        const l1_sep = "   |   ";
        const l1_label2 = "Rota: ";
        const l1_value2 = `${infoRota}`;

        const totalWidth1 = doc.getTextWidth(l1_label1) + doc.getTextWidth(l1_value1) + doc.getTextWidth(l1_sep) + doc.getTextWidth(l1_label2) + doc.getTextWidth(l1_value2);
        let currentX = centerX - (totalWidth1 / 2);

        doc.setTextColor(...preto);
        doc.text(l1_label1, currentX, 20);
        currentX += doc.getTextWidth(l1_label1);

        doc.setTextColor(...azul);
        doc.text(l1_value1, currentX, 20);
        currentX += doc.getTextWidth(l1_value1);

        doc.setTextColor(...preto);
        doc.text(l1_sep, currentX, 20);
        currentX += doc.getTextWidth(l1_sep);

        doc.setTextColor(...preto);
        doc.text(l1_label2, currentX, 20);
        currentX += doc.getTextWidth(l1_label2);

        doc.setTextColor(...azul);
        doc.text(l1_value2, currentX, 20);
        
        // --- LINHA 2: Dinâmico (Rota ou Colaborador) ---
        const l2_label = `${tipo === 'ROTA' ? 'Rota' : 'Colaborador'}: `;
        const l2_value = `${valor}`;
        const totalWidth2 = doc.getTextWidth(l2_label) + doc.getTextWidth(l2_value);
        currentX = centerX - (totalWidth2 / 2);
        doc.setTextColor(...preto);
        doc.text(l2_label, currentX, 25);
        doc.setTextColor(...vermelho);
        doc.text(l2_value, currentX + doc.getTextWidth(l2_label), 25);
        
        // Reset para o padrão
        doc.setTextColor(...preto);
        doc.setFont(undefined, 'normal');

        const datasDia = {};
        if (CACHE_DATAS[semana]) {
            const dias = ['DOMINGO', 'SEGUNDA', 'TERCA', 'QUARTA', 'QUINTA', 'SEXTA', 'SABADO'];
            dias.forEach(dia => {
                if (CACHE_DATAS[semana][dia]) {
                    datasDia[dia] = CACHE_DATAS[semana][dia].toLocaleDateString('pt-BR', { timeZone: 'UTC' });
                } else {
                    datasDia[dia] = '';
                }
            });
        }

        let currentY = 29;
        
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
                    styles: { halign: 'center', fillColor: [0, 105, 55], textColor: 255, fontStyle: 'bold', fontSize: 8 } 
                }]],
                body: [
                    [
                        { content: 'INICIO', colSpan: 2, styles: { halign: 'center', fontStyle: 'bold', fillColor: [240, 240, 240] } },
                        { content: 'TÉRMINO', colSpan: 2, styles: { halign: 'center', fontStyle: 'bold', fillColor: [240, 240, 240] } }
                    ],
                    [
                        { content: 'HORA\n______:______', styles: { halign: 'center', valign: 'middle', minCellHeight: 8 } },
                        { content: 'ASS:________________', styles: { halign: 'center', valign: 'middle', minCellHeight: 8 } },
                        { content: 'HORA\n______:______', styles: { halign: 'center', valign: 'middle', minCellHeight: 8 } },
                        { content: 'ASS:________________', styles: { halign: 'center', valign: 'middle', minCellHeight: 8 } }
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

        const dias = ['DOMINGO', 'SEGUNDA', 'TERCA', 'QUARTA', 'QUINTA', 'SEXTA', 'SABADO'];
        const pageHeight = 210;

        for (const dia of dias) {
             // Verifica se a próxima tabela caberá na página (estimativa de altura)
             // Altura estimada da tabela ~25mm. Limite 200mm (210mm - 10mm margem)
             if (currentY + 25 > 200) {
                 doc.addPage();
                 currentY = 10;
             }
             currentY = drawDayTable(dia, margin, currentY, contentWidth) + 3;
        }

        // Rodapé com campos para Nome e Assinatura
        if (currentY + 15 > 200) {
            doc.addPage();
            currentY = 20;
        } else {
            currentY += 7;
        }

        doc.setFontSize(9);
        doc.setFont(undefined, 'normal');
        
        // Campo Nome
        doc.line(margin, currentY, margin + 60, currentY); 
        doc.text('Nome Completo', margin + 20, currentY + 5);
        
        // Campo Assinatura
        doc.line(margin + 65, currentY, margin + contentWidth, currentY);
        doc.text('Assinatura', margin + 90, currentY + 5);

        doc.save(`Boleta_${valor.replace(/[^a-z0-9]/gi, '_')}_${semana}.pdf`);
    }

    // Boleta Listeners
    const filtroBoletaValor = document.getElementById('filtroBoletaValor');
    const boletaData = document.getElementById('boletaData');
    if (filtroBoletaValor) filtroBoletaValor.addEventListener('change', buscarDadosBoleta);
    if (boletaData) boletaData.addEventListener('change', buscarDadosBoleta);

    // --- LISTENERS MODAL EXPEDIÇÃO ---
    const btnCloseExpedicao = document.getElementById('modalExpedicaoClose');
    if (btnCloseExpedicao) {
        btnCloseExpedicao.addEventListener('click', () => {
            document.getElementById('modalExpedicao').style.display = 'none';
        });
    }

    const filtersExpedicao = document.getElementById('expedicao-filters');
    if (filtersExpedicao) {
        filtersExpedicao.addEventListener('change', (e) => { // 'change' funciona para <select multiple>
            if (e.target.classList.contains('filter-input')) {
                const filters = {};
                document.querySelectorAll('#expedicao-filters .filter-input').forEach(input => {
                    const column = input.dataset.column;
                    const selectedValues = Array.from(input.selectedOptions).map(opt => opt.value);
                    if (selectedValues.length > 0) {
                        filters[column] = selectedValues;
                    }
                });

                const filteredData = dadosPadraoDoDia.filter(item => {
                    return Object.keys(filters).every(key => {
                        const itemValue = (item[key] || '').toString();
                        return filters[key].includes(itemValue);
                    });
                });

                renderTabelaExpedicao(filteredData);
            }
        });
    }

    const btnExpedicaoFecharFooter = document.getElementById('btnExpedicaoFecharFooter');
    if (btnExpedicaoFecharFooter) {
        btnExpedicaoFecharFooter.addEventListener('click', () => {
            document.getElementById('modalExpedicao').style.display = 'none';
        });
    }

    const btnExpedicaoPDF = document.getElementById('btnExpedicaoPDF');
    if (btnExpedicaoPDF) {
        btnExpedicaoPDF.addEventListener('click', () => {
            if (!window.jspdf) return alert('Biblioteca PDF não carregada.');
            
            // Filtra dados com base nos inputs atuais para gerar o PDF do que está visível
            const filters = {};
            document.querySelectorAll('#expedicao-filters .filter-input').forEach(input => {
                const column = input.dataset.column;
                const selectedValues = Array.from(input.selectedOptions).map(opt => opt.value);
                if (selectedValues.length > 0) filters[column] = selectedValues;
            });

            const dadosFiltrados = dadosPadraoDoDia.filter(item => {
                return Object.keys(filters).every(key => {
                    const itemValue = (item[key] || '').toString();
                    return filters[key].includes(itemValue);
                });
            });

            if (dadosFiltrados.length === 0) return alert('Nenhum dado para gerar PDF.');

            const { jsPDF } = window.jspdf;
            const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
            
            const diaNome = document.getElementById('modalExpedicaoDiaSemana').textContent;
            const semanaData = document.getElementById('modalExpedicaoSemanaData').textContent;

            const columns = ['Placa', 'Modelo', 'Rota', 'Status', 'Motorista'];
            const body = dadosFiltrados.map(d => [d.placa, d.modelo, d.rota, d.status, d.motorista]);

            // Calcular totais para o PDF
            const modeloCounts = dadosFiltrados.reduce((acc, item) => {
                if (item.modelo) {
                    const modelo = item.modelo.trim().toUpperCase();
                    acc[modelo] = (acc[modelo] || 0) + 1;
                }
                return acc;
            }, {});
            const totalBody = Object.entries(modeloCounts).map(([m, c]) => [m, c]);

            const margin = 5;
            const pageMiddleX = 210 / 2;
            const contentWidth = pageMiddleX - (margin * 2);

            const drawSide = (startX) => {
                doc.setFontSize(10);
                doc.text(`Resumo de Expedição - ${diaNome}`, startX, 10);
                doc.setFontSize(7);
                doc.text(semanaData, startX, 14);

                doc.autoTable({
                    head: [columns],
                    body: body,
                    startY: 18,
                    theme: 'grid',
                    styles: { 
                        fontSize: 6, 
                        cellPadding: 0.5,
                        overflow: 'linebreak',
                        valign: 'middle'
                    },
                    headStyles: { 
                        fillColor: [0, 105, 55],
                        fontSize: 6,
                        fontStyle: 'bold'
                    },
                    alternateRowStyles: { fillColor: [235, 247, 235] },
                    columnStyles: {
                        0: { cellWidth: 18 }, // Placa
                        1: { cellWidth: 22 }, // Modelo
                        2: { cellWidth: 15 }, // Rota
                        3: { cellWidth: 15 }, // Status
                        4: { cellWidth: 'auto' } // Motorista
                    },
                    // Define a margem inferior para 10mm (1cm)
                    margin: { left: startX, bottom: 10 }, 
                    tableWidth: contentWidth,
                });

                let finalY = doc.lastAutoTable.finalY + 3;

                if (totalBody.length > 0) {
                    doc.setFontSize(7);
                    doc.text("Totais por Modelo:", startX, finalY);
                    doc.autoTable({
                        head: [['Modelo', 'Qtd']],
                        body: totalBody,
                        startY: finalY + 2,
                        theme: 'grid',
                        styles: { fontSize: 6, cellPadding: 0.5 },
                        alternateRowStyles: { fillColor: [235, 247, 235] },
                        headStyles: { fillColor: [100, 100, 100], fontSize: 6 },
                        // Define a margem inferior para 10mm (1cm) também para os totais
                        margin: { left: startX, bottom: 10 }, 
                        tableWidth: 40
                    });
                }
            };


            // Lado Esquerdo
            drawSide(margin);

            // Linha de Corte
            doc.setLineWidth(0.1);
            doc.setDrawColor(200);
            doc.setLineDash([3, 3], 0);
            doc.line(pageMiddleX, 0, pageMiddleX, 297);
            doc.setLineDash([], 0);

            // Lado Direito
            drawSide(pageMiddleX + margin);

            doc.save(`Expedicao_${diaNome}.pdf`);
        });
    }

    const btnExpedicaoPDFConferencia = document.getElementById('btnExpedicaoPDFConferencia');
    if (btnExpedicaoPDFConferencia) {
        btnExpedicaoPDFConferencia.addEventListener('click', () => {
            if (!window.jspdf) return alert('Biblioteca PDF não carregada.');
            
            const filters = {};
            document.querySelectorAll('#expedicao-filters .filter-input').forEach(input => {
                const column = input.dataset.column;
                const selectedValues = Array.from(input.selectedOptions).map(opt => opt.value);
                if (selectedValues.length > 0) filters[column] = selectedValues;
            });

            const dadosFiltrados = dadosPadraoDoDia.filter(item => {
                return Object.keys(filters).every(key => {
                    const itemValue = (item[key] || '').toString();
                    return filters[key].includes(itemValue);
                });
            });

            if (dadosFiltrados.length === 0) return alert('Nenhum dado para gerar PDF.');

            const { jsPDF } = window.jspdf;
            const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
            
            const diaNome = document.getElementById('modalExpedicaoDiaSemana').textContent;
            const semanaData = document.getElementById('modalExpedicaoSemanaData').textContent;

            const columns = ['Placa', 'Modelo', 'Rota', 'Status', 'Motorista', 'Assinatura', 'Conferente'];
            const body = dadosFiltrados.map(d => [d.placa, d.modelo, d.rota, d.status, d.motorista, '', '']);

            const modeloCounts = dadosFiltrados.reduce((acc, item) => {
                if (item.modelo) {
                    const modelo = item.modelo.trim().toUpperCase();
                    acc[modelo] = (acc[modelo] || 0) + 1;
                }
                return acc;
            }, {});
            const totalBody = Object.entries(modeloCounts).map(([m, c]) => [m, c]);

            const margin = 10;
            const pageWidth = 210;
            const contentWidth = pageWidth - (margin * 2);

            doc.setFontSize(14);
            doc.text(`Conferência de Expedição - ${diaNome}`, margin, 15);
            doc.setFontSize(10);
            doc.text(semanaData, margin, 20);

            doc.autoTable({
                head: [columns],
                body: body,
                startY: 25,
                theme: 'grid',
                styles: { fontSize: 8, cellPadding: 2, valign: 'middle' },
                headStyles: { fillColor: [0, 105, 55], fontSize: 8, fontStyle: 'bold' },
                alternateRowStyles: { fillColor: [235, 247, 235] }, // Verde claro igual ao PDF de Expedição
                columnStyles: {
                    0: { cellWidth: 25 },
                    1: { cellWidth: 30 },
                    2: { cellWidth: 20 },
                    3: { cellWidth: 20 },
                    4: { cellWidth: 40 },
                    5: { cellWidth: 30 }, // Assinatura
                    6: { cellWidth: 'auto' } // Conferente
                },
                margin: { left: margin, right: margin, bottom: 15 },
                tableWidth: contentWidth
            });

            let finalY = doc.lastAutoTable.finalY + 5;

            if (totalBody.length > 0) {
                if (finalY + 20 > 280) { doc.addPage(); finalY = 15; }
                doc.setFontSize(10);
                doc.text("Totais por Modelo:", margin, finalY);
                doc.autoTable({
                    head: [['Modelo', 'Qtd']],
                    body: totalBody,
                    startY: finalY + 2,
                    theme: 'grid',
                    styles: { fontSize: 8, cellPadding: 1 },
                    alternateRowStyles: { fillColor: [235, 247, 235] }, // Verde claro também nos totais
                    headStyles: { fillColor: [100, 100, 100], fontSize: 8 },
                    margin: { left: margin },
                    tableWidth: 60
                });
            }

            doc.save(`Conferencia_Expedicao_${diaNome}.pdf`);
        });
    }

    const btnExpedicaoXLSX = document.getElementById('btnExpedicaoXLSX');
    if (btnExpedicaoXLSX) {
        btnExpedicaoXLSX.addEventListener('click', () => {
            if (typeof XLSX === 'undefined') return alert('Biblioteca XLSX não carregada.');

            // Filtra dados com base nos inputs atuais
            const filters = {};
            document.querySelectorAll('#expedicao-filters .filter-input').forEach(input => {
                const column = input.dataset.column;
                const selectedValues = Array.from(input.selectedOptions).map(opt => opt.value);
                if (selectedValues.length > 0) filters[column] = selectedValues;
            });

            const dadosFiltrados = dadosPadraoDoDia.filter(item => {
                return Object.keys(filters).every(key => {
                    const itemValue = (item[key] || '').toString();
                    return filters[key].includes(itemValue);
                });
            });

            if (dadosFiltrados.length === 0) return alert('Nenhum dado para gerar XLSX.');

            const diaNome = document.getElementById('modalExpedicaoDiaSemana').textContent;
            const semanaData = document.getElementById('modalExpedicaoSemanaData').textContent;
            
            const wsData = [];
            
            // Cabeçalho duplicado (Esquerda | Separador | Direita)
            wsData.push([`Resumo de Expedição - ${diaNome}`, null, null, null, null, null, `Resumo de Expedição - ${diaNome}`]);
            wsData.push([semanaData, null, null, null, null, null, semanaData]);
            wsData.push([]); // Linha em branco
            
            const headers = ['Placa', 'Modelo', 'Rota', 'Status', 'Motorista'];
            wsData.push([...headers, '', ...headers]);
            
            // Dados duplicados
            dadosFiltrados.forEach(item => {
                const rowLeft = [item.placa, item.modelo, item.rota, item.status, item.motorista];
                wsData.push([...rowLeft, '', ...rowLeft]);
            });
            
            wsData.push([]); // Linha em branco
            
            // Totais duplicados
            const modeloCounts = dadosFiltrados.reduce((acc, item) => {
                if (item.modelo) {
                    const modelo = item.modelo.trim().toUpperCase();
                    acc[modelo] = (acc[modelo] || 0) + 1;
                }
                return acc;
            }, {});
            const totalBody = Object.entries(modeloCounts).map(([m, c]) => [m, c]);
            
            if (totalBody.length > 0) {
                wsData.push(['Totais por Modelo', null, null, null, null, null, 'Totais por Modelo']);
                wsData.push(['Modelo', 'Qtd', null, null, null, null, 'Modelo', 'Qtd']);
                totalBody.forEach(row => {
                    wsData.push([row[0], row[1], null, null, null, null, row[0], row[1]]);
                });
            }
            
            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.aoa_to_sheet(wsData);
            XLSX.utils.book_append_sheet(wb, ws, "Expedicao");
            XLSX.writeFile(wb, `Expedicao_${diaNome}.xlsx`);
        });
    }

    // --- MOVIMENTAÇÃO, ORDENAÇÃO E REDIMENSIONAMENTO DE COLUNAS ---
    const DEFAULT_COLUMNS_BY_SECTION = {
        Padrao: ['select', 'placa', 'modelo', 'rota', 'status', 'motorista', 'auxiliar', 'terceiro', 'acoes'],
        Transferencia: ['select', 'placa', 'modelo', 'rota', 'status', 'motorista', 'auxiliar', 'terceiro', 'acoes'],
        Equipamento: ['select', 'placa', 'modelo', 'rota', 'status', 'motorista', 'auxiliar', 'terceiro', 'acoes'],
        Reservas: ['select', 'placa', 'modelo', 'rota', 'status', 'motorista', 'auxiliar', 'terceiro', 'acoes'],
        Faltas: ['select', 'motorista_ausente', 'motivo_motorista', 'auxiliar_ausente', 'motivo_auxiliar', 'acoes']
    };

    const COLUMN_LABELS = {
        select: '',
        placa: 'PLACA',
        modelo: 'MODELO',
        rota: 'ROTA',
        status: 'STATUS',
        motorista: 'MOTORISTA',
        auxiliar: 'AUXILIAR',
        terceiro: 'TERCEIRO',
        motorista_ausente: 'MOTORISTA',
        motivo_motorista: 'MOTIVO MOTORISTA',
        auxiliar_ausente: 'AUXILIAR',
        motivo_auxiliar: 'MOTIVO AUXILIAR',
        acoes: 'AÇÕES'
    };

    const columnSortState = {};

    function getTableSection(table) {
        const tbody = table?.querySelector('tbody[id^="tbody"]');
        return tbody ? tbody.id.replace('tbody', '') : null;
    }

    function getColumnOrderStorageKey(section) {
        return `${COLUMN_ORDER_KEY_PREFIX}${section}`;
    }

    function getColumnWidthStorageKey(section) {
        return `${COLUMN_WIDTH_KEY_PREFIX}${section}`;
    }

    function getDefaultColumns(section) {
        return DEFAULT_COLUMNS_BY_SECTION[section] || [];
    }

    function setupEscalaGridTools() {
        Object.keys(SECAO_PARA_DB).forEach(section => {
            const table = document.getElementById(`tbody${section}`)?.closest('table');
            if (!table) return;

            assignColumnKeys(table, section);
            applySavedColumnOrder(table, section);
            setupColumnHeaderControls(table, section);
            applySavedColumnWidths(table, section);
        });
    }

    function assignColumnKeys(table, section) {
        const defaultColumns = getDefaultColumns(section);
        const headers = Array.from(table.querySelectorAll('thead tr:first-child th'));

        headers.forEach((th, index) => {
            const key = th.dataset.columnKey || defaultColumns[index];
            if (!key) return;
            th.dataset.columnKey = key;
            th.dataset.defaultIndex = index;
        });

        table.querySelectorAll('tbody tr').forEach(row => {
            const cells = Array.from(row.children);
            if (cells.length !== defaultColumns.length) return;

            cells.forEach((td, index) => {
                if (!td.dataset.columnKey) td.dataset.columnKey = defaultColumns[index];
            });
        });
    }

    function getSavedColumnOrder(section) {
        const defaultColumns = getDefaultColumns(section);
        const saved = JSON.parse(localStorage.getItem(getColumnOrderStorageKey(section)) || '[]');
        const validSaved = saved.filter(key => defaultColumns.includes(key));
        const missing = defaultColumns.filter(key => !validSaved.includes(key));
        return [...validSaved, ...missing];
    }

    function applySavedColumnOrder(table, section) {
        applyColumnOrder(table, getSavedColumnOrder(section));
    }

    function applyColumnOrder(table, order) {
        const headerRow = table.querySelector('thead tr:first-child');
        if (!headerRow) return;

        reorderChildrenByColumnKey(headerRow, order);
        table.querySelectorAll('tbody tr').forEach(row => reorderChildrenByColumnKey(row, order));
    }

    function reorderChildrenByColumnKey(row, order) {
        const children = Array.from(row.children);
        if (children.length !== order.length) return;

        const byKey = new Map(children.map(child => [child.dataset.columnKey, child]));
        order.forEach(key => {
            const child = byKey.get(key);
            if (child) row.appendChild(child);
        });
    }

    function setupColumnHeaderControls(table, section) {
        const headers = Array.from(table.querySelectorAll('thead tr:first-child th'));
        headers.forEach(th => {
            const key = th.dataset.columnKey;
            if (!key || key === 'select' || key === 'acoes') return;

            th.classList.add('escala-column-header');
            th.draggable = true;

            if (!th.querySelector('.column-label')) {
                const label = COLUMN_LABELS[key] || th.textContent.trim();
                th.innerHTML = `
                    <span class="column-label">${label}</span>
                    <span class="column-tools">
                        <button type="button" class="column-sort-btn" title="Ordenar coluna"><i class="fas fa-sort"></i></button>
                        <span class="column-drag-handle" title="Arraste para mover coluna"><i class="fas fa-grip-vertical"></i></span>
                    </span>
                `;
            }

            if (!th.dataset.columnToolsReady) {
                th.dataset.columnToolsReady = 'true';
                th.addEventListener('dragstart', handleColumnDragStart);
                th.addEventListener('dragover', handleColumnDragOver);
                th.addEventListener('drop', handleColumnDrop);
                th.addEventListener('dragleave', () => th.classList.remove('drag-over-column'));
                th.addEventListener('dragend', handleColumnDragEnd);
            }

            const sortBtn = th.querySelector('.column-sort-btn');
            if (sortBtn && !sortBtn.dataset.sortReady) {
                sortBtn.dataset.sortReady = 'true';
                sortBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    sortTableByColumn(table, section, key);
                });
            }
        });
    }

    function handleColumnDragStart(e) {
        if (e.target.closest('.resizer') || e.target.closest('.column-sort-btn')) {
            e.preventDefault();
            return;
        }

        const th = e.currentTarget;
        th.classList.add('dragging-column');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', JSON.stringify({
            section: getTableSection(th.closest('table')),
            key: th.dataset.columnKey
        }));
    }

    function handleColumnDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        e.currentTarget.classList.add('drag-over-column');
    }

    function handleColumnDrop(e) {
        e.preventDefault();
        const targetTh = e.currentTarget;
        targetTh.classList.remove('drag-over-column');

        let payload = null;
        try {
            payload = JSON.parse(e.dataTransfer.getData('text/plain') || '{}');
        } catch {
            return;
        }

        const table = targetTh.closest('table');
        const section = getTableSection(table);
        const sourceKey = payload.key;
        const targetKey = targetTh.dataset.columnKey;

        if (!section || payload.section !== section || !sourceKey || !targetKey || sourceKey === targetKey) return;

        const order = Array.from(table.querySelectorAll('thead tr:first-child th')).map(th => th.dataset.columnKey);
        const sourceIndex = order.indexOf(sourceKey);
        const targetIndex = order.indexOf(targetKey);
        if (sourceIndex < 0 || targetIndex < 0) return;

        order.splice(sourceIndex, 1);
        order.splice(targetIndex, 0, sourceKey);

        localStorage.setItem(getColumnOrderStorageKey(section), JSON.stringify(order));
        applyColumnOrder(table, order);
        setupColumnHeaderControls(table, section);
        applySavedColumnWidths(table, section);
    }

    function handleColumnDragEnd() {
        document.querySelectorAll('.dragging-column, .drag-over-column').forEach(el => {
            el.classList.remove('dragging-column', 'drag-over-column');
        });
    }

    function sortTableByColumn(table, section, key) {
        const tbody = table.querySelector('tbody');
        if (!tbody) return;

        const stateKey = `${section}_${key}`;
        const nextDirection = columnSortState[stateKey] === 'asc' ? 'desc' : 'asc';
        columnSortState[stateKey] = nextDirection;

        const rows = Array.from(tbody.querySelectorAll('tr')).filter(row => row.children.length === getDefaultColumns(section).length);
        rows.sort((rowA, rowB) => {
            const valueA = getCellSortValue(rowA, key);
            const valueB = getCellSortValue(rowB, key);
            const numericA = parseFloat(valueA.replace(',', '.'));
            const numericB = parseFloat(valueB.replace(',', '.'));

            let result;
            if (!Number.isNaN(numericA) && !Number.isNaN(numericB)) {
                result = numericA - numericB;
            } else {
                result = valueA.localeCompare(valueB, 'pt-BR', { sensitivity: 'base', numeric: true });
            }

            return nextDirection === 'asc' ? result : -result;
        });

        rows.forEach(row => tbody.appendChild(row));
        updateSortIcons(table, key, nextDirection);
    }

    function getCellSortValue(row, key) {
        const cell = Array.from(row.children).find(td => td.dataset.columnKey === key);
        if (!cell) return '';
        const input = cell.querySelector('input, select, textarea');
        return (input ? input.value : cell.textContent).trim();
    }

    function updateSortIcons(table, activeKey, direction) {
        table.querySelectorAll('.column-sort-btn i').forEach(icon => {
            const key = icon.closest('th')?.dataset.columnKey;
            icon.className = key === activeKey
                ? (direction === 'asc' ? 'fas fa-sort-up' : 'fas fa-sort-down')
                : 'fas fa-sort';
        });
    }

    function applySavedColumnWidths(table, section) {
        const savedWidths = JSON.parse(localStorage.getItem(getColumnWidthStorageKey(section)) || '{}');
        table.querySelectorAll('thead tr:first-child th').forEach(th => {
            const key = th.dataset.columnKey;
            if (key && savedWidths[key]) {
                th.style.width = savedWidths[key];
                th.style.minWidth = savedWidths[key];
            }
        });
    }

    function getCollapsedSections() {
        return JSON.parse(localStorage.getItem(SECTION_COLLAPSE_KEY) || '{}');
    }

    function saveCollapsedSections(collapsedSections) {
        localStorage.setItem(SECTION_COLLAPSE_KEY, JSON.stringify(collapsedSections));
    }

    function setupSectionMinimizers() {
        Object.keys(SECAO_PARA_DB).forEach(section => {
            const title = document.querySelector(`.collapsible-section-title[data-section="${section}"]`);
            const btn = title?.querySelector('.section-toggle-btn');
            if (!title || !btn) return;

            title.addEventListener('dblclick', () => toggleEscalaSection(section));
        });

        applyCollapsedSections();
    }

    function toggleEscalaSection(section) {
        if (!section) return;

        const collapsedSections = getCollapsedSections();
        collapsedSections[section] = !collapsedSections[section];
        saveCollapsedSections(collapsedSections);
        applySectionCollapsedState(section, collapsedSections[section]);
    }

    function applyCollapsedSections() {
        const collapsedSections = getCollapsedSections();
        Object.keys(SECAO_PARA_DB).forEach(section => {
            applySectionCollapsedState(section, !!collapsedSections[section]);
        });
    }

    function applySectionCollapsedState(section, isCollapsed) {
        const title = document.querySelector(`.collapsible-section-title[data-section="${section}"]`);
        const btn = title?.querySelector('.section-toggle-btn');
        const icon = btn?.querySelector('i');
        const tableContainer = document.getElementById(`tbody${section}`)?.closest('.table-scroll-container');
        const addRowContainer = document.querySelector(`.section-add-row-container[data-section="${section}"]`);

        if (title) title.classList.toggle('section-collapsed', isCollapsed);
        if (tableContainer) tableContainer.classList.toggle('hidden', isCollapsed);
        if (addRowContainer) addRowContainer.classList.toggle('hidden', isCollapsed);
        if (btn) {
            btn.title = isCollapsed ? 'Expandir seção' : 'Minimizar seção';
            btn.setAttribute('aria-label', btn.title);
        }
        if (icon) {
            icon.className = isCollapsed ? 'fas fa-chevron-down' : 'fas fa-chevron-up';
        }
    }

    function enableColumnResizing() {
        const tableConfigs = [
            ...Object.keys(SECAO_PARA_DB).map(sec => ({
                element: document.getElementById(`tbody${sec}`)?.closest('table'),
                id: getColumnWidthStorageKey(sec)
            })),
            {
                element: document.getElementById('tabelaPlanejamento'),
                id: 'colWidths_planejamento'
            }
        ];

        tableConfigs.forEach(({ element: table, id: tableId }) => {
            if (!table) return;

            const savedWidths = JSON.parse(localStorage.getItem(tableId)) || {};
            // Seleciona todos os 'th' que não têm colspan, pois são as colunas que contêm dados na tbody
            const headers = table.querySelectorAll('th:not([colspan])');

            headers.forEach((th, index) => {
                // Não adicionar resizer em colunas de ação vazias ou colunas sem texto
                if (th.textContent.trim() === '' && !th.querySelector('i')) return;

                // Usamos o índice como chave, pois é relativo a cada tabela
                const columnKey = th.dataset.columnKey || index;
                if (savedWidths[columnKey] || savedWidths[index]) {
                    th.style.width = savedWidths[columnKey] || savedWidths[index];
                } else if (!th.style.width) {
                    // Define uma largura inicial padrão se não houver nada salvo
                    if (th.textContent.trim().toUpperCase() === 'AÇÕES' || th.textContent.trim() === '') {
                        th.style.width = '60px';
                    } else {
                        th.style.width = '150px';
                    }
                }

                if (!th.querySelector('.resizer')) {
                    const resizer = document.createElement('div');
                    resizer.className = 'resizer';
                    th.appendChild(resizer);
                    setupResizer(resizer, th, tableId, columnKey);
                }
            });
        });
    }

    function setupResizer(resizer, th, tableId, columnKey) {
        let x = 0, w = 0;
        const mouseDownHandler = (e) => {
            e.preventDefault(); // Previne seleção de texto ao arrastar
            x = e.clientX;
            w = parseInt(window.getComputedStyle(th).width, 10);
            document.addEventListener('mousemove', mouseMoveHandler);
            document.addEventListener('mouseup', mouseUpHandler);
            resizer.classList.add('resizing');
        };
        const mouseMoveHandler = (e) => {
            const width = `${Math.max(48, w + e.clientX - x)}px`;
            th.style.width = width;
            th.style.minWidth = width;
        };
        const mouseUpHandler = () => {
            document.removeEventListener('mousemove', mouseMoveHandler);
            document.removeEventListener('mouseup', mouseUpHandler);
            resizer.classList.remove('resizing');
            const saved = JSON.parse(localStorage.getItem(tableId)) || {};
            saved[columnKey] = th.style.width;
            localStorage.setItem(tableId, JSON.stringify(saved));
        };
        resizer.addEventListener('mousedown', mouseDownHandler);
    }

    // --- PINTURA DE COLUNAS ---
    function setColumnColor(th, color) {
        const table = th.closest('table');
        const tbody = table.querySelector('tbody');
        const tbodyId = tbody ? tbody.id : null;
        
        if (!tbodyId) return;

        const colInfo = getEffectiveColumnIndex(th);
        const startIndex = colInfo.index;
        const span = colInfo.span;

        const colors = JSON.parse(localStorage.getItem(COLUMN_COLORS_KEY) || '{}');
        if (!colors[tbodyId]) colors[tbodyId] = {};

        for (let i = 0; i < span; i++) {
            const idx = startIndex + i;
            if (color) {
                colors[tbodyId][idx] = color;
            } else {
                delete colors[tbodyId][idx];
            }
        }

        localStorage.setItem(COLUMN_COLORS_KEY, JSON.stringify(colors));
        updateColumnColorsStyle();
    }

    function getCellStyle(tabela, id, key, valueForStatus = null) {
        let style = '';

        // 1. Cores de Planejamento por coluna (se preenchido)
        if (tabela === 'planejamento_semanal' && valueForStatus) {
            const dayMatch = key.match(/^(domingo|segunda|terca|quarta|quinta|sexta|sabado)_/);
            if (dayMatch) {
                const day = dayMatch[1];
                const color = PLANNING_DAY_COLORS[day];
                if (color) {
                    return `background-color: ${color} !important; color: #000; font-weight: bold;`;
                }
            }
        }

        // 1. Estilo de Status (se houver)
        if (key === 'status' && valueForStatus) {
             style += getStatusStyle(valueForStatus);
        }
        // 2. Cor da Célula Salva (Sobrescreve background)
        const allColors = JSON.parse(localStorage.getItem(CELL_COLORS_KEY) || '{}');
        const savedColor = allColors[`${tabela}_${id}_${key}`];
        if (savedColor) {
            style += `background-color: ${savedColor} !important;`;
        }
        return style;
    }

    function setCellColor(targetInfo, color) {
        const { tabela, id, key, element } = targetInfo;
        const allColors = JSON.parse(localStorage.getItem(CELL_COLORS_KEY) || '{}');
        const uniqueKey = `${tabela}_${id}_${key}`;
        
        if (color) {
            allColors[uniqueKey] = color;
            element.style.setProperty('background-color', color, 'important');
        } else {
            delete allColors[uniqueKey];
            element.style.backgroundColor = '';
            if (key === 'status') updateInputColor(element); // Restaura cor do status se necessário
        }
        localStorage.setItem(CELL_COLORS_KEY, JSON.stringify(allColors));
    }

    function getEffectiveColumnIndex(th) {
        const table = th.closest('table');
        const rows = Array.from(table.tHead.rows);
        
        // Caso simples: apenas uma linha de cabeçalho
        if (rows.length <= 1) return { index: th.cellIndex + 1, span: th.colSpan || 1 };

        // Caso complexo (Planejamento): Mapear a matriz do cabeçalho
        const matrix = [];
        const maxCols = 100; 
        for(let r=0; r<rows.length; r++) matrix[r] = new Array(maxCols).fill(null);

        for(let r=0; r<rows.length; r++) {
            const row = rows[r];
            let currentCol = 0;
            for(let c=0; c<row.cells.length; c++) {
                const cell = row.cells[c];
                while(matrix[r][currentCol]) currentCol++; // Pula slots ocupados

                const rowspan = cell.rowSpan || 1;
                const colspan = cell.colSpan || 1;

                if (cell === th) {
                    return { index: currentCol + 1, span: colspan };
                }

                for(let rs=0; rs<rowspan; rs++) {
                    for(let cs=0; cs<colspan; cs++) {
                        matrix[r+rs][currentCol+cs] = true;
                    }
                }
            }
        }
        return { index: th.cellIndex + 1, span: th.colSpan || 1 };
    }

    function updateColumnColorsStyle() {
        let styleEl = document.getElementById('dynamic-column-colors');
        if (!styleEl) {
            styleEl = document.createElement('style');
            styleEl.id = 'dynamic-column-colors';
            document.head.appendChild(styleEl);
        }

        const colors = JSON.parse(localStorage.getItem(COLUMN_COLORS_KEY) || '{}');
        let css = '';

        Object.keys(colors).forEach(tbodyId => {
            const colColors = colors[tbodyId];
            Object.keys(colColors).forEach(colIndex => {
                const color = colColors[colIndex];
                // Aplica cor às células de dados (TD)
                css += `#${tbodyId} > tr > td:nth-child(${colIndex}) { background-color: ${color} !important; }\n`;
            });
        });

        styleEl.textContent = css;
    }

    // Função para destacar veículos com status INTERNADO
    async function destacarVeiculosInternados() {
        try {
            // Busca todas as placas com situação INTERNADO
            const { data: veiculos, error } = await supabaseClient
                .from('veiculos')
                .select('placa')
                .eq('situacao', 'INTERNADO');

            if (error) {
                console.error('Erro ao buscar veículos internados:', error);
                return;
            }

            const placasInternadas = new Set(veiculos.map(v => v.placa.trim().toUpperCase()));
            const corFundoInternado = '#004085'; // Cor do fundo INTERNADO (azul escuro)
            const corTextoInternado = '#FFFFFF'; // Cor do texto INTERNADO (branco)

            const aplicarEstilo = () => {
                // Seleciona inputs na primeira coluna (PLACA) de todas as tabelas de dados
                const inputs = document.querySelectorAll('.data-grid tbody tr td:first-child input');
                inputs.forEach(input => {
                    const placa = input.value.trim().toUpperCase();
                    if (placasInternadas.has(placa)) {
                        input.style.backgroundColor = corFundoInternado;
                        input.style.color = corTextoInternado;
                        input.style.fontWeight = 'bold';
                    } else {
                        // Reseta para o padrão se não for internado
                        input.style.backgroundColor = '';
                        input.style.color = '';
                        input.style.fontWeight = '';
                    }
                });
            };

            // Aplica inicialmente
            aplicarEstilo();

            // Observa mudanças nas tabelas (para quando os dados são carregados ou linhas adicionadas)
            const observer = new MutationObserver(aplicarEstilo);
            const tbodies = document.querySelectorAll('.data-grid tbody');
            tbodies.forEach(tbody => {
                observer.observe(tbody, { childList: true, subtree: true });
            });

            // Reaplica ao digitar (caso mude a placa manualmente)
            document.addEventListener('input', (e) => {
                if (e.target.matches('.data-grid tbody tr td:first-child input')) {
                    aplicarEstilo();
                }
            });

        } catch (err) {
            console.error('Erro na verificação de internados:', err);
        }
    }

    async function adicionarLinhaPlanejamento() {
        const tbody = document.getElementById('tbodyPlanejamento');
        if (!tbody) return;
        
        const semana = selectSemana.value;
        if (!semana) return alert('Selecione uma semana.');

        try {
            // Cria o registro no banco primeiro para obter o ID
            const { data, error } = await supabaseClient
                .from('planejamento_semanal')
                .insert([{ semana_nome: semana }])
                .select()
                .single();

            if (error) throw error;
            
            renderLinhaPlanejamento(data, tbody);
        } catch (err) {
            console.error('Erro ao adicionar linha de planejamento:', err);
            alert('Erro ao criar linha no banco de dados.');
        }
    }

    async function carregarPlanejamento(semana) {
        const tbody = document.getElementById('tbodyPlanejamento');
        if (!tbody) return;
        tbody.innerHTML = '<tr><td colspan="21" style="text-align:center;">Carregando...</td></tr>';

        try {
            const { data, error } = await supabaseClient
                .from('planejamento_semanal')
                .select('*')
                .eq('semana_nome', semana)
                .order('id');

            if (error) throw error;

            tbody.innerHTML = '';
            if (data.length === 0) {
                 // Opcional: mostrar mensagem de vazio ou deixar em branco
            }
            data.forEach(item => renderLinhaPlanejamento(item, tbody));
        } catch (err) {
            console.error(err);
            tbody.innerHTML = '<tr><td colspan="20" style="text-align:center; color:red;">Erro ao carregar dados.</td></tr>';
        }
    }

    function renderLinhaPlanejamento(item, tbody) {
        const tr = document.createElement('tr');
        tr.dataset.id = item.id;
        tr.dataset.tabela = 'planejamento_semanal';

        const dias = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
        let diasHtml = '';
        
        dias.forEach(dia => {
            diasHtml += `
                <td><input type="text" class="table-input" value="${item[dia + '_rota'] || ''}" data-key="${dia}_rota" placeholder="Rota" style="${getCellStyle('planejamento_semanal', item.id, dia + '_rota', item[dia + '_rota'])}"></td>
                <td><input type="text" list="listaStatus" class="table-input" value="${item[dia + '_status'] || ''}" data-key="${dia}_status" placeholder="Status" title="${getStatusTitleAttr(item[dia + '_status'])}" style="${getCellStyle('planejamento_semanal', item.id, dia + '_status', item[dia + '_status'])}"></td>
            `;
        });

        tr.innerHTML = `
            <td style="text-align: center; vertical-align: middle;"><input type="checkbox" class="row-selector-plan" data-id="${item.id}"></td>
            <td><input type="text" list="listaVeiculos" class="table-input" value="${item.placa || ''}" data-key="placa" placeholder="Placa" style="${getCellStyle('planejamento_semanal', item.id, 'placa')}"></td>
            <td><input type="text" list="listaModelos" class="table-input non-editable" value="${item.modelo || ''}" data-key="modelo" placeholder="Modelo" readonly style="${getCellStyle('planejamento_semanal', item.id, 'modelo')}"></td>
            ${diasHtml}
            <td><input type="text" list="listaMotoristas" class="table-input" value="${item.motorista || ''}" data-key="motorista" placeholder="Motorista" style="${getCellStyle('planejamento_semanal', item.id, 'motorista')}"></td>
            <td><input type="text" list="listaAuxiliares" class="table-input" value="${item.auxiliar || ''}" data-key="auxiliar" placeholder="Auxiliar" style="${getCellStyle('planejamento_semanal', item.id, 'auxiliar')}"></td>
            <td><input type="text" list="listaTerceiros" class="table-input" value="${item.terceiro || ''}" data-key="terceiro" placeholder="Terceiro" style="${getCellStyle('planejamento_semanal', item.id, 'terceiro')}"></td>
            <td class="actions-cell"><button class="btn-icon delete btn-delete-row" title="Remover"><i class="fas fa-trash-alt"></i></button></td>
        `;
        tbody.appendChild(tr);
    }

    // --- LÓGICA BOTÃO FLUTUANTE (FAB) ---
    const btnFabAdd = document.getElementById('btnFabAdd');
    const btnFabRemove = document.getElementById('btnFabRemove');

    if (btnFabAdd) {
        btnFabAdd.addEventListener('click', () => {
            const activeTab = document.querySelector('.tab-btn.active');
            if (!activeTab) return;

            if (activeTab.dataset.tab === 'planejamento') {
                adicionarLinhaPlanejamento();
            } else {
                const selected = document.querySelector('.selected-cell');
                if (!selected) {
                    // Se nada selecionado, adiciona na seção padrão
                    adicionarLinhaManual('Padrao');
                } else {
                    const tr = selected.closest('tr');
                    const tbody = tr.closest('tbody');
                    const sectionName = tbody.id.replace('tbody', '');
                    adicionarLinhaManual(sectionName);
                }
            }
        });
    }

    if (btnFabRemove) {
        btnFabRemove.addEventListener('click', async () => {
            const selectedCells = document.querySelectorAll('.selected-cell');
            const selectedPlan = document.querySelectorAll('.row-selector-plan:checked');
            const selectedDia = document.querySelectorAll('.row-selector-dia:checked');
            
            if (selectedCells.length === 0 && selectedPlan.length === 0 && selectedDia.length === 0) {
                return alert('Selecione pelo menos uma célula ou linha para excluir.');
            }

            if (!confirm('Tem certeza que deseja excluir as linhas selecionadas?')) return;

            const toDelete = { escala: [], faltas_afastamentos: [], planejamento_semanal: [] };

            selectedCells.forEach(el => {
                const tr = el.closest('tr');
                if (tr && tr.dataset.id && tr.dataset.tabela) {
                    if (!toDelete[tr.dataset.tabela].includes(tr.dataset.id)) {
                        toDelete[tr.dataset.tabela].push(tr.dataset.id);
                    }
                }
            });

            selectedPlan.forEach(chk => {
                if (chk.dataset.id) toDelete.planejamento_semanal.push(chk.dataset.id);
            });

            selectedDia.forEach(chk => {
                const tr = chk.closest('tr');
                if (tr && tr.dataset.id && tr.dataset.tabela) {
                    if (!toDelete[tr.dataset.tabela].includes(tr.dataset.id)) {
                        toDelete[tr.dataset.tabela].push(tr.dataset.id);
                    }
                }
            });

            try {
                for (const table in toDelete) {
                    if (toDelete[table].length > 0) {
                        const { error } = await supabaseClient.from(table).delete().in('id', toDelete[table]);
                        if (error) throw error;
                    }
                }
                alert('Exclusão realizada com sucesso.');
                const activeTab = document.querySelector('.tab-btn.active');
                if (activeTab.dataset.tab === 'planejamento') carregarPlanejamento(selectSemana.value);
                else carregarDadosDia(activeTab.dataset.dia, selectSemana.value);
            } catch (err) { alert('Erro ao excluir: ' + err.message); }
        });
    }

    // Adiciona listener global para checkboxes "selecionar todos" nas tabelas diárias
    document.addEventListener('change', (e) => {
        if (e.target.classList.contains('select-all-dia')) {
            const isChecked = e.target.checked;
            const table = e.target.closest('table');
            if (table) {
                table.querySelectorAll('.row-selector-dia').forEach(chk => chk.checked = isChecked);
            }
        }
    });

    // Inicialização
    carregarSemanas();
    preencherCacheDatas();
    carregarListasAuxiliares();
    setupEscalaGridTools();
    setupSectionMinimizers();
    enableColumnResizing();
    updateColumnColorsStyle(); // Carrega cores salvas
    atualizarBotaoTerceiroSuspenso();
    destacarVeiculosInternados();

});
