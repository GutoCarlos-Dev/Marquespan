import { supabase } from './supabase.js';

// Compras.js - Versão refatorada mantendo funcionalidades principais
// Estrutura: Services (Supabase), UI, Cart

class SupabaseService {
  static async list(table, cols='*', opts={}){
    let q = supabase.from(table).select(cols).order(opts.orderBy||'id',{ascending:!!opts.ascending});
    if(opts.eq) q = q.eq(opts.eq.field, opts.eq.value);
    if(opts.ilike) q = q.ilike(opts.ilike.field, opts.ilike.value);
    const { data, error } = await q;
    if (error) throw error;
    return data;
  }

  static async insert(table, payload){
    const { data, error } = await supabase.from(table).insert(payload).select();
    if (error) throw error;
    return data;
  }

  static async update(table, payload, key){
    const { data, error } = await supabase.from(table).update(payload).eq(key.field, key.value).select();
    if (error) throw error;
    return data;
  }

  static async remove(table, key){
    const { data, error } = await supabase.from(table).delete().eq(key.field, key.value);
    if (error) throw error;
    return data;
  }
}

class Cart {
  constructor(){
    this.items = [];
    this.load();
  }

  add(item){
    if(this.items.some(i=>i.cod===item.cod)) return false;
    this.items.push(item);
    this.save();
    return true;
  }

  remove(cod){
    this.items = this.items.filter(i=>i.cod!==cod);
    this.save();
  }

  clear(){
    this.items = [];
    this.save();
  }

  save(){
    localStorage.setItem('cotacaoCart', JSON.stringify(this.items));
  }

  load(){
    const saved = localStorage.getItem('cotacaoCart');
    if(saved) this.items = JSON.parse(saved);
  }
}

