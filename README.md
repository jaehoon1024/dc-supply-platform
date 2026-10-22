# DC공급현황

대한민국 데이터센터 공급현황 관리 플랫폼입니다. 데이터는 이 저장소의 `data/*.json`에 있고 GitHub에서 버전을 관리합니다. 화면은 Vercel에 배포합니다.

## 무엇을 하나

- 센터별 구분(자체/상용), 단계(운영/개발), 상태(설계중·착공·개발중·준공·운영중)
- 발주처·시공사·운영사, 수전용량과 IT Load(MW), 착공월·준공월·RFS
- 필드마다 **확정/추정** 표시. 센터마다 **근거 목록**과 **변경 히스토리**
- 주소 정합성 검사, 지도(Leaflet + OpenStreetMap), 구글 지도 링크
- **핵심 사업자**(LG유플러스·KT·SK·LG CNS) 필터·카드·사업자 목표 대비 추정치
- **2031년까지 연도별 공급 추정**(상태별 실현확률 가중 / 계획 그대로)
- 상세 화면에서 수동 수정 → Vercel 함수가 GitHub에 커밋. 수정한 필드는 고정되어 자동수집이 덮어쓰지 않음
- 국토교통부 건축HUB 인허가: 인허가 탭 실시간 조회(+신규 후보 발굴), 매일 08:00 동기화(Vercel Cron), CSV 내보내기

## 구조

```
index.html, app.js, styles.css   화면 (빌드 없음)
lib/model.js                      공용 규칙: 상태·확정/추정·주소검사·사업자·공급추정·수정 반영
lib/store.js                      GitHub 읽기/원자적 커밋
api/data.js                       GET  최신 데이터 (main 브랜치 최신 커밋)
api/save.js                       POST 수정·근거 추가 → GitHub 커밋
scripts/permits.mjs               건축HUB 인허가 조회·매칭·동기화
api/permits.js                    건축HUB 실시간 조회 API / Cron 동기화(?sync=1)
scripts/validate.mjs              데이터 검증 (모든 push에서 실행)
data/                             dcs, evidence, history, sources, runs, permits, grid, targets
.github/workflows/                ci.yml(검증) — 인허가 동기화는 Vercel Cron 담당
```

## 배포 (처음 한 번)

1. **Vercel 연결**: vercel.com → Add New → Project → 이 GitHub 저장소 Import → Framework Preset "Other" 그대로 Deploy.
2. **GitHub 토큰 만들기**: GitHub → Settings → Developer settings → Fine-grained tokens → 이 저장소만 선택, Repository permissions에서 **Contents: Read and write** 허용.
3. **Vercel 환경변수** (Project → Settings → Environment Variables), 입력 후 Redeploy:

| 이름 | 값 |
|---|---|
| `GITHUB_TOKEN` | 2번에서 만든 토큰 |
| `GITHUB_REPO` | `계정명/dc-supply-platform` |
| `GITHUB_BRANCH` | `main` (생략 가능) |
| `EDIT_PASSWORD` | 팀 편집 비밀번호 |

4. **건축HUB 키(data.go.kr)**: "국토교통부_건축HUB_건축인허가정보 서비스" 활용 신청 → 일반 인증키(Decoding)를 **Vercel** Environment Variables에 `BUILDING_HUB_KEY`(Sensitive)로 등록 후 Redeploy. 인허가 탭에서 바로 실시간 조회되고, 매일 08:00 Vercel Cron이 결과를 GitHub에 커밋합니다(GITHUB_TOKEN 필요). 키는 저장소에 넣지 않습니다.
   - 센터 주소(지번)에서 시군구·법정동 코드를 자동 변환해 `permit_ref`에 넣어 두었습니다. 지번 단위는 정확 매칭, 법정동 단위는 이름 일치 또는 동 내 유일한 데이터센터성 인허가일 때만 연결합니다.
5. (선택) 외부 공개를 막으려면 Vercel → Settings → Deployment Protection을 켜세요.

환경변수가 없으면 배포본에 포함된 데이터로 **보기 전용**으로 동작합니다.

## 입장 비밀번호

`middleware.js`가 모든 요청 앞에서 비밀번호를 확인합니다. 비밀번호는 Vercel 환경변수 `SITE_PASSWORD`(Sensitive)에만 두며, 바꾸려면 값을 수정하고 Redeploy하면 기존 로그인은 모두 해제됩니다. 로그아웃: `/__logout`. Vercel Cron 동기화는 통과합니다.

