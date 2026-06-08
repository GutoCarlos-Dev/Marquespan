// script/escala.js
import { supabaseClient } from './supabase.js';

// Variável para armazenar os dados da seção PADRÃO do dia atual
let dadosPadraoDoDia = [];

const COLUMN_COLORS_KEY = 'marquespan_column_colors';
const CELL_COLORS_KEY = 'marquespan_cell_colors';
const CELL_NOTES_KEY = 'marquespan_cell_notes';
const SAVED_COLORS_KEY = 'marquespan_saved_colors';
const COLUMN_ORDER_KEY_PREFIX = 'marquespan_escala_column_order_';
const COLUMN_WIDTH_KEY_PREFIX = 'marquespan_escala_column_width_';
const SECTION_COLLAPSE_KEY = 'marquespan_escala_collapsed_sections';
const SEMANA_MODELO_PLANEJAMENTO = 'SEMANA PADRAO - MODELO';
const SEMANA_MODELO_DATAS_KEY = 'marquespan_semana_modelo_datas';
const ESCALA_PAGE_ID = 'escala.html';
const ESCALA_NIVEIS_GERENCIAMENTO = new Set([
    'administrador',
    'gerencia',
    'balanca',
    'equipe_noturno',
    'adm_logistica',
    'logistica'
]);

