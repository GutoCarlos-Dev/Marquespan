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
    this.renderProdutosGrid(); // Adicionado para carregar produtos no início
    this.renderFornecedoresGrid(); // Adicionado para carregar fornecedores no início
    this.showSection('sectionRealizarCotacoes'); // Garante que apenas a primeira aba seja exibida inicialmente
  },

  cache(){
    this.navLinks = document.querySelectorAll('#menu-compras button.painel-btn');
    this.sections = document.querySelectorAll('section.section');
    this.cartBody = document.getElementById('cartBody');
    this.cartProductSelect = document.getElementById('cartProductSelect');
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
    this.importExportModal = document.getElementById('importExportModal');
    this.btnOpenImportExportModal = document.getElementById('btnOpenImportExportModal');
    this.closeModalButtons = document.querySelectorAll('.modal .close-button');
    this.btnImportProducts = document.getElementById('btnImportProducts');
    this.btnExportProducts = document.getElementById('btnExportProducts');
    this.importExcelFile = document.getElementById('importExcelFile');
    this.quotationDetailModal = document.getElementById('quotationDetailModal');
    this.quotationDetailTitle = document.getElementById('quotationDetailTitle');
    this.quotationDetailBody = document.getElementById('quotationDetailBody');
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

    this.btnOpenImportExportModal?.addEventListener('click', ()=>this.openModal());
    this.closeModalButtons?.forEach(btn=>btn.addEventListener('click', ()=>this.closeModal()));
    this.importExportModal?.addEventListener('click', (e)=>{ if(e.target===this.importExportModal) this.closeModal() });

    this.btnImportProducts?.addEventListener('click', ()=>this.handleImport());
    this.btnExportProducts?.addEventListener('click', ()=>this.handleExport());

    // detail modal
    if(this.quotationDetailModal){
      this.quotationDetailModal.querySelector('.close-button').addEventListener('click', ()=>this.quotationDetailModal.classList.add('hidden'));
      this.quotationDetailModal.addEventListener('click', e=>{ if(e.target===this.quotationDetailModal) this.quotationDetailModal.classList.add('hidden') });
    }

    // product form
    this.formCadastrarProduto?.addEventListener('submit', e=>this.handleProductForm(e));
    this.formCadastrarFornecedor?.addEventListener('submit', e=>this.handleFornecedorForm(e));
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
      const produtos = await SupabaseService.list('produtos', 'id, codigo_principal, nome', {orderBy:'nome'});
      this.cartProductSelect.innerHTML = '<option value="">-- Selecione um produto --</option>';
      produtos.forEach(p=>{
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = `${p.codigo_principal} - ${p.nome}`;
        this.cartProductSelect.appendChild(opt);
      });
    }catch(e){console.error('Erro carregar produtos',e);this.cartProductSelect.innerHTML='<option value="">Erro ao carregar</option>'}
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
    const pid = this.cartProductSelect.value;
    const qtd = parseInt(this.cartQtd.value);
    if(!pid || isNaN(qtd) || qtd<=0) return alert('Selecione produto e quantidade válida');
    try{
      const prod = await SupabaseService.list('produtos','id,codigo_principal,nome',{eq:{field:'id',value:pid}});
      const p = Array.isArray(prod)?prod[0]:prod;
      const item = { id:p.id, cod:p.codigo_principal, produto:p.nome, qtd, uni:'UN' };
      if(!this.cart.add(item)) return alert('Produto já adicionado');
      this.renderCart(); this.cartProductSelect.value=''; this.cartQtd.value='';
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
      // inserir cotacao
      const cotacaoPayload = { codigo_cotacao: code, status:'Pendente', id_fornecedor_vencedor:idFornecedorVencedor, valor_total_vencedor:valorTotalVencedor };
      const cot = await SupabaseService.insert('cotacoes', cotacaoPayload);
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
      let q = supabase.from('cotacoes').select('id,codigo_cotacao,data_cotacao,status,valor_total_vencedor,fornecedores(nome)').order('data_cotacao',{ascending:false});
      if(search) q = q.ilike('codigo_cotacao',`%${search}%`);
      if(status && status!=='Todas') q = q.eq('status',status);
      const { data, error } = await q;
      if(error) throw error;
      this.savedQuotationsTableBody.innerHTML = '';
      if(!data || data.length===0) return this.savedQuotationsTableBody.innerHTML = `<tr><td colspan="6">Nenhuma cotação encontrada.</td></tr>`;
      data.forEach(c=>{
        const tr = document.createElement('tr');
        const winnerName = c.fornecedores ? c.fornecedores.nome : 'N/A';
        const totalValue = c.valor_total_vencedor ? `R$ ${parseFloat(c.valor_total_vencedor).toFixed(2)}` : 'N/A';
        tr.innerHTML = `<td>${c.codigo_cotacao}</td><td>${new Date(c.data_cotacao).toLocaleDateString('pt-BR')}</td><td>${winnerName}</td><td>${totalValue}</td><td><span class="status status-${c.status}">${c.status}</span></td><td><button class="btn-action btn-view" data-id="${c.id}">Ver</button> <button class="btn-action btn-delete" data-id="${c.id}">Excluir</button></td>`;
        this.savedQuotationsTableBody.appendChild(tr);
      });
      // attach listeners
      this.savedQuotationsTableBody.querySelectorAll('.btn-view').forEach(b=>b.addEventListener('click', e=>this.openQuotationDetailModal(e.target.dataset.id)));
      this.savedQuotationsTableBody.querySelectorAll('.btn-delete').forEach(b=>b.addEventListener('click', e=>this.deleteQuotation(e.target.dataset.id)));
    }catch(e){console.error('Erro renderSavedQuotations',e); this.savedQuotationsTableBody.innerHTML = `<tr><td colspan="6">Erro ao carregar cotações.</td></tr>`}
  },

  async openQuotationDetailModal(id){
    try{
      const { data:cotacao, error:cotErr } = await supabase.from('cotacoes').select('*,fornecedores(nome)').eq('id',id).single(); if(cotErr) throw cotErr;
      const { data:itens } = await supabase.from('cotacao_itens').select('quantidade, produtos(codigo_principal,nome,id)').eq('id_cotacao',id);
      const { data:orcamentos } = await supabase.from('cotacao_orcamentos').select('*,fornecedores(nome)').eq('id_cotacao',id);
      for(const o of orcamentos){ const { data:precos } = await supabase.from('orcamento_item_precos').select('preco_unitario,id_produto').eq('id_orcamento',o.id); o.precos=precos }
      let html = `<p><strong>Data:</strong> ${new Date(cotacao.data_cotacao).toLocaleDateString('pt-BR')}</p><p><strong>Status:</strong> ${cotacao.status}</p><hr><h3>Itens</h3><ul>${itens.map(i=>`<li>${i.quantidade}x ${i.produtos.nome} (${i.produtos.codigo_principal})</li>`).join('')}</ul><hr><h3>Orçamentos</h3>`;
      orcamentos.forEach(o=>{ const isWinner = o.id_fornecedor===cotacao.id_fornecedor_vencedor; html+=`<div class="card ${isWinner?'winner':''}"><h4>${o.fornecedores.nome} ${isWinner? '(Vencedor)':''}</h4><p><strong>Total:</strong> R$ ${parseFloat(o.valor_total).toFixed(2)}</p><p><strong>Obs:</strong> ${o.observacao||'Nenhuma'}</p><table class="data-grid"><thead><tr><th>Produto</th><th>Preço</th></tr></thead><tbody>${o.precos.map(p=>{ const prod = itens.find(it=>it.produtos.id===p.id_produto); return `<tr><td>${prod?prod.produtos.nome:'Produto não encontrado'}</td><td>R$ ${parseFloat(p.preco_unitario).toFixed(2)}</td></tr>` }).join('')}</tbody></table></div>` });
      this.quotationDetailTitle.textContent = `Detalhes: ${cotacao.codigo_cotacao}`;
      this.quotationDetailBody.innerHTML = html;
      this.quotationDetailModal.classList.remove('hidden');
    }catch(e){console.error(e);alert('Erro ao abrir detalhes')}
  },

  async deleteQuotation(id){ if(confirm('Excluir cotação?')){ try{ await SupabaseService.remove('cotacoes',{field:'id',value:id}); alert('Excluído'); this.renderSavedQuotations(); }catch(e){console.error(e);alert('Erro excluir')}} },

  async renderProdutosGrid(){
    try{
      const produtos = await SupabaseService.list('produtos','id,codigo_principal,codigo_secundario,nome',{orderBy:'nome'});
      this.produtosTableBody.innerHTML='';
      produtos.forEach(p=>{
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${p.codigo_principal}</td><td>${p.codigo_secundario||''}</td><td>${p.nome}</td><td><button class="btn-action btn-edit" data-id="${p.id}">Editar</button> <button class="btn-action btn-delete" data-id="${p.id}">Excluir</button></td>`;
        this.produtosTableBody.appendChild(tr);
      });
    }catch(e){console.error('Erro produtos',e)}
  },

  async handleProductForm(e){
    e.preventDefault();
    const codigo1 = document.getElementById('produtoCodigo1').value.trim();
    const codigo2 = document.getElementById('produtoCodigo2').value.trim();
    const nome = document.getElementById('produtoNome').value.trim();
    if(!codigo1||!nome) return alert('Preencha Código 1 e Nome');

    // Verificar se o código principal já existe
    const { data: existente, error: erroBusca } = await supabase
      .from('produtos')
      .select('id')
      .eq('codigo_principal', codigo1);

    if (erroBusca) {
      console.error('Erro ao verificar código:', erroBusca);
      alert('Erro ao verificar código. Tente novamente.');
      return;
    }

    if (existente.length > 0) {
      console.warn('Código já existente:', codigo1);
      alert('Já existe um produto com esse código principal.');
      return;
    }

    try {
      const { data, error } = await supabase
        .from('produtos')
        .insert([{ codigo_principal: codigo1, codigo_secundario: codigo2, nome }]);

      if (error) {
        console.error('Erro ao salvar:', error);
        alert('Erro ao salvar o produto. Tente novamente.');
        return;
      }

      alert('Produto cadastrado com sucesso!');
      this.formCadastrarProduto.reset();
      this.renderProdutosGrid();
      this.populateProductDropdown();
    } catch (err) {
      console.error('Erro inesperado:', err);
      alert('Erro inesperado. Verifique sua conexão.');
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
      const { data } = await supabase.from('produtos').select('codigo_principal,codigo_secundario,nome').eq('id', id).single();
      if (data) { // Popula o formulário para edição
        document.getElementById('produtoCodigo1').value = data.codigo_principal;
        document.getElementById('produtoCodigo2').value = data.codigo_secundario || '';
        document.getElementById('produtoNome').value = data.nome;
        window.scrollTo(0, 0); // Rola para o topo para editar
      }
    }
  },
  // Adicionado para limpar o formulário após adicionar ou editar (se a edição for implementada)
  clearProductForm() {
    document.getElementById('produtoCodigo1').value = '';
    document.getElementById('produtoCodigo2').value = '';
    document.getElementById('produtoNome').value = '';
    // Se houver um ID de produto para edição, ele também precisaria ser limpo
  },

  async renderFornecedoresGrid(){
    try{
      const f = await SupabaseService.list('fornecedores','id,nome,telefone',{orderBy:'nome'});
      this.fornecedoresTableBody.innerHTML='';
      f.forEach(item=>{
        const tr=document.createElement('tr');
        tr.innerHTML=`<td>${item.nome}</td><td>${item.telefone||''}</td><td><button class="btn-action btn-edit" data-id="${item.id}">Editar</button> <button class="btn-action btn-delete" data-id="${item.id}">Excluir</button></td>`;
        this.fornecedoresTableBody.appendChild(tr)
      });
    }catch(e){console.error('Erro ao renderizar fornecedores:', e)}
  },

  async handleFornecedorForm(e){ // Este formulário atualmente suporta apenas a adição, não a edição.
    e.preventDefault();
    const nome=document.getElementById('fornecedorNome').value.trim();
    const tel=document.getElementById('fornecedorTelefone').value.trim();
    if(!nome) return alert('Preencha o nome');
    try{ await SupabaseService.insert('fornecedores',{nome,telefone:tel}); alert('Fornecedor salvo'); this.formCadastrarFornecedor.reset(); this.renderFornecedoresGrid(); this.populateSupplierDropdowns(); }catch(err){console.error('Erro ao salvar fornecedor:', err);alert('Erro salvar fornecedor')}
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
        window.scrollTo(0, 0); // Rola para o topo para editar
      }
    }
  },

  openModal(){ if(this.importExportModal) this.importExportModal.classList.remove('hidden'); },
  closeModal(){ if(this.importExportModal) this.importExportModal.classList.add('hidden'); },

  async handleImport(){
    const file = this.importExcelFile.files[0];
    if(!file) return alert('Selecione um arquivo para importar.');

    const reader = new FileReader();
    reader.onload = async (e)=>{
      const data = new Uint8Array(e.target.result);
      const wb = XLSX.read(data,{type:'array'});
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(ws);

      const productsToInsert = [];
      const existingProductCodes = new Set();
      const importErrors = [];

      // Busca todos os códigos de produtos existentes no Supabase uma vez para verificação eficiente de duplicatas
      try {
        const existingProducts = await SupabaseService.list('produtos', 'codigo_principal');
        existingProducts.forEach(p => existingProductCodes.add(p.codigo_principal));
      } catch (err) {
        console.error('Erro ao buscar produtos existentes para importação:', err);
        alert('Erro ao verificar produtos existentes. A importação pode falhar.');
        return;
      }

      for (const row of json) {
        const codigo_principal = String(row.COD1 || '').trim();
        const codigo_secundario = String(row.COD2 || '').trim();
        const nome = String(row.PRODUTO || '').trim();

        if (!codigo_principal || !nome) {
          importErrors.push(`Linha ignorada: Código Principal (COD1) ou Nome (PRODUTO) está vazio para a linha ${JSON.stringify(row)}.`);
          continue;
        }

        if (existingProductCodes.has(codigo_principal)) {
          importErrors.push(`Produto com Código Principal '${codigo_principal}' já existe e será ignorado.`);
          continue;
        }

        productsToInsert.push({
          codigo_principal: codigo_principal,
          codigo_secundario: codigo_secundario,
          nome: nome
        });
        existingProductCodes.add(codigo_principal); // Adiciona ao conjunto para evitar duplicatas dentro do mesmo lote de importação
      }

      if (productsToInsert.length > 0) {
        try {
          await SupabaseService.insert('produtos', productsToInsert);
          alert(`Importação concluída! ${productsToInsert.length} produtos adicionados.`);
        } catch (err) {
          console.error('Erro ao inserir produtos no Supabase:', err);
          alert('Erro ao importar produtos. Verifique o console para detalhes.');
        }
      } else {
        alert('Nenhum produto novo para importar ou todos já existem no sistema.');
      }

      if (importErrors.length > 0) {
        console.warn('Avisos/Erros durante a importação:\n', importErrors.join('\n'));
        alert('Alguns produtos não foram importados devido a erros ou duplicatas. Verifique o console para mais detalhes.');
      }

      this.renderProdutosGrid(); // Atualiza a grade de produtos
      this.populateProductDropdown(); // Atualiza o dropdown de produtos
      this.closeModal();
    };
    reader.readAsArrayBuffer(file);
  },

  async handleExport(){
    try {
      // Busca todos os produtos do Supabase
      const products = await SupabaseService.list('produtos', 'codigo_principal,codigo_secundario,nome', {orderBy: 'codigo_principal'});

      // Prepara os dados para exportação XLSX
      const aoa = [['COD1','COD2','PRODUTO'], ...products.map(p => [p.codigo_principal, p.codigo_secundario, p.nome])];

      const ws = XLSX.utils.aoa_to_sheet(aoa);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Produtos');
      XLSX.writeFile(wb, 'produtos_cadastrados.xlsx');

      alert('Exportação de produtos concluída!');
      this.closeModal();
    } catch (e) {
      console.error('Erro ao exportar produtos:', e);
      alert('Erro ao exportar produtos. Verifique o console para detalhes.');
    }
  },
}

// Inicializa a UI quando o DOM estiver pronto
window.addEventListener('DOMContentLoaded', ()=>UI.init());
