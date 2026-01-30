import { supabaseClient } from './supabase.js';

document.addEventListener('DOMContentLoaded', () => {
    const dateInput = document.getElementById('leituraDataMobile');
    
    // Define a data atual e carrega os bicos
    const today = new Date().toISOString().split('T')[0];
    dateInput.value = today;
    carregarBicos(today);

    // Recarrega os bicos quando a data muda
    dateInput.addEventListener('change', () => {
        carregarBicos(dateInput.value);
    });
});

async function carregarBicos(dataSelecionada) {
    const container = document.getElementById('lista-bicos-container');
    container.innerHTML = `
        <div class="loading-placeholder">
            <i class="fas fa-spinner fa-spin"></i> Carregando bicos...
        </div>
    `;

    try {
        // 1. Buscar todos os bicos
        const { data: bicos, error: bicosError } = await supabaseClient
            .from('bicos')
            .select('id, nome, bombas (nome, tanques (nome))')
            .order('nome');
        if (bicosError) throw bicosError;

        // 2. Buscar leituras já salvas para a data selecionada
        const { data: leiturasSalvas, error: leiturasError } = await supabaseClient
            .from('leituras_bomba')
            .select('bomba_id, leitura_inicial, leitura_final')
            .eq('data', dataSelecionada);
        if (leiturasError) throw leiturasError;
        const leiturasMap = new Map(leiturasSalvas.map(l => [l.bomba_id, l]));

        // 3. Buscar a última leitura final do dia anterior para cada bico
        const dataAnterior = new Date(dataSelecionada);
        dataAnterior.setDate(dataAnterior.getDate()); // Pega o dia anterior (o fuso horário pode complicar, mas para YYYY-MM-DD funciona)
        const dataAnteriorStr = dataAnterior.toISOString().split('T')[0];

        const { data: leiturasAnteriores, error: anterioresError } = await supabaseClient
            .from('leituras_bomba')
            .select('bomba_id, leitura_final, usuario_cadastro, created_at')
            .eq('data', dataAnteriorStr);
        if (anterioresError) throw anterioresError;
        const anterioresMap = new Map(leiturasAnteriores.map(l => [l.bomba_id, l]));

        container.innerHTML = ''; // Limpa o container

        if (!bicos || bicos.length === 0) {
            container.innerHTML = '<div class="loading-placeholder">Nenhum bico cadastrado.</div>';
            return;
        }

        // 4. Renderizar os cards
        bicos.forEach(bico => {
            const leituraDoDia = leiturasMap.get(bico.id);
            const dadosAnteriores = anterioresMap.get(bico.id);
            const leituraAnterior = dadosAnteriores ? dadosAnteriores.leitura_final : 0;
            
            let infoAnterior = '';
            if (dadosAnteriores) {
                const dataHora = new Date(dadosAnteriores.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
                infoAnterior = `<div style="font-size: 0.75rem; color: #666; margin-bottom: 2px;">${dadosAnteriores.usuario_cadastro || 'Sistema'} - ${dataHora}</div>`;
            }

            const isSalvo = !!leituraDoDia;

            const nomeBomba = bico.bombas?.nome || 'Bomba N/A';
            const nomeTanque = bico.bombas?.tanques?.nome || 'Tanque N/A';

            const card = document.createElement('div');
            card.className = `bico-card ${isSalvo ? 'status-salvo' : 'status-pendente'}`;
            card.id = `card-bico-${bico.id}`;

            card.innerHTML = `
                <div class="bico-header">
                    <h3>${bico.nome} - ${nomeBomba} - ${nomeTanque}</h3>
                    <span class="bico-status-badge ${isSalvo ? 'salvo' : 'pendente'}">
                        ${isSalvo ? 'SALVO' : 'PENDENTE'}
                    </span>
                </div>
                <div class="bico-body">
                    <div class="leitura-group">
                        <label>Leitura Anterior</label>
                        ${infoAnterior}
                        <div class="value" id="anterior-${bico.id}">${parseFloat(leituraAnterior).toFixed(2)}</div>
                    </div>
                    <div class="leitura-group">
                        <label>Leitura Atual</label>
                        <input type="number" step="0.01" id="atual-${bico.id}" 
                               placeholder="0.00" 
                               value="${leituraDoDia ? parseFloat(leituraDoDia.leitura_inicial).toFixed(2) : ''}" 
                               ${isSalvo ? 'readonly' : ''} 
                               style="background-color: ${isSalvo ? '#e9ecef' : '#fff'};" />
                    </div>
                </div>
                <div class="bico-actions">
                    ${!isSalvo ? `<button class="btn-primary btn-salvar-leitura" data-bico-id="${bico.id}">Salvar Leitura</button>` : ''}
                </div>
            `;
            container.appendChild(card);
        });

        // Adiciona event listeners aos botões de salvar
        document.querySelectorAll('.btn-salvar-leitura').forEach(btn => {
            btn.addEventListener('click', salvarLeitura);
        });

    } catch (err) {
        console.error('Erro ao carregar bicos:', err);
        container.innerHTML = `<div class="loading-placeholder" style="color:red;">Erro ao carregar dados: ${err.message}</div>`;
    }
}

async function salvarLeitura(event) {
    const btn = event.target;
    const bicoId = btn.dataset.bicoId;
    const dataSelecionada = document.getElementById('leituraDataMobile').value;

    const leituraAnteriorEl = document.getElementById(`anterior-${bicoId}`);
    const leituraAtualEl = document.getElementById(`atual-${bicoId}`);

    const leituraAnterior = parseFloat(leituraAnteriorEl.textContent);
    const leituraAtual = parseFloat(leituraAtualEl.value);

    if (isNaN(leituraAtual) || leituraAtual <= 0) {
        alert('Por favor, insira um valor válido para a leitura atual.');
        leituraAtualEl.focus();
        return;
    }

    if (leituraAtual < leituraAnterior) {
        if (!confirm('A leitura atual é menor que a anterior. Deseja continuar mesmo assim?')) {
            return;
        }
    }

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';

    try {
        const usuarioLogado = JSON.parse(localStorage.getItem('usuarioLogado'));
        const usuario = usuarioLogado ? usuarioLogado.nome : 'App Mobile';

        const { error } = await supabaseClient
            .from('leituras_bomba')
            .insert({
                data: dataSelecionada,
                bomba_id: bicoId,
                leitura_inicial: leituraAtual,
                leitura_final: leituraAtual, // No início do dia, a final é igual à inicial
                usuario_cadastro: usuario
            });

        if (error) throw error;

        alert('Leitura salva com sucesso!');
        
        // Atualiza a UI do card específico
        const card = document.getElementById(`card-bico-${bicoId}`);
        card.classList.remove('status-pendente');
        card.classList.add('status-salvo');
        card.querySelector('.bico-status-badge').className = 'bico-status-badge salvo';
        card.querySelector('.bico-status-badge').textContent = 'SALVO';
        leituraAtualEl.readOnly = true;
        leituraAtualEl.style.backgroundColor = '#e9ecef';
        btn.remove();

    } catch (err) {
        console.error('Erro ao salvar leitura:', err);
        alert('Erro ao salvar: ' + err.message);
        btn.disabled = false;
        btn.textContent = 'Salvar Leitura';
    }
}