## 일일 수집

| 시각(KST) | 무엇 | 방식 |
|---|---|---|
| 08:00 | 건축HUB 착공·사용승인일 → 상태·착공월·준공월(A등급) | Vercel Cron (`/api/permits?sync=1`) |
| 06:47 | 30개 소스 뉴스·공시·발표 + 빈 칸 보강 5곳(`scripts/gaps.mjs`) | Claude 예약 작업 → `scripts/ingest.mjs`로 반영 후 저장소에 커밋 |
| 월 07:13 | 플레이어(회사 75곳·핵심 4사 목표) 주간 동향·프로필 | Claude 예약 작업 → `scripts/ingest.mjs`(companies·targets) |

자동수집은 `lib/model.js`의 `applyAuto`를 따릅니다. 고정된 필드는 바꾸지 않고 히스토리에 `proposal`(제안)로 남깁니다.

## DBO 구분

센터별 `dbo` = { type, provider, scope, c, note }
- **DBO**: 발주처가 아닌 사업자가 설계(D)·구축(B)·운영(O)을 일괄 수행 / **부분 DBO**: 일부만 수행(운영(O)만 = 위탁운영) / **마스터리스**: 운영사가 건물 전체를 장기 임차해 직접 운영·재임대 / **자체**: 발주처·계열사가 직접 / **미상**
- 목록의 'DBO' 필터·배지, 상세 화면 DBO 섹션, 회사 탭 'DBO 수행' 열에서 확인합니다. 상세 화면에서 고친 값은 고정되어 자동수집이 덮어쓰지 않습니다.
- 초기 분류(2026-10-21): 비고에 DBO가 명시된 4곳 확정, 나머지는 운영사·발주처 관계로 추정.

## 캠퍼스·단계

여러 동·단계로 나눠 짓는 사이트는 센터 레코드 = 현재 확정된 단계, `campus` = 사이트 전체 계획 { name, phase, plan_mw, basis(수전/IT/미상), plan_year, c, note }.
- 계획 용량에서 같은 캠퍼스명으로 등록된 단계의 용량 합계를 뺀 값이 '미배정'이며 공급 추정에는 넣지 않습니다(공급 추정 탭 하단 표).
- 다음 단계가 구체화되면(착공·인허가) 같은 campus.name으로 새 센터를 추가합니다.

## 판정 규칙

- **확정**: A등급(공공·인허가·공시·사업자 공식 발표) 근거 1건 이상, 또는 독립된 B등급 2건 이상이 같은 값을 보고
- **추정**: 단일 보도, 목표·계획치, 단위 불명확, 역산
- **공급 시점**: RFS → 준공월 → 상태별 리드타임(준공 3·개발중 12·착공 24·설계중 36개월)
- **가중 추정**: 운영중·준공 100%, 개발중 90%, 착공 80%, 설계중 50%
- **환산**: 한쪽 용량만 있으면 수전 ≈ IT × 1.4. 둘 다 없고 연면적이 있으면 수전 ≈ 연면적 × 1.0 kW/㎡ (건축HUB 9곳 보정, 범위 0.7~1.4). 환산값은 목록에 흐린 글씨 + '환산'으로 표시되고 입력값이 아닙니다.

## 빈 칸 보강

- 매일 자동수집 때 `node scripts/gaps.mjs 5`가 고른 5곳(수전·주소 지번이 빈 센터, 조사 안 한 곳 먼저)을 운영사 소개 페이지·공시·환경영향평가서·위원회 회의록·지도로 집중 조사합니다.
- 값을 못 찾아도 findings의 `gap_checked`에 넣으면 조사일(`gap_checked_at`)이 남아 다음 순번으로 넘어갑니다.
- 건축HUB 동기화는 연면적(`area_m2`)을 반영하고, 주소에 지번이 없으면 대장의 대지위치로 보완합니다(확정).

## 로컬 확인

```
npm test           # 규칙·API·동기화 테스트
npm run validate   # 데이터 검증
npx vercel dev     # 로컬 실행 (선택)
```

정리 과정에서 지연이나 오기가 있을 수 있습니다. 투자·계약 판단 전에는 세움터 건축물대장과 각 기관 원문을 확인하세요.
