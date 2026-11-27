/* 그림판 템플릿 (1600×1000 종이 기준). 모두 같은 색 체계를 써요:
   글자 #191f28 · 보조 글자 #4e5968 · 파랑 #3182f6 · 초록 #20c997 · 주황 #ff9f43 · 보라 #845ef7 · 분홍 #f2638a · 청록 #0ca5b0 */
const INK = '#191f28', SUB = '#4e5968', LINE = '#c5ccd6';
const C = { blue: '#3182f6', green: '#20c997', orange: '#ff9f43', purple: '#845ef7', pink: '#f2638a', teal: '#0ca5b0' };
const title = (s, x = 80, y = 56) => ({ t: 'text', c: INK, z: 44, s, p: [x, y] });
const note = (s, x, y, z = 22, c = SUB) => ({ t: 'text', c, z, s, p: [x, y] });

/* 곡선 마인드맵: 진한 남색 중심 알약 → 여섯 갈래 곡선 → 둥근 가지 상자 + 키워드 */
function mindmapCurve() {
  const out = [];
  const cx1 = 620, cx2 = 980, cy = 500;
  const rows = [130, 430, 730];
  const left = [C.green, C.blue, C.purple], right = [C.orange, C.pink, C.teal];
  rows.forEach((y, i) => {
    out.push({ t: 'curve', c: left[i], w: 7, p: [cx1, cy, 520, y + 50, 460, y + 50] });
    out.push({ t: 'curve', c: right[i], w: 7, p: [cx2, cy, 1080, y + 50, 1140, y + 50] });
  });
  out.push({ t: 'rect', c: '#1b2a4a', w: 4, f: 2, r: 80, sh: true, s: '중심 주제', z: 46, p: [cx1, 420, cx2, 580] });
  rows.forEach((y, i) => {
    out.push({ t: 'rect', c: left[i], w: 3, f: 1, r: 50, sh: true, s: `가지 ${i * 2 + 1}`, z: 30, p: [140, y, 460, y + 100] });
    out.push({ t: 'rect', c: right[i], w: 3, f: 1, r: 50, sh: true, s: `가지 ${i * 2 + 2}`, z: 30, p: [1140, y, 1460, y + 100] });
    out.push(note('· 키워드', 172, y + 116), note('· 키워드', 1172, y + 116));
  });
  return out;
}
/* 기본 마인드맵: 동그란 중심 → 네 갈래 굵은 선 → 상자 */
function mindmapBasic() {
  const out = [];
  const b = [
    { c: C.green, box: [170, 140, 510, 260], from: [650, 430], to: [510, 230], sub: [[180, 290], [180, 330]] },
    { c: C.orange, box: [1090, 140, 1430, 260], from: [950, 430], to: [1090, 230], sub: [[1100, 290], [1100, 330]] },
    { c: C.purple, box: [170, 740, 510, 860], from: [650, 570], to: [510, 770], sub: [[180, 650], [180, 690]] },
    { c: C.pink, box: [1090, 740, 1430, 860], from: [950, 570], to: [1090, 770], sub: [[1100, 650], [1100, 690]] },
  ];
  b.forEach((x) => out.push({ t: 'line', c: x.c, w: 8, p: [...x.from, ...x.to] }));
  out.push({ t: 'ellipse', c: C.blue, w: 4, f: 2, sh: true, s: '중심 주제', z: 44, p: [600, 390, 1000, 610] });
  b.forEach((x, i) => {
    out.push({ t: 'rect', c: x.c, w: 4, f: 1, r: 18, sh: true, s: `가지 ${i + 1}`, z: 32, p: x.box });
    out.push(note('· 세부 내용', ...x.sub[0], 24), note('· 예시나 키워드', ...x.sub[1], 24));
  });
  return out;
}
/* 순서도: 시작 → 단계 → 판단 → 예/아니오 → 끝 */
function flow() {
  return [
    title('흐름 정리'),
    { t: 'rect', c: C.green, w: 4, f: 2, r: 70, sh: true, s: '시작', z: 32, p: [60, 400, 280, 540] },
    { t: 'arrow', c: SUB, w: 4, p: [290, 470, 360, 470] },
    { t: 'rect', c: C.blue, w: 4, f: 1, r: 18, sh: true, s: '1단계', z: 30, p: [370, 390, 640, 550] },
    { t: 'arrow', c: SUB, w: 4, p: [650, 470, 720, 470] },
    { t: 'diamond', c: C.orange, w: 4, f: 1, sh: true, s: '이해했나요?', z: 26, p: [730, 350, 1010, 590] },
    { t: 'arrow', c: SUB, w: 4, p: [1020, 470, 1090, 470] },
    note('예', 1040, 420, 26, C.green),
    { t: 'rect', c: C.blue, w: 4, f: 1, r: 18, sh: true, s: '2단계', z: 30, p: [1100, 390, 1340, 550] },
    { t: 'arrow', c: SUB, w: 4, p: [1350, 470, 1400, 470] },
    { t: 'rect', c: INK, w: 4, f: 2, r: 60, sh: true, s: '끝', z: 32, p: [1410, 410, 1560, 530] },
    { t: 'arrow', c: SUB, w: 4, p: [870, 600, 870, 720] },
    note('아니오', 886, 636, 26, '#f04452'),
    { t: 'rect', c: '#f04452', w: 4, f: 1, r: 18, sh: true, s: '다시 보기', z: 28, p: [740, 730, 1000, 860] },
    { t: 'curve', c: SUB, w: 4, a: true, p: [730, 795, 505, 795, 505, 560] },
  ];
}
/* 비교 표: 진한 머리줄 + 회색 줄 이름 + 옅은 칸 */
function compare() {
  const out = [title('A와 B 비교', 80, 50),
    { t: 'rect', c: C.blue, w: 4, f: 2, r: 18, sh: true, s: 'A', z: 34, p: [400, 140, 940, 230] },
    { t: 'rect', c: C.pink, w: 4, f: 2, r: 18, sh: true, s: 'B', z: 34, p: [990, 140, 1530, 230] }];
  ['정의', '특징', '장점', '단점'].forEach((r, i) => {
    const y = 260 + i * 180;
    out.push({ t: 'rect', c: '#8b95a1', w: 3, f: 2, r: 18, s: r, z: 30, p: [80, y, 360, y + 150] });
    out.push({ t: 'rect', c: C.blue, w: 3, f: 1, r: 18, s: '두 번 눌러 쓰기', z: 22, p: [400, y, 940, y + 150] });
    out.push({ t: 'rect', c: C.pink, w: 3, f: 1, r: 18, s: '두 번 눌러 쓰기', z: 22, p: [990, y, 1530, y + 150] });
  });
  return out;
}
/* 벤 다이어그램: 겹치는 두 원 + 공통점 */
function venn() {
  return [title('벤 다이어그램'),
    { t: 'ellipse', c: C.blue, w: 4, f: 1, p: [200, 190, 900, 880] },
    { t: 'ellipse', c: C.pink, w: 4, f: 1, p: [700, 190, 1400, 880] },
    { t: 'text', c: C.blue, z: 48, s: 'A', p: [400, 270] },
    { t: 'text', c: C.pink, z: 48, s: 'B', p: [1160, 270] },
    { t: 'text', c: INK, z: 32, s: '공통점', p: [745, 440] },
    note('· A만의 특징', 300, 480, 26), note('· A만의 특징', 300, 530, 26),
    note('· B만의 특징', 1060, 480, 26), note('· B만의 특징', 1060, 530, 26),
    note('· 같은 점', 755, 500, 26), note('· 같은 점', 755, 550, 26)];
}
/* 타임라인: 가로 줄 위 다섯 점, 위아래로 번갈아 단계 상자 */
function timeline() {
  const out = [title('타임라인'), { t: 'arrow', c: LINE, w: 8, p: [100, 500, 1510, 500] }];
  const cols = [C.blue, C.green, C.orange, C.purple, C.pink];
  [200, 500, 800, 1100, 1400].forEach((x, i) => {
    const up = i % 2 === 0;
    out.push({ t: 'line', c: cols[i], w: 4, p: up ? [x, 410, x, 478] : [x, 522, x, 590] });
    out.push({ t: 'ellipse', c: cols[i], w: 4, f: 2, sh: true, p: [x - 22, 478, x + 22, 522] });
    out.push({ t: 'rect', c: cols[i], w: 3, f: 1, r: 24, sh: true, s: `${i + 1}단계\n날짜 · 한 일`, z: 24, p: up ? [x - 135, 290, x + 135, 410] : [x - 135, 590, x + 135, 710] });
  });
  return out;
}
/* 코넬 노트: 제목 / 핵심 질문 칸 / 필기 칸 / 요약 */
function cornell() {
  return [
    { t: 'rect', c: C.blue, w: 3, f: 2, r: 18, sh: true, s: '과목 · 단원 · 날짜', z: 32, p: [80, 50, 1520, 140] },
    { t: 'rect', c: C.purple, w: 3, f: 1, r: 18, p: [80, 170, 500, 770] },
    { t: 'text', c: C.purple, z: 28, s: '핵심 질문 · 키워드', p: [110, 195] },
    note('· 왜 그럴까?', 110, 260, 24), note('· 꼭 외울 것', 110, 310, 24),
    { t: 'rect', c: '#adb5bd', w: 3, f: 0, r: 18, p: [530, 170, 1520, 770] },
    { t: 'text', c: SUB, z: 28, s: '필기', p: [560, 195] },
    { t: 'rect', c: C.green, w: 3, f: 1, r: 18, p: [80, 800, 1520, 950] },
    { t: 'text', c: '#0f8a65', z: 28, s: '요약 (세 줄로)', p: [110, 820] },
  ];
}
/* KWL 표: 알고 있는 것 / 알고 싶은 것 / 배운 것 */
function kwl() {
  const out = [title('KWL로 공부 정리', 80, 40)];
  [['K · 알고 있는 것', C.blue], ['W · 알고 싶은 것', C.orange], ['L · 배운 것', C.green]].forEach(([s, c], i) => {
    const x = 80 + i * 490;
    out.push({ t: 'rect', c, w: 3, f: 2, r: 18, sh: true, s, z: 30, p: [x, 130, x + 450, 220] });
    out.push({ t: 'rect', c, w: 3, f: 1, r: 18, p: [x, 245, x + 450, 950] });
    out.push(note('· ', x + 30, 280, 26), note('· ', x + 30, 340, 26), note('· ', x + 30, 400, 26));
  });
  return out;
}

export const TEMPLATES = [
  { key: 'mindmap2', name: '곡선 마인드맵', desc: '중심 주제에서 여섯 갈래 곡선으로 뻗어요', build: mindmapCurve },
  { key: 'mindmap', name: '기본 마인드맵', desc: '중심 주제에서 네 갈래로 정리해요', build: mindmapBasic },
  { key: 'flow', name: '순서도', desc: '시작 → 단계 → 판단(예/아니오) → 끝', build: flow },
  { key: 'compare', name: '비교 표', desc: '두 개념을 정의·특징·장점·단점으로 비교', build: compare },
  { key: 'venn', name: '벤 다이어그램', desc: '두 개념의 다른 점과 같은 점', build: venn },
  { key: 'timeline', name: '타임라인', desc: '역사·과정·공부 일정을 순서대로', build: timeline },
  { key: 'cornell', name: '코넬 노트', desc: '핵심 질문 · 필기 · 요약으로 나눈 필기법', build: cornell },
  { key: 'kwl', name: 'KWL 표', desc: '알고 있는 것 · 알고 싶은 것 · 배운 것', build: kwl },
];
