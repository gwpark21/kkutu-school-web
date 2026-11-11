
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "public")));

const rooms = new Map();

// ==============================
// 1. 단어장
// ==============================

const starterWords = `
사과 과자 자동차 차표 표범 범인 인형 형광등 등산 산책 책상 상자
자전거 거울 울음 음식 식당 당근 근육 회사 사자 자석 석탄
탄산 산소 소금 금요일 일요일 학교 교실 실내 내일 일기 기차
차량 양말 말벌 벌집 집게 게임 임금 금고 고래 래퍼 퍼즐
바다 다리 리본 본능 능력 역사 사전 전기 기름 사람 마음 음악
악기 기린 스타 타조 조개 개미 미술 술잔 잔디 디지털 털실
실력 역전 전쟁 쟁반 반지 지도 도서관 관찰 찰흙 흙탕물 물고기
기상 상어 어항 항구 구름 식물 물병 병원 원숭이 이불 불꽃 꽃병
병아리 리듬 악수 수박 박수 수업 업적 적금 금액 액자 차례 예절
절약 약속 속도 도시 시계 계단 단어 어른 은행 행운 운동 동물
물감 감자 자판기 기계 계산 산수 수학 학습 습관
`.trim().split(/\s+/);

const dictionary = new Set(starterWords);

// words.txt 불러오기
const wordFile = path.join(__dirname, "words.txt");

if (fs.existsSync(wordFile)) {
  const extraWords = fs.readFileSync(wordFile, "utf8")
    .split(/\r?\n/)
    .map(word => word.trim())
    .filter(word => /^[가-힣]{2,10}$/.test(word));

  extraWords.forEach(word => dictionary.add(word));

  console.log(`추가 단어 ${extraWords.length}개 불러오기 완료`);
} else {
  console.log("words.txt 파일이 없습니다. 기본 단어장으로 실행합니다.");
}

console.log(`전체 단어 수: ${dictionary.size}개`);

// ==============================
// 2. 기본 함수
// ==============================

function cleanWord(word) {
  return String(word || "").trim().replace(/\s/g, "");
}

function makeRoomCode() {
  let code;

  do {
    code = crypto.randomBytes(2).toString("hex").toUpperCase();
  } while (rooms.has(code));

  return code;
}

function getRoom(code) {
  return rooms.get(String(code || "").toUpperCase());
}

// 제한 시간 계산
function getTurnTime(room) {
  return Math.max(
    7,
    20 - Math.floor(room.chainCount / 3) * 2
  );
}

// ==============================
// 3. 두음법칙
// ==============================

const dueumGroups = [
  ["라", "나"],
  ["래", "내"],
  ["로", "노"],
  ["뢰", "뇌"],
  ["루", "누"],
  ["르", "느"],

  ["랴", "야"],
  ["려", "여"],
  ["례", "예"],
  ["료", "요"],
  ["류", "유"],
  ["리", "이"],

  ["냐", "야"],
  ["녀", "여"],
  ["뇨", "요"],
  ["뉴", "유"],
  ["니", "이"],

  ["력", "역"],
  ["련", "연"],
  ["렬", "열"]
];

function getAllowedFirstChars(lastChar) {
  const allowed = new Set([lastChar]);

  for (const group of dueumGroups) {
    if (group.includes(lastChar)) {
      group.forEach(char => allowed.add(char));
    }
  }

  return allowed;
}

// ==============================
// 4. 방 정보
// ==============================

function publicRoom(room) {
  return {
    code: room.code,

    players: room.players.map(player => ({
      id: player.id,
      name: player.name,
      score: player.score,
      combo: player.combo,
      connected: player.connected
    })),

    status: room.status,
    turn: room.turn,
    word: room.word,
    seconds: room.seconds,
    chainCount: room.chainCount
  };
}

function sendState(room) {
  io.to(room.code).emit("state", publicRoom(room));
}

