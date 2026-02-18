const ROOT_FOLDER_ID = "1ZDYPViPemR14Xgv8vQZHQSGmWjeqkr1Z";
const API_KEY = (window.CONFIG && window.CONFIG.API_KEY) || '';

if (!API_KEY) {
  console.warn('API key missing. Drive calls will fail. Add API_KEY before building.');
}

const driveNavProjects = document.getElementById("drive_nav_projects");
const driveNavBooks = document.getElementById("drive_nav_books");
const lightbox = document.getElementById("lightbox");

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

function escapeHtml(str = "") {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
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
    console.log("Root folders:", data);
    if (Array.isArray(data.files)) {
      data.files.forEach(f => {
        rootFolderMap[f.name] = f.id;
      });
    }
  } catch (err) {
    console.error("Error building root folder map:", err);
  }
}

async function showSubfolders(parentId, targetNavEl, options = {}) {
  targetNavEl.innerHTML = "";

  try {
    const q = `'${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    const data = await driveFetch({ q, fields: "files(id,name)" });
    console.log(`Subfolders of ${parentId}:`, data);

    if (!data.files || data.files.length === 0) {
      return;
    }

    data.files.forEach(folder => {
      const d = document.createElement("div");
      d.className = "drive-folder";
      d.textContent = folder.name;
      d.onclick = () => {
        loadFolder(folder.id, options);
      };
      targetNavEl.appendChild(d);
    });
  } catch (err) {
    console.error("Error listing subfolders:", err);
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

async function loadFolder(folderId, options = { isBook: false, showText: true }) {
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

  console.log("Loading folder (preload mode):", folderId, options);

  const q = `'${folderId}' in parents and trashed = false`;
  try {
    const data = await driveFetch({
      q,
      fields: "files(id,name,mimeType,shortcutDetails,iconLink,webViewLink),nextPageToken"
    });
    console.log("Drive response for folder:", folderId, data);

    if (!data.files || data.files.length === 0) {
      allcontainers.classList.remove("loading");
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

    const textFiles = resolved.filter(f => {
      const name = (f.name || "").toLowerCase();
      return name.endsWith(".txt") || (f.mimeType || "").toLowerCase() === "text/plain";
    });

    const imageFiles = resolved.filter(f => {
      const mt = (f.mimeType || "").toLowerCase();
      return mt.startsWith("image/") || /\.(jpg|jpeg|png|gif|webp)$/i.test(f.name || "");
    });

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
    thumbUrls.forEach(u => preloadPromises.push(preloadImage(u)));

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
      if (options.isBook) {
        coverContainer.appendChild(descriptionContainer);
      } else {
        allcontainers.appendChild(descriptionContainer);
      }
    }

    container.innerHTML = "";
    const isBookView = !!options.isBook;

    imageFiles.forEach((file, idx) => {
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
    allcontainers.classList.remove("loading");
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
        <button data-role="prev" aria-label="Previous"><</button>
        <button data-role="next" aria-label="Next">></button>
      </div>
    </div>
  `;

  lightbox.querySelector('[data-role="close"]').addEventListener("click", closeLightbox);
  lightbox.querySelector('[data-role="prev"]').addEventListener("click", showPrev);
  lightbox.querySelector('[data-role="next"]').addEventListener("click", showNext);
}

function updateLightboxImage() {
  const file = currentImages[currentIndex];
  if (!file) return;
  const img = lightbox.querySelector(".lightbox__img");
  if (img) img.src = `https://drive.google.com/thumbnail?id=${file.id}&sz=w1200`;
  const content = lightbox.querySelector(".lightbox__content");
  if (content) content.setAttribute("aria-label", file.name);
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
    return;
  }
  if (otherNavEl) otherNavEl.innerHTML = "";

  const folderId = rootFolderMap[folderName];
  if (!folderId) {
    targetNavEl.innerHTML = "";
    return;
  }
  const options = { isBook: folderName === "Books", showText: true };
  showSubfolders(folderId, targetNavEl, options);
}

async function init() {
  await buildRootFolderMap();

  staticPortfolio.onclick = () => {
    driveNavProjects.innerHTML = "";
    driveNavBooks.innerHTML = "";
    coverContainer.innerHTML = "";
    descriptionContainer.innerHTML = "";
    descriptionContainer.classList.remove("open");
    hrContainer.classList.remove("open");
    lightbox.classList.remove("open");
    container.classList.remove("close");
    allcontainers.classList.remove("close");

    loadFolder(ROOT_FOLDER_ID, { isBook: false, showText: false });
  };

  staticProjects.onclick = () => {
    toggleSubfolderNav("Projects", driveNavProjects, staticProjects, driveNavBooks);
  };

  staticBooks.onclick = () => {
    toggleSubfolderNav("Books", driveNavBooks, staticBooks, driveNavProjects);
  };

  staticInfo.onclick = () => {
    driveNavProjects.innerHTML = "";
    driveNavBooks.innerHTML = "";
    coverContainer.innerHTML = "";
    descriptionContainer.innerHTML = "";
    descriptionContainer.classList.remove("open");
    hrContainer.classList.remove("open");
    lightbox.classList.remove("open");
    container.classList.remove("close");
    allcontainers.classList.remove("close");
    container.innerHTML = `<div class="info">Contact info and other details here.</div>`;
  };

  staticPortfolio.click();
}

document.addEventListener("DOMContentLoaded", init);