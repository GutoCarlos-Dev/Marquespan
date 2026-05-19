export const STATUS_CLASSES = [
    'status-ok',
    'status-finalizado',
    'status-finalizado-rota',
    'status-nao-realizado',
    'status-pendente',
    'status-internado',
    'status-checkin-oficina',
    'status-checkin-rota'
];

const STATUS_ALIASES = {
    OK: 'FINALIZADO',
    'NAO REALIZADO': 'PENDENTE',
    'NÃO REALIZADO': 'PENDENTE',
    'NÃƒO REALIZADO': 'PENDENTE'
};

export function normalizarStatus(status) {
    const valor = String(status || '').trim().toUpperCase();
    return STATUS_ALIASES[valor] || valor;
}

export function getStatusClass(status) {
    switch (normalizarStatus(status)) {
        case 'FINALIZADO':
            return 'status-finalizado';
        case 'FINALIZADO ROTA':
            return 'status-finalizado-rota';
        case 'PENDENTE':
            return 'status-pendente';
        case 'INTERNADO':
            return 'status-internado';
        case 'CHECK-IN OFICINA':
            return 'status-checkin-oficina';
        case 'CHECK-IN ROTA':
            return 'status-checkin-rota';
        default:
            return '';
    }
}