// ==============================
// 5. 점수 및 콤보
// ==============================

// 실패하면 현재 점수의 20% 감점
function failTurn(room) {
  const player = room.players[room.turn];

  if (!player) return;

  const penalty = Math.ceil(player.score * 0.2);

  player.score = Math.max(0, player.score - penalty);

  // 콤보 초기화
  player.combo = 0;
}

// 성공하면 단어 길이와 콤보에 따라 점수 획득
function rewardPlayer(player, word) {
  player.combo++;

  // 최대 5배
  const multiplier = Math.min(player.combo, 5);

  // 2글자 10점, 한 글자 길어질 때마다 5점 추가
  const baseScore = 10 + (word.length - 2) * 5;

  const earnedScore = baseScore * multiplier;

  player.score += earnedScore;

  return {
    earnedScore,
    multiplier
  };
}

// ==============================
// 6. 턴 관리
// ==============================

function stopTimer(room) {
  if (room.timer) {
    clearInterval(room.timer);
    room.timer = null;
  }
}

function nextTurn(room) {
  if (room.players.length === 0) return;

  room.turn = (room.turn + 1) % room.players.length;

  // 다음 차례의 제한 시간 초기화
  room.seconds = getTurnTime(room);

  sendState(room);
}

// ==============================
// 7. 타이머
// ==============================

function startTimer(room) {
  stopTimer(room);

  room.timer = setInterval(() => {
    if (room.status !== "playing") return;

    room.seconds--;

    if (room.seconds <= 0) {
      const player = room.players[room.turn];

      // 시간 초과 감점
      failTurn(room);

      io.to(room.code).emit(
        "notice",
        `${player?.name || "플레이어"} 시간 초과! 현재 점수의 20% 감점`
      );

      // 탈락하지 않고 다음 플레이어로 이동
      nextTurn(room);

      return;
    }

    sendState(room);

  }, 1000);
}

// ==============================
// 8. 소켓 연결
// ==============================

