import { supabaseClient } from './supabase.js';

let dadosGrid = [];
let currentSort = { field: 'data', ascending: false };

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Configura os Listeners primeiro para garantir que a UI responda mesmo com erro no banco
    setupEventListeners();

    // 2. Define data padrão
    const now = new Date();
    const dateInput = document.getElementById('cadeadoData');
    if (dateInput) dateInput.value = now.toISOString().split('T')[0];
    
    // 3. Carrega os dados de forma assíncrona
    try {
        await carregarDadosApoio();
        await buscarDados();
    } catch (err) {
        console.error('Erro na carga inicial:', err);
    }
});

function setupEventListeners() {
    const btnIncluir = document.getElementById('btnAbrirModalIncluir');
    if (btnIncluir) btnIncluir.addEventListener('click', () => abrirModal());
    document.getElementById('btnAbrirModalImportar')?.addEventListener('click', abrirModalImportar);

    document.getElementById('btnFecharModal')?.addEventListener('click', fecharModal);
    document.getElementById('btnCancelarModal')?.addEventListener('click', fecharModal);
    document.getElementById('btnFecharModalImportar')?.addEventListener('click', fecharModalImportar);
    document.getElementById('btnCancelarImportar')?.addEventListener('click', fecharModalImportar);
    document.getElementById('formCadeado')?.addEventListener('submit', handleSalvar);
    document.getElementById('formImportarCadeado')?.addEventListener('submit', handleImportarXlsx);
    document.getElementById('btnFiltrar')?.addEventListener('click', buscarDados);
    document.getElementById('searchGrid')?.addEventListener('input', renderizarTabela);

    document.querySelectorAll('th.sortable').forEach(th => {
        th.addEventListener('click', () => {
            const field = th.dataset.sort;
            currentSort.ascending = (currentSort.field === field) ? !currentSort.ascending : true;
            currentSort.field = field;
            renderizarTabela();
        });
    });
}

async function carregarDadosApoio() {
    try {
        // Motoristas da página Funcionários
        const { data: motoristas } = await supabaseClient
            .from('funcionario')
            .select('nome')
            .ilike('funcao', '%Motorista%')
            .eq('status', 'Ativo')
            .order('nome');
        
        if (motoristas) {
            const dls = [document.getElementById('listaMotoristasFiltro'), document.getElementById('listaMotoristasModal')];
            motoristas.forEach(m => dls.forEach(dl => {
                if (dl) dl.appendChild(new Option(m.nome, m.nome));
            }));
        }

        // Veículos (Todos independente de status)
        const { data: veiculos } = await supabaseClient.from('veiculos').select('placa').order('placa');
        if (veiculos) {
            const dls = [document.getElementById('listaPlacasFiltro'), document.getElementById('listaPlacasModal')];
            veiculos.forEach(v => dls.forEach(dl => {
                if (dl) dl.appendChild(new Option(v.placa, v.placa));
            }));
        }
    } catch (err) { console.error('Erro ao carregar dados:', err); }
}

async function buscarDados() {
    const tbody = document.getElementById('tbodyControleCadeado');
    tbody.innerHTML = '<tr><td colspan="6" class="text-center">Buscando...</td></tr>';

    try {
        const dataIni = document.getElementById('filtroDataIni').value;
        const dataFim = document.getElementById('filtroDataFim').value;
        const motorista = document.getElementById('filtroMotorista').value;
        const placa = document.getElementById('filtroPlaca').value;

        let query = supabaseClient.from('controle_cadeado').select('*');
        if (dataIni) query = query.gte('data', dataIni);
        if (dataFim) query = query.lte('data', dataFim);
        if (motorista) query = query.ilike('motorista', `%${motorista}%`);
        if (placa) query = query.ilike('placa', `%${placa}%`);

        const { data, error } = await query.order('data', { ascending: false });
        if (error) throw error;
        dadosGrid = data || [];
        renderizarTabela();
    } catch (err) { tbody.innerHTML = '<tr><td colspan="6" class="text-center">Erro ao carregar.</td></tr>'; }
}

