
const socket = io();

const $ = id => document.getElementById(id);

let myRoom = "";
let isHost = false;

// 이전 상태 저장
let previousScores = new Map();
let previousTurn = null;
let previousStatus = null;
let previousSeconds = null;

// 현재 차례의 최대 제한 시간
let timerMax = 20;

// =====================================
// 1. 디자인 효과 CSS 자동 추가
// =====================================

const style = document.createElement("style");

style.textContent = `
  /* 타이머 */
  #timer {
    font-weight: bold;
    transition: color 0.3s, transform 0.3s;
  }

  #timer.warning {
    color: #ff4040 !important;
    animation: timerWarning 0.55s infinite alternate;
  }

  @keyframes timerWarning {
    from {
      transform: scale(1);
      text-shadow: 0 0 3px #ff4040;
    }
    to {
      transform: scale(1.15);
      text-shadow: 0 0 14px #ff2020;
    }
  }

  /* 시간 게이지 */
  #timerBar {
    width: 100%;
    height: 9px;
    background: rgba(130,130,130,0.2);
    border-radius: 20px;
    overflow: hidden;
    margin-top: 8px;
  }

  #timerBarFill {
    width: 100%;
    height: 100%;
    background: linear-gradient(90deg, #22c55e, #3b82f6);
    border-radius: 20px;
    transition: width 0.9s linear, background 0.3s;
  }

  #timerBarFill.warning {
    background: linear-gradient(90deg, #ff3030, #ff7777);
  }

  /* 플레이어 목록 */
  #players li {
    transition: background 0.3s, transform 0.3s;
    position: relative;
  }

  #players li.active-player {
    background: rgba(100, 100, 255, 0.12);
    border-radius: 8px;
    font-weight: bold;
  }

  /* 점수 감소 */
  .score-down {
    display: inline-block;
    color: #ff4545;
    font-weight: bold;
    animation: scoreDown 0.7s ease;
  }

  /* 점수 증가 */
  .score-up {
    display: inline-block;
    color: #22c55e;
    font-weight: bold;
    animation: scoreUp 0.7s ease;
  }

  @keyframes scoreDown {
    0% {
      opacity: 0;
      transform: translateY(-8px);
    }
    40% {
      opacity: 1;
      transform: translateY(4px);
    }
    100% {
      opacity: 0;
      transform: translateY(-12px);
    }
  }

  @keyframes scoreUp {
    0% {
      opacity: 0;
      transform: translateY(8px);
    }
    40% {
      opacity: 1;
      transform: translateY(-4px);
    }
    100% {
      opacity: 0;
      transform: translateY(-14px);
    }
  }

  /* 단어 성공 기록 */
  .word-log-item {
    animation: logAppear 0.35s ease;
  }

  @keyframes logAppear {
    from {
      opacity: 0;
      transform: translateX(-12px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }
`;

document.head.appendChild(style);

// 타이머 게이지 생성
const timerElement = $("timer");

if (timerElement && ! $("timerBar")) {
  const timerBar = document.createElement("div");

  timerBar.id = "timerBar";

  timerBar.innerHTML = `
    <div id="timerBarFill"></div>
  `;

  timerElement.insertAdjacentElement("afterend", timerBar);
}

// =====================================
// 2. 알림 메시지
// =====================================

function toast(msg) {
  $("toast").textContent = msg;
  $("toast").style.display = "block";

  setTimeout(() => {
    $("toast").style.display = "none";
  }, 2800);
}

// =====================================
// 3. 플레이어 이름
// =====================================

function name() {
  return $("name").value.trim() || "플레이어";
}

// =====================================
// 4. 방 생성
// =====================================

$("create").onclick = () => {
  socket.emit("create", name());
};

// =====================================
// 5. 방 입장
// =====================================

$("join").onclick = () => {
  socket.emit("join", {
    code: $("code").value.trim(),
    name: name()
  });
};

// =====================================
// 6. 게임 시작
// =====================================

$("start").onclick = () => {
  socket.emit("start");
};

// =====================================
// 7. 단어 입력
// =====================================

$("submit").onclick = submitWord;

$("word").addEventListener("keydown", e => {
  if (e.key === "Enter") {
    submitWord();
  }
});