io.on("connection", socket => {

  // ------------------------------
  // 방 만들기
  // ------------------------------

  socket.on("create", data => {
    const name = typeof data === "string"
      ? data
      : data?.name;

    if (!name || !name.trim()) {
      socket.emit("errorMsg", "닉네임을 입력해 주세요.");
      return;
    }

    const code = makeRoomCode();

    const room = {
      code,
      host: socket.id,

      players: [{
        id: socket.id,
        name: name.trim(),
        score: 0,
        combo: 0,
        connected: true
      }],

      status: "waiting",
      turn: 0,
      word: "",
      seconds: 20,
      chainCount: 0,
      usedWords: new Set(),
      timer: null
    };

    rooms.set(code, room);

    socket.join(code);
    socket.data.room = code;

    socket.emit("created", publicRoom(room));
    sendState(room);
  });

  // ------------------------------
  // 방 참가
  // ------------------------------

  socket.on("join", data => {
    const code = String(data?.code || "").toUpperCase();
    const name = data?.name;

    const room = getRoom(code);

    if (!room) {
      socket.emit("errorMsg", "존재하지 않는 방입니다.");
      return;
    }

    if (!name || !name.trim()) {
      socket.emit("errorMsg", "닉네임을 입력해 주세요.");
      return;
    }

    if (room.status !== "waiting") {
      socket.emit("errorMsg", "이미 게임이 시작된 방입니다.");
      return;
    }

    if (room.players.length >= 8) {
      socket.emit("errorMsg", "방이 가득 찼습니다.");
      return;
    }

    room.players.push({
      id: socket.id,
      name: name.trim(),
      score: 0,
      combo: 0,
      connected: true
    });

    socket.join(code);
    socket.data.room = code;

    sendState(room);
  });

  // ------------------------------
  // 게임 시작
  // ------------------------------

  socket.on("start", () => {
    const room = getRoom(socket.data.room);

    if (!room) return;

    if (room.host !== socket.id) {
      socket.emit("errorMsg", "방장만 게임을 시작할 수 있습니다.");
      return;
    }

    if (room.status !== "waiting") return;

    if (room.players.length < 2) {
      socket.emit("errorMsg", "최소 2명이 있어야 시작할 수 있습니다.");
      return;
    }

    room.status = "playing";
    room.turn = 0;
    room.word = "";
    room.seconds = 20;
    room.chainCount = 0;
    room.usedWords.clear();

    // 게임 시작 시 점수와 콤보 초기화
    room.players.forEach(player => {
      player.score = 0;
      player.combo = 0;
    });

    sendState(room);
    startTimer(room);
  });

  // ------------------------------
  // 단어 입력
  // ------------------------------

  socket.on("word", data => {
    const room = getRoom(socket.data.room);

    if (!room || room.status !== "playing") return;

    const player = room.players[room.turn];

    if (!player || player.id !== socket.id) {
      socket.emit("errorMsg", "현재 차례가 아닙니다.");
      return;
    }

    const word = cleanWord(
      typeof data === "string" ? data : data?.word
    );

    if (!/^[가-힣]{2,10}$/.test(word)) {
      socket.emit("errorMsg", "2~10글자의 한글 단어를 입력해 주세요.");
      return;
    }

    if (!dictionary.has(word)) {
      socket.emit("errorMsg", "단어장에 없는 단어입니다.");
      return;
    }

    if (room.usedWords.has(word)) {
      socket.emit("errorMsg", "이미 사용한 단어입니다.");
      return;
    }

    // 끝말잇기 및 두음법칙 검사
    if (room.word) {
      const lastChar = room.word[word.length === 0 ? 0 : room.word.length - 1];
      const allowedChars = getAllowedFirstChars(lastChar);

      if (!allowedChars.has(word[0])) {
        socket.emit(
          "errorMsg",
          `"${lastChar}"(으)로 시작하는 단어를 입력해 주세요.`
        );
        return;
      }
    }

    // 단어 사용 처리
    room.usedWords.add(word);
    room.word = word;

    // 점수 지급
    const result = rewardPlayer(player, word);

    // 연속 성공 단어 수 증가
    room.chainCount++;

    io.to(room.code).emit("wordPlayed", {
      name: player.name,
      word,
      score: result.earnedScore,
      totalScore: player.score,
      combo: player.combo,
      multiplier: result.multiplier
    });

    // 다음 플레이어
    nextTurn(room);
  });

  // ------------------------------
  // 패스
  // ------------------------------

  socket.on("pass", () => {
    const room = getRoom(socket.data.room);

    if (!room || room.status !== "playing") return;

    const player = room.players[room.turn];

    if (!player || player.id !== socket.id) {
      socket.emit("errorMsg", "현재 차례가 아닙니다.");
      return;
    }

    failTurn(room);

    io.to(room.code).emit(
      "notice",
      `${player.name} 패스! 현재 점수의 20% 감점`
    );

    nextTurn(room);
  });

  // ------------------------------
  // 접속 종료
  // ------------------------------

  socket.on("disconnect", () => {
    const code = socket.data.room;
    const room = getRoom(code);

    if (!room) return;

    const index = room.players.findIndex(
      player => player.id === socket.id
    );

    if (index === -1) return;

    room.players.splice(index, 1);

    if (room.players.length === 0) {
      stopTimer(room);
      rooms.delete(code);
      return;
    }

    // 방장이 나가면 첫 번째 플레이어에게 방장 권한 이전
    if (room.host === socket.id) {
      room.host = room.players[0].id;
    }

    if (room.status === "playing") {
      if (index < room.turn) {
        room.turn--;
      } else if (index === room.turn) {
        room.turn = index % room.players.length;
        room.seconds = getTurnTime(room);
      }
    }

    sendState(room);
  });

});

// ==============================
// 9. 서버 실행
// ==============================

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`서버 실행 중: ${PORT}`);
});
