import rateLimit from "express-rate-limit";

export const uploadRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many uploads from this IP, please try again later." },
});
