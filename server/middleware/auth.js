import jwt from 'jsonwebtoken';
import { supabase } from '../config/supabase.js';

export const authMiddleware = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({
        error: 'MISSING_TOKEN',
        message: '访问令牌缺失'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // 验证用户是否存在且在线
    const { data: user, error } = await supabase
      .from('users')
      .select(`
        *,
        role:roles(*)
      `)
      .eq('id', decoded.userId)
      .single();

    if (error || !user) {
      return res.status(401).json({
        error: 'INVALID_USER',
        message: '用户不存在或已被禁用'
      });
    }

    // 如果是坐席，验证密钥状态
    if (decoded.type === 'agent' && decoded.keyId) {
      const { data: keyData, error: keyError } = await supabase
        .from('access_keys')
        .select('*')
        .eq('id', decoded.keyId)
        .single();

      if (keyError || !keyData || keyData.status !== 'active') {
        return res.status(401).json({
          error: 'INVALID_KEY',
          message: '密钥已失效，请重新登录'
        });
      }

      // 检查密钥是否过期
      if (new Date(keyData.expires_at) < new Date()) {
        await supabase
          .from('access_keys')
          .update({ status: 'expired' })
          .eq('id', keyData.id);

        return res.status(401).json({
          error: 'KEY_EXPIRED',
          message: '密钥已过期，请重新登录'
        });
      }
    }

    // 将用户信息添加到请求对象
    req.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      type: decoded.type,
      keyId: decoded.keyId
    };

    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        error: 'INVALID_TOKEN',
        message: '访问令牌无效'
      });
    }

    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'TOKEN_EXPIRED',
        message: '访问令牌已过期'
      });
    }

    console.error('Auth middleware error:', error);
    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: '认证失败'
    });
  }
};

// 权限检查中间件
export const requirePermission = (permission) => {
  return async (req, res, next) => {
    try {
      const user = req.user;
      
      if (!user) {
        return res.status(401).json({
          error: 'UNAUTHORIZED',
          message: '未授权访问'
        });
      }

      // 超级管理员拥有所有权限
      if (user.role.name === 'super_admin') {
        return next();
      }

      // 检查角色权限
      const { data: rolePermissions, error } = await supabase
        .from('role_permissions')
        .select(`
          permission:permissions(name)
        `)
        .eq('role_id', user.role.id);

      if (error) {
        throw error;
      }

      const hasPermission = rolePermissions.some(
        rp => rp.permission.name === permission
      );

      if (!hasPermission) {
        return res.status(403).json({
          error: 'INSUFFICIENT_PERMISSIONS',
          message: '权限不足'
        });
      }

      next();
    } catch (error) {
      console.error('Permission check error:', error);
      res.status(500).json({
        error: 'INTERNAL_ERROR',
        message: '权限检查失败'
      });
    }
  };
};

// 角色检查中间件
export const requireRole = (roles) => {
  const roleArray = Array.isArray(roles) ? roles : [roles];
  
  return (req, res, next) => {
    const user = req.user;
    
    if (!user) {
      return res.status(401).json({
        error: 'UNAUTHORIZED',
        message: '未授权访问'
      });
    }

    if (!roleArray.includes(user.role.name)) {
      return res.status(403).json({
        error: 'INSUFFICIENT_ROLE',
        message: '角色权限不足'
      });
    }

    next();
  };
};