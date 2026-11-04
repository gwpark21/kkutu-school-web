
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const crypto = require("crypto");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "public")));

const rooms = new Map();

// 단어장
const dictionary = new Set(
  ("사과 과자 자동차 차표 표범 범인 인형 형사 사자 자전거 거미 미술 술잔 잔디 디지털 털실 실내 내일 일기 기차 차례 예술 술집 집게 게살 살구 구름 름?")
    .split(" ")
);

const starterWords = (
  "학교 교실 학생 선생님 컴퓨터 인터넷 게임 끄투 온라인 친구 가족 사랑 마음 바다 하늘 구름 나무 꽃 사과 바나나 포도 수박 딸기 과일 음식 라면 떡볶이 김밥 치킨 피자 햄버거 우유 물고기 고양이 강아지 토끼 사자 호랑이 코끼리 기린 원숭이 다람쥐 자동차 자전거 비행기 기차 버스 지하철 택시 도로 신호등 건물 아파트 집 방 책상 의자 책 공책 연필 지우개 가방 시계 전화기 카메라 사진 음악 노래 영화 드라마 만화 게임 운동 축구 농구 야구 배구 수영 달리기 체육 과학 수학 국어 영어 역사 지리 우주 행성 별 달 태양 지구 화성 은하 로봇 인공지능 데이터 알고리즘 코드 프로그램 개발자 컴퓨터공학 전기 전자 반도체 에너지 환경 기후 날씨 비 눈 바람 태풍 번개 무지개 겨울 여름 봄 가을 꽃밭 숲 나뭇잎 열매 씨앗 바위 강 호수 바다섬 해변 모래 조개 고래 상어 문어 오징어 새우 게 거북이 펭귄 독수리 참새 비둘기 나비 벌 개미 거미 잠자리 매미 풀 나무 대나무 소나무 장미 튤립 해바라기 국화 백합 민들레"
).split(" ");

starterWords.forEach(w => dictionary.add(w));

// 단어 정리
function cleanWord(w) {
  return String(w || "").trim().replace(/[^가-힣]/g, "");
}

function getRoom(code) {
  return rooms.get(code);
}

// 공개 방 정보
function publicRoom(r) {
  return {
    code: r.code,
    players: r.players.map(p => ({
      name: p.name,
      score: p.score,
      connected: p.connected
    })),
    status: r.status,
    turn: r.turn,
    word: r.word,
    seconds: r.seconds
  };
}

// 방 상태 전송
function emitRoom(r) {
  io.to(r.code).emit("state", publicRoom(r));
}

// 다음 차례
function nextTurn(r) {
  r.turn = (r.turn + 1) % r.players.length;
  r.seconds = 20;

  emitRoom(r);

  io.to(r.code).emit(
    "notice",
    `${r.players[r.turn].name}님의 차례입니다.`
  );
}

