'use strict';

const SB_URL='https://bdqvhpuzricmpfkomnli.supabase.co';
const SB_KEY='sb_publishable_NC1WUyEGSlZfgfyQR7JBxA_AM14sz39';
const SESSION_KEY='fd_mobile_supabase_session_v1';
const CACHE_KEY='fd_mobile_mainline_cache_v1';
const QUOTE_KEY='fd_mobile_quote_cache_v1';
const DEVICE_KEY='fd_mobile_device_id_v1';
const HISTORY_LIMIT=10;

const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];
const clone=v=>JSON.parse(JSON.stringify(v));
const finite=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));
const pos=v=>finite(v)&&Number(v)>0;
const money=v=>finite(v)?Number(v).toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2}):'--';
const navfmt=v=>finite(v)?Number(v).toFixed(4):'--';
const pct=v=>finite(v)?`${Number(v)>0?'+':''}${Number(v).toFixed(2)}%`:'--';
const tone=v=>!finite(v)||Number(v)===0?'flat':Number(v)>0?'up':'down';
const fmtTime=v=>{const d=new Date(v);if(!v||Number.isNaN(d.getTime()))return'--';const z=n=>String(n).padStart(2,'0');return`${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())} ${z(d.getHours())}:${z(d.getMinutes())}:${z(d.getSeconds())}`;};
const esc=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const typeLabel=t=>({equity:'偏股',index:'指数',flexBond:'固收+',shortBond:'短债'})[t]||t||'--';

let state={session:null,current:null,history:[],cores:[],quotes:{},busy:false};
let installPrompt=null;

function toast(msg,ms=2200){const e=$('#toast');e.textContent=msg;e.classList.remove('hidden');clearTimeout(toast.t);toast.t=setTimeout(()=>e.classList.add('hidden'),ms);}
function deviceId(){let id=localStorage.getItem(DEVICE_KEY);if(!id){id=`mobile-${crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+Math.random().toString(36).slice(2)}`;localStorage.setItem(DEVICE_KEY,id);}return id;}
function ledgerCores(row){const l=row?.ledger;if(Array.isArray(l))return l;if(Array.isArray(l?.cores))return l.cores;if(Array.isArray(l?.portfolio))return l.portfolio;return[];}
function currentAmount(core,q){if(pos(core?.shares)&&pos(q?.officialNav))return Number(core.shares)*Number(q.officialNav);if(finite(core?.amountAnchor))return Number(core.amountAnchor);return 0;}
function pendingCount(core){return (Array.isArray(core?.pendingTrades)?core.pendingTrades:[]).filter(t=>!t.applied).length;}
function coreProfit(core,q){return currentAmount(core,q)-Math.max(0,Number(core?.cost||0));}
function coreFingerprint(cores=[]){const clean=(Array.isArray(cores)?cores:[]).map(c=>({code:String(c.code||''),name:String(c.name||''),type:String(c.type||'index'),enabled:c.enabled!==false,cost:Math.max(0,Number(c.cost||0)),shares:finite(c.shares)?Number(c.shares):null,amountAnchor:pos(c.shares)?null:(finite(c.amountAnchor)?Math.max(0,Number(c.amountAnchor)):null),startDate:c.startDate||null,pendingTrades:(Array.isArray(c.pendingTrades)?c.pendingTrades:[]).slice(-50).map(t=>({id:String(t.id||''),date:String(t.date||''),action:String(t.action||''),amount:Number(t.amount||0),feeRate:Number(t.feeRate||0),applied:Boolean(t.applied),appliedNav:finite(t.appliedNav)?Number(t.appliedNav):null,appliedDate:t.appliedDate||null,approximate:Boolean(t.approximate),deferredAccounting:Boolean(t.deferredAccounting),createdAt:t.createdAt||null})),createdByQuickTrade:Boolean(c.createdByQuickTrade)})).sort((a,b)=>a.code.localeCompare(b.code));return JSON.stringify(clean);}
function ledgerFromCores(cores){return{schema:1,cores:clone(cores)};}

