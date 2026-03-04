const { BedrockRuntimeClient, InvokeModelCommand } = require("@aws-sdk/client-bedrock-runtime");
const { NodeHttpHandler } = require("@smithy/node-http-handler");

const EMBEDDING_MODEL_ID = "cohere.embed-multilingual-v3";

// bedrock config
const bedrockClient = new BedrockRuntimeClient({
    region: "us-east-1",
    requestHandler: new NodeHttpHandler({
        connectionTimeout: 5000,   // 5s
        socketTimeout: 60000,      // 60s
    }),
    maxAttempts: 3,              // retry 3
});

/**
 * 텍스트 → Bedrock Cohere Multilingual v3 임베딩 변환
 *
 * input_type:
 *  - "search_document" : DB에 저장할 문서 임베딩 시 사용 (현재)
 *  - "search_query"    : 검색 쿼리 임베딩 시 사용
 *
 * Cohere v3는 texts 배열로 최대 96개 배치 처리 가능
 * Bedrock InvokeModel은 단건 호출이므로 1개씩 처리
 */
const getEmbedding = async (text) => {

    const command = new InvokeModelCommand({
        modelId: EMBEDDING_MODEL_ID,
        contentType: "application/json",
        accept: "application/json",
        body: JSON.stringify({
            texts: [ text.slice(0, 2048) ], // Cohere v3 최대 토큰 512 (약 2048자 권장)
            input_type: "search_document",
            truncate: "END",              // 초과 시 끝부분 자름
        }),
    });

    const response = await bedrockClient.send(command);
    const result = JSON.parse(new TextDecoder().decode(response.body));

    // Cohere 응답: { embeddings: [[...]], ... }
    return result.embeddings[0];
};

module.exports = {getEmbedding};