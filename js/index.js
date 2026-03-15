const ROOT_FOLDER_ID = "1ZDYPViPemR14Xgv8vQZHQSGmWjeqkr1Z";
const API_KEY = (window.CONFIG && window.CONFIG.API_KEY) || '';

if (!API_KEY) {
  console.warn('API key missing. Drive calls will fail. Add API_KEY before building.');
}

const driveNavProjects = document.getElementById("drive_nav_projects");
const driveNavBooks = document.getElementById("drive_nav_books");
const lightbox = document.getElementById("lightbox");
const nav = document.getElementById("static-nav");

const allcontainers = document.getElementById("containers");
const container = document.getElementById("image-container");
const coverContainer = document.getElementById("cover-container");
const hrContainer = document.getElementById("container-hr");
const descriptionContainer = document.getElementById("description-container");

const staticPortfolio = document.getElementById("nav-portfolio");
const staticProjects = document.getElementById("nav-projects");
const staticBooks = document.getElementById("nav-books");
const staticInfo = document.getElementById("nav-info");

let currentImages = [];
let currentIndex = 0;
const rootFolderMap = {};
let loadingFolderId = null;
let navLoadCounter = 0;
let loadSessionCounter = 0;
let activeLoadSession = 0;

function escapeHtml(str = "") {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function toggleNav(nav) {
  const hamburger = document.getElementById("hamburger")

  if (nav && nav.style) {
    nav.style.display = nav.style.display != 'flex'? 'flex' : '';
  }

  if (hamburger.classList.contains('hoverstate')) {
    hamburger.classList.remove('hoverstate');  
  }else{
    hamburger.classList.add('hoverstate');
  }
}

function removeInfo() {
  const infoEl = document.getElementById('page-info');
  if (infoEl) infoEl.remove();
  if (container) {
    container.style.display = '';
    container.classList.remove('close');
  }
  if (coverContainer) {
    coverContainer.classList.remove('open');
  }
  if (descriptionContainer) {
    descriptionContainer.innerHTML = "";
    descriptionContainer.classList.remove('open');
  }
  if (hrContainer) {
    hrContainer.classList.remove('open');
  }
  if (allcontainers) {
    allcontainers.classList.remove('close');
  }
}

async function driveFetch(queryParams) {
  const params = new URLSearchParams({
    key: API_KEY,
    includeItemsFromAllDrives: "true",
    supportsAllDrives: "true",
    pageSize: "1000",
    ...queryParams
  });

  const url = `https://www.googleapis.com/drive/v3/files?${params.toString()}`;
  const res = await fetch(url);
  return res.json();
}

async function fetchTextFileContent(fileId) {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&key=${API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch text file ${fileId}: ${res.status}`);
  return res.text();
}

async function buildRootFolderMap() {
  try {
    const q = `'${ROOT_FOLDER_ID}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    const data = await driveFetch({ q, fields: "files(id,name)" });
    if (Array.isArray(data.files)) {
      data.files.forEach(f => {
        rootFolderMap[f.name] = f.id;
      });
    }
  } catch (err) {
    console.error("Error building root folder map:", err);
  }
}

async function showSubfolders(parentId, targetNavEl, options = {}, loadId = null) {
  targetNavEl.innerHTML = "";
  if (loadId == null) {
    loadId = ++navLoadCounter;
    targetNavEl.dataset.loadId = String(loadId);
  } else {
    targetNavEl.dataset.loadId = String(loadId);
  }
  if (targetNavEl.dataset.loading === "true") return;
  targetNavEl.dataset.loading = "true";
  try {
    const q = `'${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    const data = await driveFetch({ q, fields: "files(id,name)" });
    if (!data.files || data.files.length === 0) {
      return;
    }
    data.files.sort((a,b) => (a.name||'').localeCompare(b.name||'', undefined, { numeric: true, sensitivity: 'base' }));
    if (targetNavEl.dataset.loadId !== String(loadId)) return;
    data.files.forEach(folder => {
      if (targetNavEl.dataset.loadId !== String(loadId)) return;
      const d = document.createElement("div");
      d.className = "drive-folder";
      d.textContent = folder.name;
      d.onclick = () => {
        const newLoadId = ++navLoadCounter;
        targetNavEl.dataset.loadId = String(newLoadId);
        loadFolder(folder.id, options);
        toggleNav(nav)
      };
      targetNavEl.appendChild(d);
    });
  } catch (err) {
    console.error("Error listing subfolders:", err);
  } finally {
    delete targetNavEl.dataset.loading;
  }
}

function preloadImage(src) {
  return new Promise((resolve) => {
    if (!src) return resolve({ src, ok: false });
    const img = new Image();
    img.onload = () => resolve({ src, ok: true });
    img.onerror = () => resolve({ src, ok: false });
    img.src = src;
  });
}

function findFolderIdByName(name) {
  const lc = (name || '').toLowerCase();
  for (const key of Object.keys(rootFolderMap)) {
    if ((key || '').toLowerCase() === lc) return rootFolderMap[key];
  }
  return null;
}

function buildInfoLinksFromFilename(filename) {
  if (!filename) return [];
  const nameNoExt = filename.replace(/\.[^/.]+$/, '');
  const parts = nameNoExt.split('-').map(p => p.trim()).filter(p => p.length);
  if (parts.length === 0) return [];
  if (/^\d+$/.test(parts[0])) parts.shift();
  return parts.map(p => p.trim()).filter(p => p.length);
}

async function loadFolder(folderId, options = { isBook: false, showText: true }) {
  removeInfo();
  const session = ++loadSessionCounter;
  activeLoadSession = session;
  loadingFolderId = folderId;
  container.innerHTML = "";
  coverContainer.innerHTML = "";
  descriptionContainer.innerHTML = "";
  coverContainer.classList.remove("open");
  allcontainers.classList.add("loading");
  descriptionContainer.classList.remove("open");
  hrContainer.classList.remove("open");
  lightbox.classList.remove("open");
  container.classList.remove("close");
  allcontainers.classList.remove("close");

  const q = `'${folderId}' in parents and trashed = false`;
  try {
    const data = await driveFetch({
      q,
      fields: "files(id,name,mimeType,shortcutDetails,iconLink,webViewLink),nextPageToken"
    });
    if (session !== activeLoadSession) return;
    if (!data.files || data.files.length === 0) {
      if (session === activeLoadSession) {
        allcontainers.classList.remove("loading");
        loadingFolderId = null;
      }
      return;
    }
    const resolved = data.files.map(f => {
      if (f.mimeType === "application/vnd.google-apps.shortcut" && f.shortcutDetails && f.shortcutDetails.targetId) {
        return {
          id: f.shortcutDetails.targetId,
          name: f.name || f.shortcutDetails.targetId,
          mimeType: f.shortcutDetails.targetMimeType || ""
        };
      }
      return f;
    });
    resolved.sort((a,b) => (a.name||'').localeCompare(b.name||'', undefined, { numeric: true, sensitivity: 'base' }));
    const textFiles = resolved.filter(f => {
      const name = (f.name || "").toLowerCase();
      return name.endsWith(".txt") || (f.mimeType || "").toLowerCase() === "text/plain";
    });
    const imageFiles = resolved.filter(f => {
      const mt = (f.mimeType || "").toLowerCase();
      return mt.startsWith("image/") || /\.(jpg|jpeg|png|gif|webp)$/i.test(f.name || "");
    });
    imageFiles.sort((a,b) => (a.name||'').localeCompare(b.name||'', undefined, { numeric: true, sensitivity: 'base' }));
    let coverFile = null;
    if (options.isBook) {
      const coverIdx = imageFiles.findIndex(f => /^cover\.(jpg|jpeg|png|webp)$/i.test((f.name || "")));
      if (coverIdx !== -1) {
        coverFile = imageFiles.splice(coverIdx, 1)[0];
      } else {
        if (imageFiles.length === 1) {
          coverFile = imageFiles.shift();
        }
      }
    }
    const preloadPromises = [];
    let coverUrl = null;
    if (coverFile) {
      coverUrl = `https://drive.google.com/thumbnail?id=${coverFile.id}&sz=w600`;
      preloadPromises.push(preloadImage(coverUrl));
    }
    const thumbUrls = imageFiles.map(f => `https://drive.google.com/thumbnail?id=${f.id}&sz=${options.isBook ? 'w800' : 'w400'}`);
    thumbUrls.forEach(u => preloadImage(u));
    let textFetchPromise = null;
    let chosenTextFile = null;
    if (options.showText && textFiles.length > 0) {
      const preferredNames = ["readme", "info", "description"];
      let chosen = textFiles[0];
      for (const pref of preferredNames) {
        const found = textFiles.find(f => ((f.name || "").toLowerCase().startsWith(pref)));
        if (found) { chosen = found; break; }
      }
      chosenTextFile = chosen;
      textFetchPromise = fetchTextFileContent(chosen.id)
        .then(txt => ({ ok: true, text: txt }))
        .catch(err => ({ ok: false, error: err }));
      preloadPromises.push(textFetchPromise);
    }
    await Promise.allSettled(preloadPromises);
    if (session !== activeLoadSession) return;
    allcontainers.classList.toggle('book-view', !!options.isBook);
    container.classList.toggle('book-spreads', !!options.isBook);
    currentImages = imageFiles.slice();
    if (coverFile) {
      const imgEl = document.createElement("img");
      imgEl.className = "book-cover";
      imgEl.src = coverUrl;
      imgEl.alt = coverFile.name || "Cover";
      imgEl.loading = "lazy";
      coverContainer.appendChild(imgEl);
    }
    if (chosenTextFile && textFetchPromise) {
      try {
        const maybe = await textFetchPromise;
        if (session !== activeLoadSession) return;
        if (maybe && maybe.ok && typeof maybe.text === "string") {
          const textEl = document.createElement("div");
          textEl.className = "folder-description";
          textEl.innerHTML = escapeHtml(maybe.text).replace(/\n/g, "<br>");
          descriptionContainer.classList.add("open");
          hrContainer.classList.add("open");
          descriptionContainer.appendChild(textEl);
          if (options.isBook) {
            coverContainer.appendChild(descriptionContainer);
          } else {
            allcontainers.appendChild(descriptionContainer);
          }
        }
      } catch (e) {
        console.error("Failed to render text file:", e);
      }
    } else {
      if (session !== activeLoadSession) return;
      if (options.isBook) {
        coverContainer.appendChild(descriptionContainer);
      } else {
        allcontainers.appendChild(descriptionContainer);
      }
    }
    container.innerHTML = "";
    const isBookView = !!options.isBook;
    imageFiles.forEach((file, idx) => {
      if (session !== activeLoadSession) return;
      if (isBookView) {
        const img = document.createElement("img");
        img.className = "spread noclick";
        img.src = `https://drive.google.com/thumbnail?id=${file.id}&sz=w800`;
        img.loading = "lazy";
        coverContainer.classList.add("open");
        container.appendChild(img);
      } else {
        const tile = document.createElement("div");
        tile.className = "thumb";
        tile.dataset.index = idx;
        tile.style.backgroundImage = `url(https://drive.google.com/thumbnail?id=${file.id}&sz=w400)`;
        tile.onclick = () => openLightbox(idx);
        container.appendChild(tile);
      }
    });
  } catch (err) {
    console.error("Error loading folder:", err);
  } finally {
    if (session === activeLoadSession) {
      allcontainers.classList.remove("loading");
      loadingFolderId = null;
    }
  }
}

