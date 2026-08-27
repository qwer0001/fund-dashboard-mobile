'use strict';

const SB_URL='https://bdqvhpuzricmpfkomnli.supabase.co';
const SB_KEY='sb_publishable_NC1WUyEGSlZfgfyQR7JBxA_AM14sz39';
const FN_URL=`${SB_URL}/functions/v1/fund-quotes`;
const SESSION_KEY='fd_mobile_supabase_session_v1';
const PRIVACY_MIGRATION_KEY='fd_private_login_guard_v236_once';
const TRUSTED_DEVICE_KEY='fd_mobile_trusted_login_v236';
const CACHE_KEY='fd_mobile_desktop_parity_cache_v230';
const QUOTE_KEY='fd_mobile_quote_cache_v230';
const MARKET_KEY='fd_mobile_market_cache_v2';
const DEVICE_KEY='fd_mobile_device_id_v1';
const QUOTE_BUNDLE_AT_KEY='fd_mobile_quote_bundle_at_v1';
const TREND_CACHE_PREFIX='fd_mobile_trend_cache_v1_';
const QUOTE_CACHE_TTL=10*60*1000;
const TREND_CACHE_TTL=6*60*60*1000;
const HISTORY_LIMIT=30;
function cnClock(){const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Shanghai',weekday:'short',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(new Date());const o={};for(const p of parts)o[p.type]=p.value;return {weekday:o.weekday||'',hour:Number(o.hour||0),minute:Number(o.minute||0)};}
function isCnTradingAutoWindow(){const c=cnClock();if(['Sat','Sun'].includes(c.weekday))return false;const mins=c.hour*60+c.minute;return mins>=9*60+15&&mins<15*60;}


const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const clone=v=>JSON.parse(JSON.stringify(v));
const finite=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));
const pos=v=>finite(v)&&Number(v)>0;
const fmtMoney=(n,sign=false)=>{if(!finite(n))return'--';const v=Number(n);return`${sign&&v>0?'+':''}${v.toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2})}`};
const fmtPct=n=>finite(n)?`${Number(n)>0?'+':''}${Number(n).toFixed(2)}%`:'--';
const navFmt=n=>finite(n)?Number(n).toFixed(4):'--';
const cls=n=>!finite(n)||Number(n)===0?'flat':Number(n)>0?'up':'down';
const esc=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const typeLabel={equity:'偏股',index:'指数',flexBond:'固收+',shortBond:'短债'};
const tradeLabel={buy:'买入',sell:'卖出',clear:'清仓'};
const fmtTime=v=>{const d=new Date(Number(v)||v);if(!v||Number.isNaN(d.getTime()))return'--';const z=n=>String(n).padStart(2,'0');return`${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())} ${z(d.getHours())}:${z(d.getMinutes())}:${z(d.getSeconds())}`};
const shortDate=s=>/^\d{4}-\d{2}-\d{2}$/.test(String(s||''))?String(s).slice(5):String(s||'');

let state={session:null,authenticated:false,current:null,history:[],cores:[],quotes:{},markets:{},lastSyncAt:null,sourceStatus:null,marketError:null,busy:false};
let currentFilter='all';
let trendState={code:null,name:null,rows:[],trades:[],range:'1m'};
let selectedTradeFund=null;

function tradeFundAmount(c){return c?currentAmount(c,state.quotes[c.code]||{}):null;}
function tradeFunds(){return state.cores.filter(c=>c&&c.enabled!==false&&/^\d{6}$/.test(String(c.code||''))&&shouldShowFundInMain(c)).slice().sort((a,b)=>Number(tradeFundAmount(b)||0)-Number(tradeFundAmount(a)||0));}
function renderTradeFundSelect(){
  const sel=$('#tradeFundSelect');if(!sel)return;
  const prev=sel.value;
  const list=tradeFunds();
  sel.innerHTML='<option value="">选择已有基金</option>'+list.map(c=>`<option value="${esc(c.code)}">${esc(c.name||c.code)}（${esc(c.code)}）</option>`).join('')+'<option value="__new__">＋ 新基金</option>';
  if(prev&&[...sel.options].some(o=>o.value===prev))sel.value=prev;
  else if(selectedTradeFund&&[...sel.options].some(o=>o.value===String(selectedTradeFund.code)))sel.value=String(selectedTradeFund.code);
  else sel.value='';
  syncTradePicker(false);
}
function syncTradePicker(resetAmount=true){
  const sel=$('#tradeFundSelect'),codeWrap=$('#tradeCodeWrap'),codeInput=$('#tradeCode'),lookup=$('#newFundLookup'),summary=$('#tradeFundSummary');
  if(!sel||!codeInput)return;
  const value=sel.value;
  if(value==='__new__'){
    selectedTradeFund=null;codeWrap.classList.remove('hidden');lookup.classList.remove('hidden');codeInput.readOnly=false;
    if(resetAmount){codeInput.value='';$('#matchedFund').textContent='输入6位基金代码自动识别';}
    summary.textContent='新基金：输入6位基金代码识别后记录买入；确认进入账本后会自动出现在这里。';
  }else if(/^\d{6}$/.test(value)){
    const c=state.cores.find(x=>String(x.code)===value)||null;selectedTradeFund=c;codeWrap.classList.add('hidden');lookup.classList.add('hidden');codeInput.readOnly=true;codeInput.value=value;
    const amt=tradeFundAmount(c);summary.textContent=c?`${c.name||c.code}（${c.code}） · 当前持有约 ¥${fmtMoney(amt)}`:'请选择基金';
  }else{
    selectedTradeFund=null;codeWrap.classList.add('hidden');lookup.classList.add('hidden');codeInput.readOnly=true;codeInput.value='';summary.textContent='选择已有基金；新基金请选择“＋ 新基金”';
  }
  updateTradeActionUI(resetAmount);
}
function updateTradeActionUI(resetAmount=false){
  const action=$('#tradeAction')?.value||'buy',wrap=$('#tradeAmountWrap'),tip=$('#clearTradeTip'),input=$('#tradeAmount');if(!wrap||!tip||!input)return;
  const isClear=action==='clear';wrap.classList.toggle('hidden',isClear);tip.classList.toggle('hidden',!isClear);
  if(isClear||resetAmount)input.value='';
  if(selectedTradeFund){const amt=tradeFundAmount(selectedTradeFund);const s=$('#tradeFundSummary');if(isClear)s.textContent=`${selectedTradeFund.name||selectedTradeFund.code}（${selectedTradeFund.code}） · 当前持有约 ¥${fmtMoney(amt)} · 将全部卖出`;else s.textContent=`${selectedTradeFund.name||selectedTradeFund.code}（${selectedTradeFund.code}） · 当前持有约 ¥${fmtMoney(amt)}`;}
}

function toast(msg,ms=2300){const e=$('#toast');e.textContent=msg;e.classList.remove('hidden');clearTimeout(toast.t);toast.t=setTimeout(()=>e.classList.add('hidden'),ms);}
function deviceId(){let id=localStorage.getItem(DEVICE_KEY);if(!id){id=`mobile-${crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+Math.random().toString(36).slice(2)}`;localStorage.setItem(DEVICE_KEY,id);}return id;}
function ledgerCores(row){const l=row?.ledger;if(Array.isArray(l))return l;if(Array.isArray(l?.cores))return l.cores;if(Array.isArray(l?.portfolio))return l.portfolio;return[];}
function isBond(c){return c?.type==='flexBond'||c?.type==='shortBond';}
function currentAmount(c,q){if(pos(c?.shares)&&pos(q?.officialNav))return Number(c.shares)*Number(q.officialNav);if(finite(c?.amountAnchor))return Number(c.amountAnchor);return null;}
function cumulativeProfit(c,q){const a=currentAmount(c,q);return finite(a)?Number(a)-Math.max(0,Number(c?.cost||0)):null;}
function coreFingerprint(cores=[]){const clean=(Array.isArray(cores)?cores:[]).map(c=>({code:String(c.code||''),name:String(c.name||''),type:String(c.type||'index'),enabled:c.enabled!==false,cost:Math.max(0,Number(c.cost||0)),shares:finite(c.shares)?Number(c.shares):null,startDate:c.startDate||null,pendingTrades:(Array.isArray(c.pendingTrades)?c.pendingTrades:[]).slice(-50).map(t=>({id:String(t.id||''),date:String(t.date||''),action:String(t.action||''),amount:Number(t.amount||0),feeRate:Number(t.feeRate||0),applied:Boolean(t.applied),appliedNav:finite(t.appliedNav)?Number(t.appliedNav):null,appliedDate:t.appliedDate||null,approximate:Boolean(t.approximate),deferredAccounting:Boolean(t.deferredAccounting),createdAt:t.createdAt||null})),createdByQuickTrade:Boolean(c.createdByQuickTrade)})).sort((a,b)=>a.code.localeCompare(b.code));return JSON.stringify(clean);}
function ledgerFromCores(cores){return{schema:1,cores:clone(cores)}}
function classifyFund(name=''){const t=String(name);if(/指数|ETF|联接/.test(t))return'index';if(/短债|中短债|纯债|货币/.test(t))return'shortBond';if(/债券/.test(t))return'flexBond';return'equity';}

