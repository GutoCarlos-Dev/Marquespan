// --------- CONSTANTS & STATE ----------
function extrairDataDaAba(nome){
  const m = nome.match(/(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})/);
  if(!m) return null;
  let [_, d, mth, y] = m;
  if(y.length === 2) y = '20' + y;
  return d.padStart(2,'0') + '/' + mth.padStart(2,'0') + '/' + y;
}
const ACTION_ORDER = ['LIGAÇÃO','1ª ADVERTENCIA VERBAL','2ª ADVERTENCIA VERBAL','3ª ADVERTENCIA VERBAL','1ª ADVERTENCIA ESCRITA','2ª ADVERTENCIA ESCRITA','3ª ADVERTENCIA ESCRITA','SUSPENSÃO','A/C GERENCIA','OK'];
const STORAGE_ACTIONS = 'marquespan_actions_v6_pdfpro';
const STORAGE_MAP = 'marquespan_map_v6_pdfpro';
let workbook = null;
let currentRows = [];
let currentSelected = null;

// fixed mapping expected exactly as in your sheet:
// PLACA | CIDADE | ROTA | STAT | MOTORISTA | SAÍDA MOTORISTA | ENTRADA MOTORISTA | INTERJORNADA MOTORISTA | OBSERVAÇÃO MOTORISTA | AUXILIAR | SAÍDA AUXILIAR | ENTRADA AUXILIAR | INTERJORNADA AUXILIAR | OBSERVAÇÃO AUXILIAR
const FIXED_HEADERS = {
  placa: 'PLACA',
  cidade: 'CIDADE',
  rota: 'ROTA',
  stat: 'STAT',
  motorista: 'MOTORISTA',
  saida_motorista: 'SAÍDA MOTORISTA',
  entrada_motorista: 'ENTRADA MOTORISTA',
  interj_motorista: 'INTERJORNADA MOTORISTA',
  obs_motorista: 'OBSERVAÇÃO MOTORISTA',
  auxiliar: 'AUXILIAR',
  saida_aux: 'SAÍDA AUXILIAR',
  entrada_aux: 'ENTRADA AUXILIAR',
  interj_aux: 'INTERJORNADA AUXILIAR',
  obs_aux: 'OBSERVAÇÃO AUXILIAR'
};

// ---------- helpers ----------
function loadActions(){
  try { return JSON.parse(localStorage.getItem(STORAGE_ACTIONS) || '[]'); } catch(e){ return []; }
}
function saveActions(a){ localStorage.setItem(STORAGE_ACTIONS, JSON.stringify(a)); }
function addAction(actionObj){
  const a = loadActions();
  a.push(actionObj);
  saveActions(a);
}
function removeActionById(id){
  let a = loadActions();
  a = a.filter(x => x.id !== id);
  saveActions(a);
}
function uid(){ return 'id_' + Math.random().toString(36).slice(2,9); }

function escapeHtml(s){ return s ? String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])) : ''; }

// parse times like "07:08" or "0708"
function parseTime(t){
  if(t===undefined || t===null) return null;
  const s = (''+t).trim();
  const m = s.match(/(\d{1,2}):(\d{2})/);
  if(m) return {h:parseInt(m[1],10), m:parseInt(m[2],10)};
  const m2 = s.match(/^(\d{2})(\d{2})$/);
  if(m2) return {h:parseInt(m2[1],10), m:parseInt(m2[2],10)};
  return null;
}
function toMins(t){ if(!t) return null; return t.h*60 + t.m; }

