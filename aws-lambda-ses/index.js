const db = require("./config/db");
const {getEmbedding, generateAnswer} = require("./config/awsBedrock");
const {sesClient, createReminderEmailCommand} = require("./config/awsSes");

const VECTOR_TABLE = "bedrock_integration.unified_vector_store";
const SOURCE_TABLES = "faq";


// 유사 검색 (pgvector cosine similarity)
const searchSimilarFAQ = async (db, embedding, topK = 3) => {

  const { rows } = await db.query(
      `SELECT t.source_table,
              t.content,
              1 - (t.embedding <=> $1::vector) AS similarity
       FROM ${VECTOR_TABLE} t
       WHERE t.status = 'completed'
         AND t.is_deleted = false
         AND t.source_table = '${SOURCE_TABLES}'
       ORDER BY t.embedding <=> $1::vector
           LIMIT $2`,
      [ JSON.stringify(embedding), topK ]
  );

  return rows;
}

exports.handler = async (event) => {

  const body = event.body
      ? (typeof event.body === "string" ? JSON.parse(event.body) : event.body)
      : event;
  const userQuestion = body?.content;
  const { email, title, content, url } = body;

  if (!userQuestion) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "content 필드가 필요합니다." })
    };
  }

  try {

    // 1. 질문 임베딩
    const questionEmbedding = await getEmbedding(userQuestion);

    // 2. 유사 FAQ 검색
    const similarFAQs = await searchSimilarFAQ(db, questionEmbedding);

    if (similarFAQs.length === 0) {

      const answer = "관련 데이터를 찾을 수 없습니다.";
      // 메일 발송
      await sesClient.send(createReminderEmailCommand(email, title, content, answer, url));

      return {
        statusCode: 200,
        body: JSON.stringify({ answer })
      };
    }

    // 3. 답변 생성
    const answer = await generateAnswer(userQuestion, similarFAQs);
    // 메일 발송
    await sesClient.send(createReminderEmailCommand(email, title, content, answer, url));

    return {
      statusCode: 200,
      body: JSON.stringify({
        answer,
      })
    };

  } catch (e) {
    return {
      statusCode: 500,
      body: {
        error: e,
        message: e.message
      }
    };

  } finally {
    await db.end();
  }
};