function clearSensitiveCache(){
  try{localStorage.removeItem(CACHE_KEY);localStorage.removeItem(QUOTE_KEY);localStorage.removeItem(QUOTE_BUNDLE_AT_KEY);for(let i=localStorage.length-1;i>=0;i--){const k=localStorage.key(i);if(k&&k.startsWith(TREND_CACHE_PREFIX))localStorage.removeItem(k);}}catch(_){}
}
function clearSensitiveState(){state.current=null;state.history=[];state.cores=[];state.quotes={};state.lastSyncAt=null;state.sourceStatus=null;state.marketError=null;}
function saveCache(){try{localStorage.setItem(MARKET_KEY,JSON.stringify(state.markets||{}));}catch(_){}}
function loadPublicCache(){clearSensitiveCache();try{state.markets=JSON.parse(localStorage.getItem(MARKET_KEY)||'{}')||{};}catch(_){state.markets={};}}
function setLoginStatus(text,kind=''){const e=$('#loginStatus');if(!e)return;e.textContent=text;e.classList.remove('checking','error','ok');if(kind)e.classList.add(kind);}

async function sbFetch(path,{method='GET',body=null,auth=true,retry=true,headers:extraHeaders={}}={}){if(auth)await validSession();const headers={apikey:SB_KEY,...extraHeaders};if(auth&&state.session?.accessToken)headers.Authorization=`Bearer ${state.session.accessToken}`;if(body!==null)headers['Content-Type']='application/json';let r;try{r=await fetch(`${SB_URL}${path}`,{method,headers,cache:'no-store',...((body!==null)?{body:JSON.stringify(body)}:{})});}catch(_){throw new Error('无法连接私密云端，请检查网络或 VPN');}if(r.status===401&&auth&&retry){await refreshSession();return sbFetch(path,{method,body,auth,retry:false,headers:extraHeaders});}const text=await r.text();let data=null;if(text){try{data=JSON.parse(text);}catch(_){data=text;}}if(!r.ok){const msg=(data&&typeof data==='object'&&(data.message||data.msg||data.error_description||data.error))||String(data||`HTTP ${r.status}`);const e=new Error(msg);e.code=String(msg).includes('revision_conflict')?'revision_conflict':`http_${r.status}`;throw e;}return data;}

// ===== v2.4.0：Supabase 永久交易流水 =====
let TRADE_LOG_BACKFILL_AT=0;
function tradeLogRow(core,t){const status=t?.cancelled?'cancelled':t?.applied?'confirmed':'pending';const uid=state.session?.user?.id||state.current?.user_id||'';const confirmedAmount=finite(t?.confirmedAmount)?Number(t.confirmedAmount):(t?.action==='clear'?null:Number(t?.amount||0));return{user_id:uid,source_trade_id:String(t?.id||''),fund_code:String(core?.code||''),fund_name:String(core?.name||''),action:String(t?.action||''),requested_date:String(t?.date||''),requested_amount:Math.max(0,Number(t?.amount||0)),fee_rate:Math.max(0,Number(t?.feeRate||0)),status,confirmed_date:t?.appliedDate||null,confirmed_nav:finite(t?.appliedNav)?Number(t.appliedNav):null,confirmed_amount:confirmedAmount,share_delta:finite(t?.shareDelta)?Number(t.shareDelta):null,approximate:Boolean(t?.approximate),device_id:String(t?.deviceId||deviceId()),device_name:String(t?.deviceName||'手机网页版'),created_at:t?.createdAt||new Date().toISOString(),updated_at:new Date().toISOString()};}
async function upsertTradeLog(core,t){if(!state.authenticated||!t?.id)return false;const row=tradeLogRow(core,t);if(!row.user_id)return false;await sbFetch('/rest/v1/fund_trade_log?on_conflict=user_id,source_trade_id',{method:'POST',body:[row],headers:{Prefer:'resolution=merge-duplicates,return=minimal'}});return true;}
function legacyInitialTradeLogRow(c){const uid=state.session?.user?.id||state.current?.user_id||'',code=String(c?.code||''),cost=Math.max(0,Number(c?.cost||0));let startDate=String(c?.startDate||'');if(!startDate&&code==='110020'&&cost>0)startDate='2026-08-13';if(!uid||!/^\d{4}-\d{2}-\d{2}$/.test(startDate)||!(cost>0))return null;const trades=Array.isArray(c?.pendingTrades)?c.pendingTrades:[];if(trades.some(t=>t?.action==='buy'&&String(t?.date||'')===startDate)||trades.some(t=>t?.applied&&['buy','sell','clear'].includes(t?.action)))return null;return{user_id:uid,source_trade_id:`legacy_initial_${code}_${startDate}`,fund_code:code,fund_name:String(c?.name||''),action:'buy',requested_date:startDate,requested_amount:cost,fee_rate:0,status:'confirmed',confirmed_date:startDate,confirmed_nav:null,confirmed_amount:cost,share_delta:null,approximate:true,device_id:deviceId(),device_name:'历史建仓迁移',created_at:`${startDate}T00:00:00.000Z`,updated_at:new Date().toISOString()};}
async function backfillTradeLog(cores=state.cores,force=false){if(!state.authenticated)return false;if(!force&&Date.now()-TRADE_LOG_BACKFILL_AT<5*60*1000)return false;const rows=[];for(const c of(Array.isArray(cores)?cores:[])){for(const t of(Array.isArray(c?.pendingTrades)?c.pendingTrades:[]))if(t?.id&&['buy','sell','clear'].includes(t.action)){const row=tradeLogRow(c,t);if(row.user_id)rows.push(row);}const legacy=legacyInitialTradeLogRow(c);if(legacy)rows.push(legacy);}if(rows.length)await sbFetch('/rest/v1/fund_trade_log?on_conflict=user_id,source_trade_id',{method:'POST',body:rows,headers:{Prefer:'resolution=merge-duplicates,return=minimal'}});TRADE_LOG_BACKFILL_AT=Date.now();return true;}
async function markTradeCancelled(id){if(!state.authenticated||!id)return false;await sbFetch(`/rest/v1/fund_trade_log?source_trade_id=eq.${encodeURIComponent(String(id))}`,{method:'PATCH',body:{status:'cancelled',updated_at:new Date().toISOString()},headers:{Prefer:'return=minimal'}});return true;}
async function fetchTradeLogs(code){if(!state.authenticated)return[];try{await backfillTradeLog(state.cores,false);}catch(_){ }const q=`/rest/v1/fund_trade_log?select=source_trade_id,fund_code,fund_name,action,requested_date,requested_amount,status,confirmed_date,confirmed_nav,confirmed_amount,share_delta,approximate,device_name,created_at&fund_code=eq.${encodeURIComponent(String(code||''))}&status=eq.confirmed&order=confirmed_date.asc,created_at.asc&limit=5000`;const d=await sbFetch(q);return Array.isArray(d)?d:[];}