function checkIssues(row){
  const issues = [];
  const s = parseTime(row.saida);
  const e = parseTime(row.entrada);

  if(!row.saida || (''+row.saida).trim()==='') issues.push({type:'SEM_REGISTRO_SAIDA', text:'SEM REGISTRO'});
  if(!row.entrada || (''+row.entrada).trim()==='') issues.push({type:'SEM_REGISTRO_ENTRADA', text:'SEM REGISTRO'});

  if(s){ const mins=toMins(s); if(mins > (19*60+20)) issues.push({type:'SAIDA_TARDIA', text:'SAÍDA APÓS 19:20'}); }
  if(e){ const mins=toMins(e); if(mins < (6*60+45)) issues.push({type:'ENTRADA_PRECOCE', text:'ENTRADA ANTES DE 06:45'}); }

  if(row.interj){
    const m = (''+row.interj).match(/(\d{1,2}):(\d{2})/);
    if(m){ const mins = parseInt(m[1],10)*60 + parseInt(m[2],10); if(mins < 11*60) issues.push({type:'INTERJORNADA_CURTA', text:'INTERJORNADA < 11H'}); }
    else { const num = parseFloat((''+row.interj).replace(',','.')); if(!isNaN(num) && num < 11) issues.push({type:'INTERJORNADA_CURTA', text:'INTERJORNADA < 11H'}); }
  } else {
    issues.push({type:'SEM_REGISTRO_INTERJ', text:'SEM REGISTRO'});
  }

  return issues;
}

// --------- XLSX handling (fixed mapping) ----------
document.getElementById('fileInput').addEventListener('change', e=>{
  const f = e.target.files[0]; if(!f) return alert('Selecione um arquivo');
  const reader = new FileReader();
  reader.onload = ev=>{
    try{
      workbook = XLSX.read(ev.target.result, {type:'binary'});
      const sheets = workbook.SheetNames.slice();
      const sel = document.getElementById('sheetSelect'); sel.innerHTML = '';
      sheets.forEach(s => { const o = document.createElement('option'); o.value = s; o.textContent = s; sel.appendChild(o); });
      if(sheets.length) document.getElementById('btnLoad').textContent = 'Carregar Aba';
      alert('Arquivo carregado. Selecione a aba e clique em "Carregar Aba".');
    }catch(err){
      console.error(err);
      alert('Erro ao ler arquivo. Verifique se é um XLSX válido.');
    }
  };
  reader.readAsBinaryString(f);
});

document.getElementById('btnLoad').addEventListener('click', ()=>{
  if(!workbook) return alert('Selecione o arquivo primeiro.');
  const sheetName = document.getElementById('sheetSelect').value || workbook.SheetNames[0];
  const sheetDate = extrairDataDaAba(sheetName) || '';
  const ws = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(ws, {header:1, defval:''});
  if(!data || data.length === 0) return alert('Aba vazia ou formato inesperado.');
  // find header row and build index map using FIXED_HEADERS names
  const headerRow = data[0].map(h => (''+h).trim().toUpperCase());
  const map = {};
  Object.keys(FIXED_HEADERS).forEach(k=>{
    const name = FIXED_HEADERS[k].toUpperCase();
    const idx = headerRow.indexOf(name);
    map[k] = idx >= 0 ? idx : null;
  });
  // if any mandatory missing, warn
  const required = ['placa','motorista','rota','saida_motorista','entrada_motorista','interj_motorista'];
  const missing = required.filter(r => map[r] === null);
  if(missing.length){
    // still allow load but alert
    console.warn('Colunas esperadas não encontradas:', missing);
    alert('Aviso: Algumas colunas esperadas não foram encontradas. Verifique cabeçalhos. Carregando usando as colunas encontradas.');
  }

  // body rows start at 2 (index 1)
  const rows = data.slice(1);
  currentRows = [];
  rows.forEach((r,ri)=>{
    const placa = safeIdx(r, map.placa);
    const rota = safeIdx(r, map.rota);
    const stat = safeIdx(r, map.stat);
    const motoristaName = safeIdx(r, map.motorista);
    const saidaMotorista = safeIdx(r, map.saida_motorista);
    const entradaMotorista = safeIdx(r, map.entrada_motorista);
    const interjMotorista = safeIdx(r, map.interj_motorista);
    const obsMotorista = safeIdx(r, map.obs_motorista);

    const auxiliarName = safeIdx(r, map.auxiliar);
    const saidaAux = safeIdx(r, map.saida_aux);
    const entradaAux = safeIdx(r, map.entrada_aux);
    const interjAux = safeIdx(r, map.interj_aux);
    const obsAux = safeIdx(r, map.obs_aux);

    const base = { placa, rota, stat, _rowIndex: ri + 2, data_operacao: sheetDate };

    if(motoristaName && (''+motoristaName).trim() !== ''){
      currentRows.push(Object.assign({}, base, {
        role: 'MOTORISTA',
        nome: motoristaName,
        saida: saidaMotorista,
        entrada: entradaMotorista,
        interj: interjMotorista,
        obs: obsMotorista
      }));
    }
    if(auxiliarName && (''+auxiliarName).trim() !== ''){
      currentRows.push(Object.assign({}, base, {
        role: 'AUXILIAR',
        nome: auxiliarName,
        saida: saidaAux,
        entrada: entradaAux,
        interj: interjAux,
        obs: obsAux
      }));
    }
  });

  // sort by rota numeric where possible then role then name
  currentRows.forEach(rr => rr._rota_num = parseInt((''+(rr.rota||'')).replace(/[^0-9]/g,'')) || 999999);
  currentRows.sort((a,b)=> a._rota_num - b._rota_num || (a.role===b.role ? (''+a.nome).localeCompare(b.nome) : (a.role==='MOTORISTA'? -1:1) ));
  renderTable();
  renderSummary();
  document.getElementById('metaInfo').textContent = `${currentRows.length} registros carregados`;
});