document.addEventListener('DOMContentLoaded', async () => {
    console.log('Página de Controle de Escala carregada.');

    // Proteção de página: verifica se o usuário está logado
    const usuarioLogado = JSON.parse(localStorage.getItem('usuarioLogado'));
    if (!usuarioLogado) {
        alert('Acesso negado. Por favor, faça login.');
        window.location.href = 'index.html';
        return;
    }

    // Removido: Injeção de estilos via JavaScript (centralizado no escala.css)

    const nivelUsuarioEscala = String(usuarioLogado.nivel || '').toLowerCase();
    const podeGerenciarEscala = ESCALA_NIVEIS_GERENCIAMENTO.has(nivelUsuarioEscala);
    const isAdmPedidoEscala = nivelUsuarioEscala === 'adm_pedido';

    const acessoPermitido = await verificarPermissaoPaginaEscala();
    if (!acessoPermitido) {
        document.body.innerHTML = '<div style="text-align: center; padding: 50px;"><h1>Acesso Negado</h1><p>Voce nao tem permissao para acessar esta pagina.</p><a href="dashboard.html">Voltar ao Dashboard</a></div>';
        return;
    }

    // --- ELEMENTOS DO DOM ---
    const selectSemana = document.getElementById('escalaSemana');
    const selectFilial = document.getElementById('escalaFilial');
    const escalaAuditInfo = document.getElementById('escalaAuditInfo');
    const btnToggleMenuLateral = document.getElementById('btnToggleMenuLateralEscala');
    const btnAbrirEscala = document.getElementById('btnAbrirEscala');
    const btnDiaria = document.getElementById('btnDiaria');
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
    const btnXLSX = document.getElementById('btnXLSX');
    const btnPDFExpedicaoModelo = document.getElementById('btnPDFExpedicaoModelo');
    
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
    aplicarRestricoesNivelEscala();

    let currentHeaderTarget = null;
    let currentCellTarget = null;
    let filiaisCache = [];

    function toggleMenuLateralEscala() {
        document.body.classList.toggle('escala-menu-oculto');
        const oculto = document.body.classList.contains('escala-menu-oculto');
        if (btnToggleMenuLateral) {
            btnToggleMenuLateral.title = oculto ? 'Mostrar menu lateral' : 'Ocultar menu lateral';
            btnToggleMenuLateral.setAttribute('aria-label', btnToggleMenuLateral.title);
        }
    }

    const NOTE_FIELDS = ['placa', 'motorista', 'auxiliar', 'terceiro', 'motorista_ausente', 'auxiliar_ausente'];

    function getFilialEscala() {
        return (selectFilial?.value || usuarioLogado?.filial || '').trim();
    }

    function exigirFilialEscala() {
        if (getFilialEscala()) return true;
        alert('Selecione uma filial.');
        return false;
    }

    function aplicarFiltroFilial(query) {
        const filial = getFilialEscala();
        return filial ? query.eq('filial', filial) : query;
    }

    function getUsuarioAuditoria() {
        return usuarioLogado?.nome || usuarioLogado?.nomecompleto || usuarioLogado?.nome_completo || usuarioLogado?.usuario_login || usuarioLogado?.email || 'Sistema';
    }

    function comAuditoria(payload = {}) {
        return {
            ...payload,
            ultima_alteracao_por: getUsuarioAuditoria(),
            ultima_alteracao_em: new Date().toISOString()
        };
    }

    async function verificarPermissaoPaginaEscala() {
        if (nivelUsuarioEscala === 'administrador') return true;

        try {
            const { data, error } = await supabaseClient
                .from('nivel_permissoes')
                .select('paginas_permitidas')
                .eq('nivel', nivelUsuarioEscala)
                .single();

            if (error) throw error;
            return (data?.paginas_permitidas || []).includes(ESCALA_PAGE_ID);
        } catch (error) {
            console.error('Erro ao validar permissao da pagina de escala:', error);
            return false;
        }
    }

    function exigirGerenciamentoEscala() {
        if (podeGerenciarEscala) return true;
        alert('Seu nivel de acesso permite visualizar a escala, mas nao alterar os dados.');
        return false;
    }

    function aplicarRestricoesNivelEscala() {
        if (podeGerenciarEscala) return;

        const idsSomenteGerencia = [
            'btnDiaria',
            'btnImportarSemana',
            'btnImportarPlanejamento',
            'btnCopiarPlanejamento',
            'btnCopiarModeloPlanejamento',
            'btnRecalcularPlanejamento',
            'btnAtualizarAbasPeloPlanejamento',
            'btnAdicionarLinhaPlanejamento',
            'btnFabAdd',
            'btnFabRemove',
            'btnSalvarPesoRota',
            'btnTransferirCarga',
            'btnAtualizarDiaSemana',
            'btnCopiarDia',
            'btnExcluirSelecionadosDia',
            'btnExcluirSelecionadosPlan',
            'btnLimparEscala',
            'btnTerceiroRotaSuspenso',
            'btnTrocaVeiculoSuspenso',
            'btnFaltasSuspenso',
            'btnTrocaFuncionarioSuspenso'
        ];

        if (isAdmPedidoEscala) {
            idsSomenteGerencia.push(
                'btnPDFExpedicaoModelo',
                'btnCalculoPeso',
                'btnGerarBoleta',
                'btnModeloDia',
                'btnImportarDia',
                'btnModeloPlanejamento'
            );
        }

        idsSomenteGerencia.forEach(id => {
            const element = document.getElementById(id);
            if (!element) return;
            element.disabled = true;
            element.classList.add('hidden');
            element.title = 'Disponivel apenas para administrador ou gerencia';
        });

        aplicarModoVisualizacaoEscala();
    }

    function aplicarModoVisualizacaoEscala() {
        if (podeGerenciarEscala) return;

        document.querySelectorAll('#painelEscala .table-input, #painelEscala .row-selector-plan, #painelEscala .row-selector-dia, #painelEscala .select-all-dia, #selectAllPlanejamento').forEach(element => {
            element.disabled = true;
            element.title = 'Seu nivel permite apenas visualizar a escala.';
        });

        document.querySelectorAll('#painelEscala [contenteditable="true"]').forEach(element => {
            element.contentEditable = 'false';
            element.title = 'Seu nivel permite apenas visualizar a escala.';
        });

        document.querySelectorAll('#painelEscala .btn-delete-row, #painelEscala .btn-limpar-terceiro').forEach(element => {
            element.disabled = true;
            element.classList.add('hidden');
            element.title = 'Disponivel apenas para administrador ou gerencia';
        });

        document.querySelectorAll('#painelEscala .section-add-row-container button').forEach(element => {
            element.disabled = true;
            element.classList.add('hidden');
            element.title = 'Disponivel apenas para administrador ou gerencia';
        });

        document.querySelectorAll('#painelEscala .btn-selecionar-troca-veiculo').forEach(element => {
            element.disabled = true;
        });
    }

    function formatarDataHoraAuditoria(value) {
        if (!value) return '';
        return new Date(value).toLocaleString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    function atualizarInfoAuditoria(row = null) {
        if (!escalaAuditInfo) return;
        const span = escalaAuditInfo.querySelector('span') || escalaAuditInfo;

        if (!row?.ultima_alteracao_em) {
            span.textContent = 'Nenhuma alteração registrada para a escala aberta.';
            return;
        }

        span.textContent = `Última alteração: ${row.ultima_alteracao_por || 'Sistema'} em ${formatarDataHoraAuditoria(row.ultima_alteracao_em)}`;
    }

    async function carregarUltimaAuditoriaEscala(contexto = {}) {
        if (!escalaAuditInfo) return;

        const semana = contexto.semana || selectSemana?.value;
        const dia = contexto.dia || document.querySelector('.tab-btn.active')?.dataset.dia;
        const isPlanejamento = contexto.planejamento || document.querySelector('.tab-btn.active')?.dataset.tab === 'planejamento';
        if (!semana) {
            atualizarInfoAuditoria(null);
            return;
        }

        try {
            let registros = [];
            if (isPlanejamento) {
                const { data, error } = await aplicarFiltroFilial(
                    supabaseClient
                        .from('planejamento_semanal')
                        .select('ultima_alteracao_por, ultima_alteracao_em')
                        .eq('semana_nome', semana)
                        .not('ultima_alteracao_em', 'is', null)
                ).order('ultima_alteracao_em', { ascending: false }).limit(1);
                if (error) throw error;
                registros = data || [];
            } else if (dia && getDataSemanaDiaOuNulo(semana, dia)) {
                const dataISO = getDataSemanaDia(semana, dia).toISOString().split('T')[0];
                const [resEscala, resFaltas] = await Promise.all([
                    aplicarFiltroFilial(
                        supabaseClient
                            .from('escala')
                            .select('ultima_alteracao_por, ultima_alteracao_em')
                            .eq('data_escala', dataISO)
                            .not('ultima_alteracao_em', 'is', null)
                    ).order('ultima_alteracao_em', { ascending: false }).limit(1),
                    aplicarFiltroFilial(supabaseClient
                        .from('faltas_afastamentos')
                        .select('ultima_alteracao_por, ultima_alteracao_em')
                        .eq('data_escala', dataISO)
                        .not('ultima_alteracao_em', 'is', null))
                        .order('ultima_alteracao_em', { ascending: false })
                        .limit(1)
                ]);
                if (resEscala.error) throw resEscala.error;
                if (resFaltas.error) throw resFaltas.error;
                registros = [...(resEscala.data || []), ...(resFaltas.data || [])];
            }

            const ultima = registros
                .filter(row => row.ultima_alteracao_em)
                .sort((a, b) => new Date(b.ultima_alteracao_em) - new Date(a.ultima_alteracao_em))[0];
            atualizarInfoAuditoria(ultima || null);
        } catch (err) {
            console.error('Erro ao carregar auditoria da escala:', err);
            atualizarInfoAuditoria(null);
        }
    }

    function getCellNoteId(tabela, id, key) {
        return `${tabela}:${id}:${key}`;
    }

    function getCellNotes() {
        try {
            return JSON.parse(localStorage.getItem(CELL_NOTES_KEY) || '{}');
        } catch {
            return {};
        }
    }

    function setCellNote(tabela, id, key, note) {
        const notes = getCellNotes();
        const noteId = getCellNoteId(tabela, id, key);
        const value = (note || '').trim();
        if (value) notes[noteId] = value;
        else delete notes[noteId];
        localStorage.setItem(CELL_NOTES_KEY, JSON.stringify(notes));
    }

    function getCellNote(tabela, id, key) {
        return getCellNotes()[getCellNoteId(tabela, id, key)] || '';
    }

    function applyCellAnnotations() {
        const notes = getCellNotes();
        document.querySelectorAll('#painelEscala tr[data-id][data-tabela] input.table-input').forEach(input => {
            const key = input.dataset.key;
            if (!NOTE_FIELDS.includes(key)) return;

            const tr = input.closest('tr');
            const note = notes[getCellNoteId(tr.dataset.tabela, tr.dataset.id, key)] || '';
            if (note) {
                input.classList.add('cell-has-note');
                const bgColor = note.includes('Carga em Excesso') ? '#dc3545' : '#198754';
                input.style.setProperty('background-color', bgColor, 'important');
                input.style.setProperty('color', '#fff', 'important');
                input.style.setProperty('font-weight', '700', 'important');
                input.title = note;
            } else {
                if (input.classList.contains('cell-has-note')) {
                    input.style.cssText = getCellStyle(tr.dataset.tabela, tr.dataset.id, key);
                }
                input.classList.remove('cell-has-note');
                input.removeAttribute('title');
            }
        });
    }

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

    const btnTrocaVeiculoSuspenso = document.createElement('button');
    btnTrocaVeiculoSuspenso.id = 'btnTrocaVeiculoSuspenso';
    btnTrocaVeiculoSuspenso.className = 'floating-terceiro-btn floating-troca-veiculo-btn hidden';
    btnTrocaVeiculoSuspenso.type = 'button';
    btnTrocaVeiculoSuspenso.disabled = true;
    btnTrocaVeiculoSuspenso.innerHTML = '<i class="fa-solid fa-truck"></i><span>Troca Veiculo</span>';
    document.body.appendChild(btnTrocaVeiculoSuspenso);

    btnTrocaVeiculoSuspenso.addEventListener('click', () => {
        if (!btnTrocaVeiculoSuspenso.disabled) abrirModalTrocaVeiculo();
    });

    const btnFaltasSuspenso = document.createElement('button');
    btnFaltasSuspenso.id = 'btnFaltasSuspenso';
    btnFaltasSuspenso.className = 'floating-terceiro-btn floating-faltas-btn hidden';
    btnFaltasSuspenso.type = 'button';
    btnFaltasSuspenso.disabled = true;
    btnFaltasSuspenso.innerHTML = '<i class="fa-solid fa-user-slash"></i><span>Faltas</span>';
    document.body.appendChild(btnFaltasSuspenso);

    btnFaltasSuspenso.addEventListener('click', () => {
        if (!btnFaltasSuspenso.disabled) abrirModalFaltasFuncionarios();
    });

    const btnTrocaFuncionarioSuspenso = document.createElement('button');
    btnTrocaFuncionarioSuspenso.id = 'btnTrocaFuncionarioSuspenso';
    btnTrocaFuncionarioSuspenso.className = 'floating-terceiro-btn floating-troca-funcionario-btn hidden';
    btnTrocaFuncionarioSuspenso.type = 'button';
    btnTrocaFuncionarioSuspenso.disabled = true;
    btnTrocaFuncionarioSuspenso.innerHTML = '<i class="fa-solid fa-user-pen"></i><span>Troca Func.</span>';
    document.body.appendChild(btnTrocaFuncionarioSuspenso);

    btnTrocaFuncionarioSuspenso.addEventListener('click', () => {
        if (!btnTrocaFuncionarioSuspenso.disabled) abrirModalTrocaFuncionario();
    });

    function atualizarBotaoTerceiroSuspenso() {
        const contexto = getDataEscalaAberta();
        const escalaAberta = painelEscala && !painelEscala.classList.contains('hidden');
        const ativo = !!contexto && escalaAberta && podeGerenciarEscala;

        btnTerceiroRotaSuspenso.disabled = !ativo;
        btnTerceiroRotaSuspenso.classList.toggle('hidden', !ativo);

        if (ativo) {
            btnTerceiroRotaSuspenso.title = `Gerenciar terceiro por rota - ${contexto.dia} ${contexto.dataBR}`;
            btnTerceiroRotaSuspenso.querySelector('span').textContent = `Terceiro ${contexto.dia}`;
        } else {
            btnTerceiroRotaSuspenso.title = 'Abra uma escala e selecione uma data.';
            btnTerceiroRotaSuspenso.querySelector('span').textContent = 'Terceiro';
        }

        atualizarBotaoTrocaVeiculoSuspenso();
    }

    function atualizarBotaoTrocaVeiculoSuspenso() {
        const contexto = getDataEscalaAberta();
        const escalaAberta = painelEscala && !painelEscala.classList.contains('hidden');
        const ativo = !!contexto && escalaAberta && podeGerenciarEscala;

        btnTrocaVeiculoSuspenso.disabled = !ativo;
        btnTrocaVeiculoSuspenso.classList.toggle('hidden', !ativo);

        if (ativo) {
            btnTrocaVeiculoSuspenso.title = `Trocar veiculo por rota - ${contexto.dia} ${contexto.dataBR}`;
            btnTrocaVeiculoSuspenso.querySelector('span').textContent = `Troca Veiculo ${contexto.dia}`;
        } else {
            btnTrocaVeiculoSuspenso.title = 'Abra uma escala e selecione uma data.';
            btnTrocaVeiculoSuspenso.querySelector('span').textContent = 'Troca Veiculo';
        }

        atualizarBotaoFaltasSuspenso();
    }

    function atualizarBotaoFaltasSuspenso() {
        const contexto = getDataEscalaAberta();
        const escalaAberta = painelEscala && !painelEscala.classList.contains('hidden');
        const ativo = !!contexto && escalaAberta && podeGerenciarEscala;

        btnFaltasSuspenso.disabled = !ativo;
        btnFaltasSuspenso.classList.toggle('hidden', !ativo);

        if (ativo) {
            btnFaltasSuspenso.title = `Aplicar faltas, ferias e afastamentos - ${contexto.dia} ${contexto.dataBR}`;
            btnFaltasSuspenso.querySelector('span').textContent = `Faltas ${contexto.dia}`;
        } else {
            btnFaltasSuspenso.title = 'Abra uma escala e selecione uma data.';
            btnFaltasSuspenso.querySelector('span').textContent = 'Faltas';
        }

        atualizarBotaoTrocaFuncionarioSuspenso();
    }

    function atualizarBotaoTrocaFuncionarioSuspenso() {
        const contexto = getDataEscalaAberta();
        const escalaAberta = painelEscala && !painelEscala.classList.contains('hidden');
        const ativo = !!contexto && escalaAberta && podeGerenciarEscala;

        btnTrocaFuncionarioSuspenso.disabled = !ativo;
        btnTrocaFuncionarioSuspenso.classList.toggle('hidden', !ativo);

        if (ativo) {
            btnTrocaFuncionarioSuspenso.title = `Trocar motorista ou auxiliar - ${contexto.dia} ${contexto.dataBR}`;
            btnTrocaFuncionarioSuspenso.querySelector('span').textContent = `Troca Func. ${contexto.dia}`;
        } else {
            btnTrocaFuncionarioSuspenso.title = 'Abra uma escala e selecione uma data.';
            btnTrocaFuncionarioSuspenso.querySelector('span').textContent = 'Troca Func.';
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
            selectDest.innerHTML = Array.from(selectSemana.options)
                .filter(option => !isSemanaModeloPlanejamento(option.value))
                .map(option => `<option value="${escapeAttribute(option.value)}">${escapeAttribute(option.textContent)}</option>`)
                .join('');
            selectDest.value = isSemanaModeloPlanejamento(selectSemana.value) ? '' : selectSemana.value;
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
            if (isSemanaModeloPlanejamento(targetWeek)) return alert('Selecione uma semana real como destino.');
            if (!exigirFilialEscala()) return;
            if (!confirm(`Confirma aplicar o planejamento da ${sourceWeek} na escala da ${targetWeek}?`)) return;

            try {
                // 1. Busca o planejamento da semana atual
                const { data: planData, error } = await supabaseClient
                    .from('planejamento_semanal')
                    .select('*')
                    .eq('semana_nome', sourceWeek)
                    .eq('filial', getFilialEscala());

                if (error) throw error;
                if (!planData || planData.length === 0) {
                    alert('O planejamento desta semana está vazio.');
                    return;
                }

                const registrosModelo = [];
                const dias = ['DOMINGO', 'SEGUNDA', 'TERCA', 'QUARTA', 'QUINTA', 'SEXTA', 'SABADO'];

                // 2. Transforma o planejamento em registros de escala diária
                planData.forEach(row => {
                    dias.forEach(dia => {
                        const rota = row[`${dia.toLowerCase()}_rota`];
                        const status = row[`${dia.toLowerCase()}_status`];

                        // Só cria registro se houver rota ou status definido para o dia
                        if (rota || status) {
                            const dataEscala = CACHE_DATAS[targetWeek][dia].toISOString().split('T')[0];
                            registrosModelo.push({
                                semana_nome: targetWeek,
                                data_escala: dataEscala,
                                filial: getFilialEscala(),
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

                if (registrosModelo.length > 0) {
                    for (const registro of registrosModelo) {
                        const placaModelo = normalizeVehiclePlate(registro.placa);
                        if (!placaModelo) continue;

                        const { data: existentes, error: selectError } = await supabaseClient
                            .from('escala')
                            .select('id, placa')
                            .eq('data_escala', registro.data_escala)
                            .eq('filial', getFilialEscala());

                        if (selectError) throw selectError;

                        const idsExistentes = (existentes || [])
                            .filter(item => normalizeVehiclePlate(item.placa) === placaModelo)
                            .map(item => item.id);

                        if (idsExistentes.length > 0) {
                            const { error: updateError } = await supabaseClient
                                .from('escala')
                                .update(comAuditoria(registro))
                                .in('id', idsExistentes);
                            if (updateError) throw updateError;
                        } else {
                            const { error: insertError } = await supabaseClient
                                .from('escala')
                                .insert([comAuditoria(registro)]);
                            if (insertError) throw insertError;
                        }
                    }
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
    function montarPayloadPlanejamentoModelo(row, semanaDestino) {
        const campos = [
            'placa', 'modelo', 'tipo',
            'domingo_rota', 'domingo_status',
            'segunda_rota', 'segunda_status',
            'terca_rota', 'terca_status',
            'quarta_rota', 'quarta_status',
            'quinta_rota', 'quinta_status',
            'sexta_rota', 'sexta_status',
            'sabado_rota', 'sabado_status',
            'motorista', 'auxiliar', 'terceiro'
        ];

        const payload = {
            semana_nome: semanaDestino,
            filial: getFilialEscala()
        };
        campos.forEach(campo => {
            payload[campo] = row[campo] || null;
        });
        return payload;
    }

    async function copiarModeloPlanejamentoParaSemana() {
        const semanaDestino = selectSemana.value;
        if (!semanaDestino) return alert('Selecione uma semana.');
        if (isSemanaModeloPlanejamento(semanaDestino)) return alert('Selecione a semana que deve receber o modelo.');
        if (!exigirFilialEscala()) return;

        try {
            const { data: modelo, error } = await supabaseClient
                .from('planejamento_semanal')
                .select('*')
                .eq('semana_nome', SEMANA_MODELO_PLANEJAMENTO)
                .eq('filial', getFilialEscala())
                .order('id');

            if (error) throw error;
            if (!modelo || modelo.length === 0) {
                alert('A Semana Padrao - Modelo ainda nao possui planejamento cadastrado.');
                return;
            }

            if (!confirm(`Copiar a Semana Padrao - Modelo para ${semanaDestino}? O planejamento atual desta semana sera substituido.`)) return;

            const { error: deleteError } = await aplicarFiltroFilial(
                supabaseClient
                    .from('planejamento_semanal')
                    .delete()
                    .eq('semana_nome', semanaDestino)
            );
            if (deleteError) throw deleteError;

            const payloads = modelo.map(row => comAuditoria(montarPayloadPlanejamentoModelo(row, semanaDestino)));
            const { error: insertError } = await supabaseClient
                .from('planejamento_semanal')
                .insert(payloads);

            if (insertError) throw insertError;

            await carregarPlanejamento(semanaDestino);
            alert('Planejamento preenchido com o modelo com sucesso.');
        } catch (err) {
            console.error('Erro ao copiar modelo de planejamento:', err);
            alert('Erro ao copiar modelo de planejamento: ' + err.message);
        }
    }

    const btnCopiarModeloPlanejamento = document.getElementById('btnCopiarModeloPlanejamento');
    if (btnCopiarModeloPlanejamento) {
        btnCopiarModeloPlanejamento.addEventListener('click', copiarModeloPlanejamentoParaSemana);
    }

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
                    <label><input type="checkbox" class="pdf-section-chk" value="VEICULOS"> VEICULOS</label>
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

    function isSemanaModeloPlanejamento(semana) {
        return semana === SEMANA_MODELO_PLANEJAMENTO;
    }

    function getSemanaModeloDatasStorageKey() {
        const filial = normalizeString(getFilialEscala()).replace(/[^A-Z0-9]+/g, '_') || 'SEM_FILIAL';
        return `${SEMANA_MODELO_DATAS_KEY}_${filial}`;
    }

    function aplicarFiltroSemanaModelo(query, semana) {
        return isSemanaModeloPlanejamento(semana)
            ? query.eq('semana_nome', SEMANA_MODELO_PLANEJAMENTO)
            : query;
    }

    function getDataTecnicaSemanaModelo(dia) {
        const index = IMPORT_DAYS.indexOf(dia);
        if (index < 0) return null;
        const base = new Date(Date.UTC(2025, 11, 28)); // domingo tecnico da semana modelo
        return addDays(base, index);
    }

    function dateFromISO(dataISO) {
        const value = String(dataISO || '').slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
        const [year, month, day] = value.split('-').map(Number);
        return new Date(Date.UTC(year, month - 1, day));
    }

    function salvarDatasSemanaModelo(datasPorDia) {
        const datas = {};
        IMPORT_DAYS.forEach(dia => {
            const dataObj = datasPorDia?.[dia];
            if (dataObj instanceof Date && !Number.isNaN(dataObj.getTime())) {
                datas[dia] = dataObj.toISOString().split('T')[0];
            }
        });

        if (Object.keys(datas).length === 0) return;
        CACHE_DATAS[SEMANA_MODELO_PLANEJAMENTO] = {};
        Object.entries(datas).forEach(([dia, dataISO]) => {
            CACHE_DATAS[SEMANA_MODELO_PLANEJAMENTO][dia] = dateFromISO(dataISO);
        });
        localStorage.setItem(getSemanaModeloDatasStorageKey(), JSON.stringify(datas));
    }

    function carregarDatasSemanaModeloLocal() {
        try {
            const raw = localStorage.getItem(getSemanaModeloDatasStorageKey());
            if (!raw) return false;
            const datas = JSON.parse(raw);
            const cache = {};
            Object.entries(datas || {}).forEach(([dia, dataISO]) => {
                const dataObj = dateFromISO(dataISO);
                if (dataObj) cache[dia] = dataObj;
            });
            if (Object.keys(cache).length === 0) return false;
            CACHE_DATAS[SEMANA_MODELO_PLANEJAMENTO] = cache;
            return true;
        } catch (error) {
            console.warn('Datas da semana modelo nao carregadas:', error);
            return false;
        }
    }

    function getDataSemanaDia(semana, dia) {
        if (isSemanaModeloPlanejamento(semana)) {
            return getDataTecnicaSemanaModelo(dia) || new Date();
        }
        return CACHE_DATAS[semana]?.[dia] || new Date();
    }

    function getDataSemanaDiaOuNulo(semana, dia) {
        if (isSemanaModeloPlanejamento(semana)) {
            return getDataTecnicaSemanaModelo(dia) || null;
        }
        return CACHE_DATAS[semana]?.[dia] || null;
    }

    function getDiaNomeAba(dia) {
        return {
            DOMINGO: 'DOMINGO',
            SEGUNDA: 'SEGUNDA',
            TERCA: 'TERÇA',
            QUARTA: 'QUARTA',
            QUINTA: 'QUINTA',
            SEXTA: 'SEXTA',
            SABADO: 'SÁBADO'
        }[dia] || dia;
    }

    function atualizarDatasAbasEscala(semana = selectSemana?.value) {
        const dadosSemana = CACHE_DATAS[semana];
        tabButtons.forEach(btn => {
            const dia = btn.dataset.dia;
            if (!dia) return;

            const date = isSemanaModeloPlanejamento(semana)
                ? getDataSemanaDiaOuNulo(semana, dia)
                : dadosSemana?.[dia] || getDataSemanaDiaOuNulo(semana, dia);
            const dateText = date ? date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'UTC' }) : '';
            btn.innerHTML = `${getDiaNomeAba(dia)}${dateText ? ` <span class="tab-date">${dateText}</span>` : ''}`;
        });
    }

    async function carregarDatasSemanaModeloBanco() {
        if (!getFilialEscala()) return false;

        const { data, error } = await aplicarFiltroFilial(
            supabaseClient
                .from('escala')
                .select('id, data_escala, ultima_alteracao_em')
                .eq('semana_nome', SEMANA_MODELO_PLANEJAMENTO)
        )
            .order('ultima_alteracao_em', { ascending: false, nullsFirst: false })
            .order('id', { ascending: false });

        if (error) {
            console.warn('Datas da semana modelo nao carregadas do banco:', error);
            return false;
        }

        const datasPorDia = {};
        (data || []).forEach(row => {
            const dataObj = dateFromISO(row.data_escala);
            if (!dataObj) return;
            const dia = IMPORT_DAYS[dataObj.getUTCDay()];
            if (dia && !datasPorDia[dia]) datasPorDia[dia] = dataObj;
        });

        if (Object.keys(datasPorDia).length === 0) return carregarDatasSemanaModeloLocal();
        salvarDatasSemanaModelo(datasPorDia);
        return true;
    }

    async function limparDatasAntigasDiaSemanaModelo(dia, dataISOAtual) {
        if (!dia || !dataISOAtual || !isSemanaModeloPlanejamento(selectSemana?.value)) return;

        const { data, error } = await aplicarFiltroFilial(
            supabaseClient
                .from('escala')
                .select('data_escala')
                .eq('semana_nome', SEMANA_MODELO_PLANEJAMENTO)
        );

        if (error) throw error;

        const datasAntigas = [...new Set((data || [])
            .map(row => String(row.data_escala || '').slice(0, 10))
            .filter(dataISO => {
                if (!dataISO || dataISO === dataISOAtual) return false;
                const dataObj = dateFromISO(dataISO);
                return dataObj && IMPORT_DAYS[dataObj.getUTCDay()] === dia;
            }))];

        if (datasAntigas.length === 0) return;

        const { error: deleteEscalaError } = await aplicarFiltroFilial(
            supabaseClient
                .from('escala')
                .delete()
                .eq('semana_nome', SEMANA_MODELO_PLANEJAMENTO)
                .in('data_escala', datasAntigas)
        );
        if (deleteEscalaError) throw deleteEscalaError;

        const { error: deleteFaltasError } = await aplicarFiltroFilial(
            supabaseClient
                .from('faltas_afastamentos')
                .delete()
                .eq('semana_nome', SEMANA_MODELO_PLANEJAMENTO)
                .in('data_escala', datasAntigas)
        );
        if (deleteFaltasError) throw deleteFaltasError;
    }

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
        carregarDatasSemanaModeloLocal();
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
                input.classList.remove('cell-duplicate');
                if (input.title === 'Registro repetido') input.removeAttribute('title');

                const val = input.dataset.key === 'placa'
                    ? normalizeVehiclePlate(input.value)
                    : normalizeString(input.value);
                if (val) {
                    if (!valuesMap.has(val)) valuesMap.set(val, []);
                    valuesMap.get(val).push(input);
                }
            });

            valuesMap.forEach((elements) => {
                if (elements.length > 1) {
                    elements.forEach(el => {
                        el.style.removeProperty('background-color');
                        el.style.removeProperty('color');
                        el.style.removeProperty('font-weight');
                        el.classList.add('cell-duplicate');
                        el.title = 'Registro repetido';
                    });
                }
            });
        });
    }

    async function adicionarLinhaManual(section) {
        if (!exigirGerenciamentoEscala()) return;
        const semana = selectSemana.value;
        const dia = document.querySelector('.tab-btn.active')?.dataset.dia;
        if (!semana || !dia) return;
        if (!exigirFilialEscala()) return;

        const dataObj = getDataSemanaDia(semana, dia);
        const dataISO = dataObj.toISOString().split('T')[0];
        const config = SECAO_PARA_DB[section];

        const payload = comAuditoria({
            semana_nome: semana,
            data_escala: dataISO,
            filial: getFilialEscala()
        });

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
        tituloDia.style.display = 'flex';
        tituloDia.style.alignItems = 'center';
        tituloDia.style.gap = '10px';
        tituloDia.style.flexWrap = 'wrap';

        const dataObj = getDataSemanaDiaOuNulo(semana, dia);
        const formattedDate = dataObj
            ? dataObj.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' })
            : '';
        const diaNome = dia === 'TERCA' ? 'TERÇA' : dia;

        tituloDia.innerHTML = `
            <span><i class="fa-solid fa-calendar-day"></i> ${diaNome}${formattedDate ? ` - ${formattedDate}` : ''}</span>
            <input type="file" id="fileImportarDia" accept=".xlsx, .xls" style="display: none;">
            <button id="btnCopiarDia" class="btn-primary" style="padding: 4px 10px; border-radius: 4px; border: none; cursor: pointer; font-size: 0.8em; background-color: #17a2b8; color: white;" title="Copiar Escala">
                <i class="fa-solid fa-copy"></i>
            </button>
            <input type="file" id="fileAtualizarDiaSemana" accept=".xlsx, .xls" style="display: none;">
            <button id="btnAtualizarDiaSemana" class="btn-primary" style="padding: 4px 10px; border-radius: 4px; border: none; cursor: pointer; font-size: 0.8em; background-color: #0d6efd; color: white;" title="Atualizar este dia pela planilha da semana">
                <i class="fa-solid fa-file-import"></i>
            </button>
            <span class="day-search-wrap">
                <i class="fa-solid fa-search"></i>
                <input type="text" id="buscaDiaEscala" class="glass-input day-search-input" placeholder="Buscar placa, rota, motorista...">
            </span>`;
        aplicarRestricoesNivelEscala();
    }

    async function carregarDadosDia(dia, semana) {
        const sections = Object.keys(SECAO_PARA_DB);
        sections.forEach(sec => {
            const tbody = document.getElementById(`tbody${sec}`);
            const colspan = sec === 'Faltas' ? 6 : 9;
            if(tbody) tbody.innerHTML = `<tr><td colspan="${colspan}" style="text-align: center;">Carregando...</td></tr>`;
        });

        const dataObj = getDataSemanaDia(semana, dia);
        const dataISO = dataObj.toISOString().split('T')[0];

        try {
            // Busca dados das duas tabelas em paralelo
            const [resEscala, resFaltas] = await Promise.all([
                aplicarFiltroSemanaModelo(
                    aplicarFiltroFilial(supabaseClient.from('escala').select('*').eq('data_escala', dataISO)),
                    semana
                ).order('id'),
                aplicarFiltroSemanaModelo(
                    aplicarFiltroFilial(supabaseClient.from('faltas_afastamentos').select('*').eq('data_escala', dataISO)),
                    semana
                ).order('id')
            ]);

            if (resEscala.error) throw resEscala.error;
            if (resFaltas.error) throw resFaltas.error;

            const dadosEscala = (resEscala.data || []).filter(item => !isPlacaVeiculoOcultaEscala(item.placa));
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
                        tr.dataset.placa = item.placa || '';

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
            filtrarDiaEscala();
            applyCellAnnotations();
            aplicarModoVisualizacaoEscala();
            carregarUltimaAuditoriaEscala({ semana, dia });

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
            const input = target.closest('input.table-input') || target.closest('td')?.querySelector('input.table-input');
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

                const key = input.dataset.key;
                let menuHTML = `
                    <div class="context-menu-item" onclick="triggerCellColorPicker()"><i class="fas fa-fill-drip" style="margin-right: 8px; color: #e83e8c;"></i>${text}</div>
                    <div class="context-menu-item" onclick="resetCellColor()"><i class="fas fa-eraser" style="margin-right: 8px; color: #dc3545;"></i>Limpar Cor Célula</div>
                `;

                // Opção específica para preencher Peso de Rota ao clicar na coluna ROTA
                if (key === 'rota' && input.value.trim() !== '') {
                    const rota = input.value.trim();
                    const placa = tr.querySelector('input[data-key="placa"]')?.value || '';
                    const modelo = tr.querySelector('input[data-key="modelo"]')?.value || '';
                    const motorista = tr.querySelector('input[data-key="motorista"]')?.value || '';
                    const auxiliar = tr.querySelector('input[data-key="auxiliar"]')?.value || '';

                    menuHTML += `<div class="context-menu-item-separator" style="border-bottom:1px solid #eee; margin: 4px 0;"></div>`;
                    menuHTML += `<div class="context-menu-item" data-action="preencherPesoRota" data-rota="${rota}" data-placa="${placa}" data-modelo="${modelo}" data-motorista="${motorista}" data-auxiliar="${auxiliar}">
                        <i class="fas fa-weight-hanging" style="margin-right: 8px; color: #ffc107;"></i>Preencher Peso de Rota (${rota})
                    </div>`;
                }

                // Adiciona opção de Boleta se aplicável
                if (NOTE_FIELDS.includes(key)) {
                    const note = getCellNote(tr.dataset.tabela, tr.dataset.id, key);
                    menuHTML += `<div class="context-menu-item-separator" style="border-bottom:1px solid #eee; margin: 4px 0;"></div>`;
                    menuHTML += `<div class="context-menu-item" data-action="editarAnotacao"><i class="fas fa-note-sticky" style="margin-right: 8px; color: #198754;"></i>${note ? 'Editar Anotacao' : 'Incluir Anotacao'}</div>`;
                    if (note) {
                        menuHTML += `<div class="context-menu-item" data-action="excluirAnotacao"><i class="fas fa-trash-can" style="margin-right: 8px; color: #dc3545;"></i>Excluir Anotacao</div>`;
                    }
                }

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

                const itemPesoRota = contextMenu.querySelector('[data-action="preencherPesoRota"]');
                if(itemPesoRota) {
                    itemPesoRota.addEventListener('click', () => {
                        abrirModalPesoRotaComDados(itemPesoRota.dataset.rota, itemPesoRota.dataset.placa, itemPesoRota.dataset.modelo, itemPesoRota.dataset.motorista, itemPesoRota.dataset.auxiliar);
                        contextMenu.style.display = 'none';
                    });
                }

                const itemEditarAnotacao = contextMenu.querySelector('[data-action="editarAnotacao"]');
                if (itemEditarAnotacao) {
                    itemEditarAnotacao.addEventListener('click', () => {
                        const atual = getCellNote(currentCellTarget.tabela, currentCellTarget.id, currentCellTarget.key);
                        const anotacao = prompt('Anotacao da celula:', atual);
                        if (anotacao !== null) {
                            setCellNote(currentCellTarget.tabela, currentCellTarget.id, currentCellTarget.key, anotacao);
                            applyCellAnnotations();
                        }
                        contextMenu.style.display = 'none';
                    });
                }

                const itemExcluirAnotacao = contextMenu.querySelector('[data-action="excluirAnotacao"]');
                if (itemExcluirAnotacao) {
                    itemExcluirAnotacao.addEventListener('click', () => {
                        if (confirm('Excluir a anotacao desta celula?')) {
                            setCellNote(currentCellTarget.tabela, currentCellTarget.id, currentCellTarget.key, '');
                            applyCellAnnotations();
                        }
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
                if (!exigirGerenciamentoEscala()) return;
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
        if (!exigirGerenciamentoEscala()) return;
        const target = e.target;
        const tr = target.closest('tr');
        if (!tr || !tr.dataset.id) return;

        const id = tr.dataset.id;
        const tabela = tr.dataset.tabela;
        const key = target.dataset.key;
        const placaAnterior = tr.dataset.placa || '';
        
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
                if (tabela === 'planejamento_semanal') {
                    extraUpdates.tipo = veiculoEncontrado.tipo || '';
                    const inputTipo = tr.querySelector('input[data-key="tipo"]');
                    if (inputTipo) inputTipo.value = veiculoEncontrado.tipo || '';
                }
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
            const auditPayload = comAuditoria({ [key]: valor, ...extraUpdates });
            const { error } = await supabaseClient
                .from(tabela)
                .update(auditPayload)
                .eq('id', id);

            if (error) throw error;

            if (tabela === 'planejamento_semanal') {
                await sincronizarPlanejamentoParaEscala(id, key, placaAnterior);
                verificarDuplicidades();
            }

            if (key === 'placa') {
                tr.dataset.placa = normalizeVehiclePlate(valor);
            }

            if (statusIndicator) {
                statusIndicator.innerHTML = '<span class="status-saved"><i class="fas fa-check"></i> Salvo</span>';
                setTimeout(() => statusIndicator.innerHTML = '', 2000);
            }
            atualizarInfoAuditoria(auditPayload);
        } catch (err) {
            console.error('Erro ao salvar:', err);
            if (statusIndicator) statusIndicator.innerHTML = '<span class="status-error"><i class="fas fa-times"></i> Erro</span>';
        }
    }

    function abrirModalCopia() {
        const semanaAtual = selectSemana.value;
        const diaAtual = document.querySelector('.tab-btn.active')?.dataset.dia;
        if (!semanaAtual || !diaAtual) return;

        const dataObj = getDataSemanaDia(semanaAtual, diaAtual);
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
            if (!exigirFilialEscala()) return;

            const dataOrigem = getDataSemanaDia(semanaAtual, diaAtual).toISOString().split('T')[0];
            
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
                aplicarFiltroSemanaModelo(
                    aplicarFiltroFilial(supabaseClient.from('escala').select('*').eq('data_escala', dataOrigem)),
                    semanaAtual
                ),
                aplicarFiltroSemanaModelo(
                    aplicarFiltroFilial(supabaseClient.from('faltas_afastamentos').select('*').eq('data_escala', dataOrigem)),
                    semanaAtual
                )
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
                data_escala: dataDestino,
                filial: getFilialEscala()
            }));
            
            const novosFaltas = resFaltas.data.map(({ id, created_at, updated_at, ...rest }) => ({
                ...rest,
                semana_nome: semanaDestino,
                data_escala: dataDestino,
                filial: getFilialEscala()
            }));

            // 3. Insere
            if (novosEscala.length > 0) {
                const { error } = await supabaseClient.from('escala').insert(novosEscala.map(item => comAuditoria(item)));
                if (error) throw error;
            }
            if (novosFaltas.length > 0) {
                const { error } = await supabaseClient.from('faltas_afastamentos').insert(novosFaltas.map(item => comAuditoria(item)));
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
            const dataISO = getDataSemanaDia(semana, dia).toISOString().split('T')[0];

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
                if (insertsEscala.length > 0) await supabaseClient.from('escala').insert(insertsEscala.map(item => comAuditoria(item)));
                if (insertsFaltas.length > 0) await supabaseClient.from('faltas_afastamentos').insert(insertsFaltas.map(item => comAuditoria({ ...item, filial: getFilialEscala() })));
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

        const readerDiario = new FileReader();
        readerDiario.onload = async (evt) => {
            try {
                const data = new Uint8Array(evt.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const parsed = parsePlanejamentoPorAbasDiarias(workbook, semana);

                if (parsed.inserts.length === 0) {
                    throw new Error('Nao foram encontrados dados validos nas abas diarias (ex: Segunda 01/01/2025, Terca 02/01/2025).');
                }

                if (confirm(`Deseja importar o planejamento consolidado de ${parsed.inserts.length} registros para a ${semana}?`)) {
                    const { error } = await supabaseClient
                        .from('planejamento_semanal')
                        .insert(parsed.inserts.map(item => comAuditoria(item)));
                    if (error) throw error;
                    alert('Planejamento semanal importado com sucesso!');
                    carregarPlanejamento(semana);
                }
            } catch (err) {
                console.error(err);
                alert('Erro na importacao: ' + err.message);
            }
            e.target.value = '';
        };
        readerDiario.readAsArrayBuffer(file);
        return;

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
                                    filial: getFilialEscala(),
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
                        const { error } = await supabaseClient.from('planejamento_semanal').insert(inserts.map(item => comAuditoria(item)));
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
    const DIA_KEY_MAP = {
        DOMINGO: 'domingo',
        SEGUNDA: 'segunda',
        TERCA: 'terca',
        QUARTA: 'quarta',
        QUINTA: 'quinta',
        SEXTA: 'sexta',
        SABADO: 'sabado'
    };

    function getDiaFromSheetName(sheetName) {
        const normalized = normalizeString(sheetName);
        return IMPORT_DAYS.find(dia => normalized === dia || normalized.startsWith(`${dia} `)) || null;
    }

    function parsePlanejamentoPorAbasDiarias(workbook, semana) {
        const consolidado = new Map();
        const abasDiarias = workbook.SheetNames
            .map(sheetName => ({ sheetName, dia: getDiaFromSheetName(sheetName) }))
            .filter(item => item.dia);

        const findHeaderIndex = (headers, terms) => headers.findIndex(header => terms.some(term => header.includes(term)));

        abasDiarias.forEach(({ sheetName, dia }) => {
            const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '', raw: false });
            const headerRowIndex = rows.findIndex(row => {
                const headers = (row || []).map(normalizeString);
                return headers.some(header => header.includes('PLACA'))
                    && headers.some(header => header.includes('ROTA'))
                    && headers.some(header => header.includes('MOTORISTA'));
            });

            if (headerRowIndex < 0) return;

            const headers = rows[headerRowIndex].map(normalizeString);
            const placaIndex = findHeaderIndex(headers, ['PLACA', 'VEICULO', 'CAMINHAO', 'CARRO']);
            const modeloIndex = findHeaderIndex(headers, ['MODELO']);
            const motoristaIndex = findHeaderIndex(headers, ['MOTORISTA', 'CONDUTOR', 'CHOFER']);
            const auxiliarIndex = findHeaderIndex(headers, ['AUXILIAR', 'AJUDANTE', 'APOIO']);
            const terceiroIndex = findHeaderIndex(headers, ['TERCEIRO', 'TERCEIRA', 'TERCEIR']);
            const rotaIndex = findHeaderIndex(headers, ['ROTA']);
            const statusIndex = findHeaderIndex(headers, ['STATUS', 'STAT']);

            rows.slice(headerRowIndex + 1).forEach(rawRow => {
                const placaModelo = placaIndex >= 0 ? cleanImportValue(rawRow[placaIndex]).toUpperCase() : '';
                const split = splitPlacaModelo(placaModelo);
                const placa = split.placa || placaModelo;
                const modelo = modeloIndex >= 0
                    ? cleanImportValue(rawRow[modeloIndex])
                    : split.modelo;
                const motorista = motoristaIndex >= 0 ? cleanImportValue(rawRow[motoristaIndex]) : '';
                const auxiliar = auxiliarIndex >= 0 ? cleanImportValue(rawRow[auxiliarIndex]) : '';
                const terceiro = terceiroIndex >= 0 ? cleanImportValue(rawRow[terceiroIndex]) : '';
                const rota = rotaIndex >= 0 ? cleanImportValue(rawRow[rotaIndex], { keepZero: true }) : '';
                const statusRaw = statusIndex >= 0 ? cleanImportValue(rawRow[statusIndex], { keepZero: true }) : '';
                const status = statusRaw === '0' ? '' : statusRaw;

                if (!placa && !motorista && !auxiliar && !terceiro && !rota && !status) return;

                const chave = normalizeVehiclePlate(placa)
                    || normalizeString([motorista, auxiliar, terceiro, modelo].filter(Boolean).join('|'));
                if (!chave) return;

                if (!consolidado.has(chave)) {
                    consolidado.set(chave, {
                        semana_nome: semana,
                        filial: getFilialEscala(),
                        placa,
                        modelo,
                        motorista,
                        auxiliar,
                        terceiro
                    });
                }

                const item = consolidado.get(chave);
                if (!item.placa && placa) item.placa = placa;
                if (!item.modelo && modelo) item.modelo = modelo;
                if (!item.motorista && motorista) item.motorista = motorista;
                if (!item.auxiliar && auxiliar) item.auxiliar = auxiliar;
                if (!item.terceiro && terceiro) item.terceiro = terceiro;

                const diaKey = DIA_KEY_MAP[dia];
                item[`${diaKey}_rota`] = rota;
                item[`${diaKey}_status`] = status;
            });
        });

        return {
            abas: abasDiarias.map(item => item.sheetName),
            inserts: Array.from(consolidado.values())
        };
    }

    function getDiaByDataEscala(semana, dataISO) {
        if (!dataISO) return null;
        if (isSemanaModeloPlanejamento(semana)) {
            const dataObj = dateFromISO(dataISO);
            return dataObj ? IMPORT_DAYS[dataObj.getUTCDay()] : null;
        }
        const datas = CACHE_DATAS[semana];
        if (!datas) return null;
        const dataNormalizada = String(dataISO).slice(0, 10);
        return IMPORT_DAYS.find(dia => datas[dia]?.toISOString().split('T')[0] === dataNormalizada) || null;
    }

    function getDatasSemanaISO(semana) {
        if (isSemanaModeloPlanejamento(semana)) {
            return IMPORT_DAYS.map(dia => getDataSemanaDia(semana, dia)?.toISOString().split('T')[0]).filter(Boolean);
        }
        const datas = CACHE_DATAS[semana];
        if (!datas) return [];
        return IMPORT_DAYS.map(dia => datas[dia]?.toISOString().split('T')[0]).filter(Boolean);
    }

    function getDatasDiasISO(semana, dias) {
        if (isSemanaModeloPlanejamento(semana)) {
            return dias.map(dia => getDataSemanaDia(semana, dia)?.toISOString().split('T')[0]).filter(Boolean);
        }
        const datas = CACHE_DATAS[semana];
        if (!datas) return [];
        return dias.map(dia => datas[dia]?.toISOString().split('T')[0]).filter(Boolean);
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

    function getTipoVisualByPlaca(placa) {
        const placaBusca = normalizeVehiclePlate(placa);
        const veiculo = listaVeiculos.find(v => v.placa_normalizada === placaBusca || normalizeVehiclePlate(v.placa) === placaBusca);
        return veiculo ? cleanImportValue(veiculo.tipo) : '';
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

            insertsEscala.push(comAuditoria({
                semana_nome: semana,
                data_escala: dataISO,
                filial: getFilialEscala(),
                tipo_escala: currentSection,
                placa,
                modelo: modeloVisual,
                rota,
                status,
                motorista,
                auxiliar,
                terceiro
            }));
        }

        return { dataISO, insertsEscala, insertsFaltas };
    }

    function aplicarDataRoteiroParsed(parsed, semana, dataISO) {
        if (!parsed || !dataISO) return parsed;
        parsed.dataISO = dataISO;
        parsed.insertsEscala.forEach(item => {
            item.semana_nome = semana;
            item.data_escala = dataISO;
        });
        parsed.insertsFaltas.forEach(item => {
            item.semana_nome = semana;
            item.data_escala = dataISO;
        });
        return parsed;
    }

    async function importarRoteiroDiario(workbook, sheetName, semana, diaParaRecarregar = null, dataISOOverride = '') {
        if (!exigirFilialEscala()) return 0;
        const parsed = parseRoteiroSheet(workbook, sheetName, semana);
        if (!parsed) {
            throw new Error(`Falha ao processar a aba ${sheetName}.`);
        }
        aplicarDataRoteiroParsed(parsed, semana, dataISOOverride);
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
            const { error } = await supabaseClient.from('faltas_afastamentos').insert(parsed.insertsFaltas.map(item => comAuditoria({ ...item, filial: getFilialEscala() })));
            if (error) throw error;
        }

        if (diaParaRecarregar) carregarDadosDia(diaParaRecarregar, semana);
        return total;
    }

    async function substituirRoteiroDia(parsed, semana, dia, dataISOOverride = '') {
        const dataISO = isSemanaModeloPlanejamento(semana)
            ? getDataSemanaDia(semana, dia).toISOString().split('T')[0]
            : dataISOOverride || CACHE_DATAS[semana]?.[dia]?.toISOString().split('T')[0];
        if (!dataISO) throw new Error('Nao foi possivel identificar a data do dia aberto.');
        if (!isSemanaModeloPlanejamento(semana) && parsed.dataISO !== dataISO) {
            throw new Error(`A data da planilha (${parsed.dataISO || 'nao identificada'}) nao confere com o dia aberto (${dataISO}).`);
        }
        if (isSemanaModeloPlanejamento(semana)) {
            aplicarDataRoteiroParsed(parsed, semana, dataISO);
        }

        if (isSemanaModeloPlanejamento(semana)) {
            salvarDatasSemanaModelo({
                ...(CACHE_DATAS[semana] || {}),
                [dia]: dateFromISO(dataISO)
            });
            await limparDatasAntigasDiaSemanaModelo(dia, dataISO);
        }

        const diaDaData = getDiaByDataEscala(semana, parsed.dataISO);
        if (diaDaData !== dia) {
            throw new Error('A data encontrada na planilha nao pertence ao dia selecionado dentro da semana aberta.');
        }

        const total = parsed.insertsEscala.length + parsed.insertsFaltas.length;
        if (total === 0) {
            throw new Error('Nenhum registro valido encontrado para atualizar este dia.');
        }

        await aplicarFiltroSemanaModelo(
            aplicarFiltroFilial(supabaseClient.from('escala').delete().eq('data_escala', dataISO)),
            semana
        );
        await aplicarFiltroSemanaModelo(
            aplicarFiltroFilial(supabaseClient.from('faltas_afastamentos').delete().eq('data_escala', dataISO)),
            semana
        );

        if (parsed.insertsEscala.length > 0) {
            const { error } = await supabaseClient.from('escala').insert(parsed.insertsEscala);
            if (error) throw error;
        }

        if (parsed.insertsFaltas.length > 0) {
            const { error } = await supabaseClient.from('faltas_afastamentos').insert(parsed.insertsFaltas.map(item => comAuditoria({ ...item, filial: getFilialEscala() })));
            if (error) throw error;
        }

        carregarDadosDia(dia, semana);
        return total;
    }

    async function atualizarDiaPorPlanilhaSemana(e) {
        const file = e.target.files[0];
        if (!file) return;

        const semana = selectSemana.value;
        const dia = document.querySelector('.tab-btn.active')?.dataset.dia;
        if (!semana || !dia) {
            e.target.value = '';
            return alert('Selecione uma semana e um dia antes de importar.');
        }
        if (!exigirFilialEscala()) {
            e.target.value = '';
            return;
        }

        let dataISO = isSemanaModeloPlanejamento(semana)
            ? getDataSemanaDia(semana, dia).toISOString().split('T')[0]
            : CACHE_DATAS[semana]?.[dia]?.toISOString().split('T')[0];
        if (!dataISO && isSemanaModeloPlanejamento(semana)) {
            await carregarDatasSemanaModeloBanco();
            dataISO = getDataSemanaDia(semana, dia).toISOString().split('T')[0];
        }

        const reader = new FileReader();
        reader.onload = async (evt) => {
            const importModal = document.getElementById('importProgressModal');
            const progressBar = document.getElementById('importProgressBar');
            const progressText = document.getElementById('importProgressText');
            const progressDetails = document.getElementById('importProgressDetails');

            try {
                importModal.classList.remove('hidden');
                progressBar.style.width = '20%';
                progressText.textContent = 'Processando: 20%';
                progressDetails.textContent = 'Lendo arquivo Excel...';

                const data = new Uint8Array(evt.target.result);
                const workbook = XLSX.read(data, { type: 'array', cellDates: false });

                progressBar.style.width = '45%';
                progressText.textContent = 'Processando: 45%';
                progressDetails.textContent = 'Localizando a data do dia aberto...';

                const abasParseadas = workbook.SheetNames
                    .map(sheetName => {
                        const parsed = parseRoteiroSheet(workbook, sheetName, semana);
                        const diaAba = getDiaFromSheetName(sheetName);
                        return parsed ? { sheetName, dia: diaAba, parsed } : null;
                    })
                    .filter(Boolean);

                if (isSemanaModeloPlanejamento(semana)) {
                    dataISO = getDataSemanaDia(semana, dia).toISOString().split('T')[0];
                }

                if (!dataISO) {
                    throw new Error('Nao foi possivel identificar a data do dia aberto.');
                }

                const candidatos = isSemanaModeloPlanejamento(semana)
                    ? abasParseadas.filter(item => item.dia === dia)
                    : abasParseadas.filter(item => item.parsed.dataISO === dataISO);

                if (candidatos.length === 0) {
                    throw new Error(isSemanaModeloPlanejamento(semana)
                        ? `Nenhuma aba da planilha corresponde ao dia ${dia}.`
                        : `Nenhuma aba da planilha possui a data ${dataISO} em G4.`);
                }

                const candidatoDoDia = candidatos.find(item => getDiaFromSheetName(item.sheetName) === dia) || candidatos[0];
                const total = candidatoDoDia.parsed.insertsEscala.length + candidatoDoDia.parsed.insertsFaltas.length;

                importModal.classList.add('hidden');
                if (!confirm(`Atualizar somente ${dia} (${dataISO}) com ${total} registros da aba ${candidatoDoDia.sheetName}?\n\nOs dados atuais deste dia serao substituidos.`)) return;

                importModal.classList.remove('hidden');
                progressBar.style.width = '80%';
                progressText.textContent = 'Processando: 80%';
                progressDetails.textContent = 'Atualizando o dia selecionado...';

                const totalAtualizado = await substituirRoteiroDia(candidatoDoDia.parsed, semana, dia, dataISO);
                atualizarDatasAbasEscala(semana);

                progressBar.style.width = '100%';
                progressText.textContent = 'Processando: 100%';
                progressDetails.textContent = 'Atualizacao concluida.';

                await new Promise(resolve => setTimeout(resolve, 500));
                alert(`Atualizacao concluida: ${totalAtualizado} registros importados para ${dia}.`);
            } catch (err) {
                console.error('Erro ao atualizar dia pela planilha semanal:', err);
                alert('Erro ao atualizar dia: ' + err.message);
            } finally {
                importModal.classList.add('hidden');
                e.target.value = '';
            }
        };
        reader.readAsArrayBuffer(file);
    }

    async function importarRoteiroSemana(e) {
        const file = e.target.files[0];
        if (!file) return;

        const semana = selectSemana.value;
        if (!semana) return alert('Selecione uma semana antes de importar.');
        if (!exigirFilialEscala()) return;

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
                const diasImportados = [...new Set(sheetsDias.map(item => item.dia))];
                if (isSemanaModeloPlanejamento(semana)) {
                    delete CACHE_DATAS[SEMANA_MODELO_PLANEJAMENTO];
                    localStorage.removeItem(getSemanaModeloDatasStorageKey());
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
                    const { sheetName, dia } = sheetsDias[i];
                    const progress = 20 + Math.round((i / sheetsDias.length) * 70);
                    progressBar.style.width = `${progress}%`;
                    progressText.textContent = `Processando: ${progress}%`;
                    progressDetails.textContent = `Importando ${sheetName}...`;
                    if (isSemanaModeloPlanejamento(semana)) {
                        const parsed = parseRoteiroSheet(workbook, sheetName, semana);
                        const dataAlvoModelo = getDataSemanaDia(semana, dia).toISOString().split('T')[0];
                        totalImportado += await substituirRoteiroDia(parsed, semana, dia, dataAlvoModelo);
                        continue;
                    }
                    const dataAlvo = getDataSemanaDia(semana, dia).toISOString().split('T')[0];
                    totalImportado += await importarRoteiroDiario(workbook, sheetName, semana, null, dataAlvo);
                }

                progressDetails.textContent = 'Finalizando importacao...';
                if (isSemanaModeloPlanejamento(semana)) {
                    atualizarDatasAbasEscala(semana);
                    await sincronizarPlanejamentoDaSemana(semana, diasImportados);
                    carregarPlanejamento(semana);
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

    async function upsertPlanejamentoItem(item) {
        const placa = normalizeVehiclePlate(item.placa);
        if (!item.semana_nome || !placa) return;

        const payload = comAuditoria({
            ...item,
            filial: item.filial || getFilialEscala(),
            placa,
            modelo: getModeloVisualByPlaca(placa) || item.modelo || '',
            tipo: getTipoVisualByPlaca(placa) || item.tipo || ''
        });

        const { data: existentes, error: selectError } = await supabaseClient
            .from('planejamento_semanal')
            .select('id, placa')
            .eq('semana_nome', payload.semana_nome)
            .eq('filial', payload.filial);

        if (selectError) throw selectError;

        const existentesDaPlaca = (existentes || []).filter(row => normalizeVehiclePlate(row.placa) === placa);
        if (existentesDaPlaca.length > 0) {
            const ids = existentesDaPlaca.map(row => row.id);
            const { error } = await supabaseClient
                .from('planejamento_semanal')
                .update(payload)
                .in('id', ids);
            if (error) throw error;
            return;
        }

        const { error } = await supabaseClient
            .from('planejamento_semanal')
            .insert([payload]);
        if (error) throw error;
    }

    async function sincronizarEscalaParaPlanejamentoPorLinha(row) {
        if (!row || !row.semana_nome || !row.data_escala || !row.placa) return;

        const dia = getDiaByDataEscala(row.semana_nome, row.data_escala);
        const diaKey = DIA_KEY_MAP[dia];
        if (!diaKey) return;

        await upsertPlanejamentoItem({
            semana_nome: row.semana_nome,
            filial: row.filial || getFilialEscala(),
            placa: row.placa,
            modelo: row.modelo || '',
            tipo: row.tipo || getTipoVisualByPlaca(row.placa),
            motorista: row.motorista || '',
            auxiliar: row.auxiliar || '',
            terceiro: row.terceiro || '',
            [`${diaKey}_rota`]: row.rota || '',
            [`${diaKey}_status`]: row.status || ''
        });
    }

    async function sincronizarEscalaParaPlanejamento(id) {
        const { data, error } = await supabaseClient
            .from('escala')
            .select('*')
            .eq('id', id)
            .single();

        if (error) throw error;
        await sincronizarEscalaParaPlanejamentoPorLinha(data);
    }

    async function sincronizarPlanejamentoDaSemana(semana, diasPermitidos = null) {
        if (!semana) return;

        const diasSync = Array.isArray(diasPermitidos) && diasPermitidos.length > 0 ? diasPermitidos : IMPORT_DAYS;
        const datasSemana = getDatasDiasISO(semana, diasSync);
        if (datasSemana.length === 0) return 0;

        const data = [];
        const pageSize = 1000;
        for (let from = 0; ; from += pageSize) {
            const to = from + pageSize - 1;
            const query = supabaseClient
                .from('escala')
                .select('*')
                .eq('filial', getFilialEscala());

            const { data: pageData, error } = await (isSemanaModeloPlanejamento(semana)
                ? query.eq('semana_nome', SEMANA_MODELO_PLANEJAMENTO)
                : query.in('data_escala', datasSemana))
                .order('data_escala')
                .order('id')
                .range(from, to);

            if (error) throw error;
            data.push(...(pageData || []));
            if (!pageData || pageData.length < pageSize) break;
        }

        if (!data || data.length === 0) return 0;

        const mapa = new Map();
        data.filter(row => !isPlacaVeiculoOcultaEscala(row.placa)).forEach(row => {
            const placa = normalizeVehiclePlate(row.placa);
            if (!placa) return;

            if (!mapa.has(placa)) {
                mapa.set(placa, {
                    semana_nome: semana,
                    filial: getFilialEscala(),
                    placa,
                    modelo: row.modelo || '',
                    tipo: row.tipo || getTipoVisualByPlaca(placa),
                    motorista: row.motorista || '',
                    auxiliar: row.auxiliar || '',
                    terceiro: row.terceiro || ''
                });
            }

            const item = mapa.get(placa);
            if (!row.semana_nome || row.semana_nome !== semana) row.semana_nome = semana;
            if (!item.modelo && row.modelo) item.modelo = row.modelo;
            if (!item.tipo) item.tipo = row.tipo || getTipoVisualByPlaca(placa);
            if (!item.motorista && row.motorista) item.motorista = row.motorista;
            if (!item.auxiliar && row.auxiliar) item.auxiliar = row.auxiliar;
            if (!item.terceiro && row.terceiro) item.terceiro = row.terceiro;

            const dia = getDiaByDataEscala(semana, row.data_escala);
            if (!diasSync.includes(dia)) return;
            const diaKey = DIA_KEY_MAP[dia];
            if (!diaKey) return;
            const rotaKey = `${diaKey}_rota`;
            const statusKey = `${diaKey}_status`;
            if (row.rota || !item[rotaKey]) item[rotaKey] = row.rota || '';
            if (row.status || !item[statusKey]) item[statusKey] = row.status || '';
        });

        for (const item of mapa.values()) {
            await upsertPlanejamentoItem(item);
        }

        return mapa.size;
    }

    async function recalcularPlanejamentoPelasAbas() {
        const semana = selectSemana.value;
        if (!semana) return alert('Selecione uma semana antes de recalcular o planejamento.');
        if (!exigirFilialEscala()) return;

        if (isSemanaModeloPlanejamento(semana)) {
            await carregarDatasSemanaModeloBanco();
        }

        const datasSemana = getDatasSemanaISO(semana);
        if (datasSemana.length === 0) {
            return alert('Nao foi possivel identificar as datas da semana para recalcular o planejamento.');
        }

        if (!confirm(`Recalcular o planejamento da ${semana} usando as abas diarias salvas?\n\nO planejamento atual desta semana/filial sera substituido.`)) {
            return;
        }

        try {
            const { error: deleteError } = await supabaseClient
                .from('planejamento_semanal')
                .delete()
                .eq('semana_nome', semana)
                .eq('filial', getFilialEscala());

            if (deleteError) throw deleteError;

            const total = await sincronizarPlanejamentoDaSemana(semana);
            await carregarPlanejamento(semana);
            alert(`Planejamento recalculado com sucesso. ${total || 0} placa(s) atualizada(s).`);
        } catch (err) {
            console.error('Erro ao recalcular planejamento:', err);
            alert('Erro ao recalcular planejamento: ' + err.message);
        }
    }

    async function atualizarAbasDiariasPeloPlanejamento() {
        const semana = selectSemana.value;
        if (!semana) return alert('Selecione uma semana antes de atualizar as abas diarias.');
        if (!exigirFilialEscala()) return;

        if (isSemanaModeloPlanejamento(semana)) {
            await carregarDatasSemanaModeloBanco();
        }

        if (!isSemanaModeloPlanejamento(semana) && !CACHE_DATAS[semana]) {
            return alert('Nao foi possivel identificar as datas da semana para atualizar as abas diarias.');
        }

        if (!confirm(`Atualizar as abas diarias da ${semana} usando o planejamento atual?\n\nA secao PADRAO dos dias sera substituida. Transferencia, Equipamento, Reservas e Faltas nao serao alterados.`)) {
            return;
        }

        try {
            const { data, error } = await aplicarFiltroFilial(
                supabaseClient
                    .from('planejamento_semanal')
                    .select('*')
                    .eq('semana_nome', semana)
            ).order('id');

            if (error) throw error;

            const rows = (data || []).filter(item => !isPlacaVeiculoOcultaEscala(item.placa));
            const inserts = [];

            rows.forEach(row => {
                const placa = normalizeVehiclePlate(row.placa);
                if (!placa) return;

                IMPORT_DAYS.forEach(dia => {
                    const diaKey = DIA_KEY_MAP[dia];
                    const rota = cleanImportValue(row[`${diaKey}_rota`], { keepZero: true });
                    const status = cleanImportValue(row[`${diaKey}_status`], { keepZero: true });
                    if (!rota && !status) return;

                    const dataObj = getDataSemanaDia(semana, dia);

                    inserts.push(comAuditoria({
                        semana_nome: semana,
                        data_escala: dataObj.toISOString().split('T')[0],
                        filial: row.filial || getFilialEscala(),
                        tipo_escala: 'PADRAO',
                        placa,
                        modelo: getModeloVisualByPlaca(placa) || row.modelo || '',
                        rota,
                        status,
                        motorista: row.motorista || '',
                        auxiliar: row.auxiliar || '',
                        terceiro: row.terceiro || ''
                    }));
                });
            });

            const datasAtualizar = getDatasSemanaISO(semana);
            if (datasAtualizar.length === 0) {
                return alert('Nao ha datas definidas para atualizar as abas diarias.');
            }

            const deleteQuery = aplicarFiltroSemanaModelo(
                supabaseClient
                    .from('escala')
                    .delete()
                    .eq('filial', getFilialEscala())
                    .eq('tipo_escala', 'PADRAO')
                    .in('data_escala', datasAtualizar),
                semana
            );
            const { error: deleteError } = await deleteQuery;
            if (deleteError) throw deleteError;

            const chunkSize = 500;
            for (let i = 0; i < inserts.length; i += chunkSize) {
                const { error: insertError } = await supabaseClient
                    .from('escala')
                    .insert(inserts.slice(i, i + chunkSize));
                if (insertError) throw insertError;
            }

            const activeDia = document.querySelector('.tab-btn.active')?.dataset.dia;
            if (activeDia) carregarDadosDia(activeDia, semana);
            alert(`Abas diarias atualizadas com sucesso. ${inserts.length} registro(s) PADRAO gerado(s).`);
        } catch (err) {
            console.error('Erro ao atualizar abas diarias pelo planejamento:', err);
            alert('Erro ao atualizar abas diarias: ' + err.message);
        }
    }

    async function limparDiasAusentesDoPlanejamento(semana, diasPresentes) {
        const diasAusentes = IMPORT_DAYS.filter(dia => !diasPresentes.includes(dia));
        if (!semana || diasAusentes.length === 0) return;

        const payload = comAuditoria({});
        diasAusentes.forEach(dia => {
            const diaKey = DIA_KEY_MAP[dia];
            payload[`${diaKey}_rota`] = '';
            payload[`${diaKey}_status`] = '';
        });

        const { error } = await supabaseClient
            .from('planejamento_semanal')
            .update(payload)
            .eq('semana_nome', semana)
            .eq('filial', getFilialEscala());

        if (error) throw error;
    }

    async function sincronizarPlanejamentoParaEscala(id, key, placaAnterior = '') {
        const { data: row, error } = await supabaseClient
            .from('planejamento_semanal')
            .select('*')
            .eq('id', id)
            .single();

        if (error) throw error;
        if (!row || !row.semana_nome) return;

        const placaAtual = normalizeVehiclePlate(row.placa);
        const placaBusca = normalizeVehiclePlate(placaAnterior) || placaAtual;
        if (!placaBusca) return;

        const datasSemana = getDatasSemanaISO(row.semana_nome);
        if (datasSemana.length === 0) return;

        const camposComuns = ['placa', 'modelo', 'motorista', 'auxiliar', 'terceiro'];
        if (camposComuns.includes(key)) {
            const payload = {};
            if (key === 'placa') payload.placa = placaAtual;
            else payload[key] = row[key] || '';
            if (key === 'placa' || key === 'modelo') payload.modelo = getModeloVisualByPlaca(placaAtual) || row.modelo || '';

            const { error: updateError } = await supabaseClient
                .from('escala')
                .update(comAuditoria(payload))
                .eq('semana_nome', row.semana_nome)
                .eq('filial', row.filial || getFilialEscala())
                .in('data_escala', datasSemana)
                .eq('placa', placaBusca);

            if (updateError) throw updateError;
            return;
        }

        const dayMatch = key.match(/^(domingo|segunda|terca|quarta|quinta|sexta|sabado)_(rota|status)$/);
        if (!dayMatch) return;

        const diaKey = dayMatch[1];
        const campo = dayMatch[2];
        const dia = Object.keys(DIA_KEY_MAP).find(d => DIA_KEY_MAP[d] === diaKey);
        const dataISO = getDataSemanaDia(row.semana_nome, dia)?.toISOString().split('T')[0];
        if (!dataISO) return;

        const rota = row[`${diaKey}_rota`] || '';
        const status = row[`${diaKey}_status`] || '';

        const { data: existentes, error: selectError } = await aplicarFiltroSemanaModelo(
            supabaseClient
                .from('escala')
                .select('id')
                .eq('data_escala', dataISO)
                .eq('filial', row.filial || getFilialEscala())
                .eq('placa', placaBusca),
            row.semana_nome
        );

        if (selectError) throw selectError;

        const payload = comAuditoria({
            semana_nome: row.semana_nome,
            data_escala: dataISO,
            filial: row.filial || getFilialEscala(),
            tipo_escala: 'PADRAO',
            placa: placaAtual,
            modelo: getModeloVisualByPlaca(placaAtual) || row.modelo || '',
            motorista: row.motorista || '',
            auxiliar: row.auxiliar || '',
            terceiro: row.terceiro || '',
            rota,
            status
        });

        if (existentes && existentes.length > 0) {
            const updatePayload = campo === 'rota'
                ? comAuditoria({ rota, placa: placaAtual, modelo: payload.modelo })
                : comAuditoria({ status, placa: placaAtual, modelo: payload.modelo });
            const { error: updateError } = await supabaseClient
                .from('escala')
                .update(updatePayload)
                .in('id', existentes.map(item => item.id));
            if (updateError) throw updateError;
            return;
        }

        if (rota || status) {
            const { error: insertError } = await supabaseClient
                .from('escala')
                .insert([payload]);
            if (insertError) throw insertError;
        }
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

                const planejamentoDiario = parsePlanejamentoPorAbasDiarias(workbook, semana);
                if (planejamentoDiario.abas.length > 0) {
                    if (planejamentoDiario.inserts.length === 0) {
                        importModal.classList.add('hidden');
                        return alert('As abas diarias foram encontradas, mas nenhum registro valido foi identificado.');
                    }

                    importModal.classList.add('hidden');
                    if (confirm(`Importar ${planejamentoDiario.inserts.length} registros das abas diarias para o Planejamento da ${semana}?`)) {
                        importModal.classList.remove('hidden');
                        progressBar.style.width = '90%';
                        progressText.textContent = 'Processando: 90%';
                        progressDetails.textContent = 'Enviando planejamento consolidado...';

                        const { error } = await supabaseClient
                            .from('planejamento_semanal')
                            .insert(planejamentoDiario.inserts.map(item => comAuditoria(item)));
                        if (error) throw error;

                        progressBar.style.width = '100%';
                        progressText.textContent = 'Processando: 100%';
                        progressDetails.textContent = 'Importacao concluida com sucesso!';

                        await new Promise(resolve => setTimeout(resolve, 600));
                        importModal.classList.add('hidden');
                        alert('Planejamento montado pelas abas diarias com sucesso!');
                        carregarPlanejamento(semana);
                    }
                    e.target.value = '';
                    return;
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
                tipo: '',
                motorista: motoristaKey ? String(row[motoristaKey]).trim() : '',
                auxiliar: auxiliarKey ? String(row[auxiliarKey]).trim() : '',
                terceiro: terceiroKey ? String(row[terceiroKey]).trim() : ''
            };

            item.tipo = getTipoVisualByPlaca(item.placa);

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

                    const { error } = await supabaseClient.from('planejamento_semanal').insert(inserts.map(item => comAuditoria(item)));
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
                if (!exigirFilialEscala()) {
                    importModal.classList.add('hidden');
                    return;
                }

                const roteiroSheetName = workbook.SheetNames.find(sheetName => getDiaFromSheetName(sheetName) === dia);
                if (roteiroSheetName) {
                    const parsed = parseRoteiroSheet(workbook, roteiroSheetName, semana);
                    const dataAlvo = isSemanaModeloPlanejamento(semana)
                        ? parsed.dataISO
                        : getDataSemanaDia(semana, dia).toISOString().split('T')[0];
                    const totalRoteiro = parsed.insertsEscala.length + parsed.insertsFaltas.length;

                    importModal.classList.add('hidden');
                    if (totalRoteiro === 0) {
                        e.target.value = '';
                        return alert(`Nenhum registro valido encontrado na aba ${roteiroSheetName}.`);
                    }

                    if (confirm(`Importar ${totalRoteiro} registros da aba ${roteiroSheetName} para a data ${dataAlvo}?`)) {
                        importModal.classList.remove('hidden');
                        progressBar.style.width = '85%';
                        progressText.textContent = 'Processando: 85%';
                        progressDetails.textContent = 'Enviando para banco de dados...';

                        await importarRoteiroDiario(workbook, roteiroSheetName, semana, dia, dataAlvo);

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

                const dataISO = getDataSemanaDia(semana, dia).toISOString().split('T')[0];
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
                                    filial: getFilialEscala(),
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
                            const { error: escalaError } = await supabaseClient.from('escala').insert(insertsEscala.map(item => comAuditoria(item)));
                            if (escalaError) throw escalaError;
                        }
                        if (insertsFaltas.length > 0) {
                            const { error: faltasError } = await supabaseClient.from('faltas_afastamentos').insert(insertsFaltas.map(item => comAuditoria({ ...item, filial: getFilialEscala() })));
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
                const dataOrigem = getDataSemanaDia(semana, diaOrigem).toISOString().split('T')[0];
                const dataDestino = getDataSemanaDia(semana, diaAtual).toISOString().split('T')[0];

                // Busca dados do dia de origem
                const [resEscala, resFaltas] = await Promise.all([
                    aplicarFiltroSemanaModelo(
                        aplicarFiltroFilial(supabaseClient.from('escala').select('*').eq('data_escala', dataOrigem)),
                        semana
                    ),
                    aplicarFiltroSemanaModelo(
                        aplicarFiltroFilial(supabaseClient.from('faltas_afastamentos').select('*').eq('data_escala', dataOrigem)),
                        semana
                    )
                ]);

                if (resEscala.error || resFaltas.error) {
                    throw resEscala.error || resFaltas.error;
                }

                const insertsEscala = resEscala.data.map(item => ({
                    ...item,
                    data_escala: dataDestino,
                    filial: getFilialEscala(),
                    id: undefined // Remove ID para criar novo registro
                }));

                const insertsFaltas = resFaltas.data.map(item => ({
                    ...item,
                    data_escala: dataDestino,
                    filial: getFilialEscala(),
                    id: undefined
                }));

                // Insere dados no dia destino
                if (insertsEscala.length > 0) {
                    const { error: escalaError } = await supabaseClient.from('escala').insert(insertsEscala.map(item => comAuditoria(item)));
                    if (escalaError) throw escalaError;
                }
                if (insertsFaltas.length > 0) {
                    const { error: faltasError } = await supabaseClient.from('faltas_afastamentos').insert(insertsFaltas.map(item => comAuditoria({ ...item, filial: getFilialEscala() })));
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

        const dataISO = getDataSemanaDia(semana, dia).toISOString().split('T')[0];

        // Busca dados apenas do dia selecionado
        const { data: dadosEscala, error: escalaError } = await aplicarFiltroSemanaModelo(
            aplicarFiltroFilial(supabaseClient.from('escala').select('*').eq('data_escala', dataISO)),
            semana
        );
        const { data: dadosFaltas, error: faltasError } = await aplicarFiltroSemanaModelo(
            aplicarFiltroFilial(supabaseClient.from('faltas_afastamentos').select('*').eq('data_escala', dataISO)),
            semana
        );

        if (escalaError || faltasError) {
            console.error('Erro ao buscar dados do dia:', escalaError || faltasError);
            return alert('Erro ao carregar dados para o PDF.');
        }

        const incluirVeiculosDisponiveis = selectedSections ? selectedSections.includes('VEICULOS') : false;
        if (!incluirVeiculosDisponiveis && (!dadosEscala || dadosEscala.length === 0) && (!dadosFaltas || dadosFaltas.length === 0)) {
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
        const formattedDate = getDataSemanaDia(semana, dia).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
        
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
            { id: 'VEICULOS', title: 'VEICULOS DISPONIVEIS' },
            { id: 'FALTAS', title: 'FALTAS / FÉRIAS / AFASTADOS' }
        ];

        const secoesFiltradas = selectedSections ? secoes.filter(s => selectedSections.includes(s.id)) : secoes;
        let adicionouSecaoPDF = false;

        for (const sec of secoesFiltradas) {
            let itens = [];
            let columns, body;

            if (sec.id === 'VEICULOS') {
                try {
                    itens = await buscarVeiculosDisponiveisPDF(dadosEscala || []);
                } catch (error) {
                    console.error('Erro ao buscar veiculos disponiveis:', error);
                    return alert('Erro ao carregar veiculos disponiveis para o PDF.');
                }
                columns = ['PLACA', 'MODELO', 'TIPO', 'ASSINATURA'];
                body = itens.map(i => [normalizeVehiclePlate(i.placa) || i.placa || '', i.modelo || '', i.tipo || '', '']);
            } else if (sec.id === 'FALTAS') {
                itens = dadosFaltas || [];
                columns = ['MOTORISTA', 'MOTIVO MOTORISTA', 'AUXILIAR', 'MOTIVO AUXILIAR', 'ASSINATURA'];
                body = itens.map(i => [i.motorista_ausente || '', i.motivo_motorista || '', i.auxiliar_ausente || '', i.motivo_auxiliar || '', '']);
            } else {
                itens = (dadosEscala || []).filter(d => d.tipo_escala === sec.id);
                columns = ['PLACA', 'MODELO', 'ROTA', 'STATUS', 'MOTORISTA', 'AUXILIAR', 'TERCEIRO', 'ASSINATURA'];
                body = itens.map(i => [i.placa || '', i.modelo || '', i.rota || '', i.status || '', i.motorista || '', i.auxiliar || '', i.terceiro || '', '']);
            }

            if (itens.length === 0) continue;
            adicionouSecaoPDF = true;

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
                    if (data.section === 'body' && !['FALTAS', 'VEICULOS'].includes(sec.id) && data.column.index === 3) {
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

        if (!adicionouSecaoPDF) {
            return alert('Nenhum dado encontrado para as seções selecionadas.');
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

    function isVeiculoDisponivelPDF(veiculo) {
        const situacao = normalizeString(veiculo?.situacao || 'ativo');
        return situacao === 'ATIVO' && !isTipoVeiculoOcultoEscala(veiculo?.tipo);
    }

    async function buscarVeiculosDisponiveisPDF(dadosEscala) {
        const placasUsadas = new Set((dadosEscala || [])
            .map(item => normalizeVehiclePlate(item.placa))
            .filter(Boolean));

        let query = supabaseClient
            .from('veiculos')
            .select('placa, modelo, tipo, situacao, filial')
            .order('placa');

        const filial = getFilialEscala();
        if (filial) query = query.eq('filial', filial);

        const { data, error } = await query;
        if (error) throw error;

        return (data || [])
            .filter(isVeiculoDisponivelPDF)
            .filter(veiculo => !placasUsadas.has(normalizeVehiclePlate(veiculo.placa)))
            .sort((a, b) => normalizeVehiclePlate(a.placa).localeCompare(normalizeVehiclePlate(b.placa), 'pt-BR'));
    }

    // --- FUNÇÕES DO MODAL DE EXPEDIÇÃO ---
    function isStatusExcluidoPDFExpedicao(status) {
        const compact = normalizeString(status).replace(/[\s.-]+/g, '');
        return compact === 'P' || compact === 'R';
    }

    function getContextoPDFExpedicao() {
        const contexto = getDataEscalaAberta();
        if (!contexto) {
            alert('Abra uma semana e selecione um dia para gerar o PDF de expedicao.');
            return null;
        }
        return contexto;
    }

    async function buscarDadosPDFExpedicao(contexto) {
        const { data, error } = await aplicarFiltroFilial(
            supabaseClient
                .from('escala')
                .select('placa, modelo, rota, status, motorista, auxiliar, terceiro, tipo_escala')
                .eq('data_escala', contexto.dataISO)
                .eq('tipo_escala', 'PADRAO')
        );

        if (error) throw error;

        return (data || [])
            .filter(item => normalizeVehiclePlate(item.placa))
            .filter(item => !isStatusExcluidoPDFExpedicao(item.status))
            .sort((a, b) => {
                const modeloCompare = cleanImportValue(a.modelo).localeCompare(cleanImportValue(b.modelo), 'pt-BR', { numeric: true, sensitivity: 'base' });
                if (modeloCompare !== 0) return modeloCompare;
                const rotaCompare = cleanImportValue(a.rota, { keepZero: true }).localeCompare(cleanImportValue(b.rota, { keepZero: true }), 'pt-BR', { numeric: true, sensitivity: 'base' });
                if (rotaCompare !== 0) return rotaCompare;
                return normalizeVehiclePlate(a.placa).localeCompare(normalizeVehiclePlate(b.placa), 'pt-BR', { numeric: true, sensitivity: 'base' });
            });
    }

    function ensureModalPDFExpedicaoModelo() {
        let modal = document.getElementById('modalPDFExpedicaoModelo');
        if (modal) return modal;

        modal = document.createElement('div');
        modal.id = 'modalPDFExpedicaoModelo';
        modal.className = 'terceiro-modal hidden';
        modal.innerHTML = `
            <div class="terceiro-modal-content pdf-expedicao-modelo-content">
                <div class="terceiro-modal-header pdf-expedicao-modelo-header">
                    <h3><i class="fa-solid fa-file-pdf"></i> PDF Expedicao</h3>
                    <button type="button" id="btnFecharPDFExpedicaoModelo" class="terceiro-modal-close" title="Fechar">&times;</button>
                </div>
                <div class="pdf-expedicao-modelo-summary">
                    <div>
                        <span>Data</span>
                        <strong id="pdfExpedicaoModeloContexto"></strong>
                    </div>
                    <div>
                        <span>Total</span>
                        <strong id="pdfExpedicaoModeloTotal">0 placas</strong>
                    </div>
                </div>
                <div class="pdf-expedicao-modelo-actions">
                    <button type="button" id="btnSelecionarTodosModelosExp" class="pdf-expedicao-btn secondary">
                        <i class="fas fa-check-double"></i> Selecionar todos
                    </button>
                    <button type="button" id="btnLimparModelosExp" class="pdf-expedicao-btn ghost">
                        <i class="fas fa-eraser"></i> Limpar
                    </button>
                </div>
                <div id="pdfExpedicaoModeloLista" class="pdf-expedicao-modelo-list"></div>
                <div class="pdf-expedicao-footer">
                    <button type="button" id="btnGerarXLSXExpedicaoModelo" class="pdf-expedicao-btn excel">
                        <i class="fas fa-file-excel"></i> Gerar XLSX
                    </button>
                    <button type="button" id="btnGerarPDFExpedicaoModelo" class="pdf-expedicao-btn primary">
                        <i class="fas fa-file-pdf"></i> Gerar PDF
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        modal.addEventListener('click', (e) => {
            if (e.target.closest('#btnFecharPDFExpedicaoModelo')) {
                modal.classList.add('hidden');
            }

            if (e.target.closest('#btnSelecionarTodosModelosExp')) {
                modal.querySelectorAll('.pdf-expedicao-modelo-check').forEach(chk => chk.checked = true);
            }

            if (e.target.closest('#btnLimparModelosExp')) {
                modal.querySelectorAll('.pdf-expedicao-modelo-check').forEach(chk => chk.checked = false);
            }

            if (e.target.closest('#btnGerarPDFExpedicaoModelo')) {
                const modelos = Array.from(modal.querySelectorAll('.pdf-expedicao-modelo-check:checked')).map(chk => chk.value);
                gerarPDFExpedicaoModelo(modelos);
            }

            if (e.target.closest('#btnGerarXLSXExpedicaoModelo')) {
                const modelos = Array.from(modal.querySelectorAll('.pdf-expedicao-modelo-check:checked')).map(chk => chk.value);
                gerarXLSXExpedicaoModelo(modelos);
            }
        });

        return modal;
    }

    async function abrirModalPDFExpedicaoModelo() {
        const contexto = getContextoPDFExpedicao();
        if (!contexto) return;

        try {
            const dados = await buscarDadosPDFExpedicao(contexto);
            if (dados.length === 0) return alert('Nenhuma placa encontrada para esta data apos excluir status P e R.');

            const modelos = [...new Set(dados.map(item => cleanImportValue(item.modelo) || 'SEM MODELO'))]
                .sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' }));

            const modal = ensureModalPDFExpedicaoModelo();
            modal.querySelector('#pdfExpedicaoModeloContexto').textContent = `${contexto.dia} - ${contexto.dataBR}`;
            modal.querySelector('#pdfExpedicaoModeloTotal').textContent = `${dados.length} placa(s)`;
            modal.querySelector('#pdfExpedicaoModeloLista').innerHTML = modelos.map(modelo => {
                const qtd = dados.filter(item => (cleanImportValue(item.modelo) || 'SEM MODELO') === modelo).length;
                return `
                    <label class="pdf-expedicao-modelo-option">
                        <input type="checkbox" class="pdf-expedicao-modelo-check" value="${escapeAttribute(modelo)}" checked>
                        <span class="pdf-expedicao-modelo-name">${escapeAttribute(modelo)}</span>
                        <small>${qtd}</small>
                    </label>
                `;
            }).join('');
            modal.classList.remove('hidden');
        } catch (error) {
            console.error('Erro ao abrir PDF de expedicao:', error);
            alert('Erro ao carregar modelos para o PDF de expedicao: ' + error.message);
        }
    }

    async function gerarPDFExpedicaoModelo(modelosSelecionados) {
        if (!window.jspdf) return alert('Biblioteca PDF nao carregada.');
        if (!modelosSelecionados || modelosSelecionados.length === 0) return alert('Selecione pelo menos um modelo.');

        const contexto = getContextoPDFExpedicao();
        if (!contexto) return;

        try {
            const dados = (await buscarDadosPDFExpedicao(contexto))
                .filter(item => modelosSelecionados.includes(cleanImportValue(item.modelo) || 'SEM MODELO'));

            if (dados.length === 0) return alert('Nenhuma placa encontrada para os modelos selecionados.');

            const margin = 3;

            const dadosOrdenados = [...dados].sort((a, b) => {
                const modeloCompare = cleanImportValue(a.modelo).localeCompare(cleanImportValue(b.modelo), 'pt-BR', { numeric: true, sensitivity: 'base' });
                if (modeloCompare !== 0) return modeloCompare;
                const rotaCompare = cleanImportValue(a.rota, { keepZero: true }).localeCompare(cleanImportValue(b.rota, { keepZero: true }), 'pt-BR', { numeric: true, sensitivity: 'base' });
                if (rotaCompare !== 0) return rotaCompare;
                return normalizeVehiclePlate(a.placa).localeCompare(normalizeVehiclePlate(b.placa), 'pt-BR', { numeric: true, sensitivity: 'base' });
            });

            const { jsPDF } = window.jspdf;
            const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
            const pageWidth = doc.internal.pageSize.getWidth();
            const head = [['PLACA', 'MODELO', 'ROTA', 'STATUS', 'MOTORISTA']];
            const body = dadosOrdenados.map(item => [
                normalizeVehiclePlate(item.placa),
                cleanImportValue(item.modelo),
                cleanImportValue(item.rota, { keepZero: true }),
                cleanImportValue(item.status, { keepZero: true }),
                cleanImportValue(item.motorista)
            ]);

            const baseTableOptions = {
                theme: 'grid',
                head,
                styles: { fontSize: 4.8, cellPadding: 0.18, lineWidth: 0.05, overflow: 'ellipsize', valign: 'middle' },
                headStyles: { fillColor: [0, 105, 55], textColor: 255, fontStyle: 'bold', halign: 'center', fontSize: 5 },
                alternateRowStyles: { fillColor: [244, 248, 245] },
                didParseCell: (data) => {
                    if (data.section !== 'body') return;
                    const row = data.row.raw || [];
                    if (row[3] === 'TOTAL') {
                        data.cell.styles.fontStyle = 'bold';
                        data.cell.styles.fillColor = [230, 230, 230];
                        if (data.column.index >= 3) data.cell.styles.halign = 'center';
                    }
                }
            };

            doc.autoTable({
                ...baseTableOptions,
                body: [...body, ['', '', '', 'TOTAL', String(dadosOrdenados.length)]],
                startY: margin,
                margin: { left: margin, right: margin, top: margin, bottom: margin },
                tableWidth: pageWidth - (margin * 2),
                styles: { ...baseTableOptions.styles, fontSize: 5.4, cellPadding: 0.24 },
                headStyles: { ...baseTableOptions.headStyles, fontSize: 5.5 },
                columnStyles: {
                    0: { cellWidth: 22 },
                    1: { cellWidth: 38 },
                    2: { cellWidth: 15, halign: 'center' },
                    3: { cellWidth: 17, halign: 'center' },
                    4: { cellWidth: pageWidth - (margin * 2) - 92 }
                }
            });

            doc.save(`Expedicao_${contexto.dataBR.replace(/\D/g, '')}.pdf`);
            document.getElementById('modalPDFExpedicaoModelo')?.classList.add('hidden');
        } catch (error) {
            console.error('Erro ao gerar PDF de expedicao:', error);
            alert('Erro ao gerar PDF de expedicao: ' + error.message);
        }
    }

    async function gerarXLSXExpedicaoModelo(modelosSelecionados) {
        if (typeof XLSX === 'undefined') return alert('Biblioteca XLSX nao carregada.');
        if (!modelosSelecionados || modelosSelecionados.length === 0) return alert('Selecione pelo menos um modelo.');

        const contexto = getContextoPDFExpedicao();
        if (!contexto) return;

        try {
            const dados = (await buscarDadosPDFExpedicao(contexto))
                .filter(item => modelosSelecionados.includes(cleanImportValue(item.modelo) || 'SEM MODELO'))
                .sort((a, b) => {
                    const modeloCompare = cleanImportValue(a.modelo).localeCompare(cleanImportValue(b.modelo), 'pt-BR', { numeric: true, sensitivity: 'base' });
                    if (modeloCompare !== 0) return modeloCompare;
                    const rotaCompare = cleanImportValue(a.rota, { keepZero: true }).localeCompare(cleanImportValue(b.rota, { keepZero: true }), 'pt-BR', { numeric: true, sensitivity: 'base' });
                    if (rotaCompare !== 0) return rotaCompare;
                    return normalizeVehiclePlate(a.placa).localeCompare(normalizeVehiclePlate(b.placa), 'pt-BR', { numeric: true, sensitivity: 'base' });
                });

            if (dados.length === 0) return alert('Nenhuma placa encontrada para os modelos selecionados.');

            const headers = ['PLACA', 'MODELO', 'ROTA', 'STATUS', 'MOTORISTA'];
            const resumoModelos = [...dados.reduce((map, item) => {
                const modelo = cleanImportValue(item.modelo) || 'SEM MODELO';
                map.set(modelo, (map.get(modelo) || 0) + 1);
                return map;
            }, new Map())]
                .sort((a, b) => a[0].localeCompare(b[0], 'pt-BR', { numeric: true, sensitivity: 'base' }));
            const wsData = [
                headers,
                ...dados.map(item => [
                    normalizeVehiclePlate(item.placa),
                    cleanImportValue(item.modelo),
                    cleanImportValue(item.rota, { keepZero: true }),
                    cleanImportValue(item.status, { keepZero: true }),
                    cleanImportValue(item.motorista)
                ]),
                [],
                ['RESUMO POR MODELO', 'QTD', '', '', ''],
                ...resumoModelos.map(([modelo, qtd]) => [modelo, qtd, '', '', '']),
                ['TOTAL', dados.length, '', '', '']
            ];

            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.aoa_to_sheet(wsData);
            ws['!cols'] = [
                { wch: 12 },
                { wch: 18 },
                { wch: 10 },
                { wch: 12 },
                { wch: 32 }
            ];
            ws['!autofilter'] = { ref: `A1:E${wsData.length}` };
            ws['!freeze'] = { xSplit: 0, ySplit: 1 };

            const range = XLSX.utils.decode_range(ws['!ref']);
            for (let col = range.s.c; col <= range.e.c; col++) {
                const headerRef = XLSX.utils.encode_cell({ r: 0, c: col });
                if (ws[headerRef]) {
                    ws[headerRef].s = {
                        font: { bold: true, color: { rgb: 'FFFFFF' } },
                        fill: { fgColor: { rgb: '006937' } },
                        alignment: { horizontal: 'center' }
                    };
                }
            }

            const resumoHeaderIndex = dados.length + 2;
            const totalRowIndex = wsData.length - 1;
            [resumoHeaderIndex, totalRowIndex].forEach(rowIndex => {
                for (let col = range.s.c; col <= range.e.c; col++) {
                    const cellRef = XLSX.utils.encode_cell({ r: rowIndex, c: col });
                    if (ws[cellRef]) {
                        ws[cellRef].s = {
                            font: { bold: true },
                            fill: { fgColor: { rgb: rowIndex === totalRowIndex ? 'E6E6E6' : 'DDEFE4' } },
                            alignment: { horizontal: col === 1 ? 'center' : 'left' }
                        };
                    }
                }
            });

            XLSX.utils.book_append_sheet(wb, ws, 'Expedicao');
            XLSX.writeFile(wb, `Expedicao_${contexto.dataBR.replace(/\D/g, '')}.xlsx`);
        } catch (error) {
            console.error('Erro ao gerar XLSX de expedicao:', error);
            alert('Erro ao gerar XLSX de expedicao: ' + error.message);
        }
    }

    function abrirModalExpedicao() {
        const semana = selectSemana.value;
        const dia = document.querySelector('.tab-btn.active')?.dataset.dia;
        if (!semana || !dia) return;

        const dataObj = getDataSemanaDia(semana, dia);
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

        const dataObj = getDataSemanaDia(semana, dia);
        return {
            semana,
            dia,
            dataISO: dataObj.toISOString().split('T')[0],
            dataBR: dataObj.toLocaleDateString('pt-BR', { timeZone: 'UTC' })
        };
    }

    function parseMoedaBR(value) {
        if (value === null || value === undefined) return 0;
        const normalized = String(value).replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.');
        const number = Number(normalized);
        return Number.isFinite(number) ? number : 0;
    }

    function formatMoedaBR(value) {
        return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }

    function isStatusAusenciaDiaria(value) {
        const status = normalizeString(value);
        return status.includes('FALTA')
            || status.includes('FERIAS')
            || status.includes('AFAST')
            || status.includes('AUSENTE');
    }

    const diariaSortState = { key: 'nome', direction: 'asc' };
    let diariaDadosAtual = [];
    let diariaFuncoesCadastroCache = [];

    async function carregarFuncoesCadastroDiaria() {
        try {
            const { data, error } = await supabaseClient
                .from('funcionario_funcoes')
                .select('nome, ativo')
                .eq('ativo', true)
                .order('nome');

            if (error) throw error;

            diariaFuncoesCadastroCache = (data || [])
                .map(item => cleanImportValue(item.nome))
                .filter(Boolean);
        } catch (error) {
            diariaFuncoesCadastroCache = [];
            console.warn('Cadastro de funcoes da diaria nao carregado:', error);
        }
    }

    function getFuncoesFiltroDiaria() {
        const funcoesCadastro = diariaFuncoesCadastroCache.length ? diariaFuncoesCadastroCache : [];
        const funcoesDados = diariaDadosAtual
            .map(item => cleanImportValue(item.funcao))
            .filter(Boolean);

        return [...new Set([...funcoesCadastro, ...funcoesDados])]
            .sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));
    }

    function ensureModalDiaria() {
        let modal = document.getElementById('modalDiaria');
        if (modal) return modal;

        modal = document.createElement('div');
        modal.id = 'modalDiaria';
        modal.className = 'terceiro-modal hidden';
        modal.innerHTML = `
            <div class="terceiro-modal-content diaria-modal-content">
                <div class="terceiro-modal-header diaria-modal-header">
                    <h3><i class="fa-solid fa-money-bill-wave"></i> Diaria</h3>
                    <button type="button" id="btnFecharDiaria" class="terceiro-modal-close" title="Fechar">&times;</button>
                </div>
                <div class="diaria-toolbar">
                    <div class="diaria-controls diaria-card-grid">
                        <div class="diaria-card">
                            <h4><i class="fa-solid fa-coins"></i> Base da diaria</h4>
                            <div class="form-group">
                                <label for="diariaValorSemana">Valor da diaria semanal (5 dias)</label>
                                <input type="text" id="diariaValorSemana" class="glass-input" placeholder="Ex: 150,00">
                            </div>
                        </div>
                        <div class="diaria-card diaria-card-resumo">
                            <h4><i class="fa-solid fa-chart-simple"></i> Resumo financeiro</h4>
                            <div class="diaria-summary-grid">
                                <div class="diaria-metric">
                                    <span>Valor por dia</span>
                                    <strong id="diariaValorDia">R$ 0,00</strong>
                                </div>
                                <div class="diaria-metric">
                                    <span>Desconto prox. semana</span>
                                    <strong id="diariaTotalDesconto">R$ 0,00</strong>
                                </div>
                                <div class="diaria-metric">
                                    <span>Total a pagar</span>
                                    <strong id="diariaTotalPagar">R$ 0,00</strong>
                                </div>
                            </div>
                        </div>
                        <div class="diaria-card diaria-card-filtros">
                            <h4><i class="fa-solid fa-filter"></i> Filtros</h4>
                            <div class="diaria-filter-grid">
                                <div class="form-group">
                                    <label for="diariaFiltroStatus">Status</label>
                                    <select id="diariaFiltroStatus" class="glass-input">
                                        <option value="">Todos</option>
                                        <option value="APTO">Apto</option>
                                        <option value="BLOQUEADO">Bloqueado</option>
                                    </select>
                                </div>
                                <div class="form-group">
                                    <label for="diariaFiltroFuncao">Funcoes</label>
                                    <select id="diariaFiltroFuncao" class="glass-input diaria-multi-select" multiple size="4">
                                    </select>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="diaria-actions-card">
                        <span>Acoes</span>
                        <div class="diaria-actions-buttons">
                            <button type="button" id="btnCalcularDiaria" class="pdf-expedicao-btn secondary">
                                <i class="fas fa-calculator"></i> Calcular
                            </button>
                            <button type="button" id="btnSalvarDiaria" class="pdf-expedicao-btn primary">
                                <i class="fas fa-save"></i> Salvar
                            </button>
                            <button type="button" id="btnXLSXDiaria" class="pdf-expedicao-btn excel">
                                <i class="fas fa-file-excel"></i> XLSX
                            </button>
                            <button type="button" id="btnPDFDiaria" class="pdf-expedicao-btn primary">
                                <i class="fas fa-file-pdf"></i> PDF
                            </button>
                        </div>
                    </div>
                </div>
                <div class="diaria-meta" id="diariaContexto"></div>
                <div class="terceiro-table-wrap diaria-table-wrap">
                    <table class="data-grid diaria-table">
                        <thead>
                            <tr>
                                <th><button type="button" class="diaria-sort-btn" data-diaria-sort="nome">FUNCIONARIO <i class="fas fa-sort"></i></button></th>
                                <th><button type="button" class="diaria-sort-btn" data-diaria-sort="nomeCompleto">NOME COMPLETO <i class="fas fa-sort"></i></button></th>
                                <th><button type="button" class="diaria-sort-btn" data-diaria-sort="cpf">CPF <i class="fas fa-sort"></i></button></th>
                                <th><button type="button" class="diaria-sort-btn" data-diaria-sort="funcao">FUNCAO <i class="fas fa-sort"></i></button></th>
                                <th>PAGAR</th>
                                <th><button type="button" class="diaria-sort-btn" data-diaria-sort="status">STATUS <i class="fas fa-sort"></i></button></th>
                                <th><button type="button" class="diaria-sort-btn" data-diaria-sort="diasDesconto">DIAS DESC. <i class="fas fa-sort"></i></button></th>
                                <th><button type="button" class="diaria-sort-btn" data-diaria-sort="descontoAnterior">DESC. ANTERIOR <i class="fas fa-sort"></i></button></th>
                                <th><button type="button" class="diaria-sort-btn" data-diaria-sort="valorPagar">VALOR A PAGAR <i class="fas fa-sort"></i></button></th>
                                <th><button type="button" class="diaria-sort-btn" data-diaria-sort="valorDesconto">DESC. PROX. SEMANA <i class="fas fa-sort"></i></button></th>
                            </tr>
                        </thead>
                        <tbody id="tbodyDiaria"></tbody>
                    </table>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        modal.addEventListener('click', (e) => {
            if (e.target.closest('#btnFecharDiaria')) modal.classList.add('hidden');
            if (e.target.closest('#btnCalcularDiaria')) carregarDiariaModal();
            if (e.target.closest('#btnSalvarDiaria')) salvarDiariaSemana();
            if (e.target.closest('#btnXLSXDiaria')) gerarXLSXDiaria();
            if (e.target.closest('#btnPDFDiaria')) gerarPDFDiaria();

            const pagarToggle = e.target.closest('.diaria-pagar-toggle');
            if (pagarToggle) {
                atualizarPagamentoManualDiaria(pagarToggle.dataset.diariaKey, pagarToggle.checked);
                return;
            }

            const sortButton = e.target.closest('[data-diaria-sort]');
            if (sortButton) {
                const key = sortButton.dataset.diariaSort;
                diariaSortState.direction = diariaSortState.key === key && diariaSortState.direction === 'asc' ? 'desc' : 'asc';
                diariaSortState.key = key;
                renderDiariaTabela();
            }
        });

        modal.querySelector('#diariaValorSemana').addEventListener('input', recalcularDiariaComValorAtual);
        modal.querySelector('#diariaFiltroStatus').addEventListener('change', renderDiariaTabela);
        modal.querySelector('#diariaFiltroFuncao').addEventListener('change', renderDiariaTabela);
        return modal;
    }

    function atualizarResumoDiaria() {
        const valorSemana = parseMoedaBR(document.getElementById('diariaValorSemana')?.value);
        const valorDia = valorSemana / 5;
        const totalDesconto = diariaDadosAtual.reduce((sum, item) => sum + Number(item.valorDesconto || 0), 0);
        const totalPagar = diariaDadosAtual.reduce((sum, item) => sum + Number(item.valorPagar || 0), 0);

        const elValorDia = document.getElementById('diariaValorDia');
        const elTotalDesconto = document.getElementById('diariaTotalDesconto');
        const elTotalPagar = document.getElementById('diariaTotalPagar');
        if (elValorDia) elValorDia.textContent = formatMoedaBR(valorDia);
        if (elTotalDesconto) elTotalDesconto.textContent = formatMoedaBR(totalDesconto);
        if (elTotalPagar) elTotalPagar.textContent = formatMoedaBR(totalPagar);
    }

    function recalcularItemDiaria(item, valorSemana) {
        const valorDia = valorSemana / 5;
        const pagarManual = item.pagarManual !== false;
        const motivosAusencia = Array.isArray(item.motivosAusencia) ? item.motivosAusencia : [];
        const statusCadastro = cleanImportValue(item.statusCadastro);
        const temStatusCadastroAusencia = statusCadastro && isStatusAusenciaDiaria(statusCadastro);
        const temAusencia = Number(item.diasDesconto || 0) > 0;
        const motivosBloqueio = [...new Set([
            ...motivosAusencia,
            ...(temStatusCadastroAusencia ? [statusCadastro] : [])
        ].filter(Boolean))];
        const temBloqueioStatus = temAusencia || temStatusCadastroAusencia;

        item.valorDesconto = temAusencia ? Number(item.diasDesconto || 0) * valorDia : 0;
        item.recebe = pagarManual && !temBloqueioStatus;
        item.bloqueioStatus = temBloqueioStatus;

        if (!pagarManual) {
            item.status = [
                ...motivosBloqueio,
                item.foraEscala ? 'FORA DA ESCALA' : 'NAO PAGAR'
            ].join(', ');
            item.descricaoStatus = [
                ...motivosBloqueio.map(motivo => `Status: ${motivo}`),
                item.foraEscala
                    ? 'Funcionario nao encontrado como motorista ou auxiliar na escala da semana.'
                    : 'Pagamento de diaria desmarcado manualmente.'
            ].join(' ');
        } else if (temBloqueioStatus) {
            item.status = motivosBloqueio.length > 0 ? motivosBloqueio.join(', ') : 'FALTA';
            const datasFalta = Array.isArray(item.datasFalta) ? item.datasFalta : [];
            item.descricaoStatus = [
                ...(datasFalta.length > 0 ? [`Falta em: ${datasFalta.join(', ')}`] : []),
                ...(temStatusCadastroAusencia ? [`Status cadastral: ${statusCadastro}`] : [])
            ].join(' ');
        } else {
            item.status = 'APTO';
            item.descricaoStatus = item.foraEscala
                ? 'Funcionario fora da escala, mas marcado manualmente para receber.'
                : '';
        }

        item.valorPagar = item.recebe ? Math.max(valorSemana - Number(item.descontoAnterior || 0), 0) : 0;
        return item;
    }

    function atualizarPagamentoManualDiaria(key, pagarManual) {
        const item = diariaDadosAtual.find(row => row.key === key);
        if (!item) return;
        const valorSemana = parseMoedaBR(document.getElementById('diariaValorSemana')?.value);
        item.pagarManual = pagarManual;
        recalcularItemDiaria(item, valorSemana);
        renderDiariaTabela();
    }

    function recalcularDiariaComValorAtual() {
        if (diariaDadosAtual.length === 0) {
            atualizarResumoDiaria();
            return;
        }

        const valorSemana = parseMoedaBR(document.getElementById('diariaValorSemana')?.value);
        diariaDadosAtual.forEach(item => recalcularItemDiaria(item, valorSemana));
        renderDiariaTabela();
    }

    async function abrirModalDiaria() {
        const semana = selectSemana.value;
        if (!semana) return alert('Selecione uma semana.');
        if (!exigirFilialEscala()) return;

        const modal = ensureModalDiaria();
        modal.classList.remove('hidden');
        modal.querySelector('#diariaContexto').textContent = `${semana} - ${getFilialEscala()}`;
        await carregarDiariaModal();
    }

    function getSemanaAnteriorNome(semana) {
        const datasSemana = CACHE_DATAS[semana];
        const inicioSemana = datasSemana?.DOMINGO || datasSemana?.SEGUNDA;
        if (!inicioSemana) return '';

        const alvo = addDays(inicioSemana, -7).toISOString().split('T')[0];
        return Object.keys(CACHE_DATAS).find(nomeSemana => {
            const datas = CACHE_DATAS[nomeSemana];
            return IMPORT_DAYS.some(dia => datas?.[dia]?.toISOString().split('T')[0] === alvo);
        }) || '';
    }

    async function carregarDescontosDiariaAnterior(semana) {
        const semanaAnterior = getSemanaAnteriorNome(semana);
        if (!semanaAnterior) return new Map();

        try {
            const { data: diaria, error } = await supabaseClient
                .from('escala_diarias')
                .select('id')
                .eq('semana_nome', semanaAnterior)
                .eq('filial', getFilialEscala())
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (error || !diaria?.id) return new Map();

            const { data: itens, error: itensError } = await supabaseClient
                .from('escala_diaria_itens')
                .select('funcionario_nome, valor_desconto')
                .eq('diaria_id', diaria.id);

            if (itensError) return new Map();

            const descontos = new Map();
            (itens || []).forEach(item => {
                const key = normalizeString(item.funcionario_nome);
                descontos.set(key, (descontos.get(key) || 0) + Number(item.valor_desconto || 0));
            });
            return descontos;
        } catch (error) {
            console.warn('Descontos anteriores de diaria nao carregados:', error);
            return new Map();
        }
    }

    function ordenarDiariaDados(dados) {
        const direction = diariaSortState.direction === 'desc' ? -1 : 1;
        const key = diariaSortState.key || 'nome';
        return [...dados].sort((a, b) => {
            const valueA = a[key];
            const valueB = b[key];
            if (typeof valueA === 'number' || typeof valueB === 'number') {
                return ((Number(valueA) || 0) - (Number(valueB) || 0)) * direction;
            }
            return cleanImportValue(valueA).localeCompare(cleanImportValue(valueB), 'pt-BR', { numeric: true, sensitivity: 'base' }) * direction;
        });
    }

    function formatDataISOBR(dataISO) {
        const value = String(dataISO || '').slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
        const [year, month, day] = value.split('-');
        return `${day}/${month}/${year}`;
    }

    function renderDiariaTabela() {
        const tbody = document.getElementById('tbodyDiaria');
        if (!tbody) return;

        const dadosOrdenados = getDiariaDadosExportacao();

        document.querySelectorAll('#modalDiaria [data-diaria-sort] i').forEach(icon => {
            const button = icon.closest('[data-diaria-sort]');
            const ativo = button?.dataset.diariaSort === diariaSortState.key;
            icon.className = ativo
                ? (diariaSortState.direction === 'asc' ? 'fas fa-sort-up' : 'fas fa-sort-down')
                : 'fas fa-sort';
        });

        if (dadosOrdenados.length === 0) {
            tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;">Nenhum funcionario encontrado para o filtro.</td></tr>';
            atualizarResumoDiaria();
            return;
        }

        tbody.innerHTML = dadosOrdenados.map(item => `
            <tr data-nome="${escapeAttribute(item.nome)}" data-nome-completo="${escapeAttribute(item.nomeCompleto)}" data-cpf="${escapeAttribute(item.cpf)}" data-funcao="${escapeAttribute(item.funcao)}" data-status="${escapeAttribute(item.status)}" data-dias-desconto="${item.diasDesconto}" data-desconto-anterior="${item.descontoAnterior}" data-valor-pagar="${item.valorPagar}" data-valor-desconto="${item.valorDesconto}" data-recebe="${item.recebe ? 'true' : 'false'}">
                <td>${escapeAttribute(item.nome)}</td>
                <td>${escapeAttribute(item.nomeCompleto)}</td>
                <td>${escapeAttribute(item.cpf)}</td>
                <td>${escapeAttribute(item.funcao)}</td>
                <td style="text-align:center;"><input type="checkbox" class="diaria-pagar-toggle" data-diaria-key="${escapeAttribute(item.key)}" ${item.recebe ? 'checked' : ''} ${item.bloqueioStatus ? 'disabled' : ''} title="${item.bloqueioStatus ? 'Bloqueado por falta, afastamento ou ferias' : 'Marcar para pagar diaria'}"></td>
                <td><span class="diaria-status ${item.recebe ? 'apto' : 'bloqueado'}" title="${escapeAttribute(item.descricaoStatus || item.status)}">${escapeAttribute(item.status)}</span></td>
                <td>${item.diasDesconto}</td>
                <td>${formatMoedaBR(item.descontoAnterior)}</td>
                <td>${formatMoedaBR(item.valorPagar)}</td>
                <td>${formatMoedaBR(item.valorDesconto)}</td>
            </tr>
        `).join('');

        atualizarResumoDiaria();
    }

    function atualizarFiltroFuncaoDiaria() {
        const select = document.getElementById('diariaFiltroFuncao');
        if (!select) return;

        const valoresAtuais = new Set(Array.from(select.selectedOptions).map(opt => opt.value));
        const funcoes = getFuncoesFiltroDiaria();

        select.innerHTML = funcoes
            .map(funcao => `<option value="${escapeAttribute(funcao)}">${escapeAttribute(funcao)}</option>`)
            .join('');

        Array.from(select.options).forEach(option => {
            option.selected = valoresAtuais.has(option.value);
        });
    }

    function getDiariaFuncoesSelecionadas() {
        const select = document.getElementById('diariaFiltroFuncao');
        if (!select) return [];
        return Array.from(select.selectedOptions)
            .map(opt => normalizeString(opt.value))
            .filter(Boolean);
    }

    function getDiariaDadosExportacao() {
        const filtroStatus = document.getElementById('diariaFiltroStatus')?.value || '';
        const funcoesSelecionadas = getDiariaFuncoesSelecionadas();
        const dadosFiltrados = diariaDadosAtual.filter(item => {
            const statusOk = !filtroStatus || (filtroStatus === 'APTO' ? item.recebe : !item.recebe);
            const funcaoOk = funcoesSelecionadas.length === 0 || funcoesSelecionadas.includes(normalizeString(item.funcao));
            return statusOk && funcaoOk;
        });
        return ordenarDiariaDados(dadosFiltrados);
    }

    function getDiariaResumoExportacao(dados) {
        const valorSemana = parseMoedaBR(document.getElementById('diariaValorSemana')?.value);
        return {
            valorSemana,
            valorDia: valorSemana / 5,
            totalDesconto: dados.reduce((sum, item) => sum + Number(item.valorDesconto || 0), 0),
            totalPagar: dados.reduce((sum, item) => sum + Number(item.valorPagar || 0), 0),
            totalAptos: dados.filter(item => item.recebe).length,
            totalBloqueados: dados.filter(item => !item.recebe).length
        };
    }

    function getDiariaNomeArquivo(ext) {
        const semana = selectSemana.value || 'SEMANA';
        const filial = getFilialEscala() || 'FILIAL';
        const nome = `Diaria_${semana}_${filial}`.replace(/[^a-z0-9_-]+/gi, '_').replace(/_+/g, '_');
        return `${nome}.${ext}`;
    }

    function gerarXLSXDiaria() {
        if (typeof XLSX === 'undefined') return alert('Biblioteca XLSX nao carregada.');
        const dados = getDiariaDadosExportacao();
        if (dados.length === 0) return alert('Nenhum dado para gerar XLSX.');

        const resumo = getDiariaResumoExportacao(dados);
        const semana = selectSemana.value || '';
        const filial = getFilialEscala() || '';
        const headers = ['FUNCIONARIO', 'NOME COMPLETO', 'CPF', 'FUNCAO', 'PAGAR', 'STATUS', 'DESCRICAO', 'DIAS DESC.', 'DESC. ANTERIOR', 'VALOR A PAGAR', 'DESC. PROX. SEMANA'];
        const wsData = [
            [`DIARIA - ${semana} - ${filial}`],
            [`Valor semanal: ${formatMoedaBR(resumo.valorSemana)}`, `Valor por dia: ${formatMoedaBR(resumo.valorDia)}`, `Total a pagar: ${formatMoedaBR(resumo.totalPagar)}`, `Desconto prox. semana: ${formatMoedaBR(resumo.totalDesconto)}`, `Aptos: ${resumo.totalAptos}`, `Bloqueados: ${resumo.totalBloqueados}`],
            [],
            headers,
            ...dados.map(item => [
                item.nome,
                item.nomeCompleto,
                item.cpf,
                item.funcao,
                item.recebe ? 'SIM' : 'NAO',
                item.status,
                item.descricaoStatus,
                Number(item.diasDesconto || 0),
                Number(item.descontoAnterior || 0),
                Number(item.valorPagar || 0),
                Number(item.valorDesconto || 0)
            ])
        ];

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(wsData);
        ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: headers.length - 1 } }];
        ws['!cols'] = [
            { wch: 34 },
            { wch: 42 },
            { wch: 16 },
            { wch: 20 },
            { wch: 10 },
            { wch: 16 },
            { wch: 36 },
            { wch: 12 },
            { wch: 16 },
            { wch: 16 },
            { wch: 18 }
        ];
        ws['!autofilter'] = { ref: `A4:K${wsData.length}` };

        const titleStyle = { font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 14 }, fill: { fgColor: { rgb: '006937' } }, alignment: { horizontal: 'center' } };
        const headerStyle = { font: { bold: true, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '006937' } }, alignment: { horizontal: 'center' } };
        const moneyStyle = { numFmt: 'R$ #,##0.00', alignment: { horizontal: 'right' } };
        if (ws.A1) ws.A1.s = titleStyle;
        headers.forEach((_, index) => {
            const cell = ws[XLSX.utils.encode_cell({ r: 3, c: index })];
            if (cell) cell.s = headerStyle;
        });
        for (let row = 4; row < wsData.length; row++) {
            [8, 9, 10].forEach(col => {
                const cell = ws[XLSX.utils.encode_cell({ r: row, c: col })];
                if (cell) cell.s = moneyStyle;
            });
        }

        XLSX.utils.book_append_sheet(wb, ws, 'Diaria');
        XLSX.writeFile(wb, getDiariaNomeArquivo('xlsx'));
    }

    async function gerarPDFDiaria() {
        if (!window.jspdf) return alert('Biblioteca PDF nao carregada.');
        const dados = getDiariaDadosExportacao();
        if (dados.length === 0) return alert('Nenhum dado para gerar PDF.');

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
        const pageWidth = doc.internal.pageSize.getWidth();
        const resumo = getDiariaResumoExportacao(dados);
        const semana = selectSemana.value || '';
        const filial = getFilialEscala() || '';

        try {
            const response = await fetch('logo.png');
            if (response.ok) {
                const blob = await response.blob();
                const reader = new FileReader();
                const base64data = await new Promise(resolve => {
                    reader.onloadend = () => resolve(reader.result);
                    reader.readAsDataURL(blob);
                });
                doc.setFillColor(255, 255, 255);
                doc.roundedRect(8, 6, 46, 16, 1.5, 1.5, 'F');
                doc.addImage(base64data, 'PNG', 11, 9, 40, 10);
            }
        } catch (error) {
            console.warn('Logo nao carregado', error);
        }

        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0, 105, 55);
        doc.text(`DIARIA - ${semana}`, pageWidth / 2, 15, { align: 'center' });
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(80);
        doc.text(`Filial: ${filial}`, pageWidth / 2, 21, { align: 'center' });
        doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, pageWidth - 10, 10, { align: 'right' });

        doc.autoTable({
            startY: 28,
            margin: { left: 8, right: 8 },
            theme: 'grid',
            head: [['VALOR SEMANAL', 'VALOR POR DIA', 'TOTAL A PAGAR', 'DESC. PROX. SEMANA', 'APTOS', 'BLOQUEADOS']],
            body: [[
                formatMoedaBR(resumo.valorSemana),
                formatMoedaBR(resumo.valorDia),
                formatMoedaBR(resumo.totalPagar),
                formatMoedaBR(resumo.totalDesconto),
                String(resumo.totalAptos),
                String(resumo.totalBloqueados)
            ]],
            styles: { fontSize: 9, cellPadding: 2, halign: 'center' },
            headStyles: { fillColor: [0, 105, 55], textColor: 255 },
            bodyStyles: { fillColor: [247, 251, 248] }
        });

        doc.autoTable({
            startY: doc.lastAutoTable.finalY + 5,
            margin: { left: 8, right: 8 },
            theme: 'grid',
            head: [['FUNCIONARIO', 'NOME COMPLETO', 'CPF', 'FUNCAO', 'PAGAR', 'STATUS', 'DESCRICAO', 'DIAS DESC.', 'DESC. ANTERIOR', 'VALOR A PAGAR', 'DESC. PROX. SEMANA']],
            body: dados.map(item => [
                item.nome,
                item.nomeCompleto,
                item.cpf,
                item.funcao,
                item.recebe ? 'SIM' : 'NAO',
                item.status,
                item.descricaoStatus,
                String(item.diasDesconto || 0),
                formatMoedaBR(item.descontoAnterior),
                formatMoedaBR(item.valorPagar),
                formatMoedaBR(item.valorDesconto)
            ]),
            styles: { fontSize: 8, cellPadding: 1.5, valign: 'middle' },
            headStyles: { fillColor: [0, 105, 55], textColor: 255 },
            alternateRowStyles: { fillColor: [242, 247, 244] },
            columnStyles: {
                0: { cellWidth: 28 },
                1: { cellWidth: 40 },
                2: { cellWidth: 20, halign: 'center' },
                3: { cellWidth: 20 },
                4: { cellWidth: 14, halign: 'center' },
                5: { cellWidth: 20, halign: 'center' },
                6: { cellWidth: 34 },
                7: { cellWidth: 15, halign: 'center' },
                8: { cellWidth: 24, halign: 'right' },
                9: { cellWidth: 24, halign: 'right' },
                10: { cellWidth: 28, halign: 'right' }
            },
            didParseCell: (data) => {
                if (data.section === 'body' && data.column.index === 5) {
                    const status = String(data.cell.raw || '');
                    if (normalizeString(status) === 'APTO') {
                        data.cell.styles.textColor = [0, 105, 55];
                        data.cell.styles.fontStyle = 'bold';
                    } else {
                        data.cell.styles.textColor = [167, 29, 42];
                        data.cell.styles.fontStyle = 'bold';
                    }
                }
            }
        });

        const pageCount = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setFontSize(8);
            doc.setTextColor(120);
            doc.text(`Pagina ${i} de ${pageCount}`, pageWidth - 10, doc.internal.pageSize.getHeight() - 6, { align: 'right' });
        }

        doc.save(getDiariaNomeArquivo('pdf'));
    }

    async function carregarDiariaModal() {
        const semana = selectSemana.value;
        const tbody = document.getElementById('tbodyDiaria');
        if (!semana || !tbody) return;

        tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;">Carregando...</td></tr>';

        try {
            const valorSemana = parseMoedaBR(document.getElementById('diariaValorSemana')?.value);
            const datasSemana = getDatasSemanaISO(semana);

            const [, resFuncionarios, resFaltas, resEscala] = await Promise.all([
                carregarFuncoesCadastroDiaria(),
                supabaseClient
                    .from('funcionario')
                    .select('nome, nome_completo, cpf, funcao, status')
                    .order('nome'),
                aplicarFiltroFilial(supabaseClient
                    .from('faltas_afastamentos')
                    .select('motorista_ausente, motivo_motorista, auxiliar_ausente, motivo_auxiliar, data_escala')
                    .in('data_escala', datasSemana)),
                aplicarFiltroFilial(supabaseClient
                    .from('escala')
                    .select('motorista, auxiliar')
                    .in('data_escala', datasSemana)
                    .not('tipo_escala', 'eq', 'RESERVA'))
            ]);

            if (resFuncionarios.error) throw resFuncionarios.error;
            if (resFaltas.error) throw resFaltas.error;
            if (resEscala.error) throw resEscala.error;
            const descontosAnteriores = await carregarDescontosDiariaAnterior(semana);

            const nomeDiariaMap = new Map();
            (resFuncionarios.data || []).forEach(f => {
                const nomeCurto = cleanImportValue(f.nome) || cleanImportValue(f.nome_completo);
                if (!nomeCurto) return;
                [f.nome, f.nome_completo].forEach(nome => {
                    const key = normalizeString(nome);
                    if (key) nomeDiariaMap.set(key, nomeCurto);
                });
            });
            const getNomeDiaria = (nome) => nomeDiariaMap.get(normalizeString(nome)) || getNomeFuncionarioExibicao(nome);

            const funcionariosEscalados = new Set();
            (resEscala.data || []).forEach(row => {
                [row.motorista, row.auxiliar].forEach(nome => {
                    const nomeDiaria = getNomeDiaria(nome);
                    const key = normalizeString(nomeDiaria);
                    if (key) funcionariosEscalados.add(key);
                });
            });

            const ausencias = new Map();
            (resFaltas.data || []).forEach(row => {
                [
                    { nome: row.motorista_ausente, motivo: row.motivo_motorista },
                    { nome: row.auxiliar_ausente, motivo: row.motivo_auxiliar }
                ].forEach(item => {
                    const nome = getNomeDiaria(item.nome);
                    if (!nome) return;
                    const key = normalizeString(nome);
                    const motivo = cleanImportValue(item.motivo) || 'FALTA';
                    if (!isStatusAusenciaDiaria(motivo) && cleanImportValue(item.motivo)) return;
                    if (!ausencias.has(key)) ausencias.set(key, { dias: new Set(), motivos: new Set() });
                    ausencias.get(key).dias.add(String(row.data_escala || '').slice(0, 10));
                    ausencias.get(key).motivos.add(motivo);
                });
            });

            const funcionarios = (resFuncionarios.data || [])
                .map(f => {
                    const nome = getNomeDiaria(f.nome || f.nome_completo);
                    return {
                        nome,
                        nomeCompleto: cleanImportValue(f.nome_completo),
                        cpf: cleanImportValue(f.cpf),
                        funcao: cleanImportValue(f.funcao),
                        statusCadastro: cleanImportValue(f.status)
                    };
                })
                .filter(f => f.nome)
                .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

            if (funcionarios.length === 0) {
                diariaDadosAtual = [];
                tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;">Nenhum funcionario ativo encontrado para a filial.</td></tr>';
                atualizarResumoDiaria();
                return;
            }

            diariaDadosAtual = funcionarios.map(func => {
                const key = normalizeString(func.nome);
                const ausencia = ausencias.get(normalizeString(func.nome));
                const diasDesconto = ausencia ? ausencia.dias.size : 0;
                const descontoAnterior = descontosAnteriores.get(normalizeString(func.nome)) || 0;
                const datasFalta = ausencia ? [...ausencia.dias].sort().map(formatDataISOBR) : [];
                const foraEscala = !funcionariosEscalados.has(key);
                return recalcularItemDiaria({
                    key,
                    nome: func.nome,
                    nomeCompleto: func.nomeCompleto,
                    cpf: func.cpf,
                    funcao: func.funcao,
                    statusCadastro: func.statusCadastro,
                    status: 'APTO',
                    descricaoStatus: '',
                    datasFalta,
                    motivosAusencia: ausencia ? [...ausencia.motivos] : [],
                    diasDesconto,
                    descontoAnterior,
                    valorPagar: 0,
                    valorDesconto: 0,
                    recebe: true,
                    foraEscala,
                    pagarManual: !foraEscala
                }, valorSemana);
            });

            atualizarFiltroFuncaoDiaria();
            renderDiariaTabela();
        } catch (error) {
            console.error('Erro ao carregar diaria:', error);
            tbody.innerHTML = '<tr><td colspan="10" style="text-align:center; color:#dc3545;">Erro ao carregar diaria.</td></tr>';
        }
    }

    async function salvarDiariaSemana() {
        const semana = selectSemana.value;
        if (!semana) return alert('Selecione uma semana.');
        if (!exigirFilialEscala()) return;

        const valorSemana = parseMoedaBR(document.getElementById('diariaValorSemana')?.value);
        if (valorSemana <= 0) return alert('Informe o valor da diaria semanal.');

        if (diariaDadosAtual.length === 0) return alert('Calcule a diaria antes de salvar.');

        const valorDia = valorSemana / 5;
        const itens = diariaDadosAtual.map(item => ({
            funcionario_nome: item.nome,
            funcao: item.funcao,
            status_diaria: item.status,
            dias_desconto: Number(item.diasDesconto || 0),
            desconto_anterior: Number(item.descontoAnterior || 0),
            valor_pagar: Number(item.valorPagar || 0),
            valor_desconto: Number(item.valorDesconto || 0),
            recebe_diaria: item.recebe
        }));

        const totalDesconto = itens.reduce((sum, item) => sum + item.valor_desconto, 0);
        const totalDescontoAnterior = itens.reduce((sum, item) => sum + item.desconto_anterior, 0);
        const totalPagar = itens.reduce((sum, item) => sum + item.valor_pagar, 0);
        const datasSemana = getDatasSemanaISO(semana);

        try {
            const { data: diaria, error } = await supabaseClient
                .from('escala_diarias')
                .insert([comAuditoria({
                    semana_nome: semana,
                    filial: getFilialEscala(),
                    valor_diaria: valorSemana,
                    valor_dia: valorDia,
                    dias_base: 5,
                    data_inicio: datasSemana[0] || null,
                    data_fim: datasSemana[datasSemana.length - 1] || null,
                    total_funcionarios: itens.length,
                    total_aptos: itens.filter(item => item.recebe_diaria).length,
                    total_bloqueados: itens.filter(item => !item.recebe_diaria).length,
                    total_desconto_anterior: totalDescontoAnterior,
                    total_pagar: totalPagar,
                    total_desconto: totalDesconto
                })])
                .select('id')
                .single();

            if (error) throw error;

            const { error: itensError } = await supabaseClient
                .from('escala_diaria_itens')
                .insert(itens.map(item => comAuditoria({ ...item, diaria_id: diaria.id })));

            if (itensError) throw itensError;

            alert('Diaria registrada com sucesso.');
        } catch (error) {
            console.error('Erro ao salvar diaria:', error);
            alert('Erro ao salvar diaria. Verifique se o script SQL da tabela escala_diarias foi aplicado. Detalhe: ' + error.message);
        }
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
                <div class="terceiro-form-grid terceiro-rota-form-grid">
                    <div class="form-group terceiro-field-card">
                        <label for="terceiroRotaMotorista">Motorista</label>
                        <select id="terceiroRotaMotorista" class="glass-input">
                            <option value="">Selecione motorista da reserva</option>
                        </select>
                        <div id="terceiroRotaMotoristaNota" class="terceiro-note-hint hidden"></div>
                    </div>
                    <div class="form-group terceiro-field-card">
                        <label for="terceiroRotaAuxiliar">Auxiliar</label>
                        <select id="terceiroRotaAuxiliar" class="glass-input">
                            <option value="">Selecione auxiliar da reserva</option>
                        </select>
                        <div id="terceiroRotaAuxiliarNota" class="terceiro-note-hint hidden"></div>
                    </div>
                    <div class="form-group terceiro-field-card terceiro-rota-field">
                        <label for="terceiroRotaNumero">Rota</label>
                        <input type="text" id="terceiroRotaNumero" list="listaRotas" class="glass-input" placeholder="Informe a rota">
                    </div>
                    <button type="button" id="btnAplicarTerceiroRota" class="btn-glass btn-blue terceiro-aplicar-btn">
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
        setupTerceiroRotaGridTools();

        modal.addEventListener('click', (e) => {
            if (e.target === modal || e.target.closest('#btnFecharTerceiroRota')) {
                modal.classList.add('hidden');
            }
        });

        modal.querySelector('#btnAplicarTerceiroRota').addEventListener('click', aplicarTerceiroPorRota);
        modal.querySelector('#tbodyTerceiroRota').addEventListener('click', limparTerceiroDaLinha);
        modal.querySelector('#terceiroRotaMotorista').addEventListener('change', (event) => {
            if (event.target.value) modal.querySelector('#terceiroRotaAuxiliar').value = '';
            atualizarIndicadoresAnotacaoTerceiroRota();
        });
        modal.querySelector('#terceiroRotaAuxiliar').addEventListener('change', (event) => {
            if (event.target.value) modal.querySelector('#terceiroRotaMotorista').value = '';
            atualizarIndicadoresAnotacaoTerceiroRota();
        });

        return modal;
    }

    function registrarAnotacaoFuncionarioReserva(map, nome, anotacao) {
        const chave = normalizeString(getNomeFuncionarioExibicao(nome));
        const texto = (anotacao || '').trim();
        if (chave && texto && !map[chave]) map[chave] = texto;
    }

    function getAnotacaoFuncionarioReserva(map, nome) {
        return map[normalizeString(getNomeFuncionarioExibicao(nome))] || '';
    }

    function criarOptionFuncionarioReserva(nome, anotacao, tipo) {
        const textoAnotacao = (anotacao || '').trim();
        const label = textoAnotacao ? `${nome} [ANOTACAO]` : nome;
        const title = textoAnotacao ? `Anotacao ${tipo}: ${textoAnotacao}` : nome;
        return `<option value="${escapeAttribute(nome)}" title="${escapeAttribute(title)}" data-note="${escapeAttribute(textoAnotacao)}">${escapeAttribute(label)}</option>`;
    }

    function registrarOrigemFuncionarioReserva(map, nome, origem) {
        const chave = normalizeString(getNomeFuncionarioExibicao(nome));
        if (chave && origem?.id && !map[chave]) map[chave] = origem;
    }

    function getOrigemFuncionarioReserva(map, nome) {
        return map[normalizeString(getNomeFuncionarioExibicao(nome))] || null;
    }

    function atualizarIndicadorAnotacaoTerceiroRota(selectId, hintId) {
        const select = document.getElementById(selectId);
        const hint = document.getElementById(hintId);
        if (!select || !hint) return;

        const option = select.selectedOptions?.[0];
        const anotacao = (option?.dataset.note || '').trim();
        select.classList.toggle('terceiro-select-has-note', Boolean(anotacao));
        if (anotacao) {
            select.title = anotacao;
            hint.textContent = anotacao;
            hint.title = anotacao;
            hint.classList.remove('hidden');
        } else {
            select.removeAttribute('title');
            hint.textContent = '';
            hint.removeAttribute('title');
            hint.classList.add('hidden');
        }
    }

    function atualizarIndicadoresAnotacaoTerceiroRota() {
        atualizarIndicadorAnotacaoTerceiroRota('terceiroRotaMotorista', 'terceiroRotaMotoristaNota');
        atualizarIndicadorAnotacaoTerceiroRota('terceiroRotaAuxiliar', 'terceiroRotaAuxiliarNota');
    }

    async function atualizarListaTerceirosReservas() {
        const selectMotorista = document.getElementById('terceiroRotaMotorista');
        const selectAuxiliar = document.getElementById('terceiroRotaAuxiliar');
        if (!selectMotorista || !selectAuxiliar) {
            return { motoristas: [], auxiliares: [], notasMotoristas: {}, notasAuxiliares: {}, origensMotoristas: {}, origensAuxiliares: {} };
        }

        const motoristas = new Set();
        const auxiliares = new Set();
        const notasMotoristas = {};
        const notasAuxiliares = {};
        const origensMotoristas = {};
        const origensAuxiliares = {};
        const adicionarNome = (set, nome) => {
            const exibicao = getNomeFuncionarioExibicao(nome);
            const chave = normalizeString(exibicao);
            if (chave) set.add(exibicao);
        };

        document.querySelectorAll('#tbodyReservas tr').forEach(tr => {
            adicionarNome(motoristas, tr.querySelector('input[data-key="motorista"]')?.value);
            adicionarNome(auxiliares, tr.querySelector('input[data-key="auxiliar"]')?.value);
            registrarAnotacaoFuncionarioReserva(notasMotoristas, tr.querySelector('input[data-key="motorista"]')?.value, getCellNote(tr.dataset.tabela, tr.dataset.id, 'motorista'));
            registrarAnotacaoFuncionarioReserva(notasAuxiliares, tr.querySelector('input[data-key="auxiliar"]')?.value, getCellNote(tr.dataset.tabela, tr.dataset.id, 'auxiliar'));
            registrarOrigemFuncionarioReserva(origensMotoristas, tr.querySelector('input[data-key="motorista"]')?.value, { tabela: tr.dataset.tabela, id: tr.dataset.id, key: 'motorista' });
            registrarOrigemFuncionarioReserva(origensAuxiliares, tr.querySelector('input[data-key="auxiliar"]')?.value, { tabela: tr.dataset.tabela, id: tr.dataset.id, key: 'auxiliar' });
        });

        if (motoristas.size === 0 && auxiliares.size === 0) {
            const contexto = getDataEscalaAberta();
            if (contexto) {
                const { data, error } = await aplicarFiltroSemanaModelo(
                    aplicarFiltroFilial(
                        supabaseClient
                            .from('escala')
                            .select('id, motorista, auxiliar')
                            .eq('data_escala', contexto.dataISO)
                            .eq('tipo_escala', 'RESERVA')
                    ),
                    contexto.semana
                );

                if (error) {
                    console.warn('Reservas para terceiro nao carregadas:', error);
                } else {
                    (data || []).forEach(row => {
                        adicionarNome(motoristas, row.motorista);
                        adicionarNome(auxiliares, row.auxiliar);
                        registrarAnotacaoFuncionarioReserva(notasMotoristas, row.motorista, getCellNote('escala', row.id, 'motorista'));
                        registrarAnotacaoFuncionarioReserva(notasAuxiliares, row.auxiliar, getCellNote('escala', row.id, 'auxiliar'));
                        registrarOrigemFuncionarioReserva(origensMotoristas, row.motorista, { tabela: 'escala', id: row.id, key: 'motorista' });
                        registrarOrigemFuncionarioReserva(origensAuxiliares, row.auxiliar, { tabela: 'escala', id: row.id, key: 'auxiliar' });
                    });
                }
            }
        }

        const listaMotoristas = Array.from(motoristas).sort((a, b) => a.localeCompare(b, 'pt-BR'));
        const listaAuxiliares = Array.from(auxiliares).sort((a, b) => a.localeCompare(b, 'pt-BR'));
        selectMotorista.innerHTML = '<option value="">Selecione motorista da reserva</option>'
            + listaMotoristas
                .map(nome => criarOptionFuncionarioReserva(nome, getAnotacaoFuncionarioReserva(notasMotoristas, nome), 'motorista'))
                .join('');
        selectAuxiliar.innerHTML = '<option value="">Selecione auxiliar da reserva</option>'
            + listaAuxiliares
                .map(nome => criarOptionFuncionarioReserva(nome, getAnotacaoFuncionarioReserva(notasAuxiliares, nome), 'auxiliar'))
                .join('');
        atualizarIndicadoresAnotacaoTerceiroRota();

        return { motoristas: listaMotoristas, auxiliares: listaAuxiliares, notasMotoristas, notasAuxiliares, origensMotoristas, origensAuxiliares };
    }

    async function abrirModalTerceiroRota() {
        const contexto = getDataEscalaAberta();
        if (!contexto) return alert('Abra uma semana e um dia antes de gerenciar terceiros.');

        const modal = ensureModalTerceiroRota();
        modal.querySelector('#terceiroRotaContexto').textContent = `${contexto.dia} - ${contexto.dataBR}`;
        modal.querySelector('#terceiroRotaMotorista').value = '';
        modal.querySelector('#terceiroRotaAuxiliar').value = '';
        modal.querySelector('#terceiroRotaNumero').value = '';
        modal.classList.remove('hidden');
        const terceirosReservas = await atualizarListaTerceirosReservas();
        if (terceirosReservas.motoristas.length === 0) {
            modal.querySelector('#terceiroRotaMotorista').innerHTML = '<option value="">Nenhum motorista disponivel</option>';
        }
        if (terceirosReservas.auxiliares.length === 0) {
            modal.querySelector('#terceiroRotaAuxiliar').innerHTML = '<option value="">Nenhum auxiliar disponivel</option>';
        }
        atualizarIndicadoresAnotacaoTerceiroRota();
        await carregarTerceiroRotaModal();
    }

    async function carregarTerceiroRotaModal() {
        const contexto = getDataEscalaAberta();
        const tbody = document.getElementById('tbodyTerceiroRota');
        if (!contexto || !tbody) return;

        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">Carregando...</td></tr>';

        const { data, error } = await aplicarFiltroSemanaModelo(
            aplicarFiltroFilial(
                supabaseClient
                    .from('escala')
                    .select('id, placa, modelo, rota, motorista, auxiliar, terceiro')
                    .eq('data_escala', contexto.dataISO)
            ),
            contexto.semana
        )
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
        setupTerceiroRotaGridTools();
    }

    async function aplicarTerceiroPorRota() {
        const contexto = getDataEscalaAberta();
        if (!contexto) return;

        const motoristaSelecionado = cleanImportValue(document.getElementById('terceiroRotaMotorista')?.value);
        const auxiliarSelecionado = cleanImportValue(document.getElementById('terceiroRotaAuxiliar')?.value);
        const funcionario = motoristaSelecionado || auxiliarSelecionado;
        const rota = cleanImportValue(document.getElementById('terceiroRotaNumero')?.value, { keepZero: true });

        if (motoristaSelecionado && auxiliarSelecionado) return alert('Selecione apenas motorista ou auxiliar.');
        if (!funcionario) return alert('Selecione um motorista ou auxiliar.');
        if (!rota) return alert('Informe a rota.');

        const terceirosReservas = await atualizarListaTerceirosReservas();
        const listaValida = motoristaSelecionado ? terceirosReservas.motoristas : terceirosReservas.auxiliares;
        if (!listaValida.some(nome => normalizeString(nome) === normalizeString(funcionario))) {
            return alert('Selecione um motorista ou auxiliar disponivel na secao RESERVAS.');
        }

        const { data, error } = await aplicarFiltroSemanaModelo(
            supabaseClient
                .from('escala')
                .update(comAuditoria({ terceiro: funcionario }))
                .eq('data_escala', contexto.dataISO)
                .eq('filial', getFilialEscala())
                .eq('rota', rota),
            contexto.semana
        ).select('id');

        if (error) {
            console.error('Erro ao aplicar terceiro por rota:', error);
            return alert('Erro ao aplicar terceiro: ' + error.message);
        }

        if (!data || data.length === 0) {
            return alert(`Nenhuma linha encontrada para a rota ${rota} nesta data.`);
        }

        const origemFuncionario = motoristaSelecionado
            ? getOrigemFuncionarioReserva(terceirosReservas.origensMotoristas, funcionario)
            : getOrigemFuncionarioReserva(terceirosReservas.origensAuxiliares, funcionario);
        const anotacaoOrigem = origemFuncionario
            ? getCellNote(origemFuncionario.tabela, origemFuncionario.id, origemFuncionario.key)
            : '';

        if (origemFuncionario) {
            const { error: limparOrigemError } = await supabaseClient
                .from(origemFuncionario.tabela)
                .update(comAuditoria({ [origemFuncionario.key]: null, rota: null }))
                .eq('id', origemFuncionario.id);

            if (limparOrigemError) {
                console.error('Erro ao remover funcionario da reserva:', limparOrigemError);
                return alert('Terceiro aplicado, mas nao foi possivel remover o funcionario da reserva: ' + limparOrigemError.message);
            }

            if (anotacaoOrigem) {
                setCellNote(origemFuncionario.tabela, origemFuncionario.id, origemFuncionario.key, '');
                data.forEach(item => setCellNote('escala', item.id, 'terceiro', anotacaoOrigem));
            }

            const inputOrigem = document.querySelector(`#tbodyReservas tr[data-id="${CSS.escape(String(origemFuncionario.id))}"] input[data-key="${origemFuncionario.key}"]`);
            if (inputOrigem) {
                inputOrigem.value = '';
                inputOrigem.classList.remove('cell-has-note', 'cell-duplicate');
                inputOrigem.removeAttribute('title');
                inputOrigem.style.cssText = getCellStyle(origemFuncionario.tabela, origemFuncionario.id, origemFuncionario.key);
            }

            const inputRotaOrigem = document.querySelector(`#tbodyReservas tr[data-id="${CSS.escape(String(origemFuncionario.id))}"] input[data-key="rota"]`);
            if (inputRotaOrigem) {
                inputRotaOrigem.value = '';
                inputRotaOrigem.classList.remove('cell-duplicate');
                if (inputRotaOrigem.title === 'Registro repetido') inputRotaOrigem.removeAttribute('title');
                inputRotaOrigem.style.cssText = getCellStyle(origemFuncionario.tabela, origemFuncionario.id, 'rota');
            }
        }

        alert(`Terceiro aplicado em ${data.length} linha(s) da rota ${rota}.`);
        const inputRotaModal = document.getElementById('terceiroRotaNumero');
        if (inputRotaModal) inputRotaModal.value = '';
        await atualizarListaTerceirosReservas();
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
            .update(comAuditoria({ terceiro: null }))
            .eq('id', btn.dataset.id);

        if (error) {
            console.error('Erro ao limpar terceiro:', error);
            return alert('Erro ao limpar terceiro: ' + error.message);
        }

        await carregarTerceiroRotaModal();
        carregarDadosDia(contexto.dia, contexto.semana);
    }

    const FALTAS_MOTIVOS_PADRAO = ['FALTA', 'FERIAS', 'AFASTADO', 'ATESTADO', 'SUSPENSAO', 'FOLGA', 'OUTROS'];
    const TROCA_FUNCIONARIO_MOTIVOS = ['FALTA', 'RESERVA', 'FERIAS', 'AFASTADO', 'ATESTADO', 'SUSPENSAO', 'FOLGA', 'OUTROS'];

    function ensureModalFaltasFuncionarios() {
        let modal = document.getElementById('modalFaltasFuncionarios');
        if (modal) return modal;

        modal = document.createElement('div');
        modal.id = 'modalFaltasFuncionarios';
        modal.className = 'terceiro-modal hidden';
        modal.innerHTML = `
            <div class="terceiro-modal-content faltas-modal-content">
                <div class="terceiro-modal-header faltas-modal-header">
                    <h3><i class="fa-solid fa-user-slash"></i> Faltas / Ferias / Afastados</h3>
                    <button type="button" id="btnFecharFaltasFuncionarios" class="terceiro-modal-close" title="Fechar">&times;</button>
                </div>
                <div class="terceiro-modal-subtitle" id="faltasFuncionariosContexto"></div>
                <div class="terceiro-form-grid faltas-form-grid">
                    <div class="form-group">
                        <label for="faltasTipoFuncionario">Atividade</label>
                        <select id="faltasTipoFuncionario" class="glass-input">
                            <option value="TODOS">Todos</option>
                            <option value="motorista">Motoristas</option>
                            <option value="auxiliar">Auxiliares</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="faltasFuncionario">Funcionario</label>
                        <input type="text" id="faltasFuncionario" class="glass-input" placeholder="Digite para buscar">
                        <input type="hidden" id="faltasFuncionarioOrigem">
                        <div id="faltasFuncionarioSugestoes" class="faltas-suggestions hidden"></div>
                    </div>
                    <div class="form-group">
                        <label for="faltasMotivo">Motivo</label>
                        <select id="faltasMotivo" class="glass-input">
                            ${FALTAS_MOTIVOS_PADRAO.map(motivo => `<option value="${motivo}">${motivo}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="faltasComplemento">Detalhe</label>
                        <input type="text" id="faltasComplemento" class="glass-input" placeholder="Opcional">
                    </div>
                    <button type="button" id="btnAplicarFaltasFuncionario" class="btn-glass btn-red faltas-aplicar-btn">
                        <i class="fa-solid fa-check"></i> Aplicar
                    </button>
                </div>
                <div class="faltas-modal-grid">
                    <div class="faltas-modal-panel">
                        <h4>Funcionarios disponiveis</h4>
                        <div class="terceiro-table-wrap">
                            <table class="data-grid faltas-table">
                                <thead>
                                    <tr>
                                        <th>ATIVIDADE</th>
                                        <th>FUNCAO</th>
                                        <th>FUNCIONARIO</th>
                                        <th>ROTA</th>
                                        <th>PLACA</th>
                                        <th>ACAO</th>
                                    </tr>
                                </thead>
                                <tbody id="tbodyFaltasDisponiveis"></tbody>
                            </table>
                        </div>
                    </div>
                    <div class="faltas-modal-panel">
                        <h4>Faltas lancadas</h4>
                        <div class="terceiro-table-wrap">
                            <table class="data-grid faltas-table">
                                <thead>
                                    <tr>
                                        <th>MOTORISTA</th>
                                        <th>MOTIVO MOTORISTA</th>
                                        <th>AUXILIAR</th>
                                        <th>MOTIVO AUXILIAR</th>
                                    </tr>
                                </thead>
                                <tbody id="tbodyFaltasLancadasModal"></tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        modal.addEventListener('click', (e) => {
            if (e.target === modal || e.target.closest('#btnFecharFaltasFuncionarios')) {
                modal.classList.add('hidden');
                return;
            }

            const btnSelecionar = e.target.closest('.btn-selecionar-falta');
            if (btnSelecionar) {
                selecionarFuncionarioFalta(btnSelecionar.dataset.origem || '');
                return;
            }

            const sugestao = e.target.closest('.faltas-suggestion-item');
            if (sugestao) {
                selecionarFuncionarioFalta(sugestao.dataset.origem || '');
            }
        });

        modal.querySelector('#faltasTipoFuncionario').addEventListener('change', () => carregarFaltasFuncionariosModal());
        modal.querySelector('#faltasFuncionario').addEventListener('input', () => carregarFaltasFuncionariosModal());
        modal.querySelector('#btnAplicarFaltasFuncionario').addEventListener('click', aplicarFaltaFuncionario);

        return modal;
    }

    function getFaltasLancadasNomes() {
        const nomes = new Set();
        document.querySelectorAll('#tbodyFaltas input[data-key="motorista_ausente"], #tbodyFaltas input[data-key="auxiliar_ausente"]').forEach(input => {
            const chave = normalizeString(input.value);
            if (chave) nomes.add(chave);
        });
        return nomes;
    }

    function coletarFuncionariosDisponiveisFaltas() {
        const lancados = getFaltasLancadasNomes();
        const secoes = [
            { id: 'tbodyPadrao', label: 'PADRAO' },
            { id: 'tbodyTransferencia', label: 'TRANSFERENCIA CD' },
            { id: 'tbodyEquipamento', label: 'EQUIPAMENTO' },
            { id: 'tbodyReservas', label: 'RESERVAS' }
        ];
        const funcionarios = [];

        secoes.forEach(secao => {
            document.querySelectorAll(`#${secao.id} tr[data-id][data-tabela]`).forEach(tr => {
                ['motorista', 'auxiliar'].forEach(funcao => {
                    const input = tr.querySelector(`input[data-key="${funcao}"]`);
                    const nome = getNomeFuncionarioExibicao(input?.value);
                    const chave = normalizeString(nome);
                    if (!chave || lancados.has(chave)) return;

                    const origem = `${tr.dataset.tabela}:${tr.dataset.id}:${funcao}`;
                    funcionarios.push({
                        origem,
                        tabela: tr.dataset.tabela,
                        id: tr.dataset.id,
                        funcao,
                        funcaoLabel: funcao === 'motorista' ? 'MOTORISTA' : 'AUXILIAR',
                        nome,
                        atividade: secao.label,
                        rota: cleanImportValue(tr.querySelector('input[data-key="rota"]')?.value, { keepZero: true }),
                        placa: tr.querySelector('input[data-key="placa"]')?.value || '',
                        modelo: tr.querySelector('input[data-key="modelo"]')?.value || ''
                    });
                });
            });
        });

        return funcionarios.sort((a, b) => {
            const atividade = a.atividade.localeCompare(b.atividade, 'pt-BR');
            if (atividade !== 0) return atividade;
            const funcao = a.funcaoLabel.localeCompare(b.funcaoLabel, 'pt-BR');
            if (funcao !== 0) return funcao;
            return a.nome.localeCompare(b.nome, 'pt-BR');
        });
    }

    async function abrirModalFaltasFuncionarios() {
        const contexto = getDataEscalaAberta();
        if (!contexto) return alert('Abra uma semana e um dia antes de aplicar faltas.');

        const modal = ensureModalFaltasFuncionarios();
        modal.querySelector('#faltasFuncionariosContexto').textContent = `${contexto.dia} - ${contexto.dataBR}`;
        modal.querySelector('#faltasTipoFuncionario').value = 'TODOS';
        modal.querySelector('#faltasFuncionario').value = '';
        modal.querySelector('#faltasFuncionarioOrigem').value = '';
        modal.querySelector('#faltasFuncionarioSugestoes').classList.add('hidden');
        modal.querySelector('#faltasMotivo').value = 'FALTA';
        modal.querySelector('#faltasComplemento').value = '';
        modal.classList.remove('hidden');
        await carregarFaltasFuncionariosModal();
    }

    function getFuncionariosFaltasFiltrados({ ignorarTermo = false } = {}) {
        const modal = ensureModalFaltasFuncionarios();
        const filtroFuncao = modal.querySelector('#faltasTipoFuncionario')?.value || 'TODOS';
        const termo = ignorarTermo ? '' : normalizeString(modal.querySelector('#faltasFuncionario')?.value);
        return coletarFuncionariosDisponiveisFaltas()
            .filter(item => filtroFuncao === 'TODOS' || item.funcao === filtroFuncao)
            .filter(item => !termo
                || normalizeString(item.nome).includes(termo)
                || normalizeString(item.atividade).includes(termo)
                || normalizeString(item.rota).includes(termo)
                || normalizeVehiclePlate(item.placa).includes(normalizeVehiclePlate(termo)));
    }

    function selecionarFuncionarioFalta(origemSelecionada) {
        const modal = ensureModalFaltasFuncionarios();
        const funcionario = coletarFuncionariosDisponiveisFaltas().find(item => item.origem === origemSelecionada);
        if (!funcionario) return;

        modal.querySelector('#faltasFuncionario').value = `${funcionario.nome}${funcionario.rota ? ` - Rota ${funcionario.rota}` : ''}`;
        modal.querySelector('#faltasFuncionarioOrigem').value = funcionario.origem;
        modal.querySelector('#faltasTipoFuncionario').value = funcionario.funcao;
        modal.querySelector('#faltasFuncionarioSugestoes').classList.add('hidden');
        carregarFaltasFuncionariosModal(funcionario.origem);
    }

    async function carregarFaltasFuncionariosModal(origemSelecionada = '') {
        const modal = ensureModalFaltasFuncionarios();
        const inputFuncionario = modal.querySelector('#faltasFuncionario');
        const inputOrigem = modal.querySelector('#faltasFuncionarioOrigem');
        const sugestoes = modal.querySelector('#faltasFuncionarioSugestoes');
        const tbodyDisponiveis = modal.querySelector('#tbodyFaltasDisponiveis');
        const tbodyLancadas = modal.querySelector('#tbodyFaltasLancadasModal');
        if (!inputFuncionario || !inputOrigem || !sugestoes || !tbodyDisponiveis || !tbodyLancadas) return;

        if (inputFuncionario.value && !origemSelecionada) inputOrigem.value = '';
        if (origemSelecionada) inputOrigem.value = origemSelecionada;
        else if (inputOrigem.value && !inputFuncionario.value) inputOrigem.value = '';

        const origemAtual = inputOrigem.value;
        const funcionarios = getFuncionariosFaltasFiltrados({ ignorarTermo: Boolean(origemSelecionada) });

        sugestoes.innerHTML = funcionarios.slice(0, 30).map(item => `
            <button type="button" class="faltas-suggestion-item ${item.origem === origemAtual ? 'selected' : ''}" data-origem="${escapeAttribute(item.origem)}">
                <strong>${escapeAttribute(item.nome)}</strong>
                <span>${escapeAttribute(item.atividade)} - ${escapeAttribute(item.funcaoLabel)}${item.rota ? ` - Rota ${escapeAttribute(item.rota)}` : ''}</span>
            </button>
        `).join('');
        sugestoes.classList.toggle('hidden', Boolean(origemSelecionada) || !inputFuncionario.value || funcionarios.length === 0);

        tbodyDisponiveis.innerHTML = funcionarios.length
            ? funcionarios.map(item => `
                <tr>
                    <td>${escapeAttribute(item.atividade)}</td>
                    <td>${escapeAttribute(item.funcaoLabel)}</td>
                    <td>${escapeAttribute(item.nome)}</td>
                    <td>${escapeAttribute(item.rota || '')}</td>
                    <td>${escapeAttribute(item.placa || '')}</td>
                    <td class="actions-cell">
                        <button type="button" class="btn-icon edit btn-selecionar-falta" data-origem="${escapeAttribute(item.origem)}" data-funcao="${item.funcao}" title="Selecionar funcionario">
                            <i class="fas fa-check"></i>
                        </button>
                    </td>
                </tr>
            `).join('')
            : '<tr><td colspan="6" style="text-align:center;">Nenhum funcionario disponivel para este filtro.</td></tr>';

        const linhasFaltas = Array.from(document.querySelectorAll('#tbodyFaltas tr[data-id]'));
        tbodyLancadas.innerHTML = linhasFaltas.length
            ? linhasFaltas.map(tr => `
                <tr>
                    <td>${escapeAttribute(tr.querySelector('input[data-key="motorista_ausente"]')?.value || '')}</td>
                    <td>${escapeAttribute(tr.querySelector('[data-key="motivo_motorista"]')?.textContent || '')}</td>
                    <td>${escapeAttribute(tr.querySelector('input[data-key="auxiliar_ausente"]')?.value || '')}</td>
                    <td>${escapeAttribute(tr.querySelector('[data-key="motivo_auxiliar"]')?.textContent || '')}</td>
                </tr>
            `).join('')
            : '<tr><td colspan="4" style="text-align:center;">Nenhuma falta lancada para esta data.</td></tr>';
    }

    async function aplicarFaltaFuncionario() {
        const contexto = getDataEscalaAberta();
        if (!contexto) return;

        const modal = ensureModalFaltasFuncionarios();
        const origemSelecionada = modal.querySelector('#faltasFuncionarioOrigem')?.value;
        if (!origemSelecionada) return alert('Selecione um funcionario da lista.');

        const funcionarioSelecionado = coletarFuncionariosDisponiveisFaltas().find(item => item.origem === origemSelecionada);
        if (!funcionarioSelecionado) return alert('Funcionario nao esta mais disponivel para lancamento.');

        const origem = origemSelecionada.split(':');
        const [tabelaOrigem, idOrigem, keyOrigem] = origem;
        const nome = funcionarioSelecionado.nome;
        const motivoBase = cleanImportValue(modal.querySelector('#faltasMotivo')?.value) || 'FALTA';
        const complemento = cleanImportValue(modal.querySelector('#faltasComplemento')?.value);
        const motivo = complemento ? `${motivoBase} - ${complemento}` : motivoBase;

        if (!tabelaOrigem || !idOrigem || !['motorista', 'auxiliar'].includes(keyOrigem)) {
            return alert('Origem do funcionario invalida.');
        }

        const payload = comAuditoria({
            semana_nome: contexto.semana,
            data_escala: contexto.dataISO,
            filial: getFilialEscala()
        });
        const campoFalta = keyOrigem === 'motorista' ? 'motorista_ausente' : 'auxiliar_ausente';
        const campoMotivo = keyOrigem === 'motorista' ? 'motivo_motorista' : 'motivo_auxiliar';
        payload[campoFalta] = nome;
        payload[campoMotivo] = motivo;

        const anotacaoOrigem = getCellNote(tabelaOrigem, idOrigem, keyOrigem);

        const { data: faltaInserida, error: insertError } = await supabaseClient
            .from('faltas_afastamentos')
            .insert([payload])
            .select('id')
            .single();

        if (insertError) {
            console.error('Erro ao lancar falta:', insertError);
            return alert('Erro ao lancar falta: ' + insertError.message);
        }

        const { error: limparOrigemError } = await supabaseClient
            .from(tabelaOrigem)
            .update(comAuditoria({ [keyOrigem]: null }))
            .eq('id', idOrigem);

        if (limparOrigemError) {
            console.error('Erro ao remover funcionario da origem:', limparOrigemError);
            if (faltaInserida?.id) {
                await supabaseClient
                    .from('faltas_afastamentos')
                    .delete()
                    .eq('id', faltaInserida.id);
            }
            return alert('Falta lancada, mas nao foi possivel remover o funcionario da linha anterior: ' + limparOrigemError.message);
        }

        if (anotacaoOrigem) {
            setCellNote(tabelaOrigem, idOrigem, keyOrigem, '');
            if (faltaInserida?.id) setCellNote('faltas_afastamentos', faltaInserida.id, campoFalta, anotacaoOrigem);
        }

        const inputOrigem = document.querySelector(`#painelEscala tr[data-tabela="${tabelaOrigem}"][data-id="${CSS.escape(String(idOrigem))}"] input[data-key="${keyOrigem}"]`);
        if (inputOrigem) {
            inputOrigem.value = '';
            inputOrigem.classList.remove('cell-has-note', 'cell-duplicate');
            inputOrigem.removeAttribute('title');
            inputOrigem.style.cssText = getCellStyle(tabelaOrigem, idOrigem, keyOrigem);
        }

        modal.querySelector('#faltasFuncionario').value = '';
        modal.querySelector('#faltasFuncionarioOrigem').value = '';
        modal.querySelector('#faltasFuncionarioSugestoes').classList.add('hidden');
        modal.querySelector('#faltasComplemento').value = '';
        await carregarDadosDia(contexto.dia, contexto.semana);
        await carregarFaltasFuncionariosModal();
        alert(`${nome} lancado em ${motivo}.`);
    }

    function ensureModalTrocaFuncionario() {
        let modal = document.getElementById('modalTrocaFuncionario');
        if (modal) return modal;

        modal = document.createElement('div');
        modal.id = 'modalTrocaFuncionario';
        modal.className = 'terceiro-modal hidden';
        modal.innerHTML = `
            <div class="terceiro-modal-content faltas-modal-content troca-funcionario-modal-content">
                <div class="terceiro-modal-header faltas-modal-header">
                    <h3><i class="fa-solid fa-user-pen"></i> Troca de Motorista / Auxiliar</h3>
                    <button type="button" id="btnFecharTrocaFuncionario" class="terceiro-modal-close" title="Fechar">&times;</button>
                </div>
                <div class="terceiro-modal-subtitle" id="trocaFuncionarioContexto"></div>
                <div class="terceiro-form-grid troca-funcionario-form-grid">
                    <div class="form-group">
                        <label for="trocaFuncionarioTipo">Tipo</label>
                        <select id="trocaFuncionarioTipo" class="glass-input">
                            <option value="TODOS">Todos</option>
                            <option value="motorista">Motorista</option>
                            <option value="auxiliar">Auxiliar</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="trocaFuncionarioMotivo">Motivo</label>
                        <select id="trocaFuncionarioMotivo" class="glass-input">
                            ${TROCA_FUNCIONARIO_MOTIVOS.map(motivo => `<option value="${motivo}">${motivo}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="trocaFuncionarioOrigemTexto">Funcionario que saiu</label>
                        <input type="text" id="trocaFuncionarioOrigemTexto" class="glass-input" placeholder="Digite nome, rota ou placa">
                        <input type="hidden" id="trocaFuncionarioOrigem">
                        <div id="trocaFuncionarioOrigemSugestoes" class="faltas-suggestions hidden"></div>
                    </div>
                    <div class="form-group">
                        <label for="trocaFuncionarioSubstitutoTexto">Substituto em RESERVAS</label>
                        <input type="text" id="trocaFuncionarioSubstitutoTexto" class="glass-input" placeholder="Digite nome, rota ou placa">
                        <input type="hidden" id="trocaFuncionarioSubstituto">
                        <div id="trocaFuncionarioSubstitutoSugestoes" class="faltas-suggestions hidden"></div>
                    </div>
                    <div class="form-group">
                        <label for="trocaFuncionarioComplemento">Detalhe</label>
                        <input type="text" id="trocaFuncionarioComplemento" class="glass-input" placeholder="Opcional">
                    </div>
                    <button type="button" id="btnAplicarTrocaFuncionario" class="btn-glass btn-green faltas-aplicar-btn">
                        <i class="fa-solid fa-check"></i> Aplicar troca
                    </button>
                </div>
                <div class="faltas-modal-grid">
                    <div class="faltas-modal-panel">
                        <h4>Escala atual</h4>
                        <div class="terceiro-table-wrap">
                            <table class="data-grid faltas-table">
                                <thead>
                                    <tr>
                                        <th>ATIVIDADE</th>
                                        <th>FUNCAO</th>
                                        <th>FUNCIONARIO</th>
                                        <th>ROTA</th>
                                        <th>PLACA</th>
                                    </tr>
                                </thead>
                                <tbody id="tbodyTrocaFuncionarioOrigem"></tbody>
                            </table>
                        </div>
                    </div>
                    <div class="faltas-modal-panel">
                        <h4>Reservas disponiveis</h4>
                        <div class="terceiro-table-wrap">
                            <table class="data-grid faltas-table">
                                <thead>
                                    <tr>
                                        <th>FUNCAO</th>
                                        <th>FUNCIONARIO</th>
                                        <th>ROTA</th>
                                        <th>PLACA</th>
                                    </tr>
                                </thead>
                                <tbody id="tbodyTrocaFuncionarioReservas"></tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        modal.addEventListener('click', (e) => {
            if (e.target === modal || e.target.closest('#btnFecharTrocaFuncionario')) {
                modal.classList.add('hidden');
            }
        });
        modal.querySelector('#trocaFuncionarioTipo').addEventListener('change', () => {
            modal.querySelector('#trocaFuncionarioOrigem').value = '';
            modal.querySelector('#trocaFuncionarioOrigemTexto').value = '';
            modal.querySelector('#trocaFuncionarioSubstituto').value = '';
            modal.querySelector('#trocaFuncionarioSubstitutoTexto').value = '';
            carregarTrocaFuncionarioModal();
        });
        modal.querySelector('#trocaFuncionarioOrigemTexto').addEventListener('input', () => {
            modal.querySelector('#trocaFuncionarioOrigem').value = '';
            modal.querySelector('#trocaFuncionarioSubstituto').value = '';
            modal.querySelector('#trocaFuncionarioSubstitutoTexto').value = '';
            carregarTrocaFuncionarioModal();
        });
        modal.querySelector('#trocaFuncionarioSubstitutoTexto').addEventListener('input', () => {
            modal.querySelector('#trocaFuncionarioSubstituto').value = '';
            carregarTrocaFuncionarioModal();
        });
        modal.querySelector('#btnAplicarTrocaFuncionario').addEventListener('click', aplicarTrocaFuncionario);

        modal.addEventListener('click', (e) => {
            const sugestao = e.target.closest('.troca-funcionario-origem-sugestao');
            if (sugestao) selecionarOrigemTrocaFuncionario(sugestao.dataset.origem || '');

            const sugestaoSubstituto = e.target.closest('.troca-funcionario-substituto-sugestao');
            if (sugestaoSubstituto) selecionarSubstitutoTrocaFuncionario(sugestaoSubstituto.dataset.origem || '');
        });

        return modal;
    }

    async function abrirModalTrocaFuncionario() {
        const contexto = getDataEscalaAberta();
        if (!contexto) return alert('Abra uma semana e um dia antes de trocar funcionario.');

        const modal = ensureModalTrocaFuncionario();
        modal.querySelector('#trocaFuncionarioContexto').textContent = `${contexto.dia} - ${contexto.dataBR}`;
        modal.querySelector('#trocaFuncionarioTipo').value = 'TODOS';
        modal.querySelector('#trocaFuncionarioOrigem').value = '';
        modal.querySelector('#trocaFuncionarioOrigemTexto').value = '';
        modal.querySelector('#trocaFuncionarioSubstituto').value = '';
        modal.querySelector('#trocaFuncionarioSubstitutoTexto').value = '';
        modal.querySelector('#trocaFuncionarioMotivo').value = 'FALTA';
        modal.querySelector('#trocaFuncionarioComplemento').value = '';
        modal.classList.remove('hidden');
        carregarTrocaFuncionarioModal();
    }

    function coletarFuncionariosTrocaOrigem() {
        const secoes = [
            { id: 'tbodyPadrao', label: 'PADRAO' },
            { id: 'tbodyTransferencia', label: 'TRANSFERENCIA CD' },
            { id: 'tbodyEquipamento', label: 'EQUIPAMENTO' }
        ];
        const funcionarios = [];

        secoes.forEach(secao => {
            document.querySelectorAll(`#${secao.id} tr[data-id][data-tabela]`).forEach(tr => {
                ['motorista', 'auxiliar'].forEach(funcao => {
                    const input = tr.querySelector(`input[data-key="${funcao}"]`);
                    const nome = getNomeFuncionarioExibicao(input?.value);
                    if (!normalizeString(nome)) return;

                    funcionarios.push({
                        origem: `${tr.dataset.tabela}:${tr.dataset.id}:${funcao}`,
                        tabela: tr.dataset.tabela,
                        id: tr.dataset.id,
                        funcao,
                        funcaoLabel: funcao === 'motorista' ? 'MOTORISTA' : 'AUXILIAR',
                        nome,
                        atividade: secao.label,
                        rota: cleanImportValue(tr.querySelector('input[data-key="rota"]')?.value, { keepZero: true }),
                        placa: tr.querySelector('input[data-key="placa"]')?.value || '',
                        modelo: tr.querySelector('input[data-key="modelo"]')?.value || ''
                    });
                });
            });
        });

        return funcionarios.sort((a, b) => {
            const rota = String(a.rota || '').localeCompare(String(b.rota || ''), 'pt-BR', { numeric: true });
            if (rota !== 0) return rota;
            return a.nome.localeCompare(b.nome, 'pt-BR');
        });
    }

    function coletarReservasTrocaFuncionario(funcaoFiltro = '') {
        const reservas = [];
        document.querySelectorAll('#tbodyReservas tr[data-id][data-tabela]').forEach(tr => {
            ['motorista', 'auxiliar'].forEach(funcao => {
                if (funcaoFiltro && funcao !== funcaoFiltro) return;
                const input = tr.querySelector(`input[data-key="${funcao}"]`);
                const nome = getNomeFuncionarioExibicao(input?.value);
                if (!normalizeString(nome)) return;

                reservas.push({
                    origem: `${tr.dataset.tabela}:${tr.dataset.id}:${funcao}`,
                    tabela: tr.dataset.tabela,
                    id: tr.dataset.id,
                    funcao,
                    funcaoLabel: funcao === 'motorista' ? 'MOTORISTA' : 'AUXILIAR',
                    nome,
                    rota: cleanImportValue(tr.querySelector('input[data-key="rota"]')?.value, { keepZero: true }),
                    placa: tr.querySelector('input[data-key="placa"]')?.value || '',
                    outroMotorista: getNomeFuncionarioExibicao(tr.querySelector('input[data-key="motorista"]')?.value),
                    outroAuxiliar: getNomeFuncionarioExibicao(tr.querySelector('input[data-key="auxiliar"]')?.value)
                });
            });
        });

        return reservas.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    }

    function carregarTrocaFuncionarioModal() {
        const modal = ensureModalTrocaFuncionario();
        const filtroTipo = modal.querySelector('#trocaFuncionarioTipo')?.value || 'TODOS';
        const inputOrigemTexto = modal.querySelector('#trocaFuncionarioOrigemTexto');
        const inputOrigem = modal.querySelector('#trocaFuncionarioOrigem');
        const sugestoesOrigem = modal.querySelector('#trocaFuncionarioOrigemSugestoes');
        const inputSubstitutoTexto = modal.querySelector('#trocaFuncionarioSubstitutoTexto');
        const inputSubstituto = modal.querySelector('#trocaFuncionarioSubstituto');
        const sugestoesSubstituto = modal.querySelector('#trocaFuncionarioSubstitutoSugestoes');
        const tbodyOrigem = modal.querySelector('#tbodyTrocaFuncionarioOrigem');
        const tbodyReservas = modal.querySelector('#tbodyTrocaFuncionarioReservas');
        const origemSelecionadaAtual = inputOrigem?.value || '';
        const termoOrigem = origemSelecionadaAtual ? '' : normalizeString(inputOrigemTexto?.value);
        const origens = coletarFuncionariosTrocaOrigem()
            .filter(item => filtroTipo === 'TODOS' || item.funcao === filtroTipo)
            .filter(item => !termoOrigem
                || normalizeString(item.nome).includes(termoOrigem)
                || normalizeString(item.funcaoLabel).includes(termoOrigem)
                || normalizeString(item.rota).includes(termoOrigem)
                || normalizeVehiclePlate(item.placa).includes(normalizeVehiclePlate(termoOrigem)));

        if (inputOrigem.value && !origens.some(item => item.origem === inputOrigem.value)) {
            inputOrigem.value = '';
        }

        const origemSelecionada = coletarFuncionariosTrocaOrigem().find(item => item.origem === inputOrigem.value);
        const substitutoSelecionadoAtual = inputSubstituto?.value || '';
        const termoSubstituto = substitutoSelecionadoAtual ? '' : normalizeString(inputSubstitutoTexto?.value);
        const reservas = coletarReservasTrocaFuncionario(origemSelecionada?.funcao || '')
            .filter(item => !termoSubstituto
                || normalizeString(item.nome).includes(termoSubstituto)
                || normalizeString(item.funcaoLabel).includes(termoSubstituto)
                || normalizeString(item.rota).includes(termoSubstituto)
                || normalizeVehiclePlate(item.placa).includes(normalizeVehiclePlate(termoSubstituto)));

        if (inputSubstituto.value && !reservas.some(item => item.origem === inputSubstituto.value)) {
            inputSubstituto.value = '';
        }

        sugestoesOrigem.innerHTML = origens.slice(0, 35).map(item => `
            <button type="button" class="faltas-suggestion-item troca-funcionario-origem-sugestao ${item.origem === inputOrigem.value ? 'selected' : ''}" data-origem="${escapeAttribute(item.origem)}">
                <strong>${escapeAttribute(item.nome)}</strong>
                <span>${escapeAttribute(item.funcaoLabel)}${item.rota ? ` - Rota ${escapeAttribute(item.rota)}` : ''}${item.placa ? ` - ${escapeAttribute(item.placa)}` : ''}</span>
            </button>
        `).join('');
        sugestoesOrigem.classList.toggle('hidden', !inputOrigemTexto.value || origens.length === 0 || Boolean(inputOrigem.value));

        sugestoesSubstituto.innerHTML = reservas.slice(0, 35).map(item => `
            <button type="button" class="faltas-suggestion-item troca-funcionario-substituto-sugestao ${item.origem === inputSubstituto.value ? 'selected' : ''}" data-origem="${escapeAttribute(item.origem)}">
                <strong>${escapeAttribute(item.nome)}</strong>
                <span>${escapeAttribute(item.funcaoLabel)}${item.rota ? ` - Reserva rota ${escapeAttribute(item.rota)}` : ''}${item.placa ? ` - ${escapeAttribute(item.placa)}` : ''}</span>
            </button>
        `).join('');
        sugestoesSubstituto.classList.toggle('hidden', !inputSubstitutoTexto.value || reservas.length === 0 || Boolean(inputSubstituto.value));

        tbodyOrigem.innerHTML = origens.length
            ? origens.map(item => `
                <tr>
                    <td>${escapeAttribute(item.atividade)}</td>
                    <td>${escapeAttribute(item.funcaoLabel)}</td>
                    <td>${escapeAttribute(item.nome)}</td>
                    <td>${escapeAttribute(item.rota || '')}</td>
                    <td>${escapeAttribute(item.placa || '')}</td>
                </tr>
            `).join('')
            : '<tr><td colspan="5" style="text-align:center;">Nenhum motorista ou auxiliar na escala atual.</td></tr>';

        tbodyReservas.innerHTML = reservas.length
            ? reservas.map(item => `
                <tr>
                    <td>${escapeAttribute(item.funcaoLabel)}</td>
                    <td>${escapeAttribute(item.nome)}</td>
                    <td>${escapeAttribute(item.rota || '')}</td>
                    <td>${escapeAttribute(item.placa || '')}</td>
                </tr>
            `).join('')
            : '<tr><td colspan="4" style="text-align:center;">Nenhum substituto disponivel em RESERVAS para esta funcao.</td></tr>';
    }

    function selecionarOrigemTrocaFuncionario(origemSelecionada) {
        const modal = ensureModalTrocaFuncionario();
        const funcionario = coletarFuncionariosTrocaOrigem().find(item => item.origem === origemSelecionada);
        if (!funcionario) return;

        modal.querySelector('#trocaFuncionarioOrigem').value = funcionario.origem;
        modal.querySelector('#trocaFuncionarioOrigemTexto').value = `${funcionario.nome}${funcionario.rota ? ` - Rota ${funcionario.rota}` : ''}${funcionario.placa ? ` - ${funcionario.placa}` : ''}`;
        modal.querySelector('#trocaFuncionarioTipo').value = funcionario.funcao;
        modal.querySelector('#trocaFuncionarioSubstituto').value = '';
        modal.querySelector('#trocaFuncionarioSubstitutoTexto').value = '';
        modal.querySelector('#trocaFuncionarioOrigemSugestoes').classList.add('hidden');
        carregarTrocaFuncionarioModal();
    }

    function selecionarSubstitutoTrocaFuncionario(origemSelecionada) {
        const modal = ensureModalTrocaFuncionario();
        const origem = coletarFuncionariosTrocaOrigem().find(item => item.origem === (modal.querySelector('#trocaFuncionarioOrigem')?.value || ''));
        const substituto = coletarReservasTrocaFuncionario(origem?.funcao || '').find(item => item.origem === origemSelecionada);
        if (!substituto) return;

        modal.querySelector('#trocaFuncionarioSubstituto').value = substituto.origem;
        modal.querySelector('#trocaFuncionarioSubstitutoTexto').value = `${substituto.nome}${substituto.rota ? ` - Reserva rota ${substituto.rota}` : ''}${substituto.placa ? ` - ${substituto.placa}` : ''}`;
        modal.querySelector('#trocaFuncionarioSubstitutoSugestoes').classList.add('hidden');
        carregarTrocaFuncionarioModal();
    }

    async function aplicarTrocaFuncionario() {
        const contexto = getDataEscalaAberta();
        if (!contexto) return;

        const modal = ensureModalTrocaFuncionario();
        const origemSelecionada = modal.querySelector('#trocaFuncionarioOrigem')?.value || '';
        const substitutoSelecionado = modal.querySelector('#trocaFuncionarioSubstituto')?.value || '';
        const origem = coletarFuncionariosTrocaOrigem().find(item => item.origem === origemSelecionada);
        const substituto = coletarReservasTrocaFuncionario(origem?.funcao || '').find(item => item.origem === substitutoSelecionado);

        if (!origem) return alert('Selecione o motorista ou auxiliar que saiu.');
        if (!substituto) return alert('Selecione um substituto disponivel na secao RESERVAS.');

        const motivoBase = cleanImportValue(modal.querySelector('#trocaFuncionarioMotivo')?.value) || 'FALTA';
        const complemento = cleanImportValue(modal.querySelector('#trocaFuncionarioComplemento')?.value);
        const motivo = complemento ? `${motivoBase} - ${complemento}` : motivoBase;
        const moverParaReserva = normalizeString(motivoBase) === 'RESERVA';
        const campoFalta = origem.funcao === 'motorista' ? 'motorista_ausente' : 'auxiliar_ausente';
        const campoMotivo = origem.funcao === 'motorista' ? 'motivo_motorista' : 'motivo_auxiliar';
        const anotacaoOrigem = getCellNote(origem.tabela, origem.id, origem.funcao);
        const anotacaoSubstituto = getCellNote(substituto.tabela, substituto.id, substituto.funcao);
        const sequenciaRota = origem.rota ? await getSequenciaTrocaVeiculo(contexto, origem.rota) : [];
        const idsTroca = sequenciaRota
            .filter(item => normalizeString(item[origem.funcao]) === normalizeString(origem.nome))
            .map(item => item.id);
        if (!idsTroca.includes(origem.id)) idsTroca.unshift(origem.id);

        let faltaInserida = null;

        if (!moverParaReserva) {
            const payloadFalta = comAuditoria({
                semana_nome: contexto.semana,
                data_escala: contexto.dataISO,
                filial: getFilialEscala(),
                [campoFalta]: origem.nome,
                [campoMotivo]: motivo
            });

            const { data, error: insertError } = await supabaseClient
                .from('faltas_afastamentos')
                .insert([payloadFalta])
                .select('id')
                .single();

            if (insertError) {
                console.error('Erro ao lancar ausencia na troca:', insertError);
                return alert('Erro ao lancar ausencia: ' + insertError.message);
            }

            faltaInserida = data;
        }

        const { error: updateOrigemError } = await supabaseClient
            .from(origem.tabela)
            .update(comAuditoria({ [origem.funcao]: substituto.nome }))
            .in('id', idsTroca);

        if (updateOrigemError) {
            if (faltaInserida?.id) await supabaseClient.from('faltas_afastamentos').delete().eq('id', faltaInserida.id);
            console.error('Erro ao substituir funcionario:', updateOrigemError);
            return alert('Erro ao substituir funcionario: ' + updateOrigemError.message);
        }

        const reservaUpdate = { [substituto.funcao]: moverParaReserva ? origem.nome : null };
        const reservaRow = document.querySelector(`#tbodyReservas tr[data-id="${CSS.escape(String(substituto.id))}"]`);
        const outroCampo = substituto.funcao === 'motorista' ? 'auxiliar' : 'motorista';
        const outroValor = getNomeFuncionarioExibicao(reservaRow?.querySelector(`input[data-key="${outroCampo}"]`)?.value);
        if (!moverParaReserva && !normalizeString(outroValor)) reservaUpdate.rota = null;

        const { error: limparReservaError } = await supabaseClient
            .from(substituto.tabela)
            .update(comAuditoria(reservaUpdate))
            .eq('id', substituto.id);

        if (limparReservaError) {
            console.error('Erro ao remover substituto da reserva:', limparReservaError);
            return alert('Troca aplicada, mas nao foi possivel atualizar a reserva: ' + limparReservaError.message);
        }

        if (anotacaoOrigem && moverParaReserva) {
            setCellNote(origem.tabela, origem.id, origem.funcao, '');
            setCellNote(substituto.tabela, substituto.id, substituto.funcao, anotacaoOrigem);
        } else if (anotacaoOrigem && faltaInserida?.id) {
            setCellNote(origem.tabela, origem.id, origem.funcao, '');
            setCellNote('faltas_afastamentos', faltaInserida.id, campoFalta, anotacaoOrigem);
        }
        if (anotacaoSubstituto) {
            setCellNote(substituto.tabela, substituto.id, substituto.funcao, '');
            setCellNote(origem.tabela, origem.id, origem.funcao, anotacaoSubstituto);
        }

        await carregarDadosDia(contexto.dia, contexto.semana);
        carregarTrocaFuncionarioModal();
        const destinoOrigem = moverParaReserva ? 'movido para RESERVAS' : `lancado em ${motivo}`;
        alert(`${origem.nome} ${destinoOrigem} e substituido por ${substituto.nome} em ${idsTroca.length} linha(s) futuras da rota.`);
    }

    const trocaVeiculoSortState = { key: 'placa', direction: 'asc' };
    let trocaVeiculoReloadTimer = null;

    function ensureModalTrocaVeiculo() {
        let modal = document.getElementById('modalTrocaVeiculo');
        if (modal) return modal;

        modal = document.createElement('div');
        modal.id = 'modalTrocaVeiculo';
        modal.className = 'terceiro-modal hidden';
        modal.innerHTML = `
            <div class="terceiro-modal-content troca-veiculo-modal-content">
                <div class="terceiro-modal-header">
                    <h3><i class="fa-solid fa-truck"></i> Troca de Veiculo</h3>
                    <button type="button" id="btnFecharTrocaVeiculo" class="terceiro-modal-close" title="Fechar">&times;</button>
                </div>
                <div class="terceiro-modal-subtitle" id="trocaVeiculoContexto"></div>
                <div class="terceiro-form-grid troca-veiculo-form-grid">
                    <div class="form-group">
                        <label for="trocaVeiculoRota">Rota</label>
                        <input type="text" id="trocaVeiculoRota" list="listaRotas" class="glass-input" placeholder="Informe a rota">
                    </div>
                    <div class="form-group">
                        <label for="trocaVeiculoModoGrid">Mostrar no grid</label>
                        <select id="trocaVeiculoModoGrid" class="glass-input">
                            <option value="DISPONIVEIS">Placas disponiveis</option>
                            <option value="OFICINA">Internado / Check-in oficina</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="trocaVeiculoPlaca">Nova placa disponivel</label>
                        <input type="text" id="trocaVeiculoPlaca" list="listaTrocaVeiculosDisponiveis" class="glass-input" placeholder="Selecione a placa">
                        <datalist id="listaTrocaVeiculosDisponiveis"></datalist>
                    </div>
                    <button type="button" id="btnAplicarTrocaVeiculo" class="btn-glass btn-green">
                        <i class="fa-solid fa-check"></i> Aplicar
                    </button>
                </div>
                <div class="terceiro-table-wrap">
                    <table class="data-grid terceiro-table troca-veiculo-table">
                        <thead>
                            <tr>
                                <th><button type="button" class="troca-sort-btn" data-troca-sort="placa">PLACA <i class="fas fa-sort"></i></button></th>
                                <th><button type="button" class="troca-sort-btn" data-troca-sort="modelo">MODELO <i class="fas fa-sort"></i></button></th>
                                <th><button type="button" class="troca-sort-btn" data-troca-sort="rotaPlanejada">ROTA PLANEJADA <i class="fas fa-sort"></i></button></th>
                                <th><button type="button" class="troca-sort-btn" data-troca-sort="statusPlanejado">STATUS PLANEJADO <i class="fas fa-sort"></i></button></th>
                                <th>ACAO</th>
                            </tr>
                        </thead>
                        <tbody id="tbodyTrocaVeiculo"></tbody>
                    </table>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        modal.addEventListener('click', (e) => {
            if (e.target.closest('#btnFecharTrocaVeiculo')) {
                modal.classList.add('hidden');
            }

            const btnSelecionar = e.target.closest('.btn-selecionar-troca-veiculo');
            if (btnSelecionar) {
                const inputPlaca = modal.querySelector('#trocaVeiculoPlaca');
                if (inputPlaca) inputPlaca.value = btnSelecionar.dataset.placa || '';
            }

            const sortButton = e.target.closest('[data-troca-sort]');
            if (sortButton) {
                const key = sortButton.dataset.trocaSort;
                trocaVeiculoSortState.direction = trocaVeiculoSortState.key === key && trocaVeiculoSortState.direction === 'asc' ? 'desc' : 'asc';
                trocaVeiculoSortState.key = key;
                carregarTrocaVeiculoModal();
            }
        });

        modal.querySelector('#btnAplicarTrocaVeiculo').addEventListener('click', aplicarTrocaVeiculoPorRota);
        modal.querySelector('#trocaVeiculoRota').addEventListener('input', () => {
            modal.querySelector('#trocaVeiculoPlaca').value = '';
            clearTimeout(trocaVeiculoReloadTimer);
            trocaVeiculoReloadTimer = setTimeout(() => carregarTrocaVeiculoModal(), 350);
        });
        modal.querySelector('#trocaVeiculoModoGrid').addEventListener('change', () => {
            modal.querySelector('#trocaVeiculoPlaca').value = '';
            carregarTrocaVeiculoModal();
        });

        return modal;
    }

    async function abrirModalTrocaVeiculo() {
        const contexto = getDataEscalaAberta();
        if (!contexto) return alert('Abra uma semana e um dia antes de trocar o veiculo.');

        const modal = ensureModalTrocaVeiculo();
        modal.querySelector('#trocaVeiculoContexto').textContent = `${contexto.dia} - ${contexto.dataBR}`;
        modal.querySelector('#trocaVeiculoRota').value = '';
        modal.querySelector('#trocaVeiculoPlaca').value = '';
        modal.querySelector('#trocaVeiculoModoGrid').value = 'DISPONIVEIS';
        modal.classList.remove('hidden');
        await carregarTrocaVeiculoModal();
    }

    function isStatusBloqueanteTrocaVeiculo(status) {
        const normalized = normalizeString(status);
        if (!normalized) return false;

        const compact = normalized.replace(/[\s.-]+/g, '');
        return compact === 'V'
            || compact === 'P'
            || compact === 'R'
            || compact === 'VREST'
            || normalized.includes('PERNOITE')
            || normalized.includes('RETORNO')
            || normalized.includes('VIAGEM')
            || normalized.includes('VIAJEM');
    }

    function isStatusRetornoTrocaVeiculo(status) {
        const normalized = normalizeString(status);
        const compact = normalized.replace(/[\s.-]+/g, '');
        return compact === 'R' || normalized.includes('RETORNO');
    }

    function isStatusContinuidadeTrocaVeiculo(status) {
        const normalized = normalizeString(status);
        const compact = normalized.replace(/[\s.-]+/g, '');
        return compact === 'V'
            || compact === 'P'
            || compact === 'VREST'
            || normalized.includes('PERNOITE')
            || normalized.includes('VIAGEM')
            || normalized.includes('VIAJEM');
    }

    function isStatusOficinaTrocaVeiculo(status) {
        const normalized = normalizeString(status);
        const compact = normalized.replace(/[\s.-]+/g, '');
        return normalized === 'INTERNADO'
            || compact === 'CHECKINOFICINA'
            || compact === 'CHECKININOFICINA';
    }

    function getStatusPlanejadoTrocaClass(status) {
        const normalized = normalizeString(status);
        const compact = normalized.replace(/[\s.-]+/g, '');

        if (normalized === 'INTERNADO') return 'troca-status-internado';
        if (compact === 'CHECKINOFICINA' || compact === 'CHECKININOFICINA') return 'troca-status-checkin-oficina';
        if (compact === 'CHECKINROTA') return 'troca-status-checkin-rota';
        if (normalized === 'FINALIZADO ROTA') return 'troca-status-finalizado-rota';
        if (normalized === 'FINALIZADO' || normalized === 'OK') return 'troca-status-finalizado';
        if (normalized === 'PENDENTE' || normalized === 'NAO REALIZADO' || normalized === 'NÃO REALIZADO') return 'troca-status-pendente';

        return '';
    }

    function getOficinaTrocaVeiculo(item) {
        return cleanImportValue(item?.oficinas?.nome)
            || cleanImportValue(item?.oficina)
            || cleanImportValue(item?.nome_oficina)
            || 'Oficina nao informada';
    }

    function getDiaKeyByDataISO(semana, dataISO) {
        const dia = getDiaByDataEscala(semana, dataISO);
        return DIA_KEY_MAP[dia] || '';
    }

    function isMesmaRotaTrocaVeiculo(rotaA, rotaB) {
        const a = cleanImportValue(rotaA, { keepZero: true });
        const b = cleanImportValue(rotaB, { keepZero: true });
        if (!a || !b) return false;
        if (a === b) return true;

        const numA = Number(a);
        const numB = Number(b);
        return Number.isFinite(numA) && Number.isFinite(numB) && numA === numB;
    }

    async function getSequenciaTrocaVeiculo(contexto, rota) {
        const rotaBusca = cleanImportValue(rota, { keepZero: true });
        const diaInicialIndex = IMPORT_DAYS.indexOf(contexto?.dia);
        if (!contexto || !rotaBusca || diaInicialIndex < 0) return [];

        const datasSemana = IMPORT_DAYS
            .slice(diaInicialIndex)
            .map(dia => CACHE_DATAS[contexto.semana]?.[dia]?.toISOString().split('T')[0])
            .filter(Boolean);

        if (datasSemana.length === 0) return [];

        const { data, error } = await aplicarFiltroFilial(
            supabaseClient
                .from('escala')
                .select('id, data_escala, rota, status, placa, modelo, motorista, auxiliar')
                .in('data_escala', datasSemana)
        ).order('data_escala').order('id');

        if (error) throw error;

        const porData = new Map();
        (data || []).forEach(item => {
            if (!isMesmaRotaTrocaVeiculo(item.rota, rotaBusca)) return;
            const dataISO = String(item.data_escala || '').slice(0, 10);
            if (!porData.has(dataISO)) porData.set(dataISO, []);
            porData.get(dataISO).push(item);
        });

        const sequencia = [];
        for (const dataISO of datasSemana) {
            const linhasDia = porData.get(dataISO) || [];
            if (linhasDia.length === 0) {
                if (sequencia.length > 0) break;
                continue;
            }

            sequencia.push(...linhasDia);

            const statusDia = linhasDia.map(item => item.status).find(Boolean) || '';
            if (isStatusRetornoTrocaVeiculo(statusDia)) break;
            if (sequencia.length > 0 && !isStatusContinuidadeTrocaVeiculo(statusDia)) break;
        }

        return sequencia;
    }

    async function listarVeiculosDisponiveisTroca(contexto, datasAlvo = null, rotaAlvo = '') {
        const diaKey = DIA_KEY_MAP[contexto?.dia];
        if (!contexto || !diaKey) return [];

        const rotaAlvoNormalizada = cleanImportValue(rotaAlvo, { keepZero: true });
        const datasParaValidar = Array.isArray(datasAlvo) && datasAlvo.length > 0
            ? [...new Set(datasAlvo.map(data => String(data || '').slice(0, 10)).filter(Boolean))]
            : [contexto.dataISO];

        const [resPlanejamento, resEscalaDia] = await Promise.all([
            aplicarFiltroFilial(
                supabaseClient
                    .from('planejamento_semanal')
                    .select('*')
                    .eq('semana_nome', contexto.semana)
            ).order('placa'),
            aplicarFiltroFilial(
                supabaseClient
                    .from('escala')
                    .select('placa, data_escala, rota')
                    .in('data_escala', datasParaValidar)
            )
        ]);

        if (resPlanejamento.error) throw resPlanejamento.error;
        if (resEscalaDia.error) throw resEscalaDia.error;

        const dadosPlanejamento = await garantirPlacasPlanejamento(contexto.semana, resPlanejamento.data || []);
        const placasEmUsoNoDia = new Set((resEscalaDia.data || [])
            .filter(item => !rotaAlvoNormalizada || !isMesmaRotaTrocaVeiculo(item.rota, rotaAlvoNormalizada))
            .map(item => normalizeVehiclePlate(item.placa))
            .filter(Boolean));

        return (dadosPlanejamento || [])
            .map(item => {
                const placa = normalizeVehiclePlate(item.placa);
                let rotaPlanejada = '';
                let statusPlanejado = '';
                let motivoBloqueio = '';

                for (const dataISO of datasParaValidar) {
                    const keyDia = getDiaKeyByDataISO(contexto.semana, dataISO);
                    if (!keyDia) continue;

                    const rotaDia = cleanImportValue(item[`${keyDia}_rota`], { keepZero: true });
                    const statusDia = cleanImportValue(item[`${keyDia}_status`], { keepZero: true });
                    const rotaDoMesmoAlvo = isMesmaRotaTrocaVeiculo(rotaDia, rotaAlvoNormalizada);

                    if (!rotaPlanejada && rotaDia) rotaPlanejada = `${rotaDia} (${dataISO.split('-').reverse().join('/')})`;
                    if (!statusPlanejado && statusDia) statusPlanejado = `${statusDia} (${dataISO.split('-').reverse().join('/')})`;

                    if (rotaDia && !rotaDoMesmoAlvo) {
                        motivoBloqueio = `Possui rota planejada ${rotaPlanejada}`;
                        break;
                    }

                    if (isStatusBloqueanteTrocaVeiculo(statusDia) && !rotaDoMesmoAlvo) {
                        motivoBloqueio = `Status planejado ${statusPlanejado}`;
                        break;
                    }
                }

                if (!placa) motivoBloqueio = 'Sem placa no planejamento';
                else if (placasEmUsoNoDia.has(placa)) motivoBloqueio = 'Ja esta escalado nesta data';

                return {
                    placa,
                    modelo: cleanImportValue(item.modelo) || getModeloVisualByPlaca(placa),
                    tipo: cleanImportValue(item.tipo) || getTipoVisualByPlaca(placa),
                    rotaPlanejada,
                    statusPlanejado,
                    disponivel: !motivoBloqueio,
                    motivoBloqueio
                };
            })
            .filter(item => item.placa && item.disponivel);
    }

    async function listarVeiculosOficinaTroca() {
        const filial = getFilialEscala();
        let queryVeiculos = supabaseClient
            .from('veiculos')
            .select('placa, modelo, tipo, filial, situacao')
            .order('placa');

        if (filial) queryVeiculos = queryVeiculos.eq('filial', filial);

        let queryChecklist = supabaseClient
            .from('coletas_manutencao_checklist')
            .select(`
                id,
                status,
                oficina_id,
                coletas_manutencao!inner (
                    id,
                    data_hora,
                    placa,
                    modelo,
                    veiculos!inner (
                        placa,
                        modelo,
                        tipo,
                        filial,
                        situacao
                    )
                ),
                oficinas (
                    nome
                )
            `)
            .in('status', ['INTERNADO', 'CHECK-IN OFICINA'])
            .order('id', { ascending: false })
            .limit(1000);

        if (filial) queryChecklist = queryChecklist.eq('coletas_manutencao.veiculos.filial', filial);

        const [resVeiculos, resChecklist] = await Promise.all([queryVeiculos, queryChecklist]);
        if (resVeiculos.error) throw resVeiculos.error;
        if (resChecklist.error) throw resChecklist.error;

        const mapa = new Map();

        (resVeiculos.data || [])
            .filter(item => isStatusOficinaTrocaVeiculo(item.situacao))
            .forEach(item => {
                const placa = normalizeVehiclePlate(item.placa);
                if (!placa || isTipoVeiculoOcultoEscala(item.tipo)) return;

                mapa.set(placa, {
                    placa,
                    modelo: cleanImportValue(item.modelo) || getModeloVisualByPlaca(placa),
                    tipo: cleanImportValue(item.tipo) || getTipoVisualByPlaca(placa),
                    rotaPlanejada: '-',
                    statusPlanejado: cleanImportValue(item.situacao) || 'INTERNADO',
                    oficina: 'Oficina nao informada',
                    bloqueadoTroca: true
                });
            });

        (resChecklist.data || [])
            .filter(item => isStatusOficinaTrocaVeiculo(item.status))
            .sort((a, b) => {
                const dataA = new Date(a?.coletas_manutencao?.data_hora || 0).getTime();
                const dataB = new Date(b?.coletas_manutencao?.data_hora || 0).getTime();
                return dataB - dataA || (Number(b.id) || 0) - (Number(a.id) || 0);
            })
            .forEach(item => {
                const coleta = item.coletas_manutencao || {};
                const veiculo = coleta.veiculos || {};
                const placa = normalizeVehiclePlate(coleta.placa || veiculo.placa);
                if (!placa || isTipoVeiculoOcultoEscala(veiculo.tipo)) return;
                if (mapa.has(placa) && mapa.get(placa).oficina !== 'Oficina nao informada') return;

                mapa.set(placa, {
                    placa,
                    modelo: cleanImportValue(coleta.modelo) || cleanImportValue(veiculo.modelo) || getModeloVisualByPlaca(placa),
                    tipo: cleanImportValue(veiculo.tipo) || getTipoVisualByPlaca(placa),
                    rotaPlanejada: '-',
                    statusPlanejado: cleanImportValue(item.status) || cleanImportValue(veiculo.situacao) || 'INTERNADO',
                    oficina: getOficinaTrocaVeiculo(item),
                    bloqueadoTroca: true
                });
            });

        return Array.from(mapa.values());
    }

    function ordenarVeiculosDisponiveisTroca(disponiveis) {
        const direction = trocaVeiculoSortState.direction === 'desc' ? -1 : 1;
        const key = trocaVeiculoSortState.key || 'placa';

        return [...(disponiveis || [])].sort((a, b) => {
            const valueA = cleanImportValue(a[key], { keepZero: true });
            const valueB = cleanImportValue(b[key], { keepZero: true });
            return valueA.localeCompare(valueB, 'pt-BR', { numeric: true, sensitivity: 'base' }) * direction;
        });
    }

    function atualizarOrdenacaoTrocaVeiculo() {
        document.querySelectorAll('#modalTrocaVeiculo [data-troca-sort] i').forEach(icon => {
            const button = icon.closest('[data-troca-sort]');
            const ativo = button?.dataset.trocaSort === trocaVeiculoSortState.key;
            icon.className = ativo
                ? (trocaVeiculoSortState.direction === 'asc' ? 'fas fa-sort-up' : 'fas fa-sort-down')
                : 'fas fa-sort';
        });
    }

    function renderTrocaVeiculoDisponiveis(disponiveis) {
        const tbody = document.getElementById('tbodyTrocaVeiculo');
        const datalist = document.getElementById('listaTrocaVeiculosDisponiveis');
        if (!tbody) return;

        const ordenados = ordenarVeiculosDisponiveisTroca(disponiveis);

        if (datalist) {
            datalist.innerHTML = ordenados
                .filter(item => !item.bloqueadoTroca)
                .map(item => `<option value="${escapeAttribute(item.placa)}" label="${escapeAttribute(item.modelo || '')}">`)
                .join('');
        }

        atualizarOrdenacaoTrocaVeiculo();

        if (ordenados.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Nenhuma placa disponivel pelo planejamento para esta rota/data.</td></tr>';
            return;
        }

        tbody.innerHTML = ordenados.map(item => `
            <tr class="${item.bloqueadoTroca ? 'troca-veiculo-row-info' : ''}" title="${escapeAttribute(item.oficina ? `Oficina: ${item.oficina}` : '')}">
                <td>${escapeAttribute(item.placa)}</td>
                <td>${escapeAttribute(item.modelo || '')}</td>
                <td>${escapeAttribute(item.rotaPlanejada || '-')}</td>
                <td><span class="troca-status-planejado ${getStatusPlanejadoTrocaClass(item.statusPlanejado)}">${escapeAttribute(item.statusPlanejado || '-')}</span></td>
                <td class="actions-cell">
                    <button type="button" class="btn-icon edit btn-selecionar-troca-veiculo" data-placa="${escapeAttribute(item.placa)}" title="${escapeAttribute(item.bloqueadoTroca ? `Veiculo em oficina: ${item.oficina || 'Oficina nao informada'}` : 'Selecionar placa')}" ${item.bloqueadoTroca ? 'disabled' : ''}>
                        <i class="fas fa-check"></i>
                    </button>
                </td>
            </tr>
        `).join('');
    }

    async function carregarTrocaVeiculoModal() {
        const contexto = getDataEscalaAberta();
        const tbody = document.getElementById('tbodyTrocaVeiculo');
        const datalist = document.getElementById('listaTrocaVeiculosDisponiveis');
        if (!contexto || !tbody) return;

        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Carregando...</td></tr>';
        if (datalist) datalist.innerHTML = '';

        try {
            const rota = cleanImportValue(document.getElementById('trocaVeiculoRota')?.value, { keepZero: true });
            const modoGrid = document.getElementById('trocaVeiculoModoGrid')?.value || 'DISPONIVEIS';

            if (modoGrid === 'OFICINA') {
                const veiculosOficina = await listarVeiculosOficinaTroca();
                renderTrocaVeiculoDisponiveis(veiculosOficina);
                if (veiculosOficina.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Nenhuma placa com status INTERNADO ou CHECK-IN OFICINA.</td></tr>';
                }
                return;
            }

            let datasAlvo = null;

            if (rota) {
                const sequenciaRota = await getSequenciaTrocaVeiculo(contexto, rota);
                if (sequenciaRota.length === 0) {
                    renderTrocaVeiculoDisponiveis([]);
                    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;">Nenhuma linha encontrada para a rota ${escapeAttribute(rota)} a partir desta data.</td></tr>`;
                    return;
                }

                datasAlvo = [...new Set(sequenciaRota
                    .map(item => String(item.data_escala || '').slice(0, 10))
                    .filter(Boolean))];
            }

            const disponiveis = await listarVeiculosDisponiveisTroca(contexto, datasAlvo, rota);
            renderTrocaVeiculoDisponiveis(disponiveis);
        } catch (error) {
            console.error('Erro ao carregar veiculos disponiveis para troca:', error);
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#dc3545;">Erro ao carregar placas disponiveis.</td></tr>';
        }
    }

    async function aplicarTrocaVeiculoPorRota() {
        const contexto = getDataEscalaAberta();
        if (!contexto) return;

        const rota = cleanImportValue(document.getElementById('trocaVeiculoRota')?.value, { keepZero: true });
        const placa = normalizeVehiclePlate(document.getElementById('trocaVeiculoPlaca')?.value);

        if (!rota) return alert('Informe a rota.');
        if (!placa) return alert('Selecione a nova placa.');

        try {
            const sequenciaRota = await getSequenciaTrocaVeiculo(contexto, rota);
            if (sequenciaRota.length === 0) {
                return alert(`Nenhuma linha encontrada para a rota ${rota} a partir desta data.`);
            }

            const datasAfetadas = [...new Set(sequenciaRota
                .map(item => String(item.data_escala || '').slice(0, 10))
                .filter(Boolean))];

            const disponiveis = await listarVeiculosDisponiveisTroca(contexto, datasAfetadas, rota);
            const veiculo = disponiveis.find(item => item.placa === placa);
            if (!veiculo) {
                await carregarTrocaVeiculoModal();
                return alert('Esta placa nao esta disponivel para todos os dias da rota ate o retorno.');
            }

            const idsAfetados = sequenciaRota.map(item => item.id).filter(Boolean);
            const { data, error } = await supabaseClient
                .from('escala')
                .update(comAuditoria({
                    placa: veiculo.placa,
                    modelo: veiculo.modelo || getModeloVisualByPlaca(veiculo.placa)
                }))
                .in('id', idsAfetados)
                .select('id');

            if (error) throw error;

            if (!data || data.length === 0) {
                return alert(`Nenhuma linha encontrada para a rota ${rota} a partir desta data.`);
            }

            alert(`Veiculo ${veiculo.placa} aplicado em ${data.length} linha(s) da rota ${rota}, em ${datasAfetadas.length} dia(s).`);
            document.getElementById('trocaVeiculoPlaca').value = '';
            document.getElementById('modalTrocaVeiculo')?.classList.add('hidden');
            await carregarTrocaVeiculoModal();
            carregarDadosDia(contexto.dia, contexto.semana);
        } catch (error) {
            console.error('Erro ao aplicar troca de veiculo:', error);
            alert('Erro ao aplicar troca de veiculo: ' + error.message);
        }
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
        selectSemana.appendChild(new Option('SEMANA PADRÃO - MODELO', SEMANA_MODELO_PLANEJAMENTO));
        for (let i = 1; i <= 53; i++) {
            const nome = `SEMANA ${String(i).padStart(2, '0')} - 2026`;
            selectSemana.appendChild(new Option(nome, nome));
        }
        selectSemana.value = `SEMANA ${String(semanaAtual).padStart(2, '0')} - 2026`;
    }

    async function carregarFiliaisEscala() {
        if (!selectFilial) return;

        const { data, error } = await supabaseClient
            .from('filiais')
            .select('nome, sigla')
            .order('nome');

        if (error) {
            console.error('Erro ao carregar filiais:', error);
            return;
        }

        filiaisCache = podeGerenciarEscala
            ? (data || [])
            : (data || []).filter(filial => (filial.sigla || filial.nome || '') === (usuarioLogado?.filial || ''));
        selectFilial.innerHTML = '<option value="">Selecione a Filial</option>' + filiaisCache.map(filial => {
            const value = filial.sigla || filial.nome || '';
            const label = filial.sigla ? `${filial.nome} (${filial.sigla})` : filial.nome;
            return `<option value="${escapeAttribute(value)}">${escapeAttribute(label)}</option>`;
        }).join('');

        const filialUsuario = usuarioLogado?.filial || '';
        if (filialUsuario && Array.from(selectFilial.options).some(opt => opt.value === filialUsuario)) {
            selectFilial.value = filialUsuario;
        }
        selectFilial.disabled = !podeGerenciarEscala && Boolean(filialUsuario);
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
    let mapaNomesFuncionarios = new Map();
    let placasVeiculosOcultosEscala = new Set();
    const TIPOS_VEICULO_OCULTOS_ESCALA = new Set(['EMPILHADEIRA', 'GERADOR']);

    function isTipoVeiculoOcultoEscala(tipo) {
        return TIPOS_VEICULO_OCULTOS_ESCALA.has(normalizeString(tipo));
    }

    function isPlacaVeiculoOcultaEscala(placa) {
        return placasVeiculosOcultosEscala.has(normalizeVehiclePlate(placa));
    }

    // Configuração de Status baseada em status.html
    const STATUS_CONFIG = {
        'CNT SP': { bg: '#FF9800', color: 'white', desc: 'Centro de SP: caminhao precisa sair ate 12h.' },
        'ZMRC': { bg: '#F44336', color: 'white', desc: 'Sao Paulo Zona de Maxima Restricao de Circulacao: precisa ser VUC.' },
        'ZMRC CPN': { bg: '#B71C1C', color: 'white', desc: 'Campinas Zona de Maxima Restricao de Circulacao: precisa ser VUC.' },
        'V': { bg: '#2196F3', color: 'white', desc: 'Rota vai para viagem de pernoite.' },
        'P': { bg: '#9C27B0', color: 'white', desc: 'Rota vai pernoitar.' },
        'P-RESTR': { bg: '#6f42c1', color: 'white', desc: 'Pernoite Restricao.' },
        'R': { bg: '#4CAF50', color: 'white', desc: 'Rota vai retornar.' },
        'REST.TAB': { bg: '#6D4C41', color: 'white', desc: 'Restrição Taboão da Serra' },
        'V-REST': { bg: '#303F9F', color: 'white', desc: 'Viajem com Restrição' },
        'V - RESTR': { bg: '#3F51B5', color: 'white', desc: 'Vai para pernoite e tem restricao a circulacao de caminhoes; precisa cadastrar a placa.' },
        'R- RESTR': { bg: '#2E7D32', color: 'white', desc: 'Retorno com Restricao.' },
        'RESTR': { bg: '#795548', color: 'white', desc: 'Rota com restricao a circulacao de caminhoes; precisa cadastrar a placa.' },
        'BGMN': { bg: '#FFEB3B', color: 'black', desc: 'Rota do Bergamini: tem que ir palete de madeira.' },
        'TRI +': { bg: '#E91E63', color: 'white', desc: 'Rota do Trimais: tem que ir palete de madeira.' },
        '152/257': { bg: '#00BCD4', color: 'black', desc: 'Rotas dos proximos dias na programacao do caminhao e da dupla.' },
        '194 TER': { bg: '#009688', color: 'white', desc: 'Rotas dos proximos dias na programacao do caminhao e da dupla.' },
        'INTERNADO': { bg: '#004085', color: 'white', desc: 'Veiculo internado.' },
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
        let queryVeiculos = supabaseClient.from('veiculos').select('placa, modelo, tipo, filial, situacao').order('placa');
        const filial = getFilialEscala();
        if (filial) queryVeiculos = queryVeiculos.eq('filial', filial);

        const { data: veiculos } = await queryVeiculos;
        placasVeiculosOcultosEscala = new Set((veiculos || [])
            .filter(v => isTipoVeiculoOcultoEscala(v.tipo))
            .map(v => normalizeVehiclePlate(v.placa))
            .filter(Boolean));
        listaVeiculos = (veiculos || []).map(v => ({
            ...v,
            placa_normalizada: normalizeVehiclePlate(v.placa)
        })).filter(v => v.placa_normalizada && !isTipoVeiculoOcultoEscala(v.tipo));
        const dlPlacas = document.getElementById('listaVeiculos');
        const dlModelos = document.getElementById('listaModelos');
        if (dlPlacas) dlPlacas.innerHTML = listaVeiculos.map(v => `<option value="${v.placa_normalizada}">`).join('');
        if (dlModelos) dlModelos.innerHTML = [...new Set(listaVeiculos.map(v => v.modelo))].map(m => `<option value="${m}">`).join('');

        // Rotas
        const { data: rotas } = await supabaseClient.from('rotas').select('numero');
        const dlRotas = document.getElementById('listaRotas');
        if (dlRotas && rotas) dlRotas.innerHTML = [...new Set(rotas.map(r => r.numero))].map(r => `<option value="${r}">`).join('');

        // Funcionários
        const { data: funcs } = await supabaseClient.from('funcionario').select('nome, nome_completo, funcao, status');
        const dlMot = document.getElementById('listaMotoristas');
        const dlAux = document.getElementById('listaAuxiliares');
        const dlTer = document.getElementById('listaTerceiros');
        if (funcs) {
            const funcionariosAtivos = funcs.filter(f => normalizeString(f.status) === 'ATIVO');
            mapaNomesFuncionarios = new Map();
            funcs.forEach(f => {
                const nomeCurto = cleanImportValue(f.nome);
                if (!nomeCurto) return;
                [f.nome, f.nome_completo].forEach(nome => {
                    const chave = normalizeString(nome);
                    if (chave) mapaNomesFuncionarios.set(chave, nomeCurto);
                });
            });

            const optionHTML = (items) => [...new Set(items.map(f => cleanImportValue(f.nome)).filter(Boolean))]
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

    function getNomeFuncionarioExibicao(valor) {
        const nome = cleanImportValue(valor);
        if (!nome) return '';
        return mapaNomesFuncionarios.get(normalizeString(nome)) || nome;
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

    function getPlanningTripColorMap(item) {
        const dias = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
        const map = {};
        let activeTrip = null;

        dias.forEach(dia => {
            const rota = cleanImportValue(item[`${dia}_rota`], { keepZero: true });
            const status = normalizeString(item[`${dia}_status`]);

            if (status === 'V') {
                activeTrip = { rota, color: PLANNING_DAY_COLORS[dia] };
            }

            if (activeTrip && (!activeTrip.rota || !rota || rota === activeTrip.rota)) {
                map[`${dia}_rota`] = activeTrip.color;
                map[`${dia}_status`] = activeTrip.color;
            }

            if (activeTrip && status === 'R' && (!activeTrip.rota || !rota || rota === activeTrip.rota)) {
                activeTrip = null;
            }
        });

        return map;
    }

    function getPlanningTripStyle(item, key) {
        const color = getPlanningTripColorMap(item)[key];
        return color ? `background-color: ${color} !important; color: #000; font-weight: bold;` : '';
    }

    function filtrarPlanejamento() {
        const inputBusca = document.getElementById('buscaPlanejamento');
        const tbody = document.getElementById('tbodyPlanejamento');
        if (!inputBusca || !tbody) return;

        const termo = normalizeString(inputBusca.value);
        const termos = termo.split(' ').filter(Boolean);

        tbody.querySelectorAll('tr').forEach(tr => {
            const valores = Array.from(tr.querySelectorAll('input.table-input'))
                .filter(input => {
                    const key = input.dataset.key || '';
                    return key === 'placa'
                        || key === 'motorista'
                        || key === 'auxiliar'
                        || key === 'terceiro'
                        || key.endsWith('_rota');
                })
                .map(input => input.value)
                .join(' ');

            const texto = normalizeString(valores);
            tr.style.display = termos.every(t => texto.includes(t)) ? '' : 'none';
        });
    }

    function filtrarDiaEscala() {
        const inputBusca = document.getElementById('buscaDiaEscala');
        const painelDias = document.getElementById('conteudoDias');
        if (!inputBusca || !painelDias) return;

        const termos = normalizeString(inputBusca.value).split(' ').filter(Boolean);
        const tbodies = ['tbodyPadrao', 'tbodyTransferencia', 'tbodyEquipamento', 'tbodyReservas', 'tbodyFaltas'];

        tbodies.forEach(tbodyId => {
            const tbody = document.getElementById(tbodyId);
            if (!tbody) return;

            tbody.querySelectorAll('tr').forEach(tr => {
                const valoresInputs = Array.from(tr.querySelectorAll('input.table-input'))
                    .map(input => input.value)
                    .join(' ');
                const valoresEditaveis = Array.from(tr.querySelectorAll('[contenteditable="true"]'))
                    .map(cell => cell.innerText)
                    .join(' ');
                const texto = normalizeString(`${valoresInputs} ${valoresEditaveis}`);
                tr.style.display = termos.every(t => texto.includes(t)) ? '' : 'none';
            });
        });
    }

    // --- LISTENERS GERAIS ---
    const btnAdicionarLinhaPlanejamento = document.getElementById('btnAdicionarLinhaPlanejamento');
    if (btnAdicionarLinhaPlanejamento) {
        btnAdicionarLinhaPlanejamento.addEventListener('click', adicionarLinhaPlanejamento);
    }

    const btnRecalcularPlanejamento = document.getElementById('btnRecalcularPlanejamento');
    if (btnRecalcularPlanejamento) {
        btnRecalcularPlanejamento.addEventListener('click', recalcularPlanejamentoPelasAbas);
    }

    const btnAtualizarAbasPeloPlanejamento = document.getElementById('btnAtualizarAbasPeloPlanejamento');
    if (btnAtualizarAbasPeloPlanejamento) {
        btnAtualizarAbasPeloPlanejamento.addEventListener('click', atualizarAbasDiariasPeloPlanejamento);
    }

    if (btnToggleMenuLateral) {
        btnToggleMenuLateral.addEventListener('click', toggleMenuLateralEscala);
    }

    const buscaPlanejamento = document.getElementById('buscaPlanejamento');
    if (buscaPlanejamento) {
        buscaPlanejamento.addEventListener('input', filtrarPlanejamento);
    }

    const tabelaPlanejamento = document.getElementById('tabelaPlanejamento');
    if (tabelaPlanejamento) {
        tabelaPlanejamento.addEventListener('click', (e) => {
            const sortButton = e.target.closest('[data-plan-sort]');
            if (!sortButton) return;

            e.preventDefault();
            e.stopPropagation();
            sortPlanejamentoByKey(sortButton.dataset.planSort);
        });
    }

    if (btnAbrirEscala) {
        btnAbrirEscala.addEventListener('click', async () => {
            if (!selectSemana.value) return alert('Selecione uma semana.');
            if (!exigirFilialEscala()) return;
            await carregarListasAuxiliares();
            if (isSemanaModeloPlanejamento(selectSemana.value)) await carregarDatasSemanaModeloBanco();
            
            // Atualiza datas nas abas
            const dadosSemana = CACHE_DATAS[selectSemana.value];
            tabButtons.forEach(btn => {
                const dia = btn.dataset.dia; // Pode ser undefined para a aba 'PLANEJAMENTO'
                // Apenas processa botões que representam um dia da semana
                if (dia) {
                    const date = isSemanaModeloPlanejamento(selectSemana.value)
                        ? getDataSemanaDiaOuNulo(selectSemana.value, dia)
                        : dadosSemana?.[dia] || getDataSemanaDiaOuNulo(selectSemana.value, dia);
                    const diaNome = btn.textContent.split(' ')[0].trim();
                    const dateText = date ? date.toLocaleDateString('pt-BR', {day:'2-digit', month:'2-digit', timeZone:'UTC'}) : '';
                    btn.innerHTML = `${diaNome}${dateText ? ` <span class="tab-date">${dateText}</span>` : ''}`;
                }
            });

            atualizarDatasAbasEscala(selectSemana.value);

            painelEscala.classList.remove('hidden');
            document.querySelector('.tab-btn[data-dia="DOMINGO"]')?.click();
            atualizarBotaoTerceiroSuspenso();
        });
    }

    if (selectSemana) {
        selectSemana.addEventListener('change', async () => {
            if (!painelEscala || painelEscala.classList.contains('hidden')) {
                atualizarBotaoTerceiroSuspenso();
                return;
            }

            if (isSemanaModeloPlanejamento(selectSemana.value)) {
                await carregarDatasSemanaModeloBanco();
            }

            const activeTab = document.querySelector('.tab-btn.active');
            const activeDia = activeTab?.dataset.dia;
            const dadosSemana = CACHE_DATAS[selectSemana.value];
            tabButtons.forEach(btn => {
                const dia = btn.dataset.dia;
                if (!dia) return;
                const date = isSemanaModeloPlanejamento(selectSemana.value)
                    ? getDataSemanaDiaOuNulo(selectSemana.value, dia)
                    : dadosSemana?.[dia] || getDataSemanaDiaOuNulo(selectSemana.value, dia);
                const diaNome = btn.textContent.split(' ')[0].trim();
                const dateText = date ? date.toLocaleDateString('pt-BR', {day:'2-digit', month:'2-digit', timeZone:'UTC'}) : '';
                btn.innerHTML = `${diaNome}${dateText ? ` <span class="tab-date">${dateText}</span>` : ''}`;
            });

            atualizarDatasAbasEscala(selectSemana.value);

            if (activeTab?.dataset.tab === 'planejamento') {
                carregarPlanejamento(selectSemana.value);
            } else if (activeDia) {
                atualizarTituloDia(activeDia, selectSemana.value);
                carregarDadosDia(activeDia, selectSemana.value);
            }
            atualizarBotaoTerceiroSuspenso();
        });
    }

    if (selectFilial) {
        selectFilial.addEventListener('change', async () => {
            await carregarListasAuxiliares();
            if (!painelEscala || painelEscala.classList.contains('hidden')) return;
            if (isSemanaModeloPlanejamento(selectSemana.value)) {
                await carregarDatasSemanaModeloBanco();
                atualizarDatasAbasEscala(selectSemana.value);
            }

            const activeTab = document.querySelector('.tab-btn.active');
            if (activeTab?.dataset.tab === 'planejamento') {
                carregarPlanejamento(selectSemana.value);
            } else if (activeTab?.dataset.dia) {
                carregarDadosDia(activeTab.dataset.dia, selectSemana.value);
            }
            atualizarBotaoTerceiroSuspenso();
        });
    }

    tabButtons.forEach(btn => {
        btn.addEventListener('click', async (e) => {
            tabButtons.forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');
            
            const dia = e.currentTarget.dataset.dia;
            const tab = e.currentTarget.dataset.tab;
            const painelDias = document.getElementById('conteudoDias');
            const painelPlan = document.getElementById('conteudoPlanejamento');

            if (tab === 'planejamento') {
                if (!exigirFilialEscala()) return;
                if(painelDias) painelDias.classList.add('hidden');
                if(painelPlan) painelPlan.classList.remove('hidden');
                carregarPlanejamento(selectSemana.value);
                atualizarBotaoTerceiroSuspenso();
            } else {
                if (!exigirFilialEscala()) return;
                if (isSemanaModeloPlanejamento(selectSemana.value)) await carregarDatasSemanaModeloBanco();
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
        btnLimpar.id = 'btnLimparEscala';
        btnLimpar.className = 'btn-custom';
        btnLimpar.classList.add('btn-pdf'); // Adiciona a classe para a cor vermelha padrão
        btnLimpar.innerHTML = '<i class="fas fa-trash"></i> Limpar Escala';
        btnLimpar.onclick = async () => {
            if (!exigirGerenciamentoEscala()) return;
            const semana = selectSemana.value;
            const dia = document.querySelector('.tab-btn.active')?.dataset.dia;
            if (!semana || !dia) return;
            if (!exigirFilialEscala()) return;

            const dataObj = getDataSemanaDia(semana, dia);
            const dataISO = dataObj.toISOString().split('T')[0];
            const formattedDate = dataObj.toLocaleDateString('pt-BR', { timeZone: 'UTC' });

            if (confirm(`ATENÇÃO: Apagar TODOS os dados do dia ${formattedDate}?`)) {
                await aplicarFiltroSemanaModelo(
                    aplicarFiltroFilial(supabaseClient.from('escala').delete().eq('data_escala', dataISO)),
                    semana
                );
                await aplicarFiltroSemanaModelo(
                    aplicarFiltroFilial(supabaseClient.from('faltas_afastamentos').delete().eq('data_escala', dataISO)),
                    semana
                );
                alert(`Dados do dia ${formattedDate} foram limpos.`);
                if(dia) carregarDadosDia(dia, semana);
            }
        };
        if(btnSalvar.parentNode) btnSalvar.parentNode.insertBefore(btnLimpar, btnSalvar);
        aplicarRestricoesNivelEscala();
    }

    // --- CORREÇÃO: Delegação de eventos para botões dinâmicos no Título do Dia ---
    if (tituloDia) {
        tituloDia.addEventListener('click', (e) => {
            const target = e.target.closest('button');
            if (!target) return;

            if (target.id === 'btnModeloDia') baixarModeloDia();
            if (target.id === 'btnImportarDia') tituloDia.querySelector('#fileImportarDia')?.click();
            if (target.id === 'btnCopiarDia') copiarDia();
            if (target.id === 'btnAtualizarDiaSemana') tituloDia.querySelector('#fileAtualizarDiaSemana')?.click();
            if (target.id === 'btnExcluirSelecionadosDia') excluirSelecionadosDia();
        });

        // Listener para o input file dinâmico
        tituloDia.addEventListener('input', (e) => {
            if (e.target.id === 'buscaDiaEscala') filtrarDiaEscala();
        });

        tituloDia.addEventListener('change', (e) => {
            if (e.target.id === 'fileImportarDia') importarExcelDia(e);
            if (e.target.id === 'fileAtualizarDiaSemana') atualizarDiaPorPlanilhaSemana(e);
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

    function getTextoCelulaXLSX(cell) {
        const inputs = [...cell.querySelectorAll('input, select, textarea')];
        if (inputs.length) {
            return inputs
                .map(input => input.type === 'checkbox' ? (input.checked ? 'Sim' : '') : input.value)
                .filter(Boolean)
                .join(' / ');
        }
        return cell.textContent.trim();
    }

    function extrairTabelaXLSX(table) {
        const headers = [...table.querySelectorAll('thead th')].map(th => th.textContent.replace(/\s+/g, ' ').trim());
        const colunasValidas = headers
            .map((header, index) => ({ header, index }))
            .filter(col => col.header && !(col.header.length <= 8 && /^A.*ES$/i.test(col.header)));

        const linhas = [...table.querySelectorAll('tbody tr')]
            .map(tr => colunasValidas.map(col => getTextoCelulaXLSX(tr.children[col.index] || document.createElement('td'))))
            .filter(row => row.some(value => String(value || '').trim()) && !String(row.join(' ')).includes('Aguardando dados'));

        return [
            colunasValidas.map(col => col.header),
            ...linhas
        ];
    }

    function gerarXLSXEscalaAtual() {
        if (typeof XLSX === 'undefined') return alert('Biblioteca XLSX nao carregada.');

        const wb = XLSX.utils.book_new();
        const semana = selectSemana?.value || 'Escala';
        const abaPlanejamentoAtiva = document.querySelector('.tab-btn.active')?.dataset.tab === 'planejamento';

        if (abaPlanejamentoAtiva) {
            const table = document.getElementById('tabelaPlanejamento');
            const dados = table ? extrairTabelaXLSX(table) : [];
            if (dados.length <= 1) return alert('Nenhum dado para exportar.');
            XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(dados), 'Planejamento');
        } else {
            const dia = document.querySelector('.tab-btn.active')?.dataset.dia || 'Dia';
            const secoes = ['Padrao', 'Transferencia', 'Equipamento', 'Reservas', 'Faltas'];
            let adicionouAba = false;

            secoes.forEach(secao => {
                const tbody = document.getElementById(`tbody${secao}`);
                const table = tbody?.closest('table');
                const dados = table ? extrairTabelaXLSX(table) : [];
                if (dados.length <= 1) return;
                XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(dados), secao.slice(0, 31));
                adicionouAba = true;
            });

            if (!adicionouAba) return alert('Nenhum dado para exportar.');
            wb.Props = { Title: `Escala ${dia}` };
        }

        const nomeArquivo = `Escala_${semana.replace(/[^a-zA-Z0-9_-]/g, '_')}.xlsx`;
        XLSX.writeFile(wb, nomeArquivo);
    }

    if (btnDiaria) {
        btnDiaria.addEventListener('click', () => {
            window.location.href = 'diaria.html';
        });
    }
    if (fileImportarDia) fileImportarDia.addEventListener('change', importarExcel);
    if (btnXLSX) {
        btnXLSX.addEventListener('click', gerarXLSXEscalaAtual);
    }
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
    if (btnPDFExpedicaoModelo) {
        btnPDFExpedicaoModelo.addEventListener('click', abrirModalPDFExpedicaoModelo);
    }

    const btnImportarPlanejamento = document.getElementById('btnImportarPlanejamento');
    const fileImportarPlanejamento = document.getElementById('fileImportarPlanejamento');
    if (btnImportarPlanejamento && fileImportarPlanejamento) {
        btnImportarPlanejamento.addEventListener('click', () => fileImportarPlanejamento.click());
        fileImportarPlanejamento.addEventListener('change', importarExcelPlanejamento);
        // Altera para usar a lógica global que é mais flexível com múltiplas abas ou nomes variados
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
        Faltas: ['select', 'motorista_ausente', 'motivo_motorista', 'auxiliar_ausente', 'motivo_auxiliar', 'acoes'],
        TerceiroRota: ['rota', 'placa', 'modelo', 'motorista', 'auxiliar', 'terceiro', 'acoes']
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
    const planejamentoSortState = {};

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

    function setupTerceiroRotaGridTools() {
        const table = document.getElementById('tbodyTerceiroRota')?.closest('table');
        if (!table) return;

        assignColumnKeys(table, 'TerceiroRota');
        applySavedColumnOrder(table, 'TerceiroRota');
        setupColumnHeaderControls(table, 'TerceiroRota');
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

    function sortPlanejamentoByKey(key) {
        const table = document.getElementById('tabelaPlanejamento');
        const tbody = document.getElementById('tbodyPlanejamento');
        if (!table || !tbody || !key) return;

        const nextDirection = planejamentoSortState[key] === 'asc' ? 'desc' : 'asc';
        Object.keys(planejamentoSortState).forEach(k => delete planejamentoSortState[k]);
        planejamentoSortState[key] = nextDirection;

        const rows = Array.from(tbody.querySelectorAll('tr[data-id]'));
        rows.sort((rowA, rowB) => {
            const valueA = getPlanningSortValue(rowA, key);
            const valueB = getPlanningSortValue(rowB, key);
            const result = valueA.localeCompare(valueB, 'pt-BR', { sensitivity: 'base', numeric: true });
            return nextDirection === 'asc' ? result : -result;
        });

        rows.forEach(row => tbody.appendChild(row));
        table.querySelectorAll('[data-plan-sort] i').forEach(icon => {
            const button = icon.closest('[data-plan-sort]');
            icon.className = button?.dataset.planSort === key
                ? (nextDirection === 'asc' ? 'fas fa-sort-up' : 'fas fa-sort-down')
                : 'fas fa-sort';
        });
    }

    function getPlanningSortValue(row, key) {
        const input = row.querySelector(`input[data-key="${key}"]`);
        return (input?.value || '').trim();
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
            const [{ data: veiculos, error }, veiculosOficina] = await Promise.all([
                supabaseClient
                    .from('veiculos')
                    .select('placa')
                    .eq('situacao', 'INTERNADO'),
                listarVeiculosOficinaTroca().catch(err => {
                    console.warn('Oficinas dos veiculos internados nao carregadas:', err);
                    return [];
                })
            ]);

            if (error) {
                console.error('Erro ao buscar veículos internados:', error);
                return;
            }

            const placasInternadas = new Set((veiculos || []).map(v => normalizeVehiclePlate(v.placa)));
            const oficinasPorPlaca = new Map((veiculosOficina || []).map(item => [normalizeVehiclePlate(item.placa), item.oficina || 'Oficina nao informada']));
            const corFundoInternado = '#004085'; // Cor do fundo INTERNADO (azul escuro)
            const corTextoInternado = '#FFFFFF'; // Cor do texto INTERNADO (branco)

            const aplicarEstilo = () => {
                // Seleciona inputs na primeira coluna (PLACA) de todas as tabelas de dados
                const inputs = document.querySelectorAll('.data-grid tbody input.table-input[data-key="placa"]');
                inputs.forEach(input => {
                    if (input.classList.contains('cell-duplicate')) return;
                    const placa = normalizeVehiclePlate(input.value);
                    if (placasInternadas.has(placa)) {
                        const oficina = oficinasPorPlaca.get(placa) || 'Oficina nao informada';
                        input.style.setProperty('background-color', corFundoInternado, 'important');
                        input.style.setProperty('color', corTextoInternado, 'important');
                        input.style.fontWeight = 'bold';
                        input.title = `INTERNADO - Oficina: ${oficina}`;
                    } else {
                        // Reseta para o padrão se não for internado
                        input.style.backgroundColor = '';
                        input.style.color = '';
                        input.style.fontWeight = '';
                        if (input.title === 'INTERNADO') input.removeAttribute('title');
                        if (input.title.startsWith('INTERNADO - Oficina:')) input.removeAttribute('title');
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
                if (e.target.matches('.data-grid tbody input.table-input[data-key="placa"]')) {
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
        if (!exigirFilialEscala()) return;

        try {
            // Cria o registro no banco primeiro para obter o ID
            const { data, error } = await supabaseClient
                .from('planejamento_semanal')
                .insert([comAuditoria({ semana_nome: semana, filial: getFilialEscala() })])
                .select()
                .single();

            if (error) throw error;
            
            renderLinhaPlanejamento(data, tbody);
            filtrarPlanejamento();
            applyCellAnnotations();
            verificarDuplicidades();
            aplicarModoVisualizacaoEscala();
            atualizarInfoAuditoria(data);
            carregarUltimaAuditoriaEscala({ semana, planejamento: true });
        } catch (err) {
            console.error('Erro ao adicionar linha de planejamento:', err);
            alert('Erro ao criar linha no banco de dados.');
        }
    }

    async function normalizarNomesPlanejamento(rows) {
        const campos = ['motorista', 'auxiliar', 'terceiro'];
        const updates = [];

        rows.forEach(row => {
            const payload = {};
            campos.forEach(campo => {
                const nomeExibicao = getNomeFuncionarioExibicao(row[campo]);
                if (nomeExibicao && nomeExibicao !== row[campo]) {
                    payload[campo] = nomeExibicao;
                    row[campo] = nomeExibicao;
                }
            });

            if (Object.keys(payload).length > 0) {
                updates.push(
                    supabaseClient
                        .from('planejamento_semanal')
                        .update(comAuditoria(payload))
                        .eq('id', row.id)
                );
            }
        });

        const results = await Promise.all(updates);
        const erro = results.find(result => result.error)?.error;
        if (erro) throw erro;
    }

    async function garantirPlacasPlanejamento(semana, rows) {
        if (!semana || !getFilialEscala()) return rows;

        const placasExistentes = new Set((rows || []).map(row => normalizeVehiclePlate(row.placa)).filter(Boolean));
        const novosRegistros = [];
        listaVeiculos.forEach(veiculo => {
            if (!veiculo.placa_normalizada || placasExistentes.has(veiculo.placa_normalizada)) return;
            placasExistentes.add(veiculo.placa_normalizada);
            novosRegistros.push(comAuditoria({
                semana_nome: semana,
                filial: getFilialEscala(),
                placa: veiculo.placa_normalizada,
                modelo: veiculo.modelo || '',
                tipo: veiculo.tipo || ''
            }));
        });

        if (novosRegistros.length === 0) return rows;

        const { data: criados, error } = await supabaseClient
            .from('planejamento_semanal')
            .insert(novosRegistros)
            .select('*');

        if (error) throw error;
        return [...rows, ...(criados || [])];
    }

    async function carregarPlanejamento(semana) {
        const tbody = document.getElementById('tbodyPlanejamento');
        if (!tbody) return;
        tbody.innerHTML = '<tr><td colspan="22" style="text-align:center;">Carregando...</td></tr>';

        try {
            await carregarListasAuxiliares();
            const { data, error } = await aplicarFiltroFilial(
                supabaseClient
                    .from('planejamento_semanal')
                    .select('*')
                    .eq('semana_nome', semana)
            ).order('id');

            if (error) throw error;

            const dadosPlanejamento = await garantirPlacasPlanejamento(
                semana,
                (data || []).filter(item => !isPlacaVeiculoOcultaEscala(item.placa))
            );
            await normalizarNomesPlanejamento(dadosPlanejamento);

            tbody.innerHTML = '';
            if (dadosPlanejamento.length === 0) {
                 // Opcional: mostrar mensagem de vazio ou deixar em branco
            }
            dadosPlanejamento.forEach(item => renderLinhaPlanejamento(item, tbody));
            filtrarPlanejamento();
            applyCellAnnotations();
            verificarDuplicidades();
            aplicarModoVisualizacaoEscala();
        } catch (err) {
            console.error(err);
            tbody.innerHTML = '<tr><td colspan="22" style="text-align:center; color:red;">Erro ao carregar dados.</td></tr>';
        }
    }

    function renderLinhaPlanejamento(item, tbody) {
        const tr = document.createElement('tr');
        tr.dataset.id = item.id;
        tr.dataset.tabela = 'planejamento_semanal';
        tr.dataset.placa = item.placa || '';

        const dias = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
        let diasHtml = '';
        
        dias.forEach(dia => {
            diasHtml += `
                <td><input type="text" class="table-input" value="${item[dia + '_rota'] || ''}" data-key="${dia}_rota" placeholder="Rota" style="${getPlanningTripStyle(item, dia + '_rota') || getCellStyle('planejamento_semanal', item.id, dia + '_rota', item[dia + '_rota'])}"></td>
                <td><input type="text" list="listaStatus" class="table-input" value="${item[dia + '_status'] || ''}" data-key="${dia}_status" placeholder="Status" title="${getStatusTitleAttr(item[dia + '_status'])}" style="${getPlanningTripStyle(item, dia + '_status') || getCellStyle('planejamento_semanal', item.id, dia + '_status', item[dia + '_status'])}"></td>
            `;
        });

        tr.innerHTML = `
            <td style="text-align: center; vertical-align: middle;"><input type="checkbox" class="row-selector-plan" data-id="${item.id}"></td>
            <td><input type="text" list="listaVeiculos" class="table-input" value="${item.placa || ''}" data-key="placa" placeholder="Placa" style="${getCellStyle('planejamento_semanal', item.id, 'placa')}"></td>
            <td><input type="text" list="listaModelos" class="table-input non-editable" value="${item.modelo || ''}" data-key="modelo" placeholder="Modelo" readonly style="${getCellStyle('planejamento_semanal', item.id, 'modelo')}"></td>
            <td><input type="text" class="table-input non-editable" value="${item.tipo || getTipoVisualByPlaca(item.placa) || ''}" data-key="tipo" placeholder="Tipo" readonly style="${getCellStyle('planejamento_semanal', item.id, 'tipo')}"></td>
            ${diasHtml}
            <td><input type="text" list="listaMotoristas" class="table-input" value="${getNomeFuncionarioExibicao(item.motorista)}" data-key="motorista" placeholder="Motorista" style="${getCellStyle('planejamento_semanal', item.id, 'motorista')}"></td>
            <td><input type="text" list="listaAuxiliares" class="table-input" value="${getNomeFuncionarioExibicao(item.auxiliar)}" data-key="auxiliar" placeholder="Auxiliar" style="${getCellStyle('planejamento_semanal', item.id, 'auxiliar')}"></td>
            <td><input type="text" list="listaTerceiros" class="table-input" value="${getNomeFuncionarioExibicao(item.terceiro)}" data-key="terceiro" placeholder="Terceiro" style="${getCellStyle('planejamento_semanal', item.id, 'terceiro')}"></td>
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
    const lastRowSelectorByScope = new WeakMap();

    function handleShiftRangeSelection(event, selector, scope) {
        const checkbox = event.target;
        if (!checkbox || !scope) return;

        const checkboxes = Array.from(scope.querySelectorAll(selector))
            .filter(item => !item.disabled && item.closest('tr')?.style.display !== 'none');
        const last = lastRowSelectorByScope.get(scope);

        if (event.shiftKey && last && last !== checkbox && checkboxes.includes(last)) {
            const start = checkboxes.indexOf(last);
            const end = checkboxes.indexOf(checkbox);
            const [from, to] = start < end ? [start, end] : [end, start];
            for (let i = from; i <= to; i++) {
                checkboxes[i].checked = checkbox.checked;
            }
        }

        lastRowSelectorByScope.set(scope, checkbox);
    }

    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('row-selector-dia')) {
            handleShiftRangeSelection(e, '.row-selector-dia', e.target.closest('tbody'));
        }

        if (e.target.classList.contains('row-selector-plan')) {
            handleShiftRangeSelection(e, '.row-selector-plan', document.getElementById('tbodyPlanejamento'));
        }
    });

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
    carregarFiliaisEscala();
    preencherCacheDatas();
    carregarListasAuxiliares();
    setupEscalaGridTools();
    setupSectionMinimizers();
    enableColumnResizing();
    updateColumnColorsStyle(); // Carrega cores salvas
    atualizarBotaoTerceiroSuspenso();
    destacarVeiculosInternados();

    // --- LÓGICA PARA CÁLCULO DE PESO ---
    const modalCalculoPeso = document.getElementById('modalCalculoPeso');
    const btnCalculoPeso = document.getElementById('btnCalculoPeso');
    const btnCloseModalCalculoPeso = document.getElementById('btnCloseModalCalculoPeso');
    const calculoPesoPlaca = document.getElementById('calculoPesoPlaca');
    const calculoPesoRotaOrigem = document.getElementById('calculoPesoRotaOrigem');
    const listaVeiculosCalculoPeso = document.getElementById('listaVeiculosCalculoPeso');
    const calculoPesoModelo = document.getElementById('calculoPesoModelo');
    const calculoPesoTipo = document.getElementById('calculoPesoTipo');
    const calculoPesoCapacidade = document.getElementById('calculoPesoCapacidade');
    const calculoPesoCargaTotal = document.getElementById('calculoPesoCargaTotal');
    const calculoPesoRotaDestino = document.getElementById('calculoPesoRotaDestino');
    const calculoPesoTransferir = document.getElementById('calculoPesoTransferir');
    const calculoPesoAnularTransferencia = document.getElementById('calculoPesoAnularTransferencia');
    const btnTransferirCarga = document.getElementById('btnTransferirCarga');
    // Novos campos solicitados para o modal de Peso/Cálculo
    const calculoPesoMotorista = document.getElementById('calculoPesoMotorista');
    const calculoPesoAuxiliar = document.getElementById('calculoPesoAuxiliar');
    const calculoPesoQtdClientes = document.getElementById('calculoPesoQtdClientes');
    const btnCalcularPeso = document.getElementById('btnCalcularPeso');
    const btnSalvarPesoRota = document.getElementById('btnSalvarPesoRota');

    function resetarModoCalculoPeso() {
        const radioManual = document.getElementById('modoInformarPeso');
        if (radioManual) {
            radioManual.checked = true;
            atualizarModoCalculoPeso();
        }
    }

    function limparCamposCalculoPeso() {
        const campos = [
            'calculoPesoCargaTotal',
            'calculoPesoTotalCaixas',
            'calculoPesoTransferir',
            'calculoPesoPaletes',
            'calculoPesoCaixas',
            'calculoPesoQtdClientes',
            'calculoPesoRotaDestino',
        ];
        campos.forEach(id => {
            const el = document.getElementById(id);
            if (el) { el.value = ''; el.dataset.rawDigits = ''; }
        });
        if (calculoPesoTransferir) calculoPesoTransferir.style.color = '';
        const secaoExcedente = document.getElementById('secaoExcedente');
        if (secaoExcedente) secaoExcedente.style.display = 'none';
        if (calculoPesoAnularTransferencia) calculoPesoAnularTransferencia.checked = false;
        const containerRotaDestino = document.getElementById('containerRotaDestino');
        if (containerRotaDestino) containerRotaDestino.style.display = 'block';
    }

    if (btnCalculoPeso) {
        btnCalculoPeso.addEventListener('click', () => {
            modalCalculoPeso.classList.remove('hidden');
            modalCalculoPeso.style.display = 'flex';
            if (calculoPesoAnularTransferencia) {
                calculoPesoAnularTransferencia.checked = false;
                const containerRotaDestino = document.getElementById('containerRotaDestino');
                if (containerRotaDestino) containerRotaDestino.style.display = 'block';
            }
            limparCamposCalculoPeso();
            resetarModoCalculoPeso();
            carregarVeiculosCalculoPeso();
        });
    }

    async function abrirModalPesoRotaComDados(rota, placa, modelo, motorista, auxiliar) {
        if (!modalCalculoPeso) return;

        modalCalculoPeso.classList.remove('hidden');
        modalCalculoPeso.style.display = 'flex';

        limparCamposCalculoPeso();
        resetarModoCalculoPeso();

        // Preenche os campos do modal com os dados vindos da linha da escala
        if (calculoPesoRotaOrigem) calculoPesoRotaOrigem.value = rota;
        if (calculoPesoPlaca) calculoPesoPlaca.value = placa;
        if (calculoPesoModelo) calculoPesoModelo.value = modelo;
        if (calculoPesoMotorista) calculoPesoMotorista.value = motorista;
        if (calculoPesoAuxiliar) calculoPesoAuxiliar.value = auxiliar;
        if (calculoPesoQtdClientes) calculoPesoQtdClientes.value = ''; // Campo manual

        // Aciona a busca automática de dados do veículo (capacidade, tipo, etc)
        if (placa) await preencherDadosVeiculoCalculoPeso();
    }

    if (btnCloseModalCalculoPeso) {
        btnCloseModalCalculoPeso.addEventListener('click', () => {
            modalCalculoPeso.classList.add('hidden');
            modalCalculoPeso.style.display = 'none';
        });
    }


    if (calculoPesoRotaOrigem) {
        calculoPesoRotaOrigem.addEventListener('change', () => {
            const rota = (calculoPesoRotaOrigem.value || '').trim();
            if (!rota) return;

            // Busca a placa na tabela ativa (dia atual)
            const activeTab = document.querySelector('.tab-btn.active');
            if (!activeTab || activeTab.dataset.tab === 'planejamento') {
                return alert('Por favor, selecione um dia da semana para buscar por rota.');
            }

            const painelDias = document.getElementById('conteudoDias');
            const rows = painelDias.querySelectorAll('tbody tr');
            let found = false;

            for (const tr of rows) {
                const inputRota = tr.querySelector('input[data-key="rota"]');
                const inputStatus = tr.querySelector('input[data-key="status"]');
                const inputPlaca = tr.querySelector('input[data-key="placa"]');

                if (inputRota && inputPlaca && inputRota.value.trim() === rota) {
                    const status = (inputStatus?.value || '').toUpperCase();
                    // Verifica status exceto P e R
                    if (status.includes('P') || status.includes('R')) continue;

                    calculoPesoPlaca.value = inputPlaca.value;
                    preencherDadosVeiculoCalculoPeso();
                    found = true;
                    break;
                }
            }

            if (!found) alert(`Não foi encontrada uma placa ativa para a rota ${rota} no dia selecionado (verificando status exceto P e R).`);
        });
    }

    if (calculoPesoPlaca) calculoPesoPlaca.addEventListener('change', preencherDadosVeiculoCalculoPeso);
    if (calculoPesoAnularTransferencia) {
        calculoPesoAnularTransferencia.addEventListener('change', () => {
            const containerRotaDestino = document.getElementById('containerRotaDestino');
            if (containerRotaDestino) {
                const isChecked = calculoPesoAnularTransferencia.checked;
                containerRotaDestino.style.display = isChecked ? 'none' : 'block';
                if (isChecked && calculoPesoRotaDestino) {
                    calculoPesoRotaDestino.value = ''; // Limpa o campo ao ocultar
                }
            }
            realizarCalculoPeso();
        });
    }

    if (calculoPesoCapacidade) {
        aplicarMascaraDecimalBR(calculoPesoCapacidade);
        calculoPesoCapacidade.addEventListener('input', realizarCalculoPeso);
    }
    if (calculoPesoCargaTotal) {
        aplicarMascaraDecimalBR(calculoPesoCargaTotal);
        calculoPesoCargaTotal.addEventListener('input', realizarCalculoPeso);
    }
    if (btnCalcularPeso) btnCalcularPeso.addEventListener('click', realizarCalculoPeso);

    document.querySelectorAll('input[name="modoCalculoPeso"]').forEach(radio => {
        radio.addEventListener('change', atualizarModoCalculoPeso);
    });

    async function carregarVeiculosCalculoPeso() {
        if (!listaVeiculosCalculoPeso) return;
        try {
            const { data, error } = await supabaseClient.from('veiculos').select('placa').order('placa');
            if (error) throw error;
            listaVeiculosCalculoPeso.innerHTML = data.map(v => `<option value="${v.placa}"></option>`).join('');
        } catch (err) { console.error('Erro ao carregar veículos:', err); }
    }

    async function preencherDadosVeiculoCalculoPeso() {
        const placa = calculoPesoPlaca.value.trim().toUpperCase();
        if (!placa) return;
        try {
            const { data: v, error } = await supabaseClient.from('veiculos').select('modelo, tipo, capacidade_carga').eq('placa', placa).single();
            if (error) {
                calculoPesoModelo.value = 'Não encontrado';
                calculoPesoTipo.value = '';
                calculoPesoCapacidade.value = '';
                calculoPesoCapacidade.readOnly = false;
                calculoPesoCapacidade.style.backgroundColor = '';
                return;
            }
            calculoPesoModelo.value = v.modelo || '';
            calculoPesoTipo.value = v.tipo || '';
            
            if (v.capacidade_carga && v.capacidade_carga > 0) {
                calculoPesoCapacidade.value = formatDecimalBR(v.capacidade_carga);
                calculoPesoCapacidade.dataset.rawDigits = String(Math.round(v.capacidade_carga * 100));
                calculoPesoCapacidade.readOnly = true;
                calculoPesoCapacidade.style.backgroundColor = '#f0f0f0';
            } else {
                calculoPesoCapacidade.value = '';
                calculoPesoCapacidade.dataset.rawDigits = '';
                calculoPesoCapacidade.readOnly = false;
                calculoPesoCapacidade.style.backgroundColor = '';
            }
            
            realizarCalculoPeso();
        } catch (err) { console.error('Erro ao buscar dados do veículo:', err); }
    }

    function aplicarMascaraDecimalBR(el) {
        // Inicializa rawDigits ao focar
        el.addEventListener('focus', function () {
            this.dataset.rawDigits = this.value.replace(/\D/g, '');
        });

        el.addEventListener('keydown', function (e) {
            if (e.ctrlKey || e.metaKey || e.key === 'Tab' || e.key === 'Enter' ||
                e.key === 'Escape' || e.key.startsWith('Arrow') || e.key === 'F') return;

            const isDigit   = e.key >= '0' && e.key <= '9';
            const isBack    = e.key === 'Backspace';
            const isDelete  = e.key === 'Delete';
            if (!isDigit && !isBack && !isDelete) return;

            e.preventDefault();
            let raw = this.dataset.rawDigits || '';
            if (isDigit)  raw += e.key;
            else if (isBack)   raw = raw.slice(0, -1);
            else if (isDelete) raw = '';

            this.dataset.rawDigits = raw;
            this.value = raw ? (parseInt(raw, 10) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
            this.dispatchEvent(new Event('input', { bubbles: true }));
        });

        el.addEventListener('paste', function (e) {
            e.preventDefault();
            const raw = ((e.clipboardData || window.clipboardData).getData('text')).replace(/\D/g, '');
            this.dataset.rawDigits = raw;
            this.value = raw ? (parseInt(raw, 10) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
            this.dispatchEvent(new Event('input', { bubbles: true }));
        });
    }

    function parseBR(value) {
        if (!value && value !== 0) return 0;
        if (typeof value === 'number') return Number.isFinite(value) ? value : 0;

        const texto = String(value).trim().replace(/\s/g, '');
        if (!texto) return 0;

        const normalizado = texto.replace(/[^\d,.-]/g, '');
        const ultimoPonto = normalizado.lastIndexOf('.');
        const ultimaVirgula = normalizado.lastIndexOf(',');
        let numeroTexto = normalizado;

        if (ultimoPonto >= 0 && ultimaVirgula >= 0) {
            const separadorDecimal = ultimoPonto > ultimaVirgula ? '.' : ',';
            const separadorMilhar = separadorDecimal === '.' ? ',' : '.';
            numeroTexto = normalizado
                .replace(new RegExp(`\\${separadorMilhar}`, 'g'), '')
                .replace(separadorDecimal, '.');
        } else if (ultimaVirgula >= 0) {
            numeroTexto = normalizado.replace(/\./g, '').replace(',', '.');
        } else if (ultimoPonto >= 0) {
            const casasDepoisDoPonto = normalizado.length - ultimoPonto - 1;
            numeroTexto = casasDepoisDoPonto === 3
                ? normalizado.replace(/\./g, '')
                : normalizado;
        }

        const numero = Number(numeroTexto);
        return Number.isFinite(numero) ? numero : 0;
    }

    function formatDecimalBR(value) {
        if (value === null || value === undefined || value === '') return '';
        const num = Number(value);
        if (!Number.isFinite(num)) return '';
        return num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function getModoCalculoPeso() {
        const radio = document.querySelector('input[name="modoCalculoPeso"]:checked');
        return radio ? radio.value : 'auto';
    }

    function atualizarModoCalculoPeso() {
        const modo = getModoCalculoPeso();
        const inputTotalCaixas = document.getElementById('calculoPesoTotalCaixas');
        const labelAuto = document.getElementById('labelModo21kg');
        const labelManual = document.getElementById('labelModoManual');

        if (modo === 'manual') {
            if (inputTotalCaixas) {
                inputTotalCaixas.readOnly = false;
                inputTotalCaixas.style.backgroundColor = '';
                inputTotalCaixas.placeholder = 'Informe a qtd.';
            }
            if (labelAuto) {
                labelAuto.style.borderColor = '#ccc';
                labelAuto.style.background = '#fff';
                labelAuto.style.color = '#666';
            }
            if (labelManual) {
                labelManual.style.borderColor = '#0d6efd';
                labelManual.style.background = '#e7f1ff';
                labelManual.style.color = '#0d6efd';
            }
        } else {
            if (inputTotalCaixas) {
                inputTotalCaixas.readOnly = true;
                inputTotalCaixas.style.backgroundColor = '#f0f0f0';
                inputTotalCaixas.removeAttribute('placeholder');
            }
            if (labelAuto) {
                labelAuto.style.borderColor = '#006937';
                labelAuto.style.background = '#f0fff4';
                labelAuto.style.color = '#006937';
            }
            if (labelManual) {
                labelManual.style.borderColor = '#ccc';
                labelManual.style.background = '#fff';
                labelManual.style.color = '#666';
            }
            realizarCalculoPeso();
        }
    }

    function realizarCalculoPeso() {
        const cap = parseBR(calculoPesoCapacidade.value);
        const total = parseBR(calculoPesoCargaTotal.value);
        const modo = getModoCalculoPeso();

        const inputTotalCaixas = document.getElementById('calculoPesoTotalCaixas');

        // Modo automático: calcula QTD TOTAL CAIXAS a partir do peso (1 caixa = 21kg)
        if (modo === 'auto') {
            const totalCaixas = Math.ceil(total / 21);
            if (inputTotalCaixas) inputTotalCaixas.value = totalCaixas || '';
        }

        const excedente = Math.max(0, total - cap);
        const secaoExcedente = document.getElementById('secaoExcedente');

        if (excedente > 0) {
            if (secaoExcedente) secaoExcedente.style.display = 'block';

            calculoPesoTransferir.value = excedente.toFixed(2);
            calculoPesoTransferir.style.color = '#dc3545';

            if (modo === 'auto') {
                const totalCaixasNecessarias = Math.ceil(excedente / 21);
                const qtdPaletes = Math.floor(totalCaixasNecessarias / 42);
                const qtdCaixasAvulsas = totalCaixasNecessarias % 42;

                const inputPaletes = document.getElementById('calculoPesoPaletes');
                const inputCaixas = document.getElementById('calculoPesoCaixas');

                if (inputPaletes) inputPaletes.value = qtdPaletes;
                if (inputCaixas) inputCaixas.value = qtdCaixasAvulsas;
            }
        } else {
            if (secaoExcedente) secaoExcedente.style.display = 'none';
            calculoPesoTransferir.value = '';
        }
    }

    // Botão Transferência de Carga
    if (btnTransferirCarga) {
        btnTransferirCarga.addEventListener('click', () => {
            const rotaOrig = (calculoPesoRotaOrigem?.value || '').trim();
            const rotaDest = (calculoPesoRotaDestino?.value || '').trim();
            const placaOrig = (calculoPesoPlaca?.value || '').trim();
            const peso = parseFloat(calculoPesoTransferir.value) || 0;
            const paletes = parseInt(document.getElementById('calculoPesoPaletes').value) || 0;
            const caixas = parseInt(document.getElementById('calculoPesoCaixas').value) || 0;
            const anularTransferencia = calculoPesoAnularTransferencia?.checked;

            if (!placaOrig || peso <= 0) return alert('Informe um veículo com excesso de carga para realizar a transferência.');
            if (!anularTransferencia && !rotaDest) return alert('Informe a rota de destino da transferência.');

            const activeTab = document.querySelector('.tab-btn.active');
            if (!activeTab || activeTab.dataset.tab === 'planejamento') return alert('Selecione um dia da semana para vincular a transferência.');

            const painelDias = document.getElementById('conteudoDias');
            const rows = painelDias.querySelectorAll('tbody tr');
            
            let rowOrig = null;
            let rowDest = null;

            rows.forEach(tr => {
                const p = (tr.querySelector('input[data-key="placa"]')?.value || '').trim().toUpperCase();
                const r = (tr.querySelector('input[data-key="rota"]')?.value || '').trim();
                
                if (p === placaOrig.toUpperCase()) rowOrig = tr;
                if (!anularTransferencia && r === rotaDest) rowDest = tr;
            });

            if (!rowOrig) return alert('Veículo de origem não encontrado na escala do dia.');

            if (anularTransferencia) {
                const idOrig = rowOrig.dataset.id;
                const tabOrig = rowOrig.dataset.tabela;
                let msgOrig = `Carga em Excesso: ${peso.toFixed(0)}kg. Transferência anulada.`;
                const notaAtualOrig = getCellNote(tabOrig, idOrig, 'placa');
                if (notaAtualOrig) msgOrig = notaAtualOrig + ' | ' + msgOrig;
                setCellNote(tabOrig, idOrig, 'placa', msgOrig);
                applyCellAnnotations();
                alert(`Anotação de "Carga em Excesso" registrada na placa ${placaOrig}.`);
            } else {
                const paletes = parseInt(document.getElementById('calculoPesoPaletes').value) || 0;
                const caixas = parseInt(document.getElementById('calculoPesoCaixas').value) || 0;

                if (peso <= 0) return alert('Não há peso para transferir.');
                if (!rowDest) return alert('Rota de destino não encontrada na escala do dia para realizar a transferência.');

                // Criar Anotações
                const idOrig = rowOrig.dataset.id;
                const tabOrig = rowOrig.dataset.tabela;
                const idDest = rowDest.dataset.id;
                const tabDest = rowDest.dataset.tabela;

                // Nota na Origem
                let msgOrig = `Excesso: ${peso.toFixed(0)}kg, ${paletes} Paletes e ${caixas} Caixas -> Transf. p/ Rota ${rotaDest}`;
                const notaAtualOrig = getCellNote(tabOrig, idOrig, 'placa');
                if (notaAtualOrig) msgOrig = notaAtualOrig + ' | ' + msgOrig;
                setCellNote(tabOrig, idOrig, 'placa', msgOrig);

                // Nota no Destino
                let msgDest = `Recebendo: ${paletes} Paletes e ${caixas} Caixas da Rota ${rotaOrig || placaOrig}`;
                const notaAtualDest = getCellNote(tabDest, idDest, 'placa');
                if (notaAtualDest) msgDest = notaAtualDest + ' | ' + msgDest;
                setCellNote(tabDest, idDest, 'placa', msgDest);

                applyCellAnnotations();
                
                alert(`Transferência de carga registrada nas anotações!\n\nOrigem: ${placaOrig}\nDestino: Rota ${rotaDest}`);
            }
            
            // Limpa campos de rota no modal
            if (calculoPesoRotaOrigem) calculoPesoRotaOrigem.value = '';
            if (calculoPesoRotaDestino) calculoPesoRotaDestino.value = '';
            
            // Fecha modal
            modalCalculoPeso.classList.add('hidden');
        });
    }

    // Botão Salvar em Peso de Rota (Sincronização entre páginas via Database)
    if (btnSalvarPesoRota) {
        btnSalvarPesoRota.addEventListener('click', async () => {
            if (!exigirGerenciamentoEscala()) return;
            const rota = (calculoPesoRotaOrigem?.value || '').trim();
            const placa = (calculoPesoPlaca?.value || '').trim();
            const diaSemana = document.querySelector('.tab-btn.active')?.dataset.dia;
            const semanaNome = selectSemana.value;

            if (!rota || !placa) {
                return alert('Por favor, identifique a Rota e a Placa antes de salvar.');
            }

            if (!confirm(`Deseja salvar os dados da rota ${rota} na página de Peso de Rota?`)) return;

            try {
                // Obtém a data real do dia selecionado para sincronizar com o campo dia_retorno
                const dataObj = getDataSemanaDia(semanaNome, diaSemana);
                const diaRetorno = dataObj ? dataObj.toISOString().split('T')[0] : null;

                const payload = {
                    rota: rota,
                    semana: diaSemana,
                    semana_ano: semanaNome,
                    motorista: (calculoPesoMotorista.value || '').trim().toUpperCase(),
                    auxiliar: (calculoPesoAuxiliar.value || '').trim().toUpperCase(),
                    placa: placa,
                    filial: getFilialEscala(),
                    tipo_veiculo: (calculoPesoModelo.value || '').trim().toUpperCase(),
                    pbt: parseBR(calculoPesoCapacidade.value),
                    peso_carga: parseBR(calculoPesoCargaTotal.value),
                    qtd_caixas: parseInt(document.getElementById('calculoPesoTotalCaixas').value) || 0,
                    qtd_clientes: parseInt(calculoPesoQtdClientes.value) || 0,
                    dia_retorno: diaRetorno, // Campo crucial para aparecer na lista de Peso de Rota
                    status_percentual: 0,
                    updated_at: new Date().toISOString()
                };

                // Cálculo do status percentual
                if (payload.pbt > 0) {
                    payload.status_percentual = Number(((payload.peso_carga / payload.pbt) * 100).toFixed(2));
                }

                // Ajuste no conflito: a chave da tabela peso_rota é baseada na data e na rota
                const { error } = await supabaseClient.from('peso_rota').upsert([payload], { onConflict: 'dia_retorno,rota,filial' });
                if (error) throw error;

                alert('Dados sincronizados com sucesso para Peso de Rota!');
                modalCalculoPeso.classList.add('hidden');
            } catch (err) {
                console.error('Erro ao salvar:', err);
                alert('Falha ao salvar dados: ' + err.message);
            }
        });
    }

});
