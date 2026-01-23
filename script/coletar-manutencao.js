import { supabaseClient } from './supabase.js';

// --- Variáveis Globais ---
let currentReportData = []; // Armazena os dados da última busca para exportação

// --- Funções de Inicialização ---
document.addEventListener('DOMContentLoaded', () => {
    // Navegação por abas
    const painelBtns = document.querySelectorAll('#menu-coletar-manutencao .painel-btn');
    painelBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const secaoId = btn.dataset.secao;
            document.querySelectorAll('.section').forEach(s => s.classList.add('hidden'));
            document.getElementById(secaoId).classList.remove('hidden');
            painelBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });

    // Adiciona listeners aos botões de exportação
    document.getElementById('btnExportarPDFServicos').addEventListener('click', () => exportPDF('servico'));
    document.getElementById('btnExportarPDFOficina').addEventListener('click', () => exportPDF('oficina'));

    // Adiciona listener ao botão de busca do relatório
    document.getElementById('btnBuscarRelatorio').addEventListener('click', buscarRelatorio);
    
    // Inicializa os filtros (Dropdowns e Carregamento de Dados)
    initFilters();
    
    // Botão Limpar Tudo
    document.getElementById('btnLimparTudo').addEventListener('click', limparFiltros);
});

// --- Inicialização e Lógica dos Filtros ---

async function initFilters() {
    // Configura a interatividade dos dropdowns customizados
    setupMultiselect('filtroItemDisplay', 'filtroItemOptions', 'btnLimparSelecaoItem');
    setupMultiselect('filtroOficinaDisplay', 'filtroOficinaOptions', 'btnLimparSelecaoOficina');
    setupMultiselect('filtroStatusDisplay', 'filtroStatusOptions', 'btnLimparSelecaoStatus'); // Se houver botão limpar no status

    // Fecha dropdowns ao clicar fora
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.custom-multiselect')) {
            closeAllDropdowns();
        }
    });

    // Carrega opções do banco
    await loadFilterOptions();
}

function setupMultiselect(displayId, optionsId, clearBtnId) {
    const display = document.getElementById(displayId);
    const options = document.getElementById(optionsId);
    const clearBtn = document.getElementById(clearBtnId);
    const textSpan = display.querySelector('span');

    if (!display || !options) return;

    // Toggle visibilidade
    display.addEventListener('click', () => {
        const isVisible = options.style.display === 'block';
        closeAllDropdowns(); // Fecha outros
        options.style.display = isVisible ? 'none' : 'block';
    });

    // Atualiza texto ao mudar checkboxes
    options.addEventListener('change', () => {
        updateMultiselectText(display, options);
    });

    // Botão limpar seleção interna
    if (clearBtn) {
        clearBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // Evita fechar o dropdown
            const checkboxes = options.querySelectorAll('input[type="checkbox"]');
            checkboxes.forEach(cb => cb.checked = false);
            updateMultiselectText(display, options);
        });
    }
}

function updateMultiselectText(display, optionsContainer) {
    const checkboxes = optionsContainer.querySelectorAll('input[type="checkbox"]:checked');
    const textSpan = display.querySelector('span');
    
    if (checkboxes.length === 0) {
        textSpan.textContent = 'Todos';
        textSpan.style.fontWeight = 'normal';
    } else if (checkboxes.length === 1) {
        // Pega o texto do label pai do checkbox
        textSpan.textContent = checkboxes[0].parentElement.textContent.trim();
        textSpan.style.fontWeight = 'bold';
    } else {
        textSpan.textContent = `${checkboxes.length} selecionados`;
        textSpan.style.fontWeight = 'bold';
    }
}

function closeAllDropdowns() {
    document.querySelectorAll('.custom-multiselect > div[id$="Options"]').forEach(el => {
        el.style.display = 'none';
    });
}