function safeIdx(row, idx){
  if(!row) return '';
  if(idx === null || idx === undefined) return '';
  if(isNaN(idx)) return row[idx] || '';
  return row[idx] !== undefined ? row[idx] : '';
}

// --------- RENDER TABLE ----------
function renderTable(){
  const tbody = document.getElementById('tbody');
  tbody.innerHTML = '';
  const filter = document.getElementById('filterStat').value;
  const irrFilter = document.getElementById('filterIrregular').value;
  const specific = document.getElementById('filterSpecific').value;
  const query = (document.getElementById('searchBox').value || '').trim().toLowerCase();
  const actions = loadActions();
  let displayed = 0;

  currentRows.forEach((row, idx) => {
    // stat filter
    if(filter === 'viagem' && !['V','P','R','V-REST'].includes((''+row.stat).toUpperCase())) return;
    if(filter === 'bateevolta' && ['V','P','R','V-REST'].includes((''+row.stat).toUpperCase())) return;

    const issues = checkIssues({saida: row.saida, entrada: row.entrada, interj: row.interj});
    const hasIssue = issues.length > 0;

    if(irrFilter === 'only' && !hasIssue) return;
    if(irrFilter === 'ok' && hasIssue) return;
    if(irrFilter === 'semregistro' && !issues.some(it => it.text === 'SEM REGISTRO')) return;

    if(specific !== 'all'){
      const types = issues.map(i=>i.type);
      if(specific === 'saidaTardia' && !types.includes('SAIDA_TARDIA')) return;
      if(specific === 'entradaPrecoce' && !types.includes('ENTRADA_PRECOCE')) return;
      if(specific === 'interjCurta' && !types.includes('INTERJORNADA_CURTA')) return;
      if(specific === 'semRegistro' && !types.some(t => t.startsWith('SEM_REGISTRO'))) return;
    }

    if(query){
      const match = ((row.placa||'') + ' ' + (row.nome||'') + ' ' + (row.rota||'')).toLowerCase();
      if(!query.split(/\s+/).every(q => match.includes(q))) return;
    }

    displayed++;
    const hasSemRegistro = issues.some(i => i.text === 'SEM REGISTRO');
    const irrText = issues.length ? issues.map(i=>i.text).join(' | ') : 'OK';
    const finalStatusText = hasSemRegistro ? issues.map(i=>i.text).join(' | ') : (issues.length ? issues.map(i=>i.text).join(' | ') : 'OK');

    // last action for this collaborator+placa
    const acts = actions.filter(a => a.placa === row.placa && a.nome === row.nome);
    const last = acts.length ? acts.slice().reverse()[0] : null;

    const tr = document.createElement('tr');
    tr.innerHTML = [
      `<td class="checkbox-cell"><input class="rowSel" data-idx="${idx}" type="checkbox"></td>`,
      `<td>${escapeHtml(row.placa || '')}</td>`,
      `<td>${escapeHtml(row.rota || '')}</td>`,
      `<td class="role">${escapeHtml(row.stat || '')}</td>`,
      `<td>${escapeHtml(row.nome || '')} <div class="role">(${row.role})</div></td>`,
      `<td data-field="saida">${escapeHtml(row.saida || '')}</td>`,
      `<td data-field="entrada">${escapeHtml(row.entrada || '')}</td>`,
      `<td data-field="interj">${escapeHtml(row.interj || '')}</td>`,
      `<td data-field="status">${escapeHtml(finalStatusText)}</td>`,
      `<td data-field="last">${last ? escapeHtml(last.acao + ' — ' + (last.data_acao ? (last.data_acao + ' ' + (last.hora_acao||'')) : last.timestamp.split(',')[0]) + (last.data_infracao ? (' (Infração ' + last.data_infracao + ')') : '')) : '-'}</td>`,
      `<td><button class="action-btn" data-idx="${idx}">AÇÃO</button></td>`
    ].join('');

    // styling cells
    const saidaCell = tr.querySelector('[data-field="saida"]');
    const entradaCell = tr.querySelector('[data-field="entrada"]');
    const interCell = tr.querySelector('[data-field="interj"]');
    const statusCell = tr.querySelector('[data-field="status"]');

    // apply flags
    issues.forEach(issue=>{
      if(issue.type === 'SEM_REGISTRO_SAIDA') saidaCell.classList.add('sem');
      if(issue.type === 'SEM_REGISTRO_ENTRADA') entradaCell.classList.add('sem');
      if(issue.type === 'SEM_REGISTRO_INTERJ') interCell.classList.add('sem');
      if(issue.type === 'SAIDA_TARDIA') saidaCell.classList.add('err');
      if(issue.type === 'ENTRADA_PRECOCE') entradaCell.classList.add('err');
      if(issue.type === 'INTERJORNADA_CURTA') interCell.classList.add('err');
    });

    if(!hasIssue){
      saidaCell.classList.add('ok');
      entradaCell.classList.add('ok');
      interCell.classList.add('ok');
      statusCell.classList.add('ok');
    } else {
      // SEM REGISTRO always treated as irregularidade and displayed red (sem) as user requested
      if(hasSemRegistro){
        statusCell.classList.add('sem');
      } else {
        statusCell.classList.add('err');
      }
    }

    // tooltip on status to show details + history
    statusCell.style.cursor = 'pointer';
    statusCell.addEventListener('mouseenter', ev => {
      const tooltip = document.getElementById('tooltip');
      let html = `<div class="tooltip-title">${escapeHtml(row.nome)} — ${escapeHtml(row.placa)}</div>`;
      html += `<div class="tooltip-line">${hasIssue ? '<strong>Irregularidades:</strong> ' + escapeHtml(finalStatusText) : '<strong>OK</strong>'}</div>`;
      if(acts.length){
        html += '<div style="margin-top:8px;font-weight:700">Histórico de ações</div>';
        acts.slice().reverse().forEach(a=>{
          const tsText = (a.data_acao ? (a.data_acao + ' ' + (a.hora_acao||'')) : (a.timestamp || ''));
          const infText = a.data_infracao ? ('<div style="font-size:12px;color:#475569">Infração em: ' + escapeHtml(a.data_infracao) + '</div>') : '';
          html += `<div style="font-size:13px;margin-top:6px">${escapeHtml(a.acao)} — <span style="color:#475569">${escapeHtml(tsText)}</span>${infText}<div style="font-size:12px;color:#475569">${escapeHtml(a.observacao || '')}</div></div>`;
        });
      } else {
        html += '<div style="margin-top:8px;color:#475569">Sem ações registradas</div>';
      }
      tooltip.innerHTML = html;
      tooltip.style.display = 'block';
      const r = ev.target.getBoundingClientRect();
      tooltip.style.left = Math.min(window.innerWidth - 380, r.right + 12) + 'px';
      tooltip.style.top = (r.top + window.scrollY) + 'px';
    });
    statusCell.addEventListener('mouseleave', ()=>{ document.getElementById('tooltip').style.display = 'none'; });

    tbody.appendChild(tr);
  });

  if(displayed === 0 && currentRows.length === 0){
    document.getElementById('tbody').innerHTML = '<tr><td colspan="11" style="padding:40px; text-align:center; color:#6b7280">Nenhum dado carregado. Importe a planilha.</td></tr>';
  } else if(displayed === 0){
    document.getElementById('tbody').innerHTML = '<tr><td colspan="11" style="padding:40px; text-align:center; color:#6b7280">Nenhum resultado com estes filtros.</td></tr>';
  }

  // attach action button listeners
  document.querySelectorAll('.action-btn').forEach(btn=>{
    btn.addEventListener('click', e=>{
      const idx = parseInt(btn.dataset.idx,10);
      currentSelected = {row: currentRows[idx], idx};
      openModal(currentSelected.row);
    });
  });

  // selectAll
  const selAll = document.getElementById('selectAll');
  selAll.checked = false;
  selAll.onchange = () => {
    const checked = selAll.checked;
    document.querySelectorAll('.rowSel').forEach(cb => cb.checked = checked);
  };
}

