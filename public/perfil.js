const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels={cervezas:'🍺 Cervezas',cubatas:'🍹 Cubatas',chupitos:'🥃 Chupitos',porros:'🌿 Porros'};
const params=new URLSearchParams(location.search);
function pintarFrase(t){$('frase').textContent=t||'';$('frase').hidden=!t;}
// Solo el dueño del perfil (mismo dispositivo/nombre que en TKT365) ve el cuadro para cambiar su frase
async function habilitarFrase(p){
  let token='';try{token=localStorage.getItem('tkt-token')||'';}catch{}
  if(!token)return;
  try{
    const q=await (await fetch('/api/community/quien-soy?token='+encodeURIComponent(token))).json();
    if(!q.id||q.id!==p.name.toLocaleLowerCase('es'))return;
    $('fraseInput').value=$('frase').textContent;
    $('fraseForm').hidden=false;
    // Foto de la carta: solo la ve y la puede cambiar el dueño del perfil
    $('fotoForm').hidden=false;
    $('fotoInput').addEventListener('change',()=>{$('fotoNombre').textContent=$('fotoInput').files[0]?.name||'';});
    $('fotoForm').addEventListener('submit',async e=>{
      e.preventDefault();
      let foto=$('fotoInput').files[0];
      if(!foto){$('fotoMsg').textContent='Elige una foto primero.';return;}
      const boton=$('fotoForm').querySelector('button');boton.disabled=true;
      const tipoDe=f=>{const t=(f.type||'').toLowerCase();if(t)return t;const e=(f.name||'').split('.').pop().toLowerCase();return e==='gif'?'image/gif':/^(mp4|mov|m4v|webm|3gp|avi|mkv)$/.test(e)?'video/'+e:'image/'+e;};
      if(/^video\//i.test(tipoDe(foto))){
        // Vídeo -> GIF animado, conservando el fondo
        try{
          foto=await window.videoAGif(foto,pct=>{$('fotoMsg').textContent='Creando el GIF… '+pct+'%';});
        }catch(err){$('fotoMsg').textContent=err.message||'No se pudo convertir el vídeo.';boton.disabled=false;return;}
      }else if(!/^image\/gif$/i.test(tipoDe(foto))){
        $('fotoMsg').textContent='Quitando el fondo… (la primera vez tarda un poco)';
        try{
          foto=await window.quitarFondo(foto,pct=>{$('fotoMsg').textContent='Quitando el fondo… '+pct+'%';});
        }catch{
          $('fotoMsg').textContent='No se pudo quitar el fondo: se sube la foto tal cual…';
        }
      }
      const fd=new FormData();fd.set('name',p.name);fd.set('token',token);fd.set('foto',foto,foto.name);
      $('fotoMsg').textContent='Subiendo…';
      try{
        const r=await fetch('/api/community/card-photo',{method:'POST',body:fd});
        const d=await r.json();if(!r.ok)throw Error(d.error||'No se pudo subir la foto.');
        $('fotoMsg').textContent='¡Foto guardada!';location.reload();
      }catch(err){$('fotoMsg').textContent=err.message;boton.disabled=false;}
    });
    $('fraseForm').addEventListener('submit',async e=>{
      e.preventDefault();$('fraseMsg').textContent='Guardando…';
      try{
        const r=await fetch('/api/community/frase',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:p.name,token,texto:$('fraseInput').value})});
        const d=await r.json();if(!r.ok)throw Error(d.error||'No se pudo guardar.');
        pintarFrase(d.frase);$('fraseInput').value=d.frase;$('fraseMsg').textContent=d.frase?'¡Guardada!':'Frase quitada.';
      }catch(err){$('fraseMsg').textContent=err.message;}
    });
  }catch{}
}
const requested=params.get('name')||'';
const fmt=ts=>ts?new Date(ts).toLocaleString('es-ES'):'Fecha desconocida';
function cartaInner(p,meta,activas){
  const cant=n=>{n=Number(n)||0;return n>=1000?(n/1000).toFixed(1).replace('.0','')+'k':n;};
  const huecos=Array.from({length:Math.max(5,activas.length)},(_,i)=>activas[i]);
  return `<div class="tc-inner"><div class="tc-media">${p.media||0}<small>#${p.puesto}</small></div><div class="tc-escudo"><img src="assets/carta-logo-oso.png" alt="Traketeros"></div><div class="tc-foto-wrap${p.foto&&p.foto.sinFondo?' recorte':''}">${p.foto?`<img src="${esc(p.foto.url)}" alt="">`:'<span class="tc-foto-vacia">👤</span>'}</div><div class="tc-nombre">${esc(p.name)}</div><div class="tc-stats">${huecos.map(k=>k?`<div class="tc-stat" title="${esc(meta[k].label)}: ${p[k]||0} en total"><i>${esc(meta[k].emoji)}</i><b>${cant(p[k])}</b></div>`:'<div class="tc-stat"></div>').join('')}</div></div>`;
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
  pintarFrase(d.frase);
  document.title='Traketeros · '+p.name;
  $('totals').innerHTML=Object.entries(labels).map(([k,v])=>`<div class="community-stat"><span>${v}</span><b>${p[k]||0}</b></div>`).join('')+`<div class="community-stat"><span>⭐ Puntos</span><b>${p.puntos||0}</b></div><div class="community-stat"><span>📝 Registros</span><b>${p.apuntes||0}</b></div>`;
  $('recent').innerHTML=Object.entries(labels).map(([k,v])=>`<div class="community-stat"><span>${v}</span><b>${d.recent[k]||0}</b></div>`).join('');
  $('activity').innerHTML=(d.activity||[]).map(a=>`<li><div class="community-row"><b>${labels[a.tipo]||esc(a.tipo)} × ${Number(a.cantidad)||1}</b><small>${fmt(a.ts)}</small></div>${a.foto?.url?`<a href="${esc(a.foto.url)}" target="_blank" rel="noopener">Ver foto del registro ↗</a>`:''}</li>`).join('')||'<li class="community-empty">No hay actividad detallada guardada para este perfil.</li>';
  const meta=(d.config&&d.config.cardStatMeta)||{};
  const activas=((d.config&&d.config.cardStats)||[]).filter(k=>meta[k]);
  pintarCarta(p,meta,activas);
  habilitarFrase(p);
}).catch(e=>{
  $('name').textContent='Perfil no encontrado';
  $('msg').textContent=e.message;
});