function saveCache(){if(state.current)localStorage.setItem(CACHE_KEY,JSON.stringify({current:state.current,history:state.history,at:Date.now()}));localStorage.setItem(QUOTE_KEY,JSON.stringify(state.quotes||{}));}
function loadCache(){try{const c=JSON.parse(localStorage.getItem(CACHE_KEY)||'null');if(c?.current){state.current=c.current;state.history=c.history||[];state.cores=ledgerCores(c.current);}state.quotes=JSON.parse(localStorage.getItem(QUOTE_KEY)||'{}')||{};}catch(_){}}

async function sbFetch(path,{method='GET',body=null,auth=true,retry=true}={}){
  if(auth)await validSession();
  const headers={'apikey':SB_KEY};
  if(auth&&state.session?.accessToken)headers.Authorization=`Bearer ${state.session.accessToken}`;
  if(body!==null)headers['Content-Type']='application/json';
  let r;
  try{r=await fetch(`${SB_URL}${path}`,{method,headers,...(body!==null?{body:JSON.stringify(body)}:{})});}catch(e){throw new Error('无法连接公共云端，请检查网络或 VPN');}
  if(r.status===401&&auth&&retry){await refreshSession();return sbFetch(path,{method,body,auth,retry:false});}
  const text=await r.text();let data=null;if(text){try{data=JSON.parse(text);}catch(_){data=text;}}
  if(!r.ok){const msg=(data&&typeof data==='object'&&(data.message||data.msg||data.error_description||data.error))||String(data||`HTTP ${r.status}`);const e=new Error(msg);e.code=String(msg).includes('revision_conflict')?'revision_conflict':`http_${r.status}`;throw e;}
  return data;
}
async function login(email,password){
  let r;try{r=await fetch(`${SB_URL}/auth/v1/token?grant_type=password`,{method:'POST',headers:{apikey:SB_KEY,'Content-Type':'application/json'},body:JSON.stringify({email,password})});}catch(_){throw new Error('无法连接 Supabase，请检查网络或 VPN');}
  const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data?.msg||data?.message||'邮箱或密码错误');storeSession(data);await loadCloud();
}
function storeSession(raw){state.session={accessToken:raw.access_token,refreshToken:raw.refresh_token,expiresAt:raw.expires_at?Number(raw.expires_at)*1000:Date.now()+Number(raw.expires_in||3600)*1000,user:raw.user||state.session?.user||{}};localStorage.setItem(SESSION_KEY,JSON.stringify(state.session));}
function clearSession(){state.session=null;localStorage.removeItem(SESSION_KEY);}
async function refreshSession(){if(!state.session?.refreshToken){clearSession();throw new Error('登录已失效');}const r=await fetch(`${SB_URL}/auth/v1/token?grant_type=refresh_token`,{method:'POST',headers:{apikey:SB_KEY,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:state.session.refreshToken})});const d=await r.json().catch(()=>({}));if(!r.ok){clearSession();throw new Error('登录已失效，请重新登录');}storeSession(d);}
async function validSession(){if(!state.session)throw new Error('请先登录');if(Number(state.session.expiresAt||0)<Date.now()+90000)await refreshSession();return state.session;}

