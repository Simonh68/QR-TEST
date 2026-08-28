const token = window.location.pathname.split("/").filter(Boolean).at(-1);
const storageKey = `qr-test:attempt:${token}`;
const deviceKey = "qr-test:device-id";

const screens = {
  loading: document.querySelector("#loading-screen"),
  welcome: document.querySelector("#welcome-screen"),
  question: document.querySelector("#question-screen"),
  result: document.querySelector("#result-screen"),
  error: document.querySelector("#error-screen")
};

const progressLabel = document.querySelector("#progress-label");
const progressBar = document.querySelector("#progress-bar");
const word = document.querySelector("#word");
const options = document.querySelector("#options");
const feedback = document.querySelector("#feedback");
const nextButton = document.querySelector("#next-question");
const syncMessage = document.querySelector("#sync-message");

let test = null;
let attempt = loadAttempt();

function getDeviceId() {
  let deviceId = localStorage.getItem(deviceKey);
  if (!deviceId) {
    deviceId = crypto.randomUUID();
    localStorage.setItem(deviceKey, deviceId);
  }
  return deviceId;
}

function loadAttempt() {
  try {
    return JSON.parse(localStorage.getItem(storageKey));
  } catch {
    return null;
  }
}

function saveAttempt() {
  localStorage.setItem(storageKey, JSON.stringify(attempt));
}

function showScreen(name) {
  Object.entries(screens).forEach(([screenName, element]) => {
    element.classList.toggle("hidden", screenName !== name);
  });
}

function showError(title, text, canRetry = true) {
  document.querySelector("#error-title").textContent = title;
  document.querySelector("#error-message").textContent = text;
  document.querySelector("#retry").classList.toggle("hidden", !canRetry);
  progressLabel.classList.add("hidden");
  showScreen("error");
}

function errorFromStatus(status) {
  if (status === "started") {
    return ["הקוד כבר בשימוש", "מכשיר אחר כבר התחיל באמצעות הקוד הזה."];
  }
  if (status === "completed" || status === "completed-on-this-device") {
    return ["המבחן כבר הושלם", "אי אפשר להשתמש בקוד פעם נוספת."];
  }
  if (status === "expired") {
    return ["תוקף הקוד הסתיים", "יש לבקש מהמורה קוד חדש."];
  }
  return ["לא ניתן להתחיל", "הקוד אינו זמין. אפשר לפנות למורה."];
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    cache: "no-store",
    headers: { "content-type": "application/json", ...(options.headers ?? {}) },
    ...options
  });
  const body = await response.json();
  return { response, body };
}

async function initialise() {
  showScreen("loading");
  try {
    const [previewResult, testResult] = await Promise.all([
      api(`/api/codes/${token}`),
      api("/api/test")
    ]);

    if (!previewResult.response.ok) {
      return showError("הקישור אינו תקין", "יש לבקש מהמורה קוד חדש.", false);
    }

    test = testResult.body.test;
    const status = previewResult.body.record.status;

    if (attempt?.completed) {
      showResult();
      if (attempt.completionPending) await syncCompletion();
      return;
    }

    if (status === "started" && attempt) {
      await claimAndStart();
      return;
    }

    if (status !== "new" && status !== "started") {
      const [title, text] = errorFromStatus(status);
      return showError(title, text, false);
    }

    showScreen("welcome");
  } catch {
    showError("אין כרגע חיבור", "בדוק את החיבור ונסה שוב.");
  }
}

async function claimAndStart() {
  const startButton = document.querySelector("#start-test");
  startButton.disabled = true;
  startButton.textContent = "מתחילים…";

  try {
    const { response, body } = await api(`/api/codes/${token}/start`, {
      method: "POST",
      body: JSON.stringify({ deviceId: getDeviceId() })
    });

    if (!response.ok) {
      const [title, text] = errorFromStatus(body.error);
      return showError(title, text, body.error === "server-error");
    }

    if (!attempt) {
      attempt = {
        testId: test.id,
        testVersion: test.version,
        index: 0,
        firstAnswers: {},
        startedAt: new Date().toISOString(),
        completed: false,
        completionPending: false
      };
      saveAttempt();
    }
    renderQuestion();
  } catch {
    showError("לא הצלחנו להתחיל", "הקוד לא נצרך. אפשר לנסות שוב.");
  } finally {
    startButton.disabled = false;
    startButton.textContent = "התחלת המבחן";
  }
}

