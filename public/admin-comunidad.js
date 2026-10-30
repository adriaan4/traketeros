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
// Lista de personas (la misma que en las frases) para elegir a quién se le pone la foto
(async function cargarPersonasFoto(){
  const sel=$('fotoPersona');
  try{
    const o=await (await fetch('/api/community/overview')).json();
    const gente=(o.people||[]).slice().sort((a,b)=>a.name.localeCompare(b.name,'es'));
    sel.innerHTML=gente.map(p=>`<option value="${esc(p.name)}">${esc(p.name)}${p.foto?' 📷':''}</option>`).join('');
  }catch(e){$('adminFotoMsg').textContent='No se pudieron cargar las personas.';}
})();
setTimeout(()=>{if(window.precargarQuitarFondo)window.precargarQuitarFondo();},1500);

// Foto de alguien: se prepara en el navegador (vídeo -> GIF, o se quita el fondo) y se sube UNA sola vez.
$('adminFotoForm').addEventListener('submit',async e=>{
  e.preventDefault();
  const form=e.currentTarget,msg=$('adminFotoMsg'),btn=form.querySelector('button[type=submit]');
  const name=$('fotoPersona').value,orig=form.elements.foto.files[0];
  if(!name||!orig){msg.textContent='Elige una persona y una foto.';return;}
  btn.disabled=true;
  const tipoDe=f=>{const t=(f.type||'').toLowerCase();if(t)return t;const x=(f.name||'').split('.').pop().toLowerCase();return x==='gif'?'image/gif':/^(mp4|mov|m4v|webm|3gp|avi|mkv)$/.test(x)?'video/'+x:'image/'+x;};
  let f=orig;
  try{
    const tipo=tipoDe(orig);
    if(/^video\//i.test(tipo)){
      msg.textContent='Creando el GIF…';
      try{f=await window.videoAGif(orig,p=>{msg.textContent='Creando el GIF… '+p+'%';});}
      catch(err){msg.textContent=err.message||'No se pudo convertir el vídeo.';btn.disabled=false;return;}
    }else if(!/^image\/gif$/i.test(tipo)){
      msg.textContent='Quitando el fondo… (la primera vez tarda un poco)';
      try{f=await window.quitarFondo(orig,p=>{msg.textContent='Quitando el fondo… '+p+'%';});}
      catch{
        // Sin recorte: se sube reducida (más rápido que mandar el original de varios MB)
        msg.textContent='No se pudo quitar el fondo: se sube la foto tal cual…';
        try{f=await window.reducirFoto(orig);}catch{f=orig;}
      }
    }
    msg.textContent='Subiendo…';
    const fd=new FormData();fd.set('name',name);fd.set('foto',f,f.name);
    const ctl=new AbortController(),t=setTimeout(()=>ctl.abort(),120000);
    try{await request('/api/admin/community/card-photo',{method:'POST',body:fd,signal:ctl.signal});}
    finally{clearTimeout(t);}
    msg.textContent='Foto guardada para '+name+'.';
    form.reset();
    const opt=[...$('fotoPersona').options].find(o=>o.value===name);if(opt&&!opt.textContent.includes('📷'))opt.textContent+=' 📷';
    $('fotoPersona').value=name;
  }catch(err){
    msg.textContent=err.name==='AbortError'?'Tardó demasiado en subir. Prueba con una foto más ligera.':(err.message==='Failed to fetch'?'Sin conexión con el servidor. Inténtalo de nuevo.':err.message);
  }finally{btn.disabled=false;}
});
loadCardStats();