// --------- MODAL ACTION ----------
function openModal(row){
  document.getElementById('modal').style.display = 'flex';
  document.getElementById('modalRowInfo').textContent = `${row.placa || ''} — ${row.nome || ''} (${row.role || ''})`;
  // build action options
  const sel = document.getElementById('actionSelect'); sel.innerHTML = '';
  ACTION_ORDER.forEach(a => {
    const o = document.createElement('option'); o.value = a; o.textContent = a; sel.appendChild(o);
  });
  document.getElementById('recommendedAction').textContent = recommendNextActionFor(row.nome, row.placa);
  document.getElementById('actionSelect').value = document.getElementById('recommendedAction').textContent || ACTION_ORDER[0];
  document.getElementById('actionNote').value = '';
}

document.getElementById('btnCloseModal').addEventListener('click', ()=>{ document.getElementById('modal').style.display = 'none'; });
document.getElementById('btnSaveAction').addEventListener('click', ()=>{
  if(!currentSelected) return alert('Nenhuma linha selecionada');
  const action = document.getElementById('actionSelect').value || ACTION_ORDER[0];
  const obs = document.getElementById('actionNote').value || '';
  const now = new Date();
  const ts = now.toLocaleString('pt-BR');
  const id = uid();
  addAction({
    id,
    timestamp: ts,
    placa: currentSelected.row.placa || '',
    rota: currentSelected.row.rota || '',
    stat: currentSelected.row.stat || '',
    nome: currentSelected.row.nome || '',
    role: currentSelected.row.role || '',
    acao: action,
    observacao: obs,
    data_infracao: currentSelected.row.data_operacao || '',
    data_acao: now.toLocaleDateString('pt-BR'),
    hora_acao: now.toLocaleTimeString('pt-BR')
  });
  document.getElementById('modal').style.display = 'none';
  renderTable(); renderSummary();
});