function renderQuestion() {
  const question = test.questions[attempt.index];
  const previousAnswer = attempt.firstAnswers[question.id];
  progressLabel.textContent = `שאלה ${attempt.index + 1} מתוך ${test.questions.length}`;
  progressLabel.classList.remove("hidden");
  progressBar.style.width = `${((attempt.index + 1) / test.questions.length) * 100}%`;
  word.textContent = question.prompt;
  options.replaceChildren();
  feedback.classList.add("hidden");
  nextButton.classList.add("hidden");

  question.options.forEach((label, index) => {
    const button = document.createElement("button");
    button.className = "option-button";
    button.textContent = label;
    button.addEventListener("click", () => chooseAnswer(question, index));
    options.append(button);
  });

  showScreen("question");
  if (previousAnswer) revealAnswer(question, previousAnswer);
}

function chooseAnswer(question, selectedIndex) {
  if (attempt.firstAnswers[question.id]) return;

  attempt.firstAnswers[question.id] = {
    selectedIndex,
    correct: selectedIndex === question.correctIndex
  };
  saveAttempt();
  revealAnswer(question, attempt.firstAnswers[question.id]);
}

function revealAnswer(question, answer) {
  [...options.children].forEach((button, index) => {
    button.disabled = true;
    if (index === question.correctIndex) button.classList.add("correct");
    if (index === answer.selectedIndex && !answer.correct) button.classList.add("incorrect");
  });
  feedback.textContent = answer.correct
    ? "נכון! התשובה נרשמה."
    : `התשובה הנכונה: ${question.options[question.correctIndex]}`;
  feedback.className = `feedback ${answer.correct ? "positive" : "learning"}`;
  nextButton.textContent = attempt.index === test.questions.length - 1 ? "סיום המבחן" : "לשאלה הבאה";
  nextButton.classList.remove("hidden");
}

async function nextQuestion() {
  if (attempt.index < test.questions.length - 1) {
    attempt.index += 1;
    saveAttempt();
    renderQuestion();
    return;
  }

  attempt.completed = true;
  attempt.completedAt = new Date().toISOString();
  attempt.completionPending = true;
  saveAttempt();
  showResult();
  await syncCompletion();
}

function calculateResult() {
  const correct = Object.values(attempt.firstAnswers).filter((answer) => answer.correct).length;
  const total = test.questions.length;
  return { correct, total, percent: Math.round((correct / total) * 100) };
}

function showResult() {
  const result = calculateResult();
  document.querySelector("#score").textContent = `${result.percent}`;
  document.querySelector("#score-detail").textContent = `${result.correct} תשובות נכונות מתוך ${result.total}`;
  progressLabel.classList.add("hidden");
  syncMessage.textContent = attempt.completionPending ? "שומרים את סיום המבחן…" : "התוצאה נשמרה במכשיר הזה.";
  showScreen("result");
}

async function syncCompletion() {
  try {
    const { response } = await api(`/api/codes/${token}/complete`, {
      method: "POST",
      body: JSON.stringify({ deviceId: getDeviceId() })
    });
    if (!response.ok) throw new Error("completion-failed");
    attempt.completionPending = false;
    saveAttempt();
    syncMessage.textContent = "התוצאה נשמרה במכשיר הזה. הקוד נסגר לשימוש נוסף.";
  } catch {
    syncMessage.textContent = "התוצאה נשמרה כאן. השלמת הסגירה תתבצע בחיבור הבא.";
  }
}

document.querySelector("#start-test").addEventListener("click", claimAndStart);
document.querySelector("#next-question").addEventListener("click", nextQuestion);
document.querySelector("#retry").addEventListener("click", initialise);
document.querySelector("#print-result").addEventListener("click", () => window.print());

initialise();
