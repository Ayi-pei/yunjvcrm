import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { supabase } from '../config/supabase.js';
import { generateNaoiodKey, validateNaoiodFormat } from '../utils/keyGenerator.js';

const router = express.Router();

// 登录接口
router.post('/login', async (req, res) => {
  try {
    const { accessKey } = req.body;

    if (!accessKey) {
      return res.status(400).json({
        error: 'MISSING_ACCESS_KEY',
        message: '请输入访问密钥'
      });
    }

    // 检查是否为管理员密钥
    if (accessKey === process.env.ADMIN_KEY || accessKey === 'adminayi888') {
      // 管理员登录
      const { data: adminUser, error } = await supabase
        .from('users')
        .select(`
          *,
          role:roles(*)
        `)
        .eq('access_key', accessKey)
        .single();

      if (error || !adminUser) {
        return res.status(401).json({
          error: 'INVALID_ADMIN_KEY',
          message: '管理员密钥无效'
        });
      }

      const token = jwt.sign(
        { 
          userId: adminUser.id, 
          role: adminUser.role.name,
          type: 'admin'
        },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN }
      );

      // 更新最后活跃时间
      await supabase
        .from('users')
        .update({ 
          last_active_at: new Date().toISOString(),
          is_online: true 
        })
        .eq('id', adminUser.id);

      return res.json({
        success: true,
        user: {
          id: adminUser.id,
          name: adminUser.name,
          email: adminUser.email,
          role: adminUser.role,
          type: 'admin'
        },
        token
      });
    }

    // 验证naoiod格式
    if (!validateNaoiodFormat(accessKey)) {
      return res.status(400).json({
        error: 'INVALID_KEY_FORMAT',
        message: '密钥格式不正确，请输入有效的naoiod格式密钥'
      });
    }

    // 查找坐席密钥
    const { data: keyData, error: keyError } = await supabase
      .from('access_keys')
      .select(`
        *,
        user:users(
          *,
          role:roles(*)
        )
      `)
      .eq('key_value', accessKey)
      .single();

    if (keyError || !keyData) {
      return res.status(401).json({
        error: 'INVALID_KEY',
        message: '密钥不存在或已失效'
      });
    }

    // 检查密钥状态
    if (keyData.status !== 'active') {
      return res.status(401).json({
        error: 'KEY_INACTIVE',
        message: '密钥已被暂停或禁用'
      });
    }

    // 检查密钥是否过期
    if (new Date(keyData.expires_at) < new Date()) {
      // 更新密钥状态为过期
      await supabase
        .from('access_keys')
        .update({ status: 'expired' })
        .eq('id', keyData.id);

      return res.status(401).json({
        error: 'KEY_EXPIRED',
        message: '密钥已过期，请联系管理员获取新密钥'
      });
    }

    // 检查使用次数限制
    if (keyData.max_usage && keyData.usage_count >= keyData.max_usage) {
      return res.status(401).json({
        error: 'KEY_USAGE_EXCEEDED',
        message: '密钥使用次数已达上限'
      });
    }

    const token = jwt.sign(
      { 
        userId: keyData.user.id, 
        role: keyData.user.role.name,
        keyId: keyData.id,
        type: 'agent'
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    // 更新密钥使用记录
    await supabase
      .from('access_keys')
      .update({ 
        usage_count: keyData.usage_count + 1,
        last_used_at: new Date().toISOString()
      })
      .eq('id', keyData.id);

    // 更新用户在线状态
    await supabase
      .from('users')
      .update({ 
        last_active_at: new Date().toISOString(),
        is_online: true 
      })
      .eq('id', keyData.user.id);

    // 记录使用日志
    await supabase
      .from('key_usage_logs')
      .insert({
        key_id: keyData.id,
        user_id: keyData.user.id,
        action: 'login',
        ip_address: req.ip,
        user_agent: req.get('User-Agent')
      });

    res.json({
      success: true,
      user: {
        id: keyData.user.id,
        name: keyData.user.name,
        email: keyData.user.email,
        role: keyData.user.role,
        accessKey: keyData.key_value,
        keyExpiresAt: keyData.expires_at,
        type: 'agent'
      },
      token
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: '登录失败，请稍后重试'
    });
  }
});

// 验证密钥接口
router.post('/validate-key', async (req, res) => {
  try {
    const { key } = req.body;

    if (!key) {
      return res.status(400).json({
        error: 'MISSING_KEY',
        message: '请提供密钥'
      });
    }

    // 验证格式
    if (!validateNaoiodFormat(key)) {
      return res.json({
        isValid: false,
        message: '密钥格式不正确'
      });
    }

    // 查询密钥
    const { data: keyData, error } = await supabase
      .from('access_keys')
      .select('*')
      .eq('key_value', key)
      .single();

    if (error || !keyData) {
      return res.json({
        isValid: false,
        message: '密钥不存在'
      });
    }

    // 检查状态和有效期
    const isExpired = new Date(keyData.expires_at) < new Date();
    const isActive = keyData.status === 'active';
    const hasUsageLeft = !keyData.max_usage || keyData.usage_count < keyData.max_usage;

    const isValid = isActive && !isExpired && hasUsageLeft;

    res.json({
      isValid,
      expiresAt: keyData.expires_at,
      status: keyData.status,
      usageCount: keyData.usage_count,
      maxUsage: keyData.max_usage,
      message: isValid ? '密钥有效' : '密钥无效或已过期'
    });

  } catch (error) {
    console.error('Key validation error:', error);
    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: '验证失败，请稍后重试'
    });
  }
});

// 登出接口
router.post('/logout', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      // 更新用户离线状态
      await supabase
        .from('users')
        .update({ is_online: false })
        .eq('id', decoded.userId);

      // 如果是坐席，记录登出日志
      if (decoded.keyId) {
        await supabase
          .from('key_usage_logs')
          .insert({
            key_id: decoded.keyId,
            user_id: decoded.userId,
            action: 'logout',
            ip_address: req.ip,
            user_agent: req.get('User-Agent')
          });
      }
    }

    res.json({
      success: true,
      message: '登出成功'
    });

  } catch (error) {
    console.error('Logout error:', error);
    res.json({
      success: true,
      message: '登出成功'
    });
  }
});

export default router;