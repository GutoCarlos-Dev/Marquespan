import { supabaseClient } from './supabase.js';

const TIMEZONE_BRASILIA = 'America/Sao_Paulo';

let dadosCompletos = [];
let sortState = { field: 'data_hora_passagem', ascending: false };
let fleetMonthlyTotal = 0; // Armazena o cálculo da mensalidade da frota
let lastFleetCount = 0; // Armazena a contagem para conferência

document.addEventListener('DOMContentLoaded', async () => {
    // Configura datas iniciais
    const hoje = new Date();
    const primeiroDia = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    document.getElementById('dataInicial').value = formatarDataInput(primeiroDia);
    document.getElementById('dataFinal').value = formatarDataInput(hoje);

    await carregarFiltros();

    document.getElementById('btnBuscarRelatorio').addEventListener('click', buscarDados);
    document.getElementById('searchResultadosLocal').addEventListener('input', filtrarLocal);
    document.getElementById('btnExportarPDF').addEventListener('click', exportarPDF);
    document.getElementById('btnExportarXLS').addEventListener('click', exportarExcel);
    document.getElementById('btnToggleMenuLateralPedagio')?.addEventListener('click', alternarMenuLateral);
    configurarFiltroCategoria();

    // Ordenação
    document.querySelectorAll('.sortable').forEach(th => {
        th.addEventListener('click', () => {
            const field = th.dataset.sort;
            sortState.ascending = (sortState.field === field) ? !sortState.ascending : true;
            sortState.field = field;
            renderizarTabela();
        });
        th.querySelector('i').style.marginLeft = '5px'; // Adiciona um pequeno espaçamento ao ícone
    });
});

function alternarMenuLateral() {
    document.body.classList.toggle('relatorio-pedagio-menu-oculto');
    const oculto = document.body.classList.contains('relatorio-pedagio-menu-oculto');
    const botao = document.getElementById('btnToggleMenuLateralPedagio');
    if (!botao) return;

    botao.title = oculto ? 'Mostrar menu lateral' : 'Ocultar menu lateral';
    botao.setAttribute('aria-label', botao.title);
}

function formatarDataInput(date) {
    return [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, '0'),
        String(date.getDate()).padStart(2, '0')
    ].join('-');
}

function datetimeLocalToISOString(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toISOString();
}

function dataLocalToISOString(dataIso, horario) {
    return datetimeLocalToISOString(`${dataIso}T${horario}`);
}

function formatarDataHoraBrasilia(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString('pt-BR', { timeZone: TIMEZONE_BRASILIA });
}

function configurarFiltroCategoria() {
    const display = document.getElementById('categoriaDisplay');
    const options = document.getElementById('categoriaOptions');
    const text = document.getElementById('categoriaText');
    display?.addEventListener('click', (event) => {
        event.stopPropagation();
        options.classList.toggle('hidden');
    });
    document.addEventListener('click', (event) => {
        if (!display?.contains(event.target) && !options?.contains(event.target)) options?.classList.add('hidden');
    });
    options?.addEventListener('change', () => {
        const checked = Array.from(options.querySelectorAll('.categoria-checkbox:checked'));
        text.textContent = checked.length === 0 ? 'Todas' : (checked.length <= 2 ? checked.map(cb => cb.value).join(', ') : `${checked.length} selecionadas`);
    });
}

async function carregarFiltros() {
    // Filiais
    const { data: filiais } = await supabaseClient.from('filiais').select('nome, sigla').order('nome');
    const comboFilial = document.getElementById('filial');
    filiais?.forEach(f => {
        const opt = new Option(f.sigla ? `${f.nome} (${f.sigla})` : f.nome, f.sigla || f.nome);
        comboFilial.add(opt);
    });

    // Veículos (Datalist)
    const { data: veiculos } = await supabaseClient.from('veiculos').select('placa').eq('situacao', 'ativo').order('placa');
    const datalist = document.getElementById('listaPlacas');
    veiculos?.forEach(v => {
        const opt = document.createElement('option');
        opt.value = v.placa;
        datalist.appendChild(opt);
    });

    const { data: motoristas } = await supabaseClient
        .from('funcionario')
        .select('nome')
        .ilike('funcao', '%Motorista%')
        .order('nome');
    const listaMotoristas = document.getElementById('listaMotoristas');
    motoristas?.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.nome;
        listaMotoristas.appendChild(opt);
    });

    const { data: rotas } = await supabaseClient
        .from('rotas')
        .select('numero')
        .order('numero', { ascending: true });
    const listaRotas = document.getElementById('listaRotas');
    rotas?.forEach(r => {
        const opt = document.createElement('option');
        opt.value = r.numero;
        listaRotas.appendChild(opt);
    });
}

