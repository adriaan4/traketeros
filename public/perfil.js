const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels={cervezas:'🍺 Cervezas',cubatas:'🍹 Cubatas',chupitos:'🥃 Chupitos',porros:'🌿 Porros'};
const params=new URLSearchParams(location.search);
const requested=params.get('name')||'';
const fmt=ts=>ts?new Date(ts).toLocaleString('es-ES'):'Fecha desconocida';
// Mismo token de dispositivo que usa TKT365 (localStorage: "tkt-token"): así la identidad
// ("quién soy") es una sola para toda la web, igual que para apostar.
function tokenDispositivo(){
  let t='';
  try{t=localStorage.getItem('tkt-token')||'';}catch{}
  if(!/^[a-f0-9]{32}$/.test(t)){
    const b=new Uint8Array(16);crypto.getRandomValues(b);
    t=[...b].map(x=>x.toString(16).padStart(2,'0')).join('');
    try{localStorage.setItem('tkt-token',t);}catch{}
  }
  return t;
}
const TOKEN=tokenDispositivo();
function cartaInner(p,meta,activas){
  const r=p.rating||{};
  const abre=k=>String(meta[k].label||k).slice(0,3).toUpperCase();
  return `<div class="tc-inner"><div class="tc-media">${p.media||0}<small>#${p.puesto}</small></div><div class="tc-escudo"><img src="assets/carta-logo.png" alt="Traketeros"></div><div class="tc-foto-wrap">${p.foto?`<img src="${esc(p.foto.url)}" alt="">`:'<span class="tc-foto-vacia">👤</span>'}</div><div class="tc-nombre">${esc(p.name)}</div><div class="tc-stats" style="--cols:${activas.length<=4?2:3}">${activas.map(k=>`<div class="tc-stat" title="${esc(meta[k].label)}: ${p[k]||0} consumidos"><b>${r[k]||0}</b><span>${abre(k)}</span></div>`).join('')}</div></div>`;
}
function pintarCarta(p,meta,activas){
  $('carta').dataset.cols=activas.length<=4?2:3;
  $('carta').innerHTML=cartaInner(p,meta,activas);
  $('cardWrap').style.display='';
}
if(!requested){
  $('name').textContent='Perfil no seleccionado';
  $('msg').textContent='Abre un perfil desde el ranking del Traketímetro o el Dashboard.';
}else fetch('/api/community/profile?name='+encodeURIComponent(requested)).then(async r=>{
  const d=await r.json();
  if(!r.ok)throw Error(d.error||'No se pudo cargar el perfil');
  return d;
}).then(async d=>{
  const p=d.person;
  if(d.config&&d.config.cigarros&&d.config.cigarros.activo)labels.cigarros='🚬 Cigarros';
  $('name').textContent=p.name;
  document.title='Traketeros · '+p.name;
  $('totals').innerHTML=Object.entries(labels).map(([k,v])=>`<div class="community-stat"><span>${v}</span><b>${p[k]||0}</b></div>`).join('')+`<div class="community-stat"><span>⭐ Puntos</span><b>${p.puntos||0}</b></div><div class="community-stat"><span>📝 Registros</span><b>${p.apuntes||0}</b></div>`;
  $('recent').innerHTML=Object.entries(labels).map(([k,v])=>`<div class="community-stat"><span>${v}</span><b>${d.recent[k]||0}</b></div>`).join('');
  $('activity').innerHTML=(d.activity||[]).map(a=>`<li><div class="community-row"><b>${labels[a.tipo]||esc(a.tipo)} × ${Number(a.cantidad)||1}</b><small>${fmt(a.ts)}</small></div>${a.foto?.url?`<a href="${esc(a.foto.url)}" target="_blank" rel="noopener">Ver foto del registro ↗</a>`:''}</li>`).join('')||'<li class="community-empty">No hay actividad detallada guardada para este perfil.</li>';
  const meta=(d.config&&d.config.cardStatMeta)||{};
  const activas=((d.config&&d.config.cardStats)||[]).filter(k=>meta[k]);
  pintarCarta(p,meta,activas);
  // ¿Es ESTE dispositivo el dueño de este nombre? (misma identidad que en TKT365)
  try{
    const quien=await (await fetch('/api/community/quien-soy?token='+TOKEN)).json();
    const soyYo=quien.id===p.name.toLocaleLowerCase('es');
    if(soyYo){
      $('fotoBox').style.display='';
    }else{
      $('fotoBox').style.display='';
      $('fotoBox').innerHTML=quien.id
        ?`<p class="community-muted">Esta carta es de ${esc(p.name)}. Solo su dispositivo puede cambiar su foto (como en TKT365).</p>`
        :`<p class="community-muted">Para subir tu foto primero tienes que elegir tu nombre en <a href="tkt365.html">TKT365</a> (igual que para apostar). Luego vuelve a tu perfil.</p>`;
    }
  }catch{ $('fotoBox').innerHTML=''; }
}).catch(e=>{
  $('name').textContent='Perfil no encontrado';
  $('msg').textContent=e.message;
});
$('fotoForm').addEventListener('submit',async e=>{
  e.preventDefault();
  const fd=new FormData(e.currentTarget);
  fd.set('name',requested);
  fd.set('token',TOKEN);
  $('fotoMsg').textContent='Subiendo…';
  try{
    const r=await fetch('/api/community/card-photo',{method:'POST',body:fd});
    const d=await r.json();
    if(!r.ok)throw Error(d.error||'No se pudo subir la foto.');
    $('fotoMsg').textContent='¡Foto guardada!';
    location.reload();
  }catch(err){
    $('fotoMsg').textContent=err.message;
  }
});