async function loadFilterOptions() {
    try {
        // 1. Carregar Oficinas
        const { data: oficinas, error: errOficinas } = await supabaseClient
            .from('oficinas')
            .select('id, nome')
            .order('nome');
        
        if (!errOficinas && oficinas) {
            const container = document.getElementById('filtroOficinaOptions');
            // Mantém o botão limpar se existir
            const btnLimpar = container.querySelector('div:first-child'); 
            container.innerHTML = '';
            if(btnLimpar) container.appendChild(btnLimpar);

            oficinas.forEach(oficina => {
                const label = document.createElement('label');
                label.style.cssText = 'display: block; padding: 8px 12px; cursor: pointer; border-bottom: 1px solid #f0f0f0;';
                label.innerHTML = `<input type="checkbox" value="${oficina.id}" style="margin-right: 8px;"> ${oficina.nome}`;
                container.appendChild(label);
            });
        }

        // 2. Carregar Itens (Distinct de checklist ou tabela de itens_verificacao)
        // Vamos tentar buscar da tabela itens_verificacao se existir, ou distinct do checklist
        const { data: itens, error: errItens } = await supabaseClient
            .from('itens_verificacao') // Supondo que esta tabela existe baseada em oficina.js
            .select('descricao')
            .order('descricao');

        if (!errItens && itens) {
            const container = document.getElementById('filtroItemOptions');
            const btnLimpar = container.querySelector('div:first-child');
            container.innerHTML = '';
            if(btnLimpar) container.appendChild(btnLimpar);

            itens.forEach(item => {
                const label = document.createElement('label');
                label.style.cssText = 'display: block; padding: 8px 12px; cursor: pointer; border-bottom: 1px solid #f0f0f0;';
                label.innerHTML = `<input type="checkbox" value="${item.descricao}" style="margin-right: 8px;"> ${item.descricao}`;
                container.appendChild(label);
            });
        }

    } catch (error) {
        console.error("Erro ao carregar filtros:", error);
    }
}

function getSelectedValues(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return [];
    return Array.from(container.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.value);
}

function limparFiltros() {
    document.getElementById('formExportacao').reset();
    // Limpa multiselects manualmente
    document.querySelectorAll('.custom-multiselect input[type="checkbox"]').forEach(cb => cb.checked = false);
    document.querySelectorAll('.custom-multiselect > div[id$="Display"] span').forEach(span => {
        span.textContent = 'Todos';
        span.style.fontWeight = 'normal';
    });
    currentReportData = [];
    document.getElementById('tableBodyRelatorio').innerHTML = '<tr><td colspan="9" class="text-center">Utilize os filtros acima para buscar.</td></tr>';
    document.getElementById('contadorResultados').textContent = '(0)';
}

/**
 * Busca os dados do relatório com base nos filtros da tela.
 */