async function buscarTodosLancamentos(montarQuery, tamanhoPagina = 1000) {
    const data = [];
    for (let inicio = 0; ; inicio += tamanhoPagina) {
        const { data: lote, error } = await montarQuery().range(inicio, inicio + tamanhoPagina - 1);
        if (error) return { data, error };
        data.push(...(lote || []));
        if (!lote || lote.length < tamanhoPagina) return { data, error: null };
    }
}

async function buscarDados() {
    const btn = document.getElementById('btnBuscarRelatorio');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Buscando...';

    try {
        const dataIni = document.getElementById('dataInicial').value;
        const dataFim = document.getElementById('dataFinal').value;
        const filial = document.getElementById('filial').value;
        const placa = document.getElementById('veiculo').value.toUpperCase();
        const motorista = document.getElementById('motorista').value.trim().toUpperCase();
        const rota = document.getElementById('rota').value.trim().toUpperCase();
        const rodovia = document.getElementById('rodovia').value;
        const praca = document.getElementById('praca').value;
        const categorias = Array.from(document.querySelectorAll('.categoria-checkbox:checked')).map(cb => Number(cb.value));

        // 1. Cálculo da quantidade de meses no período para a mensalidade
        const dIni = new Date(dataIni + 'T00:00:00');
        const dFim = new Date(dataFim + 'T23:59:59');
        const diffMeses = (dFim.getFullYear() - dIni.getFullYear()) * 12 + (dFim.getMonth() - dIni.getMonth()) + 1;

        // 2. Tipos de veículos permitidos para mensalidade
        const tiposPermitidos = ['TRUCK', 'CAMINHÃO 3/4', 'CAMINHÂO 3/4', 'BITRUCK', 'BITREM', 'HR/VAN', 'LS', 'MUNCK'];

        // 3. Busca os lançamentos
        const montarQueryPassagens = () => {
            let query = supabaseClient
                .from('pedagios_lancamentos')
                .select('*, veiculos!inner(filial, eixos), pedagios_empresas(nome, mensalidade)')
                .order('data_hora_passagem', { ascending: false });
            if (dataIni) query = query.gte('data_hora_passagem', dataLocalToISOString(dataIni, '00:00:00'));
            if (dataFim) query = query.lte('data_hora_passagem', dataLocalToISOString(dataFim, '23:59:59'));
            if (filial) query = query.eq('veiculos.filial', filial);
            if (placa) query = query.eq('placa', placa);
            if (motorista) query = query.ilike('motorista', `%${motorista}%`);
            if (rota) query = query.ilike('rota', `%${rota}%`);
            if (rodovia) query = query.ilike('rodovia', `%${rodovia}%`);
            if (praca) query = query.ilike('praca', `%${praca}%`);
            if (categorias.length) query = query.in('categoria_eixos', categorias);
            return query;
        };

         // 4. Prepara consulta da frota (ativo + INTERNADO) respeitando filial e tipos
        let fleetQuery = supabaseClient
            .from('veiculos')
            .select('*', { count: 'exact', head: true })
            .in('situacao', ['ativo', 'INTERNADO'])
            .in('tipo', tiposPermitidos);
        
        if (filial) fleetQuery = fleetQuery.eq('filial', filial);

        const [resPassagens, resFrota, resEmpresa] = await Promise.all([
            buscarTodosLancamentos(montarQueryPassagens),
            fleetQuery,
            // Busca a mensalidade padrão (considerando a primeira empresa cadastrada como referência)
            supabaseClient
                .from('pedagios_empresas')
                .select('mensalidade')
                .limit(1)
                .single()
        ]);

        if (resPassagens.error) throw resPassagens.error;

        lastFleetCount = resFrota.count || 0;
        const valorMensalidadeUnitario = resEmpresa.data?.mensalidade || 0;
        
        // Cálculo final: Qtd Veículos da Filial/Tipo * Valor Mensalidade * Qtd Meses no Filtro
        fleetMonthlyTotal = lastFleetCount * valorMensalidadeUnitario * diffMeses;

        const { data, error } = resPassagens;
        if (error) throw error;
        dadosCompletos = data || [];
        renderizarTabela();

    } catch (err) {
        console.error(err);
        alert('Erro ao buscar dados.');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-search"></i> Buscar';
    }
}