async function login(email,password){
  if(!email||!password)throw new Error('请输入邮箱和密码');
  let r;try{r=await fetch(`${SB_URL}/auth/v1/token?grant_type=password`,{method:'POST',headers:{apikey:SB_KEY,'Content-Type':'application/json'},cache:'no-store',body:JSON.stringify({email,password})});}catch(_){throw new Error('无法连接 Supabase，请检查网络或 VPN');}
  const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data?.msg||data?.message||'邮箱或密码错误');
  storeSession(data);await verifySessionOnline();await loadCloud();
}
function storeSession(raw){state.session={accessToken:raw.access_token,refreshToken:raw.refresh_token,expiresAt:raw.expires_at?Number(raw.expires_at)*1000:Date.now()+Number(raw.expires_in||3600)*1000,user:raw.user||state.session?.user||{}};localStorage.setItem(SESSION_KEY,JSON.stringify(state.session));}
function clearSession(){state.session=null;state.authenticated=false;localStorage.removeItem(SESSION_KEY);}
async function refreshSession(){if(!state.session?.refreshToken){clearSession();throw new Error('登录已失效');}const r=await fetch(`${SB_URL}/auth/v1/token?grant_type=refresh_token`,{method:'POST',headers:{apikey:SB_KEY,'Content-Type':'application/json'},cache:'no-store',body:JSON.stringify({refresh_token:state.session.refreshToken})});const d=await r.json().catch(()=>({}));if(!r.ok){clearSession();throw new Error('登录已失效，请重新登录');}storeSession(d);}
async function verifySessionOnline(retry=true){
  if(!state.session)throw new Error('请先登录');
  if(Number(state.session.expiresAt||0)<Date.now()+90000)await refreshSession();
  let r;try{r=await fetch(`${SB_URL}/auth/v1/user`,{headers:{apikey:SB_KEY,Authorization:`Bearer ${state.session.accessToken}`},cache:'no-store'});}catch(_){throw new Error('无法验证登录状态，请检查网络');}
  if(r.status===401&&retry){await refreshSession();return verifySessionOnline(false);}
  const d=await r.json().catch(()=>({}));
  if(!r.ok){clearSession();clearSensitiveState();clearSensitiveCache();throw new Error('登录已失效，请重新登录');}
  state.session.user=d||state.session.user||{};state.authenticated=true;localStorage.setItem(SESSION_KEY,JSON.stringify(state.session));return state.session;
}
async function validSession(){if(!state.session||!state.authenticated)throw new Error('请先登录');if(Number(state.session.expiresAt||0)<Date.now()+90000)await refreshSession();return state.session;}
async function fetchCurrent(){const d=await sbFetch('/rest/v1/fund_ledger_current?select=user_id,revision,ledger,operation,device_id,device_name,updated_at&limit=1');return Array.isArray(d)?d[0]||null:null;}
async function fetchHistory(){const path=`/rest/v1/fund_ledger_history?select=id,revision,ledger,operation,device_id,device_name,created_at,archived_at&order=archived_at.desc,revision.desc&limit=${HISTORY_LIMIT}`;try{const d=await sbFetch(path);return Array.isArray(d)?d.slice(0,HISTORY_LIMIT):[];}catch(_){const legacy=`/rest/v1/fund_ledger_history?select=id,revision,ledger,operation,device_id,device_name,created_at&order=created_at.desc,revision.desc&limit=${HISTORY_LIMIT}`;const d=await sbFetch(legacy);return Array.isArray(d)?d.slice(0,HISTORY_LIMIT):[];}}
async function rpc(name,body){const d=await sbFetch(`/rest/v1/rpc/${name}`,{method:'POST',body});return Array.isArray(d)?d[0]||null:d;}
async function loadCloud(){try{const[c,h]=await Promise.all([fetchCurrent(),fetchHistory()]);state.current=c;state.history=h;state.cores=ledgerCores(c);saveCache();render();backfillTradeLog(state.cores,false).catch(()=>{});return true;}catch(e){if(state.current){render();setCloudStatus(`离线缓存 · ${e.message}`,'bad');return false;}throw e;}}
async function commit(nextCores,operation){if(!state.current)throw new Error('私密云端主线不存在');const row=await rpc('commit_fund_ledger',{p_expected_revision:Number(state.current.revision||0),p_ledger:ledgerFromCores(nextCores),p_operation:operation,p_device_id:deviceId(),p_device_name:'手机网页版'});state.current=row;state.cores=ledgerCores(row);state.history=await fetchHistory();saveCache();render();return row;}
async function restoreHistory(id){const row=await rpc('restore_fund_ledger',{p_history_id:id,p_expected_revision:Number(state.current?.revision||0),p_device_id:deviceId(),p_device_name:'手机网页版'});state.current=row;state.cores=ledgerCores(row);state.history=await fetchHistory();saveCache();render();}

async function fnFetch(body){await validSession();let r;try{r=await fetch(FN_URL,{method:'POST',headers:{apikey:SB_KEY,Authorization:`Bearer ${state.session.accessToken}`,'Content-Type':'application/json'},body:JSON.stringify(body)});}catch(_){throw new Error('无法连接 Supabase 行情代理');}const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d?.error||`行情代理 HTTP ${r.status}`);return d;}
function applyProxy(core,q){if(isBond(core)||finite(q?.estPct))return q;let m=null,mul=1,label='',reliable=false;const code=String(core.code||'');if(code==='110020'){m=state.markets['000300'];mul=.95;label='沪深300代理';reliable=true;}else if(code==='011103'){m=state.markets['931151'];mul=.98;label='光伏指数代理';reliable=true;}else if(code==='003096'){m=state.markets['000933'];mul=.65;label='医药基准代理';reliable=false;}if(m&&finite(m.pct))return{...q,estPct:Number(m.pct)*mul,estTime:'实时指数',estSource:label,estReliable:reliable};return q;}
function normalizeQuote(core,raw={}){let q={...(state.quotes[core.code]||{}),...raw};q.estReliable=finite(q.estPct)?!isBond(core):false;q.estSource=q.estSource||((finite(q.estPct)&&!isBond(core))?'基金估值':'');q=applyProxy(core,q);if(isBond(core)){q.estPct=null;q.estNav=null;q.estSource='';q.estReliable=false;}q.fetchedAt=Date.now();return q;}
async function fetchQuoteBundle(codes,{force=false}={}){const d=await fnFetch({action:'quotes',codes,force});state.markets=d?.markets||{};const qs=d?.quotes||{};for(const c of state.cores){if(c.enabled===false)continue;state.quotes[c.code]=normalizeQuote(c,qs[c.code]||{});}state.sourceStatus={quoteSuccess:Object.values(qs).filter(q=>finite(q?.officialNav)).length,total:codes.length,marketOk:Object.keys(state.markets).length>0};return d;}

function applyPending(core,officialNav,officialDate){const next=clone(core);if(!pos(officialNav)||!officialDate)return{core:next,changed:false};const pending=Array.isArray(next.pendingTrades)?next.pendingTrades.map(t=>({...t})):[];let shares=finite(next.shares)?Number(next.shares):NaN;if(!Number.isFinite(shares)&&finite(next.amountAnchor)&&officialNav>0)shares=Number(next.amountAnchor)/officialNav;if(!Number.isFinite(shares))return{core:next,changed:false};let cost=Math.max(0,Number(next.cost||0)),changed=false;next.pendingTrades=pending.map(t=>{if(t.applied||t.date!==officialDate)return t;if(t.action==='buy'){const gross=Math.max(0,Number(t.amount||0)),fee=Math.max(0,Number(t.feeRate||0))/100,net=gross/(1+fee),delta=net/officialNav;shares+=delta;cost+=gross;changed=true;return{...t,applied:true,appliedNav:officialNav,appliedDate:officialDate,confirmedAmount:gross,shareDelta:delta,deferredAccounting:true};}if(t.action==='sell'){const gross=Math.max(0,Number(t.amount||0)),before=shares,sold=Math.min(before,gross/officialNav);shares=Math.max(0,before-sold);if(before>0)cost*=shares/before;changed=true;return{...t,applied:true,appliedNav:officialNav,appliedDate:officialDate,confirmedAmount:sold*officialNav,shareDelta:-sold,approximate:true,deferredAccounting:true};}if(t.action==='clear'){const before=shares;shares=0;cost=0;changed=true;return{...t,applied:true,appliedNav:officialNav,appliedDate:officialDate,confirmedAmount:before*officialNav,shareDelta:-before,approximate:false,deferredAccounting:true};}return t;});if(changed){next.shares=shares;next.cost=Math.max(0,cost);next.amountAnchor=shares>0&&pos(officialNav)?shares*Number(officialNav):0;next.updatedAt=Date.now();}return{core:next,changed};}

