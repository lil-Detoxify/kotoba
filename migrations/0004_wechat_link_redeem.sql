-- Website link callbacks store verified WeChat identity until the initiating
-- account presents a live session and the private verifier at redemption.
ALTER TABLE wechat_auth_attempts ADD COLUMN wechat_provider TEXT;
ALTER TABLE wechat_auth_attempts ADD COLUMN wechat_openid TEXT;
ALTER TABLE wechat_auth_attempts ADD COLUMN wechat_unionid TEXT;