function getDadosGrid() {
    const search = document.getElementById('searchResultadosLocal').value.toUpperCase();
    const filtrarPorDivergencia = document.getElementById('filtroDivergencia').checked;

    let filtrados = dadosCompletos.filter(d => 
        d.placa.includes(search) ||
        (d.motorista || '').toUpperCase().includes(search) ||
        (d.rota || '').toUpperCase().includes(search) ||
        (d.rodovia || '').toUpperCase().includes(search) ||
        (d.praca || '').toUpperCase().includes(search)
    );

    if (filtrarPorDivergencia) {
        filtrados = filtrados.filter(d => {
            const eixosCobrados = parseInt(d.categoria_eixos) || 0;
            const eixosCadastrados = parseInt(d.veiculos?.eixos) || 0;
            if ([90, 94].includes(eixosCobrados)) return false;
            return eixosCadastrados > 0 && eixosCobrados > eixosCadastrados;
        });
    }

    // Aplicar ordenação
    filtrados.sort((a, b) => {
        let valA = a[sortState.field];
        let valB = b[sortState.field];
        if (typeof valA === 'string') valA = valA.toUpperCase();
        if (typeof valB === 'string') valB = valB.toUpperCase();
        valA = valA ?? '';
        valB = valB ?? '';
        if (valA < valB) return sortState.ascending ? -1 : 1;
        if (valA > valB) return sortState.ascending ? 1 : -1;
        return 0;
    });
    return filtrados;
}

function renderizarTabela() {
    const tbody = document.getElementById('tabelaResultados');
    const filtrados = getDadosGrid();

    tbody.innerHTML = filtrados.map(d => {
        const eixosCobrados = parseInt(d.categoria_eixos) || 0;
        const eixosCadastrados = parseInt(d.veiculos?.eixos) || 0;
        const taxaAmbiental = [90, 94].includes(eixosCobrados);
        const temDivergencia = !taxaAmbiental && eixosCadastrados > 0 && eixosCobrados > eixosCadastrados;
        
        const alertStyle = taxaAmbiental ? 'style="color: #856404; font-weight: bold; background-color: #fff3cd;"' : (temDivergencia ? 'style="color: #dc3545; font-weight: bold;"' : '');
        const rowBg = taxaAmbiental ? 'style="background-color: rgba(255, 193, 7, 0.10);"' : (temDivergencia ? 'style="background-color: rgba(220, 53, 69, 0.05);"' : '');

        return `
        <tr ${rowBg}>
            <td>${formatarDataHoraBrasilia(d.data_hora_passagem)}</td>
            <td><strong>${d.placa}</strong></td>
            <td>${d.motorista || '-'}</td>
            <td>${d.rota || '-'}</td>
            <td>${d.marca_veiculo || '-'}</td>
            <td ${alertStyle}>${d.categoria_eixos || '-'} ${taxaAmbiental ? '<i class="fas fa-exclamation-triangle" title="Taxa Ambiental"></i> Taxa Ambiental' : (temDivergencia ? '<i class="fas fa-exclamation-triangle" title="Eixo cobrado maior que o cadastro"></i>' : '')}</td>
            <td style="text-align: center; color: #666;">${d.veiculos?.eixos || '-'}</td>
            <td>${d.rodovia || '-'}</td>
            <td>${d.praca || '-'}</td>
            <td>R$ ${parseFloat(d.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
            <td>${d.usuario_nome || '-'}</td>
        </tr>
    `}).join('');

    if (filtrados.length === 0) {
        tbody.innerHTML = '<tr><td colspan="11" style="text-align:center;">Nenhum registro encontrado.</td></tr>';
    }

    // Totais
    const totalValor = filtrados.reduce((acc, curr) => acc + (parseFloat(curr.valor) || 0), 0);

    document.getElementById('totalRegistros').textContent = filtrados.length;
    document.getElementById('valorTotal').textContent = totalValor.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
    document.getElementById('valorMensalidades').textContent = `${fleetMonthlyTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (${lastFleetCount} veíc.)`;
    document.getElementById('valorGeral').textContent = (totalValor + fleetMonthlyTotal).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
    
    // Ícones de sort
    document.querySelectorAll('.sortable i').forEach(i => i.className = 'fas fa-sort');
    const thAtivo = document.querySelector(`.sortable[data-sort="${sortState.field}"] i`);
    if(thAtivo) thAtivo.className = sortState.ascending ? 'fas fa-sort-up' : 'fas fa-sort-down';
}

