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

const characterById = new Map(CHARACTERS.map(c => [c.id, c]));

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

function getTurnTime(room) {
  return Math.max(7, 20 - Math.floor(room.chainCount / 3) * 2);
}

const dueumGroups = [
  ["라", "나"], ["래", "내"], ["로", "노"], ["뢰", "뇌"],
  ["루", "누"], ["르", "느"], ["랴", "야"], ["려", "여"],
  ["례", "예"], ["료", "요"], ["류", "유"], ["리", "이"],
  ["냐", "야"], ["녀", "여"], ["뇨", "요"], ["뉴", "유"],
  ["니", "이"], ["력", "역"], ["련", "연"], ["렬", "열"]
];

function getAllowedFirstChars(lastChar) {
  const allowed = new Set([lastChar]);
  for (const group of dueumGroups) {
    if (group.includes(lastChar)) group.forEach(char => allowed.add(char));
  }
  return allowed;
}

function publicRoom(room) {
  return {
    code: room.code,
    hostId: room.host,
    players: room.players.map(player => ({
      id: player.id,
      name: player.name,
      score: player.score,
      combo: player.combo,
      connected: player.connected,
      character: player.character
    })),
    status: room.status,
    turn: room.turn,
    word: room.word,
    seconds: room.seconds,
    chainCount: room.chainCount,
    remainingGameSeconds: room.remainingGameSeconds,
    allowDuplicateCharacters: room.allowDuplicateCharacters,
    winners: room.winners || []
  };
}

function sendState(room) {
  io.to(room.code).emit("state", publicRoom(room));
}

function stopTimer(room) {
  if (room.timer) {
    clearInterval(room.timer);
    room.timer = null;
  }
}

function failTurn(room) {
  const player = room.players[room.turn];
  if (!player) return 0;
  const penalty = Math.ceil(player.score * 0.2);
  player.score = Math.max(0, player.score - penalty);
  player.combo = 0;
  return penalty;
}

function rewardPlayer(player, word) {
  player.combo++;
  const multiplier = Math.min(player.combo, 5);
  const baseScore = 10 + (word.length - 2) * 5;
  const earnedScore = baseScore * multiplier;
  player.score += earnedScore;
  return { earnedScore, multiplier };
}

function finishGame(room) {
  if (room.status !== "playing") return;
  stopTimer(room);
  room.status = "finished";

  const highest = Math.max(0, ...room.players.map(player => player.score));
  room.winners = highest === 0
    ? []
    : room.players.filter(player => player.score === highest).map(player => player.id);

  const winnerNames = room.players
    .filter(player => room.winners.includes(player.id))
    .map(player => player.name);

  io.to(room.code).emit("gameOver", {
    winners: room.winners,
    winnerNames,
    highestScore: highest
  });
  sendState(room);
}

function nextTurn(room) {
  if (room.players.length === 0) return;
  room.turn = (room.turn + 1) % room.players.length;
  room.seconds = getTurnTime(room);
  sendState(room);
}

function startGameClock(room) {
  stopTimer(room);
  room.timer = setInterval(() => {
    if (room.status !== "playing") return;

    room.remainingGameSeconds--;

    if (room.remainingGameSeconds <= 0) {
      room.remainingGameSeconds = 0;
      finishGame(room);
      return;
    }

    room.seconds--;

    if (room.seconds <= 0) {
      const player = room.players[room.turn];
      const penalty = failTurn(room);
      io.to(room.code).emit(
        "notice",
        `${player?.name || "플레이어"} 시간 초과! ${penalty}점 감점`
      );
      nextTurn(room);
      return;
    }

    sendState(room);
  }, 1000);
}

function chooseAvailableCharacter(room, requestedId) {
  const requested = characterById.has(requestedId) ? requestedId : CHARACTERS[0].id;
  if (room.allowDuplicateCharacters) return requested;

  const used = new Set(room.players.map(player => player.character));
  if (!used.has(requested)) return requested;
  return CHARACTERS.find(character => !used.has(character.id))?.id || null;
}