const UI = {
  init(){
    this.cache();
    this.bind();
    this.cart = new Cart();
    this.renderCompanies(3); // gera 3 cards
    this.populateProductDropdown();
    this.populateSupplierDropdowns();
    this.renderCart();
    this.generateNextQuotationCode();
    this.renderSavedQuotations();
    // sort state
    this._produtosSort = { field: 'nome', ascending: true };
    this._fornecedoresSort = { field: 'nome', ascending: true };
    this.renderProdutosGrid(); // carregar produtos no início
    this.renderFornecedoresGrid(); // carregar fornecedores no início

    // Verifica o nível do usuário para definir a aba inicial e visibilidade das outras
    const usuarioLogado = JSON.parse(localStorage.getItem('usuarioLogado'));
    const nivelUsuario = usuarioLogado ? usuarioLogado.nivel.toLowerCase() : '';

    if (nivelUsuario === 'estoque') {
      this.showSection('sectionCotacoesSalvas'); // Inicia na aba de cotações salvas
      // Oculta as outras abas do menu de compras
      document.querySelector('.painel-btn[data-secao="sectionRealizarCotacoes"]')?.classList.add('hidden');
      document.querySelector('.painel-btn[data-secao="sectionCadastrarProdutos"]')?.classList.add('hidden');
      document.querySelector('.painel-btn[data-secao="sectionCadastrarFornecedor"]')?.classList.add('hidden');
    } else {
      this.showSection('sectionRealizarCotacoes'); // Comportamento padrão para outros usuários
    }
    // Close panels/modals on Escape
    document.addEventListener('keydown', (e)=>{ if(e.key === 'Escape'){ this.closeModal?.(); this.closeImportPanel?.(); this.closeDetailPanel?.(); } });
  },

  cache(){
    this.navLinks = document.querySelectorAll('#menu-compras button.painel-btn');
    this.sections = document.querySelectorAll('section.section');
    this.cartBody = document.getElementById('cartBody'); // Cache do corpo do carrinho
    this.cartProductInput = document.getElementById('cartProductInput'); // Novo input de produto
    this.cartQtd = document.getElementById('cartQtd');
    this.btnAddToCart = document.getElementById('btnAddToCart');
    this.btnClearCart = document.getElementById('btnClearCart');
    this.btnExportPdf = document.getElementById('btnExportPdf');
    this.btnRegistrarCotacoes = document.getElementById('btnRegistrarCotacoes');
    this.quotationCode = document.getElementById('quotationCode');
    this.orccardrow = document.getElementById('orccardrow');
    this.savedQuotationsTableBody = document.getElementById('savedQuotationsTableBody');
    this.searchQuotationInput = document.getElementById('searchQuotation');
    this.filterStatusSelect = document.getElementById('filterStatus');
    this.btnSearchQuotation = document.getElementById('btnSearchQuotation');
    this.formCadastrarProduto = document.getElementById('formCadastrarProduto');
    this.produtosTableBody = document.getElementById('produtosTableBody');
    this.formCadastrarFornecedor = document.getElementById('formCadastrarFornecedor');
    this.fornecedoresTableBody = document.getElementById('fornecedoresTableBody');
    this.importPanel = document.getElementById('importPanel');
    this.btnOpenImportExportModal = document.getElementById('btnOpenImportExportModal');
    this.closeModalButtons = document.querySelectorAll('.modal .close-button');
    this.btnImportProducts = document.getElementById('btnImportProducts');
    this.btnExportProducts = document.getElementById('btnExportProducts');
    this.importExcelFile = document.getElementById('importExcelFile');
    this.importPreview = document.getElementById('importPreview');
    this.importStatus = document.getElementById('importStatus');
    this.btnConfirmImport = document.getElementById('btnConfirmImport');
    this.quotationDetailModal = document.getElementById('quotationDetailModal');
    this.quotationDetailTitle = document.getElementById('quotationDetailTitle');
    this.quotationDetailBody = document.getElementById('quotationDetailBody');
    this.btnPrintQuotation = document.getElementById('btnPrintQuotation');
    this.btnCloseQuotation = document.getElementById('btnCloseQuotation');
  },

  bind(){
    // Navigation
    this.navLinks.forEach(btn=>btn.addEventListener('click', e=>{
      e.preventDefault();
      this.navLinks.forEach(b => { b.classList.remove('active'); b.setAttribute('aria-selected', 'false'); });
      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');
      this.showSection(btn.dataset.secao);
    }));

    this.btnAddToCart.addEventListener('click', ()=>this.handleAddToCart());
    this.btnClearCart.addEventListener('click', ()=>{ if(confirm('Limpar carrinho?')){this.cart.clear();this.renderCart()} });
    this.btnExportPdf.addEventListener('click', ()=>this.handleExportPdf());
    this.btnRegistrarCotacoes.addEventListener('click', ()=>this.handleRegisterQuotation());

    this.btnSearchQuotation?.addEventListener('click', ()=>this.renderSavedQuotations());
    this.filterStatusSelect?.addEventListener('change', ()=>this.renderSavedQuotations());

    this.produtosTableBody?.addEventListener('click', (e)=>this.handleProdutoTableClick(e));
    this.fornecedoresTableBody?.addEventListener('click', (e)=>this.handleFornecedorTableClick(e));

    this.btnOpenImportExportModal?.addEventListener('click', ()=>this.openImportPanel('produtos'));
    // Import/Export for fornecedores
    const btnForImport = document.getElementById('btnOpenImportExportFornecedor');
    if(btnForImport) btnForImport.addEventListener('click', ()=>this.openImportPanel('fornecedores'));
    this.closeModalButtons?.forEach(btn=>btn.addEventListener('click', ()=>this.closeModal()));
    const panelCloseBtn = this.importPanel?.querySelector('.close-button');
    if(panelCloseBtn) panelCloseBtn.addEventListener('click', ()=>this.closeImportPanel());

    this.btnImportProducts?.addEventListener('click', ()=>this.handleImport());
    this.btnConfirmImport?.addEventListener('click', ()=>this.confirmImport());
    this.btnExportProducts?.addEventListener('click', ()=>this.handleExport());

    // detail modal
    if(this.quotationDetailModal){
      this.quotationDetailModal.querySelector('.close-button').addEventListener('click', ()=>this.quotationDetailModal.classList.add('hidden'));
      this.quotationDetailModal.addEventListener('click', e=>{ if(e.target===this.quotationDetailModal) this.quotationDetailModal.classList.add('hidden') });
    }

    // print and close buttons for quotation details
    this.btnPrintQuotation?.addEventListener('click', ()=>this.printQuotation());
    this.btnCloseQuotation?.addEventListener('click', ()=>this.closeDetailPanel());

    // product form
    this.formCadastrarProduto?.addEventListener('submit', e=>this.handleProductForm(e));
    this.formCadastrarFornecedor?.addEventListener('submit', e=>this.handleFornecedorForm(e));

    // Attach sortable header handlers for produtos and fornecedores
    try{
      const prodThs = document.querySelectorAll('#sectionCadastrarProdutos .data-grid thead th[data-field]');
      prodThs.forEach(th=>{
        const field = th.getAttribute('data-field');
        th.addEventListener('click', ()=>{ this.toggleProdutosSort(field) });
      });
      const fornThs = document.querySelectorAll('#sectionCadastrarFornecedor .data-grid thead th[data-field]');
      fornThs.forEach(th=>{
        const field = th.getAttribute('data-field');
        th.addEventListener('click', ()=>{ this.toggleFornecedoresSort(field) });
      });
    }catch(e){ /* ignore if not present yet */ }
  },

  showSection(id){
    document.querySelectorAll('section.section').forEach(s=>s.classList.add('hidden'));
    const el = document.getElementById(id);
    if(el) el.classList.remove('hidden');
    
    // Inicializa os dados da aba quando ela é aberta
    if(id==='sectionRealizarCotacoes'){ this.generateNextQuotationCode(); this.populateProductDropdown(); this.populateSupplierDropdowns(); }
    if(id==='sectionCotacoesSalvas'){ this.renderSavedQuotations(); }
    if(id==='sectionCadastrarProdutos'){ this.renderProdutosGrid(); }
    if(id==='sectionCadastrarFornecedor'){ this.renderFornecedoresGrid(); }


  },

  async populateProductDropdown(){
    try{
      const productList = document.getElementById('productList');
      if (!productList) return;
      const produtos = await SupabaseService.list('produtos', 'id, codigo_principal, nome, unidade_medida', {orderBy:'nome'});
      productList.innerHTML = ''; // Limpa a lista de sugestões
      produtos.forEach(p=>{
        const opt = document.createElement('option');
        opt.value = `${p.codigo_principal} - ${p.nome} ${p.unidade_medida?`(${p.unidade_medida})`:''}`;
        opt.dataset.id = p.id; // Armazena o ID do produto no dataset da opção
        productList.appendChild(opt);
      });
    }catch(e){console.error('Erro carregar produtos',e);}
  },

  async populateSupplierDropdowns(){
    try{
      const fornecedores = await SupabaseService.list('fornecedores', 'id, nome', {orderBy:'nome'});
      // populate company selects if exist
      for(let i=1;i<=3;i++){
        let sel = document.getElementById(`empresa${i}Cot`);
        if(!sel) continue;
        const cur = sel.value;
        sel.innerHTML = '<option value="">-- Selecione um fornecedor --</option>';
        fornecedores.forEach(f=> sel.add(new Option(f.nome,f.id)));
        sel.value = cur;
      }
    }catch(e){console.error('Erro carregar fornecedores',e)}
  },

  renderCompanies(count){
    this.orccardrow.innerHTML = '';
    for(let i=1;i<=count;i++){
      const card = document.createElement('div');
      card.className='company-card';
      card.innerHTML = `
        <h4>Empresa ${i}</h4>
        <select id="empresa${i}Cot"><option value="">-- Carregando --</option></select>
        <textarea id="obsEmpresa${i}" placeholder="Observações" rows="2"></textarea>
        <div id="precosEmpresa${i}"></div>
        <input type="text" id="totalEmpresa${i}" placeholder="Total" readonly />
        <div class="winner-selector"><input type="radio" name="empresaVencedora" value="${i}" id="vencedor${i}" /><label for="vencedor${i}">Vencedor</label></div>
      `;
      this.orccardrow.appendChild(card);
    }
  },

  renderCart(){
    this.cartBody.innerHTML = '';
    // limpar preços
    for(let i=1;i<=3;i++) document.getElementById(`precosEmpresa${i}`).innerHTML='';

    this.cart.items.forEach(item=>{
      const tr = document.createElement('tr');
      tr.dataset.cod = item.cod;
      tr.innerHTML = `<td>${item.cod}</td><td>${item.produto}</td><td>${item.qtd}</td><td>${item.uni||'UN'}</td><td><button class="btn-remove">Remover</button></td>`;
      this.cartBody.appendChild(tr);

      for(let i=1;i<=3;i++){
        const priceContainer = document.getElementById(`precosEmpresa${i}`);
        const div = document.createElement('div'); div.className='price-entry';
        div.innerHTML = `<label>${item.produto} (Qtd: ${item.qtd})</label><input type="number" step="0.01" id="price-${i}-${item.cod}" data-empresa="${i}" data-cod="${item.cod}" placeholder="Preço Unit." />`;
        priceContainer.appendChild(div);
      }
    });

    // attach listeners
    this.cartBody.querySelectorAll('.btn-remove').forEach(btn=>btn.addEventListener('click', e=>{
      const cod = e.target.closest('tr').dataset.cod; this.cart.remove(cod); this.renderCart(); this.updateAllTotals();
    }));

    document.querySelectorAll('.price-entry input').forEach(inp=>inp.addEventListener('input', e=>this.updateCompanyTotal(e.target.dataset.empresa)));

    this.updateAllTotals();
  },

  updateCompanyTotal(index){
    let total = 0;
    this.cart.items.forEach(item=>{
      const inp = document.getElementById(`price-${index}-${item.cod}`);
      const price = inp ? parseFloat(inp.value)||0 : 0;
      total += price * item.qtd;
    });
    const totalInput = document.getElementById(`totalEmpresa${index}`);
    if(totalInput) totalInput.value = total.toFixed(2);
  },

  updateAllTotals(){ this.updateCompanyTotal(1); this.updateCompanyTotal(2); this.updateCompanyTotal(3); },

  async handleAddToCart(){
    const productText = this.cartProductInput.value;
    const qtd = parseInt(this.cartQtd.value);

    if(!productText || isNaN(qtd) || qtd<=0) return alert('Selecione um produto e informe uma quantidade válida.');

    // Encontra o ID do produto a partir do texto selecionado na datalist
    const productList = document.getElementById('productList');
    const selectedOption = Array.from(productList.options).find(opt => opt.value === productText);

    if (!selectedOption) {
      return alert('Produto inválido. Por favor, selecione um item da lista.');
    }
    const pid = selectedOption.dataset.id;

    try {
      const prod = await SupabaseService.list('produtos','id,codigo_principal,nome,unidade_medida',{eq:{field:'id',value:pid}});
      const p = Array.isArray(prod)?prod[0]:prod;
      const item = { id:p.id, cod:p.codigo_principal, produto:p.nome, qtd, uni: (p.unidade_medida || 'UN') };
      if(!this.cart.add(item)) return alert('Produto já adicionado');
      this.renderCart(); this.cartProductInput.value=''; this.cartQtd.value='';
    }catch(e){console.error(e);alert('Erro ao adicionar produto')}
  },

  handleExportPdf(){
    if(this.cart.items.length===0) return alert('Adicione produtos antes de exportar');
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    doc.setFontSize(14); doc.text('Pedido de Cotação - Marquespan',14,18);
    const columns = ['Código','Produto','Quantidade'];
    const rows = this.cart.items.map(i=>[i.cod,i.produto,i.qtd]);
    doc.autoTable({ head:[columns], body:rows, startY:28 });
    doc.save(`cotacao_${this.quotationCode.value||'novo'}.pdf`);
  },

  async handleRegisterQuotation(){
    if(this.cart.items.length===0) return alert('Adicione produtos para registrar a cotação');
    const code = this.quotationCode.value.trim(); if(!code) return alert('Código não gerado');
    const winner = document.querySelector('input[name="empresaVencedora"]:checked');
    let idFornecedorVencedor=null, valorTotalVencedor=null;
    if(winner){idFornecedorVencedor = document.getElementById(`empresa${winner.value}Cot`).value; valorTotalVencedor = parseFloat(document.getElementById(`totalEmpresa${winner.value}`).value)||null}

    try{
      // obter usuário atual do localStorage (fluxo de login custom do projeto) ou do supabase.auth
      let userIdent = null;
      try{
        const local = localStorage.getItem('usuarioLogado');
        if(local){ const u = JSON.parse(local); if(u && (u.nome || u.email || u.id)) userIdent = u.nome || u.email || u.id; }
      }catch(_){ /* ignore */ }
      if(!userIdent){
        try{ const userRes = await supabase.auth.getUser?.(); if(userRes && userRes.data && userRes.data.user) userIdent = userRes.data.user.email || userRes.data.user.id; else if(userRes && userRes.user) userIdent = userRes.user.email || userRes.user.id }catch(_){ userIdent = null }
      }

      // inserir cotacao: não definimos data_cotacao aqui para garantir que o servidor (DB) use now() configurado no schema.
      const cotacaoPayload = { codigo_cotacao: code, status:'Pendente', id_fornecedor_vencedor:idFornecedorVencedor, valor_total_vencedor:valorTotalVencedor };
      if(userIdent) cotacaoPayload.usuario = userIdent;

      let cot;
      try{
        cot = await SupabaseService.insert('cotacoes', cotacaoPayload);
      }catch(err){
        // se falhar por causa de coluna inexistente para 'usuario', remover e tentar novamente
        const emsg = String(err?.message || err?.error || JSON.stringify(err)).toLowerCase();
        if(emsg.includes('column') && emsg.includes('usuario') && emsg.includes('does not exist')){
          delete cotacaoPayload.usuario;
          cot = await SupabaseService.insert('cotacoes', cotacaoPayload);
        } else throw err;
      }
      const cotacaoId = cot[0].id;

      // itens
      const itens = this.cart.items.map(i=>({ id_cotacao:cotacaoId, id_produto:i.id, quantidade:i.qtd }));
      await SupabaseService.insert('cotacao_itens', itens);

      // orçamentos e preços
      for(let idx=1;idx<=3;idx++){
        const fornecedorId = document.getElementById(`empresa${idx}Cot`).value;
        const valorTotal = parseFloat(document.getElementById(`totalEmpresa${idx}`).value)||null;
        if(fornecedorId && valorTotal){
          const orc = await SupabaseService.insert('cotacao_orcamentos',{ id_cotacao:cotacaoId, id_fornecedor:fornecedorId, valor_total:valorTotal, observacao:document.getElementById(`obsEmpresa${idx}`).value||'' });
          const orcamentoId = orc[0].id;
          const precos = [];
          this.cart.items.forEach(it=>{
            const input = document.getElementById(`price-${idx}-${it.cod}`);
            const preco = input ? parseFloat(input.value) : null; if(!isNaN(preco) && preco!==null) precos.push({ id_orcamento:orcamentoId, id_produto:it.id, preco_unitario:preco });
          });
          if(precos.length) await SupabaseService.insert('orcamento_item_precos', precos);
        }
      }

      alert('Cotação registrada com sucesso!');
      this.clearQuotationForm(); this.renderSavedQuotations();
    }catch(e){console.error('Erro registrar cotação',e); alert('Erro ao registrar. Verifique console.')}
  },

  clearQuotationForm(){ this.cart.clear(); this.renderCart(); for(let i=1;i<=3;i++){ document.getElementById(`empresa${i}Cot`).value=''; document.getElementById(`obsEmpresa${i}`).value=''; } document.querySelectorAll('input[name="empresaVencedora"]').forEach(r=>r.checked=false); this.generateNextQuotationCode(); },

  async generateNextQuotationCode(){
    try{
      const data = await SupabaseService.list('cotacoes','codigo_cotacao,created_at',{orderBy:'created_at',ascending:false});
      let nextId = 1; if(data && data[0] && data[0].codigo_cotacao && data[0].codigo_cotacao.startsWith('PED-')) nextId = parseInt(data[0].codigo_cotacao.split('-')[1]) + 1;
      this.quotationCode.value = `PED-${String(nextId).padStart(4,'0')}`;
    }catch(e){console.warn('Não foi possível gerar código automaticamente',e); this.quotationCode.value = `PED-0000`}
  },

  async renderSavedQuotations(){
    try{
      const search = this.searchQuotationInput?.value?.trim();
      const status = this.filterStatusSelect?.value;
      // Query base
      let q = supabase.from('cotacoes').select('id,codigo_cotacao,data_cotacao,updated_at,status,valor_total_vencedor,nota_fiscal,usuario,fornecedores(nome)').order('updated_at',{ascending:false});
      if(search) q = q.ilike('codigo_cotacao',`%${search}%`);
      if(status && status!=='Todas') q = q.eq('status',status);
      const { data, error } = await q;
      if(error) throw error;
      this.savedQuotationsTableBody.innerHTML = '';
      if(!data || data.length===0) return this.savedQuotationsTableBody.innerHTML = `<tr><td colspan="7">Nenhuma cotação encontrada.</td></tr>`;

      // Obter o nível do usuário logado para controlar a visibilidade dos botões
      const usuarioLogado = JSON.parse(localStorage.getItem('usuarioLogado'));
      const nivelUsuario = usuarioLogado ? usuarioLogado.nivel.toLowerCase() : '';
      const podeExcluir = !['compras', 'estoque'].includes(nivelUsuario);

      data.forEach(c=>{
        const tr = document.createElement('tr');
        const winnerName = c.fornecedores ? c.fornecedores.nome : 'N/A';
        const totalValue = c.valor_total_vencedor ? `R$ ${parseFloat(c.valor_total_vencedor).toFixed(2)}` : 'N/A';
        const notaFiscal = c.nota_fiscal || 'N/A';
        // status select para permitir alteração e registro de data/usuário
        const statusSelectId = `status-select-${c.id}`;
        const initialStatus = c.status || 'Pendente';
        const statusClass = `quotation-status-select status-${initialStatus}`;
        const statusSelect = `<select class="${statusClass}" id="${statusSelectId}" data-id="${c.id}"><option value="Pendente">Pendente</option><option value="Aprovada">Aprovada</option><option value="Rejeitada">Rejeitada</option><option value="Recebido">Recebido</option></select>`;
        const dateToShow = c.updated_at || c.data_cotacao;
        const formattedDate = dateToShow ? new Date(dateToShow).toLocaleString('pt-BR') : 'N/D';
        const usuarioCell = c.usuario || 'N/D';

        const btnExcluirHtml = podeExcluir ? ` <button class="btn-action btn-delete" data-id="${c.id}">Excluir</button>` : '';
        tr.innerHTML = `<td>${c.codigo_cotacao}</td><td>${formattedDate}</td><td>${usuarioCell}</td><td>${winnerName}</td><td>${totalValue}</td><td>${notaFiscal}</td><td>${statusSelect}</td><td><button class="btn-action btn-view" data-id="${c.id}">Ver</button>${btnExcluirHtml}</td>`;

        this.savedQuotationsTableBody.appendChild(tr);
        // set selected value and ensure class matches status
        const selEl = document.getElementById(statusSelectId);
        if(selEl){ selEl.value = initialStatus; selEl.className = `quotation-status-select status-${initialStatus}` }
      });
      // attach listeners
      this.savedQuotationsTableBody.querySelectorAll('.btn-view').forEach(b=>b.addEventListener('click', e=>this.openQuotationDetailModal(e.target.dataset.id)));
      this.savedQuotationsTableBody.querySelectorAll('.btn-delete').forEach(b=>b.addEventListener('click', e=>this.deleteQuotation(e.target.dataset.id)));
      // status change listeners
      this.savedQuotationsTableBody.querySelectorAll('.quotation-status-select').forEach(sel=>sel.addEventListener('change', (e)=>{ const id = e.target.dataset.id; const newStatus = e.target.value; this.handleChangeQuotationStatus(id, newStatus); }));
    }catch(e){console.error('Erro renderSavedQuotations',e); this.savedQuotationsTableBody.innerHTML = `<tr><td colspan="8">Erro ao carregar cotações.</td></tr>`}
  },

  async openQuotationDetailModal(id){
    try{
      const { data:cotacao, error:cotErr } = await supabase.from('cotacoes').select('*,fornecedores(nome)').eq('id',id).single(); if(cotErr) throw cotErr;
      const { data:itens } = await supabase.from('cotacao_itens').select('quantidade, produtos(codigo_principal,nome,id)').eq('id_cotacao',id);
      const { data:orcamentos } = await supabase.from('cotacao_orcamentos').select('*,fornecedores(nome)').eq('id_cotacao',id);
      for(const o of orcamentos){ const { data:precos } = await supabase.from('orcamento_item_precos').select('preco_unitario,id_produto').eq('id_orcamento',o.id); o.precos=precos }
      const dataDisplay = cotacao.updated_at ? new Date(cotacao.updated_at).toLocaleString('pt-BR') : (cotacao.data_cotacao ? new Date(cotacao.data_cotacao).toLocaleString('pt-BR') : 'N/A');
      const usuarioDisplay = cotacao.usuario || cotacao.usuario_lancamento || cotacao.usuario_id || (cotacao.created_by ? String(cotacao.created_by) : null) || 'N/D';
      const statusBadge = `<span class="status status-${cotacao.status}">${cotacao.status}</span>`;
      const notaFiscalDisplay = cotacao.nota_fiscal ? `<p><strong>Nota Fiscal:</strong> ${cotacao.nota_fiscal}</p>` : '';

      let html = `<p><strong>Data/Hora:</strong> ${dataDisplay}</p><p><strong>Status:</strong> ${statusBadge}</p><p><strong>Usuário:</strong> ${usuarioDisplay}</p>${notaFiscalDisplay}<hr><h3>Orçamentos</h3>`;
      orcamentos.forEach(o=>{ 
        const isWinner = o.id_fornecedor===cotacao.id_fornecedor_vencedor; 
        html+=`<div class="card ${isWinner?'winner':''}"><h4>${o.fornecedores.nome} ${isWinner? '(Vencedor)':''}</h4><p><strong>Total:</strong> R$ ${parseFloat(o.valor_total).toFixed(2)}</p><p><strong>Obs:</strong> ${o.observacao||'Nenhuma'}</p><table class="data-grid"><thead><tr><th>Produto</th><th>QTD</th><th>Preço Unitário</th><th>Preço Total</th></tr></thead><tbody>${o.precos.map(p=>{ 
          const itemDaCotacao = itens.find(it=>it.produtos.id===p.id_produto); 
          const nomeProduto = itemDaCotacao ? itemDaCotacao.produtos.nome : 'Produto não encontrado';
          const quantidade = itemDaCotacao ? itemDaCotacao.quantidade : 0;
          const precoUnitario = parseFloat(p.preco_unitario);
          const precoTotal = quantidade * precoUnitario;
          return `<tr><td>${nomeProduto}</td><td>${quantidade}</td><td>R$ ${precoUnitario.toFixed(2)}</td><td>R$ ${precoTotal.toFixed(2)}</td></tr>` 
        }).join('')}</tbody></table></div>` 
      });
      this.quotationDetailTitle.innerHTML = `Detalhes: <span style="color: red; font-weight: bold;">${cotacao.codigo_cotacao}</span>`;
      this.quotationDetailBody.innerHTML = html;
      // open as compact detail panel (avoid overlay conflicts)
      this.openDetailPanel();
    }catch(e){console.error(e);alert('Erro ao abrir detalhes')}
  },

  printQuotation(){
    const content = this.quotationDetailBody ? this.quotationDetailBody.innerHTML : '';
    const title = this.quotationDetailTitle ? this.quotationDetailTitle.innerHTML : 'Detalhes';
    
    // Obtém a URL base da página atual para construir caminhos absolutos
    const baseUrl = window.location.origin + window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/'));
    const cssHref = `${baseUrl}/css/stylecompras.css`;
    const logoSrc = `${baseUrl}/logo.png`;

    // Try opening a new window first. Build a richer print HTML including logo in top-right.
    const printHtml = `<!doctype html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>${title}</title>
        <link rel="stylesheet" href="${cssHref}">
        <style>
          body{font-family:Inter, Arial, Helvetica, sans-serif;margin:18px;color:#222}
          .print-header{display:flex;justify-content:space-between;align-items:center}
          .print-header h2{margin:0;font-size:18px}
          .print-header img{height:48px}
          .print-body{margin-top:12px}
        </style>
      </head>
      <body>
        <div class="print-header">
          <h2>${title}</h2>
          <img src="${logoSrc}" alt="Logo" />
        </div>
        <div class="print-body">${content}</div>
      </body>
      </html>`;

    try{
      // Cria um Blob com o HTML, que é uma abordagem mais segura e contorna erros de 'TrustedScript'.
      const blob = new Blob([printHtml], { type: 'text/html' });
      const url = URL.createObjectURL(blob);

      const win = window.open(url, '_blank');
      const win = window.open('', '_blank', 'width=800,height=600');
      if (win) {
        win.document.open();
        win.document.write(printHtml);
        win.document.close();
        win.onload = () => {
          win.focus();
          win.print();
          // A URL do Blob não precisa ser revogada imediatamente, o navegador cuida disso.
          // Fechar a janela após a impressão ajuda a evitar a página em branco.
          setTimeout(() => win.close(), 500);
          setTimeout(() => {
            win.close();
            this.closeDetailPanel(); // Fecha o painel de detalhes após a impressão
          }, 500);
          }, 100); // Reduzido o tempo para fechar mais rápido
        };
      } else {
        alert('O bloqueador de pop-ups pode estar impedindo a impressão.');
        this.closeDetailPanel();
      }
      return;
    }catch(e){ console.warn('Abertura de janela bloqueada, tentando fallback por iframe', e); }

    // Fallback: print via hidden iframe (não depende de popups)
    try{
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed'; iframe.style.right = '0'; iframe.style.bottom = '0'; iframe.style.width = '0'; iframe.style.height = '0'; iframe.style.border = '0'; iframe.style.visibility = 'hidden';
      document.body.appendChild(iframe);
      const idoc = iframe.contentWindow.document;
      idoc.open(); idoc.write(printHtml); idoc.close();
      setTimeout(()=>{
        try{ iframe.contentWindow.focus(); iframe.contentWindow.print(); }catch(err){ console.error('Erro ao imprimir via iframe', err); alert('Não foi possível iniciar a impressão. Verifique permissões do navegador.'); }
        finally{ setTimeout(()=>{ try{ document.body.removeChild(iframe); }catch(_){ } }, 900); }
      }, 400);
    }catch(err){ console.error('Fallback de impressão falhou', err); alert('Erro ao preparar impressão. Veja o console para detalhes.'); }
  },

  async deleteQuotation(id){ if(confirm('Excluir cotação?')){ try{ await SupabaseService.remove('cotacoes',{field:'id',value:id}); alert('Excluído'); this.renderSavedQuotations(); }catch(e){console.error(e);alert('Erro excluir')}} },

  async handleChangeQuotationStatus(id, newStatus) {
    if(!id) return;

    let notaFiscal = null;
    if (newStatus === 'Recebido') {
      notaFiscal = prompt('Por favor, informe o número da Nota Fiscal:');
      if (notaFiscal === null) { // Usuário cancelou o prompt
        this.renderSavedQuotations(); // Restaura o select para o valor anterior
        return;
      }
    }

    if (!confirm(`Alterar status da cotação para '${newStatus}'?`)) {
      this.renderSavedQuotations();
      return;
    }

    try{
      // obter usuário atual do localStorage (fluxo custom) ou do supabase.auth
      let userEmail = null;
      try{
        const local = localStorage.getItem('usuarioLogado');
        if(local){ const u = JSON.parse(local); if(u && (u.nome || u.email || u.id)) userEmail = u.nome || u.email || u.id; }
      }catch(_){ }
      if(!userEmail){ try{ const userRes = await supabase.auth.getUser?.(); if(userRes && userRes.data && userRes.data.user) userEmail = userRes.data.user.email || userRes.data.user.id; else if(userRes && userRes.user) userEmail = userRes.user.email || userRes.user.id }catch(_){ userEmail = null } }

      // Atualizamos apenas o status e, se disponível, o usuário. O `updated_at` será mantido pelo trigger do banco.
      const payload = { status: newStatus };
      if (notaFiscal !== null) {
        payload.nota_fiscal = notaFiscal.trim();
      }
      if(userEmail) payload.usuario = userEmail;

      try{
        await SupabaseService.update('cotacoes', payload, { field: 'id', value: id });
      }catch(err){
        const emsg = String(err?.message || err?.error || JSON.stringify(err)).toLowerCase();
        if(emsg.includes('column') && emsg.includes('usuario') && emsg.includes('does not exist')){
          delete payload.usuario;
          await SupabaseService.update('cotacoes', payload, { field: 'id', value: id });
        } else throw err;
      }

      alert('Status atualizado');
      this.renderSavedQuotations();
    }catch(e){ console.error('Erro atualizar status', e); alert('Erro ao atualizar status. Veja console.'); this.renderSavedQuotations(); }
  },

  async renderProdutosGrid(){
    try{
      const orderField = this._produtosSort?.field || 'nome';
      const asc = !!this._produtosSort?.ascending;
      const produtos = await SupabaseService.list('produtos','id,codigo_principal,codigo_secundario,nome,unidade_medida',{orderBy:orderField, ascending:asc});
      this.produtosTableBody.innerHTML='';
      produtos.forEach(p=>{
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${p.codigo_principal}</td><td>${p.codigo_secundario||''}</td><td>${p.nome}</td><td>${p.unidade_medida||'UN'}</td><td><button class="btn-action btn-edit" data-id="${p.id}">Editar</button> <button class="btn-action btn-delete" data-id="${p.id}">Excluir</button></td>`;
        this.produtosTableBody.appendChild(tr);
      });
      this.updateProdutosSortIndicators();
    }catch(e){console.error('Erro produtos',e)}
  },

  async handleProductForm(e){
    e.preventDefault();
    const codigo1 = document.getElementById('produtoCodigo1').value.trim();
    const codigo2 = document.getElementById('produtoCodigo2').value.trim();
    const nome = document.getElementById('produtoNome').value.trim();
    const unidade = (document.getElementById('produtoUnidade') && document.getElementById('produtoUnidade').value) ? document.getElementById('produtoUnidade').value.trim() : '';
    if(!codigo1||!nome) return alert('Preencha Código 1 e Nome');
    // Verificar se o código principal já existe (usar SupabaseService)
    try{
      const existente = await SupabaseService.list('produtos','id',{eq:{field:'codigo_principal',value:codigo1}});
      if (existente && existente.length > 0) {
        // if we're editing, allow the same record
        if (!this._editingProductId || (existente[0] && existente[0].id !== this._editingProductId)) {
          console.warn('Código já existente:', codigo1);
          return alert('Já existe um produto com esse código principal.');
        }
      }
    }catch(err){
      console.error('Erro ao verificar código (detalhado):', err);
      return alert('Erro ao verificar código. Tente novamente.\n' + (err.message||JSON.stringify(err)));
    }
    // If editing, update; otherwise insert
    try{
      if(this._editingProductId){
        const payload = { codigo_principal: codigo1, codigo_secundario: codigo2, nome, unidade_medida: unidade || 'UN' };
        const updated = await SupabaseService.update('produtos', payload, { field: 'id', value: this._editingProductId });
        if(!updated){ console.error('Resposta vazia ao atualizar produto:', updated); return alert('Erro ao atualizar o produto. Tente novamente.'); }
        alert('Produto atualizado com sucesso!');
        this.clearProductForm();
        this.renderProdutosGrid();
        this.populateProductDropdown();
        this._editingProductId = null;
      } else {
        const data = await SupabaseService.insert('produtos', { codigo_principal: codigo1, codigo_secundario: codigo2, nome, unidade_medida: unidade || 'UN' });
        if(!data){ console.error('Resposta vazia ao inserir produto:', data); return alert('Erro ao salvar o produto. Tente novamente.'); }
        alert('Produto cadastrado com sucesso!');
        this.formCadastrarProduto.reset();
        this.renderProdutosGrid();
        this.populateProductDropdown();
      }
    }catch(err){
      console.error('Erro ao salvar/atualizar produto detalhado:', err);
      const userMsg = err?.message || err?.error || JSON.stringify(err);
      alert('Erro ao salvar/atualizar o produto. Tente novamente.\nDetalhes: ' + userMsg);
    }
  },

  async handleProdutoTableClick(e){
    const btn = e.target.closest('.btn-action');
    if (!btn) return;

    const id = btn.dataset.id;

    if (btn.classList.contains('btn-delete')) {
      if (confirm('Tem certeza que deseja excluir este produto?')) {
        await SupabaseService.remove('produtos', { field: 'id', value: id });
        await this.renderProdutosGrid();
        this.populateProductDropdown();
      }
    } else if (btn.classList.contains('btn-edit')) {
      const { data } = await supabase.from('produtos').select('codigo_principal,codigo_secundario,nome,unidade_medida').eq('id', id).single();
      if (data) { // Popula o formulário para edição
        document.getElementById('produtoCodigo1').value = data.codigo_principal;
        document.getElementById('produtoCodigo2').value = data.codigo_secundario || '';
        document.getElementById('produtoNome').value = data.nome;
        const unidadeEl = document.getElementById('produtoUnidade'); if(unidadeEl) unidadeEl.value = data.unidade_medida || '';
        // set editing mode
        this._editingProductId = id;
        const submitBtn = document.getElementById('btnSubmitProduto');
        if(submitBtn) submitBtn.textContent = 'Salvar Alteração';
        window.scrollTo(0, 0); // Rola para o topo para editar
      }
    }
  },
  // Adicionado para limpar o formulário após adicionar ou editar (se a edição for implementada)
  clearProductForm() {
    // Reset form fields if available
    if (this.formCadastrarProduto) this.formCadastrarProduto.reset();
    const el1 = document.getElementById('produtoCodigo1'); if(el1) el1.value = '';
    const el2 = document.getElementById('produtoCodigo2'); if(el2) el2.value = '';
    const elNome = document.getElementById('produtoNome'); if(elNome) elNome.value = '';

    // Clear editing state and restore submit button label
    this._editingProductId = null;
    const submitBtn = document.getElementById('btnSubmitProduto');
    if(submitBtn) submitBtn.textContent = 'Cadastrar';
  },

  async renderFornecedoresGrid(){
    try{
      const orderField = this._fornecedoresSort?.field || 'nome';
      const asc = !!this._fornecedoresSort?.ascending;
      const f = await SupabaseService.list('fornecedores','id,nome,telefone',{orderBy:orderField, ascending:asc});
      this.fornecedoresTableBody.innerHTML='';
      f.forEach(item=>{
        const tr=document.createElement('tr');
        tr.innerHTML=`<td>${item.nome}</td><td>${item.telefone||''}</td><td><button class="btn-action btn-edit" data-id="${item.id}">Editar</button> <button class="btn-action btn-delete" data-id="${item.id}">Excluir</button></td>`;
        this.fornecedoresTableBody.appendChild(tr)
      });
      this.updateFornecedoresSortIndicators();
    }catch(e){console.error('Erro ao renderizar fornecedores:', e)}
  },

  async handleFornecedorForm(e){ // Este formulário atualmente suporta apenas a adição, não a edição.
    e.preventDefault();
    const nome=document.getElementById('fornecedorNome').value.trim();
    const tel=document.getElementById('fornecedorTelefone').value.trim();
    if(!nome) return alert('Preencha o nome');
    try{
      if(this._editingFornecedorId){
        // Atualizar fornecedor existente
        const payload = { nome, telefone: tel };
        const updated = await SupabaseService.update('fornecedores', payload, { field: 'id', value: this._editingFornecedorId });
        if(!updated){ console.error('Resposta vazia ao atualizar fornecedor:', updated); return alert('Erro ao atualizar o fornecedor. Tente novamente.'); }
        alert('Fornecedor atualizado com sucesso!');
        this.clearFornecedorForm();
        this.renderFornecedoresGrid();
        this.populateSupplierDropdowns();
        this._editingFornecedorId = null;
      } else {
        await SupabaseService.insert('fornecedores',{nome,telefone:tel});
        alert('Fornecedor salvo');
        this.formCadastrarFornecedor.reset();
        this.renderFornecedoresGrid();
        this.populateSupplierDropdowns();
      }
    }catch(err){console.error('Erro ao salvar fornecedor:', err);alert('Erro salvar fornecedor')}
  },

  async handleFornecedorTableClick(e) {
    const btn = e.target.closest('.btn-action');
    if (!btn) return;

    const id = btn.dataset.id;

    if (btn.classList.contains('btn-delete')) {
      if (confirm('Tem certeza que deseja excluir este fornecedor?')) {
        await SupabaseService.remove('fornecedores', { field: 'id', value: id });
        this.renderFornecedoresGrid();
        this.populateSupplierDropdowns();
      }
    } else if (btn.classList.contains('btn-edit')) {
      const { data } = await supabase.from('fornecedores').select('nome,telefone').eq('id', id).single();
      if (data) {
        document.getElementById('fornecedorNome').value = data.nome;
        document.getElementById('fornecedorTelefone').value = data.telefone || '';
        // set editing mode (mesma UX dos produtos)
        this._editingFornecedorId = id;
        const submitBtn = document.getElementById('btnSubmitFornecedor');
        if(submitBtn) submitBtn.textContent = 'Salvar Alteração';
        window.scrollTo(0, 0); // Rola para o topo para editar
        const first = document.getElementById('fornecedorNome'); if(first) first.focus();
      }
    }
  },

  // Limpa formulário de fornecedor e restaura estado de edição
  clearFornecedorForm(){
    if(this.formCadastrarFornecedor) this.formCadastrarFornecedor.reset();
    this._editingFornecedorId = null;
    const submitBtn = document.getElementById('btnSubmitFornecedor');
    if(submitBtn) submitBtn.textContent = 'Cadastrar';
  },

  // Sorting helpers for produtos
  toggleProdutosSort(field){
    if(!field) return;
    if(this._produtosSort && this._produtosSort.field === field){
      this._produtosSort.ascending = !this._produtosSort.ascending;
    } else {
      this._produtosSort = { field, ascending: true };
    }
    this.renderProdutosGrid();
  },

  updateProdutosSortIndicators(){
    try{
      const ths = document.querySelectorAll('#sectionCadastrarProdutos .data-grid thead th[data-field]');
      ths.forEach(th=>{
        const field = th.getAttribute('data-field');
        const label = th.textContent.replace(/\s*[▲▼]$/,'').trim();
        if(this._produtosSort && this._produtosSort.field === field){
          const arrow = this._produtosSort.ascending ? '▲' : '▼';
          th.innerHTML = `${label} <span class="sort-indicator">${arrow}</span>`;
        } else {
          th.innerHTML = label;
        }
      });
    }catch(e){}
  },

  // Sorting helpers for fornecedores
  toggleFornecedoresSort(field){
    if(!field) return;
    if(this._fornecedoresSort && this._fornecedoresSort.field === field){
      this._fornecedoresSort.ascending = !this._fornecedoresSort.ascending;
    } else {
      this._fornecedoresSort = { field, ascending: true };
    }
    this.renderFornecedoresGrid();
  },

  updateFornecedoresSortIndicators(){
    try{
      const ths = document.querySelectorAll('#sectionCadastrarFornecedor .data-grid thead th[data-field]');
      ths.forEach(th=>{
        const field = th.getAttribute('data-field');
        const label = th.textContent.replace(/\s*[▲▼]$/,'').trim();
        if(this._fornecedoresSort && this._fornecedoresSort.field === field){
          const arrow = this._fornecedoresSort.ascending ? '▲' : '▼';
          th.innerHTML = `${label} <span class="sort-indicator">${arrow}</span>`;
        } else {
          th.innerHTML = label;
        }
      });
    }catch(e){}
  },


  openModal(){
    if(!this.importExportModal) return;
    // move modal to body to guarantee it's above fixed sidebars and other z-indexed elements
    try{ document.body.appendChild(this.importExportModal); }catch(e){}

    // store previous inline styles to restore on close
    this._modalPrevStyles = this._modalPrevStyles || {};
    this._modalPrevStyles.backdropDisplay = this.importExportModal.style.display || '';
    this._modalPrevStyles.backdropZ = this.importExportModal.style.zIndex || '';
    this._modalPrevStyles.backdropPointer = this.importExportModal.style.pointerEvents || '';
    this._modalPrevStyles.bodyOverflow = document.body.style.overflow || '';

    // force backdrop and modal to be visible and interactive (fallback against conflicting CSS)
    this.importExportModal.classList.remove('hidden');
    this.importExportModal.style.display = 'flex';
    this.importExportModal.style.zIndex = '2147483646';
    this.importExportModal.style.pointerEvents = 'auto';

    const modalInner = this.importExportModal.querySelector('.modal');
    if(modalInner){
      // save previous modal inline style
      this._modalPrevStyles.modalStyle = modalInner.getAttribute('style') || '';
      modalInner.style.position = 'fixed';
      modalInner.style.top = '50%';
      modalInner.style.left = '50%';
      modalInner.style.transform = 'translate(-50%,-50%)';
      modalInner.style.zIndex = '2147483647';
      modalInner.style.maxWidth = '900px';
      modalInner.style.width = 'min(900px,92%)';
      modalInner.style.boxShadow = '0 6px 18px rgba(0,0,0,0.12)';
      modalInner.style.background = '#fff';
    }

    // prevent background scroll while modal is open
    document.body.style.overflow = 'hidden';

    // focus first focusable element inside modal (small delay to ensure DOM ready)
    setTimeout(()=>{
      const focusable = this.importExportModal.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      if(focusable) focusable.focus();
    }, 60);
  },

  closeModal(){
    if(!this.importExportModal) return;
    // hide
    this.importExportModal.classList.add('hidden');

    // restore inline styles if we saved them
    if(this._modalPrevStyles){
      this.importExportModal.style.display = this._modalPrevStyles.backdropDisplay || '';
      this.importExportModal.style.zIndex = this._modalPrevStyles.backdropZ || '';
      this.importExportModal.style.pointerEvents = this._modalPrevStyles.backdropPointer || '';
      document.body.style.overflow = this._modalPrevStyles.bodyOverflow || '';
      const modalInner = this.importExportModal.querySelector('.modal');
      if(modalInner){
        modalInner.setAttribute('style', this._modalPrevStyles.modalStyle || '');
      }
    } else {
      document.body.style.overflow = '';
    }

    // clear preview state
    if(this.importPreview){ this.importPreview.innerHTML=''; this.importPreview.classList.add('hidden') }
    if(this.importStatus) this.importStatus.textContent = '';
    if(this.btnConfirmImport) this.btnConfirmImport.classList.add('hidden');
    this._importPreviewData = null;
  },
  // Compact import/export panel (permanent panel element)
  openImportPanel(mode='produtos'){
    if(!this.importPanel) return;
    this._importMode = mode;
    // adjust header and expected columns
    const header = this.importPanel.querySelector('.panel-header h3');
    const expCols = document.getElementById('importExpectedColumns');
    if(mode==='fornecedores'){
      if(header) header.textContent = 'Importar / Exportar Fornecedores';
      if(expCols) expCols.textContent = 'NOME, TELEFONE';
      if(this.importStatus) this.importStatus.textContent = '';
    } else {
      if(header) header.textContent = 'Importar / Exportar Produtos';
      if(expCols) expCols.textContent = 'COD1, COD2, PRODUTO';
      if(this.importStatus) this.importStatus.textContent = '';
    }
    this.importPanel.classList.remove('hidden');
    // focus first control
    setTimeout(()=>{ const f = this.importPanel.querySelector('button,input,select,textarea'); if(f) f.focus(); },50);
  },

  closeImportPanel(){
    if(!this.importPanel) return;
    this.importPanel.classList.add('hidden');
    // clear preview and state
    if(this.importPreview){ this.importPreview.innerHTML=''; this.importPreview.classList.add('hidden'); }
    if(this.importStatus) this.importStatus.textContent = '';
    if(this.btnConfirmImport) this.btnConfirmImport.classList.add('hidden');
    this._importPreviewData = null;
  },

  // Compact panel for quotation details (no full-screen overlay)
  openDetailPanel(){
    if(!this.quotationDetailModal) return;
    const modalInner = this.quotationDetailModal.querySelector('.modal');
    if(!modalInner) return;

    // save previous state
    this._detailPrev = this._detailPrev || {};
    this._detailPrev.parent = modalInner.parentElement;
    this._detailPrev.modalStyle = modalInner.getAttribute('style') || '';
    this._detailPrev.backdropStyle = this.quotationDetailModal.getAttribute('style') || '';

    // hide backdrop
    try{ this.quotationDetailModal.style.display = 'none'; }catch(e){}

    // move modal to body and style as centered small panel
    try{ document.body.appendChild(modalInner); }catch(e){}
    modalInner.style.position = 'fixed';
    modalInner.style.top = '50%';
    modalInner.style.left = '50%';
    modalInner.style.transform = 'translate(-50%, -50%)';
    modalInner.style.width = 'min(760px,92%)';
    modalInner.style.maxWidth = '760px';
    modalInner.style.zIndex = '2147483647';
    modalInner.style.boxShadow = '0 10px 30px rgba(0,0,0,0.18)';
    modalInner.style.background = '#fff';
    modalInner.style.display = 'block';

    // wire close
    const closeBtn = modalInner.querySelector('.close-button');
    if(closeBtn) closeBtn.onclick = ()=>this.closeDetailPanel();

    // ensure body scroll not locked (detail shouldn't block page)
    document.body.style.overflow = '';
  },

  closeDetailPanel(){
    if(!this.quotationDetailModal) return;
    const modalInner = document.querySelector('body > .modal[data-is-detail-panel="true"]');
    if(!modalInner) return;

    // restaura o estilo inline e move de volta para o backdrop
    modalInner.setAttribute('style', this._detailPrev.modalStyle || '');
    try{ this._detailPrev.parent.appendChild(modalInner); }catch(e){}
    try{ this.quotationDetailModal.setAttribute('style', this._detailPrev.backdropStyle || ''); }catch(e){}
    this.quotationDetailModal.style.display = 'none';
  },

  async handleImport(){
    const file = this.importExcelFile.files[0];
    if(!file){ if(this.importStatus) this.importStatus.textContent = 'Selecione um arquivo para importar.'; return }

    // Limpar preview/status
    if(this.importPreview) { this.importPreview.innerHTML = ''; this.importPreview.classList.add('hidden') }
    if(this.importStatus) this.importStatus.textContent = 'Lendo arquivo e gerando pré-visualização...';

    const reader = new FileReader();
    reader.onload = async (e)=>{
      try{
        const data = new Uint8Array(e.target.result);
        const wb = XLSX.read(data,{type:'array'});
        const ws = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(ws);

        const importErrors = [];
        const mode = this._importMode || 'produtos';

        if(mode === 'fornecedores'){
          const suppliersToInsert = [];
          const existingNames = new Set();
          try{
            const existing = await SupabaseService.list('fornecedores','nome');
            existing.forEach(x=>existingNames.add(x.nome));
          }catch(err){ console.error('Erro ao buscar fornecedores existentes para importação:', err); if(this.importStatus) this.importStatus.textContent = 'Erro ao verificar fornecedores existentes. Veja console.'; return }
          const seenInFile = new Set();
          for(const row of json){
            const norm = {};
            Object.keys(row||{}).forEach(k=>{ const nk = String(k).trim().toLowerCase().replace(/\s+|_+/g,''); norm[nk]=row[k]; });
            const nome = String(norm['nome'] ?? norm['name'] ?? '').trim();
            const telefone = String(norm['telefone'] ?? norm['phone'] ?? '').trim();
            if(!nome){ importErrors.push(`Linha ignorada: NOME vazio: ${JSON.stringify(row)}`); continue }
            if(existingNames.has(nome) || seenInFile.has(nome)){ importErrors.push(`Fornecedor '${nome}' já existe ou duplicado no arquivo; será ignorado.`); continue }
            suppliersToInsert.push({ nome, telefone });
            seenInFile.add(nome);
            existingNames.add(nome);
          }

          // build preview
          if(this.importPreview){
            const previewRows = [];
            const seen = new Set();
            for(const row of json){
              const norm = {}; Object.keys(row||{}).forEach(k=>{ const nk = String(k).trim().toLowerCase().replace(/\s+|_+/g,''); norm[nk]=row[k]; });
              const nome = String(norm['nome'] ?? norm['name'] ?? '').trim();
              const telefone = String(norm['telefone'] ?? norm['phone'] ?? '').trim();
              let status='importar', reason='';
              if(!nome){ status='ignorado'; reason='NOME vazio' }
              else if(seen.has(nome)) { status='ignorado'; reason='Duplicado no arquivo' }
              else if(existingNames.has(nome) && !seen.has(nome)) { /* if existingNames includes current because we updated it above, we need a different set */ }
              // Note: for preview, we consider the initial existing names by re-checking via a simple approach
              previewRows.push({ nome, telefone, status, reason });
              if(status==='importar') seen.add(nome);
            }
            const previewCount = Math.min(20, previewRows.length);
            if(previewRows.length>0){
              let html = '<table><thead><tr><th>Nome</th><th>Telefone</th><th>Status</th></tr></thead><tbody>' + previewRows.slice(0,previewCount).map(r=>{
                if(r.status==='importar') return `<tr class="preview-row-accept"><td>${r.nome}</td><td>${r.telefone||''}</td><td><span class="status status-Aprovada">Importar</span></td></tr>`;
                return `<tr class="preview-row-ignored"><td>${r.nome}</td><td>${r.telefone||''}</td><td><span class="status status-Rejeitada">Ignorado: ${r.reason}</span></td></tr>`;
              }).join('') + '</tbody></table>';
              html += `<div class="preview-note">Mostrando ${previewCount} de ${previewRows.length} linhas da planilha. Linhas marcadas como "Ignorado" não serão importadas.</div>`;
              if(importErrors.length) html += `<div class="preview-note">${importErrors.length} avisos (veja console para detalhes).</div>`;
              this.importPreview.innerHTML = html; this.importPreview.classList.remove('hidden');
            } else { this.importPreview.innerHTML = `<div class="preview-note">Arquivo vazio ou sem linhas válidas. ${importErrors.length} linhas com avisos.</div>`; this.importPreview.classList.remove('hidden'); }
          }

          if(this.importStatus) this.importStatus.textContent = `Pré-visualização pronta - ${suppliersToInsert.length} novos fornecedores detectados.`;
          this._importPreviewData = { suppliersToInsert, importErrors };
          if(this.btnConfirmImport) { this.btnConfirmImport.classList.remove('hidden'); this.btnConfirmImport.disabled = false }
          return;
        }

        // Default: produtos (existing logic)
        const productsToInsert = [];
        const existingProductCodes = new Set();
        try {
          const existingProducts = await SupabaseService.list('produtos', 'codigo_principal');
          existingProducts.forEach(p => existingProductCodes.add(p.codigo_principal));
        } catch (err) {
          console.error('Erro ao buscar produtos existentes para importação:', err);
          if(this.importStatus) this.importStatus.textContent = 'Erro ao verificar produtos existentes. Veja console.';
          return;
        }

        const existingProductsStart = new Set(existingProductCodes);
        const seenInFile = new Set();
        const ignoredRows = [];

        for (const row of json) {
          const norm = {};
          Object.keys(row || {}).forEach(k => {
            const nk = String(k).trim().toLowerCase().replace(/\s+|_+/g,'');
            norm[nk] = row[k];
          });

          const codigo_principal = String(norm['cod1'] ?? norm['cod'] ?? norm['codigo'] ?? norm['codigo1'] ?? '').trim();
          const codigo_secundario = String(norm['cod2'] ?? norm['cod_2'] ?? norm['codigo2'] ?? '').trim();
          const nome = String(norm['produto'] ?? norm['prod'] ?? norm['nome'] ?? '').trim();

          if (!codigo_principal || !nome) {
            const reason = 'COD1 ou PRODUTO vazio';
            ignoredRows.push({ row, codigo_principal, codigo_secundario, nome, reason });
            importErrors.push(`Linha ignorada: ${reason}: ${JSON.stringify(row)}`);
            continue;
          }

          if (existingProductsStart.has(codigo_principal) || seenInFile.has(codigo_principal)) {
            const reason = existingProductsStart.has(codigo_principal) ? 'Código já existe' : 'Duplicado no arquivo';
            ignoredRows.push({ row, codigo_principal, codigo_secundario, nome, reason });
            importErrors.push(`Produto com Código Principal '${codigo_principal}' já existe e será ignorado.`);
            continue;
          }

          productsToInsert.push({ codigo_principal, codigo_secundario, nome });
          seenInFile.add(codigo_principal);
          existingProductCodes.add(codigo_principal);
        }

        // Mostrar pré-visualização (até 20 linhas) com destaque das linhas ignoradas
        if(this.importPreview){
          const allPreviewRows = [];
          // recreate a preview array that preserves original order: include both accepted and ignored
          const seenAccepted = new Set();
          for (const row of json) {
            const norm = {};
            Object.keys(row || {}).forEach(k => { const nk = String(k).trim().toLowerCase().replace(/\s+|_+/g,''); norm[nk] = row[k]; });
            const codigo_principal = String(norm['cod1'] ?? norm['cod'] ?? norm['codigo'] ?? norm['codigo1'] ?? '').trim();
            const codigo_secundario = String(norm['cod2'] ?? norm['cod_2'] ?? norm['codigo2'] ?? '').trim();
            const nome = String(norm['produto'] ?? norm['prod'] ?? norm['nome'] ?? '').trim();
            let status = 'importar';
            let reason = '';
            if (!codigo_principal || !nome) { status = 'ignorado'; reason = 'COD1 ou PRODUTO vazio'; }
            else if (existingProductsStart.has(codigo_principal)) { status = 'ignorado'; reason = 'Código já existe'; }
            else if (seenAccepted.has(codigo_principal)) { status = 'ignorado'; reason = 'Duplicado no arquivo'; }
            else { status = 'importar'; seenAccepted.add(codigo_principal); }
            allPreviewRows.push({ codigo_principal, codigo_secundario, nome, status, reason });
          }

          const previewCount = Math.min(20, allPreviewRows.length);
          if(allPreviewRows.length>0){
            let html = '<table><thead><tr><th>Cod1</th><th>Cod2</th><th>Produto</th><th>Status</th></tr></thead><tbody>' + allPreviewRows.slice(0,previewCount).map(r=>{
              if(r.status==='importar') return `<tr class="preview-row-accept"><td>${r.codigo_principal}</td><td>${r.codigo_secundario||''}</td><td>${r.nome}</td><td><span class="status status-Aprovada">Importar</span></td></tr>`;
              return `<tr class="preview-row-ignored"><td>${r.codigo_principal}</td><td>${r.codigo_secundario||''}</td><td>${r.nome}</td><td><span class="status status-Rejeitada">Ignorado: ${r.reason}</span></td></tr>`;
            }).join('') + '</tbody></table>';
            html += `<div class="preview-note">Mostrando ${previewCount} de ${allPreviewRows.length} linhas da planilha. Linhas marcadas como "Ignorado" não serão importadas.</div>`;
            if(importErrors.length) html += `<div class="preview-note">${importErrors.length} avisos (veja console para detalhes).</div>`;
            this.importPreview.innerHTML = html; this.importPreview.classList.remove('hidden');
          } else {
            this.importPreview.innerHTML = `<div class="preview-note">Arquivo vazio ou sem linhas válidas. ${importErrors.length} linhas com avisos.</div>`; this.importPreview.classList.remove('hidden');
          }
        }

        if(this.importStatus) this.importStatus.textContent = `Pré-visualização pronta - ${productsToInsert.length} novos produtos detectados.`;
        this._importPreviewData = { productsToInsert, importErrors };
        if(this.btnConfirmImport) { this.btnConfirmImport.classList.remove('hidden'); this.btnConfirmImport.disabled = false }
      }catch(err){
        console.error('Erro ao processar arquivo:', err);
        if(this.importStatus) this.importStatus.textContent = 'Erro ao processar o arquivo. Veja console.';
      }
    };
    reader.readAsArrayBuffer(file);
  },

  async handleExport(){
    try {
      const mode = this._importMode || 'produtos';
      if(mode === 'fornecedores'){
        const suppliers = await SupabaseService.list('fornecedores','nome,telefone',{orderBy:'nome'});
        const aoa = [['NOME','TELEFONE'], ...suppliers.map(s=>[s.nome, s.telefone||''])];
        const ws = XLSX.utils.aoa_to_sheet(aoa);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Fornecedores');
        XLSX.writeFile(wb, 'fornecedores_cadastrados.xlsx');
        alert('Exportação de fornecedores concluída!');
        if(this.closeImportPanel) this.closeImportPanel();
        return;
      }

      // Default: produtos
      const products = await SupabaseService.list('produtos', 'codigo_principal,codigo_secundario,nome', {orderBy: 'codigo_principal'});
      const aoa = [['COD1','COD2','PRODUTO'], ...products.map(p => [p.codigo_principal, p.codigo_secundario, p.nome])];
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Produtos');
      XLSX.writeFile(wb, 'produtos_cadastrados.xlsx');
      alert('Exportação de produtos concluída!');
      if(this.closeImportPanel) this.closeImportPanel();
    } catch (e) {
      console.error('Erro ao exportar produtos:', e);
      alert('Erro ao exportar produtos. Verifique o console para detalhes.');
    }
  },

  async confirmImport(){
    const dataObj = this._importPreviewData;
    const mode = this._importMode || 'produtos';
    if(!dataObj) { alert('Nada para importar. Faça a pré-visualização antes.'); return; }
    try{
      if(this.btnConfirmImport) { this.btnConfirmImport.disabled = true; this.btnConfirmImport.textContent = 'Importando...'; }
      if(mode === 'fornecedores'){
        const suppliersToInsert = dataObj.suppliersToInsert || [];
        if(suppliersToInsert.length===0){ alert('Nada para importar. Faça a pré-visualização antes.'); if(this.btnConfirmImport){ this.btnConfirmImport.disabled=false; this.btnConfirmImport.textContent='Confirmar Importação'; } return }
        await SupabaseService.insert('fornecedores', suppliersToInsert);
        if(this.importStatus) this.importStatus.textContent = `Importação concluída! ${suppliersToInsert.length} fornecedores adicionados.`;
        if(dataObj.importErrors && dataObj.importErrors.length) console.warn('Avisos durante a importação:\n', dataObj.importErrors.join('\n'));
        // Atualiza UI
        this.renderFornecedoresGrid();
        this.populateSupplierDropdowns();
        setTimeout(()=>{ if(this.closeImportPanel) this.closeImportPanel(); if(this.btnConfirmImport){ this.btnConfirmImport.textContent='Confirmar Importação'; this.btnConfirmImport.classList.add('hidden'); } }, 1200);
        return;
      }

      // Default: produtos
      const productsToInsert = dataObj.productsToInsert || [];
      if(productsToInsert.length===0){ alert('Nada para importar. Faça a pré-visualização antes.'); if(this.btnConfirmImport){ this.btnConfirmImport.disabled=false; this.btnConfirmImport.textContent='Confirmar Importação'; } return }
      await SupabaseService.insert('produtos', productsToInsert);
      if(this.importStatus) this.importStatus.textContent = `Importação concluída! ${productsToInsert.length} produtos adicionados.`;
      if(dataObj.importErrors && dataObj.importErrors.length) console.warn('Avisos durante a importação:\n', dataObj.importErrors.join('\n'));
      // Atualiza UI
      this.renderProdutosGrid();
      this.populateProductDropdown();
      setTimeout(()=>{ if(this.closeImportPanel) this.closeImportPanel(); if(this.btnConfirmImport){ this.btnConfirmImport.textContent='Confirmar Importação'; this.btnConfirmImport.classList.add('hidden'); } }, 1200);
    }catch(err){
      console.error('Erro ao inserir no Supabase:', err);
      if(this.importStatus) this.importStatus.textContent = 'Erro ao inserir dados. Veja console.';
      if(this.btnConfirmImport) { this.btnConfirmImport.disabled = false; this.btnConfirmImport.textContent = 'Confirmar Importação'; }
    }
  },
}

// Inicializa a UI quando o DOM estiver pronto
window.addEventListener('DOMContentLoaded', ()=>UI.init());