function filtrarLocal() {
    renderizarTabela();
}

async function exportarPDF() {
    if (!window.jspdf) return alert('Biblioteca jsPDF não carregada.');
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('l', 'mm', 'a4'); // Orientação Paisagem para comportar todas as colunas

    // Função para carregar o logo e garantir fundo branco (padrão do sistema)
    const getLogoBase64 = async () => {
        return new Promise((resolve) => {
            const img = new Image();
            img.src = 'logo.png';
            img.crossOrigin = 'Anonymous';
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = '#FFFFFF'; // Fundo branco solicitado
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0);
                resolve(canvas.toDataURL('image/jpeg')); // Exporta como JPEG para melhor compatibilidade
            };
            img.onerror = () => resolve(null);
        });
    };

    const logoBase64 = await getLogoBase64();
    if (logoBase64) {
        doc.addImage(logoBase64, 'JPEG', 14, 10, 40, 12);
    }

    doc.setFontSize(18);
    doc.setTextColor(0, 105, 55); // Verde Marquespan
    doc.text('Relatório de Passagens de Pedágio', 60, 18);

    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 283, 18, { align: 'right' });

    const usuarioLogado = JSON.parse(localStorage.getItem('usuarioLogado'));
    const nomeUsuario = usuarioLogado?.nome || 'Sistema';
    doc.text(`Gerado por: ${nomeUsuario}`, 60, 24);

    const filtrados = getDadosGrid();

    const colunas = ["Data/Hora", "Placa", "Motorista", "Rota", "Marca", "Eixos (Cob.)", "Eixos (Veíc.)", "Rodovia", "Praça", "Valor", "Usuário"];
    const rows = filtrados.map(d => {
        const eixosCobrados = parseInt(d.categoria_eixos) || 0;
        const eixosCadastrados = parseInt(d.veiculos?.eixos) || 0;
        const taxaAmbiental = [90, 94].includes(eixosCobrados);
        const temDivergencia = !taxaAmbiental && eixosCadastrados > 0 && eixosCobrados > eixosCadastrados;

        return [
            formatarDataHoraBrasilia(d.data_hora_passagem),
            d.placa,
            d.motorista || '',
            d.rota || '',
            d.marca_veiculo || '',
            taxaAmbiental ? `${d.categoria_eixos} - Taxa Ambiental` : (temDivergencia ? `! ${d.categoria_eixos}` : d.categoria_eixos || ''),
            d.veiculos?.eixos || '',
            d.rodovia || '',
            d.praca || '',
            parseFloat(d.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
            d.usuario_nome || ''
        ];
    });

    doc.autoTable({
        head: [colunas],
        body: rows,
        startY: 30,
        theme: 'grid',
        headStyles: { fillColor: [0, 105, 55], fontSize: 9 },
        styles: { fontSize: 8, cellPadding: 2 },
        alternateRowStyles: { fillColor: [240, 240, 240] },
        columnStyles: {
            9: { halign: 'right' } // Alinha a coluna de Valor à direita
        },
        didParseCell: (data) => {
            // Aplica cor vermelha no PDF para divergências marcadas com "!"
            if (data.section === 'body' && data.column.index === 5) {
                if (String(data.cell.raw).includes('Taxa Ambiental')) {
                    data.cell.styles.fillColor = [255, 243, 205];
                    data.cell.styles.textColor = [133, 100, 4];
                    data.cell.styles.fontStyle = 'bold';
                } else if (String(data.cell.raw).startsWith('!')) {
                    data.cell.styles.textColor = [220, 53, 69]; 
                    data.cell.styles.fontStyle = 'bold';
                }
            }
        }
    });

    const totalValor = filtrados.reduce((acc, curr) => acc + (parseFloat(curr.valor) || 0), 0);
    const finalY = doc.lastAutoTable.finalY + 10;
    doc.setFontSize(12);
    doc.setTextColor(0, 105, 55);
    doc.text(`Total de Passagens: ${filtrados.length} | Custo Total: R$ ${totalValor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 14, finalY);
    doc.text(`Mensalidades: R$ ${fleetMonthlyTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (${lastFleetCount} veíc.)`, 14, finalY + 7);

    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(150);
        const pageHeight = doc.internal.pageSize.getHeight();
        doc.text(`Página ${i} de ${pageCount}`, 283, pageHeight - 10, { align: 'right' });
    }

    doc.save(`Relatorio_Pedagio_${new Date().getTime()}.pdf`);
}

function exportarExcel() {
    const filtrados = getDadosGrid();
    const rows = filtrados.map(d => {
        const eixosCobrados = parseInt(d.categoria_eixos) || 0;
        const eixosCadastrados = parseInt(d.veiculos?.eixos) || 0;
        const taxaAmbiental = [90, 94].includes(eixosCobrados);
        const temDivergencia = !taxaAmbiental && eixosCadastrados > 0 && eixosCobrados > eixosCadastrados;

        return {
            "Data/Hora": formatarDataHoraBrasilia(d.data_hora_passagem),
            "Placa": d.placa,
            "Motorista": d.motorista || '',
            "Rota": d.rota || '',
            "Marca": d.marca_veiculo || '',
            "Eixos (Cobrado)": d.categoria_eixos || '',
            "Eixos (Cadastro)": d.veiculos?.eixos || '',
            "Alerta": taxaAmbiental ? "TAXA AMBIENTAL" : (temDivergencia ? "COBRANCA MAIOR" : ""),
            "Divergência": temDivergencia ? "COBRANÇA MAIOR" : "",
            "Rodovia": d.rodovia || '',
            "Praça": d.praca || '',
            "Valor (R$)": parseFloat(d.valor),
            "Usuário": d.usuario_nome || ''
        };
    });

    // Adiciona linha de rodapé com totais no Excel para seguir o padrão
    const totalValor = filtrados.reduce((acc, curr) => acc + (parseFloat(curr.valor) || 0), 0);
    rows.push({
        "Data/Hora": "TOTAIS GERAIS",
        "Placa": "",
        "Motorista": "",
        "Rota": "",
        "Marca": "",
        "Eixos (Cobrado)": "",
        "Eixos (Cadastro)": "",
        "Divergência": "",
        "Rodovia": "",
        "Praça": `${filtrados.length} Passagens`,
        "Valor (R$)": totalValor, // Custo Total
        "Mensalidades (R$)": fleetMonthlyTotal,
        "Qtd. Veículos Mensalidade": lastFleetCount,
        "Usuário": ""
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Pedagios");
    XLSX.writeFile(wb, `relatorio_pedagio_${new Date().getTime()}.xlsx`);
}