async function refreshQuotes({force=true,skipCloud=false,silent=false}={}){if(state.busy)return;state.busy=true;const b=$('#refreshBtn');if(b){b.disabled=true;b.textContent='刷新中…';}try{if(!skipCloud)await loadCloud();const codes=state.cores.filter(c=>c.enabled!==false).map(c=>c.code);const fresh=!force&&Object.keys(state.quotes||{}).length>0;if(!fresh)await fetchQuoteBundle(codes,{force});const before=coreFingerprint(state.cores),next=clone(state.cores);let confirmed=0;for(let i=0;i<next.length;i++){if(next[i].enabled===false)continue;const q=state.quotes[next[i].code]||{},a=applyPending(next[i],q.officialNav,q.officialDate);if(a.changed){next[i]=a.core;confirmed++;}}state.lastSyncAt=new Date().toISOString();if(coreFingerprint(next)!==before){await commit(next,`手机版正式净值确认交易 / 更新持有份额（${confirmed}只基金）`);backfillTradeLog(next,true).catch(()=>{});toast(`已确认 ${confirmed} 只基金的待确认操作`);}else{state.cores=next;saveCache();render();if(!silent)toast(fresh?'使用10分钟内行情缓存':'行情刷新完成');}}catch(e){if(e.code==='revision_conflict'){await loadCloud();toast('云端已被其他设备更新，本次未覆盖',3500);}else{state.marketError=e.message;render();if(!silent)toast(`行情刷新失败：${e.message}`,4000);}}finally{state.busy=false;if(b){b.disabled=false;b.textContent='刷新';}}}

function officialProfit(core,q){if(!q?.officialDate||!pos(q?.officialNav))return null;if(core.startDate&&String(core.startDate)>=String(q.officialDate))return null;let profit=null;if(pos(core.shares)&&pos(q.prevNav))profit=Number(core.shares)*(Number(q.officialNav)-Number(q.prevNav));else if(finite(q.officialPct)){const a=currentAmount(core,q),p=Number(q.officialPct)/100;if(finite(a)&&1+p!==0)profit=Number(a)-Number(a)/(1+p);}return finite(profit)?{date:q.officialDate,profit:Number(profit),nav:Number(q.officialNav),prevNav:finite(q.prevNav)?Number(q.prevNav):null}:null;}
function estimate(core,q){const bond=isBond(core),has=!bond&&finite(q?.estPct);if(!has)return{isBond:bond,has:false,reliable:false,estPct:null,estProfit:null,source:''};const amount=currentAmount(core,q);let p=finite(amount)?Number(amount)*Number(q.estPct)/100:null;if(pos(q.estNav)&&pos(q.officialNav)&&finite(amount))p=Number(amount)*(Number(q.estNav)/Number(q.officialNav)-1);return{isBond:bond,has:finite(p),reliable:!!q.estReliable,estPct:Number(q.estPct),estProfit:finite(p)?Number(p):null,source:q.estSource||'基金估值'};}

function renderMarkets(){const wanted=[['000001','上证指数'],['399006','创业板指'],['000300','沪深300'],['NDX','纳斯达克100']],g=$('#marketGrid');const rows=wanted.map(([code,name])=>({code,name,...(state.markets[code]||{})}));if(!rows.some(x=>finite(x.price))){g.innerHTML=`<div class="market-empty">${esc(state.marketError||'大盘行情暂未同步')}</div>`;$('#marketHint').textContent=state.marketError?'同步失败':'等待同步';return;}g.innerHTML=rows.map(m=>finite(m.price)?`<div class="market-card"><span>${esc(m.name)}</span><b>${Number(m.price).toLocaleString('zh-CN',{maximumFractionDigits:2})}</b><small class="${cls(m.pct)}">${fmtMoney(m.change,true)} · ${fmtPct(m.pct)}</small></div>`:`<div class="market-card"><span>${esc(m.name)}</span><b>--</b><small>--</small></div>`).join('');$('#marketHint').textContent='上证 / 创业板 / 沪深300 / 纳指100';}
function renderBreakdown(funds,total){const estimated=funds.map(c=>({c,q:state.quotes[c.code]||{},e:estimate(c,state.quotes[c.code]||{})})).filter(x=>x.e.has);const covered=estimated.reduce((s,x)=>s+Number(currentAmount(x.c,x.q)||0),0),p=total>0?covered/total*100:0;$('#coverageText').textContent=`覆盖 ${estimated.length}只 · ${p.toFixed(1)}%仓位`;if(!estimated.length){$('#estimateBreakdown').innerHTML='<span class="muted">暂无盘中参考值</span>';return;}estimated.sort((a,b)=>Math.abs(b.e.estProfit)-Math.abs(a.e.estProfit));$('#estimateBreakdown').innerHTML=estimated.map(x=>`<div class="breakdown-item"><span class="bn">${esc(x.c.name||x.c.code)}</span><b class="${x.e.reliable?cls(x.e.estProfit):'low'}">${fmtMoney(x.e.estProfit,true)}</b><small>${fmtPct(x.e.estPct)}${x.e.reliable?'':' · 参考'}</small></div>`).join('');}
function filteredFunds(funds){if(currentFilter==='estimated')return funds.filter(c=>estimate(c,state.quotes[c.code]||{}).has);if(currentFilter==='pending')return funds.filter(c=>!estimate(c,state.quotes[c.code]||{}).has);return funds;}
// v2.3.8：正式清仓后只从主看板隐藏，不删除账本/历史；重新买入会自动再次显示。
function isSettledClearedFund(c){const trades=Array.isArray(c?.pendingTrades)?c.pendingTrades:[];if(trades.some(t=>!t.applied))return false;const hasConfirmedClear=trades.some(t=>t?.action==='clear'&&t?.applied);if(!hasConfirmedClear)return false;const shares=Number(c?.shares||0),cost=Number(c?.cost||0),anchor=Number(c?.amountAnchor||0),amount=Number(c?.officialAmount||c?.amount||0);return shares<=1e-8&&cost<=0.005&&anchor<=0.005&&amount<=0.005;}
function shouldShowFundInMain(c){const hasPending=Array.isArray(c?.pendingTrades)&&c.pendingTrades.some(t=>!t.applied);return hasPending||pos(c?.shares)||pos(c?.cost)||pos(c?.amountAnchor);}
function renderFunds(funds){const mainFunds=funds.filter(shouldShowFundInMain);const visible=[...filteredFunds(mainFunds)].sort((a,b)=>Number(currentAmount(b,state.quotes[b.code]||{})||0)-Number(currentAmount(a,state.quotes[a.code]||{})||0));$('#filterHint').textContent=`${visible.length}/${mainFunds.length}只`;$('#fundList').innerHTML=visible.length?visible.map(c=>{const q=state.quotes[c.code]||{},amount=currentAmount(c,q),cum=cumulativeProfit(c,q),e=estimate(c,q),h=officialProfit(c,q),pending=(c.pendingTrades||[]).filter(t=>!t.applied).length;let todayHint=e.isBond?'债基待正式':e.has?`${e.source}${e.reliable?'':' · 参考'}`:(q.errors?.length?'同步失败':'暂无参考');const status=[];if(q.errors?.length)status.push('<span class="sync-warn">部分源受限</span>');if(pending)status.push(`<span class="pending">待确认${pending}</span>`);return `<article class="fund-card" data-code="${esc(c.code)}"><div class="fund-top"><div class="fund-name"><b>${esc(c.name||c.code)}</b><div class="meta"><span>${esc(c.code)}</span><span class="tag ${esc(c.type)}">${esc(typeLabel[c.type]||'其他')}</span>${status.join('')}</div></div><div class="fund-amount"><b>¥${fmtMoney(amount)}</b><small>当前持有</small></div></div><div class="fund-body"><div class="fund-metric quote-metric"><span>今日 / 最近正式</span><div class="quote-lines"><div class="qline"><span>今</span><b class="${e.has?(e.reliable?cls(e.estProfit):'low'):''}">${e.has?fmtMoney(e.estProfit,true):'--'}</b><i class="${e.has?(e.reliable?cls(e.estPct):'low'):''}">${e.has?fmtPct(e.estPct):'--'}</i><em>${esc(todayHint)}</em></div><div class="qline"><span>昨</span><b class="${cls(h?.profit)}">${h?fmtMoney(h.profit,true):'--'}</b><i></i><em>${h?.date?shortDate(h.date):(q.officialDate?`基准${shortDate(q.officialDate)}`:'等待正式')}</em></div></div></div><div class="fund-metric"><span>累计收益</span><strong class="${cls(cum)}">${fmtMoney(cum,true)}</strong><small>${Number(c.cost||0)>0?fmtPct(Number(cum||0)/Number(c.cost)*100):'--'}</small></div><div class="fund-metric"><span>最新净值</span><strong>${navFmt(q.officialNav)}</strong><small>${esc(q.officialDate||'待同步')}</small></div></div><div class="fund-open">点开查看走势</div></article>`}).join(''):'<div class="section-card muted" style="text-align:center">当前筛选没有基金</div>';}

