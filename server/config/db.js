const mongoose = require('mongoose');
const config = require('./index');

// 仅在 Windows 上覆写 DNS（解决 c-ares 无法解析 SRV 记录的问题）
if (process.platform === 'win32') {
  const dns = require('dns');
  dns.setServers(['8.8.8.8', '1.1.1.1', '223.5.5.5']);
}

const connectDB = async (retries = 3) => {
  for (let i = 0; i < retries; i++) {
    try {
      const conn = await mongoose.connect(config.mongodbUri, {
        serverSelectionTimeoutMS: 5000,
      });
      console.log(`MongoDB connected: ${conn.connection.host}`);
      return;
    } catch (error) {
      console.error(`MongoDB connection error (attempt ${i + 1}/${retries}): ${error.message}`);
      if (i < retries - 1) {
        console.log('Retrying in 3 seconds...');
        await new Promise(r => setTimeout(r, 3000));
      }
    }
  }
  console.error('All MongoDB connection attempts failed. Exiting.');
  process.exit(1);
};

module.exports = connectDB;
