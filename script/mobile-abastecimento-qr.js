import { supabaseClient } from './supabase.js';

let html5QrCode = null;
let isScanning = false;
let scanContext = 'veiculo'; // 'veiculo' | 'bico1' | 'bico2'

function getUserFilial() {
    try {
        const usuarioLogado = JSON.parse(localStorage.getItem('usuarioLogado'));
        return usuarioLogado?.filial || '';
    } catch (e) {
        console.error('Erro ao identificar a filial do usuário:', e);
        return '';
    }
}

function placaDisponivelParaUsuario(placa) {
    const placaNormalizada = String(placa || '').toUpperCase().trim();
    const listaVeiculos = document.getElementById('listaVeiculos');

    return Array.from(listaVeiculos?.options || []).some(option => (
        option.value.toUpperCase().trim() === placaNormalizada
    ));
}

const TITULOS = {
    veiculo: '<i class="fas fa-qrcode"></i> Escanear Veículo',
    bico1:   '<i class="fas fa-qrcode"></i> Escanear Bico de Origem',
    bico2:   '<i class="fas fa-qrcode"></i> Escanear Bico 2',
};

document.addEventListener('DOMContentLoaded', () => {
    const modalScanner      = document.getElementById('modalScanner');
    const btnCloseScanner   = document.getElementById('btnCloseScanner');
    const modalVincular     = document.getElementById('modalVincular');
    const btnCloseVincular  = document.getElementById('btnCloseVincular');
    const btnConfirmarVinculo = document.getElementById('btnConfirmarVinculo');

    // ── Botão Veículo (Placa) ──
    document.getElementById('btnScanQR')?.addEventListener('click', () => {
        abrirScanner('veiculo', modalScanner);
    });

    // ── Botão Bico de Origem ──
    document.getElementById('btnScanQRBico1')?.addEventListener('click', () => {
        abrirScanner('bico1', modalScanner);
    });

    // ── Botão Bico 2 ──
    document.getElementById('btnScanQRBico2')?.addEventListener('click', () => {
        abrirScanner('bico2', modalScanner);
    });

    // ── Fechar scanner ──
    btnCloseScanner?.addEventListener('click', () => {
        stopScanner();
        modalScanner?.classList.add('hidden');
    });

    // ── Modal Vincular (apenas para veículo) ──
    btnCloseVincular?.addEventListener('click', () => {
        modalVincular?.classList.add('hidden');
    });

    btnConfirmarVinculo?.addEventListener('click', realizarVinculo);
});

function abrirScanner(contexto, modalScanner) {
    scanContext = contexto;
    const titulo = document.getElementById('scannerModalTitulo');
    if (titulo) titulo.innerHTML = TITULOS[contexto] || TITULOS.veiculo;
    modalScanner?.classList.remove('hidden');
    startScanner();
}

async function startScanner() {
    if (isScanning) return;

    if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
        alert('A câmera requer uma conexão segura (HTTPS).');
        return;
    }

    const readerElement = document.getElementById('reader');
    if (!readerElement) {
        console.error('Elemento #reader não encontrado para inicializar a câmera.');
        return;
    }

    try {
        if (!html5QrCode) {
            html5QrCode = new Html5Qrcode('reader');
        }

        const config = {
            fps: 10,
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1.0
        };

        await html5QrCode.start(
            { facingMode: 'environment' },
            config,
            onScanSuccess,
            () => {}
        );

        isScanning = true;

        setTimeout(() => {
            const video = document.querySelector('#reader video');
            if (video) {
                video.style.objectFit = 'cover';
                video.style.width = '100%';
                video.style.height = '100%';
            }
        }, 500);

    } catch (err) {
        console.error('Erro ao iniciar câmera:', err);
        let msg = 'Não foi possível acessar a câmera.';
        if (err.name === 'NotAllowedError') msg = 'Permissão de câmera negada.';
        if (err.name === 'NotFoundError')   msg = 'Nenhuma câmera encontrada.';
        alert(msg);
        document.getElementById('modalScanner')?.classList.add('hidden');
    }
}

async function stopScanner() {
    if (html5QrCode && isScanning) {
        try {
            await html5QrCode.stop();
            isScanning = false;
        } catch (err) {
            console.warn('Erro ao parar câmera:', err);
        }
    }
}

