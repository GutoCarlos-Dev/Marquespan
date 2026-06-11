import { supabaseClient } from './supabase.js';

let canalPresenca = null;
let canalSinais = null;

document.addEventListener('DOMContentLoaded', iniciarPresencaOnline);

function iniciarPresencaOnline() {
  const usuario = JSON.parse(localStorage.getItem('usuarioLogado'));
  if (!usuario?.id) return;

  canalPresenca = supabaseClient.channel('presenca_usuarios', {
    config: { presence: { key: String(usuario.id) } }
  });

  canalPresenca.subscribe(async status => {
    if (status !== 'SUBSCRIBED') return;
    await canalPresenca.track({
      user_id: usuario.id,
      nome: usuario.nome || 'Usuario',
      filial: usuario.filial || '',
      pagina: window.location.pathname.split('/').pop() || '',
      entrou_em: new Date().toISOString()
    });
  });

  canalSinais = supabaseClient.channel('sinais_admin');
  canalSinais
    .on('broadcast', { event: 'force_logout' }, async ({ payload }) => {
      if (String(payload?.user_id) !== String(usuario.id)) return;

      await canalSinais.send({
        type: 'broadcast',
        event: 'logout_confirmado',
        payload: { nome: usuario.nome || 'Usuario' }
      });

      await supabaseClient.auth.signOut();
      localStorage.removeItem('usuarioLogado');
      localStorage.removeItem('marquespan_auth_version');
      window.location.href = 'index.html';
    })
    .subscribe();
}

window.addEventListener('beforeunload', () => {
  if (canalPresenca) supabaseClient.removeChannel(canalPresenca);
  if (canalSinais) supabaseClient.removeChannel(canalSinais);
});
