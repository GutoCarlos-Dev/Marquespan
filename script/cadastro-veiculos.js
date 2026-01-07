import { supabaseClient } from './supabase.js';

document.addEventListener("DOMContentLoaded", async () => {
  const form = document.getElementById("formVeiculo");
  const btnExcluir = document.getElementById("btnExcluir");
  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");

  console.log("Página carregada. ID na URL:", id);

  // 🔍 Preenche os campos se estiver em modo de edição
  if (id) {
    console.log("Modo edição ativado. Buscando veículo no Supabase...");

    const { data: veiculo, error } = await supabaseClient
      .from("veiculos")
      .select("*")
      .eq("id", id)
      .single();

    console.log("Resposta da busca:", { veiculo, error });

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

        console.log("Solicitando exclusão do veículo ID:", id);

        const { error: erroExclusao } = await supabaseClient
          .from("veiculos")
          .delete()
          .eq("id", id);

        if (erroExclusao) {
          console.error("Erro ao excluir:", erroExclusao);
          alert("Erro ao excluir o veículo.");
        } else {
          console.log("Veículo excluído com sucesso.");
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
    console.log("Formulário enviado.");

    const placa = form.placa.value.trim();
    const filial = form.filial.value.trim();

    if (!placa || !filial) {
      alert("Por favor, preencha os campos obrigatórios: Placa e Filial.");
      return;
    }

    const veiculo = {
      placa,
      filial,
      marca: form.marca.value.trim(),
      modelo: form.modelo.value.trim(),
      tipo: form.tipo.value.trim(),
      situacao: form.situacao.value.trim(),
      chassi: form.chassi?.value.trim() || null,
      renavan: form.renavan?.value.trim() || null,
      anofab: parseInt(form.anofab.value),
      anomod: parseInt(form.anomod.value),
      qtdtanque: form.qtdtanque ? parseInt(form.qtdtanque.value) : null,
      qrcode: form.qrcode?.value.trim() || null,
    };

    console.log("Dados do veículo a salvar:", veiculo);

    try {
      if (id) {
        console.log("Tentando atualizar veículo com ID:", id);

        const { data, error } = await supabaseClient
          .from("veiculos")
          .update(veiculo)
          .eq("id", id);

        console.log("Resposta da atualização:", { data, error });

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
        console.log("Modo cadastro. Verificando placa duplicada...");

        const { data: existente, error: erroBusca } = await supabaseClient
          .from("veiculos")
          .select("id")
          .eq("placa", veiculo.placa);

        console.log("Resultado da verificação de placa:", { existente, erroBusca });

        if (erroBusca) {
          console.error("Erro ao verificar placa:", erroBusca);
          alert("Erro ao verificar placa. Tente novamente.");
          return;
        }

        if (existente.length > 0) {
          console.warn("Placa já existente:", veiculo.placa);
          alert("Já existe um veículo com essa placa.");
          return;
        }

        console.log("Inserindo novo veículo...");

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
    }
  });
});
