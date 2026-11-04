# 끄투 학교 웹 (브라우저 멀티플레이)

## 웹사이트로 배포하기
이 프로젝트는 Node.js + Express + Socket.IO 기반입니다. 정적 HTML만으로는 여러 사람의 실시간 플레이가 불가능해 서버가 필요합니다.

### Render에 배포 (브라우저로 접속하는 공개 사이트)
1. GitHub 계정에서 새 저장소(repository)를 만들고 이 폴더 파일을 업로드합니다.
2. Render.com에 로그인하고 **New > Web Service** 선택 후 GitHub 저장소를 연결합니다.
3. `render.yaml` 설정을 확인하거나, Build Command=`npm install`, Start Command=`npm start`로 설정합니다.
4. Deploy를 누릅니다. 배포 완료 후 Render가 제공하는 `https://...onrender.com` 주소를 친구들에게 공유합니다.
5. 모두 같은 웹주소로 접속하고, 한 명이 방을 만들고 방 코드를 나눠줍니다.

### 로컬 테스트
Node.js LTS 설치 후 폴더에서 `npm install`, `npm start` 실행. 브라우저에서 http://localhost:3000

## 참고
- 현재 내장 단어장은 데모용으로 제한적입니다. 전체 끄투 공식 단어 DB가 포함된 것은 아닙니다.
- 무료 호스팅은 잠자기/시작 지연이나 사용량 제한이 있을 수 있습니다.
- 학교 네트워크나 계정의 이용 규칙을 지켜 주세요.