function renderizarTabela() {
    const tbody = document.getElementById('tbodyControleCadeado');
    const search = document.getElementById('searchGrid').value.toUpperCase();
    
    let filtrados = dadosGrid.filter(d =>
        String(d.motorista || '').toUpperCase().includes(search) ||
        String(d.placa || '').toUpperCase().includes(search)
    );

    filtrados.sort((a, b) => {
        let valA = a[currentSort.field], valB = b[currentSort.field];
        if (valA < valB) return currentSort.ascending ? -1 : 1;
        if (valA > valB) return currentSort.ascending ? 1 : -1;
        return 0;
    });

    tbody.innerHTML = filtrados.map(d => `
        <tr>
            <td>${new Date(d.data + 'T00:00:00').toLocaleDateString('pt-BR')}</td>
            <td>${d.usuario || ''}</td>
            <td>${d.motorista}</td>
            <td>${d.placa || ''}</td>
            <td style="text-align:center">${d.quantidade}</td>
            <td style="text-align:center">
                <button class="btn-action btn-edit" onclick="window.editarRegistro('${d.id}')"><i class="fas fa-edit"></i></button>
                <button class="btn-action btn-delete" onclick="window.excluirRegistro('${d.id}')"><i class="fas fa-trash"></i></button>
            </td>
        </tr>`).join('');
}

function abrirModal(id = null) {
    const form = document.getElementById('formCadeado');
    form.reset();
    document.getElementById('cadeadoId').value = '';
    document.getElementById('cadeadoData').value = new Date().toISOString().split('T')[0];

    if (id) {
        const item = dadosGrid.find(d => d.id === id);
        if (item) {
            document.getElementById('cadeadoId').value = item.id;
            document.getElementById('cadeadoData').value = item.data;
            document.getElementById('cadeadoMotorista').value = item.motorista;
            document.getElementById('cadeadoPlaca').value = item.placa || '';
            document.getElementById('cadeadoQuantidade').value = item.quantidade;
        }
    }
    document.getElementById('modalCadeado').classList.remove('hidden');
}

function fecharModal() { document.getElementById('modalCadeado').classList.add('hidden'); }

function abrirModalImportar() {
    document.getElementById('formImportarCadeado')?.reset();
    const resumo = document.getElementById('importarCadeadoResumo');
    if (resumo) {
        resumo.textContent = '';
        resumo.classList.add('hidden');
    }
    document.getElementById('modalImportarCadeado')?.classList.remove('hidden');
}

function fecharModalImportar() {
    document.getElementById('modalImportarCadeado')?.classList.add('hidden');
}

async function handleSalvar(e) {
    e.preventDefault();
    const id = document.getElementById('cadeadoId').value;
    const payload = {
        data: document.getElementById('cadeadoData').value,
        motorista: document.getElementById('cadeadoMotorista').value.toUpperCase(),
        placa: document.getElementById('cadeadoPlaca').value.trim().toUpperCase() || null,
        quantidade: parseInt(document.getElementById('cadeadoQuantidade').value),
        usuario: JSON.parse(localStorage.getItem('usuarioLogado'))?.nome || 'Sistema'
    };

    const res = id ? await supabaseClient.from('controle_cadeado').update(payload).eq('id', id) : await supabaseClient.from('controle_cadeado').insert([payload]);
    if (res.error) return alert('Erro ao salvar: ' + res.error.message);
    
    fecharModal();
    buscarDados();
}

