
const socket = io();

const $ = id => document.getElementById(id);

let myRoom = "";
let isHost = false;

// 알림 메시지
function toast(msg) {
  $("toast").textContent = msg;
  $("toast").style.display = "block";

  setTimeout(() => {
    $("toast").style.display = "none";
  }, 2800);
}

// 플레이어 이름
function name() {
  return $("name").value.trim() || "플레이어";
}

// 방 생성
$("create").onclick = () => {
  socket.emit("create", name());
};

// 방 입장
$("join").onclick = () => {
  socket.emit("join", {
    code: $("code").value.trim(),
    name: name()
  });
};

// 게임 시작
$("start").onclick = () => {
  socket.emit("start");
};

// 단어 입력
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

// 차례 넘기기
$("pass").onclick = () => {
  socket.emit("pass");
};

// 방 생성 완료
socket.on("created", code => {
  myRoom = code;
  isHost = true;

  $("login").classList.add("hidden");
  $("game").classList.remove("hidden");

  $("roomcode").textContent = code;
  $("start").style.display = "block";
});

// 방 상태 업데이트
socket.on("state", r => {
  myRoom = r.code;

  // 방 생성자와 입장자 모두 게임 화면으로 전환
  $("login").classList.add("hidden");
  $("game").classList.remove("hidden");

  $("roomcode").textContent = r.code;

  $("status").textContent =
    r.status === "waiting"
      ? "대기 중"
      : "게임 진행 중";

  $("currentword").textContent =
    r.word || "시작 단어 없음";

  $("timer").textContent = r.seconds;

  // 플레이어 목록 갱신
  $("players").innerHTML = r.players.map((p, i) =>
    `<li>${
      i === r.turn && r.status === "playing" ? "▶ " : ""
    }${escapeHtml(p.name)} · ${p.score}점${
      p.connected ? "" : " (연결 끊김)"
    }</li>`
  ).join("");

  // 방장만 게임 시작 버튼 표시
  $("start").style.display =
    isHost && r.status === "waiting"
      ? "block"
      : "none";

  $("hint").textContent =
    r.status === "waiting"
      ? "방 코드 공유 후 2명 이상 모이면 시작하세요."
      : "현재 차례인 플레이어가 단어를 입력합니다.";
});

// 단어 기록
socket.on("wordPlayed", d => {
  const div = document.createElement("div");

  div.textContent =
    `${d.name}: ${d.word} (+10점)`;

  $("log").prepend(div);
});

// 알림
socket.on("notice", toast);

// 오류 메시지
socket.on("errorMsg", toast);

// HTML 특수문자 처리
function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]));
}
