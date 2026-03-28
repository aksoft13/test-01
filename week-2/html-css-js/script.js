// ── 1. 다크모드 토글 ──
const darkBtn = document.getElementById('dark-toggle');
darkBtn.addEventListener('click', () => {
    document.body.classList.toggle('dark');
    darkBtn.textContent = document.body.classList.contains('dark') ? '☀️ 라이트모드' : '🌙 다크모드';
});

// ── 2. 타이핑 애니메이션 ──
const titleEl = document.getElementById('typing-title');
const titleText = 'HTML 태그 예시';
let i = 0;
function typeWriter() {
    if (i < titleText.length) {
        titleEl.textContent += titleText[i++];
        setTimeout(typeWriter, 120);
    }
}
typeWriter();

// ── 3. 스크롤 페이드인 (Intersection Observer) ──
const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            observer.unobserve(entry.target);
        }
    });
}, { threshold: 0.15 });

document.querySelectorAll('.reveal').forEach(el => observer.observe(el));

// 페이지 로드 시 이미 보이는 요소 즉시 표시
document.querySelectorAll('.reveal').forEach(el => {
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight) el.classList.add('visible');
});

// ── 4. 숫자 카운터 ──
let count = 0;
const counterVal = document.getElementById('counter-value');
function popAnim() {
    counterVal.classList.add('pop');
    setTimeout(() => counterVal.classList.remove('pop'), 150);
}
document.getElementById('btn-plus').addEventListener('click', () => {
    count++;
    counterVal.textContent = count;
    popAnim();
});
document.getElementById('btn-minus').addEventListener('click', () => {
    count--;
    counterVal.textContent = count;
    popAnim();
});

// ── 5. 색상 팔레트 ──
const colorBox = document.getElementById('color-box');
document.querySelectorAll('.color-dot').forEach(dot => {
    dot.addEventListener('click', () => {
        document.querySelectorAll('.color-dot').forEach(d => d.classList.remove('active'));
        dot.classList.add('active');
        colorBox.style.backgroundColor = dot.dataset.color;
        colorBox.textContent = dot.dataset.name;
    });
});
document.querySelector('.color-dot').classList.add('active');

// ── 6. 리스트 항목 추가 ──
function addListItem() {
    const input = document.getElementById('list-input');
    const text = input.value.trim();
    if (!text) return;
    const li = document.createElement('li');
    li.className = 'new-item';
    li.innerHTML = `${text} <span style="cursor:pointer;color:#e74c3c;margin-left:8px" onclick="this.parentElement.remove()">✕</span>`;
    document.getElementById('dynamic-list').appendChild(li);
    input.value = '';
    input.focus();
}
document.getElementById('list-add-btn').addEventListener('click', addListItem);
document.getElementById('list-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') addListItem();
});

// ── 7. 프로그레스바 애니메이션 ──
const bar = document.getElementById('animated-progress');
const label = document.getElementById('progress-label');
let progInterval = null;
let progValue = 0;

document.getElementById('progress-btn').addEventListener('click', () => {
    if (progInterval) return;
    progInterval = setInterval(() => {
        progValue = Math.min(progValue + 1, 100);
        bar.style.width = progValue + '%';
        label.textContent = progValue + '%';
        if (progValue >= 100) clearInterval(progInterval);
    }, 20);
});
document.getElementById('progress-reset').addEventListener('click', () => {
    clearInterval(progInterval);
    progInterval = null;
    progValue = 0;
    bar.style.width = '0%';
    label.textContent = '0%';
});

// ── 8. 테이블 행 추가/삭제 ──
const tableBody = document.getElementById('table-body');
const names = ['이영희', '박민수', '최지우', '정하늘', '강도현'];
const jobs  = ['기획자', '마케터', '개발자', 'PO', '디자이너'];
let rowIdx = 0;

tableBody.addEventListener('click', e => {
    const row = e.target.closest('tr');
    if (!row) return;
    document.querySelectorAll('#table-body tr').forEach(r => r.classList.remove('selected'));
    row.classList.add('selected');
});

document.getElementById('btn-add-row').addEventListener('click', () => {
    const tr = document.createElement('tr');
    const name = names[rowIdx % names.length];
    const age  = 20 + (rowIdx % 15);
    const job  = jobs[rowIdx % jobs.length];
    tr.innerHTML = `<td>${name}</td><td>${age}</td><td>${job}</td>`;
    tr.style.animation = 'slideIn 0.3s ease';
    tableBody.appendChild(tr);
    rowIdx++;
});

document.getElementById('btn-del-row').addEventListener('click', () => {
    const selected = tableBody.querySelector('tr.selected');
    if (selected) selected.remove();
    else alert('삭제할 행을 먼저 클릭해서 선택하세요.');
});

// ── 9. 폼 제출 (토스트 알림) ──
document.querySelector('form').addEventListener('submit', e => {
    e.preventDefault();
    const toast = document.getElementById('toast');
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2500);
});

// ── 10. 글자 수 카운터 ──
const textarea = document.getElementById('counted-textarea');
const charCount = document.getElementById('char-count');
textarea.addEventListener('input', () => {
    const len = textarea.value.length;
    charCount.textContent = `${len} / 100`;
    charCount.classList.toggle('warn', len >= 80);
});
