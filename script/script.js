// script.js — funções utilitárias globais

export function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  if (sidebar) {
    sidebar.classList.toggle('collapsed');
  }
}

export function exibirUsuarioLogado() {
  const nomeUsuario = localStorage.getItem('usuarioLogado');
  const divUsuario = document.getElementById('usuario-logado');
  if (nomeUsuario && divUsuario) {
    divUsuario.textContent = `👤 Olá, ${nomeUsuario}`;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  exibirUsuarioLogado();
});

function abrirModal() {
  document.getElementById("modalVeiculo").style.display = "flex";
}

function fecharModal() {
  document.getElementById("modalVeiculo").style.display = "none";
}