io.on("connection", socket => {

  // 방 생성
  socket.on("create", name => {
    name = String(name || "").trim().slice(0, 12) || "플레이어";

    let code;

    do {
      code = crypto.randomBytes(2).toString("hex").toUpperCase();
    } while (rooms.has(code));

    const p = {
      id: socket.id,
      name,
      score: 0,
      connected: true
    };

    const r = {
      code,
      players: [p],
      status: "waiting",
      turn: 0,
      word: "",
      seconds: 20,
      host: socket.id,
      timer: null,
      used: new Set()
    };

    rooms.set(code, r);

    socket.join(code);
    socket.data.room = code;
    socket.data.player = socket.id;

    socket.emit("created", code);

    emitRoom(r);
  });

  // 방 입장
  socket.on("join", ({ code, name }) => {
    code = String(code || "").toUpperCase().trim();
    name = String(name || "").trim().slice(0, 12) || "플레이어";

    const r = getRoom(code);

    if (!r) {
      return socket.emit("errorMsg", "방 코드가 올바르지 않습니다.");
    }

    if (r.status !== "waiting") {
      return socket.emit("errorMsg", "이미 게임이 시작된 방입니다.");
    }

    if (r.players.length >= 8) {
      return socket.emit("errorMsg", "방 인원이 가득 찼습니다. (최대 8명)");
    }

    if (r.players.some(p => p.name === name)) {
      name = name.slice(0, 9) + "_" + Math.floor(Math.random() * 99);
    }

    const p = {
      id: socket.id,
      name,
      score: 0,
      connected: true
    };

    r.players.push(p);

    socket.join(code);
    socket.data.room = code;
    socket.data.player = socket.id;

    emitRoom(r);

    io.to(code).emit("notice", `${name}님이 입장했습니다.`);
  });

  // 게임 시작
  socket.on("start", () => {
    const r = getRoom(socket.data.room);

    if (!r || r.host !== socket.id) return;

    if (r.players.length < 2) {
      return socket.emit(
        "errorMsg",
        "2명 이상 모여야 시작할 수 있어요."
      );
    }

    if (r.status !== "waiting") return;

    r.status = "playing";
    r.turn = 0;
    r.word = "";
    r.seconds = 20;
    r.used.clear();

    emitRoom(r);

    io.to(r.code).emit(
      "notice",
      "게임 시작! 20초 안에 단어를 입력하세요."
    );

    r.timer = setInterval(() => {
      if (r.status !== "playing") return;

      r.seconds--;

      if (r.seconds <= 0) {
        io.to(r.code).emit(
          "notice",
          `${r.players[r.turn].name}님 시간 초과!`
        );

        nextTurn(r);
      } else {
        emitRoom(r);
      }
    }, 1000);
  });

  // 단어 입력
  socket.on("word", raw => {
    const r = getRoom(socket.data.room);

    if (!r || r.status !== "playing") return;

    const p = r.players[r.turn];

    if (!p || p.id !== socket.id) {
      return socket.emit(
        "errorMsg",
        "지금은 당신의 차례가 아닙니다."
      );
    }

    const w = cleanWord(raw);

    if (w.length < 2 || w.length > 10) {
      return socket.emit(
        "errorMsg",
        "2~10글자 한글 단어를 입력하세요."
      );
    }

    if (!dictionary.has(w)) {
      return socket.emit(
        "errorMsg",
        "예시 단어장에 없는 단어예요. 다른 단어를 입력해 보세요."
      );
    }

    if (r.word && w[0] !== r.word[r.word.length - 1]) {
      return socket.emit(
        "errorMsg",
        `'${r.word[r.word.length - 1]}'(으)로 시작해야 해요.`
      );
    }

    if (r.used.has(w)) {
      return socket.emit(
        "errorMsg",
        "이미 사용한 단어입니다."
      );
    }

    r.used.add(w);
    r.word = w;
    p.score += 10;

    io.to(r.code).emit("wordPlayed", {
      name: p.name,
      word: w,
      score: p.score
    });

    nextTurn(r);
  });

  // 차례 넘기기
  socket.on("pass", () => {
    const r = getRoom(socket.data.room);

    if (!r || r.status !== "playing") return;

    if (r.players[r.turn]?.id !== socket.id) {
      return socket.emit(
        "errorMsg",
        "지금은 당신의 차례가 아닙니다."
      );
    }

    io.to(r.code).emit(
      "notice",
      `${r.players[r.turn].name}님이 넘겼습니다.`
    );

    nextTurn(r);
  });

  // 연결 종료
  socket.on("disconnect", () => {
    const r = getRoom(socket.data.room);

    if (!r) return;

    const idx = r.players.findIndex(p => p.id === socket.id);

    if (idx < 0) return;

    const p = r.players[idx];

    p.connected = false;

    io.to(r.code).emit(
      "notice",
      `${p.name}님 연결이 끊겼습니다.`
    );

    if (r.status === "waiting") {
      r.players.splice(idx, 1);

      if (!r.players.length) {
        rooms.delete(r.code);
        return;
      }

      if (r.host === socket.id) {
        r.host = r.players[0].id;
      }
    } else if (
      r.status === "playing" &&
      r.players[r.turn]?.id === socket.id
    ) {
      nextTurn(r);
    }

    emitRoom(r);
  });

});

// 서버 실행
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`Kkutu Web server listening on ${PORT}`);
});
