const MAX_CARDS = 10;
const createButton = document.querySelector("#create-code");
const generatedSection = document.querySelector("#generated");
const viewport = document.querySelector("#deck-viewport");
const track = document.querySelector("#deck-track");
const nextButton = document.querySelector("#next-card");
const counter = document.querySelector("#card-counter");
const hint = document.querySelector("#swipe-hint");
const message = document.querySelector("#teacher-message");

let cardNumber = 0;
let currentCard = null;
let creatingCard = false;
let dragStartX = null;
let dragX = 0;

const statusLabels = {
  new: "ממתין להתחלה",
  started: "המבחן התחיל",
  completed: "המבחן הושלם",
  canceled: "הקוד בוטל",
  expired: "פג תוקף",
  error: "תקלה בהפקה"
};

function cardMarkup(number) {
  return `
    <article class="qr-slide">
      <div class="card qr-card">
        <div class="status-row">
          <div>
            <p class="eyebrow">כרטיס ${number}</p>
            <h3>סריקה מהטלפון של התלמיד</h3>
          </div>
          <span class="status-badge new">מפיקים QR…</span>
        </div>
        <div class="qr-placeholder">
          <div class="spinner" aria-label="מפיקים קוד"></div>
        </div>
        <p class="privacy-note">הקוד נתפס רק כאשר התלמיד לוחץ על „התחלת המבחן”.</p>
        <div class="link-box hidden">
          <a class="student-link" target="_blank" rel="noreferrer"></a>
          <button class="copy-link secondary-button">העתקת קישור</button>
        </div>
        <button class="retry-card secondary-button hidden">ניסיון נוסף</button>
      </div>
    </article>`;
}

function setTrackPosition(offset, animate = true) {
  track.classList.toggle("dragging", !animate);
  track.style.transform = `translate3d(${offset}px, 0, 0)`;
}

function updateControls() {
  counter.textContent = `כרטיס ${cardNumber} מתוך ${MAX_CARDS}`;
  nextButton.disabled = creatingCard || cardNumber >= MAX_CARDS;
  hint.textContent = cardNumber >= MAX_CARDS
    ? "נוצרו 10 כרטיסי הפיילוט"
    : "משכו ימינה או שמאלה — אין חזרה לכרטיס הקודם";
}

function renderLoadingCard(number) {
  track.innerHTML = cardMarkup(number);
  updateControls();
}

function setCardStatus(status) {
  if (currentCard) currentCard.status = status;
  const badge = track.querySelector(".status-badge");
  if (!badge) return;
  badge.textContent = statusLabels[status] ?? status;
  badge.className = `status-badge ${status}`;
}

async function fetchNewCode() {
  const response = await fetch("/api/codes", { method: "POST" });
  if (!response.ok) throw new Error("create-failed");
  return response.json();
}

function fillCard(data) {
  const placeholder = track.querySelector(".qr-placeholder");
  const image = document.createElement("img");
  image.className = "qr-image";
  image.src = data.qrDataUrl;
  image.alt = `קוד QR לכרטיס ${cardNumber}`;
  placeholder.replaceWith(image);

  const linkBox = track.querySelector(".link-box");
  const link = track.querySelector(".student-link");
  link.href = data.studentUrl;
  link.textContent = data.studentUrl;
  linkBox.classList.remove("hidden");
  track.querySelector(".copy-link").addEventListener("click", () => copyLink(data.studentUrl));
  currentCard = { token: data.token, studentUrl: data.studentUrl, status: data.record.status };
  setCardStatus(data.record.status);
}

function showCardError() {
  track.querySelector(".qr-placeholder").innerHTML = "<p>לא הצלחנו להפיק QR.</p>";
  const retry = track.querySelector(".retry-card");
  retry.classList.remove("hidden");
  retry.addEventListener("click", loadCurrentCard, { once: true });
  setCardStatus("error");
}

async function loadCurrentCard(prefetchedData) {
  track.querySelector(".retry-card")?.classList.add("hidden");
  try {
    fillCard(prefetchedData ?? await fetchNewCode());
  } catch {
    showCardError();
  }
}

async function createFirstCard() {
  if (creatingCard) return;
  creatingCard = true;
  cardNumber = 1;
  currentCard = null;
  renderLoadingCard(cardNumber);
  generatedSection.classList.remove("hidden");
  updateControls();
  await loadCurrentCard();
  creatingCard = false;
  updateControls();
}

async function transitionToNewCard(exitDirection = -1) {
  if (creatingCard || cardNumber >= MAX_CARDS) {
    setTrackPosition(0);
    return;
  }

  creatingCard = true;
  updateControls();
  const width = viewport.clientWidth;
  const dataPromise = fetchNewCode().then(
    (data) => ({ data }),
    (error) => ({ error })
  );
  setTrackPosition(exitDirection * width, true);
  await new Promise((resolve) => setTimeout(resolve, 360));

  cardNumber += 1;
  currentCard = null;
  renderLoadingCard(cardNumber);
  setTrackPosition(-exitDirection * width, false);
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  setTrackPosition(0, true);

  const prefetched = await dataPromise;
  if (prefetched.error) {
    showCardError();
  } else {
    await loadCurrentCard(prefetched.data);
  }
  creatingCard = false;
  updateControls();
}

async function copyLink(url) {
  try {
    await navigator.clipboard.writeText(url);
    message.textContent = "הקישור של הכרטיס הועתק.";
  } catch {
    message.textContent = "אפשר ללחוץ לחיצה ארוכה על הקישור ולהעתיק אותו.";
  }
}

async function pollStatus() {
  if (!currentCard?.token || ["completed", "expired", "canceled"].includes(currentCard.status)) return;
  try {
    const response = await fetch(`/api/codes/${currentCard.token}`, { cache: "no-store" });
    if (!response.ok) return;
    const { record } = await response.json();
    setCardStatus(record.status);
  } catch {
    // A polling failure does not change or consume the code.
  }
}

createButton.addEventListener("click", async () => {
  createButton.disabled = true;
  await createFirstCard();
  createButton.classList.add("hidden");
  generatedSection.scrollIntoView({ behavior: "smooth", block: "start" });
});

nextButton.addEventListener("click", () => transitionToNewCard(-1));

viewport.addEventListener("pointerdown", (event) => {
  if (creatingCard || event.target.closest("button, a")) return;
  dragStartX = event.clientX;
  dragX = 0;
  viewport.setPointerCapture(event.pointerId);
  setTrackPosition(0, false);
});

viewport.addEventListener("pointermove", (event) => {
  if (dragStartX === null) return;
  dragX = event.clientX - dragStartX;
  if (cardNumber >= MAX_CARDS) dragX *= 0.25;
  setTrackPosition(dragX, false);
});

viewport.addEventListener("pointerup", async () => {
  if (dragStartX === null) return;
  const exitDirection = Math.sign(dragX) || -1;
  const shouldAdvance = Math.abs(dragX) >= 60 && cardNumber < MAX_CARDS;
  dragStartX = null;
  dragX = 0;
  if (shouldAdvance) await transitionToNewCard(exitDirection);
  else setTrackPosition(0, true);
});

viewport.addEventListener("pointercancel", () => {
  dragStartX = null;
  dragX = 0;
  setTrackPosition(0, true);
});

window.addEventListener("resize", () => setTrackPosition(0, false));
setInterval(pollStatus, 2500);
