import { supabaseClient } from './supabase.js';

document.addEventListener("DOMContentLoaded", async () => {
  // Verificação de segurança para garantir que a importação funcionou
  if (typeof supabaseClient === 'undefined') {
    console.error("Erro crítico: supabaseClient não definido. Verifique a importação no topo do arquivo.");
    alert("Erro no sistema: Conexão com banco de dados não inicializada.");
    return;
  }

  const form = document.getElementById("formVeiculo");
  const btnExcluir = document.getElementById("btnExcluir");
  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");

  // Atalho de teclado Ctrl+S para salvar
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      form.requestSubmit();
    }
  });

  // 🔍 Preenche os campos se estiver em modo de edição
  if (id) {

    const { data: veiculo, error } = await supabaseClient
      .from("veiculos")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !veiculo) {
      console.error("Erro ao buscar veículo:", error);
      alert("Erro ao carregar dados do veículo.");
      return;
    }

    Object.keys(veiculo).forEach((campo) => {
      const input = document.getElementById(campo);
      if (input && veiculo[campo] !== null) {
        input.value = veiculo[campo];
      }
    });

    // 🗑️ Ativa botão de exclusão
    if (btnExcluir) {
      btnExcluir.style.display = "inline-block";
      btnExcluir.addEventListener("click", async () => {
        const confirmar = confirm("Tem certeza que deseja excluir este veículo?");
        if (!confirmar) return;

        const { error: erroExclusao } = await supabaseClient
          .from("veiculos")
          .delete()
          .eq("id", id);

        if (erroExclusao) {
          console.error("Erro ao excluir:", erroExclusao);
          alert("Erro ao excluir o veículo.");
        } else {
          alert("Veículo excluído com sucesso!");
          // Notifica a janela pai para recarregar a grid
          if (window.opener && typeof window.opener.refreshGrid === 'function') {
            window.opener.refreshGrid();
          }
          window.close();
        }
      });
    }
  } else {
    // Oculta botão de exclusão em novo cadastro
    if (btnExcluir) btnExcluir.style.display = "none";
  }

  // 💾 Submeter dados
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const placa = form.placa.value.trim();
    const filial = form.filial.value.trim();

    if (!placa || !filial) {
      alert("Por favor, preencha os campos obrigatórios: Placa e Filial.");
      return;
    }

    const btnSalvar = form.querySelector('button[type="submit"]');
    const textoOriginal = btnSalvar.innerHTML;
    btnSalvar.disabled = true;
    btnSalvar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';

    const veiculo = {
      placa,
      filial,
      marca: form.marca.value.trim(),
      modelo: form.modelo.value.trim(),
      tipo: form.tipo.value.trim(),
      situacao: form.situacao.value.trim(),
      chassi: form.chassi?.value.trim() || null,
      renavan: form.renavan?.value.trim() || null,
      anofab: form.anofab.value ? parseInt(form.anofab.value) : null,
      anomod: form.anomod.value ? parseInt(form.anomod.value) : null,
      qtdtanque: form.qtdtanque.value ? parseInt(form.qtdtanque.value) : null,
      qrcode: form.qrcode?.value.trim() || null,
    };

    try {
      if (id) {
        const { data, error } = await supabaseClient
          .from("veiculos")
          .update(veiculo)
          .eq("id", id);

        if (error) {
          console.error("Erro ao atualizar:", error);
          alert("Erro ao atualizar o veículo.");
          return;
        }

        alert("Veículo atualizado com sucesso!");
        form.reset();
        // Notifica a janela pai para recarregar a grid
        if (window.opener && typeof window.opener.refreshGrid === 'function') {
          window.opener.refreshGrid();
        }
        window.close();
      } else {
        const { data: existente, error: erroBusca } = await supabaseClient
          .from("veiculos")
          .select("id")
          .eq("placa", veiculo.placa);

        if (erroBusca) {
          console.error("Erro ao verificar placa:", erroBusca);
          alert("Erro ao verificar placa. Tente novamente.");
          return;
        }

        if (existente.length > 0) {
          alert("Já existe um veículo com essa placa.");
          return;
        }

        const { data, error } = await supabaseClient
          .from("veiculos")
          .insert([veiculo]);

        if (error) {
          console.error("Erro ao salvar:", error);
          alert("Erro ao salvar o veículo. Tente novamente.");
          return;
        }

        alert("Veículo cadastrado com sucesso!");
        form.reset();
        // Notifica a janela pai para recarregar a grid
        if (window.opener && typeof window.opener.refreshGrid === 'function') {
          window.opener.refreshGrid();
        }
        window.close();
      }
    } catch (err) {
      console.error("Erro inesperado:", err);
      alert("Erro inesperado. Verifique sua conexão.");
    } finally {
      btnSalvar.disabled = false;
      btnSalvar.innerHTML = textoOriginal;
    }
  });
});