document.getElementById('btnRemoveAction').addEventListener('click', ()=>{
  if(!currentSelected) return alert('Nenhuma linha selecionada');
  // remove latest action for this name+placa
  const acts = loadActions().filter(a => a.placa === currentSelected.row.placa && a.nome === currentSelected.row.nome);
  if(acts.length === 0) return alert('Nenhuma ação para remover.');
  // remove last one
  const last = acts.slice().reverse()[0];
  if(!confirm('Remover a ação: ' + last.acao + ' — ' + last.timestamp + '?')) return;
  removeActionById(last.id);
  document.getElementById('modal').style.display = 'none';
  renderTable(); renderSummary();
});

function recommendNextActionFor(name, placa){
  if(!name) return ACTION_ORDER[0];
  const acts = loadActions().filter(a => a.nome === name && (!placa || a.placa === placa)).map(a => a.acao);
  if(acts.length === 0) return ACTION_ORDER[0];
  let max = -1;
  acts.forEach(x => { const i = ACTION_ORDER.indexOf(x); if(i > -1 && i > max) max = i; });
  return ACTION_ORDER[Math.min(max+1, ACTION_ORDER.length-1)];
}

// --------- SUMMARY ----------
function renderSummary(){
  const total = currentRows.length;
  const issuesTotal = currentRows.reduce((acc, r) => acc + (checkIssues({saida:r.saida, entrada:r.entrada, interj:r.interj}).length > 0 ? 1 : 0), 0);
  const motoristas = currentRows.filter(r => r.role === 'MOTORISTA').length;
  const auxiliares = currentRows.filter(r => r.role === 'AUXILIAR').length;
  document.getElementById('sumTotals').innerHTML = `Colaboradores: <strong>${total}</strong><div style="font-size:12px;color:#6b7280">Motoristas: ${motoristas} — Auxiliares: ${auxiliares}</div>`;
  // infractions counts
  let s19=0, e645=0, interj=0;
  currentRows.forEach(r=>{
    const iss = checkIssues({saida:r.saida, entrada:r.entrada, interj:r.interj});
    if(iss.find(i=>i.type==='SAIDA_TARDIA')) s19++;
    if(iss.find(i=>i.type==='ENTRADA_PRECOCE')) e645++;
    if(iss.find(i=>i.type==='INTERJORNADA_CURTA')) interj++;
  });
  document.getElementById('sumInfra').textContent = `Saída >19:20: ${s19} — Entrada <06:45: ${e645} — Interj <11h: ${interj}`;
  const acts = loadActions();
  document.getElementById('sumActions').textContent = `Total ações: ${acts.length}`;
  // detailed summary block
  const ds = document.getElementById('detailedSummary');
  ds.innerHTML = `Resumo Detalhado<br><small style="color:#475569">Saída após 19:20 — ${s19}; Entrada antes de 06:45 — ${e645}; Interjornada &lt;11h — ${interj}</small>`;
}

