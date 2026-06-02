const mongoose = require('mongoose');
const dns = require('dns');
const config = require('./index');

// 解决 Windows 上 Node.js DNS 解析器(c-ares)无法解析 SRV 记录的问题
// 使用系统 DNS 或公网 DNS(8.8.8.8) 替代
dns.setServers(['8.8.8.8', '1.1.1.1', '223.5.5.5']);

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(config.mongodbUri);
    console.log(`MongoDB connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`MongoDB connection error: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;