function renderTradeHistory(funds){const items=[];for(const c of funds)for(const t of(c.pendingTrades||[]))items.push({...t,code:c.code,fundName:c.name});items.sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));$('#tradeHistory').innerHTML=items.length?items.slice(0,8).map(t=>`<span class="trade-chip">${shortDate(t.date)} · ${tradeLabel[t.action]||t.action}${t.action==='clear'?'':` ¥${fmtMoney(t.amount)}`}${t.applied?' · 已确认':` · 待确认 <button data-cancel-trade="${esc(t.id)}" data-code="${esc(t.code)}">×</button>`}</span>`).join(''):'<span class="muted">暂无记录</span>';}

function setCloudStatus(text,kind='ok'){const c=$('#statusCard');c.className=`status-card ${kind}`;$('#cloudStatus').textContent=text;$('#mainlineTime').textContent=state.current?fmtTime(state.current.updated_at):'--';$('#historyMini').textContent=`历史 ${state.history.length}/${HISTORY_LIMIT} 条`;$('#statusDetail').textContent=state.current?`${state.cores.filter(c=>c.enabled!==false).length}只基金 · ${state.current.device_name||'私密云端'}`:'Supabase · Singapore';}
function render(){const logged=!!state.session&&state.authenticated===true;$('#loginView').classList.toggle('hidden',logged);$('#appView').classList.toggle('hidden',!logged);$('#bottomNav').classList.toggle('hidden',!logged);if(!logged)return;setCloudStatus(state.current?'私密云端最新主线已连接':'私密云端没有主线',state.current?'ok':'bad');const funds=state.cores.filter(c=>c.enabled!==false),items=funds.map(c=>({c,q:state.quotes[c.code]||{}}));const total=items.reduce((s,x)=>s+Number(currentAmount(x.c,x.q)||0),0),cost=funds.reduce((s,c)=>s+Number(c.cost||0),0),cum=total-cost;const estimated=items.map(x=>({...x,e:estimate(x.c,x.q)})).filter(x=>x.e.has),today=estimated.reduce((s,x)=>s+Number(x.e.estProfit||0),0),covered=estimated.reduce((s,x)=>s+Number(currentAmount(x.c,x.q)||0),0),coveredPct=total>0?covered/total*100:0,reliable=estimated.filter(x=>x.e.reliable),reliableP=reliable.reduce((s,x)=>s+Number(x.e.estProfit||0),0),pending=funds.filter(c=>!estimate(c,state.quotes[c.code]||{}).has),pendingAmt=pending.reduce((s,c)=>s+Number(currentAmount(c,state.quotes[c.code]||{})||0),0),pendingPct=total>0?pendingAmt/total*100:0;const officialRows=items.map(x=>({c:x.c,h:officialProfit(x.c,x.q)})).filter(x=>x.h);const target=officialRows.map(x=>x.h.date).sort().reverse()[0]||null,official=officialRows.filter(x=>x.h.date===target).reduce((s,x)=>s+Number(x.h.profit||0),0),officialCount=officialRows.filter(x=>x.h.date===target).length;
  $('#totalAmount').textContent=`¥${fmtMoney(total)}`;$('#totalCum').textContent=`累计 ${fmtMoney(cum,true)} (${cost?fmtPct(cum/cost*100):'--'})`;$('#todayEstimate').textContent=estimated.length?fmtMoney(today,true):'--';$('#todayEstimate').className=estimated.length?cls(today):'';$('#todayEstimateHint').textContent=estimated.length?`覆盖 ${estimated.length}只 · ${coveredPct.toFixed(1)}%仓位`:'暂无可用盘中参考值';$('#coverageFill').style.width=`${Math.min(100,Math.max(0,coveredPct))}%`;$('#estimateBadge').textContent=coveredPct>=70?'覆盖较高':coveredPct>=30?'部分覆盖':'覆盖较低';$('#intradayTotal').textContent=reliable.length?fmtMoney(reliableP,true):'--';$('#intradayTotal').className=reliable.length?cls(reliableP):'';$('#coveredAmount').textContent=`¥${fmtMoney(covered)}`;$('#coveredPct').textContent=`占总持仓 ${coveredPct.toFixed(1)}%`;$('#bondPendingAmount').textContent=`¥${fmtMoney(pendingAmt)}`;$('#bondPendingPct').textContent=`占总持仓 ${pendingPct.toFixed(1)}%`;$('#officialTotal').textContent=target?fmtMoney(official,true):'--';$('#officialTotal').className=target?cls(official):'';$('#officialDate').textContent=target?`${target} · ${officialCount}/${funds.length}只已记录`:'刷新后建立正式净值基准';renderMarkets();renderBreakdown(funds,total);renderFunds(funds);renderTradeFundSelect();renderTradeHistory(funds);$('#syncText').textContent=state.lastSyncAt?`最后同步 ${new Date(state.lastSyncAt).toLocaleString('zh-CN')}`:'行情尚未刷新';$('#sourceText').textContent=state.sourceStatus?`正式源 ${state.sourceStatus.quoteSuccess||0}/${state.sourceStatus.total||0} · 大盘${state.sourceStatus.marketOk?'正常':'待同步'}`:'私密云端账本已连接';$('#syncErrorText').textContent=state.marketError||'';saveCache();}

function openSheet(id){$('#sheetBackdrop').classList.remove('hidden');$('#'+id).classList.remove('hidden');document.body.style.overflow='hidden';}
function closeSheets(){$('#sheetBackdrop').classList.add('hidden');$$('.sheet').forEach(x=>x.classList.add('hidden'));document.body.style.overflow='';}