function openLightbox(index) {
  currentIndex = index;
  renderLightbox();
  lightbox.classList.add("open");
  container.classList.add("close");
  allcontainers.classList.add("close");
  lightbox.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
  window.addEventListener("keydown", onKeyDown);
}

function closeLightbox() {
  lightbox.classList.remove("open");
  container.classList.remove("close");
  allcontainers.classList.remove("close");
  lightbox.setAttribute("aria-hidden", "true");
  lightbox.innerHTML = "";
  document.body.style.overflow = "";
  window.removeEventListener("keydown", onKeyDown);
}

function showPrev() {
  if (currentImages.length === 0) return;
  currentIndex = (currentIndex - 1 + currentImages.length) % currentImages.length;
  updateLightboxImage();
}

function showNext() {
  if (currentImages.length === 0) return;
  currentIndex = (currentIndex + 1) % currentImages.length;
  updateLightboxImage();
}

function populateInfoLinksForFile(file) {
  const infoContainer = lightbox.querySelector('.lightbox__info');
  if (!infoContainer) return;
  infoContainer.innerHTML = '';
  const parts = buildInfoLinksFromFilename(file && file.name ? file.name : '');
  parts.forEach(part => {
    const p = document.createElement('p');
    p.textContent = part;
    infoContainer.appendChild(p);
  });
}

