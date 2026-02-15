-- transition-state.lua
-- Checks and applies time-based state transitions.
-- Called by a NestJS cron job every 100ms.
--
-- KEYS[1] = sale:{id}:state
-- KEYS[2] = sale:{id}:config
-- KEYS[3] = sale:{id}:end_reason
-- ARGV[1] = currentTimestamp (epoch ms)

local state = redis.call('GET', KEYS[1])
local now = tonumber(ARGV[1])
local sku = redis.call('HGET', KEYS[2], 'sku')

if state == 'UPCOMING' then
    local startTime = tonumber(redis.call('HGET', KEYS[2], 'startTime'))
    if startTime and now >= startTime then
        redis.call('SET', KEYS[1], 'ACTIVE')
        redis.call('PUBLISH', 'sale:events', cjson.encode({
            event = 'state-change',
            data = {sku = sku, state = 'ACTIVE'}
        }))
        return 'transitioned_to_active'
    end
elseif state == 'ACTIVE' then
    local endTime = tonumber(redis.call('HGET', KEYS[2], 'endTime'))
    if endTime and now >= endTime then
        redis.call('SET', KEYS[1], 'ENDED')
        redis.call('SET', KEYS[3], 'TIME_EXPIRED')
        redis.call('PUBLISH', 'sale:events', cjson.encode({
            event = 'state-change',
            data = {sku = sku, state = 'ENDED', reason = 'TIME_EXPIRED'}
        }))
        return 'transitioned_to_ended'
    end
end

return 'no_transition'
