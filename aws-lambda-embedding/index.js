const db = require("./config/db");
const {getEmbedding} = require("./config/awsBedrock");
const {sourceTable, VECTOR_TABLE} = require("./config/tables");

const TABLE_CONCURRENCY = 5; // KB 테이블 청크 단위
const CONCURRENCY = 3;       // 동시 Bedrock 호출 수
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || "100"); // EventBridge 1분 주기 기준 100건


/**
 * Lambda 핸들러
 * - EventBridge로 1분마다 실행 (100건씩 처리)
 * - status='pending' AND embedding IS NULL 레코드 조회
 * - Cohere Multilingual v3로 임베딩 생성
 * - embedding 컬럼 업데이트, status='completed'
 */
exports.handler = async (event) => {

  try {
    const tableResults = {};

    for (let i = 0; i < sourceTable.length; i += TABLE_CONCURRENCY) {
      const tableChunk = sourceTable.slice(i, i + TABLE_CONCURRENCY);

      console.log("➡️ Start Table Chunk");
      await Promise.all(
          tableChunk.map(async (table) => {

            // embedding가 아직 없는 데이터 조회
            const {rows: pendingRows} = await db.query(
              `SELECT seq, source_table, content
               FROM ${VECTOR_TABLE}
               WHERE embedding IS NULL
                 AND source_table = $2
                 AND is_deleted = false
                 ORDER BY seq
                 LIMIT $1`,
                [BATCH_SIZE, table]
            );

            if (pendingRows.length === 0) {
              console.log(`⏭️ Source Table ${table} ==> 처리할 데이터 없음`);
              return;
            }

            console.log(`➡️ Source Table ${table} ==> ${pendingRows.length}건 처리 시작`);
            const results = {processed: 0, failed: 0, errors: []};

            for (let j = 0; j < pendingRows.length; j += CONCURRENCY) {
              const chunk = pendingRows.slice(j, j + CONCURRENCY);

              console.log("➡️ Start Row Chunk");
              await Promise.all(
                  chunk.map(async (row) => {
                    try {
                      const embedding = await getEmbedding(row.content);

                      await db.query(
                          `UPDATE ${VECTOR_TABLE}
                           SET embedding = $1::vector
                           WHERE seq = $2`,
                          [JSON.stringify(embedding), row.seq]
                      );

                      results.processed++;
                      console.log(`✅ Source Table ${table} ==> seq=${row.seq} 완료`);

                    } catch (err) {
                      results.failed++;
                      results.errors.push({seq: row.seq, error: err.message});
                      console.error(`❌ Source Table ${table} ==> seq=${row.seq} 실패:`, err.message);
                    }
                  })
              );
              console.log("➡️ End Row Chunk");
            }

            tableResults[table] = results;
            console.log(`➡️ End Table Chunk - ${table}:`, results);
          })
      );
    }

    // 전체 집계
    const total = Object.values(tableResults).reduce(
        (acc, r) => {
          acc.processed += r.processed;
          acc.failed += r.failed;
          return acc;
        },
        {processed: 0, failed: 0}
    );

    console.log("🏁 전체 처리 완료:", total);

    return {
      statusCode: 200,
      body: JSON.stringify({total, detail: tableResults}),
    };

  } finally {
    await db.end();
  }
};