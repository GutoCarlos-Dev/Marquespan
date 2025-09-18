// js/config.js - Configurações do SupaBase

// Substitua pelas suas credenciais do SupaBase
const SUPABASE_URL = 'https://tetshxfxrdbzovajmfoz.supabase.co'; // Substitua pela URL do seu projeto
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRldHNoeGZ4cmRiem92YWptZm96Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTcxMDI1NDUsImV4cCI6MjA3MjY3ODU0NX0.dG09yVDrzofmRc7XmVHwgVJKVOG1xjPGkwxJGdYpk4U'; // Substitua pela chave anônima

// Inicializar cliente SupaBase
// A variável global 'supabase' será criada aqui para conter o CLIENTE inicializado.
// Usamos 'let' para evitar conflito imediato com 'window.supabase' da CDN.
let supabase;

try {
    // O objeto da CDN (a biblioteca) está em 'window.supabase'.
    if (typeof window !== 'undefined' && typeof window.supabase !== 'undefined') {
        // Criamos o cliente usando a biblioteca e o atribuímos à nossa variável 'supabase'.
        // A partir daqui, a variável global 'supabase' em todo o projeto se referirá ao CLIENTE, não mais à biblioteca.
        supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        console.log('✅ SupaBase inicializado com sucesso');
    } else {
        supabase = null; // Garante que supabase seja nulo se a biblioteca não carregar.
        console.warn('⚠️ SupaBase não está carregado. Certifique-se de que o CDN está incluído no HTML.');
    }
} catch (error) {
    supabase = null;
    console.error('❌ Erro ao inicializar SupaBase:', error);
}