function normalizarCabecalho(valor) {
    return String(valor || '')
        .trim()
        .toUpperCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

function excelDateToISO(valor) {
    if (!valor) return '';

    if (valor instanceof Date) {
        return valor.toISOString().split('T')[0];
    }

    if (typeof valor === 'number') {
        const data = XLSX.SSF.parse_date_code(valor);
        if (!data) return '';

        return [
            String(data.y).padStart(4, '0'),
            String(data.m).padStart(2, '0'),
            String(data.d).padStart(2, '0')
        ].join('-');
    }

    const texto = String(valor).trim();
    const matchBR = texto.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
    if (matchBR) {
        const dia = matchBR[1].padStart(2, '0');
        const mes = matchBR[2].padStart(2, '0');
        const ano = matchBR[3].length === 2 ? `20${matchBR[3]}` : matchBR[3];
        return `${ano}-${mes}-${dia}`;
    }

    const data = new Date(texto);
    return isNaN(data) ? '' : data.toISOString().split('T')[0];
}

function mapearRegistroImportado(linha) {
    const normalizada = {};
    Object.entries(linha).forEach(([chave, valor]) => {
        normalizada[normalizarCabecalho(chave)] = valor;
    });

    const data = excelDateToISO(normalizada.DATA);
    const quantidade = parseInt(normalizada.QUANTIDADE, 10);

    return {
        data,
        motorista: String(normalizada.MOTORISTA || '').trim().toUpperCase(),
        placa: String(normalizada.PLACA || '').trim().toUpperCase() || null,
        quantidade,
        usuario: JSON.parse(localStorage.getItem('usuarioLogado'))?.nome || 'Sistema'
    };
}

function validarRegistroImportado(registro, linha) {
    if (!registro.motorista) return `Linha ${linha}: MOTORISTA nao informado.`;
    if (!registro.data) return `Linha ${linha}: DATA invalida ou nao informada.`;
    if (!Number.isInteger(registro.quantidade) || registro.quantidade <= 0) {
        return `Linha ${linha}: QUANTIDADE invalida.`;
    }
    return null;
}

async function handleImportarXlsx(event) {
    event.preventDefault();

    const input = document.getElementById('arquivoImportarCadeado');
    const arquivo = input?.files?.[0];
    const resumo = document.getElementById('importarCadeadoResumo');

    if (!arquivo) {
        alert('Selecione um arquivo XLSX para importar.');
        return;
    }

    if (!window.XLSX) {
        alert('Biblioteca de importacao XLSX nao carregada. Verifique sua conexao e tente novamente.');
        return;
    }

    try {
        if (resumo) {
            resumo.textContent = 'Lendo arquivo...';
            resumo.classList.remove('hidden');
        }

        const buffer = await arquivo.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
        const primeiraAba = workbook.SheetNames[0];
        const sheet = workbook.Sheets[primeiraAba];
        const linhas = XLSX.utils.sheet_to_json(sheet, { defval: '' });

        if (linhas.length === 0) {
            alert('A planilha nao possui registros para importar.');
            return;
        }

        const cabecalhos = Object.keys(linhas[0]).map(normalizarCabecalho);
        const obrigatorias = ['MOTORISTA', 'DATA', 'QUANTIDADE'];
        const faltantes = obrigatorias.filter(coluna => !cabecalhos.includes(coluna));

        if (faltantes.length > 0) {
            alert(`Colunas obrigatorias ausentes: ${faltantes.join(', ')}`);
            return;
        }

        const erros = [];
        const registros = linhas
            .map((linha, index) => ({ registro: mapearRegistroImportado(linha), numeroLinha: index + 2 }))
            .filter(({ registro }) => registro.motorista || registro.placa || registro.data || registro.quantidade)
            .filter(({ registro, numeroLinha }) => {
                const erro = validarRegistroImportado(registro, numeroLinha);
                if (erro) erros.push(erro);
                return !erro;
            })
            .map(({ registro }) => registro);

        if (erros.length > 0) {
            alert(`Corrija a planilha antes de importar:\n\n${erros.slice(0, 10).join('\n')}${erros.length > 10 ? '\n...' : ''}`);
            return;
        }

        if (registros.length === 0) {
            alert('Nenhum registro valido encontrado para importar.');
            return;
        }

        if (!confirm(`Importar ${registros.length} registro(s) da aba ${primeiraAba}?`)) {
            return;
        }

        const { error } = await supabaseClient.from('controle_cadeado').insert(registros);
        if (error) throw error;

        if (resumo) resumo.textContent = `${registros.length} registro(s) importado(s) com sucesso.`;
        fecharModalImportar();
        await buscarDados();
        alert('Importacao concluida com sucesso!');
    } catch (error) {
        console.error('Erro ao importar XLSX:', error);
        alert('Erro ao importar XLSX: ' + (error.message || JSON.stringify(error)));
    }
}

window.editarRegistro = (id) => abrirModal(id);
window.excluirRegistro = async (id) => {
    if (!confirm('Excluir este registro?')) return;
    const { error } = await supabaseClient.from('controle_cadeado').delete().eq('id', id);
    if (error) return alert('Erro ao excluir');
    buscarDados();
};