async function onScanSuccess(decodedText) {
    stopScanner();
    document.getElementById('modalScanner')?.classList.add('hidden');

    const qrCode = decodedText.trim();

    if (scanContext === 'bico1') {
        await preencherBico(qrCode, 'saidaBico');
        return;
    }

    if (scanContext === 'bico2') {
        await preencherBico(qrCode, 'saidaBico2');
        return;
    }

    // contexto padrão: veículo
    try {
        let queryVeiculo = supabaseClient
            .from('veiculos')
            .select('placa')
            .eq('qrcode', qrCode);

        const filialUsuario = getUserFilial();
        if (filialUsuario) {
            queryVeiculo = queryVeiculo.eq('filial', filialUsuario);
        }

        const { data: veiculo } = await queryVeiculo.single();

        if (veiculo) {
            preencherVeiculo(veiculo.placa);
        } else {
            const placaRegex = /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/;
            const cleanText  = qrCode.replace(/[^A-Z0-9]/g, '');

            if (cleanText.length === 7 && placaRegex.test(cleanText)) {
                if (placaDisponivelParaUsuario(cleanText)) {
                    preencherVeiculo(cleanText);
                } else {
                    alert('Esta placa não pertence à filial do usuário.');
                }
            } else {
                abrirModalVinculo(qrCode);
            }
        }
    } catch (err) {
        console.error('Erro ao verificar QR Code:', err);
        alert('Erro ao verificar dados do veículo.');
    }
}

// ── Preenche campo de bico pelo QR Code ──
async function preencherBico(qrCode, selectId) {
    try {
        const { data: bico } = await supabaseClient
            .from('bicos')
            .select('id, nome, bombas(nome)')
            .eq('qrcode', qrCode)
            .single();

        if (!bico) {
            alert(`Nenhum bico cadastrado para este QR Code.\nCadastre o QR Code em "Cadastro de Bombas e Bicos".`);
            return;
        }

        const select = document.getElementById(selectId);
        if (!select) return;

        // Verifica se a opção existe no select (bicos já carregados)
        const optionExiste = Array.from(select.options).some(o => String(o.value) === String(bico.id));

        if (optionExiste) {
            select.value = bico.id;
            select.dispatchEvent(new Event('change', { bubbles: true }));
            alert(`Bico identificado: ${bico.nome}${bico.bombas ? ` (${bico.bombas.nome})` : ''}`);
        } else {
            alert(`Bico "${bico.nome}" identificado, mas não está disponível na lista atual.`);
        }

    } catch (err) {
        console.error('Erro ao verificar QR Code do bico:', err);
        alert('Erro ao verificar dados do bico.');
    }
}

function preencherVeiculo(placa) {
    const inputPlaca = document.getElementById('saidaVeiculo');
    if (inputPlaca) {
        inputPlaca.value = placa ? placa.toUpperCase().trim() : '';
        inputPlaca.dispatchEvent(new Event('input',  { bubbles: true }));
        inputPlaca.dispatchEvent(new Event('change', { bubbles: true }));
        alert(`Veículo identificado: ${placa}`);
    }
}

function abrirModalVinculo(qrCode) {
    document.getElementById('qrCodeLido').value   = qrCode;
    document.getElementById('placaVinculo').value = '';
    document.getElementById('modalVincular').classList.remove('hidden');
}

async function realizarVinculo() {
    const qrCode = document.getElementById('qrCodeLido').value;
    const placa  = document.getElementById('placaVinculo').value.toUpperCase().trim();

    if (!placa) return alert('Informe a placa do veículo.');
    if (!placaDisponivelParaUsuario(placa)) {
        return alert('Placa inválida ou não pertencente à filial do usuário.');
    }

    try {
        let queryVinculo = supabaseClient
            .from('veiculos')
            .update({ qrcode: qrCode })
            .eq('placa', placa);

        const filialUsuario = getUserFilial();
        if (filialUsuario) {
            queryVinculo = queryVinculo.eq('filial', filialUsuario);
        }

        const { error } = await queryVinculo;

        if (error) throw error;

        alert('QR Code vinculado com sucesso!');
        document.getElementById('modalVincular').classList.add('hidden');
        preencherVeiculo(placa);

    } catch (err) {
        console.error('Erro ao vincular:', err);
        alert('Erro ao vincular QR Code. Verifique se a placa existe.');
    }
}