function renderLightbox() {
  const file = currentImages[currentIndex];
  if (!file) return;
  const fullUrl = `https://drive.google.com/thumbnail?id=${file.id}&sz=w1200`;
  lightbox.innerHTML = `
    <div class="lightbox__content" role="dialog" aria-modal="true" aria-label="${escapeHtml(file.name)}">
      <div class="lightbox__controls">
        <div id="buttons">
          <div id="back-button" onclick="showPrev()"></div>
          <div id="forward-button" onclick="showNext()"></div>
        </div>
        <button class="btn" data-role="close" aria-label="Close">x</button>
      </div>
      <img class="lightbox__img" src="${fullUrl}" alt="${escapeHtml(file.name)}" />
      <div class="lightbox__nav">
        <div class="lightbox__info"></div>
        <button data-role="prev" aria-label="Previous"><</button>
        <button data-role="next" aria-label="Next">></button>
      </div>
    </div>
  `;
  lightbox.querySelector('[data-role="close"]').addEventListener("click", closeLightbox);
  lightbox.querySelector('[data-role="prev"]').addEventListener("click", showPrev);
  lightbox.querySelector('[data-role="next"]').addEventListener("click", showNext);
  populateInfoLinksForFile(file);
}

function updateLightboxImage() {
  const file = currentImages[currentIndex];
  if (!file) return;
  const img = lightbox.querySelector(".lightbox__img");
  if (img) img.src = `https://drive.google.com/thumbnail?id=${file.id}&sz=w1200`;
  const content = lightbox.querySelector(".lightbox__content");
  if (content) content.setAttribute("aria-label", file.name);
  populateInfoLinksForFile(file);
}