// --------- Export / Import JSON ----------
document.getElementById('btnExportJSON').addEventListener('click', ()=>{
  const data = { actions: loadActions() };
  const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'marquespan_actions.json'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
});

document.getElementById('btnImportJSON').addEventListener('click', ()=>{
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'application/json'; inp.onchange = e=>{
    const f = e.target.files[0]; if(!f) return;
    const r = new FileReader();
    r.onload = ev => {
      try{
        const obj = JSON.parse(ev.target.result);
        if(!obj.actions) return alert('JSON inválido (esperado campo actions).');
        saveActions(obj.actions);
        alert('Histórico importado com sucesso.');
        renderTable(); renderSummary();
      }catch(err){
        console.error(err);
        alert('Erro ao ler JSON.');
      }
    };
    r.readAsText(f);
  };
  inp.click();
});

// --------- Export PDF (misto) ----------
document.getElementById('btnExportPDF').addEventListener('click', ()=>{
  if(currentRows.length === 0) return alert('Nenhum dado para exportar.');
  const container = document.createElement('div');
  container.style.padding = '12px';
  container.style.fontSize = '12px';
  container.innerHTML = `
    <div style="text-align:center;margin-bottom:10px;border-bottom:3px solid ${'#0B6E46'};padding-bottom:8px">
      <div style="font-weight:800;color:${'#0B6E46'};font-size:18px">MARQUE<span style="color:${'#C5160A'}">SPAN</span></div>
      <div style="font-weight:700;margin-top:6px">Relatório de Controle de Jornada</div>
      <div style="color:#475569;margin-top:6px">Gerado em ${new Date().toLocaleString('pt-BR')} — ${currentRows.length} registros</div>
    </div>
  `;
  // table header
  let html = '<table style="width:100%;border-collapse:collapse;font-size:11px">';
  html += '<thead><tr><th style="border:1px solid #ddd;padding:6px">Placa</th><th style="border:1px solid #ddd;padding:6px">Rota</th><th style="border:1px solid #ddd;padding:6px">Nome</th><th style="border:1px solid #ddd;padding:6px">Função</th><th style="border:1px solid #ddd;padding:6px">Saída</th><th style="border:1px solid #ddd;padding:6px">Entrada</th><th style="border:1px solid #ddd;padding:6px">Interj.</th><th style="border:1px solid #ddd;padding:6px">Status</th></tr></thead>';
  html += '<tbody>';
  const actions = loadActions();
  currentRows.forEach(r=>{
    const iss = checkIssues({saida:r.saida, entrada:r.entrada, interj:r.interj});
    const hasSemRegistro = iss.some(i=>i.text === 'SEM REGISTRO');
    const finalStatusText = hasSemRegistro ? iss.map(i=>i.text).join(' | ') : (iss.length ? iss.map(i=>i.text).join(' | ') : 'OK');
    const last = actions.filter(a => a.placa === r.placa && a.nome === r.nome);
    const lastObj = last.length ? last.slice().reverse()[0] : null;
    const lastTxt = lastObj ? (lastObj.acao + ' ' + (lastObj.data_acao ? (lastObj.data_acao + ' ' + (lastObj.hora_acao||'')) : (lastObj.timestamp||'')) + (lastObj.data_infracao ? (' | Infração ' + lastObj.data_infracao) : '')) : '';
    html += `<tr><td style="border:1px solid #ddd;padding:6px">${escapeHtml(r.placa||'')}</td><td style="border:1px solid #ddd;padding:6px">${escapeHtml(r.rota||'')}</td><td style="border:1px solid #ddd;padding:6px">${escapeHtml(r.nome||'')}</td><td style="border:1px solid #ddd;padding:6px">${escapeHtml(r.role||'')}</td><td style="border:1px solid #ddd;padding:6px">${escapeHtml(r.saida||'')}</td><td style="border:1px solid #ddd;padding:6px">${escapeHtml(r.entrada||'')}</td><td style="border:1px solid #ddd;padding:6px">${escapeHtml(r.interj||'')}</td><td style="border:1px solid #ddd;padding:6px">${escapeHtml(finalStatusText)} ${escapeHtml(lastTxt?(' | ' + lastTxt):'')}</td></tr>`;
  });
  html += '</tbody></table>';
  container.innerHTML += html;

  const opt = {
    margin:[8,8,8,8],
    filename:`Relatorio_Jornada_${new Date().toISOString().split('T')[0]}.pdf`,
    image:{type:'jpeg', quality:0.98},
    html2canvas:{scale:2, useCORS:true},
    jsPDF:{unit:'mm', format:'a4', orientation:'landscape'}
  };
  html2pdf().set(opt).from(container).save();
});

