const sourceTable = [
    "none",                // kb-000 (전체, source_table 조건 없음)
    "faq",                 // kb-001
    "notice",              // kb-002
    "contact",             // kb-003
    "users",               // kb-004
    "program",             // kb-005
    "storage"              // 5: kb-006
];

const VECTOR_TABLE = "bedrock_integration.unified_vector_store";

module.exports = {sourceTable, VECTOR_TABLE};