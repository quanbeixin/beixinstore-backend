const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { generateToken } = require('../utils/jwt');

// 用户注册
const register = async (req, res) => {
  const { username, password, confirmPassword, email } = req.body;

  // 验证必填字段
  if (!username || !password || !confirmPassword) {
    return res.status(400).json({
      success: false,
      message: '用户名、密码和确认密码不能为空'
    });
  }

  // 验证用户名长度
  if (username.length < 3 || username.length > 20) {
    return res.status(400).json({
      success: false,
      message: '用户名长度必须在 3-20 个字符之间'
    });
  }

  // 验证用户名格式（只允许字母、数字、下划线）
  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    return res.status(400).json({
      success: false,
      message: '用户名只能包含字母、数字和下划线'
    });
  }

  // 验证密码长度
  if (password.length < 6) {
    return res.status(400).json({
      success: false,
      message: '密码长度至少 6 个字符'
    });
  }

  // 验证两次密码是否一致
  if (password !== confirmPassword) {
    return res.status(400).json({
      success: false,
      message: '两次输入的密码不一致'
    });
  }

  // 验证邮箱格式（如果提供）
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({
      success: false,
      message: '邮箱格式不正确'
    });
  }

  try {
    // 检查用户名是否已存在
    const existing = await User.findByUsername(username);
    if (existing) {
      return res.status(409).json({
        success: false,
        message: '用户名已存在'
      });
    }

    // 加密密码
    const hashedPassword = await bcrypt.hash(password, 10);

    // 创建用户
    const userId = await User.create({
      username,
      password: hashedPassword,
      email: email || null
    });

    res.status(201).json({
      success: true,
      message: '注册成功，请登录',
      data: { id: userId, username, email: email || null }
    });
  } catch (err) {
    console.error('注册失败:', err);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
};

// 用户登录
const login = async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({
      success: false,
      message: '用户名和密码不能为空'
    });
  }

  try {
    // 查找用户
    const user = await User.findByUsername(username);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: '用户名或密码错误'
      });
    }

    // 验证密码
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: '用户名或密码错误'
      });
    }

    // 生成 Token
    const token = generateToken({
      id: user.id,
      username: user.username,
      role: user.role
    });

    res.json({
      success: true,
      message: '登录成功',
      data: {
        token,
        user: {
          id: user.id,
          username: user.username,
          role: user.role
        }
      }
    });
  } catch (err) {
    console.error('登录失败:', err);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
};

// 获取当前用户信息（需要 Token）
const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: '用户不存在' });
    }
    res.json({ success: true, data: user });
  } catch (err) {
    console.error('获取用户信息失败:', err);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
};

module.exports = { register, login, getProfile };
