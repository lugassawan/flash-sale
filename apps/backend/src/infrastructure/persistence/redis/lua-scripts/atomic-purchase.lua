-- atomic-purchase.lua
-- Atomically validates and processes a purchase attempt.
-- Returns: {status, remainingStock?, code?}
--
-- KEYS[1] = sale:{id}:state
-- KEYS[2] = sale:{id}:stock
-- KEYS[3] = sale:{id}:buyers
-- KEYS[4] = sale:{id}:config
-- KEYS[5] = sale:{id}:end_reason
-- ARGV[1] = userId
-- ARGV[2] = currentTimestamp (epoch ms)

local sku = redis.call('HGET', KEYS[4], 'sku')

-- 1. Check sale state
local state = redis.call('GET', KEYS[1])
if state ~= 'ACTIVE' then
    return cjson.encode({status = 'rejected', code = 'SALE_NOT_ACTIVE'})
end

-- 2. Check end time hasn't passed (server clock validation)
local endTime = redis.call('HGET', KEYS[4], 'endTime')
if endTime and tonumber(ARGV[2]) >= tonumber(endTime) then
    -- Transition to ended state inline
    redis.call('SET', KEYS[1], 'ENDED')
    redis.call('SET', KEYS[5], 'TIME_EXPIRED')
    redis.call('PUBLISH', 'sale:events', cjson.encode({
        event = 'state-change',
        data = {sku = sku, state = 'ENDED', reason = 'TIME_EXPIRED'}
    }))
    return cjson.encode({status = 'rejected', code = 'SALE_NOT_ACTIVE'})
end

-- 3. Check if user already purchased (O(1) set lookup)
if redis.call('SISMEMBER', KEYS[3], ARGV[1]) == 1 then
    return cjson.encode({status = 'rejected', code = 'ALREADY_PURCHASED'})
end

-- 4. Check and decrement stock atomically
local stock = tonumber(redis.call('GET', KEYS[2]))
if stock <= 0 then
    return cjson.encode({status = 'rejected', code = 'SOLD_OUT'})
end

local newStock = redis.call('DECR', KEYS[2])

-- 5. Record user purchase
redis.call('SADD', KEYS[3], ARGV[1])

-- 6. Publish stock update event for SSE
redis.call('PUBLISH', 'sale:events', cjson.encode({
    event = 'stock-update',
    data = {sku = sku, stock = newStock}
}))

-- 7. If stock just hit zero, transition to ended
if newStock == 0 then
    redis.call('SET', KEYS[1], 'ENDED')
    redis.call('SET', KEYS[5], 'SOLD_OUT')
    redis.call('PUBLISH', 'sale:events', cjson.encode({
        event = 'state-change',
        data = {sku = sku, state = 'ENDED', reason = 'SOLD_OUT'}
    }))
end

return cjson.encode({status = 'success', remainingStock = newStock})
