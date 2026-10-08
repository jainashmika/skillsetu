const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { require: true }
});

const schema = `
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  role TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS jobs (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  sector TEXT,
  contract_type TEXT NOT NULL,
  work_format TEXT NOT NULL,
  city TEXT,
  status TEXT NOT NULL
);
`;

const CITIES = ['Bengaluru', 'Bhubaneswar', 'Dehradun'];
const SECTORS = ['Healthcare', 'Banking & Finance', 'Retail'];
const FORMATS = ['onsite', 'remote', 'hybrid'];
const TYPES = ['full_time', 'internship', 'contract'];

async function seed() {
  try {
    console.log('Initializing tables...');
    await pool.query(schema);

    console.log('Seeding permutations...');
    const promises = [];
    let jobId = 1;

    for (const city of CITIES) {
      for (const sector of SECTORS) {
        for (const work_format of FORMATS) {
          for (const contract_type of TYPES) {
            for (let i = 0; i < 2; i++) {
              const query = `
                INSERT INTO jobs (title, description, sector, contract_type, work_format, city, status)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
              `;
              const params = [`${contract_type} Engineer in ${city}`, 'Generated description.', sector, contract_type, work_format, city, 'active'];
              promises.push(pool.query(query, params));
              jobId++;
            }
          }
        }
      }
    }

    await Promise.all(promises);
    console.log(`Inserted ${promises.length} jobs successfully.`);
  } catch (err) {
    console.error('Seeding error:', err);
  } finally {
    pool.end();
  }
}

seed();