async function buscarRelatorio() {
    const btnBuscar = document.getElementById('btnBuscarRelatorio');
    btnBuscar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Buscando...';
    btnBuscar.disabled = true;

    const semana = document.getElementById('filtroSemana').value.trim();
    const placa = document.getElementById('filtroPlaca').value.trim().toUpperCase();
    const dataIni = document.getElementById('filtroDataIni').value;
    const dataFim = document.getElementById('filtroDataFim').value;
    
    const selectedItens = getSelectedValues('filtroItemOptions');
    const selectedOficinas = getSelectedValues('filtroOficinaOptions');
    const selectedStatus = getSelectedValues('filtroStatusOptions');

    try {
        let query = supabaseClient
            .from('coletas_manutencao_checklist')
            .select(`
                *,
                coletas_manutencao!inner (
                    id, data_hora, semana, placa, status, modelo
                ),
                oficinas ( nome )
            `)
            .order('created_at', { ascending: false });

        // Filtros
        if (dataIni) query = query.gte('coletas_manutencao.data_hora', `${dataIni}T00:00:00`);
        if (dataFim) query = query.lte('coletas_manutencao.data_hora', `${dataFim}T23:59:59`);
        if (semana) query = query.eq('coletas_manutencao.semana', semana);
        if (placa) query = query.ilike('coletas_manutencao.placa', `%${placa}%`);
        
        // Filtros Multiselect
        if (selectedItens.length > 0) query = query.in('item', selectedItens); // Ajuste 'item' se o nome da coluna for diferente
        if (selectedStatus.length > 0) query = query.in('coletas_manutencao.status', selectedStatus);
        
        // Filtro de Oficina (pode ser ID ou Nome dependendo de como está salvo no checklist)
        // Se checklist tem oficina_id:
        if (selectedOficinas.length > 0) {
             // Se a tabela checklist tiver 'oficina_id', usamos isso. Se não, tentamos filtrar pelo nome na relação.
             // Supabase permite filtrar em tabelas relacionadas com !inner, mas aqui estamos selecionando checklist.
             // Vamos assumir que checklist tem uma coluna FK para oficinas.
             // Se não tiver FK direta e depender de texto, precisaria ajustar.
             // Tentativa genérica: filtrar pelo ID se houver coluna oficina_id, ou filtrar pelo nome na relação.
             // Como o filtro retorna IDs, vamos tentar filtrar por oficina_id se existir, ou assumir que precisamos filtrar a relação.
             // Para simplificar e dado o contexto de monitoramento.js:
             // Se checklist tem FK 'oficina_id' ou 'oficina' apontando para id:
             // query = query.in('oficina', selectedOficinas); 
             // Se checklist não tem FK direta mas a relação 'oficinas' foi feita:
             query = query.in('oficinas.id', selectedOficinas); // Isso requer que a relação oficinas seja !inner para filtrar
             // Vamos forçar o inner join na query principal para permitir o filtro se necessário
             // Mas como já definimos a query, vamos tentar aplicar o filtro na relação.
             // Nota: Filtrar por relação aninhada sem !inner só filtra os resultados aninhados, não as linhas principais.
             // Para filtrar as linhas principais, a relação precisa ser !inner.
             // Vou ajustar a query inicial para garantir !inner se houver filtro de oficina.
        }

        // Reconstruindo a query se houver filtro de oficina para garantir !inner
        if (selectedOficinas.length > 0) {
             query = supabaseClient
                .from('coletas_manutencao_checklist')
                .select(`*, coletas_manutencao!inner(id, data_hora, semana, placa, status, modelo), oficinas!inner(id, nome)`)
                .in('oficinas.id', selectedOficinas);
             
             // Reaplicar outros filtros
             if (dataIni) query = query.gte('coletas_manutencao.data_hora', `${dataIni}T00:00:00`);
             if (dataFim) query = query.lte('coletas_manutencao.data_hora', `${dataFim}T23:59:59`);
             if (semana) query = query.eq('coletas_manutencao.semana', semana);
             if (placa) query = query.ilike('coletas_manutencao.placa', `%${placa}%`);
             if (selectedItens.length > 0) query = query.in('item', selectedItens);
             if (selectedStatus.length > 0) query = query.in('coletas_manutencao.status', selectedStatus);
        }

        const { data, error } = await query;

        if (error) throw error;

        // Processar dados para formato plano
        currentReportData = data.map(row => ({
            id: row.id,
            coletas_manutencao_id: row.coletas_manutencao?.id,
            data_hora: row.coletas_manutencao?.data_hora,
            semana: row.coletas_manutencao?.semana,
            placa: row.coletas_manutencao?.placa,
            modelo: row.coletas_manutencao?.modelo,
            status: row.coletas_manutencao?.status,
            item: row.item || row.descricao, // Ajuste conforme nome da coluna
            oficina: row.oficinas?.nome || 'N/A',
            detalhes: row.detalhes || '',
            pecas_usadas: row.pecas_usadas || '',
            valor: row.valor || 0
        }));

        renderizarTabelaRelatorio(currentReportData);
        document.getElementById('contadorResultados').textContent = `(${currentReportData.length})`;

    } catch (error) {
        console.error("Erro na busca:", error);
        alert("Erro ao buscar dados. Verifique o console.");
    } finally {
        btnBuscar.innerHTML = '<i class="fas fa-search"></i> Buscar';
        btnBuscar.disabled = false;
    }
}