async function lookupCode(code){if(!/^\d{6}$/.test(code))throw new Error('请输入6位基金代码');const d=await fnFetch({action:'quotes',codes:[code]});if(d?.markets)state.markets=d.markets;const raw=d?.quotes?.[code];if(!raw||(!raw.name&&!finite(raw.officialNav)))throw new Error('没有识别到这只基金');return raw;}
async function lookupTrade(){const code=$('#tradeCode').value.trim();const b=$('#lookupTradeBtn');b.disabled=true;b.textContent='识别中…';try{const q=await lookupCode(code);$('#matchedFund').textContent=`${q.name||code} · 最新净值 ${navFmt(q.officialNav)} · ${q.officialDate||'--'}`;state.quotes[code]={...(state.quotes[code]||{}),...q};$('#tradeFundSummary').textContent=`新基金：${q.name||code}（${code}）`;}catch(e){$('#matchedFund').textContent=e.message;}finally{b.disabled=false;b.textContent='识别基金';}}
async function saveTrade(){
  const code=$('#tradeCode').value.trim(),action=$('#tradeAction').value,amount=Math.max(0,Number($('#tradeAmount').value||0)),date=$('#tradeDate').value;
  if(!/^\d{6}$/.test(code)||!date)return toast('请选择基金并填写交易日');
  if(action!=='clear'&&!(amount>0))return toast('请输入操作金额');
  let next=clone(state.cores),c=next.find(x=>x.code===code);
  try{
    if(!c){
      if(action!=='buy')return toast('新基金请先记录买入');
      const q=await lookupCode(code);c={code,name:q.name||code,type:classifyFund(q.name||''),enabled:true,cost:0,shares:0,amountAnchor:0,startDate:new Date().toISOString().slice(0,10),pendingTrades:[],createdByQuickTrade:true,updatedAt:Date.now()};next.push(c);
    }
    const live=state.cores.find(x=>x.code===code),held=live?tradeFundAmount(live):null;
    if(action==='sell'&&finite(held)&&amount>Number(held)+0.01)return toast(`卖出金额超过当前持有约 ¥${fmtMoney(held)}`,3200);
    if(action==='clear'){
      const heldText=finite(held)?`当前持有约 ¥${fmtMoney(held)}`:'当前持有金额待同步';
      if(!confirm(`确认全部卖出？\n\n${c.name||c.code}（${c.code}）\n${heldText}\n\n操作会先记为待确认，正式净值发布后清仓。`))return;
    }
    c.pendingTrades=Array.isArray(c.pendingTrades)?c.pendingTrades:[];
    const trade={id:`m_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,date,action,amount:action==='clear'?0:amount,feeRate:0,applied:false,deferredAccounting:true,createdAt:new Date().toISOString(),deviceId:deviceId(),deviceName:'手机网页版'};c.pendingTrades.push(trade);c.updatedAt=Date.now();
    const op=action==='clear'?`全部卖出 ${c.name||c.code}（待正式确认）`:`${tradeLabel[action]||action} ${c.name||c.code} ¥${amount.toFixed(2)}`;
    await commit(next,op);
    try{await upsertTradeLog(c,trade);}catch(_){ }
    $('#tradeAmount').value='';
    if($('#tradeFundSelect').value==='__new__'){$('#tradeFundSelect').value=code;selectedTradeFund=state.cores.find(x=>x.code===code)||null;}
    closeSheets();toast('操作已写入私密云端，等待正式净值确认');
  }catch(e){if(e.code==='revision_conflict'){await loadCloud();toast('另一台设备已更新云端，请重新操作',3500);}else toast(e.message,3500);}
}
async function cancelTrade(code,id){const next=clone(state.cores),c=next.find(x=>x.code===code);if(!c)return;const t=(c.pendingTrades||[]).find(x=>x.id===id);c.pendingTrades=(c.pendingTrades||[]).filter(x=>x.id!==id||x.applied);c.updatedAt=Date.now();try{await commit(next,`撤销待确认操作 ${c.name||code}`);if(t)markTradeCancelled(t.id).catch(()=>{});toast('已撤销待确认操作');}catch(e){toast(e.message,3200);}}

function settingsCalc(c,q){const shares=finite(c.shares)?Number(c.shares):0,cost=Number(c.cost||0),costNav=shares>0?cost/shares:0,nav=Number(q?.officialNav||0),amount=shares>0&&nav>0?shares*nav:(finite(c.amountAnchor)?Number(c.amountAnchor):0),profit=amount-cost,rate=cost>0?profit/cost*100:null;return{shares,cost,costNav,nav,amount,profit,rate};}
function renderSettings(){const box=$('#settingsList');box.innerHTML=state.cores.map((c,i)=>({c,i})).filter(({c})=>!isSettledClearedFund(c)).map(({c,i})=>{const q=state.quotes[c.code]||{},v=settingsCalc(c,q);return `<div class="settings-row" data-i="${i}"><div class="settings-row-head"><div><b>${esc(c.name||c.code||'新基金')}</b><small>${esc(c.code||'未设置代码')} · ${esc(typeLabel[c.type]||'其他')}</small></div><button class="delete-fund" data-delete="${i}">删除</button></div><div class="settings-fields"><label>基金代码<div class="settings-code"><input data-k="code" maxlength="6" inputmode="numeric" value="${esc(c.code||'')}"><button data-lookup="${i}">识别</button></div></label><label>基金名称<input data-k="name" value="${esc(c.name||'')}"></label><label>基金类型<select data-k="type"><option value="index" ${c.type==='index'?'selected':''}>指数</option><option value="equity" ${c.type==='equity'?'selected':''}>偏股</option><option value="flexBond" ${c.type==='flexBond'?'selected':''}>固收+</option><option value="shortBond" ${c.type==='shortBond'?'selected':''}>短债</option></select></label><label>持有份额<input data-k="shares" type="number" min="0" step="0.0001" inputmode="decimal" value="${v.shares?String(v.shares):''}" placeholder="如 104.82"></label><label>持仓成本价<input data-k="costNav" type="number" min="0" step="0.0001" inputmode="decimal" value="${v.costNav?v.costNav.toFixed(4):''}" placeholder="如 1.9080"></label></div><div class="settings-calc"><div><span>最新净值</span><b>${navFmt(v.nav)}</b></div><div><span>当前持有额</span><b>¥${fmtMoney(v.amount)}</b></div><div><span>持有收益</span><b class="${cls(v.profit)}">${fmtMoney(v.profit,true)}</b></div></div><div class="settings-footer"><label style="display:flex;grid-template-columns:auto 1fr;align-items:center"><input data-k="enabled" type="checkbox" ${c.enabled!==false?'checked':''}> 启用</label><small>${esc(q.officialDate||'待刷新正式净值')} · ${fmtPct(v.rate)}</small></div></div>`}).join('');}
function settingsDraft(){const out=clone(state.cores);$$('#settingsList .settings-row').forEach(r=>{const i=Number(r.dataset.i),old=clone(out[i]||{}),get=k=>r.querySelector(`[data-k="${k}"]`),shares=Number(get('shares')?.value||0),costNav=Number(get('costNav')?.value||0);old.code=String(get('code')?.value||'').trim();old.name=String(get('name')?.value||'');old.type=String(get('type')?.value||'index');old.enabled=!!get('enabled')?.checked;old.shares=shares;old.cost=shares>0&&costNav>0?shares*costNav:Math.max(0,Number(old.cost||0));const q=state.quotes[old.code]||{};if(shares>0&&pos(q.officialNav))old.amountAnchor=shares*Number(q.officialNav);else if(shares<=0)old.amountAnchor=0;else if(!finite(old.amountAnchor))old.amountAnchor=0;old.updatedAt=Date.now();out[i]=old;});return out;}
async function saveSettings(){const next=settingsDraft();if(next.some(c=>!/^\d{6}$/.test(c.code)))return toast('每只基金都需要6位基金代码');try{await commit(next,'手机版修改持仓设置');closeSheets();toast('持仓设置已保存');refreshQuotes({force:true,skipCloud:true,silent:true});}catch(e){if(e.code==='revision_conflict'){await loadCloud();toast('云端已更新，请重新修改',3500);}else toast(e.message,3500);}}
async function lookupSetting(i){const row=$(`.settings-row[data-i="${i}"]`),code=row?.querySelector('[data-k="code"]')?.value.trim();if(!row||!/^\d{6}$/.test(code))return toast('请输入6位基金代码');const b=row.querySelector('[data-lookup]');b.disabled=true;b.textContent='…';try{const q=await lookupCode(code);row.querySelector('[data-k="name"]').value=q.name||code;row.querySelector('[data-k="type"]').value=classifyFund(q.name||'');state.quotes[code]={...(state.quotes[code]||{}),...q};toast(`识别成功：${q.name||code}`);}catch(e){toast(e.message,3000);}finally{b.disabled=false;b.textContent='识别';}}
function addSetting(){state.cores.push({code:'',name:'新基金',type:'index',enabled:true,cost:0,shares:0,amountAnchor:0,startDate:new Date().toISOString().slice(0,10),pendingTrades:[],createdByQuickTrade:false,updatedAt:Date.now()});renderSettings();setTimeout(()=>$$('#settingsList .settings-row').at(-1)?.querySelector('[data-k="code"]')?.focus(),50);}
async function autoMatch(){let changed=0;for(const c of state.cores){if(pos(c.shares))continue;const q=state.quotes[c.code]||{},amount=finite(c.amountAnchor)?Number(c.amountAnchor):0;if(pos(q.officialNav)&&amount>0){c.shares=amount/Number(q.officialNav);c.amountAnchor=amount;c.updatedAt=Date.now();changed++;}}renderSettings();toast(changed?`已反推 ${changed} 只基金份额，请核对后保存`:'没有需要自动反推的旧持仓',3000);}

function renderHistory(){const c=state.current;$('#currentMainline').innerHTML=c?`<b>当前最新主线：${esc(fmtTime(c.updated_at))}</b><div class="history-meta">${state.cores.length}只基金 · ${esc(c.operation||'公共主线')} · ${esc(c.device_name||'')}</div>`:'<b>暂无公共主线</b>';$('#historyList').innerHTML=state.history.length?state.history.map(h=>`<div class="history-item"><div class="history-top"><div class="history-time">${esc(fmtTime(h.created_at))}</div><div>${ledgerCores(h).length}只基金</div></div><div class="history-meta">${esc(h.operation||'历史版本')} · ${esc(h.device_name||'')}</div><button data-restore="${esc(h.id)}" data-time="${esc(h.created_at||'')}">设为最新主线</button></div>`).join(''):'<div class="muted">还没有历史版本。</div>';}

async function runDiag(){const out=[];$('#diagResult').textContent='诊断中…';try{const t=Date.now();await fetchCurrent();out.push(`私密云端：OK (${Date.now()-t}ms)`);}catch(e){out.push(`私密云端：失败 · ${e.message}`);}try{const t=Date.now(),d=await fnFetch({action:'ping'});out.push(`行情代理：OK (${Date.now()-t}ms) · 市场数据 ${d.markets||0} 项`);}catch(e){out.push(`行情代理：失败 · ${e.message}`);}out.push(`本地主线缓存：${state.current?'有':'无'}`);out.push(`登录状态：${state.session?.user?.email||'未登录'}`);$('#diagResult').textContent=out.join('\n');}
async function logout(){try{if(state.session?.accessToken)await fetch(`${SB_URL}/auth/v1/logout`,{method:'POST',headers:{apikey:SB_KEY,Authorization:`Bearer ${state.session.accessToken}`},cache:'no-store'});}catch(_){}clearSession();try{localStorage.removeItem(TRUSTED_DEVICE_KEY);}catch(_){}clearSensitiveState();clearSensitiveCache();setLoginStatus('已安全退出。这台手机的免登录授权已取消。','ok');render();closeSheets();}
function copySummary(){const funds=state.cores.filter(c=>c.enabled!==false),total=funds.reduce((s,c)=>s+Number(currentAmount(c,state.quotes[c.code]||{})||0),0),cost=funds.reduce((s,c)=>s+Number(c.cost||0),0);const lines=[`基金看板 ${fmtTime(Date.now())}`,`当前持有额 ¥${fmtMoney(total)} · 累计 ${fmtMoney(total-cost,true)}`,`主线 ${state.current?fmtTime(state.current.updated_at):'--'} · ${funds.length}只基金`];for(const c of funds){const q=state.quotes[c.code]||{},e=estimate(c,q);lines.push(`${c.code} ${c.name||''} ¥${fmtMoney(currentAmount(c,q))} 今日${e.has?fmtPct(e.estPct):'待正式'} 累计${fmtMoney(cumulativeProfit(c,q),true)}`);}navigator.clipboard?.writeText(lines.join('\n')).then(()=>toast('摘要已复制')).catch(()=>toast('复制失败'));}

async function openTrend(code){const c=state.cores.find(x=>x.code===code);if(!c||!state.authenticated)return;trendState={code,name:c.name||code,rows:[],trades:[],range:'1m'};$('#trendTitle').textContent=c.name||code;$('#trendCode').textContent=code;$('#trendModal').classList.remove('hidden');$('#trendLoading').classList.remove('hidden');$('#trendChart').innerHTML='';$('#trendTooltip')?.classList.add('hidden');try{const[d,trades]=await Promise.all([fnFetch({action:'trend',code}),fetchTradeLogs(code).catch(()=>[])]);trendState.rows=Array.isArray(d.trend)?d.trend:[];trendState.trades=Array.isArray(trades)?trades:[];renderTrend();}catch(e){$('#trendLoading').textContent=`走势加载失败：${e.message}`;}}
function rangeStart(range){const d=new Date();if(range==='1m')d.setMonth(d.getMonth()-1);else if(range==='3m')d.setMonth(d.getMonth()-3);else if(range==='6m')d.setMonth(d.getMonth()-6);else if(range==='1y')d.setFullYear(d.getFullYear()-1);else if(range==='3y')d.setFullYear(d.getFullYear()-3);else if(range==='5y')d.setFullYear(d.getFullYear()-5);else return 0;return d.getTime();}
function tradeMarkerText(action){return action==='buy'?'买':action==='clear'?'清':'卖';}
function tradeDetail(t){const a=t.action==='buy'?'买入/加仓':t.action==='clear'?'全部卖出':'卖出/减仓',amt=Number(t.confirmed_amount??t.requested_amount),nav=Number(t.confirmed_nav);return`${a}${Number.isFinite(amt)&&amt>0?` · ¥${fmtMoney(amt)}`:''}${Number.isFinite(nav)&&nav>0?` · 净值 ${navFmt(nav)}`:''}`;}
function renderTrend(){const start=rangeStart(trendState.range),rows=trendState.rows.filter(x=>Number(x.x)>=start),trades=(trendState.trades||[]).filter(t=>!start||new Date(`${t.confirmed_date||t.requested_date}T00:00:00`).getTime()>=start);if(rows.length<2){$('#trendLoading').textContent='该区间暂无足够走势数据';$('#trendLoading').classList.remove('hidden');return;}$('#trendLoading').classList.add('hidden');const ys=rows.map(x=>Number(x.y)),min=Math.min(...ys),max=Math.max(...ys),span=max-min||1,w=680,h=280,pad=18;const xp=i=>pad+i/(rows.length-1)*(w-pad*2),yp=v=>h-pad-(Number(v)-min)/span*(h-pad*2);const pts=rows.map((r,i)=>`${xp(i).toFixed(2)},${yp(r.y).toFixed(2)}`).join(' ');const rowMs=rows.map(r=>Number(r.x));const groups=new Map();for(const t of trades){const date=t.confirmed_date||t.requested_date,tm=new Date(`${date}T00:00:00`).getTime();if(!Number.isFinite(tm))continue;let idx=0,best=Infinity;for(let i=0;i<rowMs.length;i++){const d=Math.abs(rowMs[i]-tm);if(d<best){best=d;idx=i;}}const action=t.action==='buy'?'buy':t.action==='clear'?'clear':'sell',key=`${idx}:${action}`;if(!groups.has(key))groups.set(key,{idx,action,trades:[]});groups.get(key).trades.push(t);}const showText=trendState.range==='1m'||trendState.range==='3m',compact=['3y','5y','all'].includes(trendState.range),markerData=[];let markerHtml='';for(const g of groups.values()){const row=rows[g.idx],x=xp(g.idx),nav=Number(g.trades[0]?.confirmed_nav)||Number(row.y),base=yp(nav),y=Math.max(pad+4,Math.min(h-pad-4,base+(g.action==='buy'?-7:7))),gi=markerData.length;markerData.push(g);markerHtml+=`<circle class="trade-marker ${g.action}" cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${compact?3.3:4.5}" data-trade-group="${gi}"/>`;if(showText)markerHtml+=`<text class="trade-marker-label ${g.action}" x="${x.toFixed(2)}" y="${(g.action==='buy'?y-9:y+11).toFixed(2)}">${tradeMarkerText(g.action)}${g.trades.length>1?g.trades.length:''}</text>`;}$('#trendChart').innerHTML=`<polyline fill="none" stroke="#2f6fed" stroke-width="3" vector-effect="non-scaling-stroke" points="${pts}"/><line x1="${pad}" y1="${h-pad}" x2="${w-pad}" y2="${h-pad}" stroke="#e5eaf2"/>${markerHtml}`;const tip=$('#trendTooltip'),wrap=$('.trend-chart-wrap');$$('#trendChart [data-trade-group]').forEach(el=>el.addEventListener('click',ev=>{ev.stopPropagation();const g=markerData[Number(el.dataset.tradeGroup)],cx=Number(el.getAttribute('cx')),cy=Number(el.getAttribute('cy'));tip.innerHTML=g.trades.map(t=>esc(`${t.confirmed_date||t.requested_date} · ${tradeDetail(t)}`)).join('<br>');tip.style.left=`${cx/w*wrap.clientWidth}px`;tip.style.top=`${cy/h*wrap.clientHeight}px`;tip.classList.remove('hidden');}));$('#trendChart').onclick=()=>tip?.classList.add('hidden');const first=Number(rows[0].y),last=Number(rows.at(-1).y),ret=(last/first-1)*100;$('#trendReturn').textContent=fmtPct(ret);$('#trendReturn').className=cls(ret);$('#trendLatest').textContent=navFmt(last);$('#trendHigh').textContent=navFmt(max);$('#trendLow').textContent=navFmt(min);$('#trendPeriod').textContent=`${new Date(rows[0].x).toLocaleDateString('zh-CN')} → ${new Date(rows.at(-1).x).toLocaleDateString('zh-CN')} · ${trades.length}笔已确认交易`;}

function bind(){
  $('#loginBtn').onclick=async()=>{const b=$('#loginBtn');b.disabled=true;b.textContent='验证中…';setLoginStatus('正在验证账号和密码…','checking');try{clearSensitiveState();await login($('#emailInput').value.trim(),$('#passwordInput').value);localStorage.setItem(TRUSTED_DEVICE_KEY,'1');$('#passwordInput').value='';setLoginStatus('登录成功：这台手机已记住登录，以后可自动进入。','ok');render();toast('安全登录成功');if(isCnTradingAutoWindow())refreshQuotes({force:false,skipCloud:true,silent:true});}catch(e){clearSession();clearSensitiveState();localStorage.removeItem(TRUSTED_DEVICE_KEY);setLoginStatus(e.message,'error');render();toast(e.message,3500);}finally{b.disabled=false;b.textContent='安全登录';}};$('#passwordInput').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();$('#loginBtn').click();}});
  $('#refreshBtn').onclick=()=>refreshQuotes({force:true,skipCloud:false,silent:false});$('#copyBtn').onclick=copySummary;$('#tradeBtn').onclick=()=>{renderTradeFundSelect();openSheet('tradeSheet')};$('#settingsBtn').onclick=()=>{renderSettings();openSheet('settingsSheet')};$('#cloudBtn').onclick=()=>{renderHistory();openSheet('historySheet')};$('#diagBtn').onclick=()=>openSheet('diagSheet');$('#runDiagBtn').onclick=runDiag;$('#logoutBtn').onclick=logout;
  $('#tradeFundSelect').onchange=()=>syncTradePicker(true);$('#tradeAction').onchange=()=>updateTradeActionUI(false);$('#lookupTradeBtn').onclick=lookupTrade;$('#saveTradeBtn').onclick=saveTrade;$('#tradeCode').addEventListener('input',()=>{if($('#tradeFundSelect').value!=='__new__')return;const v=$('#tradeCode').value.trim();if(v.length===6)lookupTrade();else{$('#matchedFund').textContent='输入6位基金代码自动识别';$('#tradeFundSummary').textContent='新基金：输入6位基金代码识别后记录买入；确认进入账本后会自动出现在这里。';}});
  $('#addFundBtn').onclick=addSetting;$('#autoMatchBtn').onclick=autoMatch;$('#saveSettingsBtn').onclick=saveSettings;
  $('#sheetBackdrop').onclick=closeSheets;$$('[data-close]').forEach(b=>b.onclick=closeSheets);
  $$('.filter').forEach(b=>b.onclick=()=>{$$('.filter').forEach(x=>x.classList.remove('active'));b.classList.add('active');currentFilter=b.dataset.filter;renderFunds(state.cores.filter(c=>c.enabled!==false));});
  $('#fundList').addEventListener('click',e=>{const card=e.target.closest('.fund-card');if(card)openTrend(card.dataset.code);});
  $('#tradeHistory').addEventListener('click',e=>{const b=e.target.closest('[data-cancel-trade]');if(b&&confirm('撤销这条待确认操作？'))cancelTrade(b.dataset.code,b.dataset.cancelTrade);});
  $('#settingsList').addEventListener('click',e=>{const del=e.target.closest('[data-delete]');if(del){if(confirm('确定删除这只基金？保存后旧主线仍会进入历史，最多保留30条。')){state.cores.splice(Number(del.dataset.delete),1);renderSettings();}return;}const look=e.target.closest('[data-lookup]');if(look)lookupSetting(Number(look.dataset.lookup));});
  $('#historyList').addEventListener('click',async e=>{const b=e.target.closest('[data-restore]');if(!b)return;if(!confirm(`确定把 ${fmtTime(b.dataset.time)} 的内容设为新的最新主线吗？\n\n当前主线会先进入历史，所以仍可反悔。`))return;try{await restoreHistory(b.dataset.restore);renderHistory();toast('历史版本已生成新的最新主线');}catch(err){if(err.code==='revision_conflict'){await loadCloud();renderHistory();toast('云端已被其他设备更新，请重新选择',3500);}else toast(err.message,3500);}});
  $$('#bottomNav [data-nav]').forEach(b=>b.onclick=()=>{const n=b.dataset.nav;$$('#bottomNav button').forEach(x=>x.classList.toggle('active',x===b));if(n==='home')window.scrollTo({top:0,behavior:'smooth'});if(n==='trade'){renderTradeFundSelect();openSheet('tradeSheet');}if(n==='history'){renderHistory();openSheet('historySheet');}if(n==='settings'){renderSettings();openSheet('settingsSheet');}});
  $('#trendCloseBtn').onclick=()=>$('#trendModal').classList.add('hidden');$('#trendModal').addEventListener('click',e=>{if(e.target===$('#trendModal'))$('#trendModal').classList.add('hidden');});$$('#trendTabs button').forEach(b=>b.onclick=()=>{$$('#trendTabs button').forEach(x=>x.classList.remove('active'));b.classList.add('active');trendState.range=b.dataset.range;renderTrend();});
  window.addEventListener('online',()=>{if(state.session&&state.authenticated)loadCloud().then(()=>toast('网络已恢复，主线已刷新')).catch(()=>{});});
}

