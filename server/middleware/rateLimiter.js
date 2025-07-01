import { RateLimiterMemory } from 'rate-limiter-flexible';

// 创建速率限制器
const rateLimiter = new RateLimiterMemory({
  keyGenerator: (req) => req.ip,
  points: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // 请求次数
  duration: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900, // 时间窗口（秒）
});

// 登录速率限制器（更严格）
const loginRateLimiter = new RateLimiterMemory({
  keyGenerator: (req) => req.ip,
  points: 5, // 5次尝试
  duration: 900, // 15分钟
  blockDuration: 900, // 阻止15分钟
});

export const rateLimiterMiddleware = async (req, res, next) => {
  try {
    await rateLimiter.consume(req.ip);
    next();
  } catch (rejRes) {
    const secs = Math.round(rejRes.msBeforeNext / 1000) || 1;
    res.set('Retry-After', String(secs));
    res.status(429).json({
      error: 'TOO_MANY_REQUESTS',
      message: '请求过于频繁，请稍后重试',
      retryAfter: secs
    });
  }
};

export const loginRateLimiterMiddleware = async (req, res, next) => {
  try {
    await loginRateLimiter.consume(req.ip);
    next();
  } catch (rejRes) {
    const secs = Math.round(rejRes.msBeforeNext / 1000) || 1;
    res.set('Retry-After', String(secs));
    res.status(429).json({
      error: 'TOO_MANY_LOGIN_ATTEMPTS',
      message: '登录尝试过于频繁，请稍后重试',
      retryAfter: secs
    });
  }
};

export { rateLimiterMiddleware as rateLimiter };

export { rateLimiter }