function submitWord() {
  if ($("word").value.trim()) {
    socket.emit("word", $("word").value);
    $("word").value = "";
  }
}

// =====================================
// 8. 차례 넘기기
// =====================================

$("pass").onclick = () => {
  socket.emit("pass");
};

// =====================================
// 9. 방 생성 완료
// =====================================

socket.on("created", code => {
  myRoom = code;
  isHost = true;

  $("login").classList.add("hidden");
  $("game").classList.remove("hidden");

  $("roomcode").textContent = code;
  $("start").style.display = "block";
});

// =====================================
// 10. 타이머 화면 갱신
// =====================================

function updateTimer(seconds, status) {
  const timer = $("timer");
  const fill = $("timerBarFill");

  if (!timer || !fill) return;

  timer.textContent = `${seconds}초`;

  if (status !== "playing") {
    timer.classList.remove("warning");
    fill.classList.remove("warning");
    fill.style.width = "100%";
    return;
  }

  const percent = Math.max(
    0,
    Math.min(100, (seconds / timerMax) * 100)
  );

  fill.style.width = `${percent}%`;

  // 마지막 5초 경고
  if (seconds <= 5) {
    timer.classList.add("warning");
    fill.classList.add("warning");
  } else {
    timer.classList.remove("warning");
    fill.classList.remove("warning");
  }
}

// =====================================
// 11. 플레이어 점수 애니메이션
// =====================================

function getScoreEffect(name, score) {
  const previous = previousScores.get(name);

  if (previous === undefined || previous === score) {
    return "";
  }

  const difference = score - previous;

  if (difference < 0) {
    return `<span class="score-down">-${Math.abs(difference)}</span>`;
  }

  return `<span class="score-up">+${difference}</span>`;
}

// =====================================
// 12. 방 상태 업데이트
// =====================================

socket.on("state", r => {
  myRoom = r.code;

  // 입장자도 게임 화면으로 전환
  $("login").classList.add("hidden");
  $("game").classList.remove("hidden");

  $("roomcode").textContent = r.code;

  $("status").textContent =
    r.status === "waiting"
      ? "대기 중"
      : "게임 진행 중";

  $("currentword").textContent =
    r.word || "시작 단어 없음";

  // 차례가 바뀌거나 게임이 시작되면
  // 새로운 턴의 최대 시간을 설정
  const newTurn =
    previousTurn !== r.turn ||
    previousStatus !== r.status ||
    (previousSeconds !== null && r.seconds > previousSeconds);

  if (r.status === "playing" && newTurn) {
    timerMax = r.seconds;
  }

  // 타이머 갱신
  updateTimer(r.seconds, r.status);

  // 플레이어 목록 갱신
  $("players").innerHTML = r.players.map((p, i) => {

    const isActive =
      i === r.turn && r.status === "playing";

    const effect = getScoreEffect(p.name, p.score);

    return `
      <li class="${isActive ? "active-player" : ""}">
        ${isActive ? "▶ " : ""}
        ${escapeHtml(p.name)}
        · ${p.score}점
        ${effect}
        ${p.connected ? "" : " (연결 끊김)"}
      </li>
    `;

  }).join("");

  // 최신 점수 저장
  previousScores.clear();

  r.players.forEach(p => {
    previousScores.set(p.name, p.score);
  });

  // 방장만 게임 시작 버튼 표시
  $("start").style.display =
    isHost && r.status === "waiting"
      ? "block"
      : "none";

  $("hint").textContent =
    r.status === "waiting"
      ? "방 코드 공유 후 2명 이상 모이면 시작하세요."
      : "현재 차례인 플레이어가 단어를 입력합니다.";

  // 이전 상태 저장
  previousTurn = r.turn;
  previousStatus = r.status;
  previousSeconds = r.seconds;
});

// =====================================
// 13. 단어 기록
// =====================================

socket.on("wordPlayed", d => {
  const div = document.createElement("div");

  div.className = "word-log-item";

  div.textContent =
    `${d.name}: ${d.word} (+10점)`;

  $("log").prepend(div);
});

// =====================================
// 14. 알림 및 오류
// =====================================

socket.on("notice", toast);

socket.on("errorMsg", toast);

// =====================================
// 15. HTML 특수문자 처리
// =====================================

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]));
}