// --------- Export Excel ----------
document.getElementById('btnExportExcel').addEventListener('click', ()=>{
  if(currentRows.length === 0) return alert('Sem dados para exportar.');
  const out = [];
  const actions = loadActions();
  currentRows.forEach(r=>{
    const iss = checkIssues({saida:r.saida, entrada:r.entrada, interj:r.interj});
    const hasSemRegistro = iss.some(i=>i.text === 'SEM REGISTRO');
    const finalStatusText = hasSemRegistro ? iss.map(i=>i.text).join(' | ') : (iss.length ? iss.map(i=>i.text).join(' | ') : 'OK');
    const rel = actions.filter(a=>a.placa===r.placa && a.nome===r.nome).map(a=> (a.acao + (a.data_infracao ? (' | Infração ' + a.data_infracao) : '') + ' — ' + (a.data_acao ? (a.data_acao + ' ' + (a.hora_acao||'')) : a.timestamp)) ).join(' | ');
    out.push({Placa:r.placa,Rota:r.rota,Nome:r.nome,Função:r.role,Saída:r.saida,Entrada:r.entrada,Interj:r.interj,Irregularidades:finalStatusText,Ações:rel});
  });
  const ws = XLSX.utils.json_to_sheet(out);
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Controle'); XLSX.writeFile(wb, 'Controle_Jornada_Export.xlsx');
});

// --------- UTILS / EVENTS ----------
document.getElementById('filterStat').addEventListener('change', renderTable);
document.getElementById('filterIrregular').addEventListener('change', renderTable);
document.getElementById('filterSpecific').addEventListener('change', renderTable);
document.getElementById('searchBox').addEventListener('input', () => setTimeout(renderTable, 80));

// hide tooltip on scroll
window.addEventListener('scroll', ()=> document.getElementById('tooltip').style.display = 'none');

// initialize empty summary
renderTable();
renderSummary();