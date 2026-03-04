const { Pool } = require("pg");

// db config
const DB_CONFIG = {
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || "5432"),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,
    options: `-c search_path=${process.env.DB_SCHEMA},public`,
};

const db = new Pool({ ...DB_CONFIG, max: 15 });

module.exports = db;