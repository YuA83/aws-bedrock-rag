const { BedrockRuntimeClient, InvokeModelCommand } = require("@aws-sdk/client-bedrock-runtime");
const { NodeHttpHandler } = require("@smithy/node-http-handler");

const EMBEDDING_MODEL_ID = "amazon.titan-embed-text-v2:0";
const CHAT_MODEL_ID = "us.anthropic.claude-sonnet-4-6";

// bedrock config
const bedrockClient = new BedrockRuntimeClient({
    region: "us-east-1",
    requestHandler: new NodeHttpHandler({
        connectionTimeout: 5000,      // 5s
        socketTimeout: 60000         // 60s
    }),
    maxAttempts: 3                   // retry
});

// 질문 임베딩 생성
const getEmbedding = async (text) => {

    const command = new InvokeModelCommand({
        modelId: EMBEDDING_MODEL_ID,
        contentType: "application/json",
        accept: "application/json",
        body: JSON.stringify({
            inputText: text.slice(0, 10000),
            dimensions: 1024,
            normalize: true
        })
    });
    const response = await bedrockClient.send(command);
    const result = JSON.parse(new TextDecoder().decode(response.body));

    return result.embedding;
}

// Bedrock Claude로 답변 생성
const generateAnswer = async (userQuestion, similarFAQs) => {

    const context = similarFAQs
        .map((docs, i) =>
            `[Docs ${i + 1}] ${docs.title}
          ${docs.source ? `${docs.source}` : ''}
          Content: ${docs.content}`
        )
        .join("\n\n");

    const prompt = `다음 데이터를 참고하여 사용자 질문에 답변해주세요.

    참고 데이터:
    ${context}
    
    사용자 질문: ${userQuestion}
    
    위 데이터를 바탕으로 친절하고 정확하게 답변해주세요. 데이터에 없는 내용은 모른다고 답변하세요.
    
    **반드시 HTML 형식으로만 답변하세요. 마크다운 문법(##, **, --- 등)은 절대 사용하지 마세요.**
    <h2>, <p>, <ul>, <li>, <strong> 등 HTML 태그를 사용하여 답변을 작성하세요.
    HTML body 내용만 반환하고, \`\`\` 코드블록이나 <!DOCTYPE> 같은 래퍼는 포함하지 마세요.`;

    const command = new InvokeModelCommand({
        modelId: CHAT_MODEL_ID,
        contentType: "application/json",
        accept: "application/json",
        body: JSON.stringify({
            anthropic_version: "bedrock-2023-05-31",
            max_tokens: 1024,
            messages: [ { role: "user", content: prompt } ]
        })
    });

    const response = await bedrockClient.send(command);
    const result = JSON.parse(new TextDecoder().decode(response.body));

    return result.content[0].text;
}

module.exports = {getEmbedding, generateAnswer};