function renderizarTabelaRelatorio(dados) {
    const tbody = document.getElementById('tableBodyRelatorio');
    tbody.innerHTML = '';

    if (dados.length === 0) {
        tbody.innerHTML = '<tr><td colspan="11" class="text-center">Nenhum registro encontrado.</td></tr>';
        return;
    }

    dados.forEach(row => {
        const tr = document.createElement('tr');
        const dataFmt = row.data_hora ? new Date(row.data_hora).toLocaleString('pt-BR') : '-';
        const valorFmt = parseFloat(row.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        
        // Badge de status
        let statusClass = 'badge-secondary';
        if (row.status === 'FINALIZADO') statusClass = 'badge-success';
        else if (row.status === 'PENDENTE') statusClass = 'badge-warning';
        else if (row.status === 'INTERNADO') statusClass = 'badge-danger';

        tr.innerHTML = `
            <td>${dataFmt}</td>
            <td>${row.semana || '-'}</td>
            <td>${row.placa || '-'}</td>
            <td>${row.modelo || '-'}</td>
            <td>${row.item || '-'}</td>
            <td><span class="badge ${statusClass}">${row.status || '-'}</span></td>
            <td>${row.oficina}</td>
            <td>${row.detalhes}</td>
            <td>${row.pecas_usadas}</td>
            <td>${valorFmt}</td>
            <td>
                <button class="btn-icon-small text-primary" title="Ver Detalhes"><i class="fas fa-eye"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

/**
 * Exporta os dados do relatório para PDF, agrupados por serviço ou oficina.
 * @param {'servico' | 'oficina'} tipoRelatorio - O tipo de agrupamento para o relatório.
 */
function exportPDF(tipoRelatorio) {
    if (currentReportData.length === 0) {
        alert("Nenhum dado para exportar. Realize uma busca primeiro.");
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });

    // 1. Calcular valor total do filtro
    const valorTotalFiltro = currentReportData.reduce((sum, item) => {
        const valor = parseFloat(String(item.valor).replace(',', '.')) || 0;
        return sum + valor;
    }, 0);
    const valorTotalFormatado = valorTotalFiltro.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    let columns, body, title;
    const hoje = new Date().toLocaleDateString('pt-BR');

    // Helper para agrupar dados
    const groupBy = (array, key) => {
        return array.reduce((result, currentValue) => {
            const groupKey = currentValue[key] || 'Não Informado';
            (result[groupKey] = result[groupKey] || []).push(currentValue);
            return result;
        }, {});
    };

    if (tipoRelatorio === 'servico') {
        title = 'Relatório de Manutenção por Serviços';
        const groupedByServico = groupBy(currentReportData, 'item');
        
        columns = ["Serviço", "Qtd.", "Valor Total"];
        body = Object.keys(groupedByServico).sort().map(servico => {
            const items = groupedByServico[servico];
            const qtd = items.length;
            const valor = items.reduce((acc, i) => acc + (parseFloat(String(i.valor).replace(',', '.')) || 0), 0);
            return [
                servico,
                qtd,
                valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
            ];
        });

    } else if (tipoRelatorio === 'oficina') {
        title = 'Relatório de Manutenção por Oficina';
        const groupedByOficina = groupBy(currentReportData, 'oficina');

        columns = ["Oficina", "Qtd. Manutenções", "Valor Total"];
        body = Object.keys(groupedByOficina).sort().map(oficina => {
            const items = groupedByOficina[oficina];
            const qtd = new Set(items.map(i => i.coletas_manutencao_id)).size; 
            const valor = items.reduce((acc, i) => acc + (parseFloat(String(i.valor).replace(',', '.')) || 0), 0);
            return [
                oficina,
                qtd,
                valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
            ];
        });
    }

    doc.autoTable({
        head: [columns],
        body: body,
        startY: 25,
        didDrawPage: function (data) {
            // Cabeçalho do Documento
            doc.setFontSize(18);
            doc.setTextColor(40);
            doc.text(title, data.settings.margin.left, 15);

            // Valor Total (canto superior direito)
            doc.setFontSize(12);
            doc.setFont(undefined, 'bold'); // Negrito
            const text = `Valor Total do Filtro: ${valorTotalFormatado}`;
            const textWidth = doc.getStringUnitWidth(text) * doc.internal.getFontSize() / doc.internal.scaleFactor;
            const pageWidth = doc.internal.pageSize.getWidth();
            doc.text(text, pageWidth - data.settings.margin.right - textWidth, 15);
            doc.setFont(undefined, 'normal'); // Volta ao normal

            // Data de emissão no rodapé
            doc.setFontSize(8);
            doc.setTextColor(100);
            doc.text(`Emitido em: ${hoje}`, data.settings.margin.left, doc.internal.pageSize.getHeight() - 10);
        },
        headStyles: { fillColor: [0, 105, 55], textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [245, 245, 245] },
        columnStyles: { 2: { halign: 'right' } }
    });

    doc.save(`relatorio_${tipoRelatorio}_${new Date().toISOString().split('T')[0]}.pdf`);
}