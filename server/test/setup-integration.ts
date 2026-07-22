if (!process.env.TEST_DATABASE_URL) {
  throw new Error('缺少 TEST_DATABASE_URL');
}
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
