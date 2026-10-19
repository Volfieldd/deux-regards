(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const photos = window.DARKROOM_PHOTOS;
  const concepts = window.DARKROOM_CONCEPTS;
  const params = new URLSearchParams(location.search);
  const validPistes = concepts.map(c => c[0]);
  const requested = params.get('piste') || document.body.dataset.piste;
  const piste = validPistes.includes(requested) ? requested : 'obscura';
  const page = location.pathname.split('/').pop() || 'index.html';
  const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const announce = text => { $('#announcement').textContent = text; };
  const url = (file, values = {}) => {
    const q = new URLSearchParams({piste,...values});
    return `${file}?${q}`;
  };
  const img = p => `<img src="assets/${p.id}.webp" alt="${esc(p.alt)}" width="${p.id === 'foret' ? 1024 : 1536}" height="${p.id === 'foret' ? 1536 : 1024}" loading="lazy">`;
  const shot = (p, values={}) => `<a class="shot" href="${esc(url('photo.html',{id:p.id,...values}))}">${img(p)}<span class="shot-label"><span>${esc(p.title)}</span><span class="mono">↗</span></span></a>`;
  // Static links retain the selected visual direction; only known local pages are changed.
  $$('a[href]').forEach(a => {
    const href = a.getAttribute('href');
    if (!/^[a-z-]+\.html(?:[?#]|$)/.test(href)) return;
    const target = new URL(href, location.href);
    const targetPage = target.pathname.split('/').pop();
    const targetConcept = targetPage.replace('.html','');
    if (!['index.html','admin.html'].includes(targetPage)) target.searchParams.set('piste',validPistes.includes(targetConcept) ? targetConcept : piste);
    if (target.pathname.endsWith('/photo.html') && validPistes.includes(page.replace('.html','')) && !target.searchParams.has('from')) target.searchParams.set('from', page.replace('.html',''));
    a.setAttribute('href',target.pathname.split('/').pop()+target.search+target.hash);
  });
  const nav = $('#navigation');
  const menu = $('.menu-toggle');
  menu.addEventListener('click', () => {
    const open = menu.getAttribute('aria-expanded') !== 'true';
    menu.setAttribute('aria-expanded',String(open)); nav.classList.toggle('open',open);
  });
  document.addEventListener('keydown',e => {
    if (e.key === 'Escape' && nav.classList.contains('open')) {
      nav.classList.remove('open'); menu.setAttribute('aria-expanded','false'); menu.focus();
    }
  });
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  let calm = false;
  try { calm = localStorage.getItem('darkroom-calm') === 'true'; } catch {}
  function applyCalm() {
    document.documentElement.dataset.calm = String(calm || media.matches);
    $('#calm').setAttribute('aria-pressed', String(calm || media.matches));
    $('#calm').textContent = media.matches ? 'Calme · système' : calm ? 'Mode calme activé' : 'Mode calme';
  }
  $('#calm').addEventListener('click', () => {
    if (media.matches) { announce('La réduction des animations est activée dans les préférences de votre appareil.'); return; }
    calm = !calm; applyCalm();
    try { localStorage.setItem('darkroom-calm',String(calm)); } catch { announce('Cette préférence reste active pour cette page ; le stockage du navigateur est indisponible.'); }
  });
  media.addEventListener('change',applyCalm); applyCalm();
  const lightbox = $('#lightbox');
  let opener;
  function openImage(p,trigger) {
    opener = trigger; lightbox.querySelector('img').src = `assets/${p.id}.webp`;
    lightbox.querySelector('img').alt = p.alt;
    lightbox.querySelector('p').textContent = `${p.title} · image générée`;
    lightbox.showModal();
  }
  $('.close-lightbox').addEventListener('click',()=>lightbox.close());
  lightbox.addEventListener('close',()=>opener?.focus());
  function setFrame(p) {
    const anchor = $('[data-main-photo]'); if (!anchor) return;
    anchor.href = url('photo.html',{id:p.id,from:page.replace('.html','')});
    const image = anchor.querySelector('img'); image.src = `assets/${p.id}.webp`; image.alt = p.alt;
    image.width = p.id === 'foret' ? 1024 : 1536; image.height = p.id === 'foret' ? 1536 : 1024;
    $('#frame-title').textContent = p.title;
    if ($('.print-caption .eyebrow')) $('.print-caption .eyebrow').textContent = `Collection imaginaire / ${p.theme}`;
    if (document.documentElement.dataset.calm !== 'true') image.animate([{opacity:.25},{opacity:1}],{duration:280,easing:'ease-out'});
    if ($('#frame-count')) $('#frame-count').textContent = `0${photos.indexOf(p)+1} / 04`;
    if ($('[data-screen-link]')) $('[data-screen-link]').href = anchor.href;
    $$('[data-frame]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.frame===p.id)));
  }
  let frame = photos.findIndex(p=>p.id===params.get('image'));
  if (frame<0) frame=page==='panoramique.html'?3:0;
  if ($('[data-main-photo]')) setFrame(photos[frame]);
  $$('[data-step]').forEach(b=>b.addEventListener('click',()=>{frame=(frame+Number(b.dataset.step)+photos.length)%photos.length;setFrame(photos[frame]);}));
  $$('[data-frame]').forEach(b=>b.addEventListener('click',()=>{frame=photos.findIndex(p=>p.id===b.dataset.frame);setFrame(photos[frame]);announce(photos[frame].title);}));
  let pair=0;
  $('#swap-pair')?.addEventListener('click',()=>{
    pair=1-pair; const selected=pair?[photos[2],photos[3]]:[photos[0],photos[1]];
    $('#diptych').innerHTML=selected.map(p=>shot(p,{from:'resonances'})).join('');
    $('#pair-number').textContent=pair?'DIALOGUE 02 — LA LUMIÈRE':'DIALOGUE 01 — MATIÈRES';
    $('.diptych-caption p').innerHTML=pair?'Attendre la lumière.<br>La laisser nous surprendre.':'La même courbe.<br>Deux façons de la voir.';
  });
  const normalize=s=>s.toLocaleLowerCase('fr').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  const filtered=(query,theme)=>photos.filter(p=>(!theme || p.theme===theme)&&normalize(`${p.title} ${p.theme} ${p.note}`).includes(normalize(query.trim())));
  if ($('#filters')) {
    $('#query').value=params.get('q') || '';
    $('#theme').value=params.get('theme') || '';
    function filter() {
      const q=$('#query').value, theme=$('#theme').value, list=filtered(q,theme);
      $('#gallery-grid').innerHTML=list.map(p=>shot(p,{from:'galerie',q,theme})).join('');
      $('#result-count').textContent=`${list.length} image${list.length!==1?'s':''}`;
      $('#empty').hidden=list.length!==0;
    }
    $('#filters').addEventListener('submit',e=>e.preventDefault());
    $('#query').addEventListener('input',filter);
    $('#theme').addEventListener('change',filter);
    $('#filters').addEventListener('reset',()=>setTimeout(filter,0));
    $('#reset-search').addEventListener('click',()=>{$('#filters').reset();$('#query').focus();});
    filter();
  }
  if ($('#main-image')) {
    const p=photos.find(p=>p.id===params.get('id')) || photos[0];
    const from=params.get('from') || 'galerie';
    const q=params.get('q')||'', theme=params.get('theme')||'';
    let sequence=from==='voyage'?[photos[0],photos[2],photos[3]]:from==='carnet'?[p]:filtered(q,theme);
    if (!sequence.includes(p)) sequence=photos;
    const index=sequence.indexOf(p);
    const image=$('#main-image');image.src=`assets/${p.id}.webp`;image.alt=p.alt;
    $('#photo-title').textContent=p.title;document.title=`${p.title} — Nicephos · Maquette`;
    $('#photo-note').textContent=p.note;$('#photo-theme').textContent=`${p.theme} / collection imaginaire`;
    $('#photo-counter').textContent=`${String(index+1).padStart(2,'0')} / ${String(sequence.length).padStart(2,'0')}`;
    const back=$('#back');
    if (from==='voyage') {back.href=url('voyage.html')+`#etape-${Math.max(1,[0,2,3].indexOf(photos.indexOf(p))+1)}`;back.textContent='← Revenir à cette étape';}
    else if(from==='carnet') {back.href=url('carnet.html',params.get('billet')==='ombre'?{billet:'ombre'}:{})+'#attendre';back.textContent='← Revenir au Carnet';}
    else if(validPistes.includes(from)) {back.href=url(from+'.html',{image:p.id});back.textContent='← Revenir à '+concepts.find(c=>c[0]===from)[1];}
    else {back.href=url('galerie.html',{q,theme});back.textContent='← Revenir à la collection';}
    function move(delta) {
      location.href=url('photo.html',{id:sequence[(index+delta+sequence.length)%sequence.length].id,from,q,theme,...(params.has('billet')?{billet:params.get('billet')}:{})});
    }
    $('#photo-prev').disabled=sequence.length<2;$('#photo-next').disabled=sequence.length<2;
    $('#photo-prev').addEventListener('click',()=>move(-1));$('#photo-next').addEventListener('click',()=>move(1));
    $('#enlarge').addEventListener('click',e=>openImage(p,e.currentTarget));
    $('#related').innerHTML=photos.filter(other=>other!==p).map(other=>shot(other,{from:from==='voyage'&&[0,2,3].includes(photos.indexOf(other))?'voyage':'galerie'})).join('');
  }
  if ($('#essay-title') && params.get('billet')==='ombre') {
    $('#essay-title').innerHTML='Laisser une place<br><em>à l’ombre.</em>';
    $('#essay-intro').textContent='Une image n’a pas besoin de tout expliquer. Ce qui disparaît peut aussi donner envie de regarder.';
    $('#essay-content').innerHTML=`<section id="attendre"><h2>Attendre.</h2><p>Quand la lumière tourne, elle dessine une frontière. Une partie du paysage s’efface, une autre prend soudain toute la place. On pourrait corriger cette différence. On peut aussi choisir de la regarder.</p></section><figure>${shot(photos[1],{from:'carnet',billet:'ombre'})}<figcaption>Image fictive générée pour cette étude.</figcaption></figure><section id="regarder"><h2>Regarder.</h2><p>L’ombre laisse de l’espace à celui qui regarde. Elle retire des détails, rend un contour plus net, permet à une couleur de respirer. Photographier n’est pas toujours ajouter.</p><blockquote>Le noir peut être une façon de faire place à la lumière.</blockquote></section><section id="revenir"><h2>Revenir.</h2><p>Au moment de choisir nos images, on peut se demander ce qui mérite vraiment d’être montré. Le reste n’est pas forcément perdu. Il donne à l’image sa réserve, sa profondeur, sa part de silence.</p><a class="text-link" href="${url('galerie.html')}">Retrouver les images ↗</a></section>`;
    document.title='Laisser une place à l’ombre — Nicephos · Maquette';
  }
  // Admin demonstrations: a separate memory model; no network or persistent business data.
  if ($('#admin-surface')) {
    const draftPhotos=photos.map(p=>({...p}));let edited=null,editOpener=null;
    const edit=$('#edit-photo');
    const sections={photos:['Photographies','Retrouvez vos images et complétez leur fiche avant de les partager.'],voyages:['Voyages & sorties','Un voyage rassemble les sorties et leur donne un fil conducteur.'],carnets:['Carnets','Un texte, des images, une pensée à partager.'],publication:['À vérifier','Relisez les contenus avant de décider de leur publication.'],reglages:['Réglages','Les choix communs au site, regroupés par intention.']};
    const draft={title:'Ce qu’on voit quand on ralentit.',text:'La photographie commence avant le déclenchement. Elle commence dans cette attention qu’on décide d’accorder à une chose ordinaire.'};
    let extraStep=false,notePublished=false;
    function renderAdmin() {
      const section=Object.hasOwn(sections,location.hash.slice(1))?location.hash.slice(1):'photos';
      $('#admin-title').textContent=sections[section][0];$('#admin-description').textContent=sections[section][1];$('#admin-status').textContent='';
      $$('.admin-sidebar a').forEach(a=>{if(a.hash==='#'+section)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
      const surface=$('#admin-surface');
      if(section==='photos')surface.innerHTML=draftPhotos.map(p=>`<div class="admin-row">${img(p)}<div><h3>${esc(p.title)}</h3><p>${esc(p.theme)} · image générée · fiche de démonstration</p></div><button data-edit="${p.id}">Modifier la fiche</button></div>`).join('');
      if(section==='voyages')surface.innerHTML=`<section class="admin-panel"><p class="eyebrow">VOYAGE IMAGINAIRE · BROUILLON</p><h3>Au bord du silence</h3><ol class="chapter-mini"><li>Le rivage <span>01</span></li><li>La forêt <span>02</span></li><li>Les cimes <span>03</span></li>${extraStep?'<li>Une nouvelle sortie <span>04</span></li>':''}</ol><p>Les étapes sont des sorties, dans leur ordre de visite.</p><button data-add-step ${extraStep?'disabled':''}>${extraStep?'Sortie ajoutée dans cet onglet':'Ajouter une sortie de démonstration'}</button> <a class="text-link" href="${url('voyage.html')}">Voir le récit de référence ↗</a><p>Le récit de référence reste fixe ; la sortie ajoutée n’a pas encore de photo.</p></section>`;
      if(section==='carnets')surface.innerHTML=`<form class="admin-panel" id="note-form"><p class="eyebrow">${notePublished?'PUBLICATION SIMULÉE':'BROUILLON DE DÉMONSTRATION'}</p><label for="note-title">Titre<input id="note-title" value="${esc(draft.title)}" maxlength="120" required></label><label for="note-body">Votre texte<textarea id="note-body" rows="7" required>${esc(draft.text)}</textarea></label><button type="submit">Enregistrer le brouillon</button> <button type="button" data-publish>Préparer la publication</button><p>Les essais restent dans cet onglet. Recharger la page les efface.</p></form>`;
      if(section==='publication')surface.innerHTML=`<section class="admin-panel"><h3>Les points à vérifier</h3><p>Titre, description, lieu autorisé et accords éventuels. Les images de cette maquette sont fictives et ne peuvent pas être publiées sur le site réel.</p><a class="text-link" href="#photos">Relire les fiches ↗</a></section>`;
      if(section==='reglages')surface.innerHTML='<div class="settings-grid">'+[['Site & identité','Nom, emblème, langues et présentation de l’accueil.'],['Images & protection','Variantes, filigranes et métadonnées autorisées.'],['Équipe & publication','Comptes, rôles et circuit de validation.'],['Droits & confidentialité','Accords, mentions et signalements.'],['Assistants & outils','Aides à la rédaction et outils de terrain.'],['Historique & sécurité','Actions récentes et gestion des accès.']].map(([title,text])=>`<details><summary>${title}</summary><p>${text}</p><p>Rubrique explicative de la maquette ; aucun réglage réel connecté.</p></details>`).join('')+'</div>';
      surface.querySelectorAll('[data-edit]').forEach(b=>b.addEventListener('click',()=>{
        edited=draftPhotos.find(p=>p.id===b.dataset.edit);editOpener=b;$('#edit-name').value=edited.title;$('#edit-description').value=edited.alt;edit.showModal();
      }));
      $('[data-add-step]')?.addEventListener('click',()=>{extraStep=true;renderAdmin();$('#admin-status').textContent='Sortie ajoutée dans la maquette. Aucune donnée envoyée.';});
      $('#note-form')?.addEventListener('input',()=>{draft.title=$('#note-title').value;draft.text=$('#note-body').value;$('#note-title').setCustomValidity('');$('#note-body').setCustomValidity('');});
      function validNote() {
        $('#note-title').setCustomValidity(draft.title.trim()?'':'Donnez un titre au Carnet.');
        $('#note-body').setCustomValidity(draft.text.trim()?'':'Ajoutez un texte au Carnet.');
        return $('#note-form').reportValidity();
      }
      $('#note-form')?.addEventListener('submit',e=>{e.preventDefault();if(validNote())$('#admin-status').textContent='Brouillon conservé dans cet onglet.';});
      $('[data-publish]')?.addEventListener('click',e=>{
        if(!validNote())return;
        const confirm=document.createElement('dialog');confirm.setAttribute('aria-labelledby','confirm-title');
        confirm.innerHTML=`<h2 id="confirm-title">Confirmer la simulation</h2><p style="margin-top:20px">${esc(draft.title)}</p><p class="muted">Aucune publication sur le site réel.</p><div class="dialog-actions"><button data-cancel>Annuler</button><button data-confirm>Confirmer la simulation</button></div>`;
        const trigger=e.currentTarget;document.body.append(confirm);confirm.showModal();
        confirm.querySelector('[data-cancel]').addEventListener('click',()=>confirm.close());
        confirm.querySelector('[data-confirm]').addEventListener('click',()=>{notePublished=true;confirm.close();renderAdmin();$('#admin-status').textContent='Publication simulée dans cet onglet. Rien n’a été envoyé.';$('[data-publish]').focus();});
        confirm.addEventListener('close',()=>{confirm.remove();if(trigger.isConnected)trigger.focus();});
      });
    }
    $('#edit-name').addEventListener('input',()=>$('#edit-name').setCustomValidity(''));
    $('#edit-description').addEventListener('input',()=>$('#edit-description').setCustomValidity(''));
    $('#edit-form').addEventListener('submit',e=>{
      e.preventDefault();$('#edit-name').setCustomValidity($('#edit-name').value.trim()?'':'Donnez un titre à l’image.');$('#edit-description').setCustomValidity($('#edit-description').value.trim()?'':'Ajoutez une description.');
      if(!$('#edit-form').reportValidity())return;
      edited.title=$('#edit-name').value.trim();edited.alt=$('#edit-description').value.trim();
      const id=edited.id;edit.close();renderAdmin();$('#admin-status').textContent='Fiche modifiée dans cet onglet uniquement.';editOpener=$(`[data-edit="${id}"]`);editOpener.focus();
    });
    $('#cancel-edit').addEventListener('click',()=>edit.close());edit.addEventListener('close',()=>editOpener?.focus());
    window.addEventListener('hashchange',()=>{renderAdmin();$('#admin-title').setAttribute('tabindex','-1');$('#admin-title').focus();});renderAdmin();
  }
})();
