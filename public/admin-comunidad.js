const $=id=>document.getElementById(id);const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));let auth='';let current={events:[],notices:[]};async function request(url,opts={}){opts.headers={...(opts.headers||{}),...(auth?{Authorization:'Basic '+auth}:{})};let r=await fetch(url,opts);if(r.status===401&&!auth){const u=prompt('Usuario de administrador');if(u===null)throw Error('Acceso cancelado');const p=prompt('Contraseña de administrador');if(p===null)throw Error('Acceso cancelado');auth=btoa(unescape(encodeURIComponent(u+':'+p)));opts.headers.Authorization='Basic '+auth;r=await fetch(url,opts);}const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'No se pudo completar la operación.');return d;}function formData(form){return Object.fromEntries(new FormData(form).entries())}function render(){ $('adminEvents').innerHTML=current.events.map(e=>`<li><div class="community-row"><div><b>${esc(e.name)}</b><br><small>${esc(e.date)} ${esc(e.time||'')} · ${esc(e.place||'')}</small></div><button class="community-button" data-event-del="${esc(e.id)}">Eliminar</button></div></li>`).join('')||'<li class="community-empty">Sin eventos.</li>'; $('adminNotices').innerHTML=current.notices.map(n=>`<li><div class="community-row"><div><b>${esc(n.title)}</b>${n.pinned?' ⭐':''}<p>${esc(n.body)}</p><small>${new Date(n.createdAt).toLocaleDateString('es-ES')}</small></div><button class="community-button" data-notice-del="${esc(n.id)}">Eliminar</button></div></li>`).join('')||'<li class="community-empty">Sin avisos.</li>';}async function load(){try{current=await request('/api/community/admin');render();$('authMsg').textContent='Panel conectado.';}catch(e){$('authMsg').textContent=e.message;}}$('eventForm').addEventListener('submit',async e=>{e.preventDefault();const form=e.currentTarget;const data=formData(form);try{const r=await request('/api/community/events',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});current=r.data;render();form.reset();$('eventMsg').textContent='Evento publicado.';}catch(err){$('eventMsg').textContent=err.message;}});$('noticeForm').addEventListener('submit',async e=>{e.preventDefault();const f=e.currentTarget;const data=formData(f);data.pinned=f.elements.pinned.checked;try{const r=await request('/api/community/notices',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});current=r.data;render();f.reset();$('noticeMsg').textContent='Aviso publicado.';}catch(err){$('noticeMsg').textContent=err.message;}});document.addEventListener('click',async e=>{const eb=e.target.closest('[data-event-del]');const nb=e.target.closest('[data-notice-del]');if(!eb&&!nb)return;if(!confirm('¿Eliminar esta publicación?'))return;try{const r=await request(eb?'/api/community/events/'+encodeURIComponent(eb.dataset.eventDel):'/api/community/notices/'+encodeURIComponent(nb.dataset.noticeDel),{method:'DELETE'});current=r.data;render();}catch(err){$('authMsg').textContent=err.message;}});load();
// ---- Carta del Salón de la Fama: categorías y foto manual ----
async function loadCardStats(){
  try{
    const d=await (await fetch('/api/community/overview')).json();
    const meta=d.config.cardStatMeta,activas=new Set(d.config.cardStats),disponibles=d.config.cardStatsDisponibles;
    $('cardStatsBox').innerHTML=disponibles.map(k=>`<button class="community-button${activas.has(k)?' primary':''}" data-stat="${k}">${meta[k].emoji} ${meta[k].label} ${activas.has(k)?'✓':'＋'}</button>`).join('');
  }catch(e){$('cardStatsBox').textContent='No se pudieron cargar las categorías.';}
}
$('cardStatsBox').addEventListener('click',async e=>{
  const b=e.target.closest('[data-stat]');if(!b)return;
  const activo=b.classList.contains('primary');
  try{
    await request(activo?'/api/admin/community/card-stats/'+encodeURIComponent(b.dataset.stat):'/api/admin/community/card-stats',{method:activo?'DELETE':'POST',headers:activo?{}:{'Content-Type':'application/json'},body:activo?undefined:JSON.stringify({key:b.dataset.stat})});
    loadCardStats();
  }catch(err){$('authMsg').textContent=err.message;}
});
$('adminFotoForm').addEventListener('submit',async e=>{
  e.preventDefault();
  const fd=new FormData(e.currentTarget);
  $('adminFotoMsg').textContent='Subiendo…';
  try{
    const d=await request('/api/admin/community/card-photo',{method:'POST',body:fd});
    $('adminFotoMsg').textContent='Foto guardada para '+fd.get('name')+'.';
    e.currentTarget.reset();
  }catch(err){$('adminFotoMsg').textContent=err.message;}
});
loadCardStats();