io.on("connection", socket => {
  socket.on("create", data => {
    const name = typeof data === "string" ? data : data?.name;
    const requestedCharacter = typeof data === "object" ? data?.character : null;

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
        name: name.trim().slice(0, 12),
        score: 0,
        combo: 0,
        connected: true,
        character: characterById.has(requestedCharacter) ? requestedCharacter : "bear"
      }],
      status: "waiting",
      turn: 0,
      word: "",
      seconds: 20,
      chainCount: 0,
      remainingGameSeconds: 120,
      allowDuplicateCharacters: true,
      usedWords: new Set(),
      timer: null,
      winners: []
    };

    rooms.set(code, room);
    socket.join(code);
    socket.data.room = code;
    socket.emit("created", publicRoom(room));
    sendState(room);
  });

  socket.on("join", data => {
    const code = String(data?.code || "").toUpperCase();
    const name = data?.name;
    const requestedCharacter = data?.character;
    const room = getRoom(code);

    if (!room) return socket.emit("errorMsg", "존재하지 않는 방입니다.");
    if (!name || !name.trim()) return socket.emit("errorMsg", "닉네임을 입력해 주세요.");
    if (room.status !== "waiting") return socket.emit("errorMsg", "이미 게임이 시작된 방입니다.");
    if (room.players.length >= 8) return socket.emit("errorMsg", "방이 가득 찼습니다.");

    const character = chooseAvailableCharacter(room, requestedCharacter);
    if (!character) return socket.emit("errorMsg", "선택할 수 있는 캐릭터가 없습니다.");

    room.players.push({
      id: socket.id,
      name: name.trim().slice(0, 12),
      score: 0,
      combo: 0,
      connected: true,
      character
    });

    socket.join(code);
    socket.data.room = code;
    sendState(room);
  });

  socket.on("selectCharacter", characterId => {
    const room = getRoom(socket.data.room);
    if (!room || room.status !== "waiting") return;
    const player = room.players.find(item => item.id === socket.id);
    if (!player || !characterById.has(characterId)) return;

    if (!room.allowDuplicateCharacters &&
        room.players.some(item => item.id !== socket.id && item.character === characterId)) {
      socket.emit("errorMsg", "이미 다른 플레이어가 선택한 캐릭터입니다.");
      return;
    }

    player.character = characterId;
    sendState(room);
  });

  socket.on("setDuplicateCharacters", allow => {
    const room = getRoom(socket.data.room);
    if (!room || room.status !== "waiting") return;
    if (room.host !== socket.id) {
      socket.emit("errorMsg", "방장만 캐릭터 중복 설정을 바꿀 수 있습니다.");
      return;
    }

    const nextValue = Boolean(allow);
    if (!nextValue) {
      const chosen = room.players.map(player => player.character);
      if (new Set(chosen).size !== chosen.length) {
        socket.emit("errorMsg", "현재 같은 캐릭터를 선택한 플레이어가 있어요. 먼저 캐릭터를 변경해 주세요.");
        return;
      }
    }

    room.allowDuplicateCharacters = nextValue;
    sendState(room);
  });

  socket.on("start", () => {
    const room = getRoom(socket.data.room);
    if (!room) return;
    if (room.host !== socket.id) return socket.emit("errorMsg", "방장만 게임을 시작할 수 있습니다.");
    if (room.status !== "waiting") return;
    if (room.players.length < 2) return socket.emit("errorMsg", "최소 2명이 있어야 시작할 수 있습니다.");

    room.status = "playing";
    room.turn = 0;
    room.word = "";
    room.seconds = 20;
    room.chainCount = 0;
    room.remainingGameSeconds = 120;
    room.usedWords.clear();
    room.winners = [];

    room.players.forEach(player => {
      player.score = 0;
      player.combo = 0;
    });

    sendState(room);
    startGameClock(room);
  });

  socket.on("word", data => {
    const room = getRoom(socket.data.room);
    if (!room || room.status !== "playing") return;

    const player = room.players[room.turn];
    if (!player || player.id !== socket.id) {
      socket.emit("errorMsg", "현재 차례가 아닙니다.");
      return;
    }

    const word = cleanWord(typeof data === "string" ? data : data?.word);
    if (!/^[가-힣]{2,10}$/.test(word)) return socket.emit("errorMsg", "2~10글자의 한글 단어를 입력해 주세요.");
    if (!dictionary.has(word)) return socket.emit("errorMsg", "단어장에 없는 단어입니다.");
    if (room.usedWords.has(word)) return socket.emit("errorMsg", "이미 사용한 단어입니다.");

    if (room.word) {
      const lastChar = room.word[room.word.length - 1];
      const allowedChars = getAllowedFirstChars(lastChar);
      if (!allowedChars.has(word[0])) {
        socket.emit("errorMsg", `"${lastChar}"(으)로 시작하는 단어를 입력해 주세요.`);
        return;
      }
    }

    room.usedWords.add(word);
    room.word = word;
    const result = rewardPlayer(player, word);
    room.chainCount++;

    io.to(room.code).emit("wordPlayed", {
      playerId: player.id,
      name: player.name,
      word,
      earnedScore: result.earnedScore,
      totalScore: player.score,
      combo: player.combo,
      multiplier: result.multiplier
    });

    nextTurn(room);
  });

  socket.on("pass", () => {
    const room = getRoom(socket.data.room);
    if (!room || room.status !== "playing") return;

    const player = room.players[room.turn];
    if (!player || player.id !== socket.id) {
      socket.emit("errorMsg", "현재 차례가 아닙니다.");
      return;
    }

    const penalty = failTurn(room);
    io.to(room.code).emit("notice", `${player.name} 패스! ${penalty}점 감점`);
    nextTurn(room);
  });

  socket.on("disconnect", () => {
    const code = socket.data.room;
    const room = getRoom(code);
    if (!room) return;

    const index = room.players.findIndex(player => player.id === socket.id);
    if (index === -1) return;

    room.players.splice(index, 1);

    if (room.players.length === 0) {
      stopTimer(room);
      rooms.delete(code);
      return;
    }

    if (room.host === socket.id) room.host = room.players[0].id;

    if (room.status === "playing") {
      if (index < room.turn) room.turn--;
      else if (index === room.turn) {
        room.turn = index % room.players.length;
        room.seconds = getTurnTime(room);
      }
    }

    sendState(room);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`서버 실행 중: ${PORT}`));