async function start(){
  bind();loadPublicCache();
  let trusted=false;
  const firstSecureRun=localStorage.getItem(PRIVACY_MIGRATION_KEY)!=='1';
  if(firstSecureRun){
    // v2.3.6 第一次运行：旧版本留下的任何会话都不算“已授权”。
    clearSession();clearSensitiveState();clearSensitiveCache();
    try{
      localStorage.removeItem(TRUSTED_DEVICE_KEY);
      for(let i=localStorage.length-1;i>=0;i--){
        const k=localStorage.key(i);
        if(k&&k.startsWith('sb-')&&k.includes('auth-token'))localStorage.removeItem(k);
      }
      localStorage.setItem(PRIVACY_MIGRATION_KEY,'1');
    }catch(_){}
    setLoginStatus('新版首次使用：请手动输入密码并点击“安全登录”一次。登录成功后，这台手机以后会自动进入。','checking');
  }else{
    try{trusted=localStorage.getItem(TRUSTED_DEVICE_KEY)==='1';}catch(_){trusted=false;}
    if(trusted){
      try{state.session=JSON.parse(localStorage.getItem(SESSION_KEY)||'null');}catch(_){state.session=null;}
      if(!state.session){
        trusted=false;
        try{localStorage.removeItem(TRUSTED_DEVICE_KEY);}catch(_){}
      }
    }else{
      // 没有在 v2.3.6 中成功登录过，就绝不接受旧会话自动进入。
      clearSession();
      setLoginStatus('请输入账号和密码，并点击“安全登录”。仅点击输入框不会进入看板。');
    }
  }
  state.authenticated=false;clearSensitiveState();
  const d=new Date();$('#tradeDate').value=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  render();
  if(trusted&&state.session){
    setLoginStatus('正在验证这台已授权手机的登录状态…','checking');
    try{
      await verifySessionOnline();await loadCloud();setLoginStatus('已安全登录。','ok');render();
      if(isCnTradingAutoWindow())await refreshQuotes({force:false,skipCloud:true,silent:true});
      else setCloudStatus('私密云端已连接 · 非交易时段不自动刷新行情','ok');
    }catch(e){
      clearSession();clearSensitiveState();clearSensitiveCache();
      try{localStorage.removeItem(TRUSTED_DEVICE_KEY);}catch(_){}
      setLoginStatus(`${e.message}。请重新输入密码登录一次。`,'error');render();
    }
  }
  if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js?v=2.3.8').catch(()=>{});
}
start();
