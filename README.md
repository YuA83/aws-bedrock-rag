# AWS Bedrock RAG System

AWS Bedrock 기반 RAG(Retrieval-Augmented Generation) 시스템입니다.
강사·교육실적·교구재 등 구조화 데이터를 Text-to-SQL로, FAQ·공지 등 비정형 텍스트는 벡터 검색으로 처리하는 멀티모달 AI 챗봇입니다.

---

## 프로젝트 구조

```
aws-bedrock-rag/
├── aws-lambda-chat/      # 메인 챗봇 Lambda (Text-to-SQL + 벡터 검색)
├── aws-lambda-embedding/     # 임베딩 생성 Lambda (EventBridge 스케줄)
├── aws-lambda-ses/       # FAQ 검색 + SES 이메일 발송 Lambda
└── client/               # Express.js 샘플 앱 (Lambda 호출 프론트엔드)
```

---

## Lambda 함수

### aws-lambda-chat

주요 챗봇 Lambda. 질문 유형에 따라 두 가지 검색 전략을 선택합니다.

| 질문 유형 | 처리 방식 |
|-----------|-----------|
| `DATA_QUERY` | Text-to-SQL → PostgreSQL 직접 조회 |
| `VECTOR_SEARCH` | pgvector 코사인 유사도 검색 |
| `FOLLOW_UP` | 세션 캐시 재사용 / SQL 재생성 |
| `CHITCHAT` | 인사·잡담 응답 |
| `SENSITIVE` | 개인정보 요청 차단 |

**사용 모델**
- 임베딩: `cohere.embed-multilingual-v3`
- 채팅: `us.anthropic.claude-sonnet-4-6`

**지원 Knowledge Base**

| KB ID  | 데이터 영역  | 처리 방식 |
|--------|---------|----------|
| kb-000 | 전체 검색   | 질문 기반 자동 라우팅 |
| kb-001 | FAQ     | 벡터 검색 |
| kb-002 | 공지사항    | 벡터 검색 |
| kb-003 | 문의사항    | 벡터 검색 |
| kb-004 | 회원 정보   | Text-to-SQL |
| kb-005 | 등록 프로그램 | Text-to-SQL |
| kb-006 | 창고 정보   | Text-to-SQL |

**환경 변수**

```
SERVE_PORT
DB_HOST
DB_PORT
DB_SCHEMA
DB_NAME
DB_USER
DB_PASSWORD
DB_SSL
```

**요청 예시**

```json
{
  "kbId": "kb-005",
  "content": "현재 진행 중인 프로그램 목록 보여줘",
  "sessionId": "session-uuid",
  "history": []
}
```

---

### aws-lambda-embedding

EventBridge로 1분마다 실행되며 `unified_vector_store` 테이블의 미처리 레코드에 임베딩을 생성합니다.

- 임베딩 모델: `cohere.embed-multilingual-v3` (1024차원)
- 배치 크기: 기본 100건 (환경변수 `BATCH_SIZE`로 조정)
- 동시성: 테이블 5개 병렬, 행 3개 병렬

**환경 변수**

```
DB_HOST
DB_PORT
DB_SCHEMA
DB_NAME
DB_USER
DB_PASSWORD
DB_SSL
BATCH_SIZE  # 기본값: 100
```

---

### aws-lambda-ses

문의사항 데이터를 RAG로 검색하고 AI 답변을 AWS SES로 이메일 발송합니다.

- 임베딩 모델: `cohere.embed-multilingual-v3` (1024차원)
- 채팅 모델: `us.anthropic.claude-sonnet-4-6`
- SES 리전: `ap-northeast-2`
- SES 템플릿: `ContactAiAnswer`

**환경 변수**

```
DB_HOST
DB_PORT
DB_SCHEMA
DB_NAME
DB_USER
DB_PASSWORD
DB_SSL
```

**요청 예시**

```json
{
  "content": "회원가입이 잘 안 돼요.",
  "email": "user@example.com",
  "title": "문의 제목",
  "url": "https://example.com/contact/123" // 문의 상세 URL
}
```

---

### client

Lambda 함수를 호출하는 Express.js 데모 앱입니다.

```bash
cd client
npm install
npm run start:local   # 로컬 개발 (nodemon)
npm start             # 일반 실행
```

---

## 아키텍처

```
클라이언트
    │
    ▼
[client Express App]
    │  AWS SDK (Lambda Invoke)
    ▼
[aws-lambda-chat]
    ├─ classifyQuery() → queryType / sourceTable 결정
    │
    ├─ DATA_QUERY ──→ generateSQL() → validateSQL() → PostgreSQL
    │                     └─ 실패 시 재시도 (최대 2회)
    │
    ├─ FOLLOW_UP ──→ analyzeFollowUp()
    │                  ├─ USE_CACHE  → 세션 캐시 rows 재사용
    │                  ├─ REQUERY   → 이전 SQL 기반 재생성
    │                  └─ NEW_QUERY → 일반 흐름
    │
    └─ VECTOR_SEARCH → getEmbedding() → pgvector 검색

[aws-lambda-embedding]  ←── EventBridge (1분 주기)
    └─ unified_vector_store 테이블 임베딩 일괄 처리

[aws-lambda-ses]  ←── API Gateway / 직접 호출
    └─ FAQ 검색 → AI 답변 생성 → SES 이메일 발송
```

---

## 데이터베이스

PostgreSQL + pgvector 사용. 스키마: `bedrock_integration`

**주요 테이블**

| 테이블                              | 설명                 |
|----------------------------------|--------------------|
| `unified_vector_store`           | 벡터 임베딩 저장소         |
| `chat_session_cache`             | 대화 세션 캐시 (2시간 TTL) |
| `users` / `user_info`            | 사용자 정보 (암호화 컬럼 포함) |
| `program` / `program_user`       | 프로그램 및 신청 사용자      |
| `stuff_storage` / `stuff_rental` | 창고 물품 정보 및 대여 정보   |

> `users` 테이블의 `name`, `birth`, `phone`, `email` 컬럼은 암호화 저장됩니다.
> 조회 시 `decrypt_hex()` 함수를 반드시 사용해야 합니다.

---

## 보안

- SQL 인젝션 방지: `validateSQL()`로 DML/DDL 키워드 차단, 허용 테이블만 접근 가능
- 개인정보 보호: `SENSITIVE` 질문 유형 감지 및 차단
- 암호화 컬럼: 개인정보 컬럼 암호화 저장 및 복호화 함수 적용
