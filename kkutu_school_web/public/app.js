const socket = io();
const $ = id => document.getElementById(id);

const CHARACTERS = [
  { id: "bear", name: "곰", emoji: "🐻" },
  { id: "cat", name: "고양이", emoji: "🐱" },
  { id: "rabbit", name: "토끼", emoji: "🐰" },
  { id: "fox", name: "여우", emoji: "🦊" },
  { id: "penguin", name: "펭귄", emoji: "🐧" },
  { id: "frog", name: "개구리", emoji: "🐸" },
  { id: "hamster", name: "햄스터", emoji: "🐹" },
  { id: "dino", name: "공룡", emoji: "🦖" }
];

let selectedCharacter = "bear";
let isHost = false;
let currentRoom = null;
let gameFinished = false;
let previousCombos = {};

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, ch => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  })[ch]);
}

function showToast(message) {
  const toast = $("toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 2300);
}

function renderCharacterPicker(targetId, selectedId, lockedIds = []) {
  const target = $(targetId);
  if (!target) return;

  target.innerHTML = CHARACTERS.map(character => {
    const locked = lockedIds.includes(character.id) && character.id !== selectedId;
    return `
      <button type="button"
        class="character-option ${character.id === selectedId ? "selected" : ""} ${locked ? "locked" : ""}"
        data-character="${character.id}" ${locked ? "disabled" : ""}>
        <span class="character-emoji">${character.emoji}</span>
        <span class="character-name">${character.name}</span>
        ${locked ? '<span class="locked-label">선택됨</span>' : ""}
      </button>
    `;
  }).join("");

  target.querySelectorAll("[data-character]").forEach(button => {
    button.addEventListener("click", () => {
      const id = button.dataset.character;
      selectedCharacter = id;
      renderCharacterPicker("characterPicker", selectedCharacter);
      if (currentRoom) {
        socket.emit("selectCharacter", id);
      }
    });
  });
}

function createRoom() {
  const name = $("name").value.trim();
  if (!name) return showToast("닉네임을 입력해 주세요.");
  socket.emit("create", { name, character: selectedCharacter });
}

function joinRoom() {
  const name = $("name").value.trim();
  const code = $("code").value.trim().toUpperCase();
  if (!name || !code) return showToast("닉네임과 방 코드를 입력해 주세요.");
  socket.emit("join", { name, code, character: selectedCharacter });
}

function submitWord() {
  const word = $("word").value.trim();
  if (!word) return;
  socket.emit("word", { word });
  $("word").value = "";
  $("word").focus();
}

function formatTime(seconds) {
  const safe = Math.max(0, seconds || 0);
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}

function getCharacter(id) {
  return CHARACTERS.find(item => item.id === id) || CHARACTERS[0];
}

function renderPlayers(room) {
  const players = room.players || [];
  $("players").innerHTML = players.map((player, index) => {
    const current = room.status === "playing" && index === room.turn;
    const winner = (room.winners || []).includes(player.id);
    const character = getCharacter(player.character);
    const comboFive = player.combo >= 5;

    return `
      <li class="player-card ${current ? "current-player" : ""} ${winner ? "winner-player" : ""}">
        <div class="avatar-wrap ${current ? "bouncing" : ""} ${comboFive ? "on-fire" : ""} ${winner ? "celebrating" : ""}">
          ${comboFive ? '<span class="flame flame-one">🔥</span><span class="flame flame-two">🔥</span>' : ""}
          <span class="player-avatar">${character.emoji}</span>
          ${winner ? '<span class="winner-crown">👑</span>' : ""}
        </div>
        <div class="player-info">
          <div class="player-name">${escapeHtml(player.name)}
            ${current ? '<span class="turn-label">내 차례</span>' : ""}
            ${winner ? '<span class="winner-label">우승</span>' : ""}
          </div>
          <div class="player-details">
            <span>⭐ ${player.score}점</span>
            <span>🔥 ${player.combo}콤보</span>
          </div>
          <div class="character-caption">${character.name}</div>
        </div>
      </li>
    `;
  }).join("");
}

function updateRoom(room) {
  currentRoom = room;
  if (room.status === "finished") {
    renderPlayers(room);
    return;
  }
  const myPlayer = room.players.find(player => player.id === socket.id);
  isHost = room.hostId === socket.id;

  $("login").classList.add("hidden");
  $("result").classList.add("hidden");
  $("game").classList.remove("hidden");

  $("roomcode").textContent = room.code;
  $("status").textContent =
    room.status === "playing" ? "게임 진행 중" :
    room.status === "finished" ? "게임 종료" : "대기 중";

  $("currentword").textContent = room.word || "시작 단어 없음";
  $("timer").textContent = room.seconds ?? 20;
  $("gameTimer").textContent = formatTime(room.remainingGameSeconds);

  const isMyTurn = room.status === "playing" &&
    room.players[room.turn]?.id === socket.id;

  $("word").disabled = !isMyTurn;
  $("submit").disabled = !isMyTurn;
  $("pass").disabled = !isMyTurn;

  $("start").classList.toggle("hidden", !isHost || room.status !== "waiting");
  $("lobbySettings").classList.toggle("hidden", room.status !== "waiting");

  $("duplicateToggle").checked = room.allowDuplicateCharacters;
  $("duplicateToggle").disabled = !isHost;

  const usedByOthers = room.players
    .filter(player => player.id !== socket.id)
    .map(player => player.character);

  renderCharacterPicker("lobbyCharacterPicker", myPlayer?.character || selectedCharacter,
    room.allowDuplicateCharacters ? [] : usedByOthers);

  if (myPlayer) selectedCharacter = myPlayer.character;

  if (room.status === "waiting") {
    $("hint").textContent = isHost
      ? "2명 이상 모이면 게임을 시작할 수 있어요."
      : "방장이 게임을 시작할 때까지 기다려 주세요.";
  } else if (room.status === "playing") {
    const active = room.players[room.turn];
    $("hint").textContent = isMyTurn
      ? "내 차례입니다! 빠르게 단어를 입력해 보세요."
      : `${active?.name || "플레이어"}님의 차례입니다.`;
  } else {
    $("hint").textContent = "게임이 종료되었습니다.";
  }

  renderPlayers(room);
}

function showGameOver(data) {
  gameFinished = true;
  $("game").classList.add("hidden");
  $("result").classList.remove("hidden");

  const names = data.winnerNames || [];
  if (names.length === 0) {
    $("resultTitle").textContent = "게임 종료!";
    $("resultMessage").textContent = "이번 경기의 우승자가 없습니다.";
  } else if (names.length === 1) {
    $("resultTitle").textContent = `${names[0]} 우승!`;
    $("resultMessage").textContent = `최종 점수 ${data.highestScore}점! 축하합니다!`;
  } else {
    $("resultTitle").textContent = "공동 우승!";
    $("resultMessage").textContent = `${names.join(", ")}님이 ${data.highestScore}점으로 공동 우승했어요!`;
  }

  $("resultPlayers").innerHTML = (currentRoom?.players || [])
    .slice()
    .sort((a, b) => b.score - a.score)
    .map(player => {
      const character = getCharacter(player.character);
      const winner = (data.winners || []).includes(player.id);
      return `<div class="result-player ${winner ? "result-winner" : ""}">
        <span class="result-avatar">${character.emoji}</span>
        <span>${escapeHtml(player.name)}</span>
        <strong>${player.score}점</strong>
        ${winner ? "<span>👑</span>" : ""}
      </div>`;
    }).join("");
}

$("create").addEventListener("click", createRoom);
$("join").addEventListener("click", joinRoom);
$("start").addEventListener("click", () => socket.emit("start"));
$("submit").addEventListener("click", submitWord);
$("pass").addEventListener("click", () => socket.emit("pass"));
$("word").addEventListener("keydown", event => {
  if (event.key === "Enter") submitWord();
});
$("code").addEventListener("input", event => {
  event.target.value = event.target.value.toUpperCase();
});
$("duplicateToggle").addEventListener("change", event => {
  socket.emit("setDuplicateCharacters", event.target.checked);
});
$("backToLobby").addEventListener("click", () => {
  $("result").classList.add("hidden");
  $("game").classList.remove("hidden");
  showToast("결과 화면을 닫았어요. 새 게임은 새 방에서 시작해 주세요.");
});

socket.on("created", () => showToast("방이 만들어졌어요!"));
socket.on("state", room => {
  updateRoom(room);

  const currentCombos = {};
  room.players.forEach(player => {
    const oldCombo = previousCombos[player.id] || 0;
    if (player.combo >= 5 && oldCombo < 5 && room.status === "playing") {
      showToast(`${player.name}님 5콤보 달성! 🔥`);
    }
    currentCombos[player.id] = player.combo;
  });
  previousCombos = currentCombos;
});

socket.on("wordPlayed", data => {
  const log = $("log");
  const item = document.createElement("div");
  item.className = "word-log-item";
  item.innerHTML = `<strong>${escapeHtml(data.name)}</strong> : ${escapeHtml(data.word)}
    <span class="log-score">+${data.earnedScore}점</span>
    <span class="log-combo">${data.combo}콤보 ×${data.multiplier}</span>`;
  log.prepend(item);

  if (data.playerId === socket.id) {
    const effect = document.createElement("div");
    effect.className = "score-effect";
    effect.textContent = `+${data.earnedScore}점`;
    document.body.appendChild(effect);
    setTimeout(() => effect.remove(), 1100);
  }
});

socket.on("gameOver", data => {
  showGameOver(data);
});

socket.on("notice", showToast);
socket.on("errorMsg", showToast);

renderCharacterPicker("characterPicker", selectedCharacter);