async function fetchCurrent(){const d=await sbFetch('/rest/v1/fund_ledger_current?select=user_id,revision,ledger,operation,device_id,device_name,updated_at&limit=1');return Array.isArray(d)?d[0]||null:null;}
async function fetchHistory(){const d=await sbFetch('/rest/v1/fund_ledger_history?select=id,revision,ledger,operation,device_id,device_name,created_at&order=revision.desc&limit=10');return Array.isArray(d)?d:[];}
async function rpc(name,body){const d=await sbFetch(`/rest/v1/rpc/${name}`,{method:'POST',body});return Array.isArray(d)?d[0]||null:d;}
async function loadCloud(){
  try{const [c,h]=await Promise.all([fetchCurrent(),fetchHistory()]);state.current=c;state.history=h;state.cores=ledgerCores(c);saveCache();render();return true;}
  catch(e){if(state.current){render();setStatus(`离线缓存 · ${e.message}`,'bad');return false;}throw e;}
}
async function commit(nextCores,operation){
  if(!state.current)throw new Error('公共云端主线不存在');
  const expected=Number(state.current.revision||0);
  const row=await rpc('commit_fund_ledger',{p_expected_revision:expected,p_ledger:ledgerFromCores(nextCores),p_operation:operation,p_device_id:deviceId(),p_device_name:'手机网页版'});
  state.current=row;state.cores=ledgerCores(row);state.history=await fetchHistory();saveCache();render();return row;
}
async function restoreHistory(id){
  const row=await rpc('restore_fund_ledger',{p_history_id:id,p_expected_revision:Number(state.current?.revision||0),p_device_id:deviceId(),p_device_name:'手机网页版'});
  state.current=row;state.cores=ledgerCores(row);state.history=await fetchHistory();saveCache();render();
}

function setStatus(text,kind='ok'){const c=$('#statusCard');c.className=`status-card ${kind}`;$('#cloudStatus').textContent=text;$('#mainlineTime').textContent=state.current?fmtTime(state.current.updated_at):'--';}
function render(){
  const logged=Boolean(state.session);$('#loginView').classList.toggle('hidden',logged);$('#appView').classList.toggle('hidden',!logged);$('#bottomNav').classList.toggle('hidden',!logged);if(!logged)return;
  setStatus(state.current?'公共云端最新主线已连接':'公共云端没有主线',state.current?'ok':'bad');
  const enabled=state.cores.filter(c=>c.enabled!==false);let total=0,cost=0,covered=0;
  for(const c of enabled){const q=state.quotes[c.code]||{};const amt=currentAmount(c,q);total+=amt;cost+=Math.max(0,Number(c.cost||0));if(pos(q.officialNav)||finite(c.amountAnchor))covered++;}
  $('#totalAmount').textContent=`¥${money(total)}`;const profit=total-cost;$('#totalProfit').textContent=`${profit>=0?'+':''}${money(profit)}`;$('#totalProfit').className=tone(profit);$('#quoteCoverage').textContent=`净值覆盖 ${enabled.length?Math.round(covered/enabled.length*100):0}%`;$('#fundCount').textContent=String(enabled.length);$('#historyCount').textContent=`${state.history.length}/${HISTORY_LIMIT}`;
  renderFunds();renderTradeSelect();saveCache();
}
function renderFunds(){const list=$('#fundList');const arr=state.cores.filter(c=>c.enabled!==false);$('#emptyFunds').classList.toggle('hidden',arr.length>0);list.innerHTML=arr.map(c=>{const q=state.quotes[c.code]||{},amt=currentAmount(c,q),profit=coreProfit(c,q),pend=pendingCount(c);const est=finite(q.estPct)?Number(q.estPct):null;return `<article class="fund-card"><div class="fund-top"><div><div class="fund-name">${esc(c.name||c.code)}</div><div class="fund-code">${esc(c.code)} · ${esc(typeLabel(c.type))}</div></div><div class="fund-amount">¥${money(amt)}</div></div><div class="fund-grid"><div><span>累计收益</span><b class="${tone(profit)}">${profit>=0?'+':''}${money(profit)}</b></div><div><span>最新净值</span><b>${navfmt(q.officialNav)}</b></div><div><span>盘中参考</span><b class="${tone(est)}">${pct(est)}</b></div></div>${pend?`<div class="pending">有 ${pend} 笔待确认操作；刷新正式净值后会尝试确认。</div>`:''}</article>`;}).join('');}
function renderTradeSelect(){const s=$('#tradeCode');if(!s)return;s.innerHTML=state.cores.filter(c=>c.enabled!==false).map(c=>`<option value="${esc(c.code)}">${esc(c.code)} ${esc(c.name||'')}</option>`).join('');}

