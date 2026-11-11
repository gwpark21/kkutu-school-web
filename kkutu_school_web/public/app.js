
const socket = io();

const $ = id => document.getElementById(id);

let myRoom = "";
let isHost = false;
let latestRoom = null;

const characters = ["🐻", "🐱", "🐰", "🦊", "🐼", "🐸", "🐵", "🐧"];

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

function showToast(message) {
  const toast = $("toast");
  toast.textContent = message;
  toast.classList.add("show");

  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    toast.classList.remove("show");
  }, 2200);
}

function enterGame() {
  $("login").classList.add("hidden");
  $("game").classList.remove("hidden");
}

function createRoom() {
  const name = $("name").value.trim();

  if (!name) {
    showToast("닉네임을 입력해 주세요.");
    return;
  }

  socket.emit("create", { name });
}

function joinRoom() {
  const name = $("name").value.trim();
  const code = $("code").value.trim().toUpperCase();

  if (!name || !code) {
    showToast("닉네임과 방 코드를 입력해 주세요.");
    return;
  }

  socket.emit("join", { name, code });
}

function startGame() {
  socket.emit("start");
}

function submitWord() {
  const word = $("word").value.trim();

  if (!word) return;

  socket.emit("word", { word });
  $("word").value = "";
  $("word").focus();
}

function passTurn() {
  socket.emit("pass");
}

$("create").addEventListener("click", createRoom);
$("join").addEventListener("click", joinRoom);
$("start").addEventListener("click", startGame);
$("submit").addEventListener("click", submitWord);
$("pass").addEventListener("click", passTurn);

$("word").addEventListener("keydown", event => {
  if (event.key === "Enter") submitWord();
});

$("code").addEventListener("input", event => {
  event.target.value = event.target.value.toUpperCase();
});

socket.on("created", room => {
  myRoom = room.code;
  isHost = true;
  enterGame();
  showToast("방이 만들어졌어요!");
});

socket.on("state", room => {
  latestRoom = room;
  enterGame();

  $("roomcode").textContent = room.code || myRoom;
  $("currentword").textContent = room.word || "시작 단어 없음";
  $("timer").textContent = room.seconds ?? 20;

  $("status").textContent =
    room.status === "playing" ? "게임 진행 중" : "대기 중";

  const players = room.players || [];
  const currentPlayer = players[room.turn];

  $("players").innerHTML = players.map((player, index) => {
    const isCurrent = index === room.turn;
    const avatar = characters[index % characters.length];

    return `
      <li class="player-card ${isCurrent ? "current-player" : ""}">
        <div class="player-avatar">${avatar}</div>
        <div class="player-info">
          <div class="player-name">
            ${escapeHtml(player.name)}
            ${isCurrent ? '<span class="turn-label">차례</span>' : ""}
          </div>
          <div class="player-details">
            <span>⭐ ${player.score ?? 0}점</span>
            <span>🔥 ${player.combo ?? 0}콤보</span>
          </div>
          ${player.connected === false
            ? '<div class="player-disconnected">연결 끊김</div>'
            : ""}
        </div>
      </li>
    `;
  }).join("");

  const myTurn =
    room.status === "playing" &&
    currentPlayer &&
    currentPlayer.id === socket.id;

  $("word").disabled = !myTurn;
  $("submit").disabled = !myTurn;
  $("pass").disabled = !myTurn;

  $("start").classList.toggle(
    "hidden",
    !isHost || room.status !== "waiting"
  );

  if (room.status === "waiting") {
    $("hint").textContent = "방장이 2명 이상 모이면 시작할 수 있어요.";
  } else if (myTurn) {
    $("hint").textContent = "내 차례입니다! 단어를 입력해 보세요.";
  } else {
    $("hint").textContent = currentPlayer
      ? `${currentPlayer.name}님의 차례입니다.`
      : "게임이 진행 중입니다.";
  }
});

socket.on("wordPlayed", data => {
  const log = $("log");
  const score = data.earnedScore ?? 0;
  const combo = data.combo ?? 0;
  const multiplier = data.multiplier ?? 1;

  const item = document.createElement("div");
  item.className = "word-log-item";
  item.innerHTML = `
    <strong>${escapeHtml(data.name || "플레이어")}</strong>
    : ${escapeHtml(data.word || "")}
    <span class="log-score">+${score}점</span>
    <span class="log-combo">${combo}콤보 ×${multiplier}</span>
  `;

  log.prepend(item);

  // 내 점수 획득 효과
  if (data.playerId === socket.id ||
      (!data.playerId && data.name === $("name").value.trim())) {
    showScoreEffect(score);

    if (combo >= 2) {
      showComboEffect(combo);
    }
  }
});

function showScoreEffect(score) {
  const effect = document.createElement("div");
  effect.className = "score-effect";
  effect.textContent = `+${score}점`;

  document.body.appendChild(effect);
  setTimeout(() => effect.remove(), 1100);
}

function showComboEffect(combo) {
  const effect = document.createElement("div");
  effect.className = "combo-effect";
  effect.textContent = `🔥 ${combo} COMBO!`;

  document.body.appendChild(effect);
  setTimeout(() => effect.remove(), 1300);
}

socket.on("notice", message => {
  showToast(message);
});

socket.on("errorMsg", message => {
  showToast(message);
});
