import { supabaseClient } from './supabase.js';

document.addEventListener('DOMContentLoaded', async () => {
    await carregarFiliais();
    
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    
    if (id) {
        await carregarDadosVeiculo(id);
    }

    document.getElementById('formVeiculo').addEventListener('submit', salvarVeiculo);
    
    const btnExcluir = document.getElementById('btnExcluir');
    if (btnExcluir) {
        if (id) {
            btnExcluir.addEventListener('click', () => excluirVeiculo(id));
        } else {
            btnExcluir.style.display = 'none';
        }
    }
});

async function carregarFiliais() {
    const select = document.getElementById('filial');
    if (!select) return;

    try {
        const { data, error } = await supabaseClient
            .from('filiais')
            .select('nome, sigla')
            .order('nome');

        if (error) throw error;

        select.innerHTML = '<option value="">Selecione</option>';
        
        if (data) {
            data.forEach(f => {
                const option = document.createElement('option');
                // Usa a sigla como valor se existir, caso contrário usa o nome
                option.value = f.sigla || f.nome;
                option.textContent = f.sigla ? `${f.nome} (${f.sigla})` : f.nome;
                select.appendChild(option);
            });
        }
    } catch (err) {
        console.error('Erro ao carregar filiais:', err);
        alert('Erro ao carregar lista de filiais.');
    }
}

async function carregarDadosVeiculo(id) {
    try {
        const { data, error } = await supabaseClient
            .from('veiculos')
            .select('*')
            .eq('id', id)
            .single();

        if (error) throw error;

        if (data) {
            document.getElementById('filial').value = data.filial || '';
            document.getElementById('placa').value = data.placa || '';
            document.getElementById('marca').value = data.marca || '';
            document.getElementById('modelo').value = data.modelo || '';
            document.getElementById('renavan').value = data.renavan || '';
            document.getElementById('chassi').value = data.chassi || '';
            document.getElementById('anofab').value = data.anofab || '';
            document.getElementById('anomod').value = data.anomod || '';
            document.getElementById('qtdtanque').value = data.qtdtanque || '';
            document.getElementById('tipo').value = data.tipo || '';
            document.getElementById('situacao').value = data.situacao || '';
            document.getElementById('qrcode').value = data.qrcode || '';
        }
    } catch (err) {
        console.error('Erro ao carregar veículo:', err);
        alert('Erro ao carregar dados do veículo.');
    }
}

async function salvarVeiculo(e) {
    e.preventDefault();
    
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    
    const formData = new FormData(e.target);
    const dados = Object.fromEntries(formData.entries());
    
    // Tratamento de campos numéricos vazios para evitar erro no banco
    if (!dados.anofab) delete dados.anofab;
    if (!dados.anomod) delete dados.anomod;
    if (!dados.qtdtanque) delete dados.qtdtanque;

    // Garante que a placa esteja em maiúsculas
    if (dados.placa) dados.placa = dados.placa.toUpperCase();

    try {
        let error;
        if (id) {
            const { error: updateError } = await supabaseClient
                .from('veiculos')
                .update(dados)
                .eq('id', id);
            error = updateError;
        } else {
            const { error: insertError } = await supabaseClient
                .from('veiculos')
                .insert([dados]);
            error = insertError;
        }

        if (error) throw error;

        alert('Veículo salvo com sucesso!');
        // Atualiza a grid na janela pai se ela existir
        if (window.opener && window.opener.refreshGrid) {
            window.opener.refreshGrid();
        }
        window.close();
    } catch (err) {
        console.error('Erro ao salvar:', err);
        alert('Erro ao salvar veículo: ' + err.message);
    }
}

async function excluirVeiculo(id) {
    if (!confirm('Tem certeza que deseja excluir este veículo?')) return;

    try {
        const { error } = await supabaseClient
            .from('veiculos')
            .delete()
            .eq('id', id);

        if (error) throw error;

        alert('Veículo excluído com sucesso!');
        if (window.opener && window.opener.refreshGrid) {
            window.opener.refreshGrid();
        }
        window.close();
    } catch (err) {
        console.error('Erro ao excluir:', err);
        alert('Erro ao excluir veículo: ' + err.message);
    }
}