function openSheet(id){$('#sheetBackdrop').classList.remove('hidden');$(`#${id}`).classList.remove('hidden');document.body.style.overflow='hidden';}
function closeSheets(){$('#sheetBackdrop').classList.add('hidden');$$('.sheet').forEach(x=>x.classList.add('hidden'));document.body.style.overflow='';}

function scriptLoad(src,timeout=8000){return new Promise((resolve,reject)=>{const s=document.createElement('script');let done=false;const finish=(ok,e)=>{if(done)return;done=true;clearTimeout(t);s.remove();ok?resolve():reject(e||new Error('数据源加载失败'));};s.src=src;s.async=true;s.onload=()=>finish(true);s.onerror=()=>finish(false,new Error('数据源加载失败'));const t=setTimeout(()=>finish(false,new Error('数据源超时')),timeout);document.head.appendChild(s);});}
async function fetchStaticQuote(code){
  try{delete window.fS_name;delete window.fS_code;delete window.Data_netWorthTrend;}catch(_){}
  await scriptLoad(`https://fund.eastmoney.com/pingzhongdata/${encodeURIComponent(code)}.js?v=${Date.now()}`);
  const trend=window.Data_netWorthTrend;if(!Array.isArray(trend)||!trend.length)throw new Error('正式净值解析失败');const last=trend[trend.length-1]||{};const d=new Date(Number(last.x));const z=n=>String(n).padStart(2,'0');const officialDate=Number.isNaN(d.getTime())?'':`${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}`;return{name:String(window.fS_name||''),officialNav:Number(last.y),officialDate,officialPct:finite(last.equityReturn)?Number(last.equityReturn):null};
}
async function fetchIntradayQuote(code){
  return new Promise((resolve,reject)=>{const old=window.jsonpgz;let done=false;const s=document.createElement('script');const finish=(err,row)=>{if(done)return;done=true;clearTimeout(t);s.remove();window.jsonpgz=old;if(err)reject(err);else resolve(row);};window.jsonpgz=row=>finish(null,{name:row?.name||'',estNav:finite(row?.gsz)?Number(row.gsz):null,estPct:finite(row?.gszzl)?Number(row.gszzl):null,estTime:row?.gztime||'',officialNav:finite(row?.dwjz)?Number(row.dwjz):null,officialDate:row?.jzrq||''});s.src=`https://fundgz.1234567.com.cn/js/${encodeURIComponent(code)}.js?rt=${Date.now()}`;s.onerror=()=>finish(new Error('盘中估值加载失败'));const t=setTimeout(()=>finish(new Error('盘中估值超时')),6500);document.head.appendChild(s);});
}
function applyPending(core,officialNav,officialDate){
  if(!pos(officialNav)||!officialDate)return{core,changed:false};const n=clone(core),list=Array.isArray(n.pendingTrades)?n.pendingTrades:[];if(!list.length)return{core:n,changed:false};let shares=finite(n.shares)?Number(n.shares):(finite(n.amountAnchor)?Number(n.amountAnchor)/officialNav:NaN),cost=Math.max(0,Number(n.cost||0)),changed=false;
  n.pendingTrades=list.map(t=>{if(t.applied||t.date!==officialDate||!Number.isFinite(shares))return t;if(t.action==='buy'){const fee=Math.max(0,Number(t.feeRate||0))/100,gross=Math.max(0,Number(t.amount||0));shares+=gross/(1+fee)/officialNav;cost+=gross;changed=true;return{...t,applied:true,appliedNav:officialNav,appliedDate:officialDate,deferredAccounting:true};}if(t.action==='sell'){const gross=Math.max(0,Number(t.amount||0)),before=shares,sold=Math.min(before,gross/officialNav);shares=Math.max(0,before-sold);if(before>0)cost*=shares/before;changed=true;return{...t,applied:true,appliedNav:officialNav,appliedDate:officialDate,approximate:true,deferredAccounting:true};}if(t.action==='clear'){shares=0;cost=0;changed=true;return{...t,applied:true,appliedNav:officialNav,appliedDate:officialDate,approximate:false,deferredAccounting:true};}return t;}).slice(-30);
  if(changed){n.shares=shares;n.cost=Math.max(0,cost);n.amountAnchor=null;n.updatedAt=Date.now();}return{core:n,changed};
}
async function quoteOne(core){let official=null,intra=null;try{official=await fetchStaticQuote(core.code);}catch(_){ }try{intra=await fetchIntradayQuote(core.code);}catch(_){ }const q={...(state.quotes[core.code]||{}),name:official?.name||intra?.name||core.name,officialNav:official?.officialNav||intra?.officialNav||null,officialDate:official?.officialDate||intra?.officialDate||'',officialPct:official?.officialPct??null,estNav:intra?.estNav??null,estPct:intra?.estPct??null,estTime:intra?.estTime||'',fetchedAt:Date.now()};state.quotes[core.code]=q;return q;}
async function refreshQuotes(){
  if(state.busy)return;state.busy=true;const b=$('#refreshBtn');b.disabled=true;b.textContent='刷新中…';const before=coreFingerprint(state.cores);let confirmed=0;
  try{const next=clone(state.cores);for(let i=0;i<next.length;i++){if(next[i].enabled===false)continue;const q=await quoteOne(next[i]);const a=applyPending(next[i],q.officialNav,q.officialDate);if(a.changed){next[i]=a.core;confirmed++;}}
    state.cores=next;$('#lastQuoteTime').textContent=`最近刷新 ${fmtTime(Date.now())}`;if(coreFingerprint(next)!==before){await commit(next,`手机版正式净值确认交易 / 更新持有份额（${confirmed}只基金）`);toast(`已确认 ${confirmed} 只基金的待确认操作`);}else{saveCache();render();toast('净值刷新完成');}
  }catch(e){if(e.code==='revision_conflict'){await loadCloud();toast('云端已被其他设备更新，本次确认未覆盖云端',3500);}else toast(e.message,3500);}finally{state.busy=false;b.disabled=false;b.innerHTML='<span>↻</span>刷新净值';}
}

async function saveTrade(){const code=$('#tradeCode').value,action=$('#tradeAction').value,amount=Math.max(0,Number($('#tradeAmount').value||0)),date=$('#tradeDate').value;if(!code||!date)return toast('请选择基金和日期');if(action!=='clear'&&!(amount>0))return toast('请输入操作金额');const next=clone(state.cores),c=next.find(x=>x.code===code);if(!c)return toast('基金不存在');c.pendingTrades=Array.isArray(c.pendingTrades)?c.pendingTrades:[];c.pendingTrades.push({id:`m_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,date,action,amount,feeRate:0,applied:false,deferredAccounting:true,createdAt:new Date().toISOString()});c.updatedAt=Date.now();try{await commit(next,`${action==='buy'?'买入/加仓':action==='sell'?'卖出/减仓':'清仓'} ${c.name||c.code}${action==='clear'?'':` ¥${amount.toFixed(2)}`}`);closeSheets();toast('操作已写入公共云端，等待正式净值确认');}catch(e){if(e.code==='revision_conflict'){await loadCloud();toast('电脑/其他手机已更新云端，请重新操作',3500);}else toast(e.message,3500);}}

async function lookupAdd(){const code=$('#addCode').value.trim();if(!/^\d{6}$/.test(code))return toast('请输入6位基金代码');const b=$('#lookupAddBtn');b.disabled=true;b.textContent='识别中…';try{const q=await fetchStaticQuote(code);state.quotes[code]={...(state.quotes[code]||{}),...q,fetchedAt:Date.now()};if(q.name)$('#addName').value=q.name;toast(`最新净值 ${navfmt(q.officialNav)} · ${q.officialDate||'--'}`);}catch(e){toast(e.message,3000);}finally{b.disabled=false;b.textContent='识别名称 / 最新净值';}}
async function saveAdd(){const code=$('#addCode').value.trim(),name=$('#addName').value.trim(),type=$('#addType').value,shares=$('#addShares').value===''?null:Number($('#addShares').value),cost=Math.max(0,Number($('#addCost').value||0)),amount=$('#addAmount').value===''?null:Math.max(0,Number($('#addAmount').value));if(!/^\d{6}$/.test(code))return toast('请输入6位基金代码');if(state.cores.some(c=>c.code===code))return toast('这只基金已经存在');if(!name)return toast('请填写基金名称');if(shares!==null&&!Number.isFinite(shares))return toast('持有份额格式不正确');const next=clone(state.cores);next.push({code,name,type,enabled:true,cost,shares,amountAnchor:shares!==null&&shares>0?null:(amount??0),startDate:new Date().toISOString().slice(0,10),pendingTrades:[],createdByQuickTrade:false,updatedAt:Date.now()});try{await commit(next,`手机版新增基金 ${code} ${name}`);closeSheets();toast('基金已添加并写入公共云端');}catch(e){if(e.code==='revision_conflict'){await loadCloud();toast('云端已更新，请重新添加',3500);}else toast(e.message,3500);}}

function renderEdit(){const box=$('#editList');box.innerHTML=state.cores.map((c,i)=>`<div class="edit-row" data-i="${i}"><div class="edit-row-head"><div><b>${esc(c.code)} ${esc(c.name||'')}</b><div class="fund-code">${esc(typeLabel(c.type))}</div></div><button class="delete-fund" data-delete="${i}">删除</button></div><div class="edit-fields"><div><label>持有份额</label><input data-k="shares" type="number" step="0.0001" value="${finite(c.shares)?esc(String(c.shares)):''}"></div><div><label>累计成本</label><input data-k="cost" type="number" step="0.01" value="${esc(String(Number(c.cost||0)))}"></div></div><label>名称</label><input data-k="name" value="${esc(c.name||'')}"><label>类型</label><select data-k="type"><option value="index" ${c.type==='index'?'selected':''}>指数</option><option value="equity" ${c.type==='equity'?'selected':''}>偏股</option><option value="flexBond" ${c.type==='flexBond'?'selected':''}>固收+</option><option value="shortBond" ${c.type==='shortBond'?'selected':''}>短债</option></select></div>`).join('');}
function editDraft(){const out=[];$$('#editList .edit-row').forEach(r=>{const i=Number(r.dataset.i),c=clone(state.cores[i]);if(!c)return;r.querySelectorAll('[data-k]').forEach(el=>{const k=el.dataset.k;if(k==='shares')c[k]=el.value===''?null:Number(el.value);else if(k==='cost')c[k]=Math.max(0,Number(el.value||0));else c[k]=el.value;});if(pos(c.shares))c.amountAnchor=null;c.updatedAt=Date.now();out.push(c);});return out;}
async function saveEdit(){const next=editDraft();try{await commit(next,'手机版修改持仓设置');closeSheets();toast('持仓设置已保存');}catch(e){if(e.code==='revision_conflict'){await loadCloud();toast('云端已被其他设备更新，请重新修改',3500);}else toast(e.message,3500);}}

function renderHistory(){const box=$('#historyList');box.innerHTML=state.history.length?state.history.map(h=>`<div class="history-item"><div class="history-top"><div class="history-time">${esc(fmtTime(h.created_at))}</div><div>${ledgerCores(h).length}只基金</div></div><div class="history-meta">${esc(h.operation||'历史版本')} · ${esc(h.device_name||'')}</div><div class="history-actions"><button data-restore="${esc(h.id)}" data-time="${esc(h.created_at||'')}">设为最新主线</button></div></div>`).join(''):'<div class="empty">还没有历史版本。</div>';}

async function exportMainline(){if(!state.current)return;const data={format:'fund-dashboard-mobile-mainline-v1',exportedAt:new Date().toISOString(),provider:'Supabase',meta:{revision:state.current.revision,updatedAt:state.current.updated_at,operation:state.current.operation,deviceName:state.current.device_name},ledger:state.current.ledger};const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`基金看板-云端主线-${fmtTime(state.current.updated_at).replace(/[: ]/g,'-')}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
async function logout(){try{if(state.session?.accessToken)await fetch(`${SB_URL}/auth/v1/logout`,{method:'POST',headers:{apikey:SB_KEY,Authorization:`Bearer ${state.session.accessToken}`}});}catch(_){}clearSession();state.current=null;state.history=[];state.cores=[];render();}

function bind(){
  $('#loginBtn').onclick=async()=>{const b=$('#loginBtn');b.disabled=true;b.textContent='登录中…';try{await login($('#emailInput').value.trim(),$('#passwordInput').value);$('#passwordInput').value='';toast('登录成功');refreshQuotes();}catch(e){toast(e.message,3500);}finally{b.disabled=false;b.textContent='登录公共云端';}};
  $('#passwordInput').addEventListener('keydown',e=>{if(e.key==='Enter')$('#loginBtn').click();});
  $('#refreshBtn').onclick=refreshQuotes;$('#tradeBtn').onclick=()=>openSheet('tradeSheet');$('#addBtn').onclick=()=>openSheet('addSheet');$('#historyBtn').onclick=()=>{renderHistory();openSheet('historySheet');};$('#editBtn').onclick=()=>{renderEdit();openSheet('editSheet');};$('#moreBtn').onclick=()=>openSheet('moreSheet');
  $('#tradeAction').onchange=()=>$('#tradeAmountWrap').classList.toggle('hidden',$('#tradeAction').value==='clear');$('#saveTradeBtn').onclick=saveTrade;$('#lookupAddBtn').onclick=lookupAdd;$('#saveAddBtn').onclick=saveAdd;$('#saveEditBtn').onclick=saveEdit;$('#exportBtn').onclick=exportMainline;$('#logoutBtn').onclick=logout;$('#sheetBackdrop').onclick=closeSheets;$$('[data-close]').forEach(b=>b.onclick=closeSheets);
  $('#editList').addEventListener('click',e=>{const b=e.target.closest('[data-delete]');if(!b)return;if(!confirm('确定删除这只基金？保存后会生成新的云端主线，旧主线仍会进入最近10次历史。'))return;const r=b.closest('.edit-row');r.remove();});
  $('#historyList').addEventListener('click',async e=>{const b=e.target.closest('[data-restore]');if(!b)return;if(!confirm(`确定把 ${fmtTime(b.dataset.time)} 的内容设为新的最新主线吗？\n\n当前主线会先进入历史，所以这次回溯仍然可以反悔。`))return;try{await restoreHistory(b.dataset.restore);renderHistory();toast('历史版本已生成新的最新主线');}catch(err){if(err.code==='revision_conflict'){await loadCloud();renderHistory();toast('云端已被其他设备更新，请重新选择历史版本',3500);}else toast(err.message,3500);}});
  $$('#bottomNav [data-nav]').forEach(b=>b.onclick=()=>{const n=b.dataset.nav;if(n==='home')window.scrollTo({top:0,behavior:'smooth'});if(n==='trade')openSheet('tradeSheet');if(n==='history'){renderHistory();openSheet('historySheet');}if(n==='settings')openSheet('moreSheet');});
  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;$('#installBtn').classList.remove('hidden');});$('#installBtn').onclick=async()=>{if(!installPrompt)return toast('请使用浏览器菜单里的“添加到主屏幕”');installPrompt.prompt();await installPrompt.userChoice;installPrompt=null;$('#installBtn').classList.add('hidden');};
  window.addEventListener('online',()=>{if(state.session)loadCloud().then(()=>toast('网络已恢复，主线已刷新')).catch(()=>{});});
}

async function start(){
  bind();loadCache();try{state.session=JSON.parse(localStorage.getItem(SESSION_KEY)||'null');}catch(_){state.session=null;}
  const today=new Date();$('#tradeDate').value=`${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  render();
  if(state.session){try{await loadCloud();refreshQuotes();}catch(e){render();setStatus(`离线缓存 · ${e.message}`,'bad');toast('公共云端暂时不可达，先显示手机缓存',3500);}}
  if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
}
start();
