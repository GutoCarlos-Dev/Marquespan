import { supabaseClient } from './supabase.js';
import { registrarAuditoria } from './auditoria-utils.js';

document.addEventListener('DOMContentLoaded', async () => {
    const dataInput = document.getElementById('mobileData');
    if (dataInput) dataInput.value = new Date().toISOString().split('T')[0];

    document.getElementById('formCadeadoMobile')?.addEventListener('submit', salvarLancamento);

    await carregarDadosApoio();
    await carregarUltimosLancamentos();
});

function getUsuarioLogado() {
    return JSON.parse(localStorage.getItem('usuarioLogado'))?.nome || 'Sistema';
}

async function carregarDadosApoio() {
    try {
        const [{ data: motoristas }, { data: veiculos }] = await Promise.all([
            supabaseClient
                .from('funcionario')
                .select('nome')
                .ilike('funcao', '%Motorista%')
                .eq('status', 'Ativo')
                .order('nome'),
            supabaseClient
                .from('veiculos')
                .select('placa')
                .order('placa')
        ]);

        const listaMotoristas = document.getElementById('listaMotoristasMobile');
        const listaPlacas = document.getElementById('listaPlacasMobile');

        if (listaMotoristas && motoristas) {
            listaMotoristas.innerHTML = '';
            motoristas.forEach(item => listaMotoristas.appendChild(new Option(item.nome, item.nome)));
        }

        if (listaPlacas && veiculos) {
            listaPlacas.innerHTML = '';
            veiculos.forEach(item => listaPlacas.appendChild(new Option(item.placa, item.placa)));
        }
    } catch (error) {
        console.error('Erro ao carregar dados de apoio:', error);
    }
}

async function salvarLancamento(event) {
    event.preventDefault();

    const btnSalvar = document.getElementById('btnSalvarCadeadoMobile');
    const payload = {
        data: document.getElementById('mobileData').value,
        motorista: document.getElementById('mobileMotorista').value.trim().toUpperCase(),
        placa: document.getElementById('mobilePlaca').value.trim().toUpperCase() || null,
        quantidade: parseInt(document.getElementById('mobileQuantidade').value, 10),
        usuario: getUsuarioLogado()
    };

    if (!payload.data || !payload.motorista || !Number.isInteger(payload.quantidade) || payload.quantidade <= 0) {
        alert('Preencha Data, Motorista e Quantidade corretamente.');
        return;
    }

    try {
        if (btnSalvar) {
            btnSalvar.disabled = true;
            btnSalvar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';
        }

        const { error } = await supabaseClient
            .from('controle_cadeado')
            .insert([payload]);

        if (error) throw error;

        document.getElementById('mobileMotorista').value = '';
        document.getElementById('mobilePlaca').value = '';
        document.getElementById('mobileQuantidade').value = '1';

        await carregarUltimosLancamentos();
        registrarAuditoria('INCLUIR', 'Controle Cadeado', `Lançamento de cadeado via app mobile: motorista ${payload.motorista}`);
        alert('Lancamento salvo com sucesso!');
    } catch (error) {
        console.error('Erro ao salvar lancamento:', error);
        alert('Erro ao salvar lancamento: ' + (error.message || JSON.stringify(error)));
    } finally {
        if (btnSalvar) {
            btnSalvar.disabled = false;
            btnSalvar.innerHTML = '<i class="fas fa-save"></i> Salvar Lancamento';
        }
    }
}

async function carregarUltimosLancamentos() {
    const container = document.getElementById('listaUltimosCadeados');
    if (!container) return;

    container.innerHTML = '<div class="empty-state"><i class="fas fa-spinner fa-spin"></i> Carregando...</div>';

    try {
        const { data, error } = await supabaseClient
            .from('controle_cadeado')
            .select('*')
            .order('data', { ascending: false })
            .limit(10);

        if (error) throw error;

        if (!data || data.length === 0) {
            container.innerHTML = '<div class="empty-state">Nenhum lancamento encontrado.</div>';
            return;
        }

        container.innerHTML = data.map(item => `
            <article class="cadeado-card">
                <div class="cadeado-card-header">
                    <span class="cadeado-date">${formatarData(item.data)}</span>
                    <span class="cadeado-qtd">${item.quantidade || 0} un.</span>
                </div>
                <div class="cadeado-info">
                    <span><strong>Usuario:</strong> ${item.usuario || '-'}</span>
                    <span><strong>Motorista:</strong> ${item.motorista || '-'}</span>
                    <span><strong>Placa:</strong> ${item.placa || '-'}</span>
                </div>
            </article>
        `).join('');
    } catch (error) {
        console.error('Erro ao carregar ultimos lancamentos:', error);
        container.innerHTML = '<div class="empty-state">Erro ao carregar lancamentos.</div>';
    }
}

function formatarData(dataISO) {
    if (!dataISO) return '-';
    return new Date(`${dataISO}T00:00:00`).toLocaleDateString('pt-BR');
}
