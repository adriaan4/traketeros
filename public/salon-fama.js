const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const TIPOS_BASE=['cervezas','cubatas','chupitos','porros'];
function cartaHTML(p,meta,activas){
  return `<a class="trake-carta tc-clicable" href="perfil.html?name=${encodeURIComponent(p.name)}"><div class="tc-inner"><div class="tc-rank">${p.puesto}<small>TKT</small></div><div class="tc-foto-wrap">${p.foto?`<img src="${esc(p.foto.url)}" alt="">`:'<span class="tc-foto-vacia">👤</span>'}</div><div class="tc-nombre">${esc(p.name)}</div><div class="tc-linea"></div><div class="tc-stats">${activas.map(k=>`<div class="tc-stat"><span class="tc-emoji">${meta[k].emoji}</span>${p[k]||0}</div>`).join('')}</div><div class="tc-escudo"><img src="assets/traketeros.png" alt="Traketeros"></div></div></a>`;
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
