import { supabaseClient } from './supabase.js';

let html5QrCode = null;
let isScanning = false;

document.addEventListener('DOMContentLoaded', () => {
    const btnScanQR = document.getElementById('btnScanQR');
    const btnCloseScanner = document.getElementById('btnCloseScanner');
    const modalScanner = document.getElementById('modalScanner');
    
    // Elementos do Modal Vincular
    const modalVincular = document.getElementById('modalVincular');
    const btnCloseVincular = document.getElementById('btnCloseVincular');
    const btnConfirmarVinculo = document.getElementById('btnConfirmarVinculo');

    if (btnScanQR) {
        btnScanQR.addEventListener('click', () => {
            if (modalScanner) {
                modalScanner.classList.remove('hidden');
                startScanner();
            }
        });
    }

    if (btnCloseScanner) {
        btnCloseScanner.addEventListener('click', () => {
            stopScanner();
            if (modalScanner) modalScanner.classList.add('hidden');
        });
    }

    if (btnCloseVincular && modalVincular) {
        btnCloseVincular.addEventListener('click', () => {
            modalVincular.classList.add('hidden');
        });
    }

    if (btnConfirmarVinculo) {
        btnConfirmarVinculo.addEventListener('click', realizarVinculo);
    }
});

async function startScanner() {
    if (isScanning) return;

    // Verificação de Segurança (HTTPS)
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
        // Instancia a biblioteca se não existir
        if (!html5QrCode) {
            html5QrCode = new Html5Qrcode("reader");
        }

        // Configuração da câmera
        const config = { 
            fps: 10, 
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1.0
        };
        
        // Prefere a câmera traseira
        const cameraIdOrConfig = { facingMode: "environment" };

        await html5QrCode.start(
            cameraIdOrConfig, 
            config, 
            onScanSuccess, 
            onScanFailure
        );
        
        isScanning = true;
        
        // Ajuste visual para garantir que o vídeo ocupe o espaço
        setTimeout(() => {
            const video = document.querySelector('#reader video');
            if (video) {
                video.style.objectFit = 'cover';
                video.style.width = '100%';
                video.style.height = '100%';
            }
        }, 500);

    } catch (err) {
        console.error("Erro ao iniciar câmera:", err);
        let msg = 'Não foi possível acessar a câmera.';
        if (err.name === 'NotAllowedError') msg = 'Permissão de câmera negada.';
        if (err.name === 'NotFoundError') msg = 'Nenhuma câmera encontrada.';
        alert(msg);
        
        // Fecha o modal em caso de erro crítico
        document.getElementById('modalScanner')?.classList.add('hidden');
    }
}

async function stopScanner() {
    if (html5QrCode && isScanning) {
        try {
            await html5QrCode.stop();
            isScanning = false;
        } catch (err) {
            console.warn("Erro ao parar câmera:", err);
        }
    }
}

async function onScanSuccess(decodedText, decodedResult) {
    // Para o scanner imediatamente após leitura
    stopScanner();
    document.getElementById('modalScanner')?.classList.add('hidden');

    const qrCode = decodedText.trim();
    console.log(`QR Code lido: ${qrCode}`);

    try {
        // 1. Tenta buscar veículo pelo QR Code
        const { data: veiculo, error } = await supabaseClient
            .from('veiculos')
            .select('placa')
            .eq('qrcode', qrCode)
            .single();

        if (veiculo) {
            // Veículo encontrado
            preencherVeiculo(veiculo.placa);
        } else {
            // Não encontrado
            // Verifica se o texto lido parece uma placa (formato Mercosul ou antigo)
            const placaRegex = /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/;
            const cleanText = qrCode.replace(/[^A-Z0-9]/g, '');
            
            if (cleanText.length === 7 && placaRegex.test(cleanText)) {
                // É uma placa, preenche direto
                preencherVeiculo(cleanText);
            } else {
                // Não é placa e não tem vínculo -> Abrir modal de vínculo
                abrirModalVinculo(qrCode);
            }
        }
    } catch (err) {
        console.error('Erro ao verificar QR Code:', err);
        alert('Erro ao verificar dados do veículo.');
    }
}

function onScanFailure(error) {
    // console.warn(`Code scan error = ${error}`);
}

function preencherVeiculo(placa) {
    const inputPlaca = document.getElementById('saidaVeiculo');
    if (inputPlaca) {
        inputPlaca.value = placa;
        alert(`Veículo identificado: ${placa}`);
    }
}

function abrirModalVinculo(qrCode) {
    document.getElementById('qrCodeLido').value = qrCode;
    document.getElementById('placaVinculo').value = '';
    document.getElementById('modalVincular').classList.remove('hidden');
}

async function realizarVinculo() {
    const qrCode = document.getElementById('qrCodeLido').value;
    const placa = document.getElementById('placaVinculo').value.toUpperCase().trim();

    if (!placa) return alert('Informe a placa do veículo.');

    try {
        const { error } = await supabaseClient
            .from('veiculos')
            .update({ qrcode: qrCode })
            .eq('placa', placa);

        if (error) throw error;

        alert('QR Code vinculado com sucesso!');
        document.getElementById('modalVincular').classList.add('hidden');
        preencherVeiculo(placa);

    } catch (err) {
        console.error('Erro ao vincular:', err);
        alert('Erro ao vincular QR Code. Verifique se a placa existe.');
    }
}