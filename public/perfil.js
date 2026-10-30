const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels={cervezas:'🍺 Cervezas',cubatas:'🍹 Cubatas',chupitos:'🥃 Chupitos',porros:'🌿 Porros'};
const params=new URLSearchParams(location.search);
const requested=params.get('name')||'';
const fmt=ts=>ts?new Date(ts).toLocaleString('es-ES'):'Fecha desconocida';
function cartaInner(p,meta,activas){
  const r=p.rating||{};
  const huecos=Array.from({length:Math.max(5,activas.length)},(_,i)=>activas[i]);
  return `<div class="tc-inner"><div class="tc-media">${p.media||0}<small>#${p.puesto}</small></div><div class="tc-escudo"><img src="assets/carta-logo-oso.png" alt="Traketeros"></div><div class="tc-foto-wrap">${p.foto?`<img src="${esc(p.foto.url)}" alt="">`:'<span class="tc-foto-vacia">👤</span>'}</div><div class="tc-nombre">${esc(p.name)}</div><div class="tc-stats">${huecos.map(k=>k?`<div class="tc-stat" title="${esc(meta[k].label)}: ${p[k]||0} en total"><i>${esc(meta[k].emoji)}</i><b>${r[k]||0}</b></div>`:'<div class="tc-stat"></div>').join('')}</div></div>`;
}
function pintarCarta(p,meta,activas){
  $('carta').hidden=false;
  $('carta').innerHTML=cartaInner(p,meta,activas);
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
}).catch(e=>{
  $('name').textContent='Perfil no encontrado';
  $('msg').textContent=e.message;
});
