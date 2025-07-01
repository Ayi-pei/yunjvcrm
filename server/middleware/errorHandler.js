export const errorHandler = (err, req, res, next) => {
  console.error('Error:', err);

  // Supabase错误处理
  if (err.code) {
    switch (err.code) {
      case '23505': // 唯一约束违反
        return res.status(409).json({
          error: 'DUPLICATE_ENTRY',
          message: '数据已存在，请检查输入'
        });
      case '23503': // 外键约束违反
        return res.status(400).json({
          error: 'REFERENCE_ERROR',
          message: '关联数据不存在'
        });
      case '23502': // 非空约束违反
        return res.status(400).json({
          error: 'MISSING_REQUIRED_FIELD',
          message: '缺少必填字段'
        });
      default:
        return res.status(500).json({
          error: 'DATABASE_ERROR',
          message: '数据库操作失败'
        });
    }
  }

  // JWT错误处理
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      error: 'INVALID_TOKEN',
      message: '无效的访问令牌'
    });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      error: 'TOKEN_EXPIRED',
      message: '访问令牌已过期'
    });
  }

  // 验证错误
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: err.message,
      details: err.details
    });
  }

  // 文件上传错误
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({
      error: 'FILE_TOO_LARGE',
      message: '文件大小超出限制'
    });
  }

  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({
      error: 'INVALID_FILE',
      message: '不支持的文件类型'
    });
  }

  // 默认错误处理
  res.status(err.status || 500).json({
    error: err.code || 'INTERNAL_ERROR',
    message: err.message || '服务器内部错误',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};