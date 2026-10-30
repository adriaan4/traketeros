const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const TIPOS_BASE=['cervezas','cubatas','chupitos','porros'];
function cartaInner(p,meta,activas){
  const r=p.rating||{};
  const huecos=Array.from({length:Math.max(5,activas.length)},(_,i)=>activas[i]);
  return `<div class="tc-inner"><div class="tc-media">${p.media||0}<small>#${p.puesto}</small></div><div class="tc-escudo"><img src="assets/carta-logo-oso.png" alt="Traketeros"></div><div class="tc-foto-wrap">${p.foto?`<img src="${esc(p.foto.url)}" alt="">`:'<span class="tc-foto-vacia">👤</span>'}</div><div class="tc-nombre">${esc(p.name)}</div><div class="tc-stats">${huecos.map(k=>k?`<div class="tc-stat" title="${esc(meta[k].label)}: ${p[k]||0} en total"><i>${esc(meta[k].emoji)}</i><b>${r[k]||0}</b></div>`:'<div class="tc-stat"></div>').join('')}</div></div>`;
}
function cartaHTML(p,meta,activas){
  return `<a class="trake-carta tc-clicable" href="perfil.html?name=${encodeURIComponent(p.name)}">${cartaInner(p,meta,activas)}</a>`;
}
function pintarCartas(d){
  const meta=d.config&&d.config.cardStatMeta||{};
  const activas=(d.config&&d.config.cardStats||[]).filter(k=>meta[k]);
  const top=[...(d.people||[])].slice(0,12);
  document.getElementById('cartas').innerHTML=top.map(p=>cartaHTML(p,meta,activas)).join('')||'<p class="community-empty">Todavía no hay cartas: apunta algo en el Traketímetro.</p>';
}
fetch('/api/community/overview').then(r=>r.json()).then(d=>{
  pintarCartas(d);
  const cig=Boolean(d.config&&d.config.cigarros&&d.config.cigarros.activo);
  document.getElementById('cardCigarros').style.display=cig?'':'none';
  for(const k of cig?[...TIPOS_BASE,'cigarros']:TIPOS_BASE){
    const people=[...(d.people||[])].sort((a,b)=>(b[k]||0)-(a[k]||0)||a.name.localeCompare(b.name,'es'));
    document.getElementById(k).innerHTML=`<table class="community-table"><thead><tr><th>#</th><th>Traketero</th><th>Total</th><th>Otros totales</th></tr></thead><tbody>${people.slice(0,20).map((p,i)=>`<tr><td>${i+1}</td><td><a href="perfil.html?name=${encodeURIComponent(p.name)}">${esc(p.name)}</a></td><td><b>${p[k]||0}</b></td><td>🍺 ${p.cervezas} · 🍹 ${p.cubatas} · 🥃 ${p.chupitos} · 🌿 ${p.porros}${cig?` · 🚬 ${p.cigarros||0}`:''}</td></tr>`).join('')||'<tr><td colspan="4">Todavía no hay datos históricos.</td></tr>'}</tbody></table>`;
  }
}).catch(()=>[...TIPOS_BASE,'cigarros'].forEach(k=>{const el=document.getElementById(k);if(el)el.textContent='No se pudieron cargar las estadísticas.'}));
