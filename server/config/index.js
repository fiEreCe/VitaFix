require('dotenv').config();

module.exports = {
  port: process.env.PORT || 3000,
  // Railway MongoDB 插件注入 MONGO_URL，手动配置用 MONGODB_URI
  mongodbUri: process.env.MONGODB_URI || process.env.MONGO_URL || 'mongodb://localhost:27017/jingzhu',
  deepseek: {
    apiKey: process.env.DEEPSEEK_API_KEY || '',
    apiUrl: process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/v1',
    model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
  },
  uploadDir: process.env.UPLOAD_DIR || 'uploads',
};