function onKeyDown(e) {
  if (!lightbox.classList.contains("open")) return;
  if (e.key === "Escape") closeLightbox();
  else if (e.key === "ArrowLeft") showPrev();
  else if (e.key === "ArrowRight") showNext();
}

function toggleSubfolderNav(folderName, targetNavEl, staticEl, otherNavEl) {
  if (targetNavEl.children.length) {
    targetNavEl.innerHTML = "";
    coverContainer.innerHTML = "";
    allcontainers.appendChild(descriptionContainer);
    descriptionContainer.innerHTML = "";
    container.innerHTML = "";
    containers.innerHTML ="";
    delete targetNavEl.dataset.loadId;
    return;
  }
  if (otherNavEl) otherNavEl.innerHTML = "";
  const folderId = rootFolderMap[folderName];
  if (!folderId) {
    targetNavEl.innerHTML = "";
    return;
  }
  const options = { isBook: folderName === "Books", showText: true };
  const loadId = ++navLoadCounter;
  targetNavEl.dataset.loadId = String(loadId);
  showSubfolders(folderId, targetNavEl, options, loadId);
}

async function init() {
  await buildRootFolderMap();

  if (staticPortfolio) {
    staticPortfolio.onclick = () => {
      if (driveNavProjects) driveNavProjects.innerHTML = "";
      if (driveNavBooks) driveNavBooks.innerHTML = "";
      if (coverContainer) coverContainer.innerHTML = "";
      if (descriptionContainer) descriptionContainer.innerHTML = "";
      if (descriptionContainer && descriptionContainer.classList) descriptionContainer.classList.remove("open");
      if (hrContainer && hrContainer.classList) hrContainer.classList.remove("open");
      if (lightbox && lightbox.classList) lightbox.classList.remove("open");
      if (container && container.classList) container.classList.remove("close");
      if (allcontainers && allcontainers.classList) allcontainers.classList.remove("close");
      loadFolder(ROOT_FOLDER_ID, { isBook: false, showText: false });
      toggleNav(nav)
    };
  }

  if (staticProjects) {
    staticProjects.onclick = () => {
      toggleSubfolderNav("Projects", driveNavProjects, staticProjects, driveNavBooks);
    };
  }

  if (staticBooks) {
    staticBooks.onclick = () => {
      toggleSubfolderNav("Books", driveNavBooks, staticBooks, driveNavProjects);
    };
  }

  if (staticInfo) {
      staticInfo.onclick = () => {
      removeInfo();
      if (driveNavProjects) driveNavProjects.innerHTML = "";
      if (driveNavBooks) driveNavBooks.innerHTML = "";
      if (coverContainer) coverContainer.innerHTML = "";
      if (descriptionContainer) descriptionContainer.innerHTML = "";
      if (container) container.innerHTML = "";
      if (descriptionContainer && descriptionContainer.classList) descriptionContainer.classList.remove("open");
      if (hrContainer && hrContainer.classList) hrContainer.classList.remove("open");
      if (lightbox && lightbox.classList) lightbox.classList.remove("open");
      if (container && container.classList) container.classList.add("close");
      if (coverContainer && coverContainer.classList) coverContainer.classList.remove("open");
      if (allcontainers && allcontainers.classList) allcontainers.classList.remove("close");

      if (!document.getElementById('page-info')) {
      const infoDiv = document.createElement('div');
      infoDiv.id = 'page-info';
      infoDiv.className = 'info';
      infoDiv.innerHTML = `
      <div id="page-info">
          <p>Tom D’haenens (born 1969) is a Belgian artistic photographer and publisher of unique photo books. He received his photography education at the Ghent Academy of Arts. Later he moved to Baltimore (US) where he deeply inhaled the business life of the Metropolis of New York. He soon made quite a name in the international business world as a photographic artist with that special eye that makes the difference. 
In this multinational environment he has always been fascinated by the exterior signs of economic and societal globalization. He has travelled to about every corner of the world, always on the lookout for that special unique shot that will capture the essence of a moment in time. In doing so he translates this world in terms of beauty and pathos. Nothing is dull, nothing is monotonous. Recognizing the rhetorical power of photography, D’haenens freezes his subject with a distinguished lightness. He possesses the ability to convert banal reality as much as unique human achievement into a brilliant image. In a split second, a detail of framed reality is given an unprecedented lustre that amazes his public. The unnoticed is given visibility that strikes us, catches us, teases us, triggers our curiosity and that challenges us to get a closer look into the story behind the picture. 
Tom D’haenens’ pictures have immortalized the most prestigious projects of a large number of multinationals in a number of amazing photo books, including the prize-winning ‘Brussels Airport’, ‘The Port of Antwerp’, ‘Flanders Port Area’, ‘Creating Land for the Future, ‘Ghent, so much city’, ‘Flanders State of the Arts’ and many more.
He is an expert in bringing together a panoply of the most diverse elements into original concepts, with a unique eye for colour, light, contrast and detail: his absolute trademark today.</p>

          <p>Tom D'haenens (1969) has been photographing at home and abroad for more than 30 years. He has been commissioned by multinationals and international governments. In his twenties he completed his education at the Academy of Fine Arts in Ghent and moved to Baltimore, USA to study the art of photography. In New York he quickly made a name for himself. He has photographed some of the most prestigious projects for a large number of multinationals. He later returned to his first love: industry. As a result, industry and architecture have become his playground. He has become an expert in bringing both elements together in highly original concepts with an eye for colour and detail. In fact, they have become his trademark.
Tom portrays the economic portals of countries and the industry within them in his own individual way. His work is a unique combination of technical precision and artistic vision. His artful approach to industry has made him a global pioneer in his field.
You may have seen something 1000 times, yet Tom shows that the 1001st time can still make a difference. That difference is in an unusual angle, a different light, a chance moment. The curiosity about that one time when an image rises above banality is what keeps him restless, even now, after thirty years of photography and seeing the world. The photographs imply that there is still more, before and after, both in space and in time. Anyone who looks at them will automatically add to them. That is how it is intended to be. His photos don't stop at the margin. He loves nothing more than to stimulate our curiosity and feed our imagination. He challenges us to make our own interpretation in his photographs and to discover something different each time. Hence his urge to collect photos in books. Photo books as viewing books, search books, discovery books.
          </p>

          <div id="quote">
          <blockquote>
          Tom D’haenens mag zich als fotograaf terecht het epitheton peintre de la vie postmoderne toe-eigenen. D’haenens illustreert naast de thema’s die tegenwoordig in stedenbouwkundige theorieën centraal staan ook de maatschappelijke en economische facetten van de globalisering. Grote kantoorgebouwen, atria, monoculturele woonwijken, technologische bedrijven, shopping malls, luchthavens, hotellobby’s kortom de nieuwe spaces of flow worden door deze jonge fotograaf in heldere kleuren en zonder complexen neergezet.  In zijn werk wordt deze gefotografeerde wereld vertaald in termen van schoonheid en pathos. D’haenens is ruimschoots vertrouwd met zowel de geschiedenis van de fotografie als haar retorisch vermogen. Wie zijn prenten bestudeert, voelt doorheen zijn kunst de trilling van coryfeeën als Ansel Adams, Margaret Bourk-White, Stieglitz, Walker Evans, Edward Weston en talloze andere goden. Jawel, zijn fotokunst wortelt in de Amerikaanse traditie van ongedwongenheid, ze bezit bovendien de gave om banale realiteit in een nieuw daglicht te zetten. En natuurlijk is er de Amerikaanse erfenis van de school van Baltimore die D’haenens met zich meedraagt. Beelden van een ingesnoerde werkelijkheid waar we doorgaans onachtzaam aan voorbijgaan worden boeiend en interessant bevonden. D’haenens geeft het postmoderne tijdvak een ongekende en verleidelijke glans die zich spiegelt in het detail. Vraag is hoe we die glans moeten lezen. Zijn beelden in se wel zo onschuldig als ze zich voordoen?  Feit is dat D’haenens een wereld voor zich heeft die in toenemende mate uit niet-plaatsen bestaat. Ze zijn vooral te vinden op het terrein van de mobiliteit en de consumptie: hotels, supermarkten, winkelcentra, pleisterplaatsen langs de snelweg en vliegvelden. Het zijn de hyperspaces van deze tijd, ze verbeelden de evacuatie van de publieke ruimte.
          </blockquote>
          <p id="auteur">– Philip Willaert</p>
          </div>

          <div id="tekstblok">
          <p>I look at the world as it is
<br>
Besides the purely architectural aspect of buildings, Tom D'haenens also likes to photograph the social and economic facets of globalisation. Large construction projects such as office buildings, atria, monocultural residential areas, technological companies, shopping malls, airports, hotel lobbies - in short, the new spaces of flows - are portrayed by this seasoned photographer in bright colours and vibrant shapes without complexes. 

In his work, the photographer translates this world in terms of beauty and pathos. D'haenens knows his photographic history; those who study his prints can feel the vibe of luminaries such as Ansel Adams, Margaret Bourk-White, Stieglitz, Walker Evans, Edward Weston and countless others. Certainly, his photographic art is rooted in the American tradition of casualness and gift for casting banal reality into a new light. 

But D'haenens also carries with him the business legacy of the Baltimore School of Art. Images of a constricted reality which we usually pass by negligently become fascinating and unusually interesting. D'haenens gives the present-day world an unprecedented glow, optimism reigns in his shots, although at the same time he forces the viewer to ask questions.
<br><br>
Circular economy
<br>
D'haenens seems to see the sea as the forgotten landscape of the 20th and 21st centuries. Large transport flows traverse the various oceans of the world, and in D'haenens' oeuvre cargo ships, ports and containers play a prominent role. As a photographer, he too realises that half of all goods today are shipped in containers: but these are odourless, shapeless, anonymous. The smells of tuna, or coconut, or hemp have completely disappeared from ships and ports. The container has become the symbol of global trade, with the sea as binding agent of all continents. With ultrasharp shots, he describes aspects of ports, industry, architecture and new landscapes of wind turbines. But also burning topics like the circular economy are represented, among other things, by compressed waste. Seen from afar, the compressed waste packs turn into rolling dice. 

Tom D'haenens will never disregard the role of man as scenarist of the great project of globalisation. Whether working in logistics or industry, time and again D'haenens approaches humans in a transformed reality. A labourer at work at a gigantic pipeline takes on surrealist allure. Through the eye of the camera reality becomes stronger and sometimes more bizarre. A plane turns into a gigantic albatross. Precisely because of this monumental and mesmerising vision of the photographer, the heavy industry and logistics sector call upon his great photographic talent. Especially in a world in full transition, like in the car industry, where new components such as batteries, sensors and robots are calling the shots. D'haenens metaphorically fixates these changes: sometimes static, sometimes cinematically dynamic.
<br><br>
Citizen of the world
<br>
Countless travels and tours have made D'haenens a citizen of the world. He braves oceans, deserts, mountain passes and deep valleys on missions that demand a lot of energy. D’haenens catalogues himself as a location photographer. His assignments come from all continents.

The photographer is at his best when capturing industrial processes, airports, seaports and architecture. They are a snapshot of optimism and far-reaching innovation in various sectors. D'haenens frames his subjects with great precision and sharpness to reveal the true essence of reality. But also to depict the belief in a better future, translated into pure lines and structures with great aplomb. By playing with distance and cropping, many images take on the allure of an abstract painting. For instance, he metamorphoses an ordinary salt mountain into a mighty snowy landscape. The curvy shapes of a female nude flow seamlessly into the glowing sand plains of the Sahara. It has become his trademark to perceive reality differently, to create a contemporary world in which everything is rethought or reinvented.
<br><br>
Worldwide fame
<br>
Enchantment and candid enthusiasm are reflected in his images through never-before-seen viewpoints. A man welding seems to have ended up in a brutal roller coaster of a Bond film because of the cinematic light. It takes some effort from the viewer to thoroughly analyse the image. D'haenens forces the viewer to look and in doing so, he also exposes the ambiguity and essence of photography. "People only see what they already know and understand," Goethe wrote. Photographic images are normally subject to a powerful image theory, which makes it difficult for the viewer to see that there is not always an image. Great is the desire to see something recognizable.

How exhausting is photography? According to D'haenens, there is always that eternal doubt, but that is precisely what keeps him sharp. It keeps him focused and alert. What D'haenens shows to the outside world is often what is called ‘le jamais vu’. Showing what the eye has never seen before. That is what makes D'haenens’ unique style, which has given him worldwide fame. The photographer as the modern Columbus who bundles the invisible contours of the Global World into a captivating anthology. Whether he believes in the 'decisive moment’? Is the photographer an all-seeing Zen Buddhist? Tom D'haenens puts things in perspective. In some cases, the moment counts, like the photograph showing hundreds of students listening to a speech. According to the photographer, by framing the picture differently, without a stage, you get an autonomous artistic print, the work and especially the photography stand on its own and the medium presents its enigmatic ambiguity. However, most images are not detached from the world. "I look at the world as it is," is his motto.
<br><br>
Living in America...
<br>
Photography is literally in D’haenens' genes. As a child he was fascinated by the medium and often borrowed his parents' camera. The seeds of a bright photographic future had been sown. From an early age, he was eager to discover the photographic equivalent of the world. That aspect has never left him until today; studio work, on the other hand, is not his cup of tea. "I need to feel and see the world," he says. 
        </p>
      </div>
  
  <div id="logos">
  <div>
     <img src="logo-tom.jpg" alt="logo Tom D'haenens">
     <p>School of Arts Ghent
     <br>Baltimore School of Arts USA</p>
     <p>Drone certificated pilot
     <br>Bossiet - offshore certified</p>

  </div>

  <hr>

  <div>
      <img src="logo-vv.jpg" alt="logo View&Vision">
      <p>
      View&Vision Publishers specialiseert zich in het creëren en publiceren van hoogwaardige fotoboeken voor de industrie. Met een sterke focus op visuele storytelling brengt Viewvision de wereld van techniek, productie en industriële innovatie op een unieke en inspirerende manier in beeld.
Door middel van krachtige fotografie en zorgvuldig vormgegeven publicaties documenteert Viewvision het vakmanschap, de mensen en de processen achter industriële bedrijven. Elk project wordt ontwikkeld met oog voor detail, kwaliteit en authenticiteit, waardoor de publicaties niet alleen informatief zijn, maar ook esthetisch aantrekkelijk.
Viewvision Publishers werkt nauw samen met bedrijven om hun verhaal visueel te vertalen naar een tastbaar en duurzaam boek. Zo ontstaan publicaties die niet alleen het heden vastleggen, maar ook een waardevol document vormen voor de toekomst.
Met een passie voor beeld, industrie en storytelling creëert Viewvision Publishers boeken die de kracht van industriële ondernemingen zichtbaar maken.
      </p>

      <p>
      View&Vision Publishers specializes in creating and publishing high-quality photo books for the industrial sector. With a strong focus on visual storytelling, Viewvision captures the world of technology, production, and industrial innovation in a compelling and inspiring way.
Through striking photography and carefully designed publications, Viewvision documents the craftsmanship, people, and processes behind industrial companies. Each project is developed with meticulous attention to detail, quality, and authenticity, making the books both informative and visually engaging.
Working closely with businesses, Viewvision translates their stories into tangible, lasting publications that not only showcase the present but also serve as valuable records for the future.
With a passion for imagery, industry, and storytelling, Viewvision Publishers creates books that reveal the power and creativity of industrial enterprises.
      </p>
    </div>
  </div>     
</div>`;
    allcontainers.insertBefore(infoDiv, container);
      container.style.display = '';
    }
  };
}

  if (staticPortfolio && typeof staticPortfolio.click === "function") {
    staticPortfolio.click();
  }
}

document.addEventListener("DOMContentLoaded", init);