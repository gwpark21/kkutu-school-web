
const socket = io();

const $ = id => document.getElementById(id);

let myRoom = "";
let isHost = false;

let previousScores = {};
let previousCombos = {};

function toast(message) {
  const el = $("toast");

  if (!el) {
    alert(message);
    return;
  }

  el.textContent = message;
  el.classList.add("show");

  setTimeout(() => {
    el.classList.remove("show");
  }, 2500);
}

// ==============================
// 점수 및 콤보 효과
// ==============================

function showScoreEffect(message, type = "gain") {
  let effect = $("scoreEffect");

  if (!effect) {
    effect = document.createElement("div");
    effect.id = "scoreEffect";
    document.body.appendChild(effect);
  }

  effect.textContent = message;
  effect.className = `score-effect ${type}`;

  // 애니메이션 재시작
  void effect.offsetWidth;

  effect.classList.add("active");

  setTimeout(() => {
    effect.classList.remove("active");
  }, 1200);
}

function showComboEffect(combo, multiplier) {
  if (combo < 2) return;

  let effect = $("comboEffect");

  if (!effect) {
    effect = document.createElement("div");
    effect.id = "comboEffect";
    document.body.appendChild(effect);
  }

  effect.textContent = `🔥 COMBO ${combo}  ×${multiplier}`;

  void effect.offsetWidth;

  effect.className = "combo-effect active";

  setTimeout(() => {
    effect.classList.remove("active");
  }, 1500);
}

// ==============================
// 화면 초기화
// ==============================

function enterGame() {
  $("login")?.classList.add("hidden");
  $("game")?.classList.remove("hidden");
}

// ==============================
// 방 생성
// ==============================

function createRoom() {
  const name = $("name").value.trim();

  if (!name) {
    toast("닉네임을 입력해 주세요.");
    return;
  }

  socket.emit("create", { name });
}

// ==============================
// 방 참가
// ==============================

function joinRoom() {
  const name = $("name").value.trim();
  const code = $("roomCode").value.trim();

  if (!name || !code) {
    toast("닉네임과 방 코드를 입력해 주세요.");
    return;
  }

  socket.emit("join", { name, code });
}

// ==============================
// 게임 시작
// ==============================

function startGame() {
  socket.emit("start");
}

// ==============================
// 단어 입력
// ==============================

function submitWord() {
  const input = $("wordInput");

  if (!input) return;

  const word = input.value.trim();

  if (!word) return;

  socket.emit("word", { word });

  input.value = "";
  input.focus();
}

// ==============================
// 패스
// ==============================

function passTurn() {
  socket.emit("pass");
}

// ==============================
// 방 생성 완료
// ==============================

socket.on("created", room => {
  myRoom = room.code;
  isHost = true;

  enterGame();

  toast(`방이 생성되었습니다! 코드: ${room.code}`);
});

// ==============================
// 게임 상태 업데이트
// ==============================

socket.on("state", room => {
  myRoom = room.code;

  enterGame();

  // 방 코드
  if ($("roomCodeDisplay")) {
    $("roomCodeDisplay").textContent = room.code;
  }

  // 현재 단어
  if ($("currentWord")) {
    $("currentWord").textContent = room.word || "첫 단어를 입력하세요!";
  }

  // 남은 시간
  if ($("timer")) {
    $("timer").textContent = room.seconds;
  }

  // 플레이어 목록
  if ($("players")) {
    $("players").innerHTML = "";

    room.players.forEach((player, index) => {
      const item = document.createElement("div");

      item.className = "player-card";

      if (index === room.turn && room.status === "playing") {
        item.classList.add("current-player");
      }

      const oldScore = previousScores[player.id];
      let scoreEffect = "";

      if (oldScore !== undefined && player.score > oldScore) {
        scoreEffect = "score-up";
      } else if (oldScore !== undefined && player.score < oldScore) {
        scoreEffect = "score-down";
      }

      item.innerHTML = `
        <div class="player-info">
          <strong>${escapeHtml(player.name)}</strong>
          <span class="player-combo">
            ${player.combo > 1 ? `🔥 ${player.combo} COMBO` : ""}
          </span>
        </div>

        <div class="player-score ${scoreEffect}">
          ${player.score.toLocaleString()}점
        </div>

        <div class="player-status">
          ${index === room.turn && room.status === "playing"
            ? "🎯 현재 차례"
            : player.connected ? "접속 중" : "접속 종료"}
        </div>
      `;

      $("players").appendChild(item);
    });
  }

  // 이전 점수 저장
  previousScores = {};

  room.players.forEach(player => {
    previousScores[player.id] = player.score;
  });

  // 게임 시작 버튼
  if ($("startButton")) {
    $("startButton").classList.toggle(
      "hidden",
      !isHost || room.status !== "waiting"
    );
  }

  // 단어 입력 및 패스 버튼
  const myTurn = room.players[room.turn]?.id === socket.id;

  if ($("wordInput")) {
    $("wordInput").disabled = room.status !== "playing" || !myTurn;
  }

  if ($("submitButton")) {
    $("submitButton").disabled = room.status !== "playing" || !myTurn;
  }

  if ($("passButton")) {
    $("passButton").disabled = room.status !== "playing" || !myTurn;
  }

  // 안내 문구
  if ($("hint")) {
    if (room.status === "waiting") {
      $("hint").textContent = "친구들이 입장하면 게임을 시작하세요!";
    } else if (myTurn) {
      $("hint").textContent = "지금은 당신의 차례입니다!";
    } else {
      $("hint").textContent =
        `${room.players[room.turn]?.name || "상대"}의 차례입니다.`;
    }
  }
});

// ==============================
// 단어 성공 이벤트
// ==============================

socket.on("wordPlayed", data => {
  const log = $("wordLog");

  if (log) {
    const item = document.createElement("div");

    item.className = "word-log-item";

    item.innerHTML = `
      <strong>${escapeHtml(data.name)}</strong>
      <span>${escapeHtml(data.word)}</span>
      <span class="log-score">+${data.score}점</span>
      ${data.multiplier > 1
        ? `<span class="log-combo">×${data.multiplier}</span>`
        : ""}
    `;

    log.prepend(item);
  }

  // 내 점수 획득 효과
  if (data.name && data.score && data.name === $("name")?.value.trim()) {
    showScoreEffect(`+${data.score}점`, "gain");
  }

  // 콤보 효과
  if (data.combo >= 2 && data.name === $("name")?.value.trim()) {
    showComboEffect(data.combo, data.multiplier);
  }
});

// ==============================
// 알림
// ==============================

socket.on("notice", message => {
  toast(message);
});

socket.on("errorMsg", message => {
  toast(message);
});

// ==============================
// HTML 보안 처리
// ==============